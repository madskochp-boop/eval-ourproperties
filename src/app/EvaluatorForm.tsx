"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";

type Strategy = "drift" | "renovering" | "vaerdistigning";
type InputMode = "file" | "url";

const STRATEGIES: Array<{ id: Strategy; label: string; description: string }> =
  [
    {
      id: "drift",
      label: "Høj afkast i drift",
      description:
        "10-årig cashflow med fokus på løbende afkast, NPI-vækst og lejer-stabilitet. Konservativ.",
    },
    {
      id: "renovering",
      label: "Renoveringscase til flipping",
      description:
        "Køb under markedspris, renover og videresælg. 18-36 mdr horisont. Marginer + tids-risiko.",
    },
    {
      id: "vaerdistigning",
      label: "Værdistigning over tid",
      description:
        "5-10 års hold med fokus på område-vækst, m²-prisudvikling og exit-multipel.",
    },
  ];

export function EvaluatorForm() {
  const [strategy, setStrategy] = useState<Strategy>("drift");
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fl = e.target.files;
    if (!fl) return;
    setFiles(Array.from(fl));
    setError(null);
  }

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

      if (inputMode === "file") {
        // Upload alle filer til Vercel Blob via client-side direct upload.
        // Omgår Vercel's 4.5 MB body-limit på serverless functions.
        const blobs: Array<{ url: string; name: string; size: number }> = [];
        for (const f of files) {
          const blob = await upload(`uploads/${Date.now()}-${f.name}`, f, {
            access: "public",
            handleUploadUrl: "/api/upload",
          });
          blobs.push({ url: blob.url, name: f.name, size: f.size });
        }

        res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy, blobs }),
        });
      } else {
        res = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ strategy, url }),
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {STRATEGIES.map((s) => (
            <StrategyCard
              key={s.id}
              selected={strategy === s.id}
              onClick={() => setStrategy(s.id)}
              label={s.label}
              description={s.description}
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

        {inputMode === "file" ? (
          <FileDropzone files={files} onChange={onFileChange} />
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
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description: string;
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
          <div className="font-heading text-lg text-ink leading-snug mb-1.5">
            {label}
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

function FileDropzone({
  files,
  onChange,
}: {
  files: File[];
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="block border border-dashed border-hairline hover:border-clay transition-colors p-8 sm:p-12 cursor-pointer text-center bg-cream/40">
      <input
        type="file"
        multiple
        accept=".pdf,.zip,.xlsx,.xls,.csv"
        onChange={onChange}
        className="sr-only"
      />
      {files.length === 0 ? (
        <>
          <div className="font-mono text-[11px] tracking-[2px] uppercase text-clay mb-3">
            — Træk filer hertil eller klik
          </div>
          <p className="font-serif-body text-graphite text-sm">
            Salgsopstilling (PDF), datarum (zip), Excel-beregning, BBR-udskrift.
            <br />
            Op til 50 MB pr. fil.
          </p>
        </>
      ) : (
        <ul className="text-left max-w-md mx-auto space-y-1">
          {files.map((f, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 text-sm font-serif-body text-ink"
            >
              <span className="truncate">{f.name}</span>
              <span className="font-mono text-xs text-muted whitespace-nowrap">
                {(f.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </li>
          ))}
          <li className="text-[11px] text-clay font-mono tracking-[1.5px] uppercase pt-2">
            Klik for at ændre
          </li>
        </ul>
      )}
    </label>
  );
}
