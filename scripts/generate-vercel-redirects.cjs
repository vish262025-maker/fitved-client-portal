/**
 * Generates vercel.json with blog slug 301 redirects.
 * Merges new redirects with existing vercel.json config.
 * Run: node scripts/generate-vercel-redirects.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const vercelPath = path.join(ROOT, "vercel.json");
const redirectMapPath = path.join(ROOT, "src/data/blog/slugRedirects.json");

const redirectMap = JSON.parse(fs.readFileSync(redirectMapPath, "utf8"));
const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, "utf8"));

// Keep existing non-blog redirects
const existingRedirects = (vercelConfig.redirects || []).filter(
  (r) => !r.source.startsWith("/blog/article/") && !r.source.startsWith("/blog/recipe/") && !r.source.startsWith("/blog/compare/")
);

// Determine the route type for each old slug by checking curated/researched articles
const researched = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/blog/researchedArticles.json"), "utf8"));
const recipeSlugSet = new Set();
const compareSlugSet = new Set();

// Curated recipe/compare slugs (old slugs)
recipeSlugSet.add("high-protein-paneer-bhurji-recipe");
compareSlugSet.add("gym-vs-home-workouts-comparison");

// Researched recipe/compare slugs
researched.forEach((a) => {
  // These are already updated to new slugs, but check the type
  if (a.recipe_details) recipeSlugSet.add(a.slug);
  if (a.comparison_details) compareSlugSet.add(a.slug);
});

// Also check original slugs (pre-migration) for the curated articles
const CURATED_TYPES = {
  "high-protein-paneer-bhurji-recipe": "recipe",
  "gym-vs-home-workouts-comparison": "compare",
};

// All programmatic articles are type "article" (no recipe_details or comparison_details)
// Only curated have recipe/compare types

const blogRedirects = [];

for (const [oldSlug, newSlug] of Object.entries(redirectMap)) {
  let routeType = "article";
  if (CURATED_TYPES[oldSlug]) {
    routeType = CURATED_TYPES[oldSlug];
  }
  // Check researched articles for recipe/compare types
  // The whey-vs-plant-protein-comparison was a comparison article
  if (oldSlug === "whey-vs-plant-protein-comparison") routeType = "compare";
  if (oldSlug === "moong-dal-chilla-recipe") routeType = "recipe";

  blogRedirects.push({
    source: `/blog/${routeType}/${oldSlug}`,
    destination: `/blog/${routeType}/${newSlug}`,
    permanent: true,
  });
}

vercelConfig.redirects = [...existingRedirects, ...blogRedirects];

fs.writeFileSync(vercelPath, JSON.stringify(vercelConfig, null, 2) + "\n");
console.log(`vercel.json updated: ${existingRedirects.length} existing + ${blogRedirects.length} blog redirects = ${vercelConfig.redirects.length} total`);
