import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Phone,
  MessageCircle,
  Menu,
  X,
  Building2,
  Users,
  Briefcase,
  Laptop,
  Check,
  Star,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Stethoscope,
  Activity,
  HeartPulse,
  MapPin,
  Baby,
  Heart,
  Dumbbell,
  Brain,
  Salad,
  MonitorSmartphone,
  UserCheck,
  Sparkles,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { resolveFeaturedImage } from "@/lib/blog/featuredImageMap";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from "@/components/ui/carousel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SEOFooter } from "@/components/blog/SEOFooter";
import { GeoSEOFooter } from "@/components/GeoSEOFooter";
import { z } from "zod";
import { cn } from "@/lib/utils";
import fitvedLogo from "@/assets/fitved-logo.png";
import monalisaFit from "@/assets/monalisa-fit.webp";
import monalisaDoubtful from "@/assets/monalisa-doubtful.webp";
import razorpayRizeLogo from "@/assets/razorpay-rize.svg";
const heroHands = "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=1920&q=80";

const PHONE = "+919606047293";
const PHONE_DISPLAY = "+91 9606047293";
const WHATSAPP_TEXT = encodeURIComponent("Hi, I'm interested in Fitved training. Can you help me?");
const WHATSAPP_URL = `https://wa.me/${PHONE.replace(/\D/g, "")}?text=${WHATSAPP_TEXT}`;

const NAV_SCROLL = [
  { id: "trainers", label: "Trainers" },
];

const NAV_DROPDOWNS = [
  {
    label: "Programs",
    items: [
      { heading: "Personal Training" },
      { label: "Weight Loss Program", href: "/weight-loss-program-bangalore" },
      { label: "Senior Fitness (55+)", href: "/senior-fitness-bangalore" },
      { label: "Women's Fitness", href: "/womens-fitness-bangalore" },
      { label: "Clinical / Post-Surgery", href: "/clinical-fitness-bangalore" },
      { heading: "Strength Training" },
      { label: "Strength Training", href: "/strength-training-bangalore" },
      { heading: "Yoga" },
      { label: "Yoga Classes", href: "/yoga-classes-bangalore" },
      { label: "Prenatal & Postnatal Yoga", href: "/prenatal-postnatal-yoga" },
    ],
  },
];

const leadSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
  interest: z.string().min(1, "Please choose an option").max(60),
});

const scrollTo = (id: string) => {
  if (id === "contact") {
    window.dispatchEvent(new Event("open_consult_modal"));
    return;
  }
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const trackEvent = (name: string, params: Record<string, unknown> = {}) => {
  // analytics shim — wired to GA4/Meta later
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (typeof w.gtag === "function") w.gtag("event", name, params);
  console.info("[track]", name, params);
};

/* ────────────────────────────────────────────────────────────────
   Scroll-reveal hook — triggers once per element as it enters view
──────────────────────────────────────────────────────────────────*/
function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.classList.contains("is-visible")) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return ref;
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState("home");
  const [showTimer, setShowTimer] = useState(false);
  const popupShown = useRef({ shown: false });

  // SEO meta
  useEffect(() => {
    document.title = "Yoga & Personal Trainers in Bangalore | At-Home Society Fitness — Fitved";
    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta(
      "description",
      "Looking for yoga teachers or personal trainers near you in Bangalore? Fitved brings certified yoga instructors and fitness trainers to your society — 1-on-1 and small-group sessions at your doorstep. Book a free trial."
    );
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", window.location.origin + "/");
  }, []);

  // Listen for consult modal open trigger
  useEffect(() => {
    const onOpenConsult = () => {
      setShowTimer(true);
    };
    window.addEventListener("open_consult_modal", onOpenConsult);
    return () => window.removeEventListener("open_consult_modal", onOpenConsult);
  }, []);

  // Active section observer
  useEffect(() => {
    const sections = NAV_SCROLL.map((n) => document.getElementById(n.id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  // Single popup: trigger on 30s timer OR exit-intent (whichever first)
  // Re-reads localStorage at trigger time so post-submit it never shows
  useEffect(() => {
    const trigger = () => {
      if (popupShown.current.shown) return;
      if (localStorage.getItem("fitved_form_submitted")) return;
      popupShown.current.shown = true;
      setShowTimer(true);
    };
    const t = window.setTimeout(trigger, 30000);
    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) trigger();
    };
    document.addEventListener("mouseleave", onLeave);

    // Also listen for the custom event fired after form submit
    const onFormDone = () => {
      popupShown.current.shown = true; // prevent popup from ever showing
      setShowTimer(false);             // close if already open
    };
    window.addEventListener("fitved_form_done", onFormDone);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("fitved_form_done", onFormDone);
    };
  }, []);

  return (
    <div className="min-h-screen bg-fv-navy text-white overflow-x-hidden">
      <Nav active={active} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />

      <main>
        {/* Question 1: What is FitVed? */}
        <Hero />

        {/* Question 3 & 4: What services & Who is it for? (Merged) */}
        <Services />

        {/* Client video testimonials */}
        <VideoTestimonials />

        {/* Question 5: Meet trainers */}
        <Trainers />

        {/* Section 1: Where We Train & Flagship Programs */}
        <section id="locations" className="pt-16 pb-12 md:pt-28 md:pb-16 bg-fv-navy border-t border-white/10">
          <div className="fluid-container">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <LocationsSection />
              <SpecializedProgramsSection />
            </div>
          </div>
        </section>

        {/* Section 2: How It Works & FAQ Hub */}
        <section id="process" className="pt-12 pb-16 md:pt-16 md:pb-24 bg-fv-navy border-t border-white/10">
          <div className="fluid-container">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
              <HowItWorksSection />
              <FAQSectionOnly />
            </div>
          </div>
        </section>

        {/* Section 3: FitVed Journal Exploration Section */}
        <HomepageJournalSection />
      </main>

      <Footer />
      {/* Explore Everything SEO Footer */}
      <SEOFooter bgClass="bg-slate-900 text-slate-200 border-t border-white/10" />
      <GeoSEOFooter />
      <MobileBar />
      <WhatsAppFloat />
      <DesktopFloatingCta />

      <LeadModal
        open={showTimer}
        onOpenChange={setShowTimer}
        source="consult_now_popup"
      />
    </div>
  );
}

