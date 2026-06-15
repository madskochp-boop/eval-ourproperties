// Makro-data enrichment fra offentlige API'er.
//
// Vi henter:
//   - Danmarks Statistik (api.statbank.dk/v1/data):
//       BEF1A07 → befolkningstilvækst pr. kommune
//       INDKP201 → husstandsindkomst pr. kommune
//   - dataforsyningen.dk → BBR-opslag på adresse
//   - CVR.dev → sælger-info hvis cvr findes
//
// Alle parallelt med Promise.allSettled så én fejlet API ikke blokerer resten.

import type { MacroData, SellerCvrData, PropertyData } from "./types";

const EMPTY_MACRO: MacroData = {
  municipality: null,
  populationTrend: {
    currentYear: null,
    previousYear: null,
    growthPct: null,
    fiveYearGrowthPct: null,
  },
  income: {
    averageHouseholdIncome: null,
    medianIncome: null,
  },
  housingMarket: {
    avgSqmPriceRegion: null,
    avgSqmPriceMunicipality: null,
    avgRentPerSqm: null,
    salesVolumeTrend: null,
  },
  unemployment: null,
  averageAge: null,
};

// ─── Danmarks Statistik ────────────────────────────
//
// API doc: https://www.dst.dk/da/Statistik/brug-statistikken/muligheder-i-statistikbanken/api
// Endpoint: POST https://api.statbank.dk/v1/data/{TableId}/{format}
//   body: { variables: [{code, values}] }
//
// BEF1A07: Befolkningen 1. januar efter kommune
//   variables: Kommune (KOM), Køn (KOEN), Tid (TID)
//
// Vi henter sidste 6 år så vi kan beregne 1-års og 5-års vækst.

const KOMMUNE_CODES: Record<string, string> = {
  "København": "0101",
  "Frederiksberg": "0147",
  "Aarhus": "0751",
  "Odense": "0461",
  "Aalborg": "0851",
  "Esbjerg": "0561",
  "Randers": "0730",
  "Kolding": "0621",
  "Horsens": "0615",
  "Vejle": "0630",
  "Roskilde": "0265",
  "Herning": "0657",
  "Helsingør": "0217",
  "Silkeborg": "0740",
  "Næstved": "0370",
  "Fredericia": "0607",
  "Holstebro": "0661",
  "Greve": "0253",
  "Køge": "0259",
  "Slagelse": "0330",
  "Hillerød": "0219",
  "Holbæk": "0316",
  "Sønderborg": "0540",
  "Svendborg": "0479",
  "Hvidovre": "0167",
  "Lyngby-Taarbæk": "0173",
  "Gladsaxe": "0159",
  "Gentofte": "0157",
  "Ballerup": "0151",
  "Albertslund": "0165",
  "Brøndby": "0153",
  "Glostrup": "0161",
  "Herlev": "0163",
  "Rødovre": "0175",
  "Tårnby": "0185",
  "Vallensbæk": "0187",
  "Ishøj": "0183",
  "Dragør": "0155",
  "Hørsholm": "0223",
  "Furesø": "0190",
  "Egedal": "0240",
  "Allerød": "0201",
  "Rudersdal": "0230",
  "Fredensborg": "0210",
  "Halsnæs": "0260",
  "Frederikssund": "0250",
  "Gribskov": "0270",
  "Bornholm": "0400",
  "Christiansø": "0411",
  "Vordingborg": "0390",
  "Stevns": "0336",
  "Solrød": "0269",
  "Lejre": "0350",
  "Faxe": "0320",
  "Ringsted": "0329",
  "Sorø": "0340",
  "Kalundborg": "0326",
  "Odsherred": "0306",
  "Lolland": "0360",
  "Guldborgsund": "0376",
  "Præstø": "0390", // Vordingborg
};

function getKommuneCode(name: string | null): string | null {
  if (!name) return null;
  const cleaned = name.replace(/ kommune/i, "").trim();
  return KOMMUNE_CODES[cleaned] ?? null;
}

