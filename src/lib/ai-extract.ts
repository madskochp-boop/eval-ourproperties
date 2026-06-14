// AI-extraction af ejendoms-salgsopstillinger via Claude.
//
// Salgsopstillinger er typisk 5-30 siders PDF'er med købspris, m², leje,
// vurdering, BBR-data, sælger-info osv. Claude læser PDF'en direkte og
// returnerer strukturerede felter.

import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import type { PropertyData } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-sonnet-4-5";
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_PAGES = 20;

async function trimPdf(buffer: Buffer): Promise<Buffer> {
  try {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const pageCount = src.getPageCount();
    if (pageCount <= MAX_PAGES) return buffer;
    const out = await PDFDocument.create();
    const indices = Array.from({ length: MAX_PAGES }, (_, i) => i);
    const pages = await out.copyPages(src, indices);
    pages.forEach((p) => out.addPage(p));
    return Buffer.from(await out.save());
  } catch {
    return buffer;
  }
}

const EMPTY_PROPERTY: PropertyData = {
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

const EXTRACTION_PROMPT = `Du modtager et dansk ejendomsdokument. Det kan være EN AF:
- Salgsopstilling / prospekt
- Lejeliste / huslejeliste / Areal- og fordelingstal
- Offentlig vurdering / ejendomsvurdering
- Tingbogsattest
- BBR-meddelelse
- Energimærke
- Et bilag fra datarum

Udtræk ALT relevant data og returnér KUN gyldig JSON i præcis dette format:

{
  "address": string|null,
  "zipCode": string|null,
  "city": string|null,
  "municipality": string|null,
  "region": string|null,
  "propertyType": string|null,
  "buildingYear": number|null,
  "renovationYear": number|null,
  "totalArea": number|null,
  "residentialArea": number|null,
  "commercialArea": number|null,
  "groundArea": number|null,
  "numFloors": number|null,
  "numUnits": number|null,
  "numCommercialUnits": number|null,
  "energyLabel": string|null,
  "heating": string|null,
  "askingPrice": number|null,
  "publicValuation": number|null,
  "totalRent": number|null,
  "monthlyRent": number|null,
  "yieldStated": number|null,
  "operatingCosts": number|null,
  "propertyTax": number|null,
  "insuranceCost": number|null,
  "vacancyRate": number|null,
  "description": string|null,
  "notes": string[],
  "rentalSegments": [{"unit": string, "area": number|null, "monthlyRent": number|null, "type": string|null, "tenant": string|null}],
  "sellerName": string|null,
  "sellerCvr": string|null
}

VIGTIGT:
- Hvis dokumentet er en LEJELISTE: udfyld rentalSegments med ÉN linje pr. lejemål. Sum alle årslejer og sæt det i totalRent (ekskl. varme/vand acconto). Tæl antal lejemål og sæt i numUnits. Sum areal i totalArea. Find sælger-firma-navn i header og sæt i sellerName.
- Hvis dokumentet er en OFFENTLIG VURDERING: udfyld publicValuation. Hent også adresse, areal, byggeår hvis muligt.
- Hvis dokumentet er en TINGBOGSATTEST: hent ejer (sellerName) og evt. matrikel-info. CVR hvis det er et selskab.
- Hvis det er en SALGSOPSTILLING: udfyld så meget som muligt.
- ALLE beløb i DKK uden punktum eller mellemrum. Brug årsbeløb (ikke månedlige) til totalRent.
- For lejeliste: hvis du ser kolonner "Leje", "A/C Varme", "A/c vand" → KUN selve Leje-tallet skal med i monthlyRent/totalRent (ikke varme/vand).
- rentalSegments.monthlyRent skal være MÅNEDLIG (totalRent på lejeliste er typisk årlig — divider med 12 hvis nødvendigt for hver linje).
- "type" i rentalSegments: "bolig", "erhverv", "kælder", "p-plads" osv. (afled fra "Kategori" eller "Leje bolig"/"Leje erhverv").
- Returnér null hvor data ikke findes — gæt IKKE.`;

export async function extractFromPdf(
  buffer: Buffer,
  fileName: string,
): Promise<PropertyData> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ikke sat");
  }

  const trimmed = await trimPdf(buffer);
  console.log(
    `[ai-extract] ${fileName}: ${(buffer.length / 1024).toFixed(0)}KB → trimmed ${(trimmed.length / 1024).toFixed(0)}KB`,
  );

  if (trimmed.length > MAX_PDF_BYTES) {
    throw new Error(
      `PDF for stor: ${(trimmed.length / 1024 / 1024).toFixed(1)} MB`,
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 50_000);

  try {
    const msg = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: trimmed.toString("base64"),
                },
              },
              { type: "text", text: EXTRACTION_PROMPT },
            ],
          },
        ],
      },
      { signal: controller.signal },
    );

    const block = msg.content[0];
    if (block.type !== "text") {
      console.warn(`[ai-extract] ${fileName}: Claude returnerede non-text block`);
      return { ...EMPTY_PROPERTY, sources: [{ type: "pdf", fileName }] };
    }

    console.log(
      `[ai-extract] ${fileName}: Claude svarede ${block.text.length} tegn, første 200: ${block.text.slice(0, 200)}`,
    );

    const jsonMatch = block.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[ai-extract] ${fileName}: Intet JSON i Claude-svar`);
      return { ...EMPTY_PROPERTY, sources: [{ type: "pdf", fileName }] };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<PropertyData>;
      const nonNullCount = Object.values(parsed).filter(
        (v) => v !== null && v !== undefined && v !== "" && (Array.isArray(v) ? v.length > 0 : true),
      ).length;
      console.log(
        `[ai-extract] ${fileName}: parsed ${nonNullCount} non-null fields, addr=${parsed.address}, price=${parsed.askingPrice}`,
      );
      return {
        ...EMPTY_PROPERTY,
        ...parsed,
        notes: parsed.notes ?? [],
        rentalSegments: parsed.rentalSegments ?? [],
        sources: [{ type: "pdf", fileName }],
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "JSON parse fejl";
      console.error(`[ai-extract] ${fileName}: ${msg}, første 500: ${jsonMatch[0].slice(0, 500)}`);
      return { ...EMPTY_PROPERTY, sources: [{ type: "pdf", fileName }] };
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// Hjælp til fletning af flere kilder (PDF + Excel + URL osv.)
export function mergePropertyData(
  primary: PropertyData,
  secondary: PropertyData,
): PropertyData {
  const merged: PropertyData = { ...primary };
  for (const key of Object.keys(secondary) as Array<keyof PropertyData>) {
    const primaryValue = primary[key];
    const secondaryValue = secondary[key];

    if (key === "notes") {
      merged.notes = [
        ...(primary.notes ?? []),
        ...(secondary.notes ?? []),
      ];
    } else if (key === "rentalSegments") {
      merged.rentalSegments =
        (primary.rentalSegments?.length ?? 0) > 0
          ? primary.rentalSegments
          : (secondary.rentalSegments ?? []);
    } else if (key === "sources") {
      merged.sources = [
        ...(primary.sources ?? []),
        ...(secondary.sources ?? []),
      ];
    } else if (
      (primaryValue === null || primaryValue === undefined) &&
      secondaryValue !== null &&
      secondaryValue !== undefined
    ) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[key] = secondaryValue;
    }
  }
  return merged;
}
