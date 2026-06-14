// Udtræk adresse-info fra filnavn — næsten alle datarum/zip-filer hedder
// noget i stil med:
//   "Ramsherred 16, 4700 Næstved.zip"
//   "Salgsopstilling - Strandvejen 100, 2900 Hellerup.pdf"
//   "Datarum Adelgade 35-37 Præstø.zip"
//
// Med dansk postnummer + by er det relativt nemt at parse.

import type { PropertyData } from "./types";

const DK_KOMMUNER = new Set([
  "København",
  "Frederiksberg",
  "Aarhus",
  "Odense",
  "Aalborg",
  "Esbjerg",
  "Randers",
  "Kolding",
  "Horsens",
  "Vejle",
  "Roskilde",
  "Herning",
  "Helsingør",
  "Silkeborg",
  "Næstved",
  "Fredericia",
  "Holstebro",
  "Greve",
  "Køge",
  "Slagelse",
  "Hillerød",
  "Holbæk",
  "Sønderborg",
  "Svendborg",
  "Hellerup",
  "Charlottenlund",
  "Lyngby",
  "Gentofte",
  "Vedbæk",
  "Rungsted",
  "Hørsholm",
  "Birkerød",
  "Allerød",
  "Præstø",
  "Vordingborg",
  "Stege",
  "Nykøbing F",
  "Maribo",
  "Sakskøbing",
  "Nyborg",
  "Skanderborg",
  "Viborg",
  "Hjørring",
  "Frederikshavn",
  "Skagen",
  "Thisted",
  "Sønderbro",
  "Tønder",
  "Aabenraa",
  "Haderslev",
  "Ikast",
  "Brande",
  "Grindsted",
  "Varde",
  "Ribe",
]);

const POSTNR_TO_CITY: Record<string, string> = {
  "4700": "Næstved",
  "4720": "Præstø",
  "4760": "Vordingborg",
  "4736": "Karrebæksminde",
  "4683": "Rønnede",
  "4690": "Haslev",
  "1000": "København K",
  "1050": "København K",
  "1100": "København K",
  "2000": "Frederiksberg",
  "2100": "København Ø",
  "2200": "København N",
  "2300": "København S",
  "2400": "København NV",
  "2450": "København SV",
  "2500": "Valby",
  "2600": "Glostrup",
  "2700": "Brønshøj",
  "2900": "Hellerup",
  "2800": "Kongens Lyngby",
  "3400": "Hillerød",
  "5000": "Odense C",
  "5230": "Odense M",
  "6000": "Kolding",
  "6700": "Esbjerg",
  "7100": "Vejle",
  "8000": "Aarhus C",
  "8200": "Aarhus N",
  "8210": "Aarhus V",
  "8230": "Åbyhøj",
  "9000": "Aalborg",
};

// Postnummer → kommune (approximation — DAWA-opslag laver vi senere)
const POSTNR_TO_KOMMUNE: Record<string, string> = {
  "4700": "Næstved",
  "4720": "Vordingborg",
  "4760": "Vordingborg",
  "4736": "Næstved",
  "4683": "Faxe",
  "4690": "Faxe",
  "1000": "København",
  "1050": "København",
  "1100": "København",
  "2000": "Frederiksberg",
  "2100": "København",
  "2200": "København",
  "2300": "København",
  "2400": "København",
  "2450": "København",
  "2500": "København",
  "2600": "Glostrup",
  "2700": "København",
  "2900": "Gentofte",
  "2800": "Lyngby-Taarbæk",
  "3400": "Hillerød",
  "5000": "Odense",
  "5230": "Odense",
  "6000": "Kolding",
  "6700": "Esbjerg",
  "7100": "Vejle",
  "8000": "Aarhus",
  "8200": "Aarhus",
  "8210": "Aarhus",
  "8230": "Aarhus",
  "9000": "Aalborg",
};

export function extractFromFilename(fileName: string): Partial<PropertyData> {
  // Fjern fil-extension og typiske prefixer
  let cleaned = fileName
    .replace(/\.(zip|pdf|xlsx|xls|csv)$/i, "")
    .replace(
      /^(datarum|salgsopstilling|prospekt|udbud|investeringsoplæg|bilag)\s*[-_]?\s*/i,
      "",
    )
    .trim();

  // Match 4-cifret postnummer + by
  const postcodeMatch = cleaned.match(/\b(\d{4})\b[\s,]+([A-Za-zÆØÅæøåé]+)/);
  let zipCode: string | null = null;
  let city: string | null = null;
  let address: string | null = null;
  let municipality: string | null = null;

  if (postcodeMatch) {
    zipCode = postcodeMatch[1];
    city =
      postcodeMatch[2].charAt(0).toUpperCase() +
      postcodeMatch[2].slice(1).toLowerCase();
    // Hvis vi kender bedre by-navn fra mapping, brug det
    city = POSTNR_TO_CITY[zipCode] ?? city;
    municipality = POSTNR_TO_KOMMUNE[zipCode] ?? null;
    // Alt før postnummeret er adresse-delen
    address = cleaned.substring(0, postcodeMatch.index).replace(/[,]+\s*$/, "").trim();
  } else {
    // Fald tilbage: hvis filnavn slutter med en by-navn vi kender
    for (const kommune of DK_KOMMUNER) {
      if (cleaned.toLowerCase().endsWith(kommune.toLowerCase())) {
        city = kommune;
        municipality = kommune;
        address = cleaned
          .substring(0, cleaned.length - kommune.length)
          .replace(/[,]+\s*$/, "")
          .trim();
        break;
      }
    }
  }

  // Klean address — fjern løse kommaer og ekstra mellemrum
  if (address) {
    address = address.replace(/,\s*$/, "").trim();
    // Hvis adressen er bare tomt, sat null
    if (!address) address = null;
  }

  return {
    address,
    zipCode,
    city,
    municipality,
  };
}
