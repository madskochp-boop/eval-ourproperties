// Strategi-specifikke beregningsmodeller for ejendomsinvestering.
//
// Hver model tager PropertyData + MacroData og returnerer en analyse:
//   - drift: 10-årig cashflow med fokus på løbende afkast
//   - renovering: flip-case med buy → reno → sell over 18-36 mdr
//   - vaerdistigning: 5-10 års hold med exit på opskrivning
//
// Konservative defaults (Mads' regel: ALTID konservative):
//   - rente 5,25% (Vestjysk Bank Q2/2026)
//   - bidragssats 0,8%
//   - belåning 80% af købspris
//   - afdragsfri 0 år (konservativ)
//   - lejevækst 2% p.a. (NPI-ish)
//   - omkostningsvækst 2,5% p.a.
//   - tomgang 5% hvis ikke oplyst
//   - skat 22%

import type {
  PropertyData,
  MacroData,
  Strategy,
  DriftAnalysis,
  RenoveringAnalysis,
  VaerdistigningAnalysis,
  StrategyAnalysis,
  RiskFlag,
  OverallScore,
} from "./types";

const ASSUMPTIONS = {
  interestRate: 0.0525,
  contributionRate: 0.008,
  ltv: 0.80,
  amortizationYears: 30,
  rentGrowth: 0.02,
  costGrowth: 0.025,
  vacancyDefault: 0.05,
  taxRate: 0.22,
  transactionCostPct: 0.015, // 1.5% (advokat, tinglysning)
};

// ─── Lån-beregning ────────────────────────────────

function annualDebtService(loanAmount: number): {
  interest: number;
  principal: number;
  total: number;
} {
  const r = ASSUMPTIONS.interestRate + ASSUMPTIONS.contributionRate;
  const n = ASSUMPTIONS.amortizationYears;
  const annual = (loanAmount * r) / (1 - Math.pow(1 + r, -n));
  const interestY1 = loanAmount * r;
  return {
    interest: interestY1,
    principal: annual - interestY1,
    total: annual,
  };
}

// ─── DRIFT-model ──────────────────────────────────

function calcDrift(property: PropertyData): DriftAnalysis {
  const purchasePrice = property.askingPrice ?? 0;
  const annualRent = property.totalRent ?? 0;
  const operatingCosts = property.operatingCosts ?? annualRent * 0.20;
  const vacancyRate =
    property.vacancyRate !== null
      ? property.vacancyRate / 100
      : ASSUMPTIONS.vacancyDefault;

  const effectiveRent = annualRent * (1 - vacancyRate);
  const noi = effectiveRent - operatingCosts;
  const capRate = purchasePrice > 0 ? noi / purchasePrice : 0;

  const loanAmount = purchasePrice * ASSUMPTIONS.ltv;
  const downPayment = purchasePrice * (1 - ASSUMPTIONS.ltv);
  const transactionCosts = purchasePrice * ASSUMPTIONS.transactionCostPct;
  const totalInvested = downPayment + transactionCosts;

  const debt = annualDebtService(loanAmount);
  const cashflowYear1 = noi - debt.total;
  const cashOnCashYear1 =
    totalInvested > 0 ? cashflowYear1 / totalInvested : 0;

  const breakEvenOccupancy =
    annualRent > 0 ? 1 - (annualRent - operatingCosts - debt.total) / annualRent : 1;

  // 10-årig cashflow
  let cumulative = -totalInvested;
  let remainingLoan = loanAmount;
  const cashflow = [];
  for (let year = 1; year <= 10; year++) {
    const yearRent =
      annualRent * (1 - vacancyRate) * Math.pow(1 + ASSUMPTIONS.rentGrowth, year - 1);
    const yearCosts = operatingCosts * Math.pow(1 + ASSUMPTIONS.costGrowth, year - 1);
    const yearInterest = remainingLoan * (ASSUMPTIONS.interestRate + ASSUMPTIONS.contributionRate);
    const yearPrincipal = Math.max(0, debt.total - yearInterest);
    remainingLoan = Math.max(0, remainingLoan - yearPrincipal);
    const netCashflow = yearRent - yearCosts - debt.total;
    cumulative += netCashflow;
    cashflow.push({
      year,
      rent: Math.round(yearRent),
      costs: Math.round(yearCosts),
      debtService: Math.round(debt.total),
      netCashflow: Math.round(netCashflow),
      cumulative: Math.round(cumulative),
    });
  }

  const totalReturn = cumulative + totalInvested;
  const totalROI10Year = totalInvested > 0 ? (totalReturn / totalInvested - 1) * 100 : 0;
  const irr10Year = calcIrr(
    [-totalInvested, ...cashflow.map((c) => c.netCashflow)],
  );

  return {
    type: "drift",
    purchasePrice,
    annualRent,
    operatingCosts,
    vacancyRate: vacancyRate * 100,
    netOperatingIncome: Math.round(noi),
    capRate: capRate * 100,
    cashOnCashYear1: cashOnCashYear1 * 100,
    breakEvenOccupancy: breakEvenOccupancy * 100,
    tenYearCashflow: cashflow,
    totalROI10Year,
    irr10Year: irr10Year * 100,
  };
}

