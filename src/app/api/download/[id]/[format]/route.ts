import { NextRequest, NextResponse } from "next/server";
import { getEvaluation } from "@/lib/store";
import { generateExcel } from "@/lib/excel-gen";
import { generatePptx } from "@/lib/pptx-gen";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await params;
  const evalResult = await getEvaluation(id);
  if (!evalResult) {
    return NextResponse.json(
      { error: "Evaluering ikke fundet (in-memory store nulstilles ved deploy)" },
      { status: 404 },
    );
  }

  try {
    if (format === "excel") {
      const buffer = await generateExcel(evalResult);
      const fileName = sanitize(evalResult.property.address ?? id) + ".xlsx";
      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }
    if (format === "pptx") {
      const buffer = await generatePptx(evalResult);
      const fileName = sanitize(evalResult.property.address ?? id) + ".pptx";
      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    }
    return NextResponse.json({ error: "Ukendt format" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ukendt fejl";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function sanitize(s: string): string {
  return s.replace(/[^\w\s.-]/g, "").replace(/\s+/g, "-").slice(0, 80);
}
