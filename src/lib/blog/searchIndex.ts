import { ARTICLES_DATA } from "@/data/blog/articles";
import { CATEGORIES_DATA } from "@/data/blog/categories";
import { BlogArticle } from "./types";

export function searchStaticArticles(query: string, categorySlug?: string, tag?: string): BlogArticle[] {
  const q = query.toLowerCase().trim();

  const catId = categorySlug && categorySlug !== "all"
    ? CATEGORIES_DATA.find((c) => c.slug === categorySlug)?.id
    : null;

  return ARTICLES_DATA.filter((art) => {
    if (catId) {
      if (art.category_id !== catId) return false;
    }

    if (tag && tag !== "all") {
      const hasTag = art.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
      if (!hasTag) return false;
    }

    if (!q) return true;

    const matchTitle = art.title.toLowerCase().includes(q) || (art.display_title && art.display_title.toLowerCase().includes(q));
    const matchSummary = art.summary.toLowerCase().includes(q);
    const matchTags = art.tags.some((t) => t.toLowerCase().includes(q));
    const matchSlug = art.slug.toLowerCase().includes(q);

    return matchTitle || matchSummary || matchTags || matchSlug;
  });
}
