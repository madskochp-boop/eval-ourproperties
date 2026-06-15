"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import {
  type DocType,
  DOC_TYPE_LABELS,
  DOC_TYPE_ORDER,
  detectDocType,
} from "@/lib/doc-types";

type Strategy = "drift" | "renovering" | "vaerdistigning" | "privat";
type InputMode = "file" | "url";

interface TaggedFile {
  file: File;
  docType: DocType;
}

const STRATEGIES: Array<{
  id: Strategy;
  label: string;
  description: string;
  group: "investering" | "privat";
}> = [
  {
    id: "drift",
    label: "Høj afkast i drift",
    description:
      "10-årig cashflow med fokus på løbende afkast, NPI-vækst og lejer-stabilitet. Konservativ.",
    group: "investering",
  },
  {
    id: "renovering",
    label: "Renoveringscase til flipping",
    description:
      "Køb under markedspris, renover og videresælg. 18-36 mdr horisont. Marginer + tids-risiko.",
    group: "investering",
  },
  {
    id: "vaerdistigning",
    label: "Værdistigning over tid",
    description:
      "5-10 års hold med fokus på område-vækst, m²-prisudvikling og exit-multipel.",
    group: "investering",
  },
  {
    id: "privat",
    label: "Privat bolig — skal jeg købe?",
    description:
      "Sammenligning af m²-pris vs. kommunen, billed-baseret stand-vurdering og konkrete forhandlingsråd.",
    group: "privat",
  },
];