// ─── RENOVERING-model ─────────────────────────────

function calcRenovering(
  property: PropertyData,
  macro: MacroData | null,
): RenoveringAnalysis {
  const purchasePrice = property.askingPrice ?? 0;
  const area = property.totalArea ?? property.residentialArea ?? 0;

  // Heuristik for renoverings-omkostninger: 4000-8000 kr/m² afhængig af alder
  const renoCostPerSqm =
    property.buildingYear && property.buildingYear < 1960
      ? 6500
      : property.buildingYear && property.buildingYear < 1990
        ? 5000
        : 3500;
  const estimatedRenoCost = area * renoCostPerSqm;

  // Estimeret salgspris: brug regional sqm-pris hvis vi har den, ellers 15-25% premium
  const regionalSqmPrice = macro?.housingMarket?.avgSqmPriceMunicipality ?? null;
  const estimatedSalePrice = regionalSqmPrice
    ? regionalSqmPrice * area
    : purchasePrice + estimatedRenoCost + (purchasePrice + estimatedRenoCost) * 0.15;

  const holdingMonths = 24;
  const loanAmount = purchasePrice * ASSUMPTIONS.ltv;
  const yearlyFinanceCost =
    loanAmount * (ASSUMPTIONS.interestRate + ASSUMPTIONS.contributionRate);
  const financingCosts = yearlyFinanceCost * (holdingMonths / 12);

  const transactionCosts =
    purchasePrice * ASSUMPTIONS.transactionCostPct +
    estimatedSalePrice * 0.025; // 2.5% til ejendomsmægler ved salg

  const totalInvestment =
    purchasePrice + estimatedRenoCost + financingCosts + transactionCosts;
  const grossProfit = estimatedSalePrice - totalInvestment;
  const netProfit = grossProfit * (1 - ASSUMPTIONS.taxRate);
  const marginPct = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
  const annualizedReturn = marginPct * (12 / holdingMonths);
  const breakEvenSalePrice = totalInvestment;

  return {
    type: "renovering",
    purchasePrice,
    estimatedRenoCost,
    estimatedSalePrice,
    holdingMonths,
    financingCosts,
    transactionCosts,
    totalInvestment,
    grossProfit,
    netProfit,
    marginPct,
    annualizedReturn,
    breakEvenSalePrice,
  };
}

// ─── VÆRDISTIGNING-model ──────────────────────────

function calcVaerdistigning(
  property: PropertyData,
  macro: MacroData | null,
): VaerdistigningAnalysis {
  const purchasePrice = property.askingPrice ?? 0;
  const annualRent = property.totalRent ?? 0;
  const operatingCosts = property.operatingCosts ?? annualRent * 0.20;
  const holdYears = 7;

  // Vækstforventning fra makro-data
  const populationGrowth = macro?.populationTrend?.fiveYearGrowthPct ?? 2.5;
  // Heuristik: 1pp befolkningstilvækst → ~2pp ejendomsvækst over 5 år
  const expectedAreaGrowthPct = Math.max(1.5, populationGrowth * 0.8);

  // Exit-værdi
  const annualGrowth = expectedAreaGrowthPct / 100;
  const projectedExitValue = purchasePrice * Math.pow(1 + annualGrowth, holdYears);

  // Akkumuleret cashflow
  let totalRentReceived = 0;
  let remainingLoan = purchasePrice * ASSUMPTIONS.ltv;
  let totalDebtPaidOff = 0;
  for (let year = 1; year <= holdYears; year++) {
    const yearRent =
      annualRent * 0.95 * Math.pow(1 + ASSUMPTIONS.rentGrowth, year - 1);
    const yearCosts = operatingCosts * Math.pow(1 + ASSUMPTIONS.costGrowth, year - 1);
    const debt = annualDebtService(remainingLoan);
    const yearInterest = remainingLoan * (ASSUMPTIONS.interestRate + ASSUMPTIONS.contributionRate);
    const yearPrincipal = Math.max(0, debt.total - yearInterest);
    totalDebtPaidOff += yearPrincipal;
    remainingLoan = Math.max(0, remainingLoan - yearPrincipal);
    totalRentReceived += yearRent - yearCosts - debt.total;
  }

  const capitalGain = projectedExitValue - purchasePrice;
  const downPayment = purchasePrice * (1 - ASSUMPTIONS.ltv);
  const transactionCosts = purchasePrice * ASSUMPTIONS.transactionCostPct;
  const initialInvestment = downPayment + transactionCosts;

  const totalReturn = capitalGain + totalRentReceived + totalDebtPaidOff;
  const irr = calcIrr([
    -initialInvestment,
    ...Array.from({ length: holdYears - 1 }, () => 0),
    initialInvestment + totalReturn,
  ]);

  return {
    type: "vaerdistigning",
    purchasePrice,
    annualRent,
    operatingCosts,
    holdYears,
    expectedAreaGrowthPct,
    exitMultiple: projectedExitValue / purchasePrice,
    projectedExitValue,
    totalRentReceived,
    totalDebtPaidOff,
    totalReturn,
    irr: irr * 100,
    capitalGain,
  };
}

