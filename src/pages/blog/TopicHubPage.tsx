import React, { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { SEED_TOPIC_HUBS } from "@/lib/blog/seedData";
import { ARTICLES_DATA } from "@/data/blog/articles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Sparkles, Clock, ArrowRight, BookOpen } from "lucide-react";
import fitvedLogo from "@/assets/fitved-logo.png";
import { BookTrialModal } from "@/components/BookTrialModal";
import { BlogLayout } from "@/components/blog/BlogLayout";
import { BlogSeo } from "@/components/blog/BlogSeo";
import { generateBreadcrumbSchema, SITE_URL } from "@/lib/blog/seo";
import { resolveFeaturedImage, resolveImageAltText } from "@/lib/blog/featuredImageMap";

export default function TopicHubPage() {
  const { slug } = useParams<{ slug: string }>();
  const [trialModalOpen, setTrialModalOpen] = useState(false);

  const hub = useMemo(() => {
    const found = SEED_TOPIC_HUBS.find((h) => h.slug === slug);
    return found ?? SEED_TOPIC_HUBS[0] ?? null;
  }, [slug]);

  const hubArticles = useMemo(() => {
    return ARTICLES_DATA.filter((a) => a.topic_hub_slug === slug);
  }, [slug]);

  if (!hub) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold text-foreground">Topic Hub Not Found</h2>
        <Button asChild className="mt-4">
          <Link to="/blog">Back to Journal</Link>
        </Button>
      </div>
    );
  }

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "FitVed Journal", url: "/blog" },
    { name: hub.name, url: `/blog/topic/${hub.slug}` },
  ];

  return (
    <BlogLayout breadcrumbs={breadcrumbs}>
      <BlogSeo
        title={`${hub.title} | FitVed Journal`}
        description={hub.subtitle || hub.description || `${hub.name} guides and articles from FitVed.`}
        canonical={`${SITE_URL}/blog/topic/${hub.slug}`}
        image={hub.hero_image}
        type="website"
        jsonLd={[generateBreadcrumbSchema(breadcrumbs)]}
      />

      {/* Hero */}
      <section className="bg-slate-900 text-white py-14 px-4 text-center">
        <div className="container mx-auto max-w-4xl space-y-4">
          <Badge className="bg-orange-500/20 text-orange-400 border-0 px-3 py-1 text-xs">
            Topic Hub
          </Badge>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">
            {hub.title}
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            {hub.subtitle}
          </p>
        </div>
      </section>

      {/* Main Body */}
      <main className="container mx-auto max-w-5xl px-4 py-12 flex-1 space-y-10">
        <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-2">
          <h2 className="text-xl font-bold text-foreground">About This Hub</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{hub.description}</p>
        </div>

        <div className="space-y-6">
          <h3 className="text-xl font-bold text-foreground">Articles in this Collection ({hubArticles.length})</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {hubArticles.map((art) => (
              <div key={art.id} className="group rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="aspect-video rounded-xl overflow-hidden bg-muted">
                    <img
                      src={resolveFeaturedImage(art)}
                      alt={resolveImageAltText(art)}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1200&q=80"; }}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-semibold text-orange-500 uppercase">{art.tags[0]}</span>
                    <span>•</span>
                    <span>{art.reading_time} min read</span>
                  </div>
                  <h4 className="text-base font-bold text-foreground group-hover:text-primary transition-colors">{art.display_title || art.title}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">{art.summary}</p>
                </div>
                <div className="mt-4 pt-3 border-t border-border flex justify-end">
                  <Button asChild size="sm" variant="ghost" className="text-xs font-semibold text-primary">
                    <Link to={`/blog/article/${art.slug}`}>Read Article <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <BookTrialModal open={trialModalOpen} onOpenChange={setTrialModalOpen} />
    </BlogLayout>
  );
}
