#!/usr/bin/env node
/**
 * Submit (or re-submit) the sitemap to Google Search Console.
 *
 * Usage:
 *   node scripts/seo/submit-sitemap.mjs
 *   node scripts/seo/submit-sitemap.mjs https://getfitved.com/custom-sitemap.xml
 */
import { google } from "googleapis";
import { getAuthClient, SITE, SITE_HTTPS } from "./auth.mjs";

const SCOPES = ["https://www.googleapis.com/auth/webmasters"];
const DEFAULT_SITEMAP = `${SITE_HTTPS}/sitemap.xml`;

async function main() {
  const sitemapUrl = process.argv[2] || DEFAULT_SITEMAP;
  const auth = await getAuthClient(SCOPES);
  const wm = google.webmasters({ version: "v3", auth });

  console.log(`\n🗺️  Submitting sitemap: ${sitemapUrl}`);
  console.log(`   Site: ${SITE}\n`);

  try {
    await wm.sitemaps.submit({ siteUrl: SITE, feedpath: sitemapUrl });
    console.log("✅ Sitemap submitted successfully!\n");
  } catch (err) {
    if (err.code === 403) {
      console.error("❌ Permission denied. Add the service account email as Owner in Search Console.");
    } else {
      console.error(`❌ Failed: ${err.message}`);
    }
    process.exit(1);
  }

  // List all sitemaps
  console.log("📋 All sitemaps for this site:");
  try {
    const { data } = await wm.sitemaps.list({ siteUrl: SITE });
    for (const s of data.sitemap || []) {
      const status = s.isPending ? "⏳ Pending" : "✅ Processed";
      console.log(`  ${status} ${s.path} (${s.lastSubmitted || "never"})`);
    }
  } catch {
    console.log("  Could not list sitemaps.");
  }
  console.log();
}

main().catch(console.error);
