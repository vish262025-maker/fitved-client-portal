import React, { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ARTICLES_DATA } from "@/data/blog/articles";
import { CATEGORIES_DATA } from "@/data/blog/categories";
import { SEED_TOPIC_HUBS } from "@/lib/blog/seedData";
import { BlogArticle } from "@/lib/blog/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BlogLayout } from "@/components/blog/BlogLayout";
import { BlogSeo } from "@/components/blog/BlogSeo";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/blog/seo";
import {
  Search, Sparkles, BookOpen, Clock, ArrowRight, Calculator, MapPin, X, ChevronRight, Mail, RotateCcw, Scale, Utensils,
} from "lucide-react";
import { searchStaticArticles } from "@/lib/blog/searchIndex";
import { resolveFeaturedImage, resolveImageAltText } from "@/lib/blog/featuredImageMap";

export default function BlogLanding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [selectedCatSlug, setSelectedCatSlug] = useState<string>(searchParams.get("cat") || "all");
  const [emailSub, setEmailSub] = useState("");
  const [subDone, setSubDone] = useState(false);
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const pageSize = 12;

  // Filter static articles (508 articles dataset)
  const filteredArticles = useMemo(() => {
    return searchStaticArticles(searchTerm, selectedCatSlug);
  }, [searchTerm, selectedCatSlug]);

  const totalPages = Math.ceil(filteredArticles.length / pageSize);

  const paginatedArticles = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredArticles.slice(start, start + pageSize);
  }, [filteredArticles, currentPage]);

  const featuredArticle = useMemo(
    () => ARTICLES_DATA.find((a) => a.is_featured) || ARTICLES_DATA[0],
    []
  );

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailSub.includes("@")) {
      setSubDone(true);
      setEmailSub("");
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setSelectedCatSlug("all");
    setCurrentPage(1);
  };

  useEffect(() => {
    const p = new URLSearchParams();
    if (searchTerm) p.set("q", searchTerm);
    if (selectedCatSlug && selectedCatSlug !== "all") p.set("cat", selectedCatSlug);
    if (currentPage > 1) p.set("page", String(currentPage));
    setSearchParams(p, { replace: true });
  }, [searchTerm, selectedCatSlug, currentPage, setSearchParams]);

  const breadcrumbs = [{ name: "Home", url: "/" }, { name: "FitVed Journal", url: "/blog" }];

  return (
    <BlogLayout breadcrumbs={breadcrumbs}>
      <BlogSeo
        title="FitVed Journal — Fitness, Nutrition & Wellness Articles"
        description="Science-backed articles, workout guides, Indian nutrition advice, healthy recipes and expert coaching resources from FitVed."
        canonical={`${SITE_URL}/blog`}
        type="website"
        keywords={["indian fitness blog", "nutrition guide", "healthy indian recipes", "weight loss", "protein"]}
        jsonLd={[generateBreadcrumbSchema(breadcrumbs)]}
      />
      {/* Hero Section */}
      <section className="relative bg-slate-900 text-white py-14 md:py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center space-y-4">
          <Badge className="bg-orange-500/20 text-orange-400 border-0 px-3 py-1 text-xs">
            {ARTICLES_DATA.length}+ Expert Articles
          </Badge>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white">
            Fitness, Nutrition & Wellness Journal
          </h1>

          <p className="text-sm sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal">
            Science-backed articles, workout guides, Indian nutrition advice, healthy recipes, wellness education, and expert coaching resources.
          </p>

          {/* Search bar */}
          <div className="mt-8 relative max-w-2xl mx-auto shadow-2xl">
            <div className="relative flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-muted-foreground pointer-events-none" />
              <Input
                type="text"
                placeholder="Search articles, recipes, PCOS, protein, weight loss..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="h-14 pl-12 pr-10 rounded-2xl bg-white text-slate-900 placeholder:text-slate-400 border-0 shadow-lg text-sm sm:text-base font-medium focus-visible:ring-2 focus-visible:ring-orange-500"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute right-4 text-slate-400 hover:text-slate-600">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>

          {/* Category Quick Pills (Top 12) */}
          <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
            <button
              onClick={() => { setSelectedCatSlug("all"); setCurrentPage(1); }}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                selectedCatSlug === "all" ? "bg-orange-500 text-white font-bold" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              All ({ARTICLES_DATA.length})
            </button>
            {CATEGORIES_DATA.slice(0, 12).map((c) => (
              <button
                key={c.slug}
                onClick={() => { setSelectedCatSlug(c.slug); setCurrentPage(1); }}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                  selectedCatSlug === c.slug ? "bg-orange-500 text-white font-bold" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Editorial Container */}
      <div className="container mx-auto max-w-6xl px-4 md:px-6 py-12 space-y-16">
        {/* Featured Article Banner */}
        {featuredArticle && !searchTerm && selectedCatSlug === "all" && (
          <div className="group relative rounded-3xl overflow-hidden border border-border bg-card shadow-lg grid grid-cols-1 md:grid-cols-12 gap-0">
            <div className="md:col-span-7 relative min-h-[280px] md:min-h-[380px] overflow-hidden bg-muted">
              <img
                src={resolveFeaturedImage(featuredArticle)}
                alt={resolveImageAltText(featuredArticle)}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1200&q=80"; }}
              />
              <div className="absolute top-4 left-4">
                <Badge className="bg-orange-500 text-white font-bold border-0 px-3 py-1">
                  Featured Story
                </Badge>
              </div>
            </div>

            <div className="md:col-span-5 p-6 sm:p-8 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                  <span className="text-orange-500 font-bold uppercase tracking-wider">Nutrition</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {featuredArticle.reading_time} min read</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight group-hover:text-primary transition-colors">
                  {featuredArticle.display_title || featuredArticle.title}
                </h2>

                <p className="text-sm text-muted-foreground line-clamp-3">
                  {featuredArticle.summary}
                </p>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">By Dr. Ananya Sharma</span>
                <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  <Link to={`/blog/article/${featuredArticle.slug}`}>
                    Read Article <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Topic Hubs Section */}
        {!searchTerm && selectedCatSlug === "all" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-2xl font-extrabold text-foreground">Explore Topic Hubs</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Deep-dive health collections curated by experts</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {SEED_TOPIC_HUBS.map((hub) => (
                <div key={hub.id} className="group relative rounded-2xl overflow-hidden border border-border bg-card shadow-sm hover:shadow-md transition-all">
                  <div className="h-44 relative bg-muted overflow-hidden">
                    <img src={hub.hero_image} alt={hub.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4">
                      <h3 className="text-lg font-bold text-white">{hub.name}</h3>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <p className="text-xs text-muted-foreground line-clamp-2">{hub.subtitle}</p>
                    <Button asChild variant="outline" size="sm" className="w-full text-xs font-semibold">
                      <Link to={`/blog/topic/${hub.slug}`}>Explore Hub <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 500+ Articles Paginated Grid */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-2xl font-extrabold text-foreground">
                All Articles
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredArticles.length} results)
                </span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">Page {currentPage} of {totalPages || 1}</p>
            </div>

            {(searchTerm || selectedCatSlug !== "all") && (
              <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-orange-500 gap-1">
                <RotateCcw className="h-3.5 w-3.5" /> Clear Filters
              </Button>
            )}
          </div>

          {paginatedArticles.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-border rounded-2xl bg-card space-y-3">
              <BookOpen className="h-10 w-10 text-muted-foreground mx-auto" />
              <h3 className="text-base font-semibold text-foreground">No articles match your search</h3>
              <Button variant="outline" size="sm" onClick={resetFilters}>Reset Search</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {paginatedArticles.map((art) => (
                <div key={art.id} className="group flex flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all">
                  <div className="space-y-3">
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
                      <img
                        src={resolveFeaturedImage(art)}
                        alt={resolveImageAltText(art)}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1200&q=80"; }}
                      />
                      {art.recipe_details && (
                        <Badge className="absolute top-2 left-2 bg-orange-500 text-white text-[10px]">
                          Recipe
                        </Badge>
                      )}
                      {art.comparison_details && (
                        <Badge className="absolute top-2 left-2 bg-blue-600 text-white text-[10px]">
                          Comparison
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-orange-500 uppercase">{art.tags[0] || "Health"}</span>
                      <span>•</span>
                      <span>{art.reading_time} min read</span>
                    </div>

                    <h3 className="text-base font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {art.display_title || art.title}
                    </h3>

                    <p className="text-xs text-muted-foreground line-clamp-2">{art.summary}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground font-medium">By FitVed Editorial</span>
                    <Button asChild size="sm" variant="ghost" className="h-8 text-xs font-semibold text-primary">
                      <Link to={art.recipe_details ? `/blog/recipe/${art.slug}` : art.comparison_details ? `/blog/compare/${art.slug}` : `/blog/article/${art.slug}`}>
                        Read <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination Bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-8">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs font-medium text-muted-foreground px-3">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>
    </BlogLayout>
  );
}
