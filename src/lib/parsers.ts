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
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt zip-fejl";
    return {
      ...EMPTY,
      sources: [{ type: "zip", fileName: `${fileName} (kunne ikke åbnes: ${msg})` }],
    };
  }

  const entries = zip.getEntries();
  if (entries.length === 0) {
    return {
      ...EMPTY,
      sources: [{ type: "zip", fileName: `${fileName} (tom zip)` }],
    };
  }

  let salesProposalEntry: AdmZip.IZipEntry | null = null;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const name = entry.entryName.toLowerCase();
    if (!name.endsWith(".pdf")) continue;

    // Heuristik: ord der ofte findes i salgsopstillinger
    if (
      !salesProposalEntry &&
      /salgsopstilling|prospekt|sale|opstilling|udbud|notice|prospect|udlejnings|investerings/i.test(name)
    ) {
      salesProposalEntry = entry;
    }
  }

  // Hvis vi ikke fandt en salgsopstilling, brug den STØRSTE PDF
  // (salgsopstillinger er typisk de største dokumenter i datarum)
  if (!salesProposalEntry) {
    const pdfs = entries.filter(
      (e) => !e.isDirectory && /\.pdf$/i.test(e.entryName),
    );
    if (pdfs.length > 0) {
      pdfs.sort((a, b) => b.header.size - a.header.size);
      salesProposalEntry = pdfs[0];
    }
  }

  if (!salesProposalEntry) {
    return {
      ...EMPTY,
      sources: [
        { type: "zip", fileName: `${fileName} (ingen PDF fundet — pakkede filer: ${entries.length})` },
      ],
    };
  }

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = salesProposalEntry.getData();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    return {
      ...EMPTY,
      sources: [
        {
          type: "zip",
          fileName: `${fileName} → ${salesProposalEntry.entryName} (kunne ikke læses: ${msg})`,
        },
      ],
    };
  }

  try {
    const data = await extractFromPdf(pdfBuffer, salesProposalEntry.entryName);
    data.sources = [
      { type: "zip", fileName: `${fileName} → ${salesProposalEntry.entryName}` },
    ];
    return data;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt AI-fejl";
    return {
      ...EMPTY,
      sources: [
        {
          type: "zip",
          fileName: `${fileName} → ${salesProposalEntry.entryName} (AI-parse fejl: ${msg})`,
        },
      ],
    };
  }
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
