import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CITIES, areasForCity } from "@/lib/cities";
import { SPECIALIZATIONS } from "@/lib/specializations";
import {
  Loader2, ArrowRight, ArrowLeft, Check, ImageIcon, Wifi, Home, MapPin, X,
} from "lucide-react";
import { shrinkImage } from "@/lib/imageUpload";

const BUCKET = "trainer-assets";
const NAVY = "#1E3A5F";
const LANGS = ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Urdu"];
const sanitize = (n: string) => n.replace(/[^a-zA-Z0-9.-]/g, "_");
const publicUrl = (p: string | null) => (p ? supabase.storage.from(BUCKET).getPublicUrl(p).data.publicUrl : null);

/** One-question-at-a-time onboarding wizard shown until the trainer profile has
 *  every field the directory filters on. Slides between steps; can only be
 *  closed by finishing. */
export default function TrainerCompleteProfileDialog({
  open, trainerId, contact, onCompleted,
}: {
  open: boolean;
  trainerId: string;
  contact: string | null;
  onSignOut: () => void;
  onCompleted: () => void;
}) {
  const qc = useQueryClient();
  const sb = supabase as any;

  const [name, setName] = useState("");
  const [education, setEducation] = useState("");
  const [gender, setGender] = useState("");
  const [yearsExp, setYearsExp] = useState("");
  const [clients, setClients] = useState("");
  const [specs, setSpecs] = useState<string[]>([]);
  const [availOnline, setAvailOnline] = useState(false);
  const [availOffline, setAvailOffline] = useState(false);
  const [city, setCity] = useState("");
  const [areas, setAreas] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [err, setErr] = useState("");

  // Prefill from whatever the trainer already has.
  const { data: seed } = useQuery({
    queryKey: ["trainer-onboarding-seed", trainerId],
    enabled: !!trainerId && open,
    queryFn: async () => {
      const { data } = await sb.from("trainers")
        .select("name, education, gender, years_experience, clients_trained, specializations, availability_online, availability_offline, city, service_areas, languages, photo_path")
        .eq("id", trainerId).maybeSingle();
      return data;
    },
  });
  useEffect(() => {
    if (!seed) return;
    setName(seed.name ?? "");
    setEducation(seed.education ?? "");
    setGender(seed.gender ?? "");
    setYearsExp(seed.years_experience != null ? String(seed.years_experience) : "");
    setClients(seed.clients_trained != null ? String(seed.clients_trained) : "");
    setSpecs(Array.isArray(seed.specializations) ? seed.specializations : []);
    setAvailOnline(!!seed.availability_online);
    setAvailOffline(!!seed.availability_offline);
    setCity(seed.city ?? "");
    setAreas(Array.isArray(seed.service_areas) ? seed.service_areas : []);
    setLanguages(Array.isArray(seed.languages) ? seed.languages : []);
    setPhotoPath(seed.photo_path ?? null);
  }, [seed]);

  const photoPreview = photoFile ? URL.createObjectURL(photoFile) : publicUrl(photoPath);
  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const steps = useMemo(() => [
    {
      title: "Add a profile picture",
      subtitle: "A clear photo helps clients trust and pick you.",
      valid: () => (photoFile || photoPath ? "" : "Please upload a profile picture"),
      body: (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="grid h-32 w-32 place-items-center overflow-hidden rounded-full text-4xl font-display text-white" style={{ background: NAVY }}>
            {photoPreview ? <img src={photoPreview} alt="" className="h-full w-full object-cover" /> : (name[0]?.toUpperCase() ?? "T")}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
          <Button type="button" onClick={() => fileRef.current?.click()} className="bg-fv-navy text-white hover:bg-fv-navy/90">
            <ImageIcon className="mr-2 h-4 w-4" /> {photoFile || photoPath ? "Change picture" : "Upload picture"}
          </Button>
        </div>
      ),
    },
    {
      title: "Tell us about you",
      subtitle: "The basics clients see first.",
      valid: () => {
        if (!name.trim()) return "Enter your name";
        if (!education.trim()) return "Enter your education / certification";
        if (!gender) return "Select your gender";
        return "";
      },
      body: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
          </div>
          <div className="space-y-1.5">
            <Label>Education / Certification</Label>
            <Input value={education} onChange={(e) => setEducation(e.target.value)} placeholder="e.g. B.Sc Sports Science, ACE Certified" />
          </div>
          <div className="space-y-1.5">
            <Label>Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Male">Male</SelectItem>
                <SelectItem value="Female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ),
    },
    {
      title: "Your experience",
      subtitle: "Numbers that build credibility.",
      valid: () => {
        if (!(Number(yearsExp) >= 0) || yearsExp === "") return "Enter your years of experience";
        if (!(Number(clients) >= 0) || clients === "") return "Enter the number of clients trained";
        return "";
      },
      body: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Years of experience</Label>
            <Input type="number" min={0} inputMode="numeric" value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} placeholder="e.g. 5" />
          </div>
          <div className="space-y-1.5">
            <Label>Clients trained</Label>
            <Input type="number" min={0} inputMode="numeric" value={clients} onChange={(e) => setClients(e.target.value)} placeholder="e.g. 120" />
          </div>
        </div>
      ),
    },
    {
      title: "What do you specialise in?",
      subtitle: "Pick as many as apply — clients filter by these.",
      valid: () => (specs.length ? "" : "Add at least one specialization"),
      body: (
        <div className="flex flex-wrap gap-2 max-h-[45vh] overflow-y-auto pr-1">
          {SPECIALIZATIONS.map((s) => {
            const on = specs.includes(s);
            return (
              <button key={s} type="button" onClick={() => toggle(specs, setSpecs, s)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${on ? "border-fv-orange bg-fv-orange text-white" : "border-fv-navy/15 bg-white text-fv-navy hover:border-fv-orange/40"}`}>
                {s}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: "How do you train clients?",
      subtitle: "Choose all that apply.",
      valid: () => (availOnline || availOffline ? "" : "Choose at least one option"),
      body: (
        <div className="flex flex-col gap-3">
          <label className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${availOnline ? "border-fv-orange bg-fv-orange/5" : "hover:bg-muted/40"}`}>
            <Checkbox checked={availOnline} onCheckedChange={(c) => setAvailOnline(!!c)} />
            <span className="inline-flex items-center gap-2 font-medium"><Wifi className="h-4 w-4 text-muted-foreground" /> Online coaching</span>
          </label>
          <label className={`flex items-center gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${availOffline ? "border-fv-orange bg-fv-orange/5" : "hover:bg-muted/40"}`}>
            <Checkbox checked={availOffline} onCheckedChange={(c) => setAvailOffline(!!c)} />
            <span className="inline-flex items-center gap-2 font-medium"><Home className="h-4 w-4 text-muted-foreground" /> Offline / Home visit</span>
          </label>
        </div>
      ),
    },
    {
      title: "Where do you serve?",
      subtitle: "Pick your city, then the areas you cover.",
      valid: () => (city ? "" : "Select your city"),
      body: (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Primary city</Label>
            <Select value={city} onValueChange={(v) => { setCity(v); setAreas([]); }}>
              <SelectTrigger><SelectValue placeholder="Select your city…" /></SelectTrigger>
              <SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {city && (
            <div className="space-y-2">
              <Label>Areas you serve <span className="font-normal text-muted-foreground">· optional</span></Label>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {[...areasForCity(city)].sort((a, b) => a.localeCompare(b)).map((a) => {
                  const on = areas.includes(a);
                  return (
                    <button key={a} type="button" onClick={() => toggle(areas, setAreas, a)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${on ? "border-fv-navy bg-fv-navy text-white" : "border-fv-navy/15 bg-white text-fv-navy"}`}>
                      <MapPin className="h-3 w-3" /> {a}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Languages you speak",
      subtitle: "Clients filter trainers by language.",
      valid: () => (languages.length ? "" : "Add at least one language"),
      body: (
        <div className="flex flex-wrap gap-2">
          {LANGS.map((l) => {
            const on = languages.includes(l);
            return (
              <button key={l} type="button" onClick={() => toggle(languages, setLanguages, l)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${on ? "border-fv-orange bg-fv-orange text-white" : "border-fv-navy/15 bg-white text-fv-navy hover:border-fv-orange/40"}`}>
                {l}
              </button>
            );
          })}
        </div>
      ),
    },
  ], [name, education, gender, yearsExp, clients, specs, availOnline, availOffline, city, areas, languages, photoFile, photoPath, photoPreview]);

  const save = useMutation({
    mutationFn: async () => {
      let nextPhoto = photoPath;
      if (photoFile) {
        const p = `photos/${trainerId}/${Date.now()}-${sanitize(photoFile.name)}`;
        const { error } = await supabase.storage.from(BUCKET).upload(p, await shrinkImage(photoFile), { upsert: true, cacheControl: "31536000" });
        if (error) throw error;
        nextPhoto = p;
      }
      const { error } = await sb.from("trainers").update({
        name: name.trim(),
        education: education.trim(),
        gender,
        years_experience: Number(yearsExp),
        clients_trained: Number(clients),
        specializations: specs,
        availability_online: availOnline,
        availability_offline: availOffline,
        city,
        service_areas: areas,
        languages,
        photo_path: nextPhoto,
      }).eq("id", trainerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile complete — you're now listed! 🎉");
      qc.invalidateQueries({ queryKey: ["trainer-profile-complete"] });
      qc.invalidateQueries({ queryKey: ["public-trainers"] });
      onCompleted();
    },
    onError: (e: any) => toast.error(e.message || "Could not save — please try again"),
  });

  const next = () => {
    const msg = steps[step].valid();
    if (msg) { setErr(msg); return; }
    setErr("");
    if (step === steps.length - 1) { save.mutate(); return; }
    setDir(1); setStep((s) => s + 1);
  };
  const back = () => { setErr(""); setDir(-1); setStep((s) => Math.max(0, s - 1)); };

  const s = steps[step];
  const last = step === steps.length - 1;

  return (
    <Dialog open={open}>
      <DialogContent
        className="max-w-lg gap-0 overflow-x-hidden overflow-y-auto max-h-[90dvh] p-0 [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Progress */}
        <div className="flex gap-1.5 px-6 pt-6">
          {steps.map((_, i) => (
            <div key={i} className="h-1.5 flex-1 rounded-full transition-colors"
              style={{ background: i <= step ? "#FF6B35" : "rgba(30,58,95,0.12)" }} />
          ))}
        </div>

        <div className="px-6 pb-6 pt-5">
          <p className="text-xs font-bold uppercase tracking-wider text-fv-orange">
            Step {step + 1} of {steps.length}
          </p>
          <h2 className="mt-1 font-display text-2xl text-fv-navy">{s.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{s.subtitle}</p>

          <div className="relative mt-5 min-h-[220px] overflow-hidden">
            <div
              key={step}
              className="fv-slide-in"
              style={{ ["--fv-from" as any]: `${dir * 40}px` }}
            >
              {s.body}
            </div>
          </div>

          {err && <p className="mt-3 text-sm font-medium text-destructive">{err}</p>}

          <div className="mt-6 flex items-center justify-between">
            <Button type="button" variant="ghost" onClick={back} disabled={step === 0 || save.isPending}
              className={step === 0 ? "invisible" : ""}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
            </Button>
            <Button type="button" onClick={next} disabled={save.isPending}
              className="bg-fv-orange text-white hover:bg-fv-orange/90 font-bold">
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {last ? <>Finish <Check className="ml-1.5 h-4 w-4" /></> : <>Continue <ArrowRight className="ml-1.5 h-4 w-4" /></>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
