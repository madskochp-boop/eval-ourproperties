// Dokumenttyper som brugeren kan tagge sine uploads med.
// Hver type har en specifik AI-prompt så Claude ved hvad den skal kigge efter.

export type DocType =
  | "auto"
  | "salgsopstilling"
  | "lejeliste"
  | "vurdering"
  | "tingbog"
  | "bbr"
  | "energimaerke"
  | "datarum"
  | "regnskab"
  | "anden";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  auto: "Auto-detektér",
  salgsopstilling: "Salgsopstilling",
  lejeliste: "Lejeliste",
  vurdering: "Vurdering",
  tingbog: "Tingbogsattest",
  bbr: "BBR-meddelelse",
  energimaerke: "Energimærke",
  datarum: "Datarum (zip)",
  regnskab: "Regnskab",
  anden: "Anden bilag",
};

export const DOC_TYPE_ORDER: DocType[] = [
  "auto",
  "salgsopstilling",
  "lejeliste",
  "vurdering",
  "tingbog",
  "bbr",
  "energimaerke",
  "datarum",
  "regnskab",
  "anden",
];

// Auto-detektér ud fra filnavn
export function detectDocType(fileName: string): DocType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".zip")) return "datarum";
  if (/lejeliste|huslejeliste|areal.*fordelingstal/i.test(lower)) return "lejeliste";
  if (/salgsopstilling|prospekt|prospect|udbud/i.test(lower)) return "salgsopstilling";
  if (/vurdering|valuation/i.test(lower)) return "vurdering";
  if (/tingbog|tinglysning/i.test(lower)) return "tingbog";
  if (/bbr[-_.]|bbr-meddelelse/i.test(lower)) return "bbr";
  if (/energim|energy/i.test(lower)) return "energimaerke";
  if (/regnskab|aarsrapport|årsrapport|drift/i.test(lower)) return "regnskab";
  return "auto";
}

// Specifik prompt-snippet pr. dokumenttype som tilføjes til EXTRACTION_PROMPT
// så Claude fokuserer rigtigt.
export function promptHintFor(type: DocType): string {
  switch (type) {
    case "lejeliste":
      return `FOKUS: Dette er en LEJELISTE. Udfyld rentalSegments med ÉN linje pr. lejemål, sum årslejer i totalRent (EKSKL. varme/vand acconto — find kun "Leje" eller "Husleje" kolonnen), tæl antal lejemål i numUnits, sum areal i totalArea. Find sælger-firma-navn i header.`;
    case "salgsopstilling":
      return `FOKUS: Dette er en SALGSOPSTILLING. Udfyld så mange felter som muligt, særligt askingPrice, yieldStated, totalRent, operatingCosts og description. Notér potentialer i notes.`;
    case "vurdering":
      return `FOKUS: Dette er en OFFENTLIG VURDERING. Udfyld publicValuation. Hent også address, areal, byggeår hvis muligt.`;
    case "tingbog":
      return `FOKUS: Dette er en TINGBOGSATTEST. Hent ejer (sellerName), sellerCvr hvis selskab, matrikelnummer, gæld/pant hvis angivet.`;
    case "bbr":
      return `FOKUS: Dette er en BBR-MEDDELELSE. Udfyld buildingYear, renovationYear, totalArea, residentialArea, commercialArea, groundArea, numFloors, heating, energyLabel.`;
    case "energimaerke":
      return `FOKUS: Dette er et ENERGIMÆRKE. Udfyld energyLabel og heating.`;
    case "regnskab":
      return `FOKUS: Dette er et REGNSKAB / driftsregnskab. Udfyld operatingCosts, propertyTax, insuranceCost, totalRent (årlig).`;
    case "datarum":
      return `FOKUS: Dette er et DATARUM (zip). Du har modtaget den vigtigste fil fra det — tjek hvad dokumenttypen er.`;
    case "anden":
      return `FOKUS: Generelt bilag. Udfyld hvad du kan finde.`;
    case "auto":
    default:
      return ``;
  }
}
