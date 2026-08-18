import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FitvedLogo } from "@/components/FitvedLogo";
import razorpayRizeLogo from "@/assets/razorpay-rize.svg";
import {
  Users, Building2, Hotel, CalendarCheck, ChevronRight, Check,
  Dumbbell, HeartHandshake, Star, Sparkles, ArrowRight, Phone,
  Zap, Shield, Clock, MapPin,
} from "lucide-react";
import { BlogSeo } from "@/components/blog/BlogSeo";
import { SITE_URL } from "@/lib/blog/seo";

// ── Types ──────────────────────────────────────────────────────────────────────
interface B2BLead {
  contact_name: string;
  company: string;
  phone: string;
  email: string;
  event_type: string;
  headcount: string;
  message: string;
}

// ── Scroll helper ──────────────────────────────────────────────────────────────
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Corporate() {
  const serviceSchema = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "FitVed Corporate Wellness Program",
    description: "On-site yoga, fitness, and wellness programs for offices, co-working spaces, and tech parks in Bangalore. Certified trainers, flexible scheduling, zero logistics overhead.",
    provider: { "@type": "Organization", name: "FitVed", url: SITE_URL },
    serviceType: "Corporate Wellness",
    areaServed: { "@type": "City", name: "Bengaluru" },
    url: `${SITE_URL}/corporate`,
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Corporate Wellness", item: `${SITE_URL}/corporate` },
    ],
  };
  return (
    <div className="min-h-screen bg-white font-sans text-fv-text">
      <BlogSeo
        title="Corporate Wellness Programs — On-Site Yoga & Fitness for Offices | FitVed"
        description="Boost employee wellness with FitVed's corporate fitness programs. On-site yoga, strength training, and wellness workshops for offices and tech parks in Bangalore. Zero logistics overhead."
        canonical={`${SITE_URL}/corporate`}
        image={`${SITE_URL}/fitved-logo.png`}
        type="website"
        keywords={["corporate wellness Bangalore", "office yoga", "employee fitness program", "on-site trainer", "workplace wellness"]}
        jsonLd={[serviceSchema, breadcrumb]}
      />
      <CorporateNav />
      <Hero />
      <TrustedBy />
      <UseCases />
      <WhatWeOffer />
      <HowItWorks />
      <WhyFitved />
      <InquiryForm />
      <Footer />
    </div>
  );
}

