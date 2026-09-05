import { parseBitbankTradeCsv } from "@/lib/csv";
import { importTrades } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { ok: false, message: "Attach a bitbank 約定履歴 CSV file." },
      { status: 400 },
    );
  }

  const text = await file.text();
  try {
    const trades = parseBitbankTradeCsv(text);
    if (trades.length === 0) {
      return Response.json(
        {
          ok: false,
          message:
            "No spot trades found. Use the 約定履歴 CSV from bitbank Data → execution history.",
        },
        { status: 400 },
      );
    }
    const { imported, total } = await importTrades(trades);
    return Response.json({ ok: true, parsed: trades.length, imported, total });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV parse failed.";
    return Response.json({ ok: false, message }, { status: 400 });
  }
}
