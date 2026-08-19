import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CITIES, areasForCity } from "@/lib/cities";
import { SPECIALIZATIONS } from "@/lib/specializations";
import {
  Search, BadgeCheck, MapPin, Clock, Users, Wifi, Home, X, ArrowRight, ArrowLeft, SlidersHorizontal,
} from "lucide-react";
import { FitvedLogo } from "@/components/FitvedLogo";
import { BlogSeo } from "@/components/blog/BlogSeo";
import { SITE_URL } from "@/lib/blog/seo";

const BUCKET = "trainer-assets";
const PAGE = 9;
const LANGUAGES = ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Urdu"];
const EXPERIENCE = [
  { label: "0–2 Years", min: 0, max: 2 },
  { label: "2–5 Years", min: 2, max: 5 },
  { label: "5–10 Years", min: 5, max: 10 },
  { label: "10+ Years", min: 10, max: 999 },
];

const publicUrl = (p: string | null | undefined) => (p ? supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl : null);

/** "Harsh Saini" → "H Saini" (first name shortened to its initial for cards). */
const cardName = (name: string) => {
  const w = (name || "").trim().split(/\s+/);
  return w.length >= 2 ? `${w[0][0].toUpperCase()} ${w.slice(1).join(" ")}` : name;
};

/** Areas are compared case/space-insensitively — stored values ("Kalyan nagar")
 *  don't always match the dropdown's canonical casing ("Kalyan Nagar"). */
const norm = (s: string) => (s || "").trim().toLowerCase();

type T = any;

// A trainer appears once they're active and have started a real profile
// (a photo + years of experience). Specializations/city etc. are optional.
const isComplete = (t: T) =>
  t.active !== false && !!t.photo_path && t.years_experience != null;

function CardSkeleton() {
  return (
    <div className="rounded-2xl border bg-white overflow-hidden animate-pulse">
      <div className="h-44 bg-fv-navy/10" />
      <div className="p-4 space-y-2">
        <div className="h-4 w-2/3 bg-fv-navy/10 rounded" />
        <div className="h-3 w-full bg-fv-navy/10 rounded" />
        <div className="h-3 w-1/2 bg-fv-navy/10 rounded" />
      </div>
    </div>
  );
}

