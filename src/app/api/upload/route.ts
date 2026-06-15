import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Genererer presigned tokens så klienten kan uploade direkte til Vercel Blob.
// Bruges af EvaluatorForm når en fil er > 4 MB (Vercel-grænse for serverless body).
export async function POST(req: NextRequest) {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        // Begræns til kendte file-typer og en kort tilladt sti
        if (!pathname.startsWith("uploads/")) {
          throw new Error("Sti skal starte med 'uploads/'");
        }
        return {
          allowedContentTypes: [
            "application/pdf",
            "application/zip",
            "application/x-zip-compressed",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
            "text/csv",
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "image/heic",
            "image/heif",
          ],
          maximumSizeInBytes: 200 * 1024 * 1024,
          tokenPayload: JSON.stringify({}),
        };
      },
      onUploadCompleted: async () => {
        // Ingen action nødvendig — vi henter filen direkte fra blob-URL i /api/evaluate
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload-fejl";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
