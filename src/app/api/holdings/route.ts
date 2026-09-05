import { loadPortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const result = await loadPortfolio();
  const status = result.ok || result.error === "missing_keys" ? 200 : 502;
  return Response.json(result, { status });
}
