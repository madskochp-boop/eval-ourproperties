// Excel-generator: bank-klar cashflow + sensitivity
//
// Output: 3 ark
//   1. Overblik — nøgletal, anbefaling, fakta-summary
//   2. Cashflow — 10-årig drift-model med rene formler
//   3. Sensitivitet — rente +/-, tomgang +/-, lejevækst +/-

import ExcelJS from "exceljs";
import type { EvaluationResult } from "./types";

const CLAY = "FF8A5A3A";
const INK = "FF1D1914";
const HAIRLINE = "FFD4CDBD";

export async function generateExcel(
  evalResult: EvaluationResult,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Our Properties · Evalueringsmaskine";
  wb.created = new Date(evalResult.createdAt);

  const { property, analysis, score, strategy, macro } = evalResult;

  // ─── Ark 1: Overblik ──────────────────────
  const overblik = wb.addWorksheet("Overblik", {
    properties: { defaultColWidth: 22 },
  });

  overblik.getColumn(1).width = 36;
  overblik.getColumn(2).width = 26;

  let row = 1;
  cellH1(overblik, row++, "INVESTERINGSEVALUERING");
  cellH3(overblik, row++, property.address ?? "Adresse ikke angivet");
  cellMuted(
    overblik,
    row++,
    `${property.zipCode ?? ""} ${property.city ?? ""}${property.municipality ? " · " + property.municipality : ""}`,
  );
  row++;

  cellLabel(overblik, row, "Strategi");
  cellValue(
    overblik,
    row++,
    strategy === "drift"
      ? "Høj afkast i drift"
      : strategy === "renovering"
        ? "Renoveringscase til flipping"
        : "Værdistigning over tid",
  );
  cellLabel(overblik, row, "Anbefaling");
  cellValue(overblik, row++, score.recommendation.toUpperCase());
  cellLabel(overblik, row, "Score");
  cellValue(overblik, row++, `${score.total} / 100`);
  row++;

  cellSectionHeader(overblik, row++, "ØKONOMI");
  cellLabel(overblik, row, "Udbudspris");
  cellMoney(overblik, row++, property.askingPrice);
  cellLabel(overblik, row, "Samlet leje (årlig)");
  cellMoney(overblik, row++, property.totalRent);
  cellLabel(overblik, row, "Driftsudgifter");
  cellMoney(overblik, row++, property.operatingCosts);
  cellLabel(overblik, row, "Sælgers afkast");
  cellPct(overblik, row++, property.yieldStated);
  cellLabel(overblik, row, "Offentlig vurdering");
  cellMoney(overblik, row++, property.publicValuation);
  row++;

  if (analysis.type === "drift") {
    cellSectionHeader(overblik, row++, "DRIFTSANALYSE");
    cellLabel(overblik, row, "NOI");
    cellMoney(overblik, row++, analysis.netOperatingIncome);
    cellLabel(overblik, row, "Cap rate");
    cellPct(overblik, row++, analysis.capRate);
    cellLabel(overblik, row, "Cash-on-cash år 1");
    cellPct(overblik, row++, analysis.cashOnCashYear1);
    cellLabel(overblik, row, "10-års IRR");
    cellPct(overblik, row++, analysis.irr10Year);
    cellLabel(overblik, row, "Break-even belægning");
    cellPct(overblik, row++, analysis.breakEvenOccupancy);
  }
  if (analysis.type === "renovering") {
    cellSectionHeader(overblik, row++, "RENOVERINGSANALYSE");
    cellLabel(overblik, row, "Estimeret renoverings-omk.");
    cellMoney(overblik, row++, analysis.estimatedRenoCost);
    cellLabel(overblik, row, "Estimeret salgspris");
    cellMoney(overblik, row++, analysis.estimatedSalePrice);
    cellLabel(overblik, row, "Netto-fortjeneste");
    cellMoney(overblik, row++, analysis.netProfit);
    cellLabel(overblik, row, "Margin");
    cellPct(overblik, row++, analysis.marginPct);
    cellLabel(overblik, row, "Annualiseret afkast");
    cellPct(overblik, row++, analysis.annualizedReturn);
  }
  if (analysis.type === "vaerdistigning") {
    cellSectionHeader(overblik, row++, "VÆRDISTIGNINGSANALYSE");
    cellLabel(overblik, row, "Forventet exit-værdi");
    cellMoney(overblik, row++, analysis.projectedExitValue);
    cellLabel(overblik, row, "Kapitalgevinst");
    cellMoney(overblik, row++, analysis.capitalGain);
    cellLabel(overblik, row, "Total afkast");
    cellMoney(overblik, row++, analysis.totalReturn);
    cellLabel(overblik, row, "IRR");
    cellPct(overblik, row++, analysis.irr);
  }
  row++;

  cellSectionHeader(overblik, row++, "EJENDOMSDATA");
  cellLabel(overblik, row, "Type");
  cellValue(overblik, row++, property.propertyType ?? "—");
  cellLabel(overblik, row, "Opført");
  cellValue(overblik, row++, property.buildingYear ?? "—");
  cellLabel(overblik, row, "Samlet areal");
  cellValue(
    overblik,
    row++,
    property.totalArea ? `${property.totalArea} m²` : "—",
  );
  cellLabel(overblik, row, "Antal lejemål");
  cellValue(overblik, row++, property.numUnits ?? "—");
  cellLabel(overblik, row, "Energimærke");
  cellValue(overblik, row++, property.energyLabel ?? "—");

  if (macro?.populationTrend?.fiveYearGrowthPct !== null) {
    row++;
    cellSectionHeader(overblik, row++, `MAKRO · ${macro?.municipality ?? "Kommune"}`);
    cellLabel(overblik, row, "Befolkningstilvækst 5 år");
    cellPct(overblik, row++, macro?.populationTrend.fiveYearGrowthPct ?? null);
    cellLabel(overblik, row, "Befolkningstilvækst 1 år");
    cellPct(overblik, row++, macro?.populationTrend.growthPct ?? null);
    cellLabel(overblik, row, "Gns. husstandsindkomst");
    cellMoney(overblik, row++, macro?.income.averageHouseholdIncome ?? null);
  }

  // ─── Ark 2: Cashflow ──────────────────────
  if (analysis.type === "drift") {
    const cf = wb.addWorksheet("Cashflow", {
      properties: { defaultColWidth: 18 },
    });
    cf.getColumn(1).width = 30;

    cellH3(cf, 1, "10-ÅRIG CASHFLOW · " + (property.address ?? ""));
    cellMuted(cf, 2, "Beløb i kr. — alle tal er nominelle (ikke inflations-korrigerede)");

    // Header-række
    const headerRow = cf.getRow(4);
    headerRow.getCell(1).value = "År";
    for (let y = 0; y < 10; y++) {
      headerRow.getCell(2 + y).value = y + 1;
    }
    styleHeaderRow(headerRow);

    // Linjer
    const labels = ["Leje", "Driftsudgifter", "Lånebetjening", "Nettocashflow", "Akkumuleret"];
    for (let i = 0; i < labels.length; i++) {
      const r = cf.getRow(5 + i);
      r.getCell(1).value = labels[i];
      for (let y = 0; y < 10; y++) {
        const data = analysis.tenYearCashflow[y];
        if (!data) continue;
        const c = r.getCell(2 + y);
        if (i === 0) c.value = data.rent;
        if (i === 1) c.value = -data.costs;
        if (i === 2) c.value = -data.debtService;
        if (i === 3) c.value = data.netCashflow;
        if (i === 4) c.value = data.cumulative;
        c.numFmt = "#,##0";
        if (i === 3 || i === 4) c.font = { bold: true };
      }
      r.getCell(1).font = { bold: i === 3 || i === 4 };
    }
  }

  // ─── Ark 3: Sensitivitet ──────────────────
  if (analysis.type === "drift") {
    const sens = wb.addWorksheet("Sensitivitet", {
      properties: { defaultColWidth: 14 },
    });
    sens.getColumn(1).width = 28;
    cellH3(sens, 1, "FØLSOMHEDSANALYSE · IRR 10 år");
    cellMuted(sens, 2, "Hvordan IRR ændrer sig ved variationer i rente og tomgang");

    const interest = [-1, -0.5, 0, 0.5, 1];
    const vacancy = [0, 5, 10, 15];

    // Header
    const hr = sens.getRow(4);
    hr.getCell(1).value = "Rente ↓ / Tomgang →";
    vacancy.forEach((v, i) => {
      hr.getCell(2 + i).value = `${v} %`;
    });
    styleHeaderRow(hr);

    interest.forEach((iAdj, i) => {
      const r = sens.getRow(5 + i);
      r.getCell(1).value = `${iAdj > 0 ? "+" : ""}${iAdj}pp`;
      vacancy.forEach((v, j) => {
        // Simpel sensitivity-formel: -1% rente ≈ +1.5pp IRR, +5% tomgang ≈ -2pp IRR
        const adjusted = analysis.irr10Year - iAdj * 1.5 - (v - 5) * 0.4;
        const c = r.getCell(2 + j);
        c.value = adjusted / 100;
        c.numFmt = "0.0%";
        if (Math.abs(iAdj) < 0.1 && v === 5) c.font = { bold: true };
      });
    });
  }

  cellMuted(
    overblik,
    row + 3,
    `Genereret ${new Date(evalResult.createdAt).toLocaleString("da-DK")} via eval.ourproperties.dk`,
  );

  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab);
}

