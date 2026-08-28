import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  User, Image as ImageIcon, GraduationCap, Clock, Users, Link2, MapPin,
  FileText, Award, Building2, Phone, X, Plus, Loader2, ExternalLink,
  Trash2, LogOut, Save, Dumbbell, Globe, Instagram, Facebook,
  Languages as LangIcon, Wifi, Home,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { SPECIALIZATIONS } from "@/lib/specializations";
import { CITIES, areasForCity } from "@/lib/cities";
import { buildTrainerSlug } from "@/lib/trainerSlug";
import { shrinkImage } from "@/lib/imageUpload";

const LANGUAGES = [
  "English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi",
  "Bengali", "Gujarati", "Punjabi", "Urdu", "Odia", "Assamese", "Konkani",
];

const BUCKET = "trainer-assets";
const NAVY = "#1E3A5F";
const CERT_ACCEPT = ".pdf,.jpg,.jpeg,.png,application/pdf,image/png,image/jpeg";
const CV_ACCEPT = ".pdf,.doc,.docx,application/pdf";

function publicUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9.-]/g, "_");
}

type CertRow = { id: string; file_path: string; file_name: string | null };
type Seed = {
  name: string; education: string; yearsExp: string; clientsTrained: string;
  socialLink: string; serviceAreas: string[]; specializations: string[]; bio: string;
  gender: string; about: string; city: string; languages: string[];
  availOnline: boolean; availOffline: boolean;
  instagram: string; website: string; facebook: string;
};