async function fetchPopulationTrend(
  kommuneCode: string,
): Promise<MacroData["populationTrend"]> {
  const empty = {
    currentYear: null,
    previousYear: null,
    growthPct: null,
    fiveYearGrowthPct: null,
  };
  try {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, i) =>
      String(currentYear - i),
    );

    const body = {
      table: "BEF1A07",
      format: "JSONSTAT",
      variables: [
        { code: "OMRÅDE", values: [kommuneCode] },
        { code: "KØN", values: ["TOT"] },
        { code: "TID", values: years },
      ],
    };

    const res = await fetch("https://api.statbank.dk/v1/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return empty;

    const data = (await res.json()) as {
      dataset: {
        value: number[];
        dimension: {
          TID: { category: { index: Record<string, number> } };
        };
      };
    };

    const values = data.dataset.value;
    const tidIndex = data.dataset.dimension.TID.category.index;
    const sortedYears = Object.entries(tidIndex)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([year, idx]) => ({ year, value: values[idx] }));

    if (sortedYears.length === 0) return empty;

    const latest = sortedYears[sortedYears.length - 1];
    const previous = sortedYears[sortedYears.length - 2];
    const fiveAgo = sortedYears[0];

    return {
      currentYear: latest.value,
      previousYear: previous?.value ?? null,
      growthPct:
        previous && previous.value
          ? ((latest.value - previous.value) / previous.value) * 100
          : null,
      fiveYearGrowthPct:
        fiveAgo && fiveAgo.value
          ? ((latest.value - fiveAgo.value) / fiveAgo.value) * 100
          : null,
    };
  } catch {
    return empty;
  }
}

