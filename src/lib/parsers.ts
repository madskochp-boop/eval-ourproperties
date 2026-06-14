// Parsers for forskellige input-typer: Excel, Zip-datarum, URL.
// Hver returnerer PropertyData så de kan flettes.

import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import { extractFromPdf } from "./ai-extract";
import type { PropertyData } from "./types";

const EMPTY: PropertyData = {
  address: null,
  zipCode: null,
  city: null,
  municipality: null,
  region: null,
  propertyType: null,
  buildingYear: null,
  renovationYear: null,
  totalArea: null,
  residentialArea: null,
  commercialArea: null,
  groundArea: null,
  numFloors: null,
  numUnits: null,
  numCommercialUnits: null,
  energyLabel: null,
  heating: null,
  askingPrice: null,
  publicValuation: null,
  totalRent: null,
  monthlyRent: null,
  yieldStated: null,
  operatingCosts: null,
  propertyTax: null,
  insuranceCost: null,
  vacancyRate: null,
  description: null,
  notes: [],
  rentalSegments: [],
  sellerName: null,
  sellerCvr: null,
  sources: [],
};

// ─── Excel-parser ──────────────────────────────────
//
// Mads' egne beregninger ligger typisk som en oversigt med rækker som:
//   "Købspris" | "Adresse" | "Samlet leje" | "Driftsomkostninger" osv.
// Vi scanner alle celler og leder efter labels i kolonne A, værdier i B.
//
export async function extractFromExcel(
  buffer: Buffer,
  fileName: string,
): Promise<PropertyData> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const result: PropertyData = {
    ...EMPTY,
    sources: [{ type: "excel", fileName }],
  };

  // Saml alle labelede celler (label i A/B, værdi i C eller højre)
  const labelMap = new Map<string, string | number>();

  wb.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      const cells = row.values as Array<unknown>;
      for (let i = 1; i < cells.length - 1; i++) {
        const label = cells[i];
        const value = cells[i + 1];
        if (typeof label !== "string") continue;
        if (value === null || value === undefined) continue;

        const key = label.toLowerCase().trim();
        if (typeof value === "string" || typeof value === "number") {
          labelMap.set(key, value);
        } else if (typeof value === "object" && value !== null) {
          // Formula-cell: brug result
          const obj = value as { result?: unknown };
          if (typeof obj.result === "string" || typeof obj.result === "number") {
            labelMap.set(key, obj.result);
          }
        }
      }
    });
  });

  function getStr(...keys: string[]): string | null {
    for (const k of keys) {
      const v = labelMap.get(k.toLowerCase());
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return null;
  }
  function getNum(...keys: string[]): number | null {
    for (const k of keys) {
      const v = labelMap.get(k.toLowerCase());
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = parseFloat(v.replace(/[^0-9.,-]/g, "").replace(",", "."));
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }

  result.address = getStr("adresse", "address");
  result.zipCode = getStr("postnr", "postnummer", "zip");
  result.city = getStr("by", "city");
  result.municipality = getStr("kommune", "municipality");
  result.propertyType = getStr("ejendomstype", "type");
  result.buildingYear = getNum("opført", "byggeår", "building year");
  result.totalArea = getNum("samlet areal", "areal", "total area", "m²");
  result.residentialArea = getNum("boligareal");
  result.commercialArea = getNum("erhvervsareal");
  result.numUnits = getNum("antal lejemål", "lejemål", "units");
  result.askingPrice = getNum("købspris", "udbudspris", "asking price", "pris");
  result.publicValuation = getNum("offentlig vurdering", "vurdering");
  result.totalRent = getNum("samlet leje", "årlig leje", "total rent");
  result.monthlyRent = getNum("månedlig leje", "monthly rent");
  result.yieldStated = getNum("afkast", "yield");
  result.operatingCosts = getNum("driftsudgifter", "driftsomkostninger", "drift");
  result.propertyTax = getNum("ejendomsskat");
  result.vacancyRate = getNum("tomgang");
  result.energyLabel = getStr("energimærke", "energy");
  result.heating = getStr("varme", "heating");

  return result;
}

// ─── Zip-datarum-parser ────────────────────────────
//
// Datarum er typisk en zip med flere PDF'er: salgsopstilling, BBR, lejer-info,
// energimærke. Vi finder den fil der ligner salgsopstilling og kører
// extractFromPdf på den.
export async function extractFromZip(
  buffer: Buffer,
  fileName: string,
): Promise<PropertyData> {
  console.log(`[zip] Åbner ${fileName} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt zip-fejl";
    console.error(`[zip] Kunne ikke åbne zip: ${msg}`);
    return {
      ...EMPTY,
      sources: [{ type: "zip", fileName: `${fileName} (kunne ikke åbnes: ${msg})` }],
    };
  }

  const entries = zip.getEntries();
  console.log(`[zip] ${entries.length} entries fundet`);

  if (entries.length === 0) {
    return {
      ...EMPTY,
      sources: [{ type: "zip", fileName: `${fileName} (tom zip)` }],
    };
  }

  // Find ALLE PDF'er — vi parser nu de 3 mest sandsynlige (sales opstilling + bilag)
  const pdfs = entries
    .filter((e) => !e.isDirectory && /\.pdf$/i.test(e.entryName))
    .map((e) => ({
      entry: e,
      name: e.entryName,
      size: e.header.size,
      // Score: jo højere desto mere sandsynlig salgsopstilling
      score:
        (/salgsopstilling|prospekt|prospect|udbud|opstilling/i.test(e.entryName) ? 100 : 0) +
        (/investerings|udlejnings|presentation/i.test(e.entryName) ? 50 : 0) +
        (/bbr|tilstand|energi/i.test(e.entryName) ? 30 : 0) +
        Math.min(20, e.header.size / 100_000), // 1 point pr. 100KB op til 20
    }))
    .sort((a, b) => b.score - a.score);

  console.log(
    `[zip] PDF-kandidater: ${pdfs.length}, top: ${pdfs
      .slice(0, 5)
      .map((p) => `${p.name} (${(p.size / 1024).toFixed(0)}KB, score ${p.score.toFixed(0)})`)
      .join(", ")}`,
  );

  if (pdfs.length === 0) {
    const fileList = entries
      .filter((e) => !e.isDirectory)
      .slice(0, 10)
      .map((e) => e.entryName)
      .join(", ");
    return {
      ...EMPTY,
      sources: [
        {
          type: "zip",
          fileName: `${fileName} (ingen PDF fundet i ${entries.length} filer: ${fileList})`,
        },
      ],
    };
  }

  // Parsér op til 3 PDF'er parallelt — sammenflet resultater
  const toParse = pdfs.slice(0, 3);
  const results = await Promise.allSettled(
    toParse.map(async ({ entry, name }) => {
      console.log(`[zip] Parser ${name}…`);
      const pdfBuffer = entry.getData();
      const data = await extractFromPdf(pdfBuffer, name);
      console.log(
        `[zip] ${name}: address=${data.address}, price=${data.askingPrice}, totalRent=${data.totalRent}`,
      );
      return { data, name };
    }),
  );

  let merged: PropertyData = { ...EMPTY };
  const parsedNames: string[] = [];
  const failures: string[] = [];

  for (const r of results) {
    if (r.status === "fulfilled") {
      merged = mergePdfData(merged, r.value.data);
      parsedNames.push(r.value.name);
    } else {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      failures.push(msg);
      console.error(`[zip] Parse-fejl: ${msg}`);
    }
  }

  merged.sources = [
    {
      type: "zip",
      fileName: `${fileName} → ${parsedNames.join(" + ")}${failures.length > 0 ? ` (fejl: ${failures.length})` : ""}`,
    },
  ];

  return merged;
}

// Lokal merge der ikke kalder ai-extract (undgår cirkulær import-risiko)
function mergePdfData(a: PropertyData, b: PropertyData): PropertyData {
  const merged: PropertyData = { ...a };
  for (const key of Object.keys(b) as Array<keyof PropertyData>) {
    const aVal = a[key];
    const bVal = b[key];
    if (key === "notes") {
      merged.notes = [...(a.notes ?? []), ...(b.notes ?? [])];
    } else if (key === "rentalSegments") {
      merged.rentalSegments =
        (a.rentalSegments?.length ?? 0) > 0 ? a.rentalSegments : (b.rentalSegments ?? []);
    } else if (key === "sources") {
      // Bevares — overskrives nedenfor
    } else if (
      (aVal === null || aVal === undefined) &&
      bVal !== null &&
      bVal !== undefined
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = bVal;
    }
  }
  return merged;
}

// ─── URL-fetcher ───────────────────────────────────
//
// Henter en salgsopstilling fra et link (Boligsiden, EDC, Home, Estate, mfl.)
// Vi prøver først at finde en PDF-version. Hvis ikke, henter vi HTML'en og
// kører Claude på text-indholdet.
export async function extractFromUrl(url: string): Promise<PropertyData> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36",
        Accept: "text/html,application/pdf,*/*",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      return {
        ...EMPTY,
        sources: [{ type: "url", fileName: `${url} (HTTP ${res.status})` }],
      };
    }

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/pdf")) {
      const buffer = Buffer.from(await res.arrayBuffer());
      const data = await extractFromPdf(buffer, url);
      data.sources = [{ type: "url", fileName: url }];
      return data;
    }

    // HTML: udtræk tekst og send til Claude
    const html = await res.text();
    const text = htmlToText(html).slice(0, 50_000);
    return await extractFromText(text, url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "URL-fetch fejlede";
    return {
      ...EMPTY,
      sources: [{ type: "url", fileName: `${url} (${msg})` }],
    };
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function extractFromText(
  text: string,
  url: string,
): Promise<PropertyData> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ...EMPTY, sources: [{ type: "url", fileName: url }] };
  }

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Udtræk ejendomsdata fra denne tekst (fra en dansk salgsopstilling/boligside) og returnér KUN gyldig JSON:

{
  "address": string|null,
  "zipCode": string|null,
  "city": string|null,
  "municipality": string|null,
  "propertyType": string|null,
  "buildingYear": number|null,
  "totalArea": number|null,
  "residentialArea": number|null,
  "askingPrice": number|null,
  "totalRent": number|null,
  "yieldStated": number|null,
  "operatingCosts": number|null,
  "energyLabel": string|null,
  "heating": string|null,
  "description": string|null,
  "notes": string[]
}

Tekst:
"""${text}"""

Regler: ALLE beløb i DKK uden separator. totalRent = ÅRLIG. Returnér null hvor data ikke findes.`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    const block = msg.content[0];
    if (block.type !== "text") return { ...EMPTY, sources: [{ type: "url", fileName: url }] };
    const jsonMatch = block.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...EMPTY, sources: [{ type: "url", fileName: url }] };
    const parsed = JSON.parse(jsonMatch[0]) as Partial<PropertyData>;
    return {
      ...EMPTY,
      ...parsed,
      notes: parsed.notes ?? [],
      sources: [{ type: "url", fileName: url }],
    };
  } catch {
    return { ...EMPTY, sources: [{ type: "url", fileName: url }] };
  }
}
