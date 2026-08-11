import React, { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { ARTICLES_DATA } from "@/data/blog/articles";
import { CATEGORIES_DATA } from "@/data/blog/categories";
import { BlogLayout } from "@/components/blog/BlogLayout";
import { BlogSeo } from "@/components/blog/BlogSeo";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/blog/seo";
import { resolveFeaturedImage, resolveImageAltText } from "@/lib/blog/featuredImageMap";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookOpen, Clock } from "lucide-react";

export default function StaticCategoryPage() {
  const { category } = useParams<{ category: string }>();

  const catObj = useMemo(
    () => CATEGORIES_DATA.find((c) => c.slug === category),
    [category]
  );

  const categoryArticles = useMemo(() => {
    if (!catObj) return ARTICLES_DATA.slice(0, 12);
    return ARTICLES_DATA.filter((a) => a.category_id === catObj.id || a.tags.some((t) => t.toLowerCase() === category?.toLowerCase()));
  }, [catObj, category]);

  const catName = catObj ? catObj.name : category;
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "FitVed Journal", url: "/blog" },
    { name: catName || "Category", url: `/blog/category/${category}` },
  ];

  return (
    <BlogLayout breadcrumbs={breadcrumbs}>
      <BlogSeo
        title={`${catName} Articles & Guides | FitVed Journal`}
        description={catObj?.description || `Browse evergreen ${catName} articles, guides and recipes from FitVed.`}
        canonical={`${SITE_URL}/blog/category/${category}`}
        type="website"
        jsonLd={[generateBreadcrumbSchema(breadcrumbs)]}
      />
      <section className="bg-slate-900 text-white py-14 px-4 text-center">
        <div className="container mx-auto max-w-4xl space-y-3">
          <Badge className="bg-orange-500/20 text-orange-400 border-0 px-3 py-1 text-xs">
            Category Archive
          </Badge>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">
            {catObj ? catObj.name : category} Articles
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            {catObj ? catObj.description : `Browse all evergreen articles and guides on ${category}.`}
          </p>
        </div>
      </section>

      <main className="container mx-auto max-w-6xl px-4 py-12 space-y-8">
        <h2 className="text-xl font-bold text-foreground">
          Articles in {catObj ? catObj.name : category} ({categoryArticles.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categoryArticles.map((art) => (
            <div key={art.id} className="group rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
              <div className="space-y-3">
                <div className="aspect-video rounded-xl overflow-hidden bg-muted">
                  <img
                    src={resolveFeaturedImage(art)}
                    alt={resolveImageAltText(art)}
                    loading="lazy"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                    onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1200&q=80"; }}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-semibold text-orange-500 uppercase">{art.tags[0]}</span>
                  <span>•</span>
                  <span>{art.reading_time} min read</span>
                </div>
                <h3 className="text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">{art.display_title || art.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2">{art.summary}</p>
              </div>
              <Button asChild size="sm" variant="ghost" className="mt-4 text-xs font-semibold text-primary self-end">
                <Link to={`/blog/article/${art.slug}`}>Read Article <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          ))}
        </div>
      </main>
    </BlogLayout>
  );
}