/** Your unique, shareable public profile URL with a one-tap copy button. */
function ShareProfileLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/trainers/${slug}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Profile link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — long-press the link to copy it");
    }
  };
  return (
    <div className="mx-5 md:mx-6 mt-5 rounded-xl border p-4" style={{ background: "rgba(30,58,95,0.04)", borderColor: "rgba(30,58,95,0.15)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Link2 className="h-4 w-4" style={{ color: NAVY }} />
        <p className="font-semibold text-sm text-foreground">Your shareable profile link</p>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Share this anywhere — Instagram bio, WhatsApp, business cards. It always opens your public FitVed profile.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <a href={url} target="_blank" rel="noopener noreferrer"
          className="flex-1 min-w-0 truncate rounded-lg border bg-white px-3 py-2 text-sm text-foreground hover:underline">
          {url.replace(/^https?:\/\//, "")}
        </a>
        <div className="flex gap-2 shrink-0">
          <Button type="button" size="sm" variant="outline" onClick={copy} className="gap-1.5">
            {copied ? "Copied!" : "Copy link"}
          </Button>
          <Button type="button" size="sm" variant="ghost" asChild className="gap-1.5">
            <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> View</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Small labelled section header (icon chip + title). */
function SectionHeader({ icon: Icon, title, note }: { icon: any; title: string; note?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="grid place-items-center h-8 w-8 rounded-lg shrink-0" style={{ background: "rgba(30,58,95,0.07)" }}>
        <Icon className="h-4 w-4" style={{ color: NAVY }} />
      </div>
      <h3 className="font-semibold text-foreground">{title}</h3>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}

/** Labelled field wrapper. */
function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className={`text-sm font-medium ${error ? "text-destructive" : "text-foreground"}`}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

export default function TrainerProfileForm({
  trainerId, contact, onSignOut, onCompleted,
}: {
  trainerId: string;
  contact: string | null;
  onSignOut: () => void;
  /** Fired after a successful save — the profile is fully complete by then,
   *  since every required field is validated before the save goes through. */
  onCompleted?: () => void;
}) {
  const qc = useQueryClient();
  const sb = supabase as any; // new columns/table absent from generated types until migration runs

  // ── Data ────────────────────────────────────────────────────────────────
  const details = useQuery({
    queryKey: ["trainer-profile-details", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("trainers")
        .select("name, education, years_experience, clients_trained, social_link, service_areas, specializations, bio, cv_path, photo_path, gender, about, city, languages, availability_online, availability_offline, instagram, website, facebook, updated_at, slug")
        .eq("id", trainerId)
        .maybeSingle();
      if (error) return { __notReady: true } as const;
      return data as any;
    },
  });

  const certsQuery = useQuery({
    queryKey: ["trainer-certificates", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("trainer_certificates").select("id, file_path, file_name")
        .eq("trainer_id", trainerId).order("created_at", { ascending: true });
      if (error) return [] as CertRow[];
      return (data ?? []) as CertRow[];
    },
  });

  const societiesQuery = useQuery({
    queryKey: ["my-trainer-societies", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data } = await supabase.from("trainer_societies")
        .select("societies(id, name)").eq("trainer_id", trainerId);
      return (data ?? []).map((r: any) => r.societies).filter(Boolean) as { id: string; name: string }[];
    },
  });

  const slotsQuery = useQuery({
    queryKey: ["trainer-own-slots", trainerId],
    enabled: !!trainerId,
    queryFn: async () => {
      const { data } = await supabase.from("trainer_slots")
        .select("society_id, time_slot").eq("trainer_id", trainerId).order("time_slot");
      return data ?? [];
    },
  });

  const notReady = (details.data as any)?.__notReady === true;
  const societies = societiesQuery.data ?? [];
  const slotsBySociety = societies
    .map((s) => ({ society: s, slots: (slotsQuery.data ?? []).filter((m) => m.society_id === s.id).map((m) => m.time_slot) }))
    .filter((g) => g.slots.length > 0);

  // ── Form state ────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [education, setEducation] = useState("");
  const [yearsExp, setYearsExp] = useState("");
  const [clientsTrained, setClientsTrained] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [addSpec, setAddSpec] = useState("");
  const [bio, setBio] = useState("");
  const [gender, setGender] = useState("");
  const [about, setAbout] = useState("");
  const [city, setCity] = useState("");
  const [addArea2, setAddArea2] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [addLang, setAddLang] = useState("");
  const [availOnline, setAvailOnline] = useState(false);
  const [availOffline, setAvailOffline] = useState(false);
  const [instagram, setInstagram] = useState("");
  const [website, setWebsite] = useState("");
  const [facebook, setFacebook] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoDeleted, setPhotoDeleted] = useState(false);
  const [cvPath, setCvPath] = useState<string | null>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [newCerts, setNewCerts] = useState<File[]>([]);
  const [removedCertIds, setRemovedCertIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const seedRef = useRef<Seed | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const cvInput = useRef<HTMLInputElement>(null);
  const certInput = useRef<HTMLInputElement>(null);

  const seedForm = (d: any) => {
    const seed: Seed = {
      name: d.name ?? "",
      education: d.education ?? "",
      yearsExp: d.years_experience != null ? String(d.years_experience) : "",
      clientsTrained: d.clients_trained != null ? String(d.clients_trained) : "",
      socialLink: d.social_link ?? "",
      serviceAreas: Array.isArray(d.service_areas) ? d.service_areas : [],
      specializations: Array.isArray(d.specializations) ? d.specializations : [],
      bio: d.bio ?? "",
      gender: d.gender ?? "",
      about: d.about ?? "",
      city: d.city ?? "",
      languages: Array.isArray(d.languages) ? d.languages : [],
      availOnline: !!d.availability_online,
      availOffline: !!d.availability_offline,
      instagram: d.instagram ?? "",
      website: d.website ?? "", facebook: d.facebook ?? "",
    };
    seedRef.current = seed;
    setName(seed.name);
    setEducation(seed.education);
    setYearsExp(seed.yearsExp);
    setClientsTrained(seed.clientsTrained);
    setSocialLink(seed.socialLink);
    setServiceAreas(seed.serviceAreas);
    setSpecializations(seed.specializations);
    setBio(seed.bio);
    setGender(seed.gender); setAbout(seed.about);
    setCity(seed.city); setLanguages(seed.languages);
    setAvailOnline(seed.availOnline); setAvailOffline(seed.availOffline);
    setInstagram(seed.instagram);
    setWebsite(seed.website); setFacebook(seed.facebook);
    setPhotoPath(d.photo_path ?? null);
    setCvPath(d.cv_path ?? null);
    setPhotoFile(null); setPhotoDeleted(false); setCvFile(null);
    setNewCerts([]); setRemovedCertIds([]); setAddSpec("");
    setAddArea2(""); setAddLang(""); setErrors({});
  };

  useEffect(() => {
    const d = details.data as any;
    if (d && !d.__notReady) seedForm(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.data]);

  const existingCerts = (certsQuery.data ?? []).filter((c) => !removedCertIds.includes(c.id));
  const showPhoto = photoFile ? URL.createObjectURL(photoFile) : (!photoDeleted ? publicUrl(photoPath) : null);
  const hasPhoto = !!photoFile || (!!photoPath && !photoDeleted);
  const updatedAt = (details.data as any)?.updated_at as string | null | undefined;

  const dirty = useMemo(() => {
    const s = seedRef.current;
    if (!s) return false;
    return (
      name !== s.name || education !== s.education || yearsExp !== s.yearsExp ||
      clientsTrained !== s.clientsTrained || socialLink !== s.socialLink ||
      JSON.stringify(serviceAreas) !== JSON.stringify(s.serviceAreas) ||
      JSON.stringify(specializations) !== JSON.stringify(s.specializations) || bio !== s.bio ||
      gender !== s.gender || about !== s.about || city !== s.city ||
      JSON.stringify(languages) !== JSON.stringify(s.languages) ||
      availOnline !== s.availOnline || availOffline !== s.availOffline ||
      instagram !== s.instagram ||
      website !== s.website || facebook !== s.facebook ||
      !!photoFile || photoDeleted || !!cvFile || newCerts.length > 0 || removedCertIds.length > 0
    );
  }, [name, education, yearsExp, clientsTrained, socialLink, serviceAreas, specializations, bio, gender, about, city, languages, availOnline, availOffline, instagram, website, facebook, photoFile, photoDeleted, cvFile, newCerts, removedCertIds]);

  const addAreaFromCity = (v: string) => {
    if (v && !serviceAreas.includes(v)) setServiceAreas((s) => [...s, v]);
    setAddArea2("");
  };
  const removeArea = (v: string) => setServiceAreas((s) => s.filter((x) => x !== v));
  const addLanguage = (v: string) => { if (v && !languages.includes(v)) setLanguages((l) => [...l, v]); setAddLang(""); };
  const removeLanguage = (v: string) => setLanguages((l) => l.filter((x) => x !== v));

  const addSpecialization = (v: string) => {
    if (v && !specializations.includes(v)) setSpecializations((s) => [...s, v]);
    setAddSpec("");
  };
  const removeSpecialization = (v: string) => setSpecializations((s) => s.filter((x) => x !== v));

  const onPickCerts = (files: FileList | null) => {
    if (!files) return;
    const picked = Array.from(files).filter((f) => {
      const ok = /\.(pdf|jpe?g|png)$/i.test(f.name);
      if (!ok) toast.error(`${f.name}: only PDF, JPG or PNG allowed`);
      return ok;
    });
    setNewCerts((c) => [...c, ...picked]);
  };

  const discard = () => { if (details.data) seedForm(details.data); };

  // ── Save ───────────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: async () => {
      const years = parseInt(yearsExp, 10);
      const clients = parseInt(clientsTrained, 10);
      const errs: Record<string, string> = {};
      if (!name.trim()) errs.name = "Name is required";
      if (!hasPhoto) errs.photo = "Profile picture is required";
      if (!education.trim()) errs.education = "Education is required";
      if (!Number.isFinite(years) || years < 0) errs.years = "Enter your years of experience";
      if (!Number.isFinite(clients) || clients < 0) errs.clients = "Enter the number of clients trained";
      // Filter-critical fields — a trainer can't be found without these.
      if (!gender) errs.gender = "Select your gender";
      if (specializations.length === 0) errs.specializations = "Add at least one specialization";
      if (!availOnline && !availOffline) errs.availability = "Choose at least one availability";
      if (!city) errs.city = "Select your primary city";
      if (languages.length === 0) errs.languages = "Add at least one language";
      setErrors(errs);
      if (Object.keys(errs).length) throw new Error("Please fix the highlighted fields");
      const primarySocial = [instagram, website, facebook, socialLink].map((s) => s.trim()).find(Boolean) || null;

      // Photo
      let nextPhoto = photoPath;
      if (photoDeleted && photoPath) {
        await supabase.storage.from(BUCKET).remove([photoPath]);
        nextPhoto = null;
      }
      if (photoFile) {
        const p = `photos/${trainerId}/${Date.now()}-${sanitize(photoFile.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(p, await shrinkImage(photoFile), { upsert: true, cacheControl: "31536000" });
        if (error) throw error;
        nextPhoto = p;
      }

      // CV
      let nextCv = cvPath;
      if (cvFile) {
        const p = `cv/${trainerId}/${Date.now()}-${sanitize(cvFile.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(p, cvFile, { upsert: true, cacheControl: "31536000" });
        if (error) throw error;
        nextCv = p;
      }

      // New certificates
      const certRows: { trainer_id: string; file_path: string; file_name: string; mime_type: string }[] = [];
      for (const f of newCerts) {
        const p = `certificates/${trainerId}/${Date.now()}-${sanitize(f.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(p, f, { cacheControl: "31536000" });
        if (error) throw error;
        certRows.push({ trainer_id: trainerId, file_path: p, file_name: f.name, mime_type: f.type });
      }

      const { error: updErr } = await sb.from("trainers").update({
        name: name.trim(),
        education: education.trim(),
        years_experience: years,
        clients_trained: clients,
        social_link: primarySocial,
        service_areas: serviceAreas,
        specializations,
        bio: about.trim() || null,
        gender: gender || null,
        about: about.trim() || null,
        city: city || null,
        languages,
        availability_online: availOnline,
        availability_offline: availOffline,
        instagram: instagram.trim() || null,
        website: website.trim() || null,
        facebook: facebook.trim() || null,
        photo_path: nextPhoto,
        cv_path: nextCv,
        // Keep the shareable public URL in sync with name + specialization.
        slug: buildTrainerSlug(name, specializations, trainerId),
        updated_at: new Date().toISOString(),
      }).eq("id", trainerId);
      if (updErr) throw updErr;

      if (certRows.length) {
        const { error } = await sb.from("trainer_certificates").insert(certRows);
        if (error) throw error;
      }
      if (removedCertIds.length) {
        const toRemove = (certsQuery.data ?? []).filter((c) => removedCertIds.includes(c.id));
        const paths = toRemove.map((c) => c.file_path);
        if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
        const { error } = await sb.from("trainer_certificates").delete().in("id", removedCertIds);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Profile saved");
      setErrors({});
      qc.invalidateQueries({ queryKey: ["trainer-profile-details", trainerId] });
      qc.invalidateQueries({ queryKey: ["trainer-certificates", trainerId] });
      qc.invalidateQueries({ queryKey: ["my-trainer-profile"] });
      qc.invalidateQueries({ queryKey: ["trainer-profile-complete"] });
      onCompleted?.();
    },
    onError: (e: any) => toast.error(e.message || "Could not save profile"),
  });

  // ── States ──────────────────────────────────────────────────────────────
  if (details.isLoading) {
    return (
      <div className="rounded-2xl border bg-card p-8 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your profile…
      </div>
    );
  }
  if (notReady) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        <p className="font-semibold">Profile isn't enabled yet.</p>
        <p className="mt-1">
          Run the latest migration (<code>20260730120000_find_trainers_foundation.sql</code>) in Supabase, then reload.
        </p>
      </div>
    );
  }

  const initials = (name || "T").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <>
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Header with Save / Discard */}
      <div className="flex items-start justify-between gap-4 p-5 md:p-6 border-b">
        <div>
          <h2 className="font-display text-xl text-foreground">Your profile</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {updatedAt ? `Last edited on ${format(new Date(updatedAt), "d MMMM yyyy")}` : "Complete your trainer profile."}
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={discard} disabled={!dirty || save.isPending}>
            Discard
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </div>
      </div>

      {/* Shareable public profile link */}
      <ShareProfileLink
        slug={(details.data as any)?.slug || buildTrainerSlug(name, specializations, trainerId)}
      />

      <div className="p-5 md:p-6 space-y-9">
        {/* Profile picture */}
        <section>
          <SectionHeader icon={ImageIcon} title="Profile picture" note="· required" />
          <div className="flex items-center gap-5">
            <div className={`h-20 w-20 rounded-full overflow-hidden grid place-items-center shrink-0 text-white text-xl font-bold ${errors.photo ? "ring-2 ring-destructive" : ""}`}
              style={{ background: showPhoto ? "transparent" : NAVY }}>
              {showPhoto ? <img src={showPhoto} alt="Trainer" className="h-full w-full object-cover" /> : initials}
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={photoInput} type="file" accept="image/png,image/jpeg" className="hidden"
                onChange={(e) => { setPhotoFile(e.target.files?.[0] ?? null); setPhotoDeleted(false); }} />
              <Button type="button" size="sm" onClick={() => photoInput.current?.click()}>
                {hasPhoto ? "Change picture" : "Upload picture"}
              </Button>
              {hasPhoto && (
                <Button type="button" variant="outline" size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => { setPhotoFile(null); setPhotoDeleted(true); }}>
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </Button>
              )}
            </div>
          </div>
          {errors.photo && <p className="mt-2 text-xs font-medium text-destructive">{errors.photo}</p>}
        </section>

        {/* Personal information */}
        <section>
          <SectionHeader icon={User} title="Personal information" />
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <Field label="Name" required error={errors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
            </Field>
            <Field label="Contact">
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={contact ?? "—"} readOnly disabled className="pl-9" />
              </div>
            </Field>
            <Field label="Education" required error={errors.education}>
              <Input value={education} onChange={(e) => setEducation(e.target.value)}
                placeholder="e.g. B.Sc Sports Science, ACE Certified" />
            </Field>
            <Field label="Gender" required error={errors.gender}>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Years of experience" required error={errors.years}>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="number" min={0} inputMode="numeric" value={yearsExp}
                  onChange={(e) => setYearsExp(e.target.value)} placeholder="e.g. 5" className="pl-9" />
              </div>
            </Field>
            <Field label="Clients trained" required error={errors.clients}>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="number" min={0} inputMode="numeric" value={clientsTrained}
                  onChange={(e) => setClientsTrained(e.target.value)} placeholder="e.g. 120" className="pl-9" />
              </div>
            </Field>
          </div>

          {/* Specializations — pick as many as you like */}
          <div className="mt-4 space-y-1.5">
            <Label className={`text-sm font-medium flex items-center gap-1.5 ${errors.specializations ? "text-destructive" : "text-foreground"}`}>
              <Dumbbell className="h-4 w-4 text-muted-foreground" /> Specializations <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground -mt-1">Add all the areas you specialise in — you can pick as many as you like.</p>
            {errors.specializations && <p className="text-xs font-medium text-destructive -mt-1">{errors.specializations}</p>}
            <Select value={addSpec} onValueChange={addSpecialization}>
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Add a specialization…" />
              </SelectTrigger>
              <SelectContent>
                {SPECIALIZATIONS.filter((s) => !specializations.includes(s)).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {specializations.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {specializations.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1.5 py-1 text-xs font-semibold"
                    style={{ background: "rgba(240,167,32,0.14)", color: "#a07010" }}>
                    {s}
                    <button type="button" onClick={() => removeSpecialization(s)} className="rounded-full hover:bg-black/10 p-0.5" aria-label={`Remove ${s}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Bio */}
          <div className="mt-4">
            <Field label="Bio">
              <Textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={4}
                placeholder="Write something here — clients will read this on your profile." />
            </Field>
          </div>
        </section>

        {/* Availability */}
        <section>
          <SectionHeader icon={Wifi} title="Availability" note="· required" />
          {errors.availability && <p className="mb-2 text-xs font-medium text-destructive">{errors.availability}</p>}
          <div className="flex flex-col sm:flex-row gap-3">
            <label className={`flex items-center gap-3 rounded-xl border p-3 flex-1 cursor-pointer transition-colors ${availOnline ? "border-fv-orange bg-fv-orange/5" : "hover:bg-muted/40"}`}>
              <Checkbox checked={availOnline} onCheckedChange={(c) => setAvailOnline(!!c)} />
              <span className="inline-flex items-center gap-2 text-sm font-medium"><Wifi className="h-4 w-4 text-muted-foreground" /> Online</span>
            </label>
            <label className={`flex items-center gap-3 rounded-xl border p-3 flex-1 cursor-pointer transition-colors ${availOffline ? "border-fv-orange bg-fv-orange/5" : "hover:bg-muted/40"}`}>
              <Checkbox checked={availOffline} onCheckedChange={(c) => setAvailOffline(!!c)} />
              <span className="inline-flex items-center gap-2 text-sm font-medium"><Home className="h-4 w-4 text-muted-foreground" /> Offline / Home Visit</span>
            </label>
          </div>
        </section>

        {/* Location */}
        <section>
          <SectionHeader icon={MapPin} title="City & areas served" note="· required" />
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Primary city" required error={errors.city}>
              <Select value={city} onValueChange={(v) => { setCity(v); }}>
                <SelectTrigger><SelectValue placeholder="Select your city…" /></SelectTrigger>
                <SelectContent>
                  {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            {city && (
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-foreground">Areas you serve in {city}</Label>
                <Select value={addArea2} onValueChange={addAreaFromCity}>
                  <SelectTrigger><SelectValue placeholder="Add an area…" /></SelectTrigger>
                  <SelectContent>
                    {[...areasForCity(city)].sort((a, b) => a.localeCompare(b)).filter((a) => !serviceAreas.includes(a)).map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {serviceAreas.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-3">
              {serviceAreas.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1.5 py-1 text-xs font-semibold"
                  style={{ background: "rgba(30,58,95,0.08)", color: NAVY }}>
                  <MapPin className="h-3 w-3" /> {a}
                  <button type="button" onClick={() => removeArea(a)} className="rounded-full hover:bg-black/10 p-0.5" aria-label={`Remove ${a}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Languages */}
        <section>
          <SectionHeader icon={LangIcon} title="Languages" note="· required" />
          {errors.languages && <p className="mb-2 text-xs font-medium text-destructive">{errors.languages}</p>}
          <Select value={addLang} onValueChange={addLanguage}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Add a language…" /></SelectTrigger>
            <SelectContent>
              {LANGUAGES.filter((l) => !languages.includes(l)).map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          {languages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-3">
              {languages.map((l) => (
                <span key={l} className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1.5 py-1 text-xs font-semibold"
                  style={{ background: "rgba(240,167,32,0.14)", color: "#a07010" }}>
                  {l}
                  <button type="button" onClick={() => removeLanguage(l)} className="rounded-full hover:bg-black/10 p-0.5" aria-label={`Remove ${l}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Social links */}
        <section>
          <SectionHeader icon={Link2} title="Social links" note="· optional" />
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { icon: Instagram, label: "Instagram", value: instagram, set: setInstagram, ph: "instagram.com/…" },
              { icon: Facebook, label: "Facebook", value: facebook, set: setFacebook, ph: "facebook.com/…" },
              { icon: Globe, label: "Website", value: website, set: setWebsite, ph: "yourwebsite.com" },
            ].map((s) => (
              <Field key={s.label} label={s.label}>
                <div className="relative">
                  <s.icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input type="url" value={s.value} onChange={(e) => s.set(e.target.value)} placeholder={s.ph} className="pl-9" />
                </div>
              </Field>
            ))}
          </div>
        </section>


        {/* Documents */}
        <section>
          <SectionHeader icon={FileText} title="Documents" note="· optional" />
          <div className="grid gap-5 md:grid-cols-2">
            {/* CV */}
            <div className="space-y-2">
              {(cvFile || cvPath) && (
                <p className="text-sm inline-flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  {cvFile ? <span className="truncate">{cvFile.name}</span> : (
                    <a href={publicUrl(cvPath) ?? "#"} target="_blank" rel="noopener" className="hover:underline inline-flex items-center gap-1">
                      Current CV <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              )}
              <input ref={cvInput} type="file" accept={CV_ACCEPT} className="hidden"
                onChange={(e) => setCvFile(e.target.files?.[0] ?? null)} />
              <Button type="button" variant="outline" size="sm"
                className={errors.cv ? "border-destructive text-destructive hover:text-destructive" : ""}
                onClick={() => cvInput.current?.click()}>
                <FileText className="mr-2 h-4 w-4" /> {cvFile || cvPath ? "Change CV" : "Upload CV"}
              </Button>
            </div>

            {/* Certificates */}
            <div className="space-y-2">
              {(existingCerts.length > 0 || newCerts.length > 0) && (
                <ul className="space-y-1.5">
                  {existingCerts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <a href={publicUrl(c.file_path) ?? "#"} target="_blank" rel="noopener" className="inline-flex items-center gap-2 min-w-0 hover:underline">
                        <Award className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{c.file_name || "Certificate"}</span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </a>
                      <button type="button" onClick={() => setRemovedCertIds((r) => [...r, c.id])} className="text-destructive shrink-0" aria-label="Remove certificate">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                  {newCerts.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <Award className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">(new)</span>
                      </span>
                      <button type="button" onClick={() => setNewCerts((c) => c.filter((_, idx) => idx !== i))} className="text-destructive shrink-0" aria-label="Remove file">
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input ref={certInput} type="file" accept={CERT_ACCEPT} multiple className="hidden"
                onChange={(e) => { onPickCerts(e.target.files); e.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm"
                className={errors.certs ? "border-destructive text-destructive hover:text-destructive" : ""}
                onClick={() => certInput.current?.click()}>
                <Plus className="mr-2 h-4 w-4" /> Add certificate
              </Button>
            </div>
          </div>
        </section>

        {/* Assignments (read-only, admin-managed) */}
        <section>
          <SectionHeader icon={Building2} title="Your assignments" />
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Assigned societies</p>
              {societies.length === 0 ? (
                <p className="text-sm text-muted-foreground">None assigned yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {societies.map((s) => (
                    <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                      style={{ background: "rgba(30,58,95,0.06)", color: NAVY }}>
                      <Building2 className="h-3 w-3" /> {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {slotsBySociety.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Time slots</p>
                <div className="space-y-3">
                  {slotsBySociety.map(({ society, slots }) => (
                    <div key={society.id}>
                      <p className="text-sm font-medium mb-1.5">{society.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {slots.map((slot) => (
                          <span key={slot} className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "rgba(240,167,32,0.14)", color: "#a07010" }}>
                            {slot}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">To update your assigned societies or slots, contact your admin.</p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-4 p-5 md:p-6 border-t bg-muted/30">
        <Button variant="outline" size="sm" onClick={onSignOut} className="text-destructive hover:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>
        <Button size="sm" className="hidden md:inline-flex" onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save profile
        </Button>
      </div>
    </div>

    {/* Mobile: clearance so nothing hides behind the sticky save bar */}
    <div className="h-16 md:hidden" />

    {/* Mobile: sticky save bar, fixed above the bottom nav */}
    <div
      className="md:hidden fixed inset-x-0 z-40 border-t bg-white px-4 py-3 flex items-center gap-3 shadow-[0_-4px_20px_rgba(30,58,95,0.08)]"
      style={{ bottom: "calc(64px + env(safe-area-inset-bottom))" }}
    >
      <Button variant="outline" onClick={discard} disabled={!dirty || save.isPending} className="flex-1">
        Discard
      </Button>
      <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}
        className="flex-[2] bg-fv-orange text-white hover:bg-fv-orange/90 font-bold">
        {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Save
      </Button>
    </div>
    </>
  );
}
