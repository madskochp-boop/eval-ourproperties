import { NextRequest, NextResponse } from "next/server";
import { extractFromPdf, mergePropertyData } from "@/lib/ai-extract";
import {
  extractFromExcel,
  extractFromZip,
  extractFromUrl,
} from "@/lib/parsers";
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
    const form = await req.formData();
    const strategy = (form.get("strategy") as Strategy) || "drift";
    const url = form.get("url") as string | null;

    // Saml input-data fra alle kilder
    let property: PropertyData = { ...EMPTY_PROPERTY };

    // Parsér uploadede filer parallelt
    const fileEntries = form.getAll("files").filter(
      (f): f is File => f instanceof File,
    );

    const fileResults = await Promise.allSettled(
      fileEntries.map(async (file) => {
        const buffer = Buffer.from(await file.arrayBuffer());
        const name = file.name.toLowerCase();
        if (name.endsWith(".pdf")) {
          return extractFromPdf(buffer, file.name);
        }
        if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) {
          return extractFromExcel(buffer, file.name);
        }
        if (name.endsWith(".zip")) {
          return extractFromZip(buffer, file.name);
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

    saveEvaluation(result);
    return NextResponse.json({ id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
