import { dbReady } from "../_lib/env.js";
import { admin } from "../_lib/db.js";
import { json } from "../_lib/http.js";

/**
 * GET /api/cron/expire — runs nightly from vercel.json "crons".
 *
 * Until now a subscription only became "completed" when somebody happened to
 * open a page that noticed it had run out: the customer's dashboard or the
 * admin overview. A customer who stopped logging in stayed stored as active
 * indefinitely, and so did their sessions.
 *
 * This closes them on a schedule instead, for offline and online alike.
 * expire_subscriptions() is idempotent, so a retry or a double-fire is safe.
 */
export default async function handler(req: any, res: any) {
  // Vercel sends the cron secret when CRON_SECRET is configured. Reject
  // anything else so the endpoint can't be driven from outside.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return json(res, 401, { error: "unauthorized" });
  }

  // Only Supabase is needed here — expiry is unrelated to the payment gateway.
  if (!dbReady()) {
    return json(res, 503, { error: "not_configured", missing: ["SUPABASE_SERVICE_ROLE_KEY"] });
  }

  const sb = admin();
  const { data, error } = await (sb as any).rpc("expire_subscriptions");
  if (error) return json(res, 500, { error: error.message });

  return json(res, 200, { status: "ok", expired: data ?? 0, ran_at: new Date().toISOString() });
}
