// Persistent store for evalueringer via Vercel Blob.
//
// Hver evaluering gemmes som JSON-fil under prefix "evals/" så den
// overlever Vercel function cold starts og restarts.
//
// I development uden BLOB_READ_WRITE_TOKEN falder vi tilbage til en
// process-global Map (data tabes ved restart men det er OK lokalt).

import { put, head } from "@vercel/blob";
import type { EvaluationResult } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __evalMemStore: Map<string, EvaluationResult> | undefined;
}
const memStore: Map<string, EvaluationResult> =
  globalThis.__evalMemStore ?? new Map();
if (!globalThis.__evalMemStore) globalThis.__evalMemStore = memStore;

const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function saveEvaluation(result: EvaluationResult): Promise<void> {
  // Altid gem i memory for hurtig læs umiddelbart efter
  memStore.set(result.id, result);

  if (!HAS_BLOB) return;

  try {
    await put(`evals/${result.id}.json`, JSON.stringify(result), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (e) {
    console.error("[store] blob save fejlede:", e);
  }
}

export async function getEvaluation(
  id: string,
): Promise<EvaluationResult | null> {
  // Tjek memory først (hurtig sti)
  const cached = memStore.get(id);
  if (cached) return cached;

  if (!HAS_BLOB) return null;

  try {
    const meta = await head(`evals/${id}.json`, {
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    if (!meta?.url) return null;
    const res = await fetch(meta.url);
    if (!res.ok) return null;
    const data = (await res.json()) as EvaluationResult;
    memStore.set(id, data);
    return data;
  } catch {
    return null;
  }
}

export function makeId(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  ).toLowerCase();
}
