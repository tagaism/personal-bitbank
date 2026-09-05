import { loadPortfolio } from "@/lib/portfolio";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const result = await loadPortfolio();
  const status = result.ok ? 200 : result.error === "missing_keys" ? 400 : 502;
  return Response.json(result, { status });
}
