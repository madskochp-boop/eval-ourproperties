// Billed-baseret stand-vurdering via Claude vision.
//
// Vi sender op til 8 billeder fra en bolig (køkken, bad, stue, gulv,
// vinduer, facade, tag) til Claude og får tilbage en strukturert
// vurdering pr. rum/element med renoverings-estimater.

import Anthropic from "@anthropic-ai/sdk";
import type { RoomCondition } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-sonnet-4-5";
const MAX_IMAGES = 12;

const PROMPT = `Du er en erfaren ejendomsmægler og bygningssagkyndig. Disse billeder er fra en bolig der er til salg i Danmark. Vurdér standen af de elementer du kan se, og giv et realistisk renoverings-estimat pr. element (kr inkl. moms, dansk markedsniveau 2026).

Returnér KUN gyldig JSON i præcis dette format:

{
  "overallCondition": "ny" | "god" | "ok" | "slidt" | "kritisk",
  "rooms": [
    {
      "room": "Køkken" | "Badeværelse" | "Stue" | "Sovevær." | "Gulv" | "Vinduer" | "Facade" | "Tag" | "El-installation" | "Varme" | string,
      "condition": "ny" | "god" | "ok" | "slidt" | "kritisk",
      "estimatedAge": "0-5 år" | "5-15 år" | "15-30 år" | "30+ år" | "ukendt",
      "observations": string[],
      "renovationCostEstimate": number | null
    }
  ],
  "summary": string
}

Regler:
- Stand-skala:
  - "ny" = nyt eller fuldt renoveret, 0 kr renovering
  - "god" = vedligeholdt, kun kosmetisk behov, < 50.000 kr
  - "ok" = brugbart men dateret, 50-150.000 kr pr. element
  - "slidt" = trænger til snarlig renovering, 150-300.000 kr
  - "kritisk" = skal renoveres straks, 300.000+ kr
- estimatedAge = vurdering af hvornår elementet sidst blev fornyet
- observations = 1-3 KORTE punkter pr. rum (hvad ser du, materialer, slid, særlige forhold)
- renovationCostEstimate = realistisk pris i 2026-priser for at bringe til "god" stand
  - Køkken komplet: 150-400.000 kr
  - Badeværelse komplet: 120-250.000 kr
  - Nye vinduer hele boligen: 100-300.000 kr (afhænger af størrelse)
  - Nyt tag: 200-500.000 kr
  - Facade-pudsning: 80-200.000 kr
  - Slibe/lakke gulv: 30-80.000 kr
  - El-installation komplet: 80-200.000 kr
- Hvis du ikke kan se elementet på billederne, NÆVN det ikke (returnér færre rum hellere end at gætte).
- summary: 1-2 sætninger med samlet vurdering.

Vær PRÆCIS og KONSERVATIV i estimaterne — disse skal kunne bruges i forhandling.`;

interface ImageInput {
  buffer: Buffer;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  name?: string;
}

export async function analyzeImages(images: ImageInput[]): Promise<{
  overallCondition: RoomCondition["condition"];
  rooms: RoomCondition[];
  summary: string;
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY ikke sat");
  }
  if (images.length === 0) {
    return { overallCondition: "ok", rooms: [], summary: "Ingen billeder uploadet." };
  }

  const limited = images.slice(0, MAX_IMAGES);
  console.log(`[image-analysis] Analyserer ${limited.length} billeder`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55_000);

  try {
    const content: Array<
      | {
          type: "image";
          source: {
            type: "base64";
            media_type: ImageInput["mediaType"];
            data: string;
          };
        }
      | { type: "text"; text: string }
    > = limited.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType,
        data: img.buffer.toString("base64"),
      },
    }));
    content.push({ type: "text", text: PROMPT });

    const msg = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 3000,
        messages: [{ role: "user", content }],
      },
      { signal: controller.signal },
    );

    const block = msg.content[0];
    if (block.type !== "text") {
      return {
        overallCondition: "ok",
        rooms: [],
        summary: "Claude returnerede uventet svar.",
      };
    }

    const jsonMatch = block.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        overallCondition: "ok",
        rooms: [],
        summary: "Intet JSON i svar.",
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        overallCondition?: RoomCondition["condition"];
        rooms?: RoomCondition[];
        summary?: string;
      };
      console.log(
        `[image-analysis] ${parsed.rooms?.length ?? 0} rum vurderet, samlet: ${parsed.overallCondition}`,
      );
      return {
        overallCondition: parsed.overallCondition ?? "ok",
        rooms: (parsed.rooms ?? []).map((r) => ({
          ...r,
          observations: r.observations ?? [],
          estimatedAge: r.estimatedAge ?? null,
          renovationCostEstimate: r.renovationCostEstimate ?? null,
        })),
        summary: parsed.summary ?? "",
      };
    } catch (e) {
      console.error(`[image-analysis] JSON parse fejl: ${e}`);
      return {
        overallCondition: "ok",
        rooms: [],
        summary: "Kunne ikke tolke svar.",
      };
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// Hjælper til at finde media-type ud fra filnavn
export function mediaTypeFromName(name: string): ImageInput["mediaType"] | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}