export function EvaluatorForm() {
  const [strategy, setStrategy] = useState<Strategy>("drift");
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [taggedFiles, setTaggedFiles] = useState<TaggedFile[]>([]);
  const [url, setUrl] = useState("");
  const [askingPriceInput, setAskingPriceInput] = useState("");
  // Finansierings-input
  const [showFinancing, setShowFinancing] = useState(false);
  const [downPaymentPct, setDownPaymentPct] = useState("20");
  const [realkreditRate, setRealkreditRate] = useState("5.25");
  const [realkreditType, setRealkreditType] = useState<"fast" | "variabel" | "f5">("fast");
  const [realkreditAfdragsfri, setRealkreditAfdragsfri] = useState("0");
  const [bankLoanKr, setBankLoanKr] = useState("");
  const [bankLoanRate, setBankLoanRate] = useState("7.5");
  const [familyLoanKr, setFamilyLoanKr] = useState("");
  const [familyLoanRate, setFamilyLoanRate] = useState("1.5");
  const [bankName, setBankName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseNum(s: string): number | null {
    if (!s.trim()) return null;
    const n = parseFloat(s.replace(/[^0-9.,]/g, "").replace(",", "."));
    return isNaN(n) ? null : n;
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (!fl) return;
    const tagged = Array.from(fl).map((file) => ({
      file,
      docType: detectDocType(file.name),
    }));
    setTaggedFiles(tagged);
    setError(null);
  }

  function setDocTypeForFile(idx: number, docType: DocType) {
    setTaggedFiles((prev) =>
      prev.map((tf, i) => (i === idx ? { ...tf, docType } : tf)),
    );
  }

  const files = taggedFiles.map((t) => t.file);

  async function start() {
    if (inputMode === "file" && files.length === 0) {
      setError("Vælg mindst én fil at uploade.");
      return;
    }
    if (inputMode === "url" && !url.trim()) {
      setError("Indtast et link til salgsopstillingen.");
      return;
    }

    // Tjek fil-størrelser: Vercel Hobby har 4.5 MB body limit på serverless
    // functions. Hvis nogen fil er > 4 MB anbefaler vi at bruge URL eller
    // mindre fil-set.
    if (inputMode === "file") {
      const totalMb =
        files.reduce((s, f) => s + f.size, 0) / 1024 / 1024;
      if (totalMb > 100) {
        setError(
          `Filerne fylder ${totalMb.toFixed(0)} MB. Max er 100 MB samlet. Slet de største filer eller upload separat.`,
        );
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      let res: Response;

      const askingPriceOverride = askingPriceInput
        ? parseFloat(askingPriceInput.replace(/[^0-9.,]/g, "").replace(",", "."))
        : null;

      const financing = showFinancing
        ? {
            downPaymentKr: null,
            downPaymentPct: parseNum(downPaymentPct),
            realkreditPct: null,
            realkreditRate: parseNum(realkreditRate),
            realkreditType,
            realkreditAfdragsfri: parseNum(realkreditAfdragsfri),
            bankLoanKr: parseNum(bankLoanKr),
            bankLoanRate: parseNum(bankLoanRate),
            familyLoanKr: parseNum(familyLoanKr),
            familyLoanRate: parseNum(familyLoanRate),
            bankName: bankName.trim() || null,
            notes: null,
          }
        : null;

      if (inputMode === "file") {
        // Upload alle filer til Vercel Blob via client-side direct upload.
        // Omgår Vercel's 4.5 MB body-limit på serverless functions.
        const blobs: Array<{
          url: string;
          name: string;
          size: number;
          docType: DocType;
        }> = [];
        for (const tf of taggedFiles) {
          const blob = await upload(
            `uploads/${Date.now()}-${tf.file.name}`,
            tf.file,
            {
              access: "public",
              handleUploadUrl: "/api/upload",
            },
          );
          blobs.push({
            url: blob.url,
            name: tf.file.name,
            size: tf.file.size,
            docType: tf.docType,
          });
        }

        res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            strategy,
            blobs,
            askingPriceOverride,
            financing,
          }),
        });
      } else {
        res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy, url, askingPriceOverride, financing }),
        });
      }

      // Vis konkret HTTP-fejl hvis muligt
      if (res.status === 413) {
        setError(
          "Filen er for stor til serveren (413). Prøv en mindre zip eller upload kun salgsopstillingen som PDF.",
        );
        return;
      }
      if (res.status === 504) {
        setError(
          "Behandlingen tog for lang tid (504 timeout). Prøv en mindre zip — eller upload kun salgsopstillingen som PDF.",
        );
        return;
      }

      const text = await res.text();
      let data: { id?: string; error?: string } = {};
      try {
        data = JSON.parse(text);
      } catch {
        // Ikke JSON — sandsynligvis HTML-fejlside fra Vercel
        setError(
          `Serveren returnerede ikke JSON (HTTP ${res.status}). ${text.slice(0, 200)}`,
        );
        return;
      }

      if (!res.ok) {
        setError(data.error ?? `Kunne ikke starte evaluering (HTTP ${res.status}).`);
        return;
      }

      if (!data.id) {
        setError("Serveren returnerede uventet svar (intet ID).");
        return;
      }

      window.location.href = `/r/${data.id}`;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Ukendt netværksfejl";
      setError(`Netværksfejl: ${msg}. Prøv igen.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border border-hairline bg-paper">
      {/* Strategi-valg */}
      <div className="p-6 sm:p-8 border-b border-hairline">
        <div className="font-mono text-[10px] tracking-[2px] uppercase text-clay font-semibold mb-5">
          1 · Hvilken strategi?
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {STRATEGIES.map((s) => (
            <StrategyCard
              key={s.id}
              selected={strategy === s.id}
              onClick={() => setStrategy(s.id)}
              label={s.label}
              description={s.description}
              isPrivat={s.group === "privat"}
            />
          ))}
        </div>
      </div>

      {/* Input-mode */}
      <div className="p-6 sm:p-8 border-b border-hairline">
        <div className="font-mono text-[10px] tracking-[2px] uppercase text-clay font-semibold mb-5">
          2 · Materiale
        </div>

        {/* Tab-toggle */}
        <div className="flex gap-0 mb-5 border border-hairline w-fit">
          <ModeButton
            active={inputMode === "file"}
            onClick={() => setInputMode("file")}
          >
            Upload fil(er)
          </ModeButton>
          <ModeButton
            active={inputMode === "url"}
            onClick={() => setInputMode("url")}
          >
            Link til salgsopstilling
          </ModeButton>
        </div>

        {strategy === "privat" && (
          <div className="mb-4 border border-clay/30 bg-clay/5 px-4 py-3 text-sm font-serif-body text-graphite">
            <strong className="text-ink">Tip:</strong> Upload også billeder
            (jpg/png) af køkken, bad, gulv, vinduer, facade og tag. Vi kører
            billedgenkendelse på dem og giver konkrete forhandlings-argumenter
            baseret på stand.
          </div>
        )}
        {inputMode === "file" ? (
          <FileDropzone
            taggedFiles={taggedFiles}
            onChange={onFileChange}
            onTagChange={setDocTypeForFile}
            allowImages={strategy === "privat"}
          />
        ) : (
          <input
            type="url"
            placeholder="https://www.boligsiden.dk/adresse/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full border border-hairline px-4 py-3 text-[15px] font-serif-body"
          />
        )}
      </div>

      {/* Valgfri: udbudspris hvis ikke i materialet */}
      <div className="px-6 sm:px-8 pt-2 pb-6 border-b border-hairline">
        <label className="block font-mono text-[10px] tracking-[2px] uppercase text-muted mb-2">
          Udbudspris (valgfri)
        </label>
        <input
          type="text"
          value={askingPriceInput}
          onChange={(e) => setAskingPriceInput(e.target.value)}
          placeholder="fx 12.500.000"
          className="w-full max-w-sm border border-hairline px-4 py-3 text-[15px] font-serif-body bg-cream"
          inputMode="numeric"
        />
        <p className="font-serif-body text-xs text-muted mt-2 max-w-prose">
          Hvis prisen ikke står i materialet (fx ved datarum uden
          salgsopstilling), indtast den her så vi kan lave en cashflow.
        </p>
      </div>

      {/* Finansiering */}
      <div className="px-6 sm:px-8 py-6 border-b border-hairline">
        <button
          type="button"
          onClick={() => setShowFinancing(!showFinancing)}
          className="w-full flex items-center justify-between text-left cursor-pointer hover:bg-cream/40 -mx-2 px-2 py-1 transition-colors"
        >
          <div>
            <div className="font-mono text-[10px] tracking-[2px] uppercase text-clay font-semibold mb-1">
              3 · Finansiering
            </div>
            <p className="font-serif-body text-sm text-graphite">
              Hvordan finansierer du købet?{" "}
              {!showFinancing && (
                <span className="text-muted">
                  (klik for at angive — ellers bruges 20% udbetaling, 5,25% realkredit)
                </span>
              )}
            </p>
          </div>
          <span className="font-mono text-[11px] tracking-[1.5px] uppercase text-clay">
            {showFinancing ? "Skjul ▴" : "Vis ▾"}
          </span>
        </button>

        {showFinancing && (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FinancingInput
                label="Udbetaling (% af pris)"
                value={downPaymentPct}
                onChange={setDownPaymentPct}
                placeholder="20"
                suffix="%"
                hint="Realkredit dækker op til 80% — resten skal du selv lægge eller låne dyrt."
              />
              <FinancingInput
                label="Realkredit-rente"
                value={realkreditRate}
                onChange={setRealkreditRate}
                placeholder="5.25"
                suffix="%"
                hint="Q2 2026 fast 30-årig ligger på ca. 5,25%."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-mono text-[10px] tracking-[2px] uppercase text-muted mb-2">
                  Lånetype
                </label>
                <select
                  value={realkreditType}
                  onChange={(e) =>
                    setRealkreditType(
                      e.target.value as "fast" | "variabel" | "f5",
                    )
                  }
                  className="w-full bg-cream border border-hairline px-4 py-3 text-[15px] font-serif-body text-ink focus:outline-none focus:border-clay"
                >
                  <option value="fast">Fast rente (30 år)</option>
                  <option value="variabel">Variabel rente</option>
                  <option value="f5">F5 / kort rente</option>
                </select>
              </div>
              <FinancingInput
                label="Afdragsfrihed (år)"
                value={realkreditAfdragsfri}
                onChange={setRealkreditAfdragsfri}
                placeholder="0"
                suffix="år"
                hint="Maks 10 år. Øger cashflow nu, men ydelse stiger efter."
              />
            </div>

            <div className="border-t border-hairline pt-5">
              <div className="font-mono text-[10px] tracking-[2px] uppercase text-clay font-semibold mb-3">
                — Supplerende lån (valgfri)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FinancingInput
                  label="Banklån (kr)"
                  value={bankLoanKr}
                  onChange={setBankLoanKr}
                  placeholder="fx 500.000"
                  hint="Bruges når LTV over 80%."
                />
                <FinancingInput
                  label="Banklåns-rente"
                  value={bankLoanRate}
                  onChange={setBankLoanRate}
                  placeholder="7.5"
                  suffix="%"
                />
                <FinancingInput
                  label="Anfordringslån fra holding/familie (kr)"
                  value={familyLoanKr}
                  onChange={setFamilyLoanKr}
                  placeholder="fx 1.000.000"
                  hint="Typisk lav rente — reducerer realkreditbehov."
                />
                <FinancingInput
                  label="Anfordringslåns-rente"
                  value={familyLoanRate}
                  onChange={setFamilyLoanRate}
                  placeholder="1.5"
                  suffix="%"
                />
              </div>
            </div>

            <div className="border-t border-hairline pt-5">
              <FinancingInput
                label="Bank"
                value={bankName}
                onChange={setBankName}
                placeholder="fx Vestjysk Bank, Jyske, Realkredit Danmark"
                hint="Vises i rapporten."
                fullWidth
              />
            </div>
          </div>
        )}
      </div>

      {/* Start */}
      <div className="p-6 sm:p-8 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-xs text-muted font-serif-body max-w-md">
          Evalueringen tager 30-60 sekunder. Du modtager HTML-rapport, Excel
          og PowerPoint klar til download.
        </p>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="bg-ink text-cream px-7 py-4 font-sans text-[13px] tracking-wide uppercase font-medium hover:bg-graphite transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {busy ? "Behandler…" : "Start evaluering →"}
        </button>
      </div>

      {error && (
        <div className="px-6 sm:px-8 pb-6 -mt-2">
          <div className="border border-oxblood/40 bg-oxblood/5 text-oxblood px-4 py-3 text-sm">
            {error}
          </div>
        </div>
      )}
    </div>
  );
}

function StrategyCard({
  selected,
  onClick,
  label,
  description,
  isPrivat,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description: string;
  isPrivat?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-5 border transition-colors cursor-pointer ${
        selected
          ? "border-ink bg-cream"
          : "border-hairline bg-paper hover:border-clay"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 inline-flex items-center justify-center w-4 h-4 rounded-full border flex-shrink-0 ${
            selected ? "border-ink" : "border-hairline"
          }`}
        >
          {selected && <span className="w-2 h-2 rounded-full bg-ink" />}
        </span>
        <div className="flex-1">
          <div className="flex items-baseline gap-2 mb-1.5">
            <div className="font-heading text-lg text-ink leading-snug">
              {label}
            </div>
            {isPrivat && (
              <span className="font-mono text-[9px] tracking-[1.5px] uppercase text-clay font-semibold">
                Ny
              </span>
            )}
          </div>
          <div className="text-xs text-graphite leading-relaxed font-serif-body">
            {description}
          </div>
        </div>
      </div>
    </button>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2.5 font-mono text-[11px] tracking-[1.5px] uppercase border-r border-hairline last:border-r-0 cursor-pointer transition-colors ${
        active
          ? "bg-ink text-cream"
          : "bg-paper text-graphite hover:bg-cream/40"
      }`}
    >
      {children}
    </button>
  );
}

function FinancingInput({
  label,
  value,
  onChange,
  placeholder,
  suffix,
  hint,
  fullWidth,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  hint?: string;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? "" : ""}>
      <label className="block font-mono text-[10px] tracking-[2px] uppercase text-muted mb-2">
        {label}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-cream border border-hairline px-4 py-3 text-[15px] font-serif-body text-ink placeholder:text-muted/60 focus:outline-none focus:border-clay pr-12"
          inputMode={suffix === "%" || suffix === "år" ? "decimal" : "text"}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[11px] tracking-[1.5px] uppercase text-muted">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted mt-1.5 font-serif-body">{hint}</p>}
    </div>
  );
}

function FileDropzone({
  taggedFiles,
  onChange,
  onTagChange,
  allowImages = false,
}: {
  taggedFiles: TaggedFile[];
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onTagChange: (idx: number, docType: DocType) => void;
  allowImages?: boolean;
}) {
  const accept = allowImages
    ? ".pdf,.zip,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif"
    : ".pdf,.zip,.xlsx,.xls,.csv";

  if (taggedFiles.length === 0) {
    return (
      <label className="block border border-dashed border-hairline hover:border-clay transition-colors p-8 sm:p-12 cursor-pointer text-center bg-cream/40">
        <input
          type="file"
          multiple
          accept={accept}
          onChange={onChange}
          className="sr-only"
        />
        <div className="font-mono text-[11px] tracking-[2px] uppercase text-clay mb-3">
          — Træk filer hertil eller klik
        </div>
        <p className="font-serif-body text-graphite text-sm">
          {allowImages
            ? "Salgsopstilling (PDF), tilstandsrapport, BBR, og billeder (jpg/png) af rum."
            : "Salgsopstilling (PDF), datarum (zip), Excel-beregning, BBR-udskrift."}
          <br />
          Op til 100 MB samlet.
        </p>
      </label>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="border border-hairline bg-paper divide-y divide-hairline">
        {taggedFiles.map((tf, i) => (
          <li
            key={i}
            className="flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-serif-body text-ink truncate">
                {tf.file.name}
              </div>
              <div className="font-mono text-[10px] tracking-[1.5px] uppercase text-muted">
                {(tf.file.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
            <select
              value={tf.docType}
              onChange={(e) => onTagChange(i, e.target.value as DocType)}
              className="bg-cream border border-hairline px-3 py-2 text-[13px] font-serif-body text-ink focus:outline-none focus:border-clay min-w-[170px]"
            >
              {DOC_TYPE_ORDER.map((dt) => (
                <option key={dt} value={dt}>
                  {DOC_TYPE_LABELS[dt]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <label className="block border border-dashed border-hairline hover:border-clay transition-colors px-4 py-3 cursor-pointer text-center bg-cream/40 text-clay font-mono text-[11px] tracking-[1.5px] uppercase">
        <input
          type="file"
          multiple
          accept={accept}
          onChange={onChange}
          className="sr-only"
        />
        + Skift / tilføj flere filer
      </label>
    </div>
  );
}
