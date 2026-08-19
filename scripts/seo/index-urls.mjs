#!/usr/bin/env node
/**
 * Request Google to index (or re-index) specific URLs via the Indexing API.
 *
 * Usage:
 *   node scripts/seo/index-urls.mjs                          # index all key pages
 *   node scripts/seo/index-urls.mjs https://getfitved.com/x  # index a specific URL
 */
import { google } from "googleapis";
import { getAuthClient, SITE, SITE_HTTPS } from "./auth.mjs";

const SCOPES = ["https://www.googleapis.com/auth/indexing"];

// Default pages to request indexing for
const DEFAULT_URLS = [
  `${SITE_HTTPS}`,
  `${SITE_HTTPS}/login`,
  `${SITE_HTTPS}/signup`,
  `${SITE_HTTPS}/corporate`,
];

async function indexUrl(indexing, url, type = "URL_UPDATED") {
  try {
    const res = await indexing.urlNotifications.publish({
      requestBody: { url, type },
    });
    console.log(`  ✅ ${url} → ${res.data.urlNotificationMetadata?.latestUpdate?.type || "submitted"}`);
    return true;
  } catch (err) {
    const msg = err?.errors?.[0]?.message || err.message;
    console.log(`  ❌ ${url} → ${msg}`);
    return false;
  }
}

async function main() {
  const auth = await getAuthClient(SCOPES);
  const indexing = google.indexing({ version: "v3", auth });

  const urls = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_URLS;

  console.log(`\n🔍 Requesting Google to index ${urls.length} URL(s)...\n`);

  let ok = 0, fail = 0;
  for (const url of urls) {
    (await indexUrl(indexing, url)) ? ok++ : fail++;
  }

  console.log(`\n📊 Done — ${ok} indexed, ${fail} failed.\n`);
}

main().catch(console.error);
