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

const EXTRACTION_PROMPT = `Udtræk fra denne danske salgsopstilling for en ejendomsinvestering og returnér KUN gyldig JSON i præcis dette format:

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

Regler:
- ALLE beløb i danske kroner (DKK), uden punktum eller mellemrum.
- totalRent = ÅRLIG samlet leje. monthlyRent = MÅNEDLIG samlet leje.
- yieldStated = sælgers angivne afkast i %, fx 5.2.
- vacancyRate = aktuel tomgangsprocent i %, fx 3.5.
- propertyType: "udlejningsejendom", "blandet bolig/erhverv", "erhverv", "bolig", etc.
- municipality = kommunen, fx "København", "Roskilde", "Aarhus".
- notes = liste af KORTE bullet-points med potentialer eller særlige forhold (fx "Potentiale for taglejligheder", "Nyere tag fra 2018", "Lokalplan tillader yderligere etage").
- rentalSegments = liste af lejemålene (fx alle lejemål i en udlejningsejendom). Inkluder altid hvis tilgængeligt.
- Returnér null hvor data ikke findes — gæt IKKE.`;

export async function extractFromPdf(
  buffer: Buffer,
  fileName: string,
): Promise<PropertyData> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ikke sat");
  }

  const trimmed = await trimPdf(buffer);
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
    if (block.type !== "text") return { ...EMPTY_PROPERTY };

    const jsonMatch = block.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ...EMPTY_PROPERTY };

    try {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<PropertyData>;
      return {
        ...EMPTY_PROPERTY,
        ...parsed,
        notes: parsed.notes ?? [],
        rentalSegments: parsed.rentalSegments ?? [],
        sources: [{ type: "pdf", fileName }],
      };
    } catch {
      return { ...EMPTY_PROPERTY };
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
