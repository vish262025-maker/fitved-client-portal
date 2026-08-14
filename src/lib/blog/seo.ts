import { BlogArticle, BlogAuthor, FAQItem, RecipeDetails } from "./types";

export const SITE_URL = "https://www.getfitved.com";

/** Descriptive, SEO-friendly alt text for an article's featured image. */
export function articleAlt(article: Pick<BlogArticle, "title" | "tags" | "image_alt">): string {
  if (article.image_alt) return article.image_alt;
  const topic = article.tags?.[0];
  return topic ? `${article.title} — ${topic} guide` : article.title;
}

/** Keyword list for meta keywords, derived from explicit keywords or tags. */
export function articleKeywords(article: Pick<BlogArticle, "keywords" | "tags">): string[] {
  const base = article.keywords?.length ? article.keywords : (article.tags || []);
  return Array.from(new Set(base.map((k) => k.toLowerCase())));
}

/** Absolute canonical URL for an article. Route type wins so the canonical
 * always matches the URL the page is served at (and the sitemap entry). */
export function articleUrl(article: Pick<BlogArticle, "slug" | "canonical_url" | "recipe_details" | "comparison_details">): string {
  if (article.recipe_details) return `${SITE_URL}/blog/recipe/${article.slug}`;
  if (article.comparison_details) return `${SITE_URL}/blog/compare/${article.slug}`;
  if (article.canonical_url) return article.canonical_url.replace("https://fitved.com", SITE_URL).replace("https://getfitved.com", SITE_URL);
  return `${SITE_URL}/blog/article/${article.slug}`;
}

/** Generate JSON-LD Schema for an Article */
export function generateArticleSchema(article: BlogArticle, author?: BlogAuthor) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.seo_title || article.title,
    description: article.seo_description || article.summary,
    image: article.featured_image ? [article.featured_image] : undefined,
    datePublished: article.published_at,
    dateModified: article.updated_at || article.published_at,
    author: author
      ? {
          "@type": "Person",
          name: author.name,
          jobTitle: author.credentials,
          url: `${SITE_URL}/blog/author/${author.slug}`,
        }
      : {
          "@type": "Organization",
          name: "FitVed Health & Fitness Editorial Board",
        },
    publisher: {
      "@type": "Organization",
      name: "FitVed",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/fitved-logo.png`,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": articleUrl(article),
    },
  };
}

/** Generate JSON-LD Schema for FAQs */
export function generateFAQSchema(faqs: FAQItem[]) {
  if (!faqs || faqs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
}

/** Generate JSON-LD Schema for Recipes */
export function generateRecipeSchema(article: BlogArticle, recipe: RecipeDetails) {
  return {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: article.title,
    image: [article.featured_image],
    description: article.summary,
    prepTime: `PT${recipe.prep_time_mins}M`,
    cookTime: `PT${recipe.cook_time_mins}M`,
    totalTime: `PT${recipe.prep_time_mins + recipe.cook_time_mins}M`,
    recipeYield: `${recipe.servings} servings`,
    recipeCategory: "Indian Fitness Nutrition",
    nutrition: {
      "@type": "NutritionInformation",
      calories: `${recipe.calories} calories`,
      proteinContent: `${recipe.protein_g} g`,
      carbohydrateContent: `${recipe.carbs_g} g`,
      fatContent: `${recipe.fat_g} g`,
    },
    recipeIngredient: recipe.ingredients,
    recipeInstructions: recipe.instructions.map((step, idx) => ({
      "@type": "HowToStep",
      name: `Step ${idx + 1}`,
      text: step,
    })),
  };
}

/** Generate JSON-LD Breadcrumb Schema */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${SITE_URL}${item.url}`,
    })),
  };
}

/** Utility to generate full XML sitemap content */
export function generateXMLSitemap(articles: BlogArticle[], categories: any[], topicHubs: any[]) {
  const urls = [
    { loc: `${SITE_URL}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${SITE_URL}/trainers`, priority: "0.9", changefreq: "daily" },
    { loc: `${SITE_URL}/blog`, priority: "0.9", changefreq: "daily" },
    { loc: `${SITE_URL}/blog/calculators`, priority: "0.8", changefreq: "weekly" },
    ...categories.map((c) => ({
      loc: `${SITE_URL}/blog/category/${c.slug}`,
      priority: "0.7",
      changefreq: "weekly",
    })),
    ...topicHubs.map((t) => ({
      loc: `${SITE_URL}/blog/topic/${t.slug}`,
      priority: "0.8",
      changefreq: "weekly",
    })),
    ...articles.map((a) => ({
      loc: `${SITE_URL}/blog/article/${a.slug}`,
      priority: "0.8",
      changefreq: "monthly",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url>
    <loc>${u.loc}</loc>
    <priority>${u.priority}</priority>
    <changefreq>${u.changefreq}</changefreq>
  </url>`
  )
  .join("\n")}
</urlset>`;
}