// ─── IRR Newton-Raphson ───────────────────────────

function calcIrr(cashflows: number[], guess = 0.1): number {
  let r = guess;
  for (let i = 0; i < 50; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      npv += cashflows[t] / Math.pow(1 + r, t);
      dnpv -= (t * cashflows[t]) / Math.pow(1 + r, t + 1);
    }
    if (Math.abs(npv) < 1) return r;
    if (dnpv === 0) return r;
    r = r - npv / dnpv;
  }
  return r;
}

// ─── Risk flags ───────────────────────────────────

export function detectRisks(
  property: PropertyData,
  macro: MacroData | null,
  analysis: StrategyAnalysis,
): RiskFlag[] {
  const risks: RiskFlag[] = [];

  // Data-mangler
  if (!property.askingPrice) {
    risks.push({
      level: "high",
      category: "Data",
      message: "Udbudspris ikke fundet i materialet.",
    });
  }
  if (!property.totalRent && analysis.type !== "renovering") {
    risks.push({
      level: "high",
      category: "Data",
      message: "Samlet leje ikke oplyst — beregning bygger på antagelser.",
    });
  }

  // Energi-risiko
  if (
    property.energyLabel &&
    ["F", "G"].includes(property.energyLabel.toUpperCase())
  ) {
    risks.push({
      level: "high",
      category: "Energi",
      message: `Energimærke ${property.energyLabel} udløser snart krav om energiforbedring. Budget 1500-3000 kr/m².`,
    });
  }

  // Alder
  if (property.buildingYear && property.buildingYear < 1960) {
    risks.push({
      level: "medium",
      category: "Vedligehold",
      message: `Bygning fra ${property.buildingYear} kræver ofte løbende større renoveringer (tag, facade, installationer).`,
    });
  }

  // Tomgang
  if (property.vacancyRate && property.vacancyRate > 10) {
    risks.push({
      level: "high",
      category: "Drift",
      message: `Aktuel tomgang ${property.vacancyRate.toFixed(0)}% er væsentligt over markedsnormen på 3-5%.`,
    });
  }

  // Makro
  if (
    macro?.populationTrend?.fiveYearGrowthPct !== null &&
    macro?.populationTrend?.fiveYearGrowthPct !== undefined &&
    macro.populationTrend.fiveYearGrowthPct < 0
  ) {
    risks.push({
      level: "medium",
      category: "Marked",
      message: `Kommunen har haft befolkningstilbagegang ${macro.populationTrend.fiveYearGrowthPct.toFixed(1)}% over 5 år. Reducer exit-multipel-forventning.`,
    });
  }

  // Strategi-specifikke
  if (analysis.type === "drift") {
    if (analysis.capRate < 4) {
      risks.push({
        level: "medium",
        category: "Afkast",
        message: `Cap rate ${analysis.capRate.toFixed(1)}% er under markedsnormen for udlejningsejendomme (5-7%).`,
      });
    }
    if (analysis.cashOnCashYear1 < 0) {
      risks.push({
        level: "high",
        category: "Cashflow",
        message: `Negativ cashflow i år 1 (${analysis.cashOnCashYear1.toFixed(1)}%). Kræver løbende kapitaltilførsel.`,
      });
    }
  }
  if (analysis.type === "renovering") {
    if (analysis.marginPct < 10) {
      risks.push({
        level: "high",
        category: "Margin",
        message: `Margin ${analysis.marginPct.toFixed(0)}% er for lav til at absorbere uforudsete omkostninger. Mind. 20-25% anbefales.`,
      });
    }
  }
  if (analysis.type === "vaerdistigning") {
    if (analysis.expectedAreaGrowthPct < 2) {
      risks.push({
        level: "medium",
        category: "Marked",
        message: `Forventet vækst ${analysis.expectedAreaGrowthPct.toFixed(1)}% p.a. er beskeden — fokus skal være på driftsafkast.`,
      });
    }
  }

  return risks;
}