// ── Nav ────────────────────────────────────────────────────────────────────────
function CorporateNav() {
  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-black/5 shadow-sm">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <FitvedLogo className="h-7 w-auto" />
        </Link>
        <div className="hidden md:flex items-center gap-6 text-sm font-medium text-fv-text/70">
          <button onClick={() => scrollTo("use-cases")} className="hover:text-fv-navy transition-colors">Use cases</button>
          <button onClick={() => scrollTo("offerings")} className="hover:text-fv-navy transition-colors">What we offer</button>
          <button onClick={() => scrollTo("how-it-works")} className="hover:text-fv-navy transition-colors">How it works</button>
        </div>
        <Button
          onClick={() => scrollTo("inquiry")}
          className="bg-fv-navy text-white hover:bg-fv-navy/90 rounded-full px-5 h-9 text-sm"
        >
          Get a quote
        </Button>
      </div>
    </nav>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden text-white">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1549576392-b91db04e5088?w=1920&q=80')",
        }}
      />
      {/* Dark navy overlay so text stays readable */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(30,58,95,0.92) 0%, rgba(30,58,95,0.80) 50%, rgba(45,90,142,0.75) 100%)" }} />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="max-w-3xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 mb-6 text-sm font-semibold"
            style={{ background: "rgba(240,167,32,0.15)", color: "#f0a720", border: "1px solid rgba(240,167,32,0.3)" }}>
            <Sparkles size={14} /> B2B · Corporate Wellness
          </div>

          <h1 className="font-display text-4xl md:text-6xl font-bold leading-[1.05]" style={{ letterSpacing: "-0.02em" }}>
            Turn your next<br />
            gathering into a<br />
            <span style={{ color: "#f0a720" }}>wellness experience.</span>
          </h1>

          <p className="mt-6 text-lg text-white/70 max-w-xl leading-relaxed">
            Fitved brings certified trainers to your venue — for corporate team days, hotel retreats,
            community events, and brand activations. Yoga, fitness, and mindfulness, designed for your audience.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => scrollTo("inquiry")}
              className="h-13 px-8 rounded-full text-base font-bold"
              style={{ background: "#f0a720", color: "#1E3A5F" }}
            >
              Request a quote <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              onClick={() => scrollTo("use-cases")}
              className="h-13 px-8 rounded-full text-base border-2 border-white text-white bg-white/10 hover:bg-white/20 hover:text-white"
            >
              See use cases
            </Button>
          </div>

          {/* Quick stats */}
          <div className="mt-12 flex flex-wrap gap-8">
            {[
              { val: "75+", label: "Events conducted" },
              { val: "50+", label: "Certified trainers" },
              { val: "5–500", label: "Participants per session" },
            ].map(({ val, label }) => (
              <div key={label}>
                <p className="font-display text-3xl font-bold text-white">{val}</p>
                <p className="text-sm text-white/55 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Trusted by ─────────────────────────────────────────────────────────────────
function TrustedBy() {
  const clients = [
    { Icon: Building2, label: "Corporates" },
    { Icon: Hotel,     label: "Hotels & Resorts" },
    { Icon: Users,     label: "RWAs & Societies" },
    { Icon: CalendarCheck, label: "Event Agencies" },
    { Icon: HeartHandshake, label: "HR Teams" },
    { Icon: Star,      label: "Luxury Brands" },
  ];
  return (
    <section className="py-10 bg-fv-neutral border-y border-black/5">
      <div className="mx-auto max-w-6xl px-4">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-fv-text/40 mb-6">
          Trusted by
        </p>
        <div className="flex flex-wrap justify-center gap-6 md:gap-10">
          {clients.map(({ Icon, label }) => (
            <div key={label} className="flex items-center gap-2 text-fv-text/50">
              <Icon size={18} />
              <span className="text-sm font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Use cases ──────────────────────────────────────────────────────────────────
function UseCases() {
  const cases = [
    {
      icon: Building2,
      color: "#eef2ff",
      iconColor: "#5b6cf8",
      tag: "Corporate",
      title: "Team wellness days & offsites",
      desc: "Give your team a break they'll actually remember. A 60-minute yoga or fitness session as a warm-up to your annual meet, or a standalone team wellness day — we handle logistics, trainers, and equipment.",
      bullets: ["Group yoga or HIIT", "Stress-relief sessions", "Works for 10 to 1000 people"],
    },
    {
      icon: Hotel,
      color: "#fef3d0",
      iconColor: "#f0a720",
      tag: "Hotels & Resorts",
      title: "Guest experience & retreats",
      desc: "Elevate your property's wellness offering. We supply expert instructors for morning yoga, pool-side stretch, or weekend retreat programming — blending seamlessly into your brand experience.",
      bullets: ["Daily sunrise yoga", "Weekend retreat packages", "Customisable to your property"],
    },
    {
      icon: Users,
      color: "#e6f7ed",
      iconColor: "#2e9e5b",
      tag: "Community & RWA",
      title: "Society & community events",
      desc: "Bring the residents together. A fitness mela, a Sunday bootcamp, or a mindfulness walk — great for festivals, Diwali events, New Year kickoffs, or simply building community spirit.",
      bullets: ["High-energy group sessions", "All age groups welcome", "Outdoor or indoor setup"],
    },
    {
      icon: Sparkles,
      color: "#fce8e8",
      iconColor: "#ef4444",
      tag: "Brand Activation",
      title: "Branded wellness activations",
      desc: "Use fitness as a marketing touchpoint. Product launches, customer appreciation events, or health-brand activations — we design movement experiences your audience will talk about.",
      bullets: ["Branded setup & backdrops", "Content-ready moments", "Influencer-friendly formats"],
    },
  ];

  return (
    <section id="use-cases" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-fv-orange mb-3">Use cases</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-fv-navy" style={{ letterSpacing: "-0.01em" }}>
            Fitness as an experience, for any occasion
          </h2>
          <p className="mt-4 text-fv-text/60 leading-relaxed">
            Whether it's a 30-person team standup or a 500-person retreat — Fitved designs and delivers the full session.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {cases.map(({ icon: Icon, color, iconColor, tag, title, desc, bullets }) => (
            <div key={tag} className="rounded-3xl p-7 border border-black/5 hover:shadow-lg transition-shadow"
              style={{ background: "#fafafa" }}>
              <div className="flex items-start gap-4 mb-4">
                <div className="flex items-center justify-center rounded-2xl flex-shrink-0"
                  style={{ width: 48, height: 48, background: color }}>
                  <Icon size={22} color={iconColor} />
                </div>
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: iconColor }}>{tag}</span>
                  <h3 className="font-display text-xl font-bold text-fv-navy mt-0.5">{title}</h3>
                </div>
              </div>
              <p className="text-sm text-fv-text/65 leading-relaxed mb-4">{desc}</p>
              <ul className="space-y-1.5">
                {bullets.map((b) => (
                  <li key={b} className="flex items-center gap-2 text-sm text-fv-text/70">
                    <Check size={14} className="text-fv-orange flex-shrink-0" /> {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── What we offer ──────────────────────────────────────────────────────────────
function WhatWeOffer() {
  const offerings = [
    {
      icon: Dumbbell,
      title: "Fitness Bootcamp",
      desc: "High-energy group sessions — HIIT, circuit training, or functional fitness. Great for pumping up a team or kicking off an event.",
    },
    {
      icon: HeartHandshake,
      title: "Yoga & Mindfulness",
      desc: "Hatha, Vinyasa, or restorative yoga. Meditation and breathing workshops. Calm and inclusive for all fitness levels.",
    },
    {
      icon: Zap,
      title: "Workplace Wellness Talks",
      desc: "45-minute expert-led sessions on posture, stress, sleep, and nutrition — perfect alongside a physical session.",
    },
    {
      icon: Star,
      title: "Wellness Retreat Design",
      desc: "Multi-day retreat programming for resorts or corporate offsites. We plan the entire wellness arc from morning to evening.",
    },
    {
      icon: Users,
      title: "Walk & Run Events",
      desc: "Guided morning walks, charity runs, or society fitness challenges. We handle pacing, safety, and motivation.",
    },
    {
      icon: CalendarCheck,
      title: "Recurring Programs",
      desc: "Weekly sessions at your office, hotel, or campus. Membership-style engagements with progress tracking.",
    },
  ];

  return (
    <section id="offerings" className="py-20 md:py-28 bg-fv-neutral">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-fv-orange mb-3">What we offer</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-fv-navy" style={{ letterSpacing: "-0.01em" }}>
            Every format. Every audience.
          </h2>
          <p className="mt-4 text-fv-text/60 leading-relaxed">
            Mix and match sessions to build the perfect wellness experience for your stakeholders.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {offerings.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl p-6 border border-black/5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-center rounded-xl mb-4"
                style={{ width: 44, height: 44, background: "#1E3A5F" }}>
                <Icon size={20} color="#f0a720" />
              </div>
              <h3 className="font-bold text-fv-navy text-base mb-1.5">{title}</h3>
              <p className="text-sm text-fv-text/60 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How it works ───────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Tell us about your event",
      desc: "Fill our short inquiry form — event type, audience size, date, location. Takes 2 minutes.",
    },
    {
      n: "02",
      title: "We design your session",
      desc: "Our team puts together a tailored program with the right trainer mix, format, and duration for your audience.",
    },
    {
      n: "03",
      title: "We show up & deliver",
      desc: "Our certified trainers arrive at your venue, fully equipped. You focus on your guests — we handle the experience.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-white">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest text-fv-orange mb-3">Process</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-fv-navy" style={{ letterSpacing: "-0.01em" }}>
            Simple to book, seamless to run
          </h2>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {steps.map(({ n, title, desc }, i) => (
            <div key={n} className="relative flex flex-col">
              {/* connector line */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-8 left-[calc(100%_-_12px)] w-[calc(100%_-_12px)] h-px z-0"
                  style={{ background: "repeating-linear-gradient(90deg, #1E3A5F 0, #1E3A5F 6px, transparent 6px, transparent 14px)", opacity: 0.15 }} />
              )}
              <div className="relative z-10 flex items-start gap-4 md:flex-col md:gap-5">
                <div className="flex-shrink-0 flex items-center justify-center rounded-2xl font-display font-bold text-white text-lg"
                  style={{ width: 56, height: 56, background: "#1E3A5F" }}>
                  {n}
                </div>
                <div>
                  <h3 className="font-bold text-fv-navy text-lg">{title}</h3>
                  <p className="mt-1.5 text-sm text-fv-text/60 leading-relaxed">{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Why Fitved ─────────────────────────────────────────────────────────────────
function WhyFitved() {
  const points = [
    { icon: Shield,        title: "Certified trainers only",   desc: "Every trainer is certified and vetted. You can trust the quality in front of your audience." },
    { icon: MapPin,        title: "We come to your venue",     desc: "No need to arrange transport. We travel anywhere in Bangalore — offices, hotels, open grounds." },
    { icon: Clock,         title: "Flexible scheduling",       desc: "Early morning, evening, weekend — we work around your event calendar, not ours." },
    { icon: Users,         title: "5 to 500+ participants",    desc: "Our trainer network scales. One trainer for a small team, a fleet for large-scale events." },
    { icon: Sparkles,      title: "Turnkey experience",        desc: "Mats, props, sound, warm-up to cool-down — we bring everything and manage the full session." },
    { icon: HeartHandshake, title: "Branded to your identity", desc: "Custom sessions themed to your brand, event, or culture. We co-design the experience with you." },
  ];

  return (
    <section className="py-20 md:py-28"
      style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #2d5a8e 100%)" }}>
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "#f0a720" }}>
            Why Fitved
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white" style={{ letterSpacing: "-0.01em" }}>
            We take care of everything
          </h2>
          <p className="mt-4 text-white/60 leading-relaxed">
            From first inquiry to post-event debrief — Fitved is your end-to-end wellness partner.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {points.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-2xl p-6"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <div className="flex items-center justify-center rounded-xl mb-4"
                style={{ width: 44, height: 44, background: "rgba(240,167,32,0.15)" }}>
                <Icon size={20} color="#f0a720" />
              </div>
              <h3 className="font-bold text-white text-base mb-1.5">{title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Inquiry Form ───────────────────────────────────────────────────────────────
function InquiryForm() {
  const [form, setForm] = useState<B2BLead>({
    contact_name: "", company: "", phone: "", email: "",
    event_type: "", headcount: "", message: "",
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof B2BLead) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contact_name || !form.phone || !form.event_type) {
      toast.error("Please fill in your name, phone and event type.");
      return;
    }
    if (form.phone.length < 10) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("b2b_leads").insert({
      contact_name: form.contact_name,
      company: form.company,
      phone: form.phone,
      email: form.email,
      event_type: form.event_type,
      headcount: form.headcount,
      message: form.message,
    });
    setBusy(false);
    if (error) { toast.error("Could not submit. Please try again."); return; }
    setDone(true);
  };

  return (
    <section id="inquiry" className="py-20 md:py-28 bg-fv-neutral">
      <div className="mx-auto max-w-2xl px-4">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-fv-orange mb-3">Get started</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-fv-navy" style={{ letterSpacing: "-0.01em" }}>
            Tell us about your event
          </h2>
          <p className="mt-3 text-fv-text/60 leading-relaxed">
            Fill in the quick form and our B2B team will reach out within 24 hours with a customised proposal.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-7 md:p-10 shadow-lg border border-black/5">
          {done ? (
            <div className="text-center py-8">
              <div className="mx-auto mb-5 flex items-center justify-center rounded-full"
                style={{ width: 64, height: 64, background: "#e6f7ed" }}>
                <Check size={28} color="#2e9e5b" />
              </div>
              <h3 className="font-display text-2xl font-bold text-fv-navy">We've received your enquiry!</h3>
              <p className="mt-2 text-fv-text/60 max-w-sm mx-auto leading-relaxed">
                Our B2B team will call you within 24 hours to understand your event and share a tailored proposal.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => { setDone(false); setForm({ contact_name:"",company:"",phone:"",email:"",event_type:"",headcount:"",message:"" }); }}
                  variant="outline" className="rounded-full px-6"
                >
                  Submit another
                </Button>
                <Button asChild className="bg-fv-navy text-white hover:bg-fv-navy/90 rounded-full px-6">
                  <Link to="/">Back to Home</Link>
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="b2b-name" className="text-fv-navy text-sm font-semibold">
                    Your name <span className="text-fv-orange">*</span>
                  </Label>
                  <Input id="b2b-name" required className="h-12 mt-1.5 rounded-xl"
                    placeholder="Full name"
                    value={form.contact_name} onChange={(e) => set("contact_name")(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="b2b-company" className="text-fv-navy text-sm font-semibold">
                    Company / Organisation
                  </Label>
                  <Input id="b2b-company" className="h-12 mt-1.5 rounded-xl"
                    placeholder="Company name"
                    value={form.company} onChange={(e) => set("company")(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="b2b-phone" className="text-fv-navy text-sm font-semibold">
                    Phone <span className="text-fv-orange">*</span>
                  </Label>
                  <Input id="b2b-phone" required inputMode="numeric" maxLength={10} className="h-12 mt-1.5 rounded-xl"
                    placeholder="10-digit mobile number"
                    value={form.phone} onChange={(e) => set("phone")(e.target.value.replace(/\D/g, ""))} />
                </div>
                <div>
                  <Label htmlFor="b2b-email" className="text-fv-navy text-sm font-semibold">
                    Work email
                  </Label>
                  <Input id="b2b-email" type="email" className="h-12 mt-1.5 rounded-xl"
                    placeholder="you@company.com"
                    value={form.email} onChange={(e) => set("email")(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-fv-navy text-sm font-semibold">
                    Type of event <span className="text-fv-orange">*</span>
                  </Label>
                  <Select value={form.event_type} onValueChange={set("event_type")}>
                    <SelectTrigger className="h-12 mt-1.5 rounded-xl">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Corporate team day / offsite">Corporate team day / offsite</SelectItem>
                      <SelectItem value="Hotel / resort wellness program">Hotel / resort wellness program</SelectItem>
                      <SelectItem value="Society / community event">Society / community event</SelectItem>
                      <SelectItem value="Brand activation / launch event">Brand activation / launch event</SelectItem>
                      <SelectItem value="Recurring weekly program">Recurring weekly program</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-fv-navy text-sm font-semibold">
                    Expected participants
                  </Label>
                  <Select value={form.headcount} onValueChange={set("headcount")}>
                    <SelectTrigger className="h-12 mt-1.5 rounded-xl">
                      <SelectValue placeholder="Headcount range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Under 25">Under 25</SelectItem>
                      <SelectItem value="25 – 75">25 – 75</SelectItem>
                      <SelectItem value="75 – 200">75 – 200</SelectItem>
                      <SelectItem value="200 – 500">200 – 500</SelectItem>
                      <SelectItem value="500+">500+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="b2b-message" className="text-fv-navy text-sm font-semibold">
                  Tell us more (optional)
                </Label>
                <Textarea id="b2b-message" className="mt-1.5 rounded-xl resize-none" rows={3}
                  placeholder="Event date, venue, specific requirements, or anything else we should know…"
                  value={form.message} onChange={(e) => set("message")(e.target.value)} />
              </div>

              <Button
                type="submit" disabled={busy}
                className="w-full h-13 rounded-full text-base font-bold bg-fv-navy text-white hover:bg-fv-navy/90"
              >
                {busy ? "Submitting…" : "Send inquiry →"}
              </Button>

              <p className="text-center text-xs text-fv-text/40">
                We'll call you within 24 hours. No spam, ever.
              </p>
            </form>
          )}
        </div>

        {/* Direct contact strip */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-6 text-sm text-fv-text/50">
          <a href="tel:+919606047293" className="flex items-center gap-2 hover:text-fv-navy transition-colors">
            <Phone size={14} /> +91 9606047293
          </a>
          <a href="https://wa.me/919606047293?text=Hi%2C%20I'm%20interested%20in%20Fitved%20corporate%20wellness." target="_blank" rel="noopener" className="flex items-center gap-2 hover:text-fv-navy transition-colors">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </a>
          <a href="https://instagram.com/fitved.h" target="_blank" rel="noopener" className="flex items-center gap-2 hover:text-fv-navy transition-colors">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.366.062 2.633.334 3.608 1.308.975.975 1.246 2.242 1.308 3.608.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.062 1.366-.333 2.633-1.308 3.608-.975.975-2.242 1.246-3.608 1.308-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.366-.062-2.633-.333-3.608-1.308-.975-.975-1.246-2.242-1.308-3.608C2.175 15.584 2.163 15.204 2.163 12s.012-3.584.07-4.85c.062-1.366.333-2.633 1.308-3.608.975-.975 2.242-1.246 3.608-1.308C8.416 2.175 8.796 2.163 12 2.163zm0-2.163C8.741 0 8.332.014 7.052.072 5.197.157 3.355.673 2.014 2.014.673 3.355.157 5.197.072 7.052.014 8.332 0 8.741 0 12c0 3.259.014 3.668.072 4.948.085 1.855.601 3.697 1.942 5.038 1.341 1.341 3.183 1.857 5.038 1.942C8.332 23.986 8.741 24 12 24s3.668-.014 4.948-.072c1.855-.085 3.697-.601 5.038-1.942 1.341-1.341 1.857-3.183 1.942-5.038C23.986 15.668 24 15.259 24 12s-.014-3.668-.072-4.948c-.085-1.855-.601-3.697-1.942-5.038C20.645.673 18.803.157 16.948.072 15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zm0 10.162a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
            @fitved.h
          </a>
        </div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-fv-navy text-white/60 py-10">
      <div className="mx-auto max-w-6xl px-4 mb-8 pb-8 border-b border-white/10 flex flex-col items-center gap-3">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40">Backed by</p>
        <img src={razorpayRizeLogo} alt="Razorpay Rize" className="h-8 md:h-10 w-auto opacity-90" />
      </div>
      <div className="mx-auto max-w-6xl px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-3">
          <FitvedLogo className="h-6 w-auto brightness-0 invert opacity-80" />
          <span className="text-white/40">·</span>
          <span>Corporate & B2B</span>
        </div>
        <div className="flex items-center gap-6">
          <Link to="/" className="hover:text-white transition-colors">Individual plans</Link>
          <a href="https://instagram.com/fitved.h" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">Instagram</a>
          <a href="mailto:b2b@fitved.h" className="hover:text-white transition-colors">b2b@fitved.h</a>
        </div>
        <p className="text-xs text-white/30">© {new Date().getFullYear()} Fitved. All rights reserved.</p>
      </div>
    </footer>
  );
}