/* ---------- NAV ---------- */
function Nav({
  active,
  menuOpen,
  setMenuOpen,
}: {
  active: string;
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
}) {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      {/* Blurred Backdrop Overlay on rest of website below top header */}
      {menuOpen && (
        <div
          className="lg:hidden fixed inset-0 top-16 z-30 bg-fv-navy/70 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-fv-navy/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2">
            <img src={fitvedLogo} alt="Fitved — Personal Fitness Trainers & Yoga Coaches in Bangalore" className="h-10 w-auto rounded bg-white/10 p-1" />
          </a>
          <nav className="hidden lg:flex items-center gap-0.5">
            {/* Dropdown menus */}
            {NAV_DROPDOWNS.map((dd) => (
              <div
                key={dd.label}
                className="relative"
                onMouseEnter={() => setOpenDropdown(dd.label)}
                onMouseLeave={() => setOpenDropdown(null)}
              >
                <button
                  className="flex items-center gap-1 rounded-md px-2.5 py-2 text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white transition-colors"
                >
                  {dd.label}
                  <ChevronDown className={cn("h-3 w-3 transition-transform", openDropdown === dd.label && "rotate-180")} />
                </button>
                {openDropdown === dd.label && (
                  dd.label === "Programs" ? (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-[620px] rounded-2xl border border-white/10 bg-fv-navy/95 backdrop-blur-xl shadow-elevated p-6 z-50 grid grid-cols-3 gap-6 text-left animate-in fade-in slide-in-from-top-2 duration-200">
                      {/* Column 1: Personal Training */}
                      <div className="flex flex-col">
                        <p className="pb-1.5 text-[10px] font-bold uppercase tracking-widest text-fv-orange border-b border-white/5 mb-3">
                          Personal Training
                        </p>
                        <div className="flex flex-col gap-2">
                          <a href="/weight-loss-program-bangalore" className="block text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-fv-orange transition-colors">
                            Weight Loss Program
                          </a>
                          <a href="/womens-fitness-bangalore" className="block text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-fv-orange transition-colors">
                            Women's Fitness
                          </a>
                          <a href="/senior-fitness-bangalore" className="block text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-fv-orange transition-colors">
                            Senior Fitness (55+)
                          </a>
                          <a href="/clinical-fitness-bangalore" className="block text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-fv-orange transition-colors">
                            Clinical / Post-Surgery
                          </a>
                        </div>
                      </div>

                      {/* Column 2: Strength Training */}
                      <div className="flex flex-col">
                        <p className="pb-1.5 text-[10px] font-bold uppercase tracking-widest text-fv-orange border-b border-white/5 mb-3">
                          Strength Training
                        </p>
                        <div className="flex flex-col gap-2">
                          <a href="/strength-training-bangalore" className="block text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-fv-orange transition-colors">
                            Strength Training
                          </a>
                        </div>
                      </div>

                      {/* Column 3: Yoga */}
                      <div className="flex flex-col">
                        <p className="pb-1.5 text-[10px] font-bold uppercase tracking-widest text-fv-orange border-b border-white/5 mb-3">
                          Yoga
                        </p>
                        <div className="flex flex-col gap-2">
                          <a href="/yoga-classes-bangalore" className="block text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-fv-orange transition-colors">
                            Yoga Classes
                          </a>
                          <a href="/prenatal-postnatal-yoga" className="block text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-fv-orange transition-colors">
                            Prenatal &amp; Postnatal Yoga
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute top-full left-0 mt-0.5 min-w-[220px] rounded-lg border border-white/10 bg-fv-navy/95 backdrop-blur-lg shadow-elevated py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      {dd.items.map((item, i) =>
                        item.heading ? (
                          <p
                            key={`h-${item.heading}`}
                            className={cn(
                              "px-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-fv-orange/80",
                              i === 0 ? "pt-1" : "pt-3 mt-1 border-t border-white/5"
                            )}
                          >
                            {item.heading}
                          </p>
                        ) : (
                          <a
                            key={item.href}
                            href={item.href}
                            className="block px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white/70 hover:text-fv-orange hover:bg-white/5 transition-colors"
                          >
                            {item.label}
                          </a>
                        )
                      )}
                    </div>
                  )
                )}
              </div>
            ))}
            {/* Online Training — highlighted */}
            <a
              href="/online-training"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-bold uppercase tracking-wider text-fv-orange hover:text-white hover:bg-fv-orange/90 transition-colors"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-fv-orange animate-pulse" /> Online Training
            </a>
            <Link
              to="/trainers"
              className="rounded-md px-2.5 py-2 text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white transition-colors"
            >
              Trainers
            </Link>
            <Link
              to="/corporate"
              className="rounded-md px-2.5 py-2 text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white transition-colors"
            >
              Corporate Wellness
            </Link>
            <a
              href="/societies/"
              className="rounded-md px-2.5 py-2 text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white transition-colors"
            >
              Societies
            </a>
            <Button
              onClick={() => scrollTo("contact")}
              className="ml-2 bg-fv-orange text-white hover:bg-fv-orange/90 transition-all uppercase tracking-wider text-xs font-bold px-4"
            >
              Speak to a Coach
            </Button>
            <Link
              to="/login"
              className="ml-1 text-xs font-bold uppercase tracking-wider text-white/70 hover:text-white px-2 transition-colors"
            >
              Log in
            </Link>
          </nav>
          <button
            aria-label="Open menu"
            className="lg:hidden rounded-md p-2 text-white"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {menuOpen && (
          <div className="lg:hidden border-t border-white/10 bg-fv-navy max-h-[80vh] overflow-y-auto relative z-50">
            <div className="mx-auto max-w-6xl px-4 py-3 flex flex-col">
              {/* Mobile dropdown sections */}
              {NAV_DROPDOWNS.map((dd) => (
                <div key={dd.label} className="border-b border-white/5">
                  <button
                    onClick={() => setMobileExpanded(mobileExpanded === dd.label ? null : dd.label)}
                    className="w-full py-3 text-left text-base font-semibold uppercase tracking-wider text-white flex items-center justify-between"
                  >
                    {dd.label}
                    <ChevronDown className={cn("h-4 w-4 transition-transform text-white/50", mobileExpanded === dd.label && "rotate-180")} />
                  </button>
                  {mobileExpanded === dd.label && (
                    <div className="pb-3 pl-4 flex flex-col gap-1">
                      {dd.items.map((item) =>
                        item.heading ? (
                          <p key={`h-${item.heading}`} className="pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-fv-orange/80">
                            {item.heading}
                          </p>
                        ) : (
                          <a
                            key={item.href}
                            href={item.href}
                            className="py-2 text-sm font-medium text-white/60 hover:text-fv-orange transition-colors"
                            onClick={() => setMenuOpen(false)}
                          >
                            {item.label}
                          </a>
                        )
                      )}
                    </div>
                  )}
                </div>
              ))}
              <Link
                to="/trainers"
                className="py-3 text-left text-base font-semibold uppercase tracking-wider text-white border-b border-white/5"
                onClick={() => setMenuOpen(false)}
              >
                Trainers
              </Link>
              <a
                href="/personal-trainer/bangalore"
                className="py-3 text-left text-base font-semibold uppercase tracking-wider text-white border-b border-white/5"
                onClick={() => setMenuOpen(false)}
              >
                Personal Trainer Bangalore
              </a>
              <Link
                to="/corporate"
                className="py-3 text-left text-base font-semibold uppercase tracking-wider text-white border-b border-white/5"
                onClick={() => setMenuOpen(false)}
              >
                Corporate Wellness
              </Link>
              <a
                href="/online-training"
                className="py-3 text-left text-base font-bold uppercase tracking-wider text-fv-orange border-b border-white/5 inline-flex items-center gap-2"
                onClick={() => setMenuOpen(false)}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-fv-orange animate-pulse" /> Online Training
              </a>
              <a
                href="/societies/"
                className="py-3 text-left text-base font-semibold uppercase tracking-wider text-white border-b border-white/5"
                onClick={() => setMenuOpen(false)}
              >
                Societies
              </a>
              <Link
                to="/login"
                className="py-3 text-left text-base font-semibold uppercase tracking-wider text-white/70"
                onClick={() => setMenuOpen(false)}
              >
                Log in
              </Link>
            </div>
          </div>
        )}
      </header>
    </>
  );
}

const HERO_SERVICES = [
  "Strength",
  "Weight Loss",
  "Yoga",
  "Mobility",
  "Clinical Fitness",
];

const HERO_IMAGES = [
  "/gallery/class-1.jpg",
  "/gallery/class-2.jpg",
  "/gallery/class-3.jpg",
  "/gallery/class-4.jpg",
  "/gallery/class-5.jpg",
];

const HERO_LOCATIONS = [
  { name: "HSR Layout", href: "/service-areas" },
  { name: "Whitefield", href: "/service-areas" },
  { name: "Sarjapur", href: "/service-areas" },
  { name: "Bellandur", href: "/service-areas" },
  { name: "Electronic City", href: "/service-areas" },
  { name: "Koramangala", href: "/service-areas" },
  { name: "Marathahalli", href: "/service-areas" },
  { name: "Varthur", href: "/service-areas" },
];

const HERO_WORDS = [
  "REDUCE PAIN",
  "REDUCE WEIGHT",
  "FEEL ENERGETIC",
  "BUILD STRENGTH",
  "REGAIN MOBILITY",
  "STAY FIT",
];

/* ---------- HERO ---------- */
function Hero() {
  const [imageIndex, setImageIndex] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const cycleImage = setInterval(() => {
      setImageIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, 4000);
    return () => clearInterval(cycleImage);
  }, []);

  useEffect(() => {
    const cycleWord = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setWordIndex((prev) => (prev + 1) % HERO_WORDS.length);
        setFade(true);
      }, 300);
    }, 2800);
    return () => clearInterval(cycleWord);
  }, []);

  return (
    <section
      id="home"
      className="relative overflow-hidden text-white bg-fv-navy min-h-[calc(100svh-4rem)] md:min-h-[85vh] pt-8 pb-24 md:py-24 lg:py-28 flex items-stretch md:items-center border-b border-white/10"
    >
      {/* Background Subtle Overlay */}
      <img
        src={heroHands}
        alt="Yoga and personal training session in a Bangalore apartment society"
        className="absolute inset-0 h-full w-full object-cover object-center opacity-20 hero-bg-zoom"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-fv-navy via-fv-navy/90 to-fv-navy/60" />

      <div className="relative fluid-container-hero grid md:grid-cols-12 gap-8 lg:gap-12 items-stretch md:items-center w-full z-10">
        {/* Left Column: Clean, High-Impact Hero Copy */}
        <div className="md:col-span-7 lg:col-span-7 animate-fade-in text-left flex flex-col justify-between md:block">
          {/* Group 1: badge + headline + subheadline — sits in the upper area on mobile */}
          <div>
            {/* Badge Pill */}
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-[11px] md:text-xs font-bold uppercase tracking-widest border border-white/20 text-white mb-4 sm:mb-6">
              <ShieldCheck className="h-3.5 w-3.5 text-fv-orange" /> YOUR SOCIETY, YOUR TIME, OUR TRAINER
            </span>

            {/* Headline with Animated Rotating Terms */}
            <h1 className="font-sans font-black uppercase fluid-hero-title leading-none">
              JOIN US TO <br />
              <span
                className={cn(
                  "text-fv-orange inline-block transition-all duration-300 transform mt-1",
                  fade ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                )}
              >
                {HERO_WORDS[wordIndex]}
              </span>
            </h1>

            {/* Subheadline */}
            <p className="mt-4 sm:mt-4 fluid-subheading text-white/70 max-w-lg leading-relaxed font-normal">
              Certified personal fitness trainers bringing expert 1-on-1 coaching straight to your doorstep.
            </p>

            {/* Clean Proportional Dual Pill CTAs */}
            <div className="mt-6 sm:mt-7 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-4 max-w-sm sm:max-w-none">
            <Button
              onClick={() => {
                trackEvent("hero_cta_clicked");
                scrollTo("contact");
              }}
              className="bg-fv-orange text-white hover:bg-fv-orange/90 h-11 sm:h-12 px-7 text-xs sm:text-sm font-bold uppercase tracking-wider rounded-full shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fv-orange"
            >
              START TODAY
            </Button>
            <Button
              variant="outline"
              onClick={() => scrollTo("services")}
              className="border-white/30 bg-transparent text-white hover:bg-white/10 h-11 sm:h-12 px-7 text-xs sm:text-sm font-bold uppercase tracking-wider rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              EXPLORE PROGRAMS
            </Button>
            </div>
          </div>

          {/* Key Stats Row with Divider Line */}
          <div className="pt-4 sm:pt-5 border-t border-white/10 flex flex-wrap items-center gap-x-4 sm:gap-x-5 gap-y-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-white/50">
            <span className="flex items-center gap-2"><span className="text-fv-orange font-bold">•</span> 110+ TRAINED</span>
            <span className="flex items-center gap-2"><span className="text-fv-orange font-bold">•</span> 10+ SOCIETIES</span>
            <span className="flex items-center gap-2"><span className="text-fv-orange font-bold">•</span> EXPERT CLINICAL PROTOCOLS</span>
          </div>
        </div>

        {/* Right Column: Glowing Visual Image Card */}
        <div className="md:col-span-5 lg:col-span-5 animate-fade-in md:flex justify-end items-center hidden" style={{ animationDelay: "0.15s" }}>
          <div className="relative p-1 w-full max-w-[380px] lg:max-w-[420px]">
            {/* Ambient Orange Glow Effect */}
            <div className="absolute -inset-2 rounded-3xl bg-fv-orange/20 blur-2xl opacity-60"></div>
            
            <div className="relative rounded-3xl border border-white/20 overflow-hidden aspect-[4/4.8] bg-fv-navy shadow-[0_0_50px_rgba(249,115,22,0.25)]">
              {HERO_IMAGES.map((imgUrl, idx) => (
                <img
                  key={imgUrl}
                  src={imgUrl}
                  alt={`Fitved personal training session in Bangalore society - ${idx + 1}`}
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover grayscale contrast-125 transition-opacity duration-1000 ease-in-out",
                    idx === imageIndex ? "opacity-85 z-0" : "opacity-0 pointer-events-none"
                  )}
                />
              ))}
              <div className="absolute inset-0 bg-gradient-to-t from-fv-navy via-fv-navy/20 to-transparent z-10"></div>

              {/* Overlay Stat badge: Body Age Reversal */}
              <div className="absolute bottom-5 left-5 right-5 p-4 sm:p-5 rounded-2xl bg-fv-navy/90 backdrop-blur border border-white/20 z-20 text-left">
                <span className="text-[10px] font-bold uppercase tracking-widest text-fv-orange block">BODY AGE REVERSAL</span>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-sans font-black text-3xl text-white">42</span>
                  <span className="text-xs text-white/50 uppercase">to</span>
                  <span className="font-sans font-black text-3xl text-fv-orange">38</span>
                  <span className="text-[11px] text-white/60 ml-1">in 12 weeks</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div
        onClick={() => scrollTo("services")}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-50 hover:opacity-100 transition-opacity cursor-pointer hidden md:flex"
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-white">Scroll</span>
        <div className="h-8 w-px bg-white/40"></div>
      </div>
    </section>
  );
}



