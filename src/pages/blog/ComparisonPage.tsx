import React, { useState, useMemo } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { ARTICLES_DATA } from "@/data/blog/articles";
import slugRedirects from "@/data/blog/slugRedirects.json";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Scale, Check, X, ArrowLeft, Sparkles, Trophy } from "lucide-react";
import fitvedLogo from "@/assets/fitved-logo.png";
import { BookTrialModal } from "@/components/BookTrialModal";
import { BlogLayout } from "@/components/blog/BlogLayout";
import { BlogSeo } from "@/components/blog/BlogSeo";
import {
  generateArticleSchema, generateBreadcrumbSchema, articleUrl, articleKeywords,
} from "@/lib/blog/seo";
import { resolveFeaturedImage } from "@/lib/blog/featuredImageMap";
import { AUTHORS_DATA } from "@/data/blog/authors";

export default function ComparisonPage() {
  const { slug } = useParams<{ slug: string }>();
  const [trialModalOpen, setTrialModalOpen] = useState(false);

  const redirectTarget = slug ? (slugRedirects as Record<string, string>)[slug] : undefined;
  if (redirectTarget) return <Navigate to={`/blog/compare/${redirectTarget}`} replace />;

  const article = useMemo(() => {
    const found = ARTICLES_DATA.find((a) => a.slug === slug && a.comparison_details);
    return found ?? ARTICLES_DATA.find((a) => a.comparison_details) ?? null;
  }, [slug]);

  const comp = article?.comparison_details;

  if (!article || !comp) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold text-foreground">Comparison Guide Not Found</h2>
        <Button asChild className="mt-4">
          <Link to="/blog">Back to Journal</Link>
        </Button>
      </div>
    );
  }

  const featuredImage = resolveFeaturedImage(article);
  const author = AUTHORS_DATA.find((a) => a.id === article.author_id) || AUTHORS_DATA[0];
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "FitVed Journal", url: "/blog" },
    { name: article.display_title || article.title, url: `/blog/compare/${article.slug}` },
  ];
  const articleSchema = generateArticleSchema(article, author);
  if (articleSchema) articleSchema.image = [featuredImage];

  return (
    <BlogLayout breadcrumbs={breadcrumbs}>
      <BlogSeo
        title={article.seo_title || `${article.title} | FitVed`}
        description={article.seo_description || article.summary}
        canonical={articleUrl(article)}
        image={featuredImage}
        keywords={articleKeywords(article)}
        type="article"
        publishedTime={article.published_at}
        modifiedTime={article.updated_at || article.published_at}
        jsonLd={[articleSchema, generateBreadcrumbSchema(breadcrumbs)]}
      />
      {/* Hero */}
      <section className="bg-slate-900 text-white py-12 px-4 text-center">
        <div className="container mx-auto max-w-4xl space-y-4">
          <Badge className="bg-orange-500/20 text-orange-400 border-0 px-3 py-1 text-xs">
            Head-to-Head Comparison Guide
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">
            {article.display_title || article.title}
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            {article.summary}
          </p>
        </div>
      </section>

      <main className="container mx-auto max-w-5xl px-4 py-12 flex-1 space-y-12">
        {/* Side by Side Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Option A */}
          <div className={`p-6 rounded-2xl border bg-card shadow-sm space-y-4 relative ${comp.winner === "optionA" ? "border-orange-500 ring-2 ring-orange-500/20" : "border-border"}`}>
            {comp.winner === "optionA" && (
              <Badge className="absolute -top-3 left-6 bg-orange-500 text-white font-bold gap-1">
                <Trophy className="h-3.5 w-3.5" /> Overall Winner
              </Badge>
            )}
            <h3 className="text-xl font-bold text-foreground">{comp.optionA.name}</h3>
            <p className="text-xs text-muted-foreground">{comp.optionA.subtitle}</p>

            <div className="space-y-2 border-t border-border pt-3">
              <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider block">Pros</span>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {comp.optionA.pros.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" /> {p}
                  </li>
                ))}
              </ul>
            </div>

            {comp.optionA.cons.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <span className="text-xs font-bold text-red-500 uppercase tracking-wider block">Cons</span>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {comp.optionA.cons.map((c, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <X className="h-4 w-4 text-red-500 shrink-0" /> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Option B */}
          <div className={`p-6 rounded-2xl border bg-card shadow-sm space-y-4 relative ${comp.winner === "optionB" ? "border-orange-500 ring-2 ring-orange-500/20" : "border-border"}`}>
            {comp.winner === "optionB" && (
              <Badge className="absolute -top-3 left-6 bg-orange-500 text-white font-bold gap-1">
                <Trophy className="h-3.5 w-3.5" /> Overall Winner
              </Badge>
            )}
            <h3 className="text-xl font-bold text-foreground">{comp.optionB.name}</h3>
            <p className="text-xs text-muted-foreground">{comp.optionB.subtitle}</p>

            <div className="space-y-2 border-t border-border pt-3">
              <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider block">Pros</span>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {comp.optionB.pros.map((p, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0" /> {p}
                  </li>
                ))}
              </ul>
            </div>

            {comp.optionB.cons.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                <span className="text-xs font-bold text-red-500 uppercase tracking-wider block">Cons</span>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {comp.optionB.cons.map((c, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <X className="h-4 w-4 text-red-500 shrink-0" /> {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Feature Comparison Matrix */}
        {comp.featureMatrix.length > 0 && (
          <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
            <h3 className="text-lg font-bold text-foreground">Detailed Feature Comparison</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground uppercase text-[11px] font-bold">
                  <tr>
                    <th className="p-3">Feature</th>
                    <th className="p-3 text-primary">{comp.optionA.name}</th>
                    <th className="p-3 text-foreground">{comp.optionB.name}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comp.featureMatrix.map((row, idx) => (
                    <tr key={idx} className="hover:bg-muted/30">
                      <td className="p-3 font-semibold text-foreground">{row.feature}</td>
                      <td className="p-3 font-bold text-primary">{row.optionAVal}</td>
                      <td className="p-3 text-muted-foreground">{row.optionBVal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Final Verdict Box */}
        <div className="p-8 rounded-3xl bg-slate-900 text-white shadow-xl space-y-4 text-center">
          <Badge className="bg-orange-500 text-white font-bold border-0 px-3 py-1">
            FitVed Editorial Verdict
          </Badge>
          <p className="text-base sm:text-lg text-slate-200 max-w-2xl mx-auto leading-relaxed font-medium">
            "{comp.verdict}"
          </p>
          <Button
            onClick={() => setTrialModalOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold h-11 px-6 shadow-md"
          >
            Book Your FREE 1-on-1 Trial Session
          </Button>
        </div>
      </main>

      <BookTrialModal open={trialModalOpen} onOpenChange={setTrialModalOpen} />
    </BlogLayout>
  );
}
