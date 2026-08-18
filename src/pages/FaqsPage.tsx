import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import fitvedLogo from "@/assets/fitved-logo.png";
import { BlogSeo } from "@/components/blog/BlogSeo";
import { SITE_URL } from "@/lib/blog/seo";

export default function FaqsPage() {
  const [activeCategory, setActiveCategory] = useState("all");

  const categories = [
    { id: "all", label: "All Questions" },
    { id: "pricing", label: "Pricing & Packages" },
    { id: "training", label: "Society Training & Logistics" },
    { id: "health", label: "Health & Clinical Rehab" },
    { id: "prenatal", label: "Prenatal & Postnatal Yoga" },
    { id: "senior", label: "Senior Fitness (55+)" },
    { id: "nutrition", label: "Indian Diet Coaching" },
  ];

  const faqs = [
    // Category: Pricing
    {
      cat: "pricing",
      q: "How much does a personal trainer cost in Bangalore?",
      a: "Personal training in Bangalore typically ranges from ₹8,000 to ₹18,000 per month depending on session frequency (2 to 5 times/week) and format (1-on-1 vs small group). FitVed includes custom diet coaching and a 100% free trial session before any commitment.",
    },
    {
      cat: "pricing",
      q: "Is the first trial session 100% free with zero commitment?",
      a: "Yes! Your initial trial session is completely free. No credit card required, no lock-in contract. You only decide to join after meeting your certified coach and trying the workout.",
    },
    {
      cat: "pricing",
      q: "Can I train with my spouse or neighbour to share package costs?",
      a: "Yes! FitVed offers semi-private small group sessions (2 to 6 people). Training with a spouse, family member, or neighbour in your society builds accountability and significantly lowers the per-person cost.",
    },
    {
      cat: "pricing",
      q: "What payment methods and refund policies are available?",
      a: "We accept UPI, Net Banking, Credit/Debit cards, and Razorpay. If you travel or need to pause, FitVed offers 100% session carryover so you never lose unused sessions.",
    },

    // Category: Training & Logistics
    {
      cat: "training",
      q: "How does training inside apartment society gyms work?",
      a: "Your certified trainer arrives at your apartment society gym or clubhouse at your selected time slot. We design workouts utilizing your society's existing equipment.",
    },
    {
      cat: "training",
      q: "What if my apartment society does not have a gym?",
      a: "No gym needed! If your society lacks a clubhouse gym, your trainer brings portable equipment (resistance bands, dumbbells, bodyweight gear, and yoga mats) directly to your home or terrace.",
    },
    {
      cat: "training",
      q: "What safety background checks and certifications do FitVed trainers have?",
      a: "Every FitVed coach is police-verified, background-checked, and certified by governing bodies including AYUSH (Ministry of AYUSH), ACE (American Council on Exercise), and NSCA.",
    },
    {
      cat: "training",
      q: "How is FitVed different from Cult Fit or commercial gyms?",
      a: "Cult Fit and commercial gyms require commuting to crowded centres with generic group workouts. FitVed sends certified personal trainers directly to your society — zero traffic, 1-on-1 attention, clinical protocols, and custom Indian nutrition coaching included.",
    },
    {
      cat: "training",
      q: "What time slots are available for home and society workouts?",
      a: "Trainers are available from 6:00 AM to 8:00 PM, Monday through Saturday. You can choose early morning pre-office slots or evening post-work sessions based on your routine.",
    },

    // Category: Health & Clinical Rehab
    {
      cat: "health",
      q: "What if I have health conditions like diabetes, BP, back pain, or past surgery?",
      a: "FitVed specializes in medical-history-informed training. We review your health history and doctor's guidance notes to build low-impact protocols tailored to joint safety, blood sugar stabilization, and blood pressure control.",
    },
    {
      cat: "health",
      q: "How does FitVed assist software engineers with chronic back pain and tech neck?",
      a: "We combine spinal decompression yoga, deep core stabilizer activation, and shoulder blade mobility drills specifically targeting 8+ hour desk-sitting postural strain.",
    },
    {
      cat: "health",
      q: "Can strength training lower HbA1c levels for type-2 diabetes?",
      a: "Yes. Progressive resistance training increases skeletal muscle glucose uptake, improving insulin sensitivity. Many FitVed clients see measurable reductions in HbA1c under doctor supervision.",
    },
    {
      cat: "health",
      q: "Can FitVed work directly with my doctor's or surgeon's discharge notes?",
      a: "Yes. We specialize in doctor-aligned clinical fitness for post-knee replacement, spinal rehabilitation, discectomy recovery, and cardiac health.",
    },

    // Category: Prenatal & Postnatal Yoga
    {
      cat: "prenatal",
      q: "When can I safely start prenatal yoga during my pregnancy?",
      a: "Most expectant mothers begin prenatal yoga in their second trimester (week 13 onwards) with OB/GYN clearance. Gentle trimester-specific breathing, pelvic floor stabilization, and strain-relief stretches prepare your body for a safe delivery.",
    },
    {
      cat: "prenatal",
      q: "Does prenatal yoga help with morning sickness and back pain?",
      a: "Yes. Gentle lateral side stretches, cat-cow spine mobilizations, and breathwork help reduce lower back pressure, ease morning nausea, and improve sleep quality throughout pregnancy.",
    },
    {
      cat: "prenatal",
      q: "When can I start postnatal exercise after a normal delivery vs C-section?",
      a: "Typically 6 weeks post normal delivery and 8–10 weeks post C-section, following your doctor's clearance. FitVed trainers guide progressive core stabilization before introducing heavier workouts.",
    },
    {
      cat: "prenatal",
      q: "How does FitVed help heal Diastasis Recti (abdominal separation)?",
      a: "Our certified postpartum specialists use targeted transverse abdominis (TVA) activation, breath coordination, and pelvic floor strengthening drills to safely close abdominal separation without high-risk crunches.",
    },

    // Category: Senior Fitness 55+
    {
      cat: "senior",
      q: "Is exercise safe for senior citizens (55+) with knee arthritis or hypertension?",
      a: "Yes. Our senior longevity program uses gentle chair yoga, isometric quad strengthening, and balance exercises designed to reduce joint swelling, improve mobility, and prevent fall injuries.",
    },
    {
      cat: "senior",
      q: "Are workouts done standing or seated on a chair for elderly parents?",
      a: "Sessions start with seated chair yoga and supported standing balance drills depending on mobility level. All drills prioritize safety, balance, and independence.",
    },

    // Category: Indian Diet Coaching
    {
      cat: "nutrition",
      q: "Do I have to give up rice, roti, or traditional Indian foods on the diet plan?",
      a: "No starvation diets. FitVed provides a flexible Indian meal plan tailored to your household cuisine (South Indian / North Indian). We optimize macro ratios and protein intake without removing home-cooked staples.",
    },
    {
      cat: "nutrition",
      q: "How do vegetarians hit daily protein targets on an Indian diet?",
      a: "We design custom meal breakdowns incorporating paneer, tofu, soya chunks, Greek yogurt, lentils, sprouts, and clean whey protein recommendations to hit optimal daily protein goals easily.",
    },
  ];

  const filteredFaqs = activeCategory === "all" ? faqs : faqs.filter((f) => f.cat === activeCategory);

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "FAQs", item: `${SITE_URL}/faqs` },
    ],
  };

  return (
    <div className="min-h-screen bg-fv-navy text-white flex flex-col justify-between">
      <BlogSeo
        title="Frequently Asked Questions — Personal Training, Yoga & Fitness | FitVed"
        description="Find answers to common questions about FitVed's personal training, yoga classes, pricing, society fitness, senior programs, prenatal yoga, and nutrition coaching in Bangalore."
        canonical={`${SITE_URL}/faqs`}
        image={`${SITE_URL}/fitved-logo.png`}
        type="website"
        keywords={["FAQ", "personal trainer Bangalore", "yoga classes FAQ", "fitness pricing", "society gym training"]}
        jsonLd={[faqSchema, breadcrumbSchema]}
      />
      <header className="sticky top-0 z-50 border-b border-white/10 bg-fv-navy/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img src={fitvedLogo} alt="FitVed" className="h-8 w-auto" />
          </Link>
          <Link
            to="/#contact"
            className="rounded-full bg-fv-orange px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-fv-orange/90 transition-colors shadow-md"
          >
            Book Free Trial
          </Link>
        </div>
      </header>

      <div className="py-16 md:py-24">
        <div className="mx-auto max-w-4xl px-4">
          {/* Back link */}
          <Link to="/" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fv-orange hover:underline mb-6">
            <ArrowLeft className="h-4 w-4" /> Back to Home Page
          </Link>

          <div className="text-left mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-px w-8 bg-fv-orange"></span>
              <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">Master Knowledge Base</span>
            </div>
            <h1 className="font-sans font-black uppercase text-4xl md:text-6xl tracking-tighter leading-none">
              FREQUENTLY ASKED <span className="text-fv-orange">QUESTIONS</span>
            </h1>
            <p className="mt-4 text-white/70 text-sm md:text-base leading-relaxed max-w-2xl">
              Complete answers to all your questions about personal training, therapeutic yoga, health conditions, prenatal care, senior fitness, and Indian diet plans in Bangalore.
            </p>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap gap-2 border-b border-white/10 pb-4 mb-8">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                  activeCategory === c.id
                    ? "bg-fv-orange text-white border-fv-orange shadow-md"
                    : "bg-white/5 text-white/70 border-white/10 hover:border-white/30 hover:text-white"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Accordion List */}
          <Accordion type="single" collapsible className="space-y-3">
            {filteredFaqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="bg-white/5 border border-white/10 rounded-xl px-5 transition-colors hover:border-fv-orange/30">
                <AccordionTrigger className="text-left text-white hover:text-fv-orange font-semibold hover:no-underline transition-colors uppercase tracking-wider text-xs md:text-sm py-4">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-white/75 leading-relaxed text-xs md:text-sm pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {/* CTA Box */}
          <div className="mt-12 bg-white/5 border border-white/15 rounded-2xl p-8 text-center">
            <h3 className="font-sans font-black uppercase text-2xl text-white">Have a specific health question?</h3>
            <p className="mt-2 text-xs md:text-sm text-white/70 max-w-md mx-auto">
              Our clinical fitness team &amp; senior coaches are here to help you get started safely.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/#contact" className="inline-flex items-center justify-center bg-fv-orange text-white hover:bg-fv-orange/90 h-12 px-8 text-xs font-bold uppercase tracking-wider rounded-full transition-all shadow-md">
                Book a Free Trial Session
              </Link>
              <a href="https://wa.me/919606047293" target="_blank" rel="noopener" className="inline-flex items-center justify-center border border-white/20 bg-white/10 text-white hover:bg-white/20 h-12 px-6 text-xs font-bold uppercase tracking-wider rounded-full transition-all">
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-white/40">
        © 2026 FitVed. All rights reserved. Society personal training &amp; yoga in Bangalore.
      </footer>
    </div>
  );
}
