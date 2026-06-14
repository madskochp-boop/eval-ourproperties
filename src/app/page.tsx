import { EvaluatorForm } from "./EvaluatorForm";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="px-4 sm:px-8 lg:px-12 pt-8 pb-6 border-b border-hairline">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <a href="/" className="wordmark text-xl sm:text-2xl text-ink">
            <b>our</b>
            <i>properties</i>
          </a>
          <a
            href="https://app.ourproperties.dk"
            className="font-mono text-[11px] tracking-[1.5px] uppercase text-muted hover:text-ink"
          >
            Hovedside →
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="px-4 sm:px-8 lg:px-12 pt-14 sm:pt-20 lg:pt-28 pb-10">
        <div className="max-w-4xl mx-auto">
          <div className="font-mono text-[11px] tracking-[2.5px] uppercase text-clay font-semibold mb-5">
            — Evalueringsmaskine for ejendomsinvesteringer
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[1.02] tracking-tight text-ink">
            Er den her ejendom <em className="text-clay">en god case?</em>
          </h1>
          <p className="font-serif-body text-lg sm:text-xl text-graphite leading-relaxed max-w-2xl mt-7">
            Upload en salgsopstilling, et datarum eller dit eget Excel. Vælg
            hvilken strategi du forfølger. Få en uafhængig vurdering med
            cashflow-Excel klar til banken og en investor-pitch på
            powerpoint.
          </p>
        </div>
      </section>

      {/* Form */}
      <section className="px-4 sm:px-8 lg:px-12 pb-20">
        <div className="max-w-4xl mx-auto">
          <EvaluatorForm />
        </div>
      </section>

      {/* Hvordan virker det */}
      <section className="bg-bone border-t border-hairline px-4 sm:px-8 lg:px-12 py-16 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="font-mono text-[11px] tracking-[2.5px] uppercase text-clay font-semibold mb-3">
            — Hvordan virker det
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl leading-tight tracking-tight max-w-2xl mb-12">
            Fra rå PDF til <em className="text-clay">bank-klar case</em> på under
            et minut.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
            <Step
              n="01"
              title="Upload"
              body="Salgsopstilling som PDF, hele datarummet som zip, eller din egen Excel-beregning. Vi læser og strukturerer indholdet."
            />
            <Step
              n="02"
              title="Beriger"
              body="Vi henter BBR-data på adressen, befolkningstilvækst og indkomstniveau i kommunen samt sælgers selskabsforhold."
            />
            <Step
              n="03"
              title="Evaluerer"
              body="Strategi-specifik analyse leveres som live HTML, Excel-cashflow og PowerPoint-pitch. Klar til at sende."
            />
          </div>
        </div>
      </section>

      <footer className="px-4 sm:px-8 lg:px-12 py-10 border-t border-hairline">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-muted">
          <div>
            © {new Date().getFullYear()} Our Properties ApS · CVR 46364155
          </div>
          <div className="font-mono tracking-[1.5px] uppercase">
            eval.ourproperties.dk
          </div>
        </div>
      </footer>
    </main>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[2px] uppercase text-muted mb-3">
        {n}
      </div>
      <h3 className="font-heading text-2xl text-ink mb-3">{title}</h3>
      <p className="font-serif-body text-base text-graphite leading-relaxed">
        {body}
      </p>
    </div>
  );
}
