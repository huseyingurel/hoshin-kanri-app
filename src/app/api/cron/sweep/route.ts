/**
 * Günlük tarama uç noktası — harici cron tarafından çağrılır (in-process zamanlayıcı yok, N7).
 *
 * Kimlik: `Authorization: Bearer $CRON_SECRET`. `CRON_SECRET` tanımsızsa **kapalı başarısız**
 * olur (500) — açık kalmaz (INV-7). `proxy.ts` zaten `/api/*` yollarını çerez kapısından
 * muaf tutar, dolayısıyla yalnız bu bearer kontrolü geçerlidir.
 *
 * Örnek: curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/sweep
 */

import { runDailySweep } from "@/lib/engine/sweep";
import { logEvent } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logEvent("error", "cron.misconfigured", {});
    return Response.json({ error: "CRON_SECRET tanımlı değil" }, { status: 500 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    logEvent("warn", "cron.unauthorized", {});
    return Response.json({ error: "yetkisiz" }, { status: 401 });
  }

  try {
    const summary = await runDailySweep();
    // Kısmi hatayı yüzeye çıkar; asla yutma (INV-7).
    const status = summary.failures.length === 0 ? 200 : 500;
    return Response.json(summary, { status });
  } catch (e) {
    logEvent("error", "sweep.failed", { message: e instanceof Error ? e.message : String(e) });
    return Response.json({ error: "tarama başarısız" }, { status: 500 });
  }
}