// ─── Score ────────────────────────────────────────

export function calcScore(
  property: PropertyData,
  analysis: StrategyAnalysis,
  risks: RiskFlag[],
): OverallScore {
  // 4 dimensioner, hver 0-100, vægtet 25%
  let economics = 50;
  let market = 50;
  let risk = 80;
  let fit = 70;

  // Economics
  if (analysis.type === "drift") {
    if (analysis.capRate >= 6) economics = 90;
    else if (analysis.capRate >= 5) economics = 75;
    else if (analysis.capRate >= 4) economics = 55;
    else economics = 25;
    if (analysis.irr10Year >= 10) economics = Math.min(100, economics + 10);
  }
  if (analysis.type === "renovering") {
    if (analysis.marginPct >= 30) economics = 90;
    else if (analysis.marginPct >= 20) economics = 75;
    else if (analysis.marginPct >= 10) economics = 50;
    else economics = 25;
  }
  if (analysis.type === "vaerdistigning") {
    if (analysis.irr >= 12) economics = 90;
    else if (analysis.irr >= 8) economics = 75;
    else if (analysis.irr >= 5) economics = 55;
    else economics = 30;
  }

  // Marked — afhænger af om vi har makro-data
  if (property.municipality) market += 10;
  if (property.energyLabel && ["A", "B", "C"].includes(property.energyLabel.toUpperCase()))
    market += 15;

  // Risk
  const highRisks = risks.filter((r) => r.level === "high").length;
  const medRisks = risks.filter((r) => r.level === "medium").length;
  risk = Math.max(10, 90 - highRisks * 25 - medRisks * 10);

  // Fit (strategi-passer)
  if (
    analysis.type === "drift" &&
    property.numUnits &&
    property.numUnits >= 3
  )
    fit = 85;
  if (analysis.type === "renovering" && property.buildingYear && property.buildingYear < 1980)
    fit = 85;
  if (
    analysis.type === "vaerdistigning" &&
    property.municipality &&
    ["København", "Aarhus", "Odense", "Aalborg", "Roskilde"].includes(
      property.municipality.replace(" Kommune", ""),
    )
  )
    fit = 90;

  const total = Math.round((economics + market + risk + fit) / 4);

  let recommendation: OverallScore["recommendation"];
  if (total >= 75) recommendation = "anbefales";
  else if (total >= 60) recommendation = "interessant";
  else if (total >= 45) recommendation = "betinget";
  else recommendation = "frarådes";

  const oneLine = makeOneLine(analysis, total, highRisks);

  return {
    total,
    breakdown: {
      economics: Math.round(economics),
      market: Math.round(market),
      risk: Math.round(risk),
      fit: Math.round(fit),
    },
    recommendation,
    oneLineSummary: oneLine,
  };
}

function makeOneLine(
  analysis: StrategyAnalysis,
  score: number,
  highRisks: number,
): string {
  const strategy =
    analysis.type === "drift"
      ? "driftsinvestering"
      : analysis.type === "renovering"
        ? "renoveringscase"
        : "værdistigningscase";

  if (score >= 75) {
    if (analysis.type === "drift") {
      return `Solid ${strategy} med cap rate ${analysis.capRate.toFixed(1)}% og 10-års IRR ${analysis.irr10Year.toFixed(1)}%. Anbefales til seriøs gennemgang.`;
    }
    if (analysis.type === "renovering") {
      return `Stærk flip-case med ${analysis.marginPct.toFixed(0)}% margin på ${analysis.holdingMonths} mdr. Anbefales hvis renoverings-skøn holder.`;
    }
    return `Lovende langsigtet case med IRR ${analysis.irr.toFixed(1)}% over ${analysis.holdYears} år. Anbefales.`;
  }

  if (score >= 60) {
    return `Interessant ${strategy} men kræver dybere due diligence. ${highRisks > 0 ? `${highRisks} højrisiko-flags.` : ""}`;
  }

  if (score >= 45) {
    return `Betinget ${strategy}: økonomien hænger på antagelser. Forhandl prisen ned eller dyk i tallene.`;
  }

  return `Frarådes som ${strategy} på det nuværende grundlag. ${highRisks} højrisiko-flags. Brug evalueringen til at forhandle.`;
}

// ─── Public API ───────────────────────────────────

export function runStrategyAnalysis(
  property: PropertyData,
  macro: MacroData | null,
  strategy: Strategy,
): StrategyAnalysis {
  if (strategy === "drift") return calcDrift(property);
  if (strategy === "renovering") return calcRenovering(property, macro);
  return calcVaerdistigning(property, macro);
}
