/**
 * Shared Google API authentication for all SEO scripts.
 * Uses the service account key file (fitved-seo-bot.json).
 */
import { google } from "googleapis";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_PATH = resolve(__dirname, "../../fitved-seo-bot.json");
const SITE_URL = "sc-domain:getfitved.com";
/** The HTTPS base for building page URLs */
export const SITE_HTTPS = "https://getfitved.com";

let _keyData;
function getKey() {
  if (!_keyData) {
    try {
      _keyData = JSON.parse(readFileSync(KEY_PATH, "utf8"));
    } catch {
      console.error("❌ Could not read fitved-seo-bot.json — make sure it exists in the project root.");
      process.exit(1);
    }
  }
  return _keyData;
}

/**
 * Returns an authenticated & authorized Google API client.
 * @param {string[]} scopes — OAuth scopes required
 */
export async function getAuthClient(scopes) {
  const key = getKey();
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes,
  });
  await auth.authorize();
  return auth;
}

/** The Search Console site URL used across all scripts. */
export const SITE = SITE_URL;

/** Service account email (for permission checks). */
export function getServiceEmail() {
  return getKey().client_email;
}
