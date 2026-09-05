import { loadValueHistory } from "@/lib/value-history";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const result = await loadValueHistory();
  const status =
    result.ok || result.error === "missing_keys" || result.error === "no_trades"
      ? 200
      : 502;
  return Response.json(result, { status });
}
