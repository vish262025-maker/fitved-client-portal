import React, { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { SEED_LOCATION_PAGES } from "@/lib/blog/seedData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Sparkles, CheckCircle2, ShieldCheck, ArrowLeft, Users, Calendar } from "lucide-react";
import fitvedLogo from "@/assets/fitved-logo.png";
import { BookTrialModal } from "@/components/BookTrialModal";
import { generateFAQSchema, generateBreadcrumbSchema, SITE_URL } from "@/lib/blog/seo";
import { BlogLayout } from "@/components/blog/BlogLayout";
import { BlogSeo } from "@/components/blog/BlogSeo";

export default function LocationSEOPage() {
  const { city, slug } = useParams<{ city: string; slug: string }>();
  const [trialModalOpen, setTrialModalOpen] = useState(false);

  const page = useMemo(() => {
    const found = SEED_LOCATION_PAGES.find((l) => l.slug === slug || l.city.toLowerCase() === city?.toLowerCase());
    return found ?? SEED_LOCATION_PAGES[0] ?? null;
  }, [city, slug]);

  if (!page) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold text-foreground">Location Guide Not Found</h2>
        <Button asChild className="mt-4">
          <Link to="/blog">Back to Journal</Link>
        </Button>
      </div>
    );
  }

  const faqSchema = generateFAQSchema(page.faqs || []);
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "FitVed Journal", url: "/blog" },
    { name: page.city, url: `/blog/location/${page.city.toLowerCase()}/${page.slug}` },
  ];

  return (
    <BlogLayout breadcrumbs={breadcrumbs}>
      <BlogSeo
        title={`${page.title} | FitVed`}
        description={page.meta_description || `At-home personal training and fitness coaching in ${page.city}.`}
        canonical={`${SITE_URL}/blog/location/${page.city.toLowerCase()}/${page.slug}`}
        image={page.hero_image}
        type="article"
        jsonLd={[generateBreadcrumbSchema(breadcrumbs), faqSchema]}
      />

      {/* Hero */}
      <section className="bg-slate-900 text-white py-14 px-4">
        <div className="container mx-auto max-w-4xl space-y-4 text-center">
          <Badge className="bg-orange-500/20 text-orange-400 border-0 px-3 py-1 text-xs">
            City Fitness Guide: {page.city}
          </Badge>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-white">
            {page.title}
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto">
            {page.meta_description}
          </p>

          <div className="pt-4 flex justify-center">
            <Button
              onClick={() => setTrialModalOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 sm:px-8 py-3 sm:py-3.5 h-auto min-h-[3rem] w-full sm:w-auto text-base leading-snug text-center whitespace-normal break-words max-w-full shadow-lg transition-all"
            >
              Book FREE Trial in {page.city}
            </Button>
          </div>
        </div>
      </section>

      {/* Main Body */}
      <main className="container mx-auto max-w-4xl px-4 py-12 flex-1 space-y-12">
        {page.hero_image && (
          <div className="rounded-2xl overflow-hidden border border-border aspect-video shadow-md">
            <img src={page.hero_image} alt={page.title} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "/images/blog/default.webp"; }} />
          </div>
        )}

        <div className="p-6 sm:p-8 rounded-2xl border border-border bg-card shadow-sm space-y-4">
          <h2 className="text-2xl font-extrabold text-foreground">
            Why At-Home Personal Training Wins in {page.city}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            {page.content}
          </p>

          <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-muted/50 border border-border text-center space-y-1">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto" />
              <span className="font-bold text-foreground text-sm block">100% Home Visit</span>
              <span className="text-xs text-muted-foreground">No traffic commute</span>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border border-border text-center space-y-1">
              <ShieldCheck className="h-6 w-6 text-blue-500 mx-auto" />
              <span className="font-bold text-foreground text-sm block">Police Verified</span>
              <span className="text-xs text-muted-foreground">Certified instructors</span>
            </div>
            <div className="p-4 rounded-xl bg-muted/50 border border-border text-center space-y-1">
              <Users className="h-6 w-6 text-orange-500 mx-auto" />
              <span className="font-bold text-foreground text-sm block">1-on-1 Dedicated</span>
              <span className="text-xs text-muted-foreground">Personalized workouts</span>
            </div>
          </div>
        </div>

        {/* FAQs */}
        {page.faqs && page.faqs.length > 0 && (
          <div className="p-6 sm:p-8 rounded-2xl border border-border bg-card shadow-sm space-y-6">
            <h3 className="text-xl font-bold text-foreground">Frequently Asked Questions ({page.city})</h3>
            <div className="space-y-4 divide-y divide-border">
              {page.faqs.map((faq, idx) => (
                <div key={idx} className="pt-4 first:pt-0 space-y-1">
                  <h4 className="text-sm font-bold text-foreground">{faq.question}</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground">{faq.answer}</p>
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
