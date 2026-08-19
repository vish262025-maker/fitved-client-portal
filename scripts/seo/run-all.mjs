#!/usr/bin/env node
/**
 * Run all SEO automation tasks in sequence:
 *   1. Submit sitemap
 *   2. Request indexing for key pages
 *   3. Fetch performance data
 *   4. Generate weekly report
 *
 * Usage:
 *   node scripts/seo/run-all.mjs
 */
import { execFileSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = (script, args = []) => {
  const path = resolve(__dirname, script);
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Running: ${script} ${args.join(" ")}`);
  console.log(`${"═".repeat(60)}`);
  try {
    execFileSync("node", [path, ...args], { stdio: "inherit" });
  } catch {
    console.error(`  ⚠️  ${script} had errors — continuing...\n`);
  }
};

console.log("🚀 FitVed SEO Automation — Full Run\n");
console.log(`   Time: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);

run("submit-sitemap.mjs");
run("index-urls.mjs");
run("fetch-performance.mjs", ["28"]);
run("generate-report.mjs", ["7"]);

console.log(`\n${"═".repeat(60)}`);
console.log("  ✅ All SEO tasks completed!");
console.log(`${"═".repeat(60)}\n`);
