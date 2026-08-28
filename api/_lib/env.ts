/**
 * Server-only configuration.
 *
 * None of these names carry the VITE_ prefix, and that is the whole point:
 * Vite inlines every VITE_* variable into the browser bundle. A gateway secret
 * with that prefix would be published to every visitor. These are read only
 * inside serverless functions, which run on Vercel and never ship to the client.
 */
export const RZP_KEY_ID = process.env.RAZORPAY_KEY_ID ?? "";
export const RZP_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET ?? "";
export const RZP_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

export const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * The gateway is optional. Until the keys are set the booking flows keep
 * working exactly as they do today (money collected outside the app), so
 * deploying this code cannot break a live booking.
 */
export function gatewayReady(): boolean {
  return !!(RZP_KEY_ID && RZP_KEY_SECRET && SUPABASE_URL && SERVICE_ROLE_KEY);
}

/** The cron and any DB-only job need Supabase, not the payment gateway. */
export function dbReady(): boolean {
  return !!(SUPABASE_URL && SERVICE_ROLE_KEY);
}

export function missingConfig(): string[] {
  const out: string[] = [];
  if (!RZP_KEY_ID) out.push("RAZORPAY_KEY_ID");
  if (!RZP_KEY_SECRET) out.push("RAZORPAY_KEY_SECRET");
  if (!SUPABASE_URL) out.push("SUPABASE_URL");
  if (!SERVICE_ROLE_KEY) out.push("SUPABASE_SERVICE_ROLE_KEY");
  return out;
}
