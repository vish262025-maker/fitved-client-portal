import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Video, Lock, Clock, UserRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { OPEN_STATUSES, type BookingRequest } from "@/lib/bookingRequests";

const NAVY = "#1E3A5F";
const MUTED = "#8a8f9e";

type State = {
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  server_now: string;
};

const timeLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "";

/**
 * Today's live online session.
 *
 * Deliberately platform-agnostic: this component never queries or renders the
 * meeting platform or URL. It asks the database for a *state* only, and the
 * destination is resolved server-side at the moment the customer clicks Join.
 */
export function OnlineSessionCard() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  // The customer's current online booking (no meeting fields selected).
  const bookingQ = useQuery({
    queryKey: ["my-online-booking", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("booking_requests")
        .select("id, training_type, trainer_id, status, training_mode")
        .eq("user_id", user!.id)
        .eq("training_mode", "online")
        .in("status", OPEN_STATUSES)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return (data ?? null) as Pick<BookingRequest, "id" | "training_type" | "trainer_id" | "status"> | null;
    },
  });
  const booking = bookingQ.data;

  const trainerQ = useQuery({
    queryKey: ["session-trainer", booking?.trainer_id],
    enabled: !!booking?.trainer_id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("trainers").select("name").eq("id", booking!.trainer_id).maybeSingle();
      return data?.name as string | undefined;
    },
  });

  // Session state comes from the DB (its clock, its rules) — never computed here.
  const stateQ = useQuery({
    queryKey: ["online-session-state", user?.id, booking?.id, tick],
    enabled: !!user && !!booking,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc("online_session_state", { _user_id: user!.id, _booking_id: booking!.id });
      if (error) return { __notReady: true } as const;
      const row = Array.isArray(data) ? data[0] : data;
      return (row ?? null) as State | null;
    },
    refetchInterval: 60_000,   // re-check so the window opens on its own
  });

  // Local ticker only advances the countdown text between refetches; the
  // authoritative state always comes from the server.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const notReady = (stateQ.data as any)?.__notReady === true;
  const state = (!notReady ? (stateQ.data as State | null) : null);

  if (!booking || notReady || !state) return null;
  // Nothing to show on a non-training day or once the plan is over.
  if (["not_scheduled_today", "no_plan", "plan_expired", "not_found", "not_online"].includes(state.status)) return null;

  const canJoin = state.status === "ok";
  const ended = state.status === "ended";
  const tooEarly = state.status === "too_early";
  const unconfigured = state.status === "not_configured";

  const join = async () => {
    if (!user || !booking) return;
    setBusy(true);
    try {
      // The URL is fetched at click time and used immediately — it is never
      // stored in component state or rendered anywhere.
      const { data, error } = await (supabase as any)
        .rpc("resolve_session_join", { _user_id: user.id, _booking_id: booking.id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;

      if (row?.status === "ok" && row.join_url) {
        window.open(row.join_url, "_blank", "noopener,noreferrer");
        return;
      }
      const messages: Record<string, string> = {
        too_early: "Your session isn't open yet — you can join 5 minutes before it starts.",
        ended: "This session has ended.",
        not_configured: "Your session link isn't ready yet. Please contact your admin.",
        plan_expired: "Your plan has ended.",
        no_plan: "You don't have an active plan.",
        not_scheduled_today: "You don't have a session today.",
      };
      toast.error(messages[row?.status] ?? "Couldn't open your session.");
      stateQ.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open your session");
    } finally {
      setBusy(false);
    }
  };

  const minsToOpen = (() => {
    if (!state.starts_at || !state.server_now) return null;
    const opensAt = new Date(state.starts_at).getTime() - 5 * 60_000;
    return Math.max(0, Math.ceil((opensAt - new Date(state.server_now).getTime()) / 60_000));
  })();

  return (
    <Card className="rounded-2xl p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>
            {ended ? "Today's session" : "Your live session"}
          </p>
          <p className="mt-1 flex items-center gap-2 font-semibold" style={{ color: NAVY }}>
            <Clock className="h-4 w-4" style={{ color: MUTED }} />
            {timeLabel(state.starts_at)} – {timeLabel(state.ends_at)}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-[13px]" style={{ color: MUTED }}>
            <Video className="h-3.5 w-3.5" />
            Online {booking.training_type === "personal" ? "Personal" : "Group"} Training
          </p>
          {trainerQ.data && (
            <p className="mt-0.5 flex items-center gap-2 text-[13px]" style={{ color: MUTED }}>
              <UserRound className="h-3.5 w-3.5" /> Trainer: {trainerQ.data}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          {ended ? (
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ background: "#e6f7ed", color: "#1b7a43" }}>
              Completed
            </span>
          ) : unconfigured ? (
            <span className="text-xs" style={{ color: MUTED }}>Session link not available yet</span>
          ) : (
            <>
              <Button onClick={join} disabled={!canJoin || busy} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" />
                  : !canJoin ? <Lock className="h-4 w-4" /> : null}
                Join Session {canJoin && !busy ? "→" : ""}
              </Button>
              {tooEarly && (
                <p className="mt-1.5 text-[11px]" style={{ color: MUTED }}>
                  {minsToOpen && minsToOpen > 0 ? `Available in ${minsToOpen} min` : "Available 5 min before"}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
