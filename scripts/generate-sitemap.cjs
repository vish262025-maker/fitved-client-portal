/**
 * Generates public/sitemap.xml from the real blog data + site pages.
 * Article slugs are read straight from src/data/blog/researchedArticles.json
 * (the same source articles.ts imports) so the sitemap can never drift.
 * Runs automatically as part of `npm run build`.
 */
const fs = require("fs");
const path = require("path");

const SITE_URL = "https://www.getfitved.com";
const today = new Date().toISOString().split("T")[0];

// The 4 detailed curated articles live in articles.ts (TS), so their slugs are
// listed here explicitly. Everything else comes from the JSON.
const CURATED_SLUGS = [
  { slug: "100g-protein-vegetarian-diet", type: "article" },
  { slug: "protein-paneer-bhurji", type: "recipe" },
  { slug: "gym-vs-home-workouts", type: "compare" },
  { slug: "pcos-weight-loss", type: "article" },
];

const researched = require("../src/data/blog/researchedArticles.json");

// The 42 fitness/nutrition category slugs (kept in sync with categories.ts).
const CATEGORY_SLUGS = [
  "nutrition", "weight-loss", "muscle-gain", "protein", "recipes",
  "supplements", "womens-health", "pcos", "diabetes", "heart-health",
  "longevity", "sleep", "stress", "workplace-fitness", "home-workouts",
  "gym", "yoga", "running", "mobility", "recovery", "injuries",
  "creatine", "whey-protein", "vitamins", "fat-loss", "beginner-guides",
  "senior-fitness", "kids-nutrition", "corporate-wellness", "pregnancy",
  "postpartum", "mens-health", "gut-health", "indian-diets",
  "regional-indian-foods", "meal-plans", "comparisons", "calculators",
  "bangalore-local-guides", "nri-fitness", "healthy-habits", "fitness-science",
];

const TOPIC_HUBS = ["high-protein-indian-diet", "weight-loss-strategy", "pcos-hormone-health"];
const LOCATIONS = [
  { city: "bangalore", slug: "personal-trainer-bangalore" },
  { city: "mumbai", slug: "personal-trainer-mumbai" },
];

function urlEntry(loc, priority, changefreq, lastmod) {
  return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod || today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

// Map an article to its correct route based on its detail shape.
function articlePath(a) {
  if (a.recipe_details) return `/blog/recipe/${a.slug}`;
  if (a.comparison_details) return `/blog/compare/${a.slug}`;
  return `/blog/article/${a.slug}`;
}

const urls = [];

// Core site pages
urls.push(urlEntry(`${SITE_URL}/`, "1.0", "weekly"));
urls.push(urlEntry(`${SITE_URL}/trainers`, "0.9", "daily"));
urls.push(urlEntry(`${SITE_URL}/personal-training`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/yoga-classes-bangalore`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/weight-loss-program-bangalore`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/strength-training-bangalore`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/senior-fitness-bangalore`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/prenatal-postnatal-yoga`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/clinical-fitness-bangalore`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/womens-fitness-bangalore`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/diet-coaching-bangalore`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/online-training`, "0.8", "monthly"));
urls.push(urlEntry(`${SITE_URL}/corporate`, "0.8", "monthly"));
urls.push(urlEntry(`${SITE_URL}/service-areas`, "0.9", "weekly"));
urls.push(urlEntry(`${SITE_URL}/faqs`, "0.7", "monthly"));
urls.push(urlEntry(`${SITE_URL}/societies/`, "0.8", "weekly"));

// Blog hub + tools
urls.push(urlEntry(`${SITE_URL}/blog`, "0.9", "daily"));
urls.push(urlEntry(`${SITE_URL}/blog/calculators`, "0.8", "weekly"));

// Category archives
CATEGORY_SLUGS.forEach((slug) => {
  urls.push(urlEntry(`${SITE_URL}/blog/category/${slug}`, "0.7", "weekly"));
});

// Topic hubs
TOPIC_HUBS.forEach((slug) => {
  urls.push(urlEntry(`${SITE_URL}/blog/topic/${slug}`, "0.8", "weekly"));
});

// Location pages
LOCATIONS.forEach(({ city, slug }) => {
  urls.push(urlEntry(`${SITE_URL}/blog/location/${city}/${slug}`, "0.7", "monthly"));
});

// Curated articles
CURATED_SLUGS.forEach(({ slug, type }) => {
  const p = type === "recipe" ? `/blog/recipe/${slug}` : type === "compare" ? `/blog/compare/${slug}` : `/blog/article/${slug}`;
  urls.push(urlEntry(`${SITE_URL}${p}`, "0.8", "monthly"));
});

// Researched articles (real content)
researched.forEach((a) => {
  const lastmod = (a.updated_at || a.published_at || "").split("T")[0] || today;
  urls.push(urlEntry(`${SITE_URL}${articlePath(a)}`, "0.7", "monthly", lastmod));
});

// Programmatic catalogue articles — read SEO slugs from the same JSON used by
// articles.ts so the sitemap can never drift from the runtime article data.
const SEO_SLUG_MAP = require("../src/data/blog/seoSlugs.json");
const PROG_VARIATIONS = [
  "Busy IT Professionals", "Vegetarians", "Beginners Over 30", "Desk Workers",
  "Post-Workout Recovery", "Fat Burning", "Hormonal Balance", "Metabolic Flexibility",
  "Muscle Retention", "Energy Boost", "Night Shift Workers", "Budget Meal Planning",
];
Object.entries(SEO_SLUG_MAP).forEach(([catSlug, varMap]) => {
  PROG_VARIATIONS.forEach((v) => {
    const slug = varMap[v];
    if (slug) {
      urls.push(urlEntry(`${SITE_URL}/blog/article/${slug}`, "0.5", "monthly"));
    }
  });
});

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

const outPath = path.resolve(__dirname, "../public/sitemap.xml");
fs.writeFileSync(outPath, xml);
console.log(`Sitemap generated: ${urls.length} URLs (${researched.length + CURATED_SLUGS.length} articles) -> public/sitemap.xml`);
