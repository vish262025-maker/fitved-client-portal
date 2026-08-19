#!/usr/bin/env node
/**
 * Fetch Search Console performance data for the last 28 days.
 *
 * Usage:
 *   node scripts/seo/fetch-performance.mjs              # last 28 days
 *   node scripts/seo/fetch-performance.mjs 7             # last 7 days
 *   node scripts/seo/fetch-performance.mjs 90            # last 90 days
 */
import { google } from "googleapis";
import { getAuthClient, SITE, SITE_HTTPS } from "./auth.mjs";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"];

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const days = parseInt(process.argv[2] || "28", 10);
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const auth = await getAuthClient(SCOPES);
  const sc = google.searchconsole({ version: "v1", auth });

  console.log(`\n📈 Fetching Search Console data for ${SITE}`);
  console.log(`   Period: ${dateStr(start)} → ${dateStr(end)} (${days} days)\n`);

  // ── Overall summary ──────────────────────────────────────────────────
  const { data: summary } = await sc.searchanalytics.query({
    siteUrl: SITE,
    requestBody: {
      startDate: dateStr(start),
      endDate: dateStr(end),
      dimensions: [],
    },
  });

  const row = summary.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("         OVERALL SUMMARY");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Clicks:       ${row.clicks}`);
  console.log(`  Impressions:  ${row.impressions}`);
  console.log(`  CTR:          ${(row.ctr * 100).toFixed(2)}%`);
  console.log(`  Avg Position: ${row.position?.toFixed(1)}`);

  // ── Top pages ────────────────────────────────────────────────────────
  const { data: pages } = await sc.searchanalytics.query({
    siteUrl: SITE,
    requestBody: {
      startDate: dateStr(start),
      endDate: dateStr(end),
      dimensions: ["page"],
      rowLimit: 20,
      orderBy: [{ field: "clicks", sortOrder: "DESCENDING" }],
    },
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("         TOP 20 PAGES");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${"Page".padEnd(50)} ${"Clicks".padStart(8)} ${"Impr".padStart(8)} ${"CTR".padStart(8)} ${"Pos".padStart(6)}`);
  console.log("─".repeat(82));
  for (const r of pages.rows || []) {
    const page = r.keys[0].replace(SITE, "") || "/";
    console.log(
      `${page.padEnd(50)} ${String(r.clicks).padStart(8)} ${String(r.impressions).padStart(8)} ${(r.ctr * 100).toFixed(1).padStart(7)}% ${r.position.toFixed(1).padStart(6)}`
    );
  }

  // ── Top queries ──────────────────────────────────────────────────────
  const { data: queries } = await sc.searchanalytics.query({
    siteUrl: SITE,
    requestBody: {
      startDate: dateStr(start),
      endDate: dateStr(end),
      dimensions: ["query"],
      rowLimit: 20,
      orderBy: [{ field: "impressions", sortOrder: "DESCENDING" }],
    },
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("       TOP 20 SEARCH QUERIES");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${"Query".padEnd(50)} ${"Clicks".padStart(8)} ${"Impr".padStart(8)} ${"CTR".padStart(8)} ${"Pos".padStart(6)}`);
  console.log("─".repeat(82));
  for (const r of queries.rows || []) {
    console.log(
      `${r.keys[0].padEnd(50)} ${String(r.clicks).padStart(8)} ${String(r.impressions).padStart(8)} ${(r.ctr * 100).toFixed(1).padStart(7)}% ${r.position.toFixed(1).padStart(6)}`
    );
  }

  // ── Daily trend ──────────────────────────────────────────────────────
  const { data: daily } = await sc.searchanalytics.query({
    siteUrl: SITE,
    requestBody: {
      startDate: dateStr(start),
      endDate: dateStr(end),
      dimensions: ["date"],
      orderBy: [{ field: "date", sortOrder: "ASCENDING" }],
    },
  });

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("         DAILY TREND");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`${"Date".padEnd(14)} ${"Clicks".padStart(8)} ${"Impr".padStart(8)} ${"CTR".padStart(8)} ${"Pos".padStart(6)}`);
  console.log("─".repeat(46));
  for (const r of daily.rows || []) {
    console.log(
      `${r.keys[0].padEnd(14)} ${String(r.clicks).padStart(8)} ${String(r.impressions).padStart(8)} ${(r.ctr * 100).toFixed(1).padStart(7)}% ${r.position.toFixed(1).padStart(6)}`
    );
  }

  // ── Save raw JSON ────────────────────────────────────────────────────
  const reportPath = resolve(__dirname, "../../seo-report.json");
  const report = {
    generated: new Date().toISOString(),
    period: { start: dateStr(start), end: dateStr(end), days },
    summary: row,
    topPages: pages.rows || [],
    topQueries: queries.rows || [],
    dailyTrend: daily.rows || [],
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Raw data saved to seo-report.json`);
  console.log("✅ Done!\n");
}

main().catch((err) => {
  if (err.code === 403) {
    console.error("❌ Permission denied. Make sure the service account email is added as Owner in Google Search Console.");
    console.error("   Service account email is in fitved-seo-bot.json → client_email field.");
  } else {
    console.error("❌ Error:", err.message);
  }
  process.exit(1);
});
