import React, { useState, useMemo } from "react";
import { useLocation, Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, CheckCircle2, ShieldCheck, ChevronRight, Users, MapPin,
  Dumbbell, Heart, Star, ArrowRight, BookOpen, HelpCircle, AlertTriangle,
  Lightbulb, Target,
} from "lucide-react";
import { BookTrialModal } from "@/components/BookTrialModal";
import { BlogLayout } from "@/components/blog/BlogLayout";
import { BlogSeo } from "@/components/blog/BlogSeo";
import { generateFAQSchema, generateBreadcrumbSchema, SITE_URL } from "@/lib/blog/seo";
import { getGeoPageData } from "@/data/geoPages";
import type { GeoPageData } from "@/data/geoPages";

const CATEGORY_BADGES: Record<string, { label: string; color: string }> = {
  "personal-trainer": { label: "Personal Training", color: "bg-blue-500/20 text-blue-400" },
  yoga: { label: "Yoga", color: "bg-purple-500/20 text-purple-400" },
  strength: { label: "Strength Training", color: "bg-red-500/20 text-red-400" },
  "corporate-wellness": { label: "Corporate Wellness", color: "bg-green-500/20 text-green-400" },
  specialty: { label: "Specialty Coaching", color: "bg-amber-500/20 text-amber-400" },
  calculator: { label: "Health Calculator", color: "bg-cyan-500/20 text-cyan-400" },
  comparison: { label: "Comparison Guide", color: "bg-pink-500/20 text-pink-400" },
  online: { label: "Online Training", color: "bg-indigo-500/20 text-indigo-400" },
};

