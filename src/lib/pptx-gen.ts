// PPTX-generator: investor/bank deck (8-10 slides).
//
// Brug Midnight Executive-ish palette tilpasset Our Properties' CVI:
//   bg: cream/bone for lyse slides, ink for accent-slides
//   accent: clay
//   text: ink/graphite

import pptxgen from "pptxgenjs";
import type { EvaluationResult } from "./types";

const COLORS = {
  bg: "F5EFE4", // cream
  bgDark: "1D1914", // ink
  paper: "FBF8F1",
  ink: "1D1914",
  graphite: "3A342C",
  muted: "6B6257",
  clay: "8A5A3A",
  hairline: "D4CDBD",
  cream: "F5EFE4",
};

function fmtKr(n: number | null): string {
  if (n === null) return "—";
  return Math.round(n).toLocaleString("da-DK") + " kr.";
}
function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(1) + " %";
}

export async function generatePptx(
  evalResult: EvaluationResult,
): Promise<Buffer> {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE"; // 13.33 × 7.5"
  pres.title = `Evaluering · ${evalResult.property.address}`;

  const { property, analysis, score, strategy, macro, seller } = evalResult;

  // ─── Slide 1: Forside ──────────────────
  const s1 = pres.addSlide();
  s1.background = { color: COLORS.bg };
  s1.addText("OUR PROPERTIES · EVALUERING", {
    x: 0.6, y: 0.5, w: 12, h: 0.4,
    fontFace: "Inter", fontSize: 10, color: COLORS.clay, bold: true,
    charSpacing: 250,
  });
  s1.addText(property.address ?? "Adresse ikke fundet", {
    x: 0.6, y: 2.0, w: 12, h: 1.4,
    fontFace: "Playfair Display", fontSize: 44, color: COLORS.ink,
  });
  s1.addText(
    `${property.zipCode ?? ""} ${property.city ?? ""}${property.municipality ? " · " + property.municipality : ""}`,
    {
      x: 0.6, y: 3.4, w: 12, h: 0.5,
      fontFace: "Spectral", fontSize: 18, italic: true, color: COLORS.graphite,
    },
  );
  s1.addText(
    `Strategi: ${strategy === "drift" ? "Høj afkast i drift" : strategy === "renovering" ? "Renoveringscase til flipping" : "Værdistigning over tid"}`,
    {
      x: 0.6, y: 5.0, w: 12, h: 0.4,
      fontFace: "JetBrains Mono", fontSize: 11, color: COLORS.muted,
      charSpacing: 200,
    },
  );
  s1.addText(new Date(evalResult.createdAt).toLocaleDateString("da-DK"), {
    x: 0.6, y: 6.8, w: 6, h: 0.3,
    fontFace: "JetBrains Mono", fontSize: 9, color: COLORS.muted,
  });
  s1.addText("eval.ourproperties.dk", {
    x: 6.7, y: 6.8, w: 6, h: 0.3,
    fontFace: "JetBrains Mono", fontSize: 9, color: COLORS.muted, align: "right",
  });

  // ─── Slide 2: Anbefaling ──────────────────
  const s2 = pres.addSlide();
  s2.background = { color: COLORS.bgDark };
  s2.addText("ANBEFALING", {
    x: 0.6, y: 0.5, w: 12, h: 0.4,
    fontFace: "Inter", fontSize: 10, color: COLORS.clay, bold: true, charSpacing: 250,
  });
  s2.addText(
    score.recommendation === "anbefales"
      ? "Anbefales"
      : score.recommendation === "interessant"
        ? "Interessant case"
        : score.recommendation === "betinget"
          ? "Betinget"
          : "Frarådes",
    {
      x: 0.6, y: 1.8, w: 12, h: 1.4,
      fontFace: "Playfair Display", fontSize: 56, color: COLORS.cream,
    },
  );
  s2.addText(score.oneLineSummary, {
    x: 0.6, y: 3.6, w: 11.5, h: 1.6,
    fontFace: "Spectral", fontSize: 22, italic: true, color: "DDDDDD",
  });
  s2.addText(`${score.total}/100`, {
    x: 0.6, y: 5.8, w: 6, h: 0.6,
    fontFace: "Playfair Display", fontSize: 36, color: COLORS.clay,
  });
  s2.addText("Samlet score", {
    x: 0.6, y: 6.5, w: 6, h: 0.3,
    fontFace: "JetBrains Mono", fontSize: 10, color: COLORS.muted, charSpacing: 200,
  });

  // ─── Slide 3: Score breakdown ──────────────
  const s3 = pres.addSlide();
  s3.background = { color: COLORS.bg };
  slideTitle(s3, "Score · 4 dimensioner");
  const dims = [
    { label: "Økonomi", val: score.breakdown.economics },
    { label: "Marked", val: score.breakdown.market },
    { label: "Risiko", val: score.breakdown.risk },
    { label: "Strategi-fit", val: score.breakdown.fit },
  ];
  dims.forEach((d, i) => {
    const x = 0.6 + i * 3.1;
    s3.addText(d.label.toUpperCase(), {
      x, y: 2.5, w: 2.8, h: 0.4,
      fontFace: "JetBrains Mono", fontSize: 10, color: COLORS.muted, charSpacing: 200,
    });
    s3.addText(String(d.val), {
      x, y: 3.0, w: 2.8, h: 1.5,
      fontFace: "Playfair Display", fontSize: 60, color: d.val >= 70 ? COLORS.clay : COLORS.ink,
    });
    s3.addText("/ 100", {
      x, y: 4.7, w: 2.8, h: 0.3,
      fontFace: "Inter", fontSize: 11, color: COLORS.muted,
    });
  });

  // ─── Slide 4: Hovedtal ─────────────────────
  const s4 = pres.addSlide();
  s4.background = { color: COLORS.bg };
  slideTitle(s4, "Hovedtal");
  const facts = [
    { label: "Udbudspris", value: fmtKr(property.askingPrice) },
    { label: "Årlig leje", value: fmtKr(property.totalRent) },
    { label: "Sælgers afkast", value: fmtPct(property.yieldStated) },
    { label: "Driftsudgifter", value: fmtKr(property.operatingCosts) },
    { label: "Antal lejemål", value: property.numUnits ? String(property.numUnits) : "—" },
    { label: "Samlet areal", value: property.totalArea ? `${property.totalArea} m²` : "—" },
    { label: "Opført", value: property.buildingYear ? String(property.buildingYear) : "—" },
    { label: "Energimærke", value: property.energyLabel ?? "—" },
  ];
  facts.forEach((f, i) => {
    const col = i % 4;
    const rowI = Math.floor(i / 4);
    const x = 0.6 + col * 3.1;
    const y = 2.5 + rowI * 2.2;
    s4.addText(f.label.toUpperCase(), {
      x, y, w: 2.8, h: 0.3,
      fontFace: "JetBrains Mono", fontSize: 9, color: COLORS.muted, charSpacing: 200,
    });
    s4.addText(f.value, {
      x, y: y + 0.4, w: 2.8, h: 1.0,
      fontFace: "Playfair Display", fontSize: 24, color: COLORS.ink,
    });
  });

  // ─── Slide 5: Strategi-analyse ─────────────
  const s5 = pres.addSlide();
  s5.background = { color: COLORS.bg };
  if (analysis.type === "drift") {
    slideTitle(s5, "Drift · Nøgletal");
    const driftFacts = [
      { label: "Cap rate", value: fmtPct(analysis.capRate) },
      { label: "Cash-on-cash år 1", value: fmtPct(analysis.cashOnCashYear1) },
      { label: "10-års IRR", value: fmtPct(analysis.irr10Year) },
      { label: "Break-even belægning", value: fmtPct(analysis.breakEvenOccupancy) },
    ];
    driftFacts.forEach((f, i) => {
      const x = 0.6 + i * 3.1;
      s5.addText(f.label.toUpperCase(), {
        x, y: 2.5, w: 2.8, h: 0.3,
        fontFace: "JetBrains Mono", fontSize: 9, color: COLORS.muted, charSpacing: 200,
      });
      s5.addText(f.value, {
        x, y: 2.9, w: 2.8, h: 1.5,
        fontFace: "Playfair Display", fontSize: 36, color: COLORS.clay,
      });
    });
  }
  if (analysis.type === "renovering") {
    slideTitle(s5, "Renoveringscase · Nøgletal");
    const renoFacts = [
      { label: "Margin", value: fmtPct(analysis.marginPct) },
      { label: "Annualiseret", value: fmtPct(analysis.annualizedReturn) },
      { label: "Netto-fortjeneste", value: fmtKr(analysis.netProfit) },
      { label: "Holdetid", value: `${analysis.holdingMonths} mdr` },
    ];
    renoFacts.forEach((f, i) => {
      const x = 0.6 + i * 3.1;
      s5.addText(f.label.toUpperCase(), {
        x, y: 2.5, w: 2.8, h: 0.3,
        fontFace: "JetBrains Mono", fontSize: 9, color: COLORS.muted, charSpacing: 200,
      });
      s5.addText(f.value, {
        x, y: 2.9, w: 2.8, h: 1.5,
        fontFace: "Playfair Display", fontSize: 28, color: COLORS.clay,
      });
    });
  }
  if (analysis.type === "vaerdistigning") {
    slideTitle(s5, "Værdistigning · Nøgletal");
    const valFacts = [
      { label: "IRR", value: fmtPct(analysis.irr) },
      { label: "Exit-multipel", value: `${analysis.exitMultiple.toFixed(2)}×` },
      { label: "Kapitalgevinst", value: fmtKr(analysis.capitalGain) },
      { label: "Total afkast", value: fmtKr(analysis.totalReturn) },
    ];
    valFacts.forEach((f, i) => {
      const x = 0.6 + i * 3.1;
      s5.addText(f.label.toUpperCase(), {
        x, y: 2.5, w: 2.8, h: 0.3,
        fontFace: "JetBrains Mono", fontSize: 9, color: COLORS.muted, charSpacing: 200,
      });
      s5.addText(f.value, {
        x, y: 2.9, w: 2.8, h: 1.5,
        fontFace: "Playfair Display", fontSize: 28, color: COLORS.clay,
      });
    });
  }

  // ─── Slide 6: Marked (hvis vi har makro) ─
  if (macro?.municipality) {
    const s6 = pres.addSlide();
    s6.background = { color: COLORS.bg };
    slideTitle(s6, `Marked · ${macro.municipality}`);
    const macroFacts = [
      {
        label: "Befolkningstilvækst 5 år",
        value: fmtPct(macro.populationTrend.fiveYearGrowthPct),
      },
      {
        label: "Befolkningstilvækst 1 år",
        value: fmtPct(macro.populationTrend.growthPct),
      },
      {
        label: "Husstandsindkomst (gns.)",
        value: fmtKr(macro.income.averageHouseholdIncome),
      },
      {
        label: "Befolkning",
        value: macro.populationTrend.currentYear
          ? macro.populationTrend.currentYear.toLocaleString("da-DK")
          : "—",
      },
    ];
    macroFacts.forEach((f, i) => {
      const x = 0.6 + i * 3.1;
      s6.addText(f.label.toUpperCase(), {
        x, y: 2.5, w: 2.8, h: 0.3,
        fontFace: "JetBrains Mono", fontSize: 9, color: COLORS.muted, charSpacing: 200,
      });
      s6.addText(f.value, {
        x, y: 2.9, w: 2.8, h: 1.5,
        fontFace: "Playfair Display", fontSize: 28, color: COLORS.ink,
      });
    });
  }

  // ─── Slide 7: Risici ──────────────────────
  if (evalResult.risks.length > 0) {
    const s7 = pres.addSlide();
    s7.background = { color: COLORS.bg };
    slideTitle(s7, "Risici og forbehold");
    const topRisks = evalResult.risks.slice(0, 6);
    topRisks.forEach((r, i) => {
      const y = 2.3 + i * 0.75;
      s7.addText(r.category.toUpperCase(), {
        x: 0.6, y, w: 2.2, h: 0.4,
        fontFace: "JetBrains Mono", fontSize: 10, color: COLORS.clay, bold: true, charSpacing: 200,
      });
      const tone = r.level === "high" ? "[H]" : r.level === "medium" ? "[M]" : "[L]";
      s7.addText(tone, {
        x: 2.9, y, w: 0.5, h: 0.4,
        fontFace: "JetBrains Mono", fontSize: 10, color: COLORS.muted,
      });
      s7.addText(r.message, {
        x: 3.5, y, w: 9.4, h: 0.7,
        fontFace: "Spectral", fontSize: 13, color: COLORS.ink, valign: "top",
      });
    });
  }

  // ─── Slide 8: Sælger (hvis fundet) ────────
  if (seller && (seller.name || seller.cvr)) {
    const s8 = pres.addSlide();
    s8.background = { color: COLORS.bg };
    slideTitle(s8, "Sælger");
    const sellerFacts = [
      { label: "Navn", value: seller.name ?? "—" },
      { label: "CVR", value: seller.cvr ?? "—" },
      { label: "Stiftet", value: seller.founded ?? "—" },
      { label: "Branche", value: seller.industryName ?? "—" },
      { label: "Ansatte", value: seller.employees ? String(seller.employees) : "—" },
      { label: "Status", value: seller.status ?? "—" },
    ];
    sellerFacts.forEach((f, i) => {
      const col = i % 3;
      const rowI = Math.floor(i / 3);
      const x = 0.6 + col * 4.2;
      const y = 2.5 + rowI * 2.2;
      s8.addText(f.label.toUpperCase(), {
        x, y, w: 3.8, h: 0.3,
        fontFace: "JetBrains Mono", fontSize: 9, color: COLORS.muted, charSpacing: 200,
      });
      s8.addText(f.value, {
        x, y: y + 0.4, w: 3.8, h: 1.0,
        fontFace: "Playfair Display", fontSize: 20, color: COLORS.ink,
      });
    });
  }

  // ─── Slide 9: Footer/disclaimer ───────────
  const sN = pres.addSlide();
  sN.background = { color: COLORS.bgDark };
  sN.addText("FORBEHOLD", {
    x: 0.6, y: 0.5, w: 12, h: 0.4,
    fontFace: "Inter", fontSize: 10, color: COLORS.clay, bold: true, charSpacing: 250,
  });
  sN.addText(
    "Denne evaluering er en automatisk genereret vurdering baseret på det indleverede materiale og offentligt tilgængelige data. Den er ikke en juridisk eller finansiel rådgivning, og bør ikke stå alene som beslutningsgrundlag. Få altid uafhængig sparring fra revisor, advokat og bank før beslutning. Beregninger bygger på konservative antagelser (5,25% rente, 80% belåning, 2% lejevækst p.a.).",
    {
      x: 0.6, y: 2.0, w: 11.5, h: 3.5,
      fontFace: "Spectral", fontSize: 16, italic: true, color: "BBBBBB",
      valign: "top",
    },
  );
  sN.addText("eval.ourproperties.dk", {
    x: 0.6, y: 6.7, w: 12, h: 0.3,
    fontFace: "JetBrains Mono", fontSize: 9, color: COLORS.muted, align: "left", charSpacing: 200,
  });

  // Output
  const result = await pres.write({ outputType: "nodebuffer" });
  return result as Buffer;
}

function slideTitle(slide: pptxgen.Slide, text: string): void {
  slide.addText(text.toUpperCase(), {
    x: 0.6, y: 0.5, w: 12, h: 0.4,
    fontFace: "Inter", fontSize: 10, color: COLORS.clay, bold: true, charSpacing: 250,
  });
}
