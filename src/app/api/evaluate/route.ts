import { NextRequest, NextResponse } from "next/server";
import { extractFromPdf, mergePropertyData } from "@/lib/ai-extract";
import {
  extractFromExcel,
  extractFromZip,
  extractFromUrl,
} from "@/lib/parsers";
import { extractFromFilename } from "@/lib/filename-extract";
import { enrichWithMacro } from "@/lib/macro";
import { runStrategyAnalysis, detectRisks, calcScore } from "@/lib/strategies";
import { saveEvaluation, makeId } from "@/lib/store";
import type { PropertyData, Strategy, EvaluationResult } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    let strategy: Strategy = "drift";
    let url: string | null = null;
    let property: PropertyData = { ...EMPTY_PROPERTY };
    let askingPriceOverride: number | null = null;

    type BlobFileRef = {
      url: string;
      name: string;
      size: number;
      docType?: string;
    };
    let blobRefs: BlobFileRef[] = [];
    let inlineFiles: File[] = [];

    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        strategy?: Strategy;
        url?: string;
        blobs?: BlobFileRef[];
        askingPriceOverride?: number | null;
      };
      strategy = body.strategy || "drift";
      url = body.url ?? null;
      blobRefs = body.blobs ?? [];
      askingPriceOverride = body.askingPriceOverride ?? null;
    } else {
      const form = await req.formData();
      strategy = (form.get("strategy") as Strategy) || "drift";
      url = form.get("url") as string | null;
      inlineFiles = form
        .getAll("files")
        .filter((f): f is File => f instanceof File);
      const priceStr = form.get("askingPriceOverride") as string | null;
      if (priceStr) askingPriceOverride = parseFloat(priceStr);
    }

    // Hent blob-filer som buffere
    const blobBuffers = await Promise.all(
      blobRefs.map(async (b) => {
        const res = await fetch(b.url);
        if (!res.ok) throw new Error(`Kunne ikke hente blob ${b.name}`);
        return {
          name: b.name,
          buffer: Buffer.from(await res.arrayBuffer()),
          docType: b.docType ?? "auto",
        };
      }),
    );

    const allFiles: Array<{ name: string; buffer: Buffer; docType: string }> = [
      ...blobBuffers,
      ...(await Promise.all(
        inlineFiles.map(async (f) => ({
          name: f.name,
          buffer: Buffer.from(await f.arrayBuffer()),
          docType: "auto",
        })),
      )),
    ];

    // Filename-baseret pre-extraction: zip-filer hedder typisk
    // "Ramsherred 16, 4700 Næstved.zip" og giver adresse gratis.
    for (const f of allFiles) {
      const fromName = extractFromFilename(f.name);
      property = mergePropertyData(property, {
        ...property,
        ...fromName,
        notes: [],
        rentalSegments: [],
        sources: [],
      } as PropertyData);
    }

    const fileResults = await Promise.allSettled(
      allFiles.map(async ({ name, buffer, docType }) => {
        const lower = name.toLowerCase();
        if (lower.endsWith(".pdf")) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return extractFromPdf(buffer, name, docType as any);
        }
        if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) {
          return extractFromExcel(buffer, name);
        }
        if (lower.endsWith(".zip")) {
          return extractFromZip(buffer, name);
        }
        return null;
      }),
    );

    for (const r of fileResults) {
      if (r.status === "fulfilled" && r.value) {
        property = mergePropertyData(property, r.value);
      }
    }

    // URL hvis angivet
    if (url && url.trim()) {
      try {
        const urlData = await extractFromUrl(url.trim());
        property = mergePropertyData(property, urlData);
      } catch {
        // ignorer URL-fejl
      }
    }

    if (property.sources.length === 0) {
      return NextResponse.json(
        { error: "Kunne ikke parse nogen af de uploadede filer." },
        { status: 400 },
      );
    }

    // Beriger med makro-data parallelt med ingen blokering hvis fejlet
    let enrichedProperty = property;
    let macro = null;
    let seller = null;
    try {
      const enrichment = await enrichWithMacro(property);
      enrichedProperty = enrichment.enrichedProperty;
      macro = enrichment.macro;
      seller = enrichment.seller;
    } catch {
      // ignorer makro-fejl
    }

    // Manuel override hvis udbudspris ikke fandtes i PDF'erne
    if (
      (enrichedProperty.askingPrice === null ||
        enrichedProperty.askingPrice === undefined) &&
      askingPriceOverride &&
      askingPriceOverride > 0
    ) {
      enrichedProperty = {
        ...enrichedProperty,
        askingPrice: askingPriceOverride,
      };
    }

    // Kør strategi-analyse
    const analysis = runStrategyAnalysis(enrichedProperty, macro, strategy);
    const risks = detectRisks(enrichedProperty, macro, analysis);
    const score = calcScore(enrichedProperty, analysis, risks);

    const id = makeId();
    const result: EvaluationResult = {
      id,
      createdAt: new Date().toISOString(),
      strategy,
      property: enrichedProperty,
      macro,
      seller,
      analysis,
      risks,
      score,
    };

    await saveEvaluation(result);
    return NextResponse.json({ id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