export default function TrainerListing() {
  const sb = supabase as any;
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [city, setCity] = useState(searchParams.get("city") || "");
  const [area, setArea] = useState(searchParams.get("area") || "");
  const [online, setOnline] = useState(searchParams.get("online") === "1");
  const [offline, setOffline] = useState(searchParams.get("offline") === "1");
  const [exp, setExp] = useState(searchParams.get("exp") || "");
  const [gender, setGender] = useState(searchParams.get("gender") || "");
  const [languages, setLanguages] = useState<string[]>(searchParams.get("lang")?.split(",").filter(Boolean) ?? []);
  const [specs, setSpecs] = useState<string[]>(searchParams.get("spec")?.split(",").filter(Boolean) ?? []);
  const [sort, setSort] = useState(searchParams.get("sort") || "experienced");
  const [visible, setVisible] = useState(PAGE);
  const [showFilters, setShowFilters] = useState(false);

  const trainerListingSeo = {
    title: "Find Certified Personal Trainers & Yoga Coaches Near You | FitVed",
    description: "Browse FitVed's certified personal trainers and yoga coaches. Filter by city, specialization, experience, and availability. Book a free trial session at your doorstep in Bangalore and across India.",
    canonical: `${SITE_URL}/trainers`,
    image: `${SITE_URL}/fitved-logo.png`,
  };

  const q = useQuery({
    queryKey: ["public-trainers"],
    queryFn: async () => {
      const { data, error } = await sb.from("trainers")
        .select("id, slug, name, bio, photo_path, years_experience, clients_trained, city, service_areas, specializations, languages, availability_online, availability_offline, gender, active, created_at");
      if (error) return { __notReady: true } as const;
      return ((data ?? []) as T[]).filter(isComplete);
    },
  });

  const notReady = (q.data as any)?.__notReady === true;
  const all: T[] = Array.isArray(q.data) ? q.data : [];

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let list = all.filter((t) => {
      if (s) {
        const hay = [t.name, t.city, ...(t.service_areas ?? []), ...(t.specializations ?? [])].join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (city) {
        // A trainer is "in" a city if their city column matches OR they serve
        // any area listed under that city (many trainers set areas, not city).
        const cityAreas = areasForCity(city).map(norm);
        const inCity = t.city === city || (t.service_areas ?? []).some((a: string) => cityAreas.includes(norm(a)));
        if (!inCity) return false;
      }
      if (area && !(t.service_areas ?? []).some((a: string) => norm(a) === norm(area))) return false;
      if (online && !t.availability_online) return false;
      if (offline && !t.availability_offline) return false;
      if (gender && t.gender !== gender) return false;
      if (exp) {
        const b = EXPERIENCE.find((e) => e.label === exp);
        const y = t.years_experience ?? 0;
        if (b && !(y >= b.min && y < b.max)) return false;
      }
      if (languages.length && !languages.some((l) => (t.languages ?? []).some((tl: string) => norm(tl) === norm(l)))) return false;
      if (specs.length && !specs.some((sp) => (t.specializations ?? []).some((ts: string) => norm(ts) === norm(sp)))) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sort === "experienced") return (b.years_experience ?? 0) - (a.years_experience ?? 0);
      if (sort === "popular") return (b.clients_trained ?? 0) - (a.clients_trained ?? 0);
      if (sort === "newest") return String(b.created_at).localeCompare(String(a.created_at));
      return String(a.name).localeCompare(String(b.name));
    });
    return list;
  }, [all, search, city, area, online, offline, gender, exp, languages, specs, sort]);

  useEffect(() => { setVisible(PAGE); }, [search, city, area, online, offline, gender, exp, languages, specs, sort]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (city) p.set("city", city);
    if (area) p.set("area", area);
    if (online) p.set("online", "1");
    if (offline) p.set("offline", "1");
    if (exp) p.set("exp", exp);
    if (gender) p.set("gender", gender);
    if (languages.length) p.set("lang", languages.join(","));
    if (specs.length) p.set("spec", specs.join(","));
    if (sort && sort !== "experienced") p.set("sort", sort);
    setSearchParams(p, { replace: true });
  }, [search, city, area, online, offline, exp, gender, languages, specs, sort, setSearchParams]);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const activeFilterCount = [city, area, gender, exp].filter(Boolean).length + (online ? 1 : 0) + (offline ? 1 : 0) + languages.length + specs.length;
  const clearAll = () => { setCity(""); setArea(""); setOnline(false); setOffline(false); setGender(""); setExp(""); setLanguages([]); setSpecs([]); };

  const trainerCount = all.length;
  const itemListSchema = trainerCount > 0 ? {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "FitVed Certified Trainers",
    description: "Browse certified personal trainers and yoga coaches on FitVed",
    numberOfItems: trainerCount,
    itemListElement: all.slice(0, 20).map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${SITE_URL}/trainers/${t.slug || t.id}`,
      name: cardName(t.name),
    })),
  } : null;

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Trainers", item: `${SITE_URL}/trainers` },
    ],
  };

  return (
    <div className="bg-fv-neutral min-h-screen">
      <BlogSeo
        title={trainerListingSeo.title}
        description={trainerListingSeo.description}
        canonical={trainerListingSeo.canonical}
        image={trainerListingSeo.image}
        type="website"
        jsonLd={[itemListSchema, breadcrumbSchema]}
      />
      {/* Hero */}
      <section className="relative overflow-hidden bg-fv-navy text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{ backgroundImage: "radial-gradient(circle at 18% 25%, #FF6B35 0, transparent 42%), radial-gradient(circle at 88% 20%, #ffffff 0, transparent 46%)" }} />
        <div className="relative mx-auto max-w-5xl px-4 pt-5 pb-11 md:pb-16 text-center">
          <div className="mb-8 flex items-center justify-between">
            <Link to="/" aria-label="FitVed home" className="inline-flex items-center rounded-xl bg-white px-3 py-1.5 shadow-sm transition-transform hover:scale-[1.03]">
              <FitvedLogo className="h-6 w-auto" showWord />
            </Link>
            <div className="flex items-center gap-3">
              <Link to="/trainer/signup" className="inline-flex items-center gap-1.5 rounded-full bg-fv-orange px-3.5 py-1.5 text-xs font-bold text-white ring-1 ring-fv-orange/50 transition-colors hover:bg-fv-orange/90">
                Join as a Trainer
              </Link>
              <Link to="/" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white/85 ring-1 ring-white/15 transition-colors hover:bg-white/15">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to home
              </Link>
            </div>
          </div>
          <h1 className="mx-auto mt-2 max-w-3xl font-display text-[2.6rem] font-semibold leading-[1.02] tracking-tight md:text-[4.25rem]">
            Find Your <span className="text-fv-orange">Certified Trainer</span>
          </h1>

          <div className="relative mx-auto mt-9 max-w-xl">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-fv-navy/40" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, area, city or specialization…"
              className="h-14 rounded-full border-0 bg-white pl-14 pr-5 text-fv-navy shadow-xl placeholder:text-fv-navy/40 focus-visible:ring-2 focus-visible:ring-fv-orange focus-visible:ring-offset-0" />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-white/70">
            <span className="inline-flex items-center gap-1.5"><BadgeCheck className="h-4 w-4 text-fv-orange" /> Verified profiles</span>
            <span className="inline-flex items-center gap-1.5"><Home className="h-4 w-4 text-fv-orange" /> Home &amp; online</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4 text-fv-orange" /> Free trial session</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 grid lg:grid-cols-[260px_1fr] gap-6">
        {/* Filters */}
        <aside className={`${showFilters ? "block" : "hidden"} lg:block`}>
          <div className="rounded-2xl border bg-white p-5 space-y-5 lg:sticky lg:top-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-fv-navy">Filters</span>
              {activeFilterCount > 0 && (
                <button onClick={clearAll} className="text-xs font-semibold text-fv-orange hover:underline">Clear all</button>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">City</label>
              <Select value={city} onValueChange={(v) => { setCity(v); setArea(""); }}>
                <SelectTrigger><SelectValue placeholder="All cities" /></SelectTrigger>
                <SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {city && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Area</label>
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger><SelectValue placeholder="All areas" /></SelectTrigger>
                  <SelectContent>{[...areasForCity(city)].sort((a, b) => a.localeCompare(b)).map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Availability</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={online} onCheckedChange={(c) => setOnline(!!c)} /> <Wifi className="h-3.5 w-3.5" /> Online</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={offline} onCheckedChange={(c) => setOffline(!!c)} /> <Home className="h-3.5 w-3.5" /> Offline / Home Visit</label>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Experience</label>
              <Select value={exp} onValueChange={setExp}>
                <SelectTrigger><SelectValue placeholder="Any experience" /></SelectTrigger>
                <SelectContent>{EXPERIENCE.map((e) => <SelectItem key={e.label} value={e.label}>{e.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Gender</label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem></SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Languages</label>
              <div className="flex flex-wrap gap-1.5">
                {LANGUAGES.map((l) => (
                  <button key={l} onClick={() => toggle(languages, setLanguages, l)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${languages.includes(l) ? "bg-fv-orange text-white border-fv-orange" : "bg-white text-fv-navy border-fv-navy/15"}`}>{l}</button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Specializations</label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {SPECIALIZATIONS.map((sp) => (
                  <button key={sp} onClick={() => toggle(specs, setSpecs, sp)}
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold border ${specs.includes(sp) ? "bg-fv-navy text-white border-fv-navy" : "bg-white text-fv-navy border-fv-navy/15"}`}>{sp}</button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* Results */}
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="text-sm text-muted-foreground">
              {q.isLoading ? "Loading…" : <><span className="font-display text-base text-fv-navy">{filtered.length}</span> trainer{filtered.length === 1 ? "" : "s"} found</>}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="lg:hidden gap-1.5" onClick={() => setShowFilters((s) => !s)}>
                <SlidersHorizontal className="h-4 w-4" /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
              </Button>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="experienced">Most Experienced</SelectItem>
                  <SelectItem value="popular">Most Popular</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="alpha">Alphabetical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {notReady ? (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-sm text-amber-900">
              Trainer directory isn't enabled yet — run the latest migration.
            </div>
          ) : q.isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-fv-navy/15 bg-white p-12 text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-fv-orange/10">
                <Search className="h-6 w-6 text-fv-orange" />
              </div>
              <p className="mt-4 font-display text-xl text-fv-navy">No trainers match your filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try clearing some filters or searching a different area.</p>
              {activeFilterCount > 0 && <Button onClick={clearAll} className="mt-4 bg-fv-orange text-white hover:bg-fv-orange/90">Clear filters</Button>}
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {filtered.slice(0, visible).map((t) => {
                  const photo = publicUrl(t.photo_path);
                  const initials = (t.name || "T").split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase();
                  const langs: string[] = t.languages ?? [];
                  const specList: string[] = t.specializations ?? [];
                  return (
                    <Link key={t.id} to={`/trainers/${t.slug || t.id}`}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-fv-navy/10 bg-white shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-fv-orange/40 hover:shadow-lg">
                      <div className="relative h-56 overflow-hidden bg-fv-navy">
                        {photo
                          ? <img src={photo} alt={t.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                          : <div className="grid h-full w-full place-items-center font-display text-4xl text-white/90">{initials}</div>}
                        <div className="absolute inset-0 bg-gradient-to-t from-fv-navy/95 via-fv-navy/25 to-transparent" />
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-fv-navy shadow-sm">
                          <BadgeCheck className="h-3.5 w-3.5 text-fv-orange" /> Verified
                        </span>
                        {(t.availability_online || t.availability_offline) && (
                          <span className="absolute right-3 top-3 rounded-full bg-fv-orange px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
                            {[t.availability_online && "Online", t.availability_offline && "In-person"].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        <div className="absolute inset-x-0 bottom-0 p-4">
                          <h3 className="font-display text-xl leading-tight text-white">{cardName(t.name)}</h3>
                          {t.city && <p className="mt-1 inline-flex items-center gap-1 text-xs text-white/80"><MapPin className="h-3 w-3" /> {t.city}</p>}
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex-1 rounded-xl bg-fv-neutral py-2 text-center">
                            <p className="font-display text-lg leading-none text-fv-navy">{t.years_experience ?? 0}+</p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Years exp</p>
                          </div>
                          <div className="flex-1 rounded-xl bg-fv-neutral py-2 text-center">
                            <p className="font-display text-lg leading-none text-fv-navy">{t.clients_trained ?? 0}+</p>
                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Clients</p>
                          </div>
                        </div>
                        {specList.length > 0 && (
                          <div className="mt-3 flex flex-wrap items-center gap-1.5">
                            {specList.slice(0, 2).map((sp: string) => (
                              <span key={sp} className="rounded-full bg-fv-navy/5 px-2.5 py-0.5 text-[11px] font-semibold text-fv-navy">{sp}</span>
                            ))}
                            {specList.length > 2 && <span className="text-[11px] font-semibold text-muted-foreground">+{specList.length - 2} more</span>}
                          </div>
                        )}
                        {langs.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">Speaks {langs.slice(0, 3).join(", ")}</p>}
                        <div className="mt-auto flex items-center justify-between border-t border-fv-navy/5 pt-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-fv-orange">View Profile</span>
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-fv-orange/10 text-fv-orange transition-colors group-hover:bg-fv-orange group-hover:text-white">
                            <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {visible < filtered.length && (
                <div className="mt-8 text-center">
                  <Button variant="outline" onClick={() => setVisible((v) => v + PAGE)}
                    className="rounded-full border-fv-orange/40 text-fv-navy hover:bg-fv-orange hover:text-white hover:border-fv-orange font-bold uppercase tracking-wider text-xs h-11 px-8">
                    Load more trainers
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