/* ---------- STAGE 2: TRUST & CREDIBILITY BAR ---------- */
function TrustBar() {
  return (
    <section className="hidden sm:block py-4 md:py-5 bg-fv-navy/95 border-b border-white/10">
      <div className="fluid-container-hero">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 text-center md:text-left">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-fv-orange/30 transition-all duration-200 shadow-card">
            <div className="text-xl md:text-2xl font-black text-fv-orange shrink-0">110+</div>
            <div className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-white/70 leading-tight">
              Transformations Completed
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-fv-orange/30 transition-all duration-200 shadow-card">
            <div className="text-xl md:text-2xl font-black text-fv-orange shrink-0">10+</div>
            <div className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-white/70 leading-tight">
              Top Societies Served
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-fv-orange/30 transition-all duration-200 shadow-card">
            <div className="text-xl md:text-2xl font-black text-fv-orange shrink-0">0 Mins</div>
            <div className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-white/70 leading-tight">
              Commute Time (Home/Society)
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:border-fv-orange/30 transition-all duration-200 shadow-card">
            <div className="text-xl md:text-2xl font-black text-fv-orange shrink-0">100%</div>
            <div className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-white/70 leading-tight">
              AYUSH &amp; ACE Certified
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- WHO IS FITVED FOR? (Audience Targeting) ---------- */
function WhoIsItFor() {
  const ref = useReveal();
  const audiences = [
    {
      icon: Briefcase,
      title: "Working Professionals",
      desc: "Desk-job posture fix, stress relief, and sustainable fitness — train before or after work in your society.",
      href: "/personal-training",
    },
    {
      icon: HeartPulse,
      title: "Senior Citizens (55+)",
      desc: "Doctor-approved movement for BP, diabetes, arthritis. Rebuild strength, balance, and independence.",
      href: "/senior-fitness-bangalore",
    },
    {
      icon: Heart,
      title: "Women's Fitness",
      desc: "Safe, private training designed for women — strength, flexibility, hormonal health, and confidence.",
      href: "/womens-fitness-bangalore",
    },
    {
      icon: Baby,
      title: "Pregnancy Yoga",
      desc: "Gentle, certified pregnancy yoga and postnatal recovery — at your home with expert guidance.",
      href: "/prenatal-postnatal-yoga",
    },
    {
      icon: Dumbbell,
      title: "Weight Loss",
      desc: "Structured 12-week programs combining strength training, nutrition coaching, and accountability.",
      href: "/weight-loss-program-bangalore",
    },
    {
      icon: Stethoscope,
      title: "Diabetes / BP / Arthritis",
      desc: "Clinical fitness protocols for chronic conditions. Many clients reduce medication within months.",
      href: "/clinical-fitness-bangalore",
    },
    {
      icon: Building2,
      title: "Corporate Teams",
      desc: "Office yoga, team fitness, and wellness workshops for employee health and productivity.",
      href: "/corporate",
    },
    {
      icon: Users,
      title: "Couples & Friends",
      desc: "Semi-private sessions with your partner or neighbours — affordable, fun, and social.",
      href: "#contact",
    },
    {
      icon: Activity,
      title: "Post-Surgery Recovery",
      desc: "Medically-informed rehab training — safe progression from your doctor's clearance to full fitness.",
      href: "/clinical-fitness-bangalore",
    },
  ];

  return (
    <section id="who" className="py-10 md:py-14 bg-fv-navy border-t border-white/10">
      <div ref={ref} className="reveal mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="h-px w-8 bg-fv-orange"></span>
            <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">Who It&apos;s For</span>
            <span className="h-px w-8 bg-fv-orange"></span>
          </div>
          <h2 className="font-sans font-black uppercase text-3xl md:text-5xl tracking-tighter leading-none">
            WHO IS <span className="text-fv-orange">FITVED</span> FOR?
          </h2>
          <p className="mt-4 text-white/60 text-sm leading-relaxed">
            Whether you&apos;re 25 or 75, recovering from surgery or training for your first 5K — we have a certified specialist for you.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {audiences.map((a) => {
            const Icon = a.icon;
            const isExternal = !a.href.startsWith("#") && !a.href.startsWith("/corporate");
            return (
              <a
                key={a.title}
                href={a.href}
                className="group bg-white/5 border border-white/10 rounded-xl p-5 transition-all duration-300 hover:border-fv-orange/30 hover:bg-white/[0.07] hover:-translate-y-1 text-left flex flex-col"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-fv-orange/10 text-fv-orange">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-sans font-black uppercase text-sm text-white tracking-wider leading-tight group-hover:text-fv-orange transition-colors">
                      {a.title}
                    </h3>
                    <p className="mt-1.5 text-xs text-white/60 leading-relaxed">
                      {a.desc}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-white/30 group-hover:text-fv-orange transition-colors shrink-0 mt-1" />
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- ZERO EXCUSE (USP) ---------- */
function ZeroExcuse() {
  const [isFit, setIsFit] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setIsFit((v) => !v), 1800);
    return () => clearInterval(t);
  }, []);

  const ref = useReveal();

  const excuses = [
    {
      problem: "Time and travel issue?",
      solution: "Fitved comes to your society — train inside your own building.",
    },
    {
      problem: "Workout feels monotonous?",
      solution: "A thoughtful mix of weights, yoga and pilates — every week different.",
    },
    {
      problem: "Working out alone is boring?",
      solution: "We make it a group activity with neighbours and friends.",
    },
    {
      problem: "I travel a lot for work?",
      solution: "Carry forward missed classes — never lose what you paid for.",
    },
    {
      problem: "My medical condition won't allow it?",
      solution: "Train with clinical specialists who understand your medical history.",
    },
    {
      problem: "Difficult to commit a fixed time?",
      solution: "Flexible scheduling that adapts to your day — not the other way around.",
    },
  ];

  return (
    <section id="usp" className="py-8 md:py-12 bg-fv-navy border-t border-white/10">
      <div ref={ref} className="reveal mx-auto max-w-6xl px-4 grid lg:grid-cols-12 gap-8 items-center">
        {/* Left Side: Mona Lisa Portrait & Text */}
        <div className="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left">
          <div className="relative p-1">
            {/* Orange border offset */}
            <div className="absolute -bottom-3 -left-3 w-full h-full rounded-2xl border-2 border-fv-orange translate-x-1.5 translate-y-1.5 -z-10" />
            <div className="relative w-44 md:w-52 rounded-2xl overflow-hidden shadow-elevated bg-[#13243a]" style={{ aspectRatio: "4/5" }}>
              {/* Doubtful Mona Lisa */}
              <img
                src={monalisaDoubtful}
                alt="Mona Lisa looking doubtful"
                className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 grayscale contrast-110"
                style={{ opacity: isFit ? 0 : 1 }}
              />
              {/* Fit Mona Lisa */}
              <img
                src={monalisaFit}
                alt="Mona Lisa in workout attire"
                className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700 grayscale group-hover:grayscale-0"
                style={{ opacity: isFit ? 1 : 0 }}
              />
              {/* Label badge */}
              <span
                className={cn(
                  "absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all duration-700",
                  isFit
                    ? "bg-fv-orange text-white"
                    : "bg-fv-navy/80 text-white/80 border border-white/10"
                )}
              >
                {isFit ? "After Fitved ✓" : "Before Fitved…"}
              </span>
            </div>
          </div>

          <h2 className="mt-6 font-sans font-black uppercase text-3xl md:text-4xl tracking-tighter leading-none text-white">
            Fitved is your <br />
            <span className="text-fv-orange">zero-excuse</span> fit partner.
          </h2>
          <p className="mt-3 text-white/70 text-sm leading-relaxed max-w-sm">
            Whatever's been stopping you — we've already solved for it.
          </p>
        </div>

        {/* Right Side: 6 USP Cards */}
        <div className="lg:col-span-7 grid sm:grid-cols-2 gap-4">
          {excuses.map((e, idx) => (
            <div
              key={idx}
              className="bg-white/5 border border-white/10 p-4 rounded-xl transition-all duration-300 hover:border-fv-orange/30 hover:bg-white/[0.07] text-left"
            >
              <h3 className="font-sans font-black uppercase text-sm text-white tracking-wider">
                {e.problem}
              </h3>
              <div className="mt-2 flex items-start gap-2">
                <Check className="h-4 w-4 text-fv-orange shrink-0 mt-0.5" />
                <p className="text-xs text-white/70 leading-relaxed">
                  {e.solution}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- PROBLEM / SOLUTION (About Us) ---------- */
function ProblemSolution() {
  const ref = useReveal();
  const problems = [
    {
      icon: Briefcase,
      title: "Corporate Professionals",
      points: [
        "Sitting 10 hours/day destroying posture",
        "No time for gym commute, need convenience",
        "Want long-term health, not just weight loss",
      ],
    },
    {
      icon: HeartPulse,
      title: "Seniors (55+)",
      points: [
        "Managing BP, diabetes, arthritis with medication",
        "Afraid of injury, need expert supervision",
        "Want independence at 70, not nursing home at 65",
      ],
    },
    {
      icon: Activity,
      title: "Recovery Clients",
      points: [
        "Cleared by doctor but don't know where to start",
        "Afraid of re-injury without proper guidance",
        "Generic gym programs ignore surgery history",
      ],
    },
  ];

  const stats = [
    { val: "110+", label: "Transformations" },
    { val: "12 Weeks", label: "Avg Programme" },
    { val: "100%", label: "Personalised Plans" },
    { val: "5.0 ★", label: "Trainer Rating" },
  ];

  return (
    <section id="about" className="py-8 md:py-12 bg-fv-navy border-t border-white/10">
      <div ref={ref} className="reveal mx-auto max-w-6xl px-4 grid lg:grid-cols-12 gap-8 items-center">
        {/* Left Side: Photo with offset frame */}
        <div className="lg:col-span-5 relative">
          <div className="absolute -bottom-4 -left-4 w-full h-full rounded-2xl border-2 border-fv-orange translate-x-2 translate-y-2 -z-10" />
          <div className="relative overflow-hidden rounded-2xl aspect-[4/5] shadow-2xl bg-[#13243a]">
            <img
              src="/gallery/class-5.jpg"
              alt="Transformation and Fitness Roster"
              className="w-full h-full object-cover grayscale contrast-110"
            />
            {/* Absolute badge */}
            <div className="absolute bottom-4 right-4 bg-fv-orange text-white font-bold text-xs uppercase tracking-widest px-4 py-2 rounded shadow-lg">
              100+ Happy Members
            </div>
          </div>
        </div>

        {/* Right Side: Text + Stats Grid */}
        <div className="lg:col-span-7 text-left">
          <div className="flex items-center gap-2 mb-3">
            <span className="h-px w-8 bg-fv-orange"></span>
            <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">
              ABOUT US
            </span>
          </div>

          <h2 className="font-sans font-black uppercase text-4xl md:text-5xl leading-none tracking-tighter">
            TRANSFORM <span className="text-fv-orange">YOUR LIFE</span>
          </h2>

          <p className="mt-4 text-white/70 leading-relaxed text-sm md:text-base">
            At Fitved, we're dedicated to helping you embrace a healthier lifestyle — making physical fitness and a balanced diet your priority. We bring the clinical support you need to enhance your quality of life, wherever you are.
          </p>

          <p className="mt-3 text-sm italic text-white/50 border-l-2 border-fv-orange pl-4">
            "A good workout doesn't just strengthen your body — it strengthens your mindset too."
          </p>

          {/* Grid of stats */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            {stats.map((s, idx) => (
              <div
                key={idx}
                className="bg-white/5 border border-white/10 rounded-xl p-3 transition-all duration-300 hover:border-fv-orange/30 hover:bg-white/[0.07]"
              >
                <div className="text-3xl font-black text-fv-orange leading-none">{s.val}</div>
                <div className="text-xs uppercase tracking-wider text-white/60 mt-2 font-semibold">{s.label}</div>
              </div>
            ))}
          </div>

          <a
            href={`tel:${PHONE}`}
            onClick={() => trackEvent("phone_clicked", { from: "about_call_now" })}
            className="inline-block mt-5"
          >
            <Button
              className="bg-fv-orange text-white hover:bg-fv-orange/90 px-8 py-3 text-xs font-black uppercase tracking-wider transition-all hover:scale-[1.03]"
            >
              Call Now
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------- VALUE COMPARISON MATRIX ---------- */
function ValueComparisonMatrix() {
  const ref = useReveal();
  const rows = [
    {
      feature: "Travel & Commute",
      fitved: "0 Mins (Inside Your Building)",
      gyms: "30–45 Mins Traffic Daily",
      cult: "20–30 Mins Commute",
    },
    {
      feature: "Attention & Coaching",
      fitved: "1-on-1 Dedicated / 4–6 Small Group",
      gyms: "Shared Floor / Zero Form Check",
      cult: "Crowded Group Classes (20+)",
    },
    {
      feature: "Medical History Review",
      fitved: "Included (Clinical Protocols)",
      gyms: "Ignored (Generic Routines)",
      cult: "Ignored (Fixed Workout)",
    },
    {
      feature: "Diet & Nutrition Plan",
      fitved: "Custom Indian Metabolic Plan",
      gyms: "Extra ₹5,000+ Fee or None",
      cult: "None Included",
    },
    {
      feature: "Missed Session Policy",
      fitved: "100% Carry Forward Rollover",
      gyms: "Lost Forever",
      cult: "Class Penalty",
    },
  ];

  return (
    <section id="difference" className="py-12 md:py-16 bg-fv-navy border-t border-white/10">
      <div ref={ref} className="reveal mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="h-px w-8 bg-fv-orange"></span>
            <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">Why FitVed Wins</span>
            <span className="h-px w-8 bg-fv-orange"></span>
          </div>
          <h2 className="font-sans font-black uppercase text-3xl md:text-5xl tracking-tighter leading-none">
            THE FITVED <span className="text-fv-orange">DIFFERENCE</span>
          </h2>
          <p className="mt-3 text-white/60 text-sm leading-relaxed">
            See how society-based personal training compares to traditional commercial gyms and group fitness chains.
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 shadow-elevated">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-white/10 bg-fv-navy/90 text-xs font-black uppercase tracking-wider text-white">
                <th className="py-4 px-6 w-1/4">Key Feature</th>
                <th className="py-4 px-6 w-1/3 bg-fv-orange/15 text-fv-orange border-x border-fv-orange/20">
                  FitVed Society Fitness
                </th>
                <th className="py-4 px-6 w-1/5 text-white/50">Commercial Gyms</th>
                <th className="py-4 px-6 w-1/5 text-white/50">Cult.fit Centers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs md:text-sm">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-white/[0.03] transition-colors">
                  <td className="py-4 px-6 font-bold text-white uppercase tracking-wider text-xs">
                    {r.feature}
                  </td>
                  <td className="py-4 px-6 font-bold text-white bg-fv-orange/10 border-x border-fv-orange/15">
                    <span className="text-fv-orange mr-1.5">✓</span> {r.fitved}
                  </td>
                  <td className="py-4 px-6 text-white/50">{r.gyms}</td>
                  <td className="py-4 px-6 text-white/50">{r.cult}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------- SERVICES (Personal Fitness Services) ---------- */
function Services() {
  const ref = useReveal();
  const [filter, setFilter] = useState("all");
  const [showMore, setShowMore] = useState(false);

  const services = [
    {
      num: "01",
      title: "Personal Trainer",
      audience: "For Working Professionals",
      category: "professionals",
      desc: "1-on-1 customized programs in your society gym. Medical history analysis, body composition tracking, weekly progress reviews.",
      href: "/personal-training",
      img: "/gallery/class-4.jpg",
    },
    {
      num: "02",
      title: "Yoga Classes",
      audience: "For Flexibility & Posture",
      category: "yoga",
      desc: "Society-based yoga blending strength, breathwork, posture correction, and full-body mobility. All levels welcome.",
      href: "/yoga-classes-bangalore",
      img: "/gallery/class-1.jpg",
    },
    {
      num: "03",
      title: "Prenatal & Postnatal Yoga",
      audience: "For Expectant & New Mothers",
      category: "women",
      desc: "Safe pregnancy yoga plus postpartum recovery — breath-led movement, pelvic strength, and core rebuilding with certified instructors.",
      href: "/prenatal-postnatal-yoga",
      img: "/gallery/class-3.jpg",
    },
    {
      num: "04",
      title: "Weight Loss Program",
      audience: "For Sustainable Fat Loss",
      category: "professionals",
      desc: "12-week structured fat loss with strength training, metabolic nutrition plans, and weekly accountability.",
      href: "/weight-loss-program-bangalore",
      img: "/gallery/class-5.jpg",
    },
    {
      num: "05",
      title: "Senior Fitness (55+)",
      audience: "For Seniors & Active Aging",
      category: "seniors",
      desc: "Safe, supervised exercise for older adults — BP, diabetes, arthritis management with medically-informed training.",
      href: "/senior-fitness-bangalore",
      img: "/gallery/class-4.jpg",
    },
    {
      num: "06",
      title: "Clinical Rehab & Exercise",
      audience: "For Back Pain & Rehab",
      category: "rehab",
      desc: "Medically-informed rehab for post-knee surgery, back pain, discectomy recovery, and cardiac protocols.",
      href: "/clinical-fitness-bangalore",
      img: "/gallery/class-5.jpg",
    },
    {
      num: "07",
      title: "Diet & Nutrition",
      audience: "For Metabolic Nutrition",
      category: "professionals",
      desc: "Custom metabolic nutrition programs. Weekly dietary updates, optimal macro breakdown, and gut health support.",
      href: "/diet-coaching-bangalore",
      img: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
    },
    {
      num: "08",
      title: "Online Training",
      audience: "For Remote & Global Clients",
      category: "professionals",
      desc: "Train from anywhere with video-guided sessions, personalized programs, and real-time trainer feedback.",
      href: "/online-training",
      img: "/gallery/class-3.jpg",
    },
  ];

  const filterTabs = [
    { id: "all", label: "All Services" },
    { id: "professionals", label: "Working Professionals" },
    { id: "seniors", label: "Seniors 55+" },
    { id: "women", label: "Women & Maternity" },
    { id: "rehab", label: "Medical Rehab" },
  ];

  const filteredServices = filter === "all" ? services : services.filter((s) => s.category === filter);

  return (
    <section id="services" className="pt-10 pb-14 md:pt-14 md:pb-20 bg-fv-navy border-t border-white/10">
      <div className="fluid-container-services">
        {/* Header Block */}
        <div className="text-left">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-px w-8 bg-fv-orange"></span>
            <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">
              SERVICES &amp; TARGET PROGRAMS
            </span>
          </div>
          <h2 className="font-sans font-black uppercase fluid-heading">
            WHO WE SERVE &amp; <span className="text-fv-orange">OUR OFFERINGS</span>
          </h2>
        </div>

        {/* Filter Pills Bar */}
        <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-white/10 pb-4">
          {filterTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setFilter(t.id);
                setShowMore(true);
              }}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border",
                filter === t.id
                  ? "bg-fv-orange text-white border-fv-orange shadow-md"
                  : "bg-white/5 text-white/70 border-white/10 hover:border-white/30 hover:text-white"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 5 Cards Per Row on PC View (Covers Full Width) / Mobile-Only Expandable View */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
          {filteredServices.map((c, idx) => (
            <div
              key={c.num}
              onClick={() => {
                trackEvent("service_card_clicked", { title: c.title });
                scrollTo("contact");
              }}
              className={cn(
                "group relative overflow-hidden rounded-2xl aspect-[4/4] border border-white/10 cursor-pointer bg-fv-navy transition-all duration-300 hover:-translate-y-1 hover:border-fv-orange/40",
                !showMore && idx >= 4 ? "hidden" : "block"
              )}
            >
              {/* Card BG Image */}
              <img
                src={c.img}
                alt={`${c.title} in Bangalore — Fitved`}
                loading="lazy"
                className="w-full h-full object-cover transition-all duration-700 sm:group-hover:scale-110 grayscale-0 sm:grayscale sm:group-hover:grayscale-0 sm:group-hover:contrast-100 contrast-125 opacity-55 sm:opacity-40 sm:group-hover:opacity-75"
              />

              {/* Bottom Dark Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-fv-navy/95 via-fv-navy/60 to-transparent transition-all duration-300"></div>

              {/* Card Contents — heading + CTA only (no badge / description) */}
              <div className="absolute inset-0 p-4 flex flex-col justify-between text-left">
                <span className="text-sm font-black text-fv-orange tracking-widest">
                  {c.num}
                </span>
                <div>
                  <h3 className="font-sans font-black uppercase text-lg leading-tight text-white mb-1.5 sm:group-hover:text-fv-orange transition-colors">
                    {c.title}
                  </h3>
                  <span className="inline-flex items-center gap-1 text-fv-orange text-[10px] font-black uppercase tracking-wider opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300">
                    Book Free Trial <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* View More toggle (mobile + desktop) */}
        {filteredServices.length > 4 && (
          <div className="mt-8 text-center">
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowMore((prev) => !prev);
              }}
              variant="outline"
              className="border-fv-orange/40 bg-fv-orange/10 text-white hover:bg-fv-orange hover:border-fv-orange font-bold uppercase tracking-wider text-xs h-12 px-8 rounded-full transition-all gap-2 shadow-md hover:scale-105"
            >
              {showMore ? (
                <>Show Fewer Services <ChevronUp className="h-4 w-4" /></>
              ) : (
                <>View More Services <ChevronDown className="h-4 w-4 text-fv-orange group-hover:text-white" /></>
              )}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------- LOCATIONS SECTION ---------- */
function LocationsSection() {
  const ref = useReveal();
  const locations = [
    { name: "HSR Layout", slug: "hsr-layout", societies: "Salarpuria Senorita, Brigade Orchards" },
    { name: "Whitefield", slug: "whitefield", societies: "Brigade Cosmopolis, Prestige Shantiniketan" },
    { name: "Sarjapur Road", slug: "sarjapur-road", societies: "Sobha City, Mantri Energia" },
    { name: "Bellandur", slug: "bellandur", societies: "Adarsh Palm Retreat, Mantri Espana" },
    { name: "Electronic City", slug: "electronic-city", societies: "Purva Windermere, Prestige Falcon City" },
    { name: "Koramangala", slug: "koramangala", societies: "Raheja Residency, DNR Atmosphere" },
    { name: "Marathahalli", slug: "marathahalli", societies: "Gopalan Grandeur, Salarpuria Greenage" },
    { name: "Varthur", slug: "varthur", societies: "Lakeside Habitat, Assetz Marq" },
  ];

  return (
    <div id="locations" className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-7 md:p-8 text-left flex flex-col justify-between h-full shadow-card hover:border-fv-orange/30 transition-all duration-200">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="h-px w-6 bg-fv-orange"></span>
          <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">Serving Bangalore</span>
        </div>
        <h2 className="font-sans font-black uppercase text-2xl md:text-3xl lg:text-4xl tracking-tighter leading-none mb-2">
          WHERE WE <span className="text-fv-orange">TRAIN</span>
        </h2>
        <p className="text-white/60 text-xs sm:text-sm leading-relaxed mb-6">
          Certified personal trainers and yoga coaches in your neighbourhood. We train inside apartment societies across Bangalore.
        </p>

        <div className="grid grid-cols-2 gap-3.5">
          {locations.map((loc) => (
            <a
              key={loc.slug}
              href="/service-areas"
              className="group bg-white/5 border border-white/10 rounded-xl p-3.5 sm:p-4 transition-all duration-300 hover:border-fv-orange/30 hover:bg-white/[0.07]"
            >
              <div className="flex items-center gap-2 mb-1.5 min-w-0">
                <MapPin className="h-4.5 w-4.5 text-fv-orange shrink-0" />
                <h3 className="font-sans font-black uppercase text-xs sm:text-sm text-white tracking-wider group-hover:text-fv-orange transition-colors leading-none truncate">
                  {loc.name}
                </h3>
              </div>
              <p className="text-[10px] sm:text-[11px] text-white/40 leading-normal line-clamp-1">
                {loc.societies}
              </p>
            </a>
          ))}
        </div>
      </div>

      <div className="text-center mt-6 pt-3.5 border-t border-white/10">
        <p className="text-xs sm:text-sm text-white/40">
          Don&apos;t see your area?{" "}
          <button onClick={() => scrollTo("contact")} className="text-fv-orange hover:underline font-bold">
            Tell us your location →
          </button>
        </p>
      </div>
    </div>
  );
}

/* ---------- GALLERY ---------- */
const GALLERY = [
  { src: "/gallery/class-4.jpg", alt: "Trainer guiding students through seated stretch" },
  { src: "/gallery/class-3.jpg", alt: "Outdoor group yoga session in a society compound" },
  { src: "/gallery/class-2.jpg", alt: "Pranayama breathing session with trainer" },
  { src: "/gallery/class-1.jpg", alt: "Partner yoga mobility drill in society gym" },
  { src: "/gallery/class-5.jpg", alt: "Indoor strength and flexibility class" },
  { src: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=80", alt: "Breathwork and meditation" },
];

function Gallery() {
  const ref = useReveal(0.1);
  return (
    <section className="py-8 md:py-12 bg-fv-navy border-t border-white/10">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">INSIDE A FITVED SESSION</span>
          <h2 className="mt-3 font-sans font-black uppercase text-3xl md:text-5xl tracking-tighter leading-none">
            REAL CLASSES, RIGHT IN <span className="text-fv-orange">YOUR SOCIETY</span>
          </h2>
          <p className="mt-4 text-white/60 text-sm leading-relaxed">
            Small groups, expert trainers, and a room full of neighbours showing up for themselves.
          </p>
        </div>

        <div ref={ref} className="reveal mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 max-w-5xl mx-auto">
          {GALLERY.map((g, i) => (
            <div
              key={g.src}
              className="overflow-hidden rounded-xl bg-[#13243a] group cursor-pointer border border-white/10 aspect-video relative"
              style={{ transitionDelay: `${i * 50}ms` }}
            >
              <img
                src={g.src}
                alt={g.alt}
                loading="lazy"
                className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0 opacity-75 group-hover:opacity-100"
              />
              {/* Sleek bottom overlay on hover */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-fv-navy/95 to-transparent pt-8 pb-3 px-3 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 flex items-end">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white line-clamp-1 leading-none">
                  {g.alt}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- VIDEO TESTIMONIALS ---------- */
// Videos are hosted on Supabase Storage (CDN-backed) so the ~19MB of clips
// never bloat the repo/bundle and stream fast. Compressed to 720×1280 H.264.
const TVID_BUCKET = "trainer-assets";
const tvidUrl = (file: string) =>
  supabase.storage.from(TVID_BUCKET).getPublicUrl(`testimonials/${file}`).data.publicUrl;

interface VideoTestimonial {
  id: number;
  video: string;
  poster: string;
}

const VIDEO_TESTIMONIALS: VideoTestimonial[] = [1, 2, 3, 4].map((n) => ({
  id: n,
  video: tvidUrl(`testimonial-${n}.mp4`),
  poster: tvidUrl(`testimonial-${n}.jpg`),
}));

function VideoTestimonials() {
  const ref = useReveal(0.1);
  const [active, setActive] = useState<VideoTestimonial | null>(null);

  const VideoCard = ({ t }: { t: VideoTestimonial }) => (
    <button
      type="button"
      onClick={() => setActive(t)}
      aria-label="Play client testimonial video"
      className="group relative block aspect-[9/16] w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-fv-orange/40 hover:shadow-elevated"
    >
      <video
        src={t.video}
        poster={t.poster}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
      {/* Gradient + play affordance */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-fv-navy/70 via-transparent to-transparent" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/15 ring-1 ring-white/40 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 group-hover:bg-fv-orange">
          <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
        </span>
      </div>
      <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fv-navy shadow-sm">
        <ShieldCheck className="h-3 w-3 text-fv-orange" /> Verified
      </span>
      <span className="pointer-events-none absolute bottom-3 left-3 right-3 text-left text-[11px] font-semibold text-white/90">
        Real FitVed member story
      </span>
    </button>
  );

  return (
    <section id="video-testimonials" className="py-12 md:py-20 bg-fv-navy border-t border-white/10 overflow-hidden">
      <div className="fluid-container-testimonials">
        <div className="text-center max-w-2xl mx-auto">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="h-px w-8 bg-fv-orange" />
            <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">Real Stories</span>
            <span className="h-px w-8 bg-fv-orange" />
          </div>
          <h2 className="font-sans font-black uppercase fluid-heading">
            CLIENT <span className="text-fv-orange">TESTIMONIALS</span>
          </h2>
          <p className="mt-2.5 text-white/60 fluid-body">
            Hear directly from FitVed members training inside their own societies. Tap any video to play with sound.
          </p>
        </div>

        {/* Desktop: horizontal infinite marquee (matches Meet Your Trainers) */}
        <div ref={ref} className="reveal hidden sm:block mt-6 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-fv-navy to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-fv-navy to-transparent z-10" />
          <div className="marquee-track py-3">
            {[...VIDEO_TESTIMONIALS, ...VIDEO_TESTIMONIALS].map((t, i) => (
              <div key={`${t.id}-${i}`} className="w-[240px] shrink-0 mx-2">
                <VideoCard t={t} />
              </div>
            ))}
          </div>
        </div>

        {/* Mobile: clean full-width carousel */}
        <div className="sm:hidden mt-6 relative">
          <Carousel opts={{ align: "start", loop: true }} className="w-full">
            <CarouselContent className="-ml-2">
              {VIDEO_TESTIMONIALS.map((t) => (
                <CarouselItem key={t.id} className="pl-2 basis-[72%]">
                  <VideoCard t={t} />
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="mt-4 flex items-center justify-center gap-3">
              <CarouselPrevious className="static translate-y-0 h-9 w-9 bg-white/10 border-white/20 text-white hover:bg-fv-orange hover:border-fv-orange" />
              <CarouselNext className="static translate-y-0 h-9 w-9 bg-white/10 border-white/20 text-white hover:bg-fv-orange hover:border-fv-orange" />
            </div>
          </Carousel>
        </div>
      </div>

      {/* Fullscreen play-with-sound modal */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-sm border-white/10 bg-fv-navy p-2 sm:p-3">
          <DialogHeader className="sr-only">
            <DialogTitle>Client testimonial</DialogTitle>
            <DialogDescription>A FitVed member shares their experience.</DialogDescription>
          </DialogHeader>
          {active && (
            <video
              key={active.id}
              src={active.video}
              poster={active.poster}
              controls
              autoPlay
              playsInline
              className="aspect-[9/16] w-full rounded-xl bg-black object-cover"
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

/* ---------- TRAINERS (Team) ---------- */
interface TrainerData {
  name: string;
  experience: string;
  rating: number;
  reviews: number;
  specialization: string;
  bio: string;
  certifications: string[];
  conditionsTreated: string[];
  clientCount: string;
  languages: string[];
  verifiedBadge: string;
  photo?: string;
}

function Trainers() {
  const trainers: TrainerData[] = [
    {
      name: "Suma Paniraj",
      experience: "10+ years",
      rating: 5.0,
      reviews: 128,
      specialization: "Senior Longevity & Therapeutic Yoga",
      certifications: ["AYUSH Certified Yoga Therapist", "Geriatric Rehab Specialist"],
      conditionsTreated: ["Hypertension", "Diabetes", "Knee Osteoarthritis", "Spinal Stiffness"],
      clientCount: "350+ Seniors Trained",
      languages: ["English", "Kannada", "Hindi"],
      verifiedBadge: "Police Verified • Background Checked",
      bio: "Senior longevity expert specializing in gentle, medically-informed movement for older adults. Rebuilds balance, joint range of motion, and physical independence.",
    },
    {
      name: "Dhruvi Patel",
      experience: "6 years",
      rating: 4.9,
      reviews: 94,
      specialization: "Yoga Therapist & Posture Specialist",
      certifications: ["RYT-500 Master Yoga Teacher", "Spinal Decompression Specialist"],
      conditionsTreated: ["Sciatica", "Tech Neck", "Lower Back Disc Strain", "PCOS"],
      clientCount: "210+ Clients Trained",
      languages: ["English", "Hindi", "Gujarati"],
      verifiedBadge: "Police Verified • Certified Therapist",
      bio: "Blends clinical yoga therapy with breathwork to relieve back pain, realign posture for desk workers, and restore joint mobility.",
    },
    {
      name: "Pramod Palve",
      experience: "7 years",
      rating: 4.9,
      reviews: 112,
      specialization: "Strength Conditioning & Fat Loss Coach",
      certifications: ["ACE Certified Personal Trainer", "Metabolic Nutrition Coach"],
      conditionsTreated: ["Visceral Obesity", "Muscle Atrophy", "Insulin Resistance"],
      clientCount: "280+ Transformations",
      languages: ["English", "Hindi", "Marathi"],
      verifiedBadge: "Police Verified • ACE Certified",
      bio: "Fuses progressive strength conditioning with custom metabolic nutrition for corporate professionals in Bangalore.",
    },
    {
      name: "Shubham Sahane",
      experience: "5 years",
      rating: 4.8,
      reviews: 76,
      specialization: "Society Group Fitness & Mobility Specialist",
      certifications: ["NSCA Functional Trainer", "Joint Mobility Coach"],
      conditionsTreated: ["Joint Stiffness", "Cardiovascular Fatigue", "Post-Work Stress"],
      clientCount: "190+ Members Trained",
      languages: ["English", "Hindi", "Kannada"],
      verifiedBadge: "Police Verified • NSCA Trainer",
      bio: "Leads high-energy society group mobility and strength sessions that neighbours across Bangalore look forward to.",
    },
    {
      name: "Saurabh",
      experience: "5 years",
      rating: 4.8,
      reviews: 68,
      specialization: "Beginner Movement & Functional Rehab",
      certifications: ["AYUSH RYT-200", "Functional Movement Screen (FMS)"],
      conditionsTreated: ["Beginner Stiffness", "Ankle Instability", "Core Weakness"],
      clientCount: "150+ Beginners Coached",
      languages: ["English", "Hindi"],
      verifiedBadge: "Police Verified • AYUSH Certified",
      bio: "Guides beginners from their first stretch to confident, pain-free movement with patient, step-by-step coaching.",
    },
  ];

  const card = (t: TrainerData, delay = 0) => (
    <div
      className="h-full rounded-2xl bg-white/5 border border-white/10 p-3.5 sm:p-4 shadow-card hover:shadow-elevated hover:border-fv-orange/40 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between text-left"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <div>
        {/* Header: Avatar, Name & Rating */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fv-orange/15 text-fv-orange text-sm font-black border border-fv-orange/30">
              {t.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-sans font-black uppercase text-sm text-white tracking-tight leading-tight truncate">{t.name}</h3>
              <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                <span className="flex text-fv-orange">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className={cn("h-2.5 w-2.5", i < Math.round(t.rating) && "fill-fv-orange")} />
                  ))}
                </span>
                <span className="text-[11px] font-bold text-white leading-none">{t.rating.toFixed(1)}</span>
                <span className="text-[10px] text-white/40 leading-none">({t.reviews})</span>
              </div>
            </div>
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-fv-orange bg-fv-orange/10 px-2 py-0.5 rounded-full border border-fv-orange/20 shrink-0">
            {t.experience}
          </span>
        </div>

        {/* Verification Badge */}
        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-white/60 uppercase tracking-wider">
          <ShieldCheck className="h-3.5 w-3.5 text-fv-orange shrink-0" />
          <span className="truncate">{t.verifiedBadge}</span>
        </div>

        <p className="mt-2 text-xs text-white/75 leading-relaxed line-clamp-3">{t.bio}</p>

        {/* Certifications List */}
        <div className="mt-2 pt-2 border-t border-white/10">
          <span className="text-[9px] font-bold uppercase tracking-widest text-fv-orange block mb-1">
            Verified Certifications
          </span>
          <div className="flex flex-wrap gap-1">
            {t.certifications.map((c) => (
              <span key={c} className="bg-white/10 text-white/90 text-[9px] font-semibold px-1.5 py-0.5 rounded border border-white/10">
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Conditions Treated */}
        <div className="mt-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/50 block mb-1">
            Conditions Treated
          </span>
          <div className="flex flex-wrap gap-1">
            {t.conditionsTreated.map((cond) => (
              <span key={cond} className="bg-fv-orange/10 text-fv-orange text-[9px] font-medium px-1.5 py-0.5 rounded">
                {cond}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-white/50 truncate">
          Languages: {t.languages.join(", ")}
        </span>
        <Button
          onClick={() => scrollTo("contact")}
          className="bg-fv-orange text-white hover:bg-fv-orange/90 text-[10px] font-black uppercase tracking-wider h-7 px-3 rounded-full shrink-0"
        >
          Book Session
        </Button>
      </div>
    </div>
  );

  const ref = useReveal(0.1);

  return (
    <section id="trainers" className="py-12 md:py-20 bg-fv-navy border-t border-white/10">
      <div className="fluid-container-trainers">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">THE TEAM</span>
          <h2 className="mt-2 font-sans font-black uppercase fluid-heading">
            MEET YOUR <span className="text-fv-orange">TRAINERS</span>
          </h2>
          <p className="mt-2.5 text-white/60 fluid-body">
            Certified yoga and fitness specialists who train you inside your own society.
          </p>
        </div>

        {/* Desktop: horizontal infinite marquee */}
        <div ref={ref} className="reveal hidden sm:block mt-4 relative overflow-hidden">
          {/* Fade edges */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-fv-navy to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-fv-navy to-transparent z-10" />
          <div className="marquee-track py-3">
            {[...trainers, ...trainers].map((t, i) => (
              <div key={`${t.name}-${i}`} className="w-[300px] shrink-0 mx-2">
                {card(t)}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile: clean full-width carousel without overlapping arrows */}
        <div className="sm:hidden mt-6 relative">
          <Carousel opts={{ align: "start", loop: true }} className="w-full">
            <CarouselContent className="-ml-2">
              {trainers.map((t) => (
                <CarouselItem key={t.name} className="pl-2 basis-[90%]">
                  {card(t)}
                </CarouselItem>
              ))}
            </CarouselContent>
            <div className="mt-4 flex items-center justify-center gap-3">
              <CarouselPrevious className="static translate-y-0 h-9 w-9 bg-white/10 border-white/20 text-white hover:bg-fv-orange hover:border-fv-orange" />
              <CarouselNext className="static translate-y-0 h-9 w-9 bg-white/10 border-white/20 text-white hover:bg-fv-orange hover:border-fv-orange" />
            </div>
          </Carousel>
        </div>
      </div>
    </section>
  );
}

/* ---------- FAQ & ENQUIRY FORM ---------- */
function EnquiryFormAndFAQ() {
  const ref = useReveal();
  const qa = [
    // Getting Started
    {
      q: "How much does a personal trainer cost in Bangalore?",
      a: "Personal training typically costs ₹8,000–₹18,000 per month depending on session frequency and format (1-on-1 vs. small group). Book a free trial first — you only commit once you've trained with your coach.",
    },
    {
      q: "Do I need to buy equipment?",
      a: "No. We work with your society gym equipment. If your society doesn't have a gym, we bring portable equipment (resistance bands, dumbbells, mats).",
    },
    {
      q: "What if I'm a complete beginner?",
      a: "Most of our clients are exactly that. We start with mobility, breathing, and bodyweight movements. Progressive overload is gradual and safe.",
    },
    {
      q: "How do I book a free trial session?",
      a: "Fill out the enquiry form on this page or WhatsApp us. We'll call you within 24 hours to schedule a trial in your society — no payment required.",
    },
    // Health Conditions
    {
      q: "What if I have diabetes, BP, or arthritis?",
      a: "Perfect — Fitved specializes in medical-history-based training. We design programs around your conditions, not despite them. Many clients reduce medication under doctor supervision.",
    },
    {
      q: "Can seniors (55+) safely do yoga and strength training?",
      a: "Absolutely. Our senior fitness program is designed for adults 55+, focusing on balance, joint health, bone density, and fall prevention. Every exercise is modified for safety.",
    },
    {
      q: "Can I train after surgery (knee replacement, back surgery)?",
      a: "Yes, once your doctor clears you. Our clinical trainers specialize in post-surgery rehabilitation — safe, supervised progression from recovery to full fitness.",
    },
    {
      q: "Is yoga enough for weight loss?",
      a: "Yoga improves flexibility and reduces stress, but for significant weight loss, we combine it with strength training and metabolic nutrition coaching for measurable results.",
    },
    {
      q: "Do you offer prenatal and postnatal yoga?",
      a: "Yes. Our certified prenatal yoga instructors guide expectant mothers through safe pregnancy exercises. Postnatal programs help rebuild core strength and pelvic floor after delivery.",
    },
    // Logistics
    {
      q: "How is this different from a regular gym membership?",
      a: "We come to your society (zero commute), provide 1-on-1 or small group attention, use clinical protocols (posture correction, breath-led movement), and include metabolic nutrition plans. You're training for healthspan, not just aesthetics.",
    },
    {
      q: "What's the time commitment?",
      a: "Minimum 2–3 sessions/week, 45–60 minutes each. Most clients train Mon/Wed/Fri or Tue/Thu/Sat. Flexible scheduling is available.",
    },
    {
      q: "Do you provide meal plans?",
      a: "Yes — every client gets a personalized metabolic re-composition plan based on body composition analysis. We optimize protein, manage visceral fat, and address digestive issues.",
    },
    {
      q: "Can I train with my spouse or friend?",
      a: "Absolutely. Our small group training (4–6 people) is popular for couples and friend groups in the same society.",
    },
    {
      q: "What if I travel frequently for work?",
      a: "We offer flexible scheduling — carry forward missed classes so you never lose what you paid for. Online coaching is also available when you travel.",
    },
    {
      q: "Should I train in the morning or evening?",
      a: "Both are equally effective. We recommend whatever time you can consistently commit to. Most working professionals prefer 6–7 AM or 6–8 PM.",
    },
    {
      q: "Can children or teenagers join?",
      a: "Yes, we offer age-appropriate fitness programs for children (8+) and teens, focusing on motor skills, posture, and healthy habits.",
    },
    {
      q: "Can couples train together?",
      a: "Yes. Couples training is one of our most popular formats — shared accountability, shared progress, and it's fun.",
    },
    // Comparison
    {
      q: "How is Fitved different from Cult Fit?",
      a: "Cult Fit is a gym chain with group classes at their centres. Fitved sends certified trainers to your society — zero commute, personalised attention, clinical protocols, and nutrition coaching included.",
    },
    {
      q: "Why choose a personal trainer over a gym?",
      a: "A personal trainer gives you customized programming, form correction, injury prevention, and accountability. At a gym, you're on your own. Our society model adds zero-commute convenience.",
    },
    {
      q: "Yoga vs gym — which is better?",
      a: "They complement each other. We blend both — yoga for mobility and stress, strength training for muscle and metabolism. The best program includes elements of both.",
    },
    {
      q: "How soon will I see results?",
      a: "Week 4: better sleep, less pain, more energy. Week 8: visible body composition changes. Week 12: sustainable habits, measurable improvements in BP, cholesterol, body age.",
    },
    {
      q: "What areas in Bangalore do you serve?",
      a: "We currently serve HSR Layout, Whitefield, Sarjapur Road, Bellandur, Electronic City, Koramangala, Marathahalli, and Varthur. We're expanding rapidly — contact us if you're in another area.",
    },
    {
      q: "How many calories does a personal training session burn?",
      a: "A typical 45-minute session burns 300–500 calories depending on intensity. But the real benefit is the metabolic boost — you continue burning calories for hours after training.",
    },
    {
      q: "Do you offer online fitness coaching?",
      a: "Yes. Our online coaching program includes video-guided workouts, personalized nutrition plans, and weekly check-ins with your trainer — perfect for when you travel or prefer training at home.",
    },
    {
      q: "What certifications do your trainers have?",
      a: "Our trainers hold certifications from NSCA, ACE, ACSM, Yoga Alliance (RYT-200/500), and AYUSH. Many have 5–15 years of experience with clinical and therapeutic specializations.",
    },
  ];

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = leadSchema.safeParse({ name, phone, interest });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);

    const { error } = await supabase.from("leads").insert({
      name: parsed.data.name,
      phone: parsed.data.phone,
      interest: parsed.data.interest,
      source: "landing_form",
    });

    setBusy(false);

    if (error) {
      console.error("Lead insert error:", JSON.stringify(error));
      toast.error(`Submit failed: ${error.message}`);
      return;
    }

    trackEvent("enquiry_submitted", { interest: parsed.data.interest });
    localStorage.setItem("fitved_form_submitted", "true");
    window.dispatchEvent(new Event("fitved_form_done"));
    setDone(true);
  };

  return (
    <section
      id="contact"
      className="py-12 md:py-16 bg-gradient-to-br from-fv-navy via-fv-navy to-[#182e49] text-white border-t border-white/10"
    >
      <div ref={ref} className="reveal mx-auto max-w-6xl px-4">
        <div className="grid lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: FAQ Accordion */}
          <div className="lg:col-span-6 text-left">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-px w-8 bg-fv-orange"></span>
              <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">FAQ</span>
            </div>
            <h2 className="font-sans font-black uppercase text-3xl md:text-5xl tracking-tighter leading-none">
              COMMON <span className="text-fv-orange">QUESTIONS</span>
            </h2>

            <Accordion type="single" collapsible className="mt-6">
              {qa.map((item, i) => (
                <AccordionItem key={i} value={`q${i}`} className="border-white/10">
                  <AccordionTrigger className="text-left text-white hover:text-fv-orange font-semibold hover:no-underline transition-colors uppercase tracking-wider text-xs md:text-sm py-4">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-white/70 leading-relaxed text-xs md:text-sm pb-4">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* Right Column: Enquiry Form Card */}
          <div className="lg:col-span-6 text-left">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-px w-8 bg-fv-orange"></span>
              <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">GET STARTED</span>
            </div>
            <h2 className="font-sans font-black uppercase text-3xl md:text-5xl tracking-tighter leading-none mb-4">
              START YOUR <span className="text-fv-orange">JOURNEY</span>
            </h2>

            <div className="rounded-2xl bg-white text-fv-text p-4 md:p-6 shadow-elevated">
              {done ? (
                <div className="text-center py-6">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-fv-success/15 text-fv-success">
                    <Check className="h-7 w-7" />
                  </div>
                  <h3 className="mt-4 text-2xl font-sans font-black uppercase text-fv-navy tracking-tight">
                    Thank you!
                  </h3>
                  <p className="mt-2 text-fv-text/70 text-sm">
                    Our team will contact you within 24 hours. In the meantime, check WhatsApp for a message from us.
                  </p>
                  <Button
                    onClick={() => scrollTo("home")}
                    className="mt-6 bg-fv-navy text-white hover:bg-fv-navy/90 px-6 py-2 text-xs font-black uppercase tracking-wider"
                  >
                    Back to Home
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <Label htmlFor="lead-name" className="text-fv-navy text-xs font-bold uppercase tracking-wider">Full Name</Label>
                    <Input
                      id="lead-name"
                      required
                      maxLength={100}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your full name"
                      className="h-12 mt-1.5 border-fv-navy/20 focus:border-fv-orange focus:ring-fv-orange/25"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lead-phone" className="text-fv-navy text-xs font-bold uppercase tracking-wider">Phone Number</Label>
                    <Input
                      id="lead-phone"
                      required
                      inputMode="numeric"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                      placeholder="10-digit mobile number"
                      className="h-12 mt-1.5 border-fv-navy/20 focus:border-fv-orange focus:ring-fv-orange/25"
                    />
                  </div>
                  <div>
                    <Label className="text-fv-navy text-xs font-bold uppercase tracking-wider">I'm interested in…</Label>
                    <Select value={interest} onValueChange={setInterest}>
                      <SelectTrigger className="h-12 mt-1.5 border-fv-navy/20">
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Personal Training">Personal Training (1-on-1)</SelectItem>
                        <SelectItem value="Group Training">Group Training (4–6 people)</SelectItem>
                        <SelectItem value="Corporate Wellness">Corporate Wellness (bulk booking)</SelectItem>
                        <SelectItem value="Online Coaching">Online Coaching (waitlist)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="submit"
                    disabled={busy}
                    className="w-full h-12 bg-fv-orange text-white hover:bg-fv-orange/90 font-black uppercase tracking-wider text-sm transition-all hover:scale-[1.02] shadow"
                  >
                    {busy ? "Sending…" : "Speak to a Coach"}
                  </Button>

                  <p className="text-center text-[10px] text-fv-text/50 flex items-center justify-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> Your data is safe with us.
                  </p>

                  <div className="pt-3 border-t border-fv-navy/10">
                    <p className="text-[10px] font-bold text-fv-navy/60 uppercase tracking-widest mb-2">What happens next?</p>
                    {[
                      "We call you within 24 hours",
                      "Free trial session in your society",
                      "No commitment until you love it",
                    ].map((step) => (
                      <p key={step} className="flex items-center gap-1.5 text-xs text-fv-text/60 mb-1">
                        <Check className="h-3.5 w-3.5 text-fv-orange shrink-0" /> {step}
                      </p>
                    ))}
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- HOMEPAGE JOURNAL SECTION ---------- */
function HomepageJournalSection() {
  return (
    <section id="journal" className="pt-16 pb-20 bg-fv-navy border-t border-white/10 text-white">
      <div className="fluid-container space-y-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-widest text-fv-orange">
              FitVed Journal & Knowledge Hub
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">
              Science-Backed Fitness & Indian Nutrition
            </h2>
            <p className="text-sm text-white/60 max-w-2xl">
              Discover expert meal plans, protein guides, PCOS strategies, recipe charts, and calculators curated for Indian households.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="bg-fv-orange hover:bg-fv-orange/90 text-white font-bold text-xs px-5 h-10 shadow">
              <Link to="/blog">View All 500+ Articles <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
            </Button>
            <Button asChild variant="outline" className="border-white/20 text-white hover:bg-white/10 font-semibold text-xs h-10">
              <Link to="/blog/calculators">Science Calculators</Link>
            </Button>
          </div>
        </div>

        {/* Featured Story */}
        <div className="rounded-3xl border border-white/10 bg-white/5 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-0 shadow-2xl">
          <div className="lg:col-span-7 relative aspect-video lg:aspect-auto overflow-hidden bg-slate-900">
            <img
              src={resolveFeaturedImage({ title: "100g protein vegetarian Indian diet", slug: "100g-protein-vegetarian-indian-diet" })}
              alt="High protein vegetarian Indian diet chart and paneer meal plan"
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
              onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=1200&q=80"; }}
            />
            <div className="absolute top-4 left-4">
              <span className="bg-fv-orange text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow">
                Featured Story
              </span>
            </div>
          </div>
          <div className="lg:col-span-5 p-6 md:p-8 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-fv-orange font-bold uppercase tracking-wider">
                <span>Protein & Diet</span>
                <span>•</span>
                <span className="text-white/50">7 min read</span>
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                How to Get 100g Protein Daily on a Pure Vegetarian Indian Diet
              </h3>
              <p className="text-xs sm:text-sm text-white/70 leading-relaxed line-clamp-3">
                Discover exact meal charts, protein density tables, and daily meal plans using paneer, soya, sattu, lentils, and dairy.
              </p>
            </div>

            <div className="pt-4 border-t border-white/10 flex items-center justify-between">
              <span className="text-xs text-white/50 font-medium">By Dr. Ananya Sharma</span>
              <Button asChild size="sm" className="bg-fv-orange hover:bg-fv-orange/90 text-white font-bold text-xs">
                <Link to="/blog/article/100g-protein-vegetarian-diet">Read Article <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Top Guides Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3 flex flex-col justify-between hover:border-fv-orange/50 transition-all">
            <div className="space-y-3">
              <div className="aspect-video rounded-xl overflow-hidden bg-slate-900">
                <img
                  src={resolveFeaturedImage({ title: "High protein paneer bhurji recipe", slug: "high-protein-paneer-bhurji-recipe" })}
                  alt="High protein low fat paneer bhurji recipe for Indian fitness"
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=1200&q=80"; }}
                />
              </div>
              <span className="text-[10px] font-bold text-fv-orange uppercase tracking-wider">Recipes • 5 min read</span>
              <h4 className="text-base font-bold text-white line-clamp-2">High Protein Paneer Bhurji Recipe (32g Protein in 15 Mins)</h4>
              <p className="text-xs text-white/60 line-clamp-2">Quick, delicious, low-carb Indian cottage cheese bhurji prepared with minimum oil.</p>
            </div>
            <Button asChild size="sm" variant="ghost" className="text-xs text-fv-orange hover:text-white hover:bg-fv-orange/20 self-start">
              <Link to="/blog/recipe/protein-paneer-bhurji">View Recipe →</Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3 flex flex-col justify-between hover:border-fv-orange/50 transition-all">
            <div className="space-y-3">
              <div className="aspect-video rounded-xl overflow-hidden bg-slate-900">
                <img
                  src={resolveFeaturedImage({ title: "PCOS weight loss guide", slug: "pcos-weight-loss-insulin-resistance-guide" })}
                  alt="PCOS weight loss guide and insulin resistance reversal diet"
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=1200&q=80"; }}
                />
              </div>
              <span className="text-[10px] font-bold text-fv-orange uppercase tracking-wider">Women's Health • 8 min read</span>
              <h4 className="text-base font-bold text-white line-clamp-2">PCOS Weight Loss Guide: How to Reverse Insulin Resistance Naturally</h4>
              <p className="text-xs text-white/60 line-clamp-2">Evidence-based strategies for managing PCOS weight gain with low-GI Indian foods.</p>
            </div>
            <Button asChild size="sm" variant="ghost" className="text-xs text-fv-orange hover:text-white hover:bg-fv-orange/20 self-start">
              <Link to="/blog/article/pcos-weight-loss">Read Guide →</Link>
            </Button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3 flex flex-col justify-between hover:border-fv-orange/50 transition-all">
            <div className="space-y-3">
              <div className="aspect-video rounded-xl overflow-hidden bg-slate-900">
                <img
                  src={resolveFeaturedImage({ title: "Gym vs home workouts comparison", slug: "gym-vs-home-workouts-comparison" })}
                  alt="Gym vs home workouts comparison for Indian working professionals"
                  loading="lazy"
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=1200&q=80"; }}
                />
              </div>
              <span className="text-[10px] font-bold text-fv-orange uppercase tracking-wider">Comparison • 6 min read</span>
              <h4 className="text-base font-bold text-white line-clamp-2">Gym vs Home Workouts: Which is Better for Working Professionals?</h4>
              <p className="text-xs text-white/60 line-clamp-2">Detailed comparison evaluating cost, time savings, traffic commute, and consistency.</p>
            </div>
            <Button asChild size="sm" variant="ghost" className="text-xs text-fv-orange hover:text-white hover:bg-fv-orange/20 self-start">
              <Link to="/blog/compare/gym-vs-home-workouts">Compare Methods →</Link>
            </Button>
          </div>
        </div>

        {/* Categories Quick Bar */}
        <div className="pt-6 border-t border-white/10 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">Explore Journal Topics:</span>
          <div className="flex flex-wrap gap-2">
            {[
              { name: "Nutrition", slug: "nutrition" },
              { name: "Weight Loss", slug: "weight-loss" },
              { name: "Muscle Gain", slug: "muscle-gain" },
              { name: "Protein", slug: "protein" },
              { name: "Recipes", slug: "recipes" },
              { name: "Women's Health", slug: "womens-health" },
              { name: "PCOS", slug: "pcos" },
              { name: "Yoga", slug: "yoga" },
              { name: "Supplements", slug: "supplements" },
            ].map((cat) => (
              <Link
                key={cat.slug}
                to={`/blog/category/${cat.slug}`}
                className="text-xs px-3 py-1.5 rounded-full bg-white/5 hover:bg-fv-orange hover:text-white text-white/80 border border-white/10 transition-colors"
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- FOOTER ---------- */
function Footer() {
  return (
    <footer className="bg-fv-navy text-white/80 pt-12 pb-24 md:pt-16 md:pb-10 border-t border-white/10">
      <div className="fluid-container grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div className="text-left space-y-3">
          <div className="flex items-center gap-2 bg-white/5 rounded-lg p-2 w-fit border border-white/10">
            <img src={fitvedLogo} alt="Fitved" className="h-7 w-auto" />
          </div>
          <p className="text-xs text-white/50 uppercase tracking-wider leading-relaxed">
            Calm strength, every day. <br />
            Society-based clinical fitness in Bangalore.
          </p>
        </div>

        <div className="text-left space-y-2">
          <h4 className="text-white font-black uppercase tracking-widest text-xs">Contact</h4>
          <ul className="space-y-1.5 text-xs uppercase tracking-wider font-semibold">
            <li>
              <a href={`tel:${PHONE}`} className="hover:text-fv-orange transition-colors">{PHONE_DISPLAY}</a>
            </li>
            <li>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener" className="hover:text-fv-orange transition-colors">
                WhatsApp
              </a>
            </li>
            <li>
              <a
                href="https://www.instagram.com/fitved.h/"
                target="_blank"
                rel="noopener"
                className="hover:text-fv-orange inline-flex items-center gap-1.5 transition-colors"
              >
                Instagram
              </a>
            </li>
          </ul>
        </div>

        <div className="text-left space-y-2">
          <h4 className="text-white font-black uppercase tracking-widest text-xs">Explore Services</h4>
          <ul className="space-y-1.5 text-xs uppercase tracking-wider font-semibold">
            <li><Link to="/login" className="hover:text-fv-orange transition-colors">Client / Trainer Login</Link></li>
            <li><a href="/online-training" className="hover:text-fv-orange transition-colors">Online Training</a></li>
            <li><Link to="/trainers" className="hover:text-fv-orange transition-colors">Find Personal Trainers</Link></li>
            <li><a href="/service-areas" className="hover:text-fv-orange transition-colors">Service Areas</a></li>
          </ul>
        </div>

        <div className="text-left space-y-2">
          <h4 className="text-white font-black uppercase tracking-widest text-xs">Fitness Journal</h4>
          <ul className="space-y-1 text-xs uppercase tracking-wider font-semibold text-white/60">
            <li><Link to="/blog" className="hover:text-fv-orange transition-colors">Latest Articles</Link></li>
            <li><Link to="/blog/category/weight-loss" className="hover:text-fv-orange transition-colors">Weight Loss Guides</Link></li>
            <li><Link to="/blog/category/protein" className="hover:text-fv-orange transition-colors">Protein Guides</Link></li>
            <li><Link to="/blog/category/recipes" className="hover:text-fv-orange transition-colors">High-Protein Recipes</Link></li>
            <li><Link to="/blog/category/womens-health" className="hover:text-fv-orange transition-colors">Women's Health</Link></li>
            <li><Link to="/blog/category/pcos" className="hover:text-fv-orange transition-colors">PCOS Management</Link></li>
            <li><Link to="/blog/calculators" className="hover:text-fv-orange transition-colors">Fitness Calculators</Link></li>
            <li><Link to="/blog/category/meal-plans" className="hover:text-fv-orange transition-colors">Meal Plans</Link></li>
          </ul>
        </div>
      </div>
      <div className="fluid-container mt-6 flex flex-col items-center gap-2">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Backed by</p>
        <img src={razorpayRizeLogo} alt="Razorpay Rize" className="h-7 md:h-8 w-auto opacity-90" />
      </div>
      <div className="fluid-container mt-5 pt-4 border-t border-white/10">
        <h4 className="text-white/70 font-black uppercase tracking-widest text-[10px] mb-2">Personal trainers across Bangalore</h4>
        <nav className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[11px] uppercase tracking-wider font-semibold text-white/45">
          {[
            ["Bellandur", "bellandur"],
            ["Whitefield", "whitefield"],
            ["Sarjapur Road", "sarjapur-road"],
            ["HSR Layout", "hsr-layout"],
            ["Marathahalli", "marathahalli"],
            ["Varthur", "varthur"],
            ["Electronic City", "electronic-city"],
            ["Koramangala", "koramangala"],
          ].map(([label, slug]) => (
            <a key={slug} href="/service-areas" className="hover:text-fv-orange transition-colors">
              {label}
            </a>
          ))}
        </nav>
      </div>
      <div className="fluid-container mt-4 pt-4 border-t border-white/10 text-xs text-white/40 text-left">
        © {new Date().getFullYear()} Fitved. All rights reserved.
      </div>
    </footer>
  );
}

/* ---------- MOBILE BAR / WHATSAPP / FLOATING CTA ---------- */
function MobileBar() {
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-3 bg-fv-navy border-t border-white/10 shadow-elevated">
      <a
        href={`tel:${PHONE}`}
        onClick={() => trackEvent("phone_clicked", { from: "mobile_bar" })}
        className="flex flex-col items-center justify-center py-2.5 text-white font-black uppercase tracking-wider text-[10px]"
      >
        <Phone className="h-5 w-5 mb-0.5 text-fv-orange" /> Call
      </a>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noopener"
        onClick={() => trackEvent("whatsapp_clicked", { from: "mobile_bar" })}
        className="flex flex-col items-center justify-center py-2.5 bg-[#25D366] text-white font-black uppercase tracking-wider text-[10px]"
      >
        <MessageCircle className="h-5 w-5 mb-0.5" /> WhatsApp
      </a>
      <button
        onClick={() => scrollTo("contact")}
        className="flex flex-col items-center justify-center py-2.5 bg-fv-orange text-white font-black uppercase tracking-wider text-[10px]"
      >
        <ChevronDown className="h-5 w-5 mb-0.5 rotate-180" /> Enquire
      </button>
    </div>
  );
}

function WhatsAppFloat() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener"
      onClick={() => trackEvent("whatsapp_clicked", { from: "float" })}
      aria-label="Chat on WhatsApp"
      className="hidden md:flex fixed bottom-6 right-6 z-40 h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-elevated hover:scale-105 transition-transform"
    >
      <MessageCircle className="h-7 w-7" />
    </a>
  );
}

function DesktopFloatingCta() {
  return (
    <button
      onClick={() => scrollTo("contact")}
      className="hidden md:flex fixed bottom-6 right-24 z-40 items-center gap-2 rounded-full bg-fv-orange text-white px-5 h-14 font-black uppercase tracking-wider text-xs shadow-elevated hover:bg-fv-orange/90 transition-all hover:scale-[1.03]"
    >
      Enquire Now <ArrowRight className="h-4 w-4" />
    </button>
  );
}

function LeadModal({
  open,
  onOpenChange,
  source,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
  body?: string;
  source: string;
  nameOptional?: boolean;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [isDuplicate, setIsDuplicate] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = leadSchema.safeParse({ name, phone, interest: interest || "Personal Training" });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);

    // ── Client-side duplicate check (localStorage) ─────────────────────────
    const submittedPhones: string[] = JSON.parse(localStorage.getItem("fitved_submitted_phones") || "[]");
    if (submittedPhones.includes(parsed.data.phone)) {
      setBusy(false);
      setIsDuplicate(true);
      setDone(true);
      trackEvent("enquiry_duplicate", { source: source || "consult_now_popup" });
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    const { error } = await supabase.from("leads").insert({
      name: parsed.data.name,
      phone: parsed.data.phone,
      interest: parsed.data.interest,
      source: source || "consult_now_popup",
    });

    setBusy(false);

    if (error) {
      // 23505 = unique_violation — phone already exists in leads table
      if (error.code === "23505") {
        submittedPhones.push(parsed.data.phone);
        localStorage.setItem("fitved_submitted_phones", JSON.stringify(submittedPhones));
        setIsDuplicate(true);
        setDone(true);
        trackEvent("enquiry_duplicate", { source: source || "consult_now_popup" });
        return;
      }
      console.error("Popup lead insert error:", JSON.stringify(error));
      toast.error(`Could not submit: ${error.message}`);
      return;
    }

    // Save phone to localStorage to prevent duplicate submissions
    submittedPhones.push(parsed.data.phone);
    localStorage.setItem("fitved_submitted_phones", JSON.stringify(submittedPhones));

    trackEvent("enquiry_submitted", { source: source || "consult_now_popup" });
    localStorage.setItem("fitved_form_submitted", "true");
    // NOTE: fitved_form_done is dispatched in handleClose (when user clicks Done)
    // so the success screen stays visible until they explicitly dismiss it.
    setDone(true);
  };

  const handleClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      // Fire the done event when user actually closes after seeing success
      if (done) window.dispatchEvent(new Event("fitved_form_done"));
      setTimeout(() => { setDone(false); setIsDuplicate(false); }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg bg-white text-fv-navy border-none p-6 md:p-8 rounded-3xl shadow-2xl overflow-hidden">
        <DialogHeader className="text-center space-y-2">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-fv-orange block">
            Start Risk-Free
          </span>
          <DialogTitle className="font-sans font-black uppercase text-2xl md:text-3xl text-fv-navy tracking-tight leading-tight">
            BOOK YOUR <span className="text-fv-orange">FREE HOME TRIAL</span>
          </DialogTitle>
          <DialogDescription className="text-fv-text/70 text-xs md:text-sm leading-relaxed max-w-md mx-auto">
            Experience a 1-on-1 personal training or yoga session in your Bangalore society — no payment, no card, zero commitment.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="text-center py-6">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-fv-success/15 text-fv-success">
              <Check className="h-7 w-7" />
            </div>
            {isDuplicate ? (
              <>
                <h3 className="mt-4 text-2xl font-sans font-black uppercase text-fv-navy tracking-tight">
                  Already Registered!
                </h3>
                <p className="mt-2 text-fv-text/70 text-sm">
                  Our records show you've already submitted this form. Our team will contact you shortly — no need to submit again.
                </p>
              </>
            ) : (
              <>
                <h3 className="mt-4 text-2xl font-sans font-black uppercase text-fv-navy tracking-tight">
                  Trial Booking Confirmed!
                </h3>
                <p className="mt-2 text-fv-text/70 text-sm">
                  Our team will call you within 24 hours to match your trainer and confirm session timing.
                </p>
              </>
            )}
            <Button
              onClick={() => handleClose(false)}
              className="mt-6 bg-fv-navy text-white hover:bg-fv-navy/90 rounded-full px-6 font-bold uppercase text-xs h-10"
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-2">
            <div>
              <Label htmlFor="popup-lead-name" className="text-fv-navy text-xs font-bold uppercase tracking-wider">
                Full Name
              </Label>
              <Input
                id="popup-lead-name"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                className="h-11 mt-1 border-fv-navy/20 text-fv-navy text-sm placeholder:text-fv-navy/40 focus:border-fv-orange"
              />
            </div>

            <div>
              <Label htmlFor="popup-lead-phone" className="text-fv-navy text-xs font-bold uppercase tracking-wider">
                Phone Number
              </Label>
              <Input
                id="popup-lead-phone"
                required
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                placeholder="10-digit mobile number"
                className="h-11 mt-1 border-fv-navy/20 text-fv-navy text-sm placeholder:text-fv-navy/40 focus:border-fv-orange"
              />
            </div>

            <div>
              <Label className="text-fv-navy text-xs font-bold uppercase tracking-wider">
                I&apos;m interested in…
              </Label>
              <Select value={interest} onValueChange={setInterest}>
                <SelectTrigger className="h-11 mt-1 border-fv-navy/20 text-fv-navy text-sm focus:border-fv-orange">
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Personal Training">Personal Training (1-on-1)</SelectItem>
                  <SelectItem value="Yoga Classes">Yoga Classes (Home / Society)</SelectItem>
                  <SelectItem value="Weight Loss Program">Weight Loss Program (12-Week)</SelectItem>
                  <SelectItem value="Senior Fitness">Senior Fitness (55+)</SelectItem>
                  <SelectItem value="Prenatal Yoga">Prenatal / Postnatal Yoga</SelectItem>
                  <SelectItem value="Clinical Rehab">Clinical Rehab / Post-Surgery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-12 bg-fv-orange text-white hover:bg-fv-orange/90 font-black uppercase tracking-wider text-xs md:text-sm rounded-xl transition-all shadow-md hover:scale-[1.01]"
            >
              {busy ? "Submitting…" : "Confirm Free Trial Session"}
            </Button>

            <p className="text-[10px] text-center text-fv-navy/50 font-semibold flex items-center justify-center gap-1">
              <span>🔒 100% Free</span> • <span>No Payment Required</span> • <span>Police Verified Trainers</span>
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- STAGE 7: HOW IT WORKS ---------- */
function HowItWorksSection() {
  const steps = [
    {
      step: "01",
      title: "Book a Free Trial",
      desc: "Tell us your fitness goal & society in Bangalore. We match you with a certified coach in your area.",
    },
    {
      step: "02",
      title: "Meet Your Trainer",
      desc: "Trainer arrives at your society gym or home with a custom assessment plan. Zero payment, zero commitment.",
    },
    {
      step: "03",
      title: "Track & Transform",
      desc: "Workouts, custom nutrition, & body stats tracked weekly so you see measurable results by week 4.",
    },
  ];

  return (
    <div id="how-it-works" className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-7 md:p-8 text-left flex flex-col justify-between h-full shadow-card hover:border-fv-orange/30 transition-all duration-200">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="h-px w-6 bg-fv-orange"></span>
          <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">Frictionless Process</span>
        </div>
        <h2 className="font-sans font-black uppercase text-2xl md:text-3xl lg:text-4xl tracking-tighter leading-none mb-2">
          HOW <span className="text-fv-orange">FITVED</span> WORKS
        </h2>
        <p className="text-white/60 text-xs sm:text-sm leading-relaxed mb-6">
          Three simple steps from booking your trial to training inside your own apartment society.
        </p>

        <div className="space-y-4 divide-y divide-white/10">
          {steps.map((s, idx) => (
            <div key={s.step} className={cn("flex items-start gap-3.5", idx > 0 && "pt-3.5")}>
              <div className="h-9 w-9 shrink-0 rounded-lg bg-fv-orange text-fv-navy font-black text-sm flex items-center justify-center shadow-md">
                {s.step}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-sans font-black uppercase text-sm sm:text-base text-white leading-tight mb-1">
                  {s.title}
                </h3>
                <p className="text-xs sm:text-[13px] text-white/70 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- STAGE 9: SPECIALIZED PROGRAMS ---------- */
function SpecializedProgramsSection() {
  const programs = [
    {
      title: "12-Week Fat Loss Transformation",
      tag: "Most Popular",
      desc: "Structured strength training, metabolic nutrition plans, and bi-weekly InBody tracking to lose 5–15kg sustainably.",
      href: "/weight-loss-program-bangalore",
    },
    {
      title: "Senior Longevity & Balance (55+)",
      tag: "Doctor Approved",
      desc: "Gentle, medically-informed personal training and chair yoga for blood pressure, diabetes, and joint care.",
      href: "/senior-fitness-bangalore",
    },
    {
      title: "Clinical Back Pain & Post-Op Rehab",
      tag: "Therapeutic Protocol",
      desc: "Post-op rehab, discectomy recovery, and spinal decompression exercises designed around doctor clearance.",
      href: "/clinical-fitness-bangalore",
    },
  ];

  return (
    <div id="programs" className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-7 md:p-8 text-left flex flex-col justify-between h-full shadow-card hover:border-fv-orange/30 transition-all duration-200">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="h-px w-6 bg-fv-orange"></span>
          <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">Structured Solutions</span>
        </div>
        <h2 className="font-sans font-black uppercase text-2xl md:text-3xl lg:text-4xl tracking-tighter leading-none mb-2">
          FLAGSHIP <span className="text-fv-orange">PROGRAMS</span>
        </h2>
        <p className="text-white/60 text-xs sm:text-sm leading-relaxed mb-6">
          Complete outcome-oriented program packages designed for measurable physical health improvements.
        </p>

        <div className="space-y-3.5">
          {programs.map((p) => (
            <a
              key={p.title}
              href={p.href}
              className="group bg-white/5 border border-white/10 hover:border-fv-orange/40 rounded-xl p-4 transition-all duration-300 hover:-translate-y-0.5 block text-left"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="bg-fv-orange/15 text-fv-orange text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-fv-orange/20">
                  {p.tag}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-fv-orange">
                  Details <ArrowRight className="h-3 w-3" />
                </span>
              </div>
              <h3 className="font-sans font-black uppercase text-sm sm:text-base text-white group-hover:text-fv-orange transition-colors mb-1 leading-snug">
                {p.title}
              </h3>
              <p className="text-xs sm:text-[13px] text-white/70 leading-normal">
                {p.desc}
              </p>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- STAGE 10: FAQ SECTION ONLY ---------- */
function FAQSectionOnly() {
  const qa = [
    {
      q: "How much does a personal trainer cost in Bangalore?",
      a: "Personal training ranges from ₹8,000 to ₹18,000/month depending on frequency. Free trial included before any commitment.",
    },
    {
      q: "Do I need to buy gym equipment for home training?",
      a: "No gym needed! Trainers bring portable equipment (dumbbells, resistance bands, mats) directly to your home.",
    },
    {
      q: "What if I have health conditions (diabetes, BP, back pain)?",
      a: "We specialize in medical-history-informed training, coordinating with your doctor's notes for safe, low-impact exercise.",
    },
    {
      q: "Can seniors (55+) safely do yoga and strength training?",
      a: "Yes. Our senior longevity program uses chair yoga, balance drills, and low-impact joint mobility designed for active aging.",
    },
    {
      q: "How is FitVed different from Cult Fit or commercial gyms?",
      a: "No commuting, zero crowded gyms. Certified personal trainers come directly to your society with 1-on-1 attention.",
    },
  ];

  return (
    <div id="faqs" className="bg-white/5 border border-white/10 rounded-2xl p-5 sm:p-7 md:p-8 text-left flex flex-col justify-between h-full shadow-card hover:border-fv-orange/30 transition-all duration-200">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="h-px w-6 bg-fv-orange"></span>
          <span className="text-xs font-bold uppercase tracking-widest text-fv-orange">FAQ Hub</span>
        </div>
        <h2 className="font-sans font-black uppercase text-2xl md:text-3xl lg:text-4xl tracking-tighter leading-none mb-2">
          FREQUENTLY ASKED <span className="text-fv-orange">QUESTIONS</span>
        </h2>
        <p className="text-white/60 text-xs sm:text-sm leading-relaxed mb-6">
          Everything you need to know about society personal training, yoga therapy, and pricing in Bangalore.
        </p>

        <Accordion type="single" collapsible className="space-y-2.5">
          {qa.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="bg-white/5 border border-white/10 rounded-lg px-4 transition-colors hover:border-fv-orange/30">
              <AccordionTrigger className="text-left text-white hover:text-fv-orange font-semibold hover:no-underline transition-colors uppercase tracking-wider text-xs sm:text-sm py-3.5">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-white/75 leading-relaxed text-xs sm:text-[13px] pb-3.5">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>

      <div className="mt-6 pt-3.5 border-t border-white/10 text-center">
        <Link
          to="/faqs"
          className="inline-flex items-center gap-2 border border-fv-orange/40 bg-fv-orange/10 text-white hover:bg-fv-orange font-bold uppercase tracking-wider text-xs h-10 px-6 rounded-full transition-all shadow-md"
        >
          View More FAQs <ArrowRight className="h-3.5 w-3.5 text-fv-orange hover:text-white" />
        </Link>
      </div>
    </div>
  );
}

/* ---------- STAGE 11: BOOK TRIAL INTAKE SECTION ---------- */


