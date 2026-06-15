// Strukturerede typer for ejendoms-evaluering.

export type Strategy = "drift" | "renovering" | "vaerdistigning" | "privat";

export interface FinancingInputs {
  // Brugerens egne input — alle valgfri, vi har default-værdier
  downPaymentKr: number | null; // udbetaling i kr
  downPaymentPct: number | null; // ELLER udbetaling i %
  realkreditPct: number | null; // hvor stor del af lånet er realkredit (default 80%)
  realkreditRate: number | null; // fast rente på realkredit % (default 5.25)
  realkreditType: "fast" | "variabel" | "f5" | null; // default fast
  realkreditAfdragsfri: number | null; // antal år afdragsfri (0-10)
  bankLoanKr: number | null; // separat banklån/ejerpantebrev
  bankLoanRate: number | null; // rente på banklån (default 7-8%)
  familyLoanKr: number | null; // anfordringslån fra familie/holding
  familyLoanRate: number | null; // rente (kan være lav, 0-2%)
  bankName: string | null; // fx "Vestjysk Bank", "Jyske", "Realkredit Danmark"
  notes: string | null;
}

export interface FinancingResult {
  totalLoan: number;
  downPayment: number;
  ltv: number; // loan-to-value %
  monthlyPayment: number; // samlet månedlig ydelse på alle lån
  yearlyDebtService: number;
  interestYearOne: number;
  principalYearOne: number;
  // Bank-vurdering
  debtServiceCoverageRatio: number | null; // NOI / ydelse (kun for udlejning)
  bankableScore: "stærk" | "ok" | "stram" | "kritisk";
  bankableNotes: string[];
}

export interface PropertyData {
  // ─── Adressering ────────────────────────
  address: string | null;
  zipCode: string | null;
  city: string | null;
  municipality: string | null; // kommune
  region: string | null;

  // ─── Bygnings-data (fra salgsopstilling el. BBR) ─
  propertyType: string | null; // "udlejningsejendom", "blandet", "erhverv"
  buildingYear: number | null;
  renovationYear: number | null;
  totalArea: number | null; // m² samlet
  residentialArea: number | null;
  commercialArea: number | null;
  groundArea: number | null;
  numFloors: number | null;
  numUnits: number | null;
  numCommercialUnits: number | null;
  energyLabel: string | null;
  heating: string | null;

  // ─── Økonomi ────────────────────────────
  askingPrice: number | null; // udbudspris kr
  publicValuation: number | null; // offentlig vurdering
  totalRent: number | null; // samlet leje pr. år
  monthlyRent: number | null;
  yieldStated: number | null; // sælgers angivne afkast %
  operatingCosts: number | null; // årlige driftsudgifter
  propertyTax: number | null; // ejendomsskat
  insuranceCost: number | null;
  vacancyRate: number | null; // tomgangsprocent

  // ─── Salgsopstilling-noter ─────────────
  description: string | null;
  notes: string[]; // potentialer, særlige forhold
  rentalSegments: Array<{
    unit: string;
    area: number | null;
    monthlyRent: number | null;
    type: string | null; // "bolig", "erhverv"
    tenant: string | null;
  }>;

  // ─── Sælger ─────────────────────────────
  sellerName: string | null;
  sellerCvr: string | null;

  // ─── Kilde-metadata ─────────────────────
  sources: Array<{
    type: "pdf" | "excel" | "url" | "zip";
    fileName: string;
    pages?: number;
  }>;
}

export interface MacroData {
  municipality: string | null;
  populationTrend: {
    currentYear: number | null;
    previousYear: number | null;
    growthPct: number | null;
    fiveYearGrowthPct: number | null;
  };
  income: {
    averageHouseholdIncome: number | null;
    medianIncome: number | null;
  };
  housingMarket: {
    avgSqmPriceRegion: number | null;
    avgSqmPriceMunicipality: number | null;
    avgRentPerSqm: number | null;
    salesVolumeTrend: number | null; // % YoY
  };
  unemployment: number | null;
  averageAge: number | null;
}

