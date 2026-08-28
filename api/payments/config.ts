import { gatewayReady } from "../_lib/env";
import { json } from "../_lib/http";

/**
 * GET /api/payments/config → { enabled }
 *
 * Lets the booking flows ask whether to charge or to keep collecting outside
 * the app. Deliberately exposes nothing but the boolean — no key, no hint of
 * which variable is missing.
 */
export default async function handler(_req: any, res: any) {
  return json(res, 200, { enabled: gatewayReady() });
}
