# Payments (Razorpay)

## Where the keys go

**Vercel — not `.env`, and never with a `VITE_` prefix.**

Vite inlines every `VITE_*` variable into the browser bundle. A gateway secret
with that prefix would be published to every visitor who opens DevTools. The
four variables below are read only inside `/api/payments/*`, which runs as a
Vercel serverless function on the server.

Vercel dashboard → Project → Settings → Environment Variables (Production +
Preview):

| Variable | Value | Why the server needs it |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_live_…` | Creates orders; also returned to the browser, which is fine — it's the publishable half |
| `RAZORPAY_KEY_SECRET` | from Razorpay → Settings → API Keys | Signs and verifies. **Never leaves the server** |
| `RAZORPAY_WEBHOOK_SECRET` | you choose it when creating the webhook | Verifies that a webhook really came from Razorpay |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` | The only identity the database lets mark a plan paid |

`SUPABASE_URL` is optional — the functions fall back to `VITE_SUPABASE_URL`,
which is already set.

For local testing with `vercel dev`, put the same names (no `VITE_` prefix) in
`.env`, which is already gitignored.

**Until all four are set, nothing changes.** `/api/payments/config` reports
`enabled: false` and every booking flow keeps collecting money outside the app
exactly as it does today. That's deliberate: deploying this code cannot break a
live booking.

## Webhook

Razorpay dashboard → Settings → Webhooks → Add:

- URL: `https://www.getfitved.com/api/payments/webhook`
- Secret: the same value as `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured`, `payment.failed`, `order.paid`

The webhook is the safety net. If a customer pays and then closes the tab or
loses signal, the browser never confirms — but Razorpay still tells us
server-to-server, and the subscription activates anyway.

## How a payment becomes a subscription

1. Customer books → a `plans` row is created with `payment_status = 'pending'`.
2. `POST /api/payments/create-order` reads the price **from `plan_options` on
   the server** (never from the request, and never from `plans.amount`, which
   the browser could rewrite), creates a Razorpay order, and binds the order id
   to the plan.
3. Checkout opens. Razorpay returns a signature over `order_id|payment_id`.
4. `POST /api/payments/verify` recomputes that HMAC with the secret, compares it
   in constant time, then **re-reads the payment from Razorpay's API** to
   confirm it was captured for the right amount.
5. Only then does the service role set `payment_status = 'success'`.

The plan is always located by `razorpay_order_id`, never by an id the client
sent, so a payment can't be redirected onto a different subscription.

Activation is idempotent — the verify call and the webhook both route through
`activateFromOrder()`, whichever arrives first wins, and unique indexes on
`razorpay_payment_id` stop the ledger from double-counting.

## Why the database trigger matters

The app ships an anon key with open RLS. Without
`20260825120000_payment_guard.sql`, anyone could open the console and run:

```sql
update plans set payment_status = 'success' where id = '…';
```

Server-side verification is worthless if the client can just write the answer.
The trigger restricts `payment_status = 'success'` and all gateway columns to
the service role. Cash-collected plans are unaffected: they leave
`payment_status` NULL, which means "collected outside the app".

## `payment_status` values

| Value | Meaning |
|---|---|
| `NULL` | Collected outside the app (cash/UPI) — the default, and how every plan worked before the gateway |
| `pending` | A gateway payment is in flight |
| `success` | The payment service verified a Razorpay signature |
| `failed` / `cancelled` | The attempt ended without money moving |