export interface SellerCvrData {
  cvr: string | null;
  name: string | null;
  formattedName: string | null;
  founded: string | null;
  industryCode: string | null;
  industryName: string | null;
  employees: number | null;
  address: string | null;
  status: string | null; // "Normal", "Konkurs", etc.
}

export interface DriftAnalysis {
  type: "drift";
  // Inputs
  purchasePrice: number;
  annualRent: number;
  operatingCosts: number;
  vacancyRate: number;
  // Calculated
  netOperatingIncome: number; // (annual rent - vacancy) - operating costs
  capRate: number; // NOI / purchase price
  cashOnCashYear1: number; // after debt service
  breakEvenOccupancy: number; // % occupancy needed to break even
  tenYearCashflow: Array<{
    year: number;
    rent: number;
    costs: number;
    debtService: number;
    netCashflow: number;
    cumulative: number;
  }>;
  totalROI10Year: number;
  irr10Year: number;
}

export interface RenoveringAnalysis {
  type: "renovering";
  purchasePrice: number;
  estimatedRenoCost: number;
  estimatedSalePrice: number;
  holdingMonths: number; // 18-36
  financingCosts: number;
  transactionCosts: number;
  // Calculated
  totalInvestment: number;
  grossProfit: number;
  netProfit: number;
  marginPct: number;
  annualizedReturn: number;
  breakEvenSalePrice: number;
}

export interface VaerdistigningAnalysis {
  type: "vaerdistigning";
  purchasePrice: number;
  annualRent: number;
  operatingCosts: number;
  holdYears: number; // 5-10
  expectedAreaGrowthPct: number;
  exitMultiple: number;
  // Calculated
  projectedExitValue: number;
  totalRentReceived: number;
  totalDebtPaidOff: number;
  totalReturn: number;
  irr: number;
  capitalGain: number;
}

export interface RoomCondition {
  room: string; // "Køkken", "Badeværelse", "Stue", "Sovevær.", "Gulv", "Vinduer", "Facade", "Tag"
  condition: "ny" | "god" | "ok" | "slidt" | "kritisk";
  estimatedAge: string | null; // "0-5 år", "5-15 år", osv.
  observations: string[]; // "Nyt køkken fra ca. 2022", "Original parket fra 1960'erne, slidt"
  renovationCostEstimate: number | null; // kr — hvad det koster at bringe til "god" stand
}

export interface NegotiationLever {
  category: "stand" | "marked" | "marked-data" | "ejer" | "praktisk";
  title: string;
  argument: string; // konkret tekst lejeren/køberen kan bruge i forhandling
  potentialDiscount: number | null; // kr eller % af pris
}

export interface PrivatAnalysis {
  type: "privat";
  // Inputs
  purchasePrice: number;
  area: number; // m²
  // Marked
  avgSqmPriceMunicipality: number | null;
  avgSqmPriceRegion: number | null;
  pricePerSqm: number;
  premiumVsMarket: number; // % over/under markedssnit
  // Stand
  overallCondition: "ny" | "god" | "ok" | "slidt" | "kritisk";
  rooms: RoomCondition[];
  totalRenovationEstimate: number; // sum af alle rooms
  // Forhandling
  suggestedOffer: number;
  maxRecommendedPrice: number;
  negotiationLevers: NegotiationLever[];
  // Total
  totalCostIncludingReno: number;
  effectiveSqmPriceAfterReno: number;
}

export type StrategyAnalysis =
  | DriftAnalysis
  | RenoveringAnalysis
  | VaerdistigningAnalysis
  | PrivatAnalysis;

export interface RiskFlag {
  level: "low" | "medium" | "high";
  category: string;
  message: string;
}

export interface OverallScore {
  total: number; // 0-100
  breakdown: {
    economics: number;
    market: number;
    risk: number;
    fit: number; // hvor godt passer strategien
  };
  recommendation:
    | "anbefales"
    | "interessant"
    | "betinget"
    | "frarådes";
  oneLineSummary: string;
}

export interface EvaluationResult {
  id: string;
  createdAt: string;
  strategy: Strategy;
  property: PropertyData;
  macro: MacroData | null;
  seller: SellerCvrData | null;
  analysis: StrategyAnalysis;
  financing: FinancingResult | null;
  risks: RiskFlag[];
  score: OverallScore;
}
