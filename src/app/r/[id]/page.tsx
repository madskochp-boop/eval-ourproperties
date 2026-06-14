import { notFound } from "next/navigation";
import { getEvaluation } from "@/lib/store";
import { ReportClient } from "./ReportClient";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const evalResult = getEvaluation(id);
  if (!evalResult) notFound();
  return <ReportClient evalResult={evalResult} />;
}
