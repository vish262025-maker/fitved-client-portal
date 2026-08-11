import React, { useState, useEffect } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { ARTICLES_DATA } from "@/data/blog/articles";
import slugRedirects from "@/data/blog/slugRedirects.json";
import { AUTHORS_DATA } from "@/data/blog/authors";
import { BlogArticle } from "@/lib/blog/types";
import { BlogLayout } from "@/components/blog/BlogLayout";
import { ContentRenderer, headingSlug } from "@/components/blog/ContentRenderer";
import { BlogSeo } from "@/components/blog/BlogSeo";
import {
  generateArticleSchema, generateFAQSchema, generateBreadcrumbSchema,
  articleKeywords, articleUrl,
} from "@/lib/blog/seo";
import { resolveFeaturedImage, resolveImageAltText } from "@/lib/blog/featuredImageMap";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock, Share2, Check, ArrowLeft, ArrowRight, ShieldCheck, Heart, Sparkles, BookOpen, User, Calendar, List,
} from "lucide-react";
import { BookTrialModal } from "@/components/BookTrialModal";

export default function ArticleDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [copied, setCopied] = useState(false);
  const [trialModalOpen, setTrialModalOpen] = useState(false);

  const redirectTarget = slug ? (slugRedirects as Record<string, string>)[slug] : undefined;
  if (redirectTarget) return <Navigate to={`/blog/article/${redirectTarget}`} replace />;

  const { article, author, prevArticle, nextArticle, relatedArticles } = React.useMemo(() => {
    const idx = ARTICLES_DATA.findIndex((a) => a.slug === slug);
    const foundArt = idx !== -1 ? ARTICLES_DATA[idx] : ARTICLES_DATA[0];
    const foundAuth = AUTHORS_DATA.find((a) => a.id === foundArt.author_id) || AUTHORS_DATA[0];
    const prev = idx > 0 ? ARTICLES_DATA[idx - 1] : null;
    const next = idx !== -1 && idx < ARTICLES_DATA.length - 1 ? ARTICLES_DATA[idx + 1] : null;
    const related = ARTICLES_DATA.filter(
      (a) => a.id !== foundArt.id && (a.category_id === foundArt.category_id || a.tags.some((t) => foundArt.tags.includes(t)))
    ).slice(0, 3);

    return { article: foundArt, author: foundAuth, prevArticle: prev, nextArticle: next, relatedArticles: related };
  }, [slug]);

  // Reading progress tracking
  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        setScrollProgress((window.scrollY / totalHeight) * 100);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const featuredImage = resolveFeaturedImage(article);
  const canonical = articleUrl(article);
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "FitVed Journal", url: "/blog" },
    { name: article.display_title || article.title, url: `/blog/article/${article.slug}` },
  ];

  const articleSchema = generateArticleSchema(article, author);
  if (articleSchema) articleSchema.image = [featuredImage]; // use the actual rendered image
  const faqSchema = generateFAQSchema(article.faq_schema || []);
  const breadcrumbSchema = generateBreadcrumbSchema(breadcrumbs);

  // Table of Contents from H2/H3 heading blocks
  const tocItems = (article.content?.blocks || [])
    .filter((b) => b.type === "heading" && b.title)
    .map((b) => ({ title: b.title as string, level: b.level || 2, id: headingSlug(b.title) }));

  return (
    <BlogLayout breadcrumbs={breadcrumbs}>
      <BlogSeo
        title={article.seo_title || `${article.title} | FitVed`}
        description={article.seo_description || article.summary}
        canonical={canonical}
        image={featuredImage}
        keywords={articleKeywords(article)}
        type="article"
        publishedTime={article.published_at}
        modifiedTime={article.updated_at || article.published_at}
        jsonLd={[articleSchema, breadcrumbSchema, faqSchema]}
      />

      {/* Reading Progress Indicator */}
      <div className="fixed top-16 left-0 right-0 h-1 bg-slate-200 z-50">
        <div className="h-full bg-orange-500 transition-all duration-150" style={{ width: `${scrollProgress}%` }} />
      </div>

      <main className="container mx-auto max-w-4xl px-4 py-10 space-y-10">
        {/* Article Header */}
        <header className="space-y-4 text-center md:text-left">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
            {article.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs font-bold text-orange-500 uppercase tracking-wider">
                {t}
              </Badge>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-foreground leading-tight">
            {article.display_title || article.title}
          </h1>

          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
            {article.summary}
          </p>

          <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-orange-500/10 text-orange-500 font-bold flex items-center justify-center border border-orange-500/20">
                {author.name.charAt(0)}
              </div>
              <div>
                <span className="font-bold text-foreground block">{author.name}</span>
                <span className="text-[11px] text-muted-foreground">{author.credentials}</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {article.reading_time} min read</span>
              <Button size="sm" variant="outline" onClick={handleShare} className="gap-1.5 text-xs">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Share2 className="h-3.5 w-3.5" />}
                {copied ? "Link Copied" : "Share"}
              </Button>
            </div>
          </div>
        </header>

        {/* 1-to-1 Local Image */}
        <div className="rounded-3xl overflow-hidden border border-border aspect-video shadow-lg bg-muted">
          <img
            src={resolveFeaturedImage(article)}
            alt={resolveImageAltText(article)}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1200&q=80"; }}
          />
        </div>

        {/* Table of Contents */}
        {tocItems.length > 1 && (
          <nav aria-label="Table of contents" className="rounded-2xl border border-border bg-muted/40 p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground mb-3">
              <List className="h-4 w-4 text-orange-500" /> Table of Contents
            </div>
            <ol className="space-y-1.5 text-sm">
              {tocItems.map((item, i) => (
                <li key={i} className={item.level === 3 ? "ml-4" : ""}>
                  <a href={`#${item.id}`} className="text-muted-foreground hover:text-orange-500 transition-colors">
                    {item.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        {/* Content Body */}
        <div className="bg-card rounded-3xl p-6 sm:p-10 border border-border shadow-sm space-y-8">
          <ContentRenderer content={article.content} />

          {/* FAQ Section */}
          {article.faq_schema && article.faq_schema.length > 0 && (
            <div className="pt-8 border-t border-border space-y-4">
              <h3 className="text-xl font-bold text-foreground">Frequently Asked Questions</h3>
              <div className="space-y-4 divide-y divide-border">
                {article.faq_schema.map((f, i) => (
                  <div key={i} className="pt-3 first:pt-0 space-y-1">
                    <h4 className="text-sm font-bold text-foreground">{f.question}</h4>
                    <p className="text-xs sm:text-sm text-muted-foreground">{f.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CTA Box */}
        <div className="p-8 rounded-3xl bg-slate-900 text-white shadow-xl text-center space-y-4">
          <Badge className="bg-orange-500 text-white font-bold border-0 px-3 py-1">
            FitVed Personal Coaching
          </Badge>
          <h3 className="text-2xl font-black text-white">Want Personalized Guidance for Your Goals?</h3>
          <p className="text-sm text-slate-300 max-w-xl mx-auto">
            Book a FREE 1-on-1 trial session with a certified personal trainer in your home or society gym.
          </p>
          <Button
            onClick={() => setTrialModalOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 px-8 shadow-md"
          >
            <Sparkles className="mr-2 h-4 w-4" /> Book Your FREE Trial Session
          </Button>
        </div>

        {/* Prev / Next Article Link Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-6 border-t border-border">
          {prevArticle ? (
            <Link to={`/blog/article/${prevArticle.slug}`} className="p-4 rounded-2xl border border-border bg-card hover:border-primary transition-all space-y-1 text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Previous Article</span>
              <p className="text-xs font-bold text-foreground line-clamp-1">{prevArticle.display_title || prevArticle.title}</p>
            </Link>
          ) : <div />}

          {nextArticle ? (
            <Link to={`/blog/article/${nextArticle.slug}`} className="p-4 rounded-2xl border border-border bg-card hover:border-primary transition-all space-y-1 text-right sm:text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground justify-end flex items-center gap-1">Next Article <ArrowRight className="h-3 w-3" /></span>
              <p className="text-xs font-bold text-foreground line-clamp-1">{nextArticle.display_title || nextArticle.title}</p>
            </Link>
          ) : <div />}
        </div>

        {/* Internal Discovery Box (Topic Hubs, Calculators, Popular Guides) */}
        <div className="p-6 rounded-2xl bg-muted/40 border border-border space-y-3">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Explore Related FitVed Tools & Hubs</h4>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link to="/blog/calculators" className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground hover:border-orange-500 hover:text-orange-500 transition-colors font-medium">
              BMR & TDEE Calculator
            </Link>
            <Link to="/blog/topic/high-protein-indian-diet" className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground hover:border-orange-500 hover:text-orange-500 transition-colors font-medium">
              High Protein Indian Hub
            </Link>
            <Link to="/blog/topic/weight-loss-strategy" className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground hover:border-orange-500 hover:text-orange-500 transition-colors font-medium">
              Indian Weight Loss Blueprint
            </Link>
            <Link to="/blog/topic/pcos-hormone-health" className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground hover:border-orange-500 hover:text-orange-500 transition-colors font-medium">
              PCOS & Hormone Health
            </Link>
            <Link to="/blog/category/recipes" className="px-3 py-1.5 rounded-lg bg-card border border-border text-foreground hover:border-orange-500 hover:text-orange-500 transition-colors font-medium">
              High Protein Recipes
            </Link>
          </div>
        </div>

        {/* Related Articles Graph */}
        {relatedArticles.length > 0 && (
          <div className="space-y-6 pt-8 border-t border-border">
            <h3 className="text-xl font-bold text-foreground">Related Articles</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {relatedArticles.map((rel) => (
                <div key={rel.id} className="group rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="aspect-video rounded-xl overflow-hidden bg-muted">
                      <img src={resolveFeaturedImage(rel)} alt={resolveImageAltText(rel)} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition-transform" onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1200&q=80"; }} />
                    </div>
                    <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">{rel.display_title || rel.title}</h4>
                  </div>
                  <Button asChild size="sm" variant="ghost" className="mt-3 text-xs font-semibold text-primary self-end">
                    <Link to={`/blog/article/${rel.slug}`}>Read <ArrowRight className="ml-1 h-3 w-3" /></Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <BookTrialModal open={trialModalOpen} onOpenChange={setTrialModalOpen} />
    </BlogLayout>
  );
}
