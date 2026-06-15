"use client";

import { useState } from "react";
import type {
  EvaluationResult,
  DriftAnalysis,
  RenoveringAnalysis,
  VaerdistigningAnalysis,
  PrivatAnalysis,
  RiskFlag,
  RoomCondition,
  NegotiationLever,
  FinancingResult,
} from "@/lib/types";

function fmtKr(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return Math.round(n).toLocaleString("da-DK") + " kr.";
}
function fmtPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(1) + " %";
}
function fmtNum(n: number | null | undefined, suffix = ""): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("da-DK") + suffix;
}

const STRATEGY_LABELS = {
  drift: "Høj afkast i drift",
  renovering: "Renoveringscase til flipping",
  vaerdistigning: "Værdistigning over tid",
  privat: "Privat bolig",
};

const RECOMMENDATION_TONES: Record<string, string> = {
  anbefales: "text-clay",
  interessant: "text-ink",
  betinget: "text-warning",
  frarådes: "text-oxblood",
};

export function ReportClient({ evalResult }: { evalResult: EvaluationResult }) {
  const { property, strategy, score, createdAt, analysis, macro, seller, risks, id, financing } =
    evalResult;
  const [downloading, setDownloading] = useState<"excel" | "pptx" | null>(null);

  async function download(format: "excel" | "pptx") {
    setDownloading(format);
    try {
      const res = await fetch(`/api/download/${id}/${format}`);
      if (!res.ok) {
        alert("Kunne ikke generere fil. Prøv igen.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        format === "excel"
          ? `evaluering-${property.address?.replace(/[^\w]/g, "-") ?? id}.xlsx`
          : `evaluering-${property.address?.replace(/[^\w]/g, "-") ?? id}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  // Tæl antal felter med data
  const dataFields = [
    property.address,
    property.askingPrice,
    property.totalRent,
    property.totalArea,
    property.buildingYear,
    property.numUnits,
    property.energyLabel,
    property.publicValuation,
    property.operatingCosts,
    property.propertyType,
  ];
  const filledFields = dataFields.filter((v) => v !== null && v !== undefined).length;
  const dataQuality =
    filledFields >= 7 ? "fuld" : filledFields >= 4 ? "delvis" : "sparsom";

  return (
    <main className="min-h-screen">
      <header className="px-4 sm:px-8 lg:px-12 pt-8 pb-6 border-b border-hairline">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/" className="wordmark text-xl sm:text-2xl text-ink">
            <b>our</b>
            <i>properties</i>
          </a>
          <a
            href="/"
            className="font-mono text-[11px] tracking-[1.5px] uppercase text-muted hover:text-ink"
          >
            ← Ny evaluering
          </a>
        </div>
      </header>

      {/* Data-kvalitet alarm */}
      {dataQuality !== "fuld" && (
        <div className={`px-4 sm:px-8 lg:px-12 py-3 border-b ${dataQuality === "sparsom" ? "bg-oxblood/5 border-oxblood/30" : "bg-warning/5 border-warning/30"}`}>
          <div className="max-w-5xl mx-auto flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <span className="font-mono text-[10px] tracking-[2px] uppercase mr-3 font-semibold text-clay">
                {dataQuality === "sparsom" ? "Sparsom data" : "Delvis data"}
              </span>
              <span className="font-serif-body text-sm text-graphite">
                {filledFields} af 10 nøglefelter blev parsed.{" "}
                {dataQuality === "sparsom"
                  ? "PDF'en er muligvis scannet eller billede-baseret — prøv at uploade salgsopstillingen separat, eller indtast detaljer manuelt."
                  : "Mange felter mangler — supplér gerne med et link til boligsiden."}
              </span>
            </div>
            <a href="/" className="font-mono text-[10px] tracking-[1.5px] uppercase text-clay hover:text-ink">
              Prøv igen →
            </a>
          </div>
        </div>
      )}

      {/* Hero */}
      <section className="px-4 sm:px-8 lg:px-12 pt-14 sm:pt-20 pb-10">
        <div className="max-w-5xl mx-auto">
          <div className="font-mono text-[11px] tracking-[2.5px] uppercase text-clay font-semibold mb-5">
            — Evaluering · {STRATEGY_LABELS[strategy]}
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl md:text-5xl leading-[1.05] tracking-tight text-ink">
            {property.address ?? "Adresse ikke fundet"}
          </h1>
          <p className="font-serif-body text-lg text-graphite mt-4 leading-relaxed">
            {property.zipCode} {property.city}
            {property.municipality && ` · ${property.municipality}`}
          </p>
        </div>
      </section>

      {/* Score + Anbefaling */}
      <section className="px-4 sm:px-8 lg:px-12 pb-10">
        <div className="max-w-5xl mx-auto">
          <div className="border border-hairline bg-paper p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex-1 min-w-[300px]">
                <div className="font-mono text-[10px] tracking-[2px] uppercase text-clay font-semibold mb-3">
                  — Anbefaling
                </div>
                <div
                  className={`font-heading text-3xl sm:text-4xl leading-tight tracking-tight mb-3 capitalize ${RECOMMENDATION_TONES[score.recommendation] ?? "text-ink"}`}
                >
                  {score.recommendation === "anbefales"
                    ? "Anbefales"
                    : score.recommendation === "interessant"
                      ? "Interessant case"
                      : score.recommendation === "betinget"
                        ? "Betinget"
                        : "Frarådes"}
                </div>
                <p className="font-serif-body text-base sm:text-lg text-graphite italic leading-relaxed">
                  {score.oneLineSummary}
                </p>
              </div>
              <div className="w-full sm:w-auto">
                <ScoreBadge total={score.total} />
              </div>
            </div>
            <div className="grid grid-cols-4 mt-8 pt-6 border-t border-hairline gap-4">
              <Dim label="Økonomi" value={score.breakdown.economics} />
              <Dim label="Marked" value={score.breakdown.market} />
              <Dim label="Risiko" value={score.breakdown.risk} />
              <Dim label="Strategi-fit" value={score.breakdown.fit} />
            </div>
          </div>
        </div>
      </section>

      {/* Download-knapper */}
      <section className="px-4 sm:px-8 lg:px-12 pb-10">
        <div className="max-w-5xl mx-auto flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => download("excel")}
            disabled={downloading !== null}
            className="bg-ink text-cream px-5 py-3 font-sans text-[12px] tracking-wide uppercase font-medium hover:bg-graphite transition-colors disabled:opacity-50 cursor-pointer"
          >
            {downloading === "excel" ? "Genererer…" : "↓ Excel til banken"}
          </button>
          <button
            type="button"
            onClick={() => download("pptx")}
            disabled={downloading !== null}
            className="bg-paper border border-hairline text-ink px-5 py-3 font-sans text-[12px] tracking-wide uppercase font-medium hover:bg-cream/40 hover:border-clay transition-colors disabled:opacity-50 cursor-pointer"
          >
            {downloading === "pptx" ? "Genererer…" : "↓ PowerPoint-deck"}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="bg-paper border border-hairline text-ink px-5 py-3 font-sans text-[12px] tracking-wide uppercase font-medium hover:bg-cream/40 hover:border-clay transition-colors cursor-pointer"
          >
            ↓ Print som PDF
          </button>
        </div>
      </section>

      {/* Strategi-specifik analyse */}
      <section className="px-4 sm:px-8 lg:px-12 pb-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-heading text-2xl text-ink mb-5">
            {STRATEGY_LABELS[strategy]} — beregning
          </h2>
          {analysis.type === "drift" && <DriftSection a={analysis} />}
          {analysis.type === "renovering" && <RenoveringSection a={analysis} />}
          {analysis.type === "vaerdistigning" && (
            <VaerdistigningSection a={analysis} />
          )}
          {analysis.type === "privat" && (
            <PrivatSection a={analysis} city={property.city} municipality={property.municipality} />
          )}
        </div>
      </section>

      {/* Finansiering */}
      {financing && (
        <section className="px-4 sm:px-8 lg:px-12 pb-16">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-heading text-2xl text-ink mb-5">
              Finansiering & bank-vurdering
            </h2>
            <FinancingSection f={financing} />
          </div>
        </section>
      )}

      {/* Risici */}
      {risks.length > 0 && (
        <section className="px-4 sm:px-8 lg:px-12 pb-16">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-heading text-2xl text-ink mb-5">
              Risici og forbehold
            </h2>
            <ul className="space-y-3">
              {risks.map((r, i) => (
                <RiskRow key={i} risk={r} />
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Ejendomsdata */}
      <section className="px-4 sm:px-8 lg:px-12 pb-16">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-heading text-2xl text-ink mb-5">Ejendomsdata</h2>
          <div className="border border-hairline bg-paper grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <DetailRow label="Type" value={property.propertyType ?? "—"} />
            <DetailRow label="Opført" value={fmtNum(property.buildingYear)} />
            <DetailRow label="Renoveret" value={fmtNum(property.renovationYear)} />
            <DetailRow label="Energimærke" value={property.energyLabel ?? "—"} />
            <DetailRow label="Samlet areal" value={fmtNum(property.totalArea, " m²")} />
            <DetailRow label="Boligareal" value={fmtNum(property.residentialArea, " m²")} />
            <DetailRow label="Erhvervsareal" value={fmtNum(property.commercialArea, " m²")} />
            <DetailRow label="Grundareal" value={fmtNum(property.groundArea, " m²")} />
            <DetailRow label="Antal lejemål" value={fmtNum(property.numUnits)} />
            <DetailRow label="Varme" value={property.heating ?? "—"} />
            <DetailRow label="Offentlig vurdering" value={fmtKr(property.publicValuation)} />
            <DetailRow label="Ejendomsskat" value={fmtKr(property.propertyTax)} />
          </div>
        </div>
      </section>

      {/* Lejemål */}
      {property.rentalSegments.length > 0 && (
        <section className="px-4 sm:px-8 lg:px-12 pb-16">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-heading text-2xl text-ink mb-5">Lejemål</h2>
            <div className="border border-hairline bg-paper overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-hairline">
                  <tr>
                    <Th>Lejemål</Th>
                    <Th>Type</Th>
                    <Th>m²</Th>
                    <Th>Månedlig leje</Th>
                    <Th>Lejer</Th>
                  </tr>
                </thead>
                <tbody>
                  {property.rentalSegments.map((s, i) => (
                    <tr
                      key={i}
                      className="border-b border-hairline last:border-b-0"
                    >
                      <Td>{s.unit}</Td>
                      <Td>{s.type ?? "—"}</Td>
                      <Td>{fmtNum(s.area, " m²")}</Td>
                      <Td>{fmtKr(s.monthlyRent)}</Td>
                      <Td>{s.tenant ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Makro-data */}
      {macro && macro.municipality && (
        <section className="px-4 sm:px-8 lg:px-12 pb-16">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-heading text-2xl text-ink mb-5">
              {macro.municipality} Kommune — Markedsdata
            </h2>
            <div className="border border-hairline bg-paper grid grid-cols-2 md:grid-cols-4">
              <Stat
                label="Befolkningstilvækst 5 år"
                value={fmtPct(macro.populationTrend.fiveYearGrowthPct)}
              />
              <Stat
                label="Befolkningstilvækst 1 år"
                value={fmtPct(macro.populationTrend.growthPct)}
              />
              <Stat
                label="Befolkning"
                value={fmtNum(macro.populationTrend.currentYear)}
              />
              <Stat
                label="Husstandsindkomst (gns.)"
                value={fmtKr(macro.income.averageHouseholdIncome)}
              />
            </div>
          </div>
        </section>
      )}

      {/* Sælger */}
      {seller && (seller.name || seller.cvr) && (
        <section className="px-4 sm:px-8 lg:px-12 pb-16">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-heading text-2xl text-ink mb-5">Sælger</h2>
            <div className="border border-hairline bg-paper grid grid-cols-1 sm:grid-cols-2 gap-x-8">
              <DetailRow label="Navn" value={seller.name ?? "—"} />
              <DetailRow label="CVR" value={seller.cvr ?? "—"} />
              <DetailRow label="Stiftet" value={seller.founded ?? "—"} />
              <DetailRow label="Branche" value={seller.industryName ?? "—"} />
              <DetailRow label="Ansatte" value={fmtNum(seller.employees)} />
              <DetailRow label="Status" value={seller.status ?? "—"} />
            </div>
          </div>
        </section>
      )}

      {/* Noter fra salgsopstilling */}
      {property.notes.length > 0 && (
        <section className="px-4 sm:px-8 lg:px-12 pb-16">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-heading text-2xl text-ink mb-5">
              Potentialer fra salgsopstilling
            </h2>
            <div className="border border-hairline bg-paper p-6">
              <ul className="space-y-2">
                {property.notes.map((n, i) => (
                  <li
                    key={i}
                    className="font-serif-body text-base text-ink leading-relaxed pl-4 border-l-2 border-clay/30"
                  >
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* Kilder */}
      <section className="px-4 sm:px-8 lg:px-12 pb-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-heading text-xl text-ink mb-3">Kilder</h2>
          <ul className="space-y-1 text-sm text-muted font-mono">
            {property.sources.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="uppercase text-[10px] tracking-[1.5px] text-clay">
                  [{s.type}]
                </span>
                {s.fileName}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-6 font-mono">
            ID: {id} · {new Date(createdAt).toLocaleString("da-DK")}
          </p>
        </div>
      </section>
    </main>
  );
}

// ─── Helpers ──────────────────────────────────────

function ScoreBadge({ total }: { total: number }) {
  const tone =
    total >= 75 ? "text-clay" : total >= 60 ? "text-ink" : total >= 45 ? "text-warning" : "text-oxblood";
  return (
    <div className="border-l-2 border-hairline pl-6">
      <div className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted mb-1">
        Samlet score
      </div>
      <div className={`font-heading text-5xl ${tone} tabular-nums`}>
        {total}
        <span className="text-2xl text-muted ml-1">/100</span>
      </div>
    </div>
  );
}

function Dim({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted mb-1.5">
        {label}
      </div>
      <div className="font-heading text-2xl text-ink tabular-nums">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-5 border-r last:border-r-0 border-b sm:border-b-0 border-hairline">
      <div className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted mb-1.5">
        {label}
      </div>
      <div className="font-heading text-2xl text-ink leading-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-hairline last:border-b-0 text-sm">
      <span className="font-mono text-[11px] tracking-[1.5px] uppercase text-muted">
        {label}
      </span>
      <span className="font-serif-body text-ink tabular-nums text-right">
        {value}
      </span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left font-mono text-[10px] tracking-[1.5px] uppercase text-muted px-4 py-3">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 font-serif-body text-ink">{children}</td>;
}

function RiskRow({ risk }: { risk: RiskFlag }) {
  const tone =
    risk.level === "high"
      ? "border-oxblood/40 bg-oxblood/5"
      : risk.level === "medium"
        ? "border-warning/40 bg-warning/5"
        : "border-hairline bg-paper";
  const label =
    risk.level === "high"
      ? "Høj"
      : risk.level === "medium"
        ? "Middel"
        : "Lav";
  return (
    <li className={`border ${tone} px-5 py-4`}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <span className="font-mono text-[10px] tracking-[1.5px] uppercase text-clay font-semibold">
          {risk.category}
        </span>
        <span className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted">
          {label} risiko
        </span>
      </div>
      <p className="font-serif-body text-base text-ink leading-relaxed">
        {risk.message}
      </p>
    </li>
  );
}

// ─── Strategi-specifikke sektioner ───────────────

function DriftSection({ a }: { a: DriftAnalysis }) {
  return (
    <>
      <div className="border border-hairline bg-paper grid grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="Cap rate" value={fmtPct(a.capRate)} />
        <Stat label="Cash-on-cash år 1" value={fmtPct(a.cashOnCashYear1)} />
        <Stat label="10-års IRR" value={fmtPct(a.irr10Year)} />
        <Stat label="Break-even belægning" value={fmtPct(a.breakEvenOccupancy)} />
      </div>
      <div className="border border-hairline bg-paper grid grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="Udbudspris" value={fmtKr(a.purchasePrice)} />
        <Stat label="Årlig leje" value={fmtKr(a.annualRent)} />
        <Stat label="Driftsudgifter" value={fmtKr(a.operatingCosts)} />
        <Stat label="NOI" value={fmtKr(a.netOperatingIncome)} />
      </div>
      <h3 className="font-heading text-xl text-ink mb-3">10-årig cashflow</h3>
      <div className="border border-hairline bg-paper overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-hairline">
            <tr>
              <Th>År</Th>
              <Th>Leje</Th>
              <Th>Drift</Th>
              <Th>Lån</Th>
              <Th>Cashflow</Th>
              <Th>Akkumuleret</Th>
            </tr>
          </thead>
          <tbody>
            {a.tenYearCashflow.map((c) => (
              <tr key={c.year} className="border-b border-hairline last:border-b-0">
                <Td>{c.year}</Td>
                <Td>{fmtKr(c.rent)}</Td>
                <Td>{fmtKr(c.costs)}</Td>
                <Td>{fmtKr(c.debtService)}</Td>
                <Td>{fmtKr(c.netCashflow)}</Td>
                <Td>{fmtKr(c.cumulative)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RenoveringSection({ a }: { a: RenoveringAnalysis }) {
  return (
    <>
      <div className="border border-hairline bg-paper grid grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="Margin" value={fmtPct(a.marginPct)} />
        <Stat label="Annualiseret afkast" value={fmtPct(a.annualizedReturn)} />
        <Stat label="Netto-fortjeneste" value={fmtKr(a.netProfit)} />
        <Stat label="Holdetid" value={`${a.holdingMonths} mdr`} />
      </div>
      <div className="border border-hairline bg-paper">
        <DetailRow label="Udbudspris" value={fmtKr(a.purchasePrice)} />
        <DetailRow label="Estimeret renoverings-omkostning" value={fmtKr(a.estimatedRenoCost)} />
        <DetailRow label="Estimeret salgspris" value={fmtKr(a.estimatedSalePrice)} />
        <DetailRow label="Finansieringsomkostninger" value={fmtKr(a.financingCosts)} />
        <DetailRow label="Transaktionsomkostninger" value={fmtKr(a.transactionCosts)} />
        <DetailRow label="Total investering" value={fmtKr(a.totalInvestment)} />
        <DetailRow label="Brutto-fortjeneste" value={fmtKr(a.grossProfit)} />
        <DetailRow label="Break-even salgspris" value={fmtKr(a.breakEvenSalePrice)} />
      </div>
    </>
  );
}

function FinancingSection({ f }: { f: FinancingResult }) {
  const scoreTone =
    f.bankableScore === "stærk"
      ? "text-sage"
      : f.bankableScore === "ok"
        ? "text-ink"
        : f.bankableScore === "stram"
          ? "text-warning"
          : "text-oxblood";
  const scoreLabel =
    f.bankableScore === "stærk"
      ? "Stærk case"
      : f.bankableScore === "ok"
        ? "OK"
        : f.bankableScore === "stram"
          ? "Stram"
          : "Kritisk";
  return (
    <>
      <div className="border border-hairline bg-paper grid grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="Total lån" value={fmtKr(f.totalLoan)} />
        <Stat label="Udbetaling" value={fmtKr(f.downPayment)} />
        <Stat label="LTV" value={`${f.ltv.toFixed(0)} %`} />
        <Stat
          label="Bank-vurdering"
          value={scoreLabel}
        />
      </div>
      <div className="border border-hairline bg-paper grid grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="Månedlig ydelse" value={fmtKr(f.monthlyPayment)} />
        <Stat label="Årlig ydelse" value={fmtKr(f.yearlyDebtService)} />
        <Stat label="Rente år 1" value={fmtKr(f.interestYearOne)} />
        <Stat label="Afdrag år 1" value={fmtKr(f.principalYearOne)} />
      </div>
      {f.debtServiceCoverageRatio !== null && (
        <div className="border border-hairline bg-cream/40 p-5 mb-6">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <div>
              <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mb-1">
                Gældsservice-grad (DSCR)
              </div>
              <div className={`font-heading text-3xl tabular-nums ${scoreTone}`}>
                {f.debtServiceCoverageRatio.toFixed(2)}×
              </div>
            </div>
            <div className="text-xs text-graphite font-serif-body max-w-md">
              Driftens overskud (NOI) divideret med årlig ydelse. Bankerne
              ønsker typisk minimum <strong>1,20×</strong> for udlejnings-
              ejendomme. Under 1,0× betyder driften ikke kan dække ydelsen.
            </div>
          </div>
        </div>
      )}
      {f.bankableNotes.length > 0 && (
        <ul className="space-y-2">
          {f.bankableNotes.map((n, i) => (
            <li
              key={i}
              className="border border-hairline bg-paper px-5 py-3 text-sm font-serif-body text-ink leading-relaxed pl-5 border-l-2 border-l-clay/40"
            >
              {n}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PrivatSection({
  a,
  city,
  municipality,
}: {
  a: PrivatAnalysis;
  city: string | null;
  municipality: string | null;
}) {
  const place = municipality ?? city ?? "kommunen";
  return (
    <>
      {/* Top-tal: pris vs. marked */}
      <div className="border border-hairline bg-paper grid grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="Pris pr. m²" value={fmtKr(a.pricePerSqm)} />
        <Stat
          label={`Marked (${place})`}
          value={
            a.avgSqmPriceMunicipality !== null
              ? fmtKr(a.avgSqmPriceMunicipality)
              : "—"
          }
        />
        <Stat
          label="Over/under marked"
          value={
            a.avgSqmPriceMunicipality !== null
              ? `${a.premiumVsMarket >= 0 ? "+" : ""}${a.premiumVsMarket.toFixed(1)} %`
              : "—"
          }
        />
        <Stat label="Bolig-areal" value={fmtNum(a.area, " m²")} />
      </div>

      {/* Stand-vurdering */}
      <h3 className="font-heading text-xl text-ink mb-3 mt-8">Stand pr. rum</h3>
      {a.rooms.length === 0 ? (
        <div className="border border-dashed border-hairline bg-bone p-5 text-sm text-graphite font-serif-body">
          Ingen billeder uploadet — eller billed-analyse kunne ikke køres.
          Upload billeder af køkken, bad, gulv, vinduer, facade osv. for at få
          konkrete forhandlings-argumenter.
        </div>
      ) : (
        <div className="border border-hairline bg-paper divide-y divide-hairline">
          {a.rooms.map((r, i) => (
            <RoomRow key={i} room={r} />
          ))}
        </div>
      )}

      {/* Forhandlings-anbefaling */}
      <div className="mt-8 border border-clay/40 bg-clay/5 p-6">
        <div className="font-mono text-[10px] tracking-[2px] uppercase text-clay font-semibold mb-3">
          — Anbefalet bud
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted mb-1">
              Udbudspris
            </div>
            <div className="font-heading text-2xl text-ink tabular-nums">
              {fmtKr(a.purchasePrice)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted mb-1">
              Foreslået startbud
            </div>
            <div className="font-heading text-3xl text-clay tabular-nums">
              {fmtKr(a.suggestedOffer)}
            </div>
            <div className="text-xs text-graphite mt-1">
              {(
                ((a.suggestedOffer - a.purchasePrice) / a.purchasePrice) *
                100
              ).toFixed(1)}{" "}
              % under udbudspris
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted mb-1">
              Max anbefalet
            </div>
            <div className="font-heading text-2xl text-ink tabular-nums">
              {fmtKr(a.maxRecommendedPrice)}
            </div>
          </div>
        </div>
        {a.totalRenovationEstimate > 0 && (
          <div className="mt-5 pt-5 border-t border-clay/30 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="text-muted">Renoverings-estimat: </span>
              <span className="font-mono tabular-nums text-ink">
                {fmtKr(a.totalRenovationEstimate)}
              </span>
            </div>
            <div>
              <span className="text-muted">Total efter reno: </span>
              <span className="font-mono tabular-nums text-ink">
                {fmtKr(a.totalCostIncludingReno)}
              </span>
            </div>
            <div>
              <span className="text-muted">Effektiv m²-pris: </span>
              <span className="font-mono tabular-nums text-ink">
                {fmtKr(a.effectiveSqmPriceAfterReno)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Forhandlings-håndtag */}
      <h3 className="font-heading text-xl text-ink mb-3 mt-10">
        Forhandlings-håndtag
      </h3>
      <ul className="space-y-3">
        {a.negotiationLevers.map((lever, i) => (
          <NegotiationRow key={i} lever={lever} />
        ))}
      </ul>
    </>
  );
}

function RoomRow({ room }: { room: RoomCondition }) {
  const toneClass =
    room.condition === "kritisk"
      ? "text-oxblood"
      : room.condition === "slidt"
        ? "text-warning"
        : room.condition === "ok"
          ? "text-graphite"
          : "text-clay";
  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
        <div>
          <span className="font-heading text-lg text-ink mr-3">
            {room.room}
          </span>
          <span
            className={`font-mono text-[10px] tracking-[2px] uppercase font-semibold ${toneClass}`}
          >
            {room.condition === "ny"
              ? "Ny"
              : room.condition === "god"
                ? "God"
                : room.condition === "ok"
                  ? "OK"
                  : room.condition === "slidt"
                    ? "Slidt"
                    : "Kritisk"}
          </span>
          {room.estimatedAge && (
            <span className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted ml-3">
              {room.estimatedAge}
            </span>
          )}
        </div>
        {room.renovationCostEstimate !== null &&
          room.renovationCostEstimate > 0 && (
            <span className="font-mono text-sm text-ink tabular-nums">
              Reno: {fmtKr(room.renovationCostEstimate)}
            </span>
          )}
      </div>
      {room.observations.length > 0 && (
        <ul className="text-sm text-graphite font-serif-body space-y-1 mt-1">
          {room.observations.map((o, i) => (
            <li key={i} className="pl-4 border-l-2 border-clay/30">
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NegotiationRow({ lever }: { lever: NegotiationLever }) {
  return (
    <li className="border border-hairline bg-paper p-5">
      <div className="flex items-baseline justify-between gap-3 mb-2 flex-wrap">
        <div>
          <span className="font-mono text-[10px] tracking-[2px] uppercase text-clay font-semibold mr-3">
            {lever.category}
          </span>
          <span className="font-heading text-base text-ink">{lever.title}</span>
        </div>
        {lever.potentialDiscount !== null && lever.potentialDiscount > 0 && (
          <span className="font-mono text-sm text-clay tabular-nums whitespace-nowrap">
            ↓ {fmtKr(lever.potentialDiscount)}
          </span>
        )}
      </div>
      <p className="font-serif-body text-sm text-graphite leading-relaxed">
        {lever.argument}
      </p>
    </li>
  );
}

function VaerdistigningSection({ a }: { a: VaerdistigningAnalysis }) {
  return (
    <>
      <div className="border border-hairline bg-paper grid grid-cols-2 md:grid-cols-4 mb-6">
        <Stat label="IRR" value={fmtPct(a.irr)} />
        <Stat label="Forventet vækst p.a." value={fmtPct(a.expectedAreaGrowthPct)} />
        <Stat label="Holdetid" value={`${a.holdYears} år`} />
        <Stat label="Exit-multipel" value={`${a.exitMultiple.toFixed(2)}×`} />
      </div>
      <div className="border border-hairline bg-paper">
        <DetailRow label="Udbudspris" value={fmtKr(a.purchasePrice)} />
        <DetailRow label="Forventet exit-værdi" value={fmtKr(a.projectedExitValue)} />
        <DetailRow label="Kapitalgevinst" value={fmtKr(a.capitalGain)} />
        <DetailRow label="Total husleje modtaget" value={fmtKr(a.totalRentReceived)} />
        <DetailRow label="Total afdrag" value={fmtKr(a.totalDebtPaidOff)} />
        <DetailRow label="Total afkast" value={fmtKr(a.totalReturn)} />
      </div>
    </>
  );
}