function FAQSection({ faqs, path }: { faqs: GeoPageData["faqs"]; path: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <section className="py-12 px-4 bg-slate-50">
      <div className="container mx-auto max-w-3xl">
        <h2 className="text-2xl sm:text-3xl font-bold text-fv-navy mb-8 text-center">Frequently Asked Questions</h2>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left text-sm sm:text-base font-semibold text-fv-navy hover:bg-slate-50 transition-colors"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                aria-expanded={openIdx === i}
              >
                <span className="pr-4">{faq.q}</span>
                <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform ${openIdx === i ? "rotate-90" : ""}`} />
              </button>
              {openIdx === i && (
                <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function GeoLandingPage() {
  const { pathname } = useLocation();
  const [trialModalOpen, setTrialModalOpen] = useState(false);

  const page = useMemo(() => getGeoPageData(pathname), [pathname]);

  if (!page) return <Navigate to="/404" replace />;

  const badge = CATEGORY_BADGES[page.category] || CATEGORY_BADGES["personal-trainer"];
  const faqSchema = generateFAQSchema(page.faqs.map(f => ({ question: f.q, answer: f.a })));
  const breadcrumbSchema = generateBreadcrumbSchema(page.breadcrumbs);
  const canonical = `${SITE_URL}${pathname}`;

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.metaTitle,
    description: page.metaDescription,
    url: canonical,
    publisher: {
      "@type": "Organization",
      name: "FitVed",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/fitved-logo.png` },
    },
    mainEntity: page.city ? {
      "@type": "LocalBusiness",
      name: `FitVed — ${page.title}`,
      description: page.metaDescription,
      url: canonical,
      areaServed: { "@type": "City", name: page.city },
      serviceType: badge.label,
      priceRange: "$$",
      image: `${SITE_URL}/fitved-logo.png`,
    } : undefined,
  };

  return (
    <BlogLayout breadcrumbs={page.breadcrumbs}>
      <BlogSeo
        title={page.metaTitle}
        description={page.metaDescription}
        canonical={canonical}
        image={`${SITE_URL}/fitved-logo.png`}
        keywords={page.keywords}
        type="article"
        publishedTime="2026-08-07"
        modifiedTime="2026-08-07"
        jsonLd={[breadcrumbSchema, faqSchema, webPageSchema]}
      />

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white py-16 sm:py-20 px-4">
        <div className="container mx-auto max-w-4xl text-center space-y-5">
          <Badge className={`${badge.color} border-0 px-3 py-1 text-xs`}>
            {badge.label}{page.city ? ` — ${page.city}` : ""}
          </Badge>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight">
            {page.h1}
          </h1>
          <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            {page.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button
              onClick={() => setTrialModalOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 sm:px-8 py-3 sm:py-3.5 h-auto min-h-[3rem] w-full sm:w-auto text-base leading-snug text-center whitespace-normal break-words max-w-full shadow-lg transition-all"
            >
              {page.ctaText}
            </Button>
            <Button
              asChild
              variant="outline"
              className="bg-white hover:bg-slate-100 text-[#17233A] hover:text-[#17233A] font-bold px-6 py-3 h-auto min-h-[3rem] w-full sm:w-auto text-base border border-slate-200 shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-[#17233A]"
            >
              <Link to="/trainers" className="inline-flex items-center justify-center">
                Browse All Trainers <ArrowRight className="ml-1.5 h-4 w-4 text-[#17233A]" />
              </Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-4 justify-center text-xs text-slate-400 pt-3">
            <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5 text-green-400" /> Police Verified</span>
            <span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 text-yellow-400" /> Certified Coaches</span>
            <span className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-orange-400" /> Free Trial Session</span>
          </div>
        </div>
      </section>

      {/* Introduction */}
      <section className="py-12 px-4">
        <div className="container mx-auto max-w-3xl">
          <p className="text-base sm:text-lg text-slate-700 leading-relaxed">{page.intro}</p>
        </div>
      </section>

      {/* Content Sections */}
      {page.sections.map((sec, i) => (
        <section key={i} className={`py-10 px-4 ${i % 2 === 0 ? "bg-white" : "bg-slate-50"}`}>
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-xl sm:text-2xl font-bold text-fv-navy mb-4">{sec.heading}</h2>
            <div className="text-sm sm:text-base text-slate-700 leading-relaxed whitespace-pre-line">{sec.body}</div>
          </div>
        </section>
      ))}

      {/* Benefits */}
      {page.benefits.length > 0 && (
        <section className="py-12 px-4 bg-gradient-to-br from-fv-navy to-slate-800 text-white">
          <div className="container mx-auto max-w-3xl">
            <h2 className="text-2xl sm:text-3xl font-bold mb-8 text-center">Why Choose FitVed</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {page.benefits.map((b, i) => (
                <div key={i} className="flex items-start gap-3 bg-white/5 rounded-lg p-4">
                  <CheckCircle2 className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-slate-200">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Tips */}
      {page.tips.length > 0 && (
        <section className="py-12 px-4 bg-white">
          <div className="container mx-auto max-w-3xl">
            <div className="flex items-center gap-2 mb-6">
              <Lightbulb className="h-6 w-6 text-amber-500" />
              <h2 className="text-2xl font-bold text-fv-navy">Pro Tips</h2>
            </div>
            <ol className="space-y-3">
              {page.tips.map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="bg-amber-100 text-amber-800 font-bold rounded-full h-6 w-6 flex items-center justify-center text-xs flex-shrink-0">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Common Mistakes */}
      {page.mistakes.length > 0 && (
        <section className="py-12 px-4 bg-red-50">
          <div className="container mx-auto max-w-3xl">
            <div className="flex items-center gap-2 mb-6">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h2 className="text-2xl font-bold text-fv-navy">Common Mistakes to Avoid</h2>
            </div>
            <ul className="space-y-3">
              {page.mistakes.map((m, i) => (
                <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="text-red-400 mt-0.5">✕</span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* FAQs */}
      {page.faqs.length > 0 && <FAQSection faqs={page.faqs} path={pathname} />}

      {/* Related Blog Articles */}
      {page.relatedBlogSlugs.length > 0 && (
        <section className="py-12 px-4 bg-white">
          <div className="container mx-auto max-w-3xl">
            <div className="flex items-center gap-2 mb-6">
              <BookOpen className="h-6 w-6 text-fv-orange" />
              <h2 className="text-2xl font-bold text-fv-navy">Related Reading</h2>
            </div>
            <div className="grid gap-3">
              {page.relatedBlogSlugs.map((slug) => (
                <Link
                  key={slug}
                  to={`/blog/article/${slug}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-fv-orange/40 hover:bg-orange-50/50 transition-colors text-sm text-fv-navy font-medium"
                >
                  <ArrowRight className="h-4 w-4 text-fv-orange flex-shrink-0" />
                  <span className="line-clamp-1">{slug.replace(/-/g, " ").replace(/(^|\s)\w/g, c => c.toUpperCase())}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Related Geo Pages */}
      {page.relatedGeoLinks.length > 0 && (
        <section className="py-10 px-4 bg-slate-50">
          <div className="container mx-auto max-w-3xl">
            <h3 className="text-lg font-bold text-fv-navy mb-4">Explore More</h3>
            <div className="flex flex-wrap gap-2">
              {page.relatedGeoLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-medium text-fv-navy hover:border-fv-orange/40 hover:text-fv-orange transition-colors"
                >
                  <MapPin className="h-3 w-3" /> {link.label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="py-14 px-4 bg-gradient-to-r from-fv-navy to-slate-800 text-white text-center">
        <div className="container mx-auto max-w-2xl space-y-5">
          <h2 className="text-2xl sm:text-3xl font-bold">Ready to Start Your Fitness Journey?</h2>
          <p className="text-slate-300 text-sm sm:text-base">
            Book a free trial session with a certified FitVed trainer. No payment required, no commitment — just a real workout with a real coach.
          </p>
          <Button
            onClick={() => setTrialModalOpen(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-10 py-3 text-base shadow-lg"
          >
            <Sparkles className="mr-2 h-5 w-5" /> {page.ctaText}
          </Button>
        </div>
      </section>

      <BookTrialModal open={trialModalOpen} onOpenChange={setTrialModalOpen} />
    </BlogLayout>
  );
}
