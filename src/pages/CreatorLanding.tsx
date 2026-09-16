import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { Check, CircleCheck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getCreatorCampaign } from "@/data/creatorCampaigns";
import { normalizePhone } from "@/lib/phoneAuth";
import { toast } from "sonner";
import NotFound from "./NotFound";

// Same validation the main site's lead form uses (Landing.tsx `leadSchema`) —
// kept local since that schema isn't exported, and this form's fields differ.
const leadSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number"),
});

const trackEvent = (name: string, params: Record<string, unknown> = {}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (typeof w.gtag === "function") w.gtag("event", name, params);
  console.info("[track]", name, params);
};

export default function CreatorLanding() {
  const { creatorSlug } = useParams<{ creatorSlug: string }>();
  const campaign = creatorSlug ? getCreatorCampaign(creatorSlug) : undefined;

  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [activity, setActivity] = useState<string | null>(null);

  useEffect(() => {
    if (campaign) document.title = `${campaign.creatorName} x FitVed`;
  }, [campaign]);

  if (!campaign) return <NotFound />;

  const toggleGoal = (value: string) => {
    setGoals((prev) => (prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]));
  };

  const openForm = () => {
    trackEvent("creator_cta_click", { campaign: campaign.campaign });
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = leadSchema.safeParse({ name, phone });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("creator_leads").insert({
      creator: campaign.creator,
      campaign: campaign.campaign,
      name: parsed.data.name,
      phone: normalizePhone(parsed.data.phone),
      goal: goals.length ? goals.join(",") : null,
      activity_level: activity,
      source: "creator_landing",
    });
    setBusy(false);

    if (error) {
      console.error("Creator lead insert error:", JSON.stringify(error));
      toast.error("Something went wrong — please try again.");
      return;
    }

    trackEvent("creator_lead_submitted", { campaign: campaign.campaign });
    setSubmitted(true);
  };

  const closeDialog = (v: boolean) => {
    setOpen(v);
    if (!v) {
      // Reset so a second visit to the dialog starts clean.
      setSubmitted(false);
      setName("");
      setPhone("");
      setGoals([]);
      setActivity(null);
    }
  };

  return (
    <div className="min-h-screen bg-fv-neutral">
      {/* No navbar — just the FitVed corner mark, linking home. */}
      <div className="px-5 pt-5">
        <Link to="/" aria-label="Go to FitVed homepage" className="inline-block">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-fv-navy font-display text-sm font-bold text-white">
            F<span className="text-fv-orange">V</span>
          </div>
        </Link>
      </div>

      <div className="mx-auto max-w-md px-5 pb-10 pt-4">
        <img
          src={campaign.photoSrc}
          alt={campaign.creatorName}
          className="h-[300px] w-full rounded-3xl object-cover"
        />

        <p className="mt-5 text-xs font-semibold tracking-[0.12em] text-fv-orange">{campaign.eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-fv-navy">{campaign.headline}</h1>
        <p className="mt-1.5 font-display text-base font-semibold text-fv-orange">{campaign.subheading}</p>
        <p className="mt-3 text-sm leading-relaxed text-fv-text/80">{campaign.body}</p>

        <div className="mt-5 flex flex-col gap-2.5">
          {campaign.bullets.map((b) => (
            <div key={b} className="flex items-center gap-2">
              <Check className="h-4 w-4 flex-shrink-0 text-fv-orange" />
              <span className="text-sm text-fv-navy">{b}</span>
            </div>
          ))}
        </div>

        <button
          onClick={openForm}
          className="mt-6 w-full rounded-2xl bg-fv-orange py-3.5 text-sm font-bold text-white shadow-md transition-colors hover:bg-fv-orange/90"
        >
          {campaign.ctaLabel}
        </button>
        <p className="mt-2 text-center text-xs text-fv-text/50">{campaign.captionUnderCta}</p>

        <div className="mt-8 border-t border-fv-navy/10 pt-4 text-center">
          <p className="text-xs text-fv-text/50">Powered by FitVed</p>
        </div>
      </div>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-w-sm rounded-3xl border-none p-6">
          {!submitted ? (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <DialogTitle className="font-display text-lg font-bold text-fv-navy">Just a few details</DialogTitle>
                <DialogDescription className="mt-1 text-xs text-fv-text/60">
                  So {campaign.creatorName.split(" ")[0]} knows who's joining.
                </DialogDescription>
              </div>

              <div className="space-y-2.5">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-xl border border-fv-navy/10 px-3.5 py-2.5 text-sm focus:border-fv-orange focus:outline-none"
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 10))}
                  placeholder="WhatsApp number"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-fv-navy/10 px-3.5 py-2.5 text-sm focus:border-fv-orange focus:outline-none"
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-fv-navy">
                  I want to <span className="font-normal text-fv-text/50">(pick any)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {campaign.goalOptions.map((opt) => {
                    const selected = goals.includes(opt.value);
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => toggleGoal(opt.value)}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          selected ? "bg-fv-orange text-white" : "border border-fv-navy/10 text-fv-text/70"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-fv-navy">Do you exercise?</p>
                <div className="flex flex-col gap-1.5">
                  {campaign.activityOptions.map((opt) => {
                    const selected = activity === opt.value;
                    return (
                      <button
                        type="button"
                        key={opt.value}
                        onClick={() => setActivity(opt.value)}
                        className={`rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors ${
                          selected ? "bg-fv-navy text-white" : "border border-fv-navy/10 text-fv-text/70"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-2xl bg-fv-orange py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "Please wait…" : campaign.ctaLabel}
              </button>
            </form>
          ) : (
            <div className="py-2 text-center">
              <CircleCheck className="mx-auto h-10 w-10 text-fv-orange" />
              <DialogTitle className="mt-3 font-display text-lg font-bold text-fv-navy">You're in!</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-relaxed text-fv-text/70">
                {campaign.successBody}
              </DialogDescription>
              <a
                href={campaign.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackEvent("creator_whatsapp_click", { campaign: campaign.campaign })}
                className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-3 text-sm font-bold text-white"
              >
                Open WhatsApp
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
