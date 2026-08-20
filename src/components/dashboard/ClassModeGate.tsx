import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Wifi, Home, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useProfile";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClassMode } from "@/lib/classMode";
import { MODE_LABEL } from "@/lib/classMode";

/**
 * Compulsory first-time class-mode selection. Shown to brand-new clients once
 * they've finished the existing signup flow, and cannot be dismissed until they
 * pick Online or Offline. Stored on profiles.class_mode; changeable afterwards
 * only via an admin-approved request.
 */
export function ClassModeGate() {
  const { user, role } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<ClassMode | null>(null);
  const [busy, setBusy] = useState(false);

  const hasColumn = profile ? "class_mode" in (profile as Record<string, unknown>) : false;
  const needsChoice =
    role === "client" && !isLoading && !!profile && hasColumn && !(profile as any).class_mode;

  const confirm = async () => {
    if (!user || !selected) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ class_mode: selected })
      .eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error("Couldn't save your choice. Please try again.");
      return;
    }
    toast.success(`You're all set for ${MODE_LABEL[selected]} classes`);
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  };

  const OPTIONS: { mode: ClassMode; icon: typeof Wifi; title: string; desc: string }[] = [
    { mode: "offline", icon: Home, title: "Offline", desc: "In-person 1-on-1 at your society or home" },
    { mode: "online", icon: Wifi, title: "Online", desc: "Live video-guided sessions from anywhere" },
  ];

  return (
    <Dialog open={needsChoice}>
      <DialogContent
        className="max-w-lg overflow-hidden border-0 p-0 [&>button.absolute]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Branded header */}
        <div className="bg-fv-navy px-6 py-7 text-center text-white">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-fv-orange/20 text-fv-orange">
            <Wifi className="h-5 w-5" />
          </span>
          <h2 className="font-display text-2xl font-semibold tracking-tight">Welcome to FitVed</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-white/70">
            One quick step — pick how you'd like to train. This is required to continue.
          </p>
        </div>

        {/* Options */}
        <div className="space-y-3 p-6">
          {OPTIONS.map(({ mode, icon: Icon, title, desc }) => {
            const active = selected === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={busy}
                onClick={() => setSelected(mode)}
                aria-pressed={active}
                className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all ${
                  active
                    ? "border-fv-orange bg-fv-orange/5 ring-2 ring-fv-orange/30"
                    : "border-fv-navy/12 bg-white hover:border-fv-orange/50 hover:bg-fv-neutral/60"
                }`}
              >
                <span
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl transition-colors ${
                    active ? "bg-fv-orange text-white" : "bg-fv-orange/10 text-fv-orange"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-fv-navy">{title}</span>
                  <span className="block text-sm text-muted-foreground">{desc}</span>
                </span>
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-all ${
                    active ? "border-fv-orange bg-fv-orange text-white" : "border-fv-navy/20 text-transparent"
                  }`}
                >
                  <Check className="h-4 w-4" />
                </span>
              </button>
            );
          })}

          <button
            type="button"
            disabled={!selected || busy}
            onClick={confirm}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-fv-orange py-3.5 text-sm font-bold uppercase tracking-wider text-white transition-all hover:bg-fv-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : "Continue"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            You can request to switch anytime from your profile.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
