// Simpel in-memory store for evalueringer.
// I produktion erstattes med Vercel KV, Upstash Redis eller R2.
//
// For MVP: bare en Map på process-niveau. Hver evaluering har et unikt id og
// bliver hentbar via /api/evaluations/[id] og /r/[id].

import type { EvaluationResult } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __evalStore: Map<string, EvaluationResult> | undefined;
}

const store: Map<string, EvaluationResult> =
  globalThis.__evalStore ?? new Map();
if (!globalThis.__evalStore) globalThis.__evalStore = store;

export function saveEvaluation(result: EvaluationResult): void {
  store.set(result.id, result);
}

export function getEvaluation(id: string): EvaluationResult | null {
  return store.get(id) ?? null;
}

export function makeId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  ).toLowerCase();
}
