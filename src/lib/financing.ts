// Finansierings-beregning og bank-vurdering.
//
// Brugeren kan angive udbetaling, lånetyper, renter og bank.
// Vi beregner LTV, månedlig ydelse, gældsservice-grad og giver
// en "bankable score" der indikerer om casen kan finansieres.

import type { FinancingInputs, FinancingResult } from "./types";

const DEFAULTS = {
  downPaymentPct: 20, // 20% udbetaling default
  realkreditPct: 80, // 80% realkredit af købspris
  realkreditRate: 5.25, // % p.a. Q2 2026 niveau
  realkreditYears: 30,
  realkreditAfdragsfri: 0,
  bankLoanRate: 7.5, // typisk banklån
  bankLoanYears: 20,
  familyLoanRate: 1.5, // anfordringslån
  familyLoanYears: 30,
};

function annualAnnuity(principal: number, ratePct: number, years: number): number {
  if (principal <= 0 || ratePct <= 0 || years <= 0) return 0;
  const r = ratePct / 100;
  return (principal * r) / (1 - Math.pow(1 + r, -years));
}

export function calcFinancing(
  purchasePrice: number,
  noi: number | null,
  inputs: FinancingInputs | null,
): FinancingResult | null {
  if (!purchasePrice || purchasePrice <= 0) return null;

  // Saml inputs med defaults
  const downPaymentKr =
    inputs?.downPaymentKr ??
    (inputs?.downPaymentPct != null
      ? purchasePrice * (inputs.downPaymentPct / 100)
      : purchasePrice * (DEFAULTS.downPaymentPct / 100));

  const realkreditPct =
    inputs?.realkreditPct ?? DEFAULTS.realkreditPct;
  const realkreditRate = inputs?.realkreditRate ?? DEFAULTS.realkreditRate;
  const realkreditAfdragsfri =
    inputs?.realkreditAfdragsfri ?? DEFAULTS.realkreditAfdragsfri;
  const bankLoanKr = inputs?.bankLoanKr ?? 0;
  const bankLoanRate = inputs?.bankLoanRate ?? DEFAULTS.bankLoanRate;
  const familyLoanKr = inputs?.familyLoanKr ?? 0;
  const familyLoanRate = inputs?.familyLoanRate ?? DEFAULTS.familyLoanRate;

  const realkreditKr = purchasePrice * (realkreditPct / 100);
  const totalLoan = realkreditKr + bankLoanKr + familyLoanKr;
  const ltv = (totalLoan / purchasePrice) * 100;

  // Annuitet pr. lån
  const realkreditAnnuity =
    realkreditAfdragsfri > 0
      ? realkreditKr * (realkreditRate / 100) // kun renter i afdragsfri periode
      : annualAnnuity(realkreditKr, realkreditRate, DEFAULTS.realkreditYears);
  const bankAnnuity = annualAnnuity(
    bankLoanKr,
    bankLoanRate,
    DEFAULTS.bankLoanYears,
  );
  const familyAnnuity = annualAnnuity(
    familyLoanKr,
    familyLoanRate,
    DEFAULTS.familyLoanYears,
  );

  const yearlyDebtService = realkreditAnnuity + bankAnnuity + familyAnnuity;
  const monthlyPayment = yearlyDebtService / 12;

  // Rente vs afdrag år 1
  const interestYearOne =
    realkreditKr * (realkreditRate / 100) +
    bankLoanKr * (bankLoanRate / 100) +
    familyLoanKr * (familyLoanRate / 100);
  const principalYearOne = Math.max(0, yearlyDebtService - interestYearOne);

  // Bank-vurdering
  const debtServiceCoverageRatio =
    noi !== null && yearlyDebtService > 0 ? noi / yearlyDebtService : null;

  let bankableScore: FinancingResult["bankableScore"] = "ok";
  const notes: string[] = [];

  if (ltv > 90) {
    bankableScore = "kritisk";
    notes.push(
      `LTV ${ltv.toFixed(0)}% er over 90% — banker afviser typisk uden tillægssikkerhed eller højere udbetaling.`,
    );
  } else if (ltv > 80) {
    bankableScore = "stram";
    notes.push(
      `LTV ${ltv.toFixed(0)}% er over 80% (realkredit-grænse). Forskellen skal dækkes af banklån/ejerpantebrev til højere rente.`,
    );
  } else if (ltv <= 60) {
    bankableScore = "stærk";
    notes.push(`LTV ${ltv.toFixed(0)}% er solid. Banken vil se positivt på casen.`);
  } else {
    notes.push(`LTV ${ltv.toFixed(0)}% — inden for normalområdet.`);
  }

  if (debtServiceCoverageRatio !== null) {
    if (debtServiceCoverageRatio >= 1.5) {
      notes.push(
        `DSCR ${debtServiceCoverageRatio.toFixed(2)}× — driften dækker ydelsen ${debtServiceCoverageRatio.toFixed(1)} gange, det er stærkt.`,
      );
      if (bankableScore === "ok") bankableScore = "stærk";
    } else if (debtServiceCoverageRatio >= 1.2) {
      notes.push(
        `DSCR ${debtServiceCoverageRatio.toFixed(2)}× — driften dækker ydelsen, men buffer er begrænset.`,
      );
    } else if (debtServiceCoverageRatio >= 1.0) {
      notes.push(
        `DSCR ${debtServiceCoverageRatio.toFixed(2)}× — driften kan kun lige dække ydelsen. Sårbar over for tomgang.`,
      );
      if (bankableScore !== "kritisk") bankableScore = "stram";
    } else {
      notes.push(
        `DSCR ${debtServiceCoverageRatio.toFixed(2)}× — driften kan IKKE dække ydelsen. Kræver kapitalindskud løbende.`,
      );
      bankableScore = "kritisk";
    }
  }

  if (familyLoanKr > 0) {
    notes.push(
      `Anfordringslån ${(familyLoanKr / 1_000_000).toFixed(1)} mio. kr fra holding/familie reducerer realkreditbehov og forbedrer LTV.`,
    );
  }
  if (realkreditAfdragsfri > 0) {
    notes.push(
      `${realkreditAfdragsfri} års afdragsfrihed øger cashflow nu, men maks. 10 år. Efter perioden stiger ydelsen.`,
    );
  }

  return {
    totalLoan,
    downPayment: downPaymentKr,
    ltv,
    monthlyPayment,
    yearlyDebtService,
    interestYearOne,
    principalYearOne,
    debtServiceCoverageRatio,
    bankableScore,
    bankableNotes: notes,
  };
}