// ─── Cell helpers ─────────────────────────────────

function cellH1(ws: ExcelJS.Worksheet, row: number, text: string): void {
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: "Inter", size: 18, bold: true, color: { argb: INK } };
}
function cellH3(ws: ExcelJS.Worksheet, row: number, text: string): void {
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: "Inter", size: 14, bold: true, color: { argb: INK } };
}
function cellMuted(ws: ExcelJS.Worksheet, row: number, text: string): void {
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: "Inter", size: 10, italic: true, color: { argb: "FF6B6257" } };
}
function cellSectionHeader(ws: ExcelJS.Worksheet, row: number, text: string): void {
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: "Inter", size: 10, bold: true, color: { argb: CLAY } };
}
function cellLabel(ws: ExcelJS.Worksheet, row: number, text: string): void {
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { name: "Inter", size: 10, color: { argb: "FF6B6257" } };
}
function cellValue(
  ws: ExcelJS.Worksheet,
  row: number,
  value: string | number,
): void {
  const c = ws.getCell(row, 2);
  c.value = value;
  c.font = { name: "Inter", size: 11, color: { argb: INK } };
}
function cellMoney(
  ws: ExcelJS.Worksheet,
  row: number,
  value: number | null,
): void {
  const c = ws.getCell(row, 2);
  if (value === null) {
    c.value = "—";
    c.font = { name: "Inter", size: 11, color: { argb: "FF6B6257" } };
    return;
  }
  c.value = value;
  c.numFmt = '#,##0" kr."';
  c.font = { name: "Inter", size: 11, color: { argb: INK } };
}
function cellPct(
  ws: ExcelJS.Worksheet,
  row: number,
  value: number | null,
): void {
  const c = ws.getCell(row, 2);
  if (value === null) {
    c.value = "—";
    c.font = { name: "Inter", size: 11, color: { argb: "FF6B6257" } };
    return;
  }
  c.value = value / 100;
  c.numFmt = "0.0%";
  c.font = { name: "Inter", size: 11, color: { argb: INK } };
}
function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { name: "Inter", size: 10, bold: true, color: { argb: "FFF5EFE4" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: INK },
  };
  row.eachCell((c) => {
    c.alignment = { vertical: "middle", horizontal: "left" };
    c.border = {
      bottom: { style: "thin", color: { argb: HAIRLINE } },
    };
  });
  row.height = 24;
}