async function fetchIncome(
  kommuneCode: string,
): Promise<MacroData["income"]> {
  try {
    const body = {
      table: "INDKP201",
      format: "JSONSTAT",
      variables: [
        { code: "OMRÅDE", values: [kommuneCode] },
        { code: "ENHED", values: ["110"] }, // Gennemsnit kr.
        { code: "TID", values: [String(new Date().getFullYear() - 2)] }, // 2 år bagud (DST har forsinkelse)
      ],
    };

    const res = await fetch("https://api.statbank.dk/v1/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { averageHouseholdIncome: null, medianIncome: null };

    const data = (await res.json()) as { dataset: { value: number[] } };
    const v = data.dataset.value[0];
    return {
      averageHouseholdIncome: typeof v === "number" ? v : null,
      medianIncome: null,
    };
  } catch {
    return { averageHouseholdIncome: null, medianIncome: null };
  }
}

// ─── CVR.dev ──────────────────────────────────────

async function fetchSellerCvr(cvr: string): Promise<SellerCvrData> {
  const empty: SellerCvrData = {
    cvr,
    name: null,
    formattedName: null,
    founded: null,
    industryCode: null,
    industryName: null,
    employees: null,
    address: null,
    status: null,
  };

  const token = process.env.CVR_DEV_TOKEN;
  if (!token) return empty;

  try {
    const res = await fetch(`https://api.cvr.dev/api/cvr/company/${cvr}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return empty;

    const d = (await res.json()) as {
      navn?: string;
      stiftet?: string;
      hovedbranche?: { kode?: string; tekst?: string };
      antalAnsatte?: number;
      adresse?: { fuld?: string };
      status?: string;
    };

    return {
      cvr,
      name: d.navn ?? null,
      formattedName: d.navn ?? null,
      founded: d.stiftet ?? null,
      industryCode: d.hovedbranche?.kode ?? null,
      industryName: d.hovedbranche?.tekst ?? null,
      employees: d.antalAnsatte ?? null,
      address: d.adresse?.fuld ?? null,
      status: d.status ?? null,
    };
  } catch {
    return empty;
  }
}

// ─── BBR fra dataforsyningen.dk ────────────────────

async function fetchBbr(
  address: string | null,
  zipCode: string | null,
): Promise<Partial<PropertyData>> {
  if (!address || !zipCode) return {};
  try {
    const query = `${address}, ${zipCode}`;
    const res = await fetch(
      `https://api.dataforsyningen.dk/adresser?q=${encodeURIComponent(query)}&fuzzy=&struktur=mini`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return {};
    const adresser = (await res.json()) as Array<{
      id: string;
      vejnavn: string;
      kommune?: { navn: string };
    }>;
    if (adresser.length === 0) return {};

    return {
      municipality: adresser[0].kommune?.navn ?? null,
    };
  } catch {
    return {};
  }
}

// ─── M²-priser pr. kommune (Danmarks Statistik EJEN77) ──
//
// EJEN77: Ejendomspriser efter ejendomskategori, område og tid.
// Variables: EJDKAT (kategori, 11 = Parcel/rækkehus), OMRÅDE (kommune),
//   TID (kvartal eller år), ENHED (101 = kr. pr. m²).

async function fetchSqmPrice(
  kommuneCode: string,
): Promise<{ municipality: number | null; region: number | null }> {
  const empty = { municipality: null, region: null };
  try {
    // Senest tilgængelige kvartal (vi prøver de seneste 4)
    const year = new Date().getFullYear();
    const periods = [
      `${year - 1}K4`,
      `${year - 1}K3`,
      `${year - 1}K2`,
      `${year - 1}K1`,
    ];

    const body = {
      table: "EJEN77",
      format: "JSONSTAT",
      variables: [
        { code: "EJDKAT", values: ["11"] }, // 11 = enfamiliehus
        { code: "OMRÅDE", values: [kommuneCode] },
        { code: "ENHED", values: ["101"] }, // kr. pr. m²
        { code: "TID", values: periods },
      ],
    };

    const res = await fetch("https://api.statbank.dk/v1/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return empty;

    const data = (await res.json()) as { dataset: { value: number[] } };
    // Senest tilgængelig værdi (første ikke-null)
    const latest = data.dataset.value.find(
      (v) => typeof v === "number" && v > 0,
    );
    return {
      municipality: typeof latest === "number" ? latest : null,
      region: null,
    };
  } catch {
    return empty;
  }
}

// ─── Hoved-funktion: berig PropertyData med makro ──

export async function enrichWithMacro(
  property: PropertyData,
): Promise<{
  macro: MacroData;
  seller: SellerCvrData | null;
  enrichedProperty: PropertyData;
}> {
  // BBR-opslag for at få kommune hvis den mangler
  let enriched = property;
  if (!property.municipality && property.address) {
    const bbrData = await fetchBbr(property.address, property.zipCode);
    enriched = { ...property, ...bbrData };
  }

  const kommuneCode = getKommuneCode(enriched.municipality);

  // Parallelle kald
  const [populationTrend, income, sqmPrice, seller] = await Promise.all([
    kommuneCode
      ? fetchPopulationTrend(kommuneCode)
      : Promise.resolve(EMPTY_MACRO.populationTrend),
    kommuneCode
      ? fetchIncome(kommuneCode)
      : Promise.resolve(EMPTY_MACRO.income),
    kommuneCode
      ? fetchSqmPrice(kommuneCode)
      : Promise.resolve({ municipality: null, region: null }),
    enriched.sellerCvr
      ? fetchSellerCvr(enriched.sellerCvr)
      : Promise.resolve<SellerCvrData | null>(null),
  ]);

  const macro: MacroData = {
    ...EMPTY_MACRO,
    municipality: enriched.municipality,
    populationTrend,
    income,
    housingMarket: {
      avgSqmPriceRegion: sqmPrice.region,
      avgSqmPriceMunicipality: sqmPrice.municipality,
      avgRentPerSqm: null,
      salesVolumeTrend: null,
    },
  };

  return { macro, seller, enrichedProperty: enriched };
}
