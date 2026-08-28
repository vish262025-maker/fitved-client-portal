import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, CheckCircle2, PauseCircle, Trash2 } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePauseStore } from "@/stores/pauseStore";
import { formatDate, daysBetween } from "@/lib/dates";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCanPauseClasses } from "@/hooks/useCanPauseClasses";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { deriveSubscriptionStatus, isPaid } from "@/lib/subscription";
import { useCurrentPlan } from "@/hooks/useCurrentPlan";

// Count how many of the client's training days fall within [from, to] inclusive
function countSessionsInRange(from: Date, to: Date, trainingDays: string[]): number {
  const DAY_MAP: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const trainingNums = trainingDays
    .map((d) => DAY_MAP[d.slice(0, 3)])
    .filter((n) => n !== undefined);

  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  while (cur <= end) {
    if (trainingNums.includes(cur.getDay())) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

const NAVY   = "#1E3A5F";
const MUTED  = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";
const GREEN  = "#2e9e5b";
const GREEN_LIGHT = "#e6f7ed";
const RED    = "#ef4444";
const RED_LIGHT  = "#fee2e2";

// Format a Date as a local YYYY-MM-DD string (avoids UTC shift from toISOString)
function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Pause() {
  const { user } = useAuth();
  // Pause is a group-training benefit. Anyone it doesn't apply to — online
  // customers, and one-to-one clients whose reserved slot cannot be paused —
  // is sent home rather than shown a section they cannot use. Hiding the nav
  // link is not enough on its own: this URL is still typeable.
  const { blocked, loading: modeLoading } = useCanPauseClasses();
  const { activePause, history, pause, resume } = usePauseStore();
  const [range, setRange] = useState<DateRange | undefined>();
  const [calOpen, setCalOpen] = useState(false);
  const [calOpenDesktop, setCalOpenDesktop] = useState(false);

  // Update the range and auto-close the picker once a full range is chosen
  const handleRangeSelect = (r: DateRange | undefined) => {
    setRange(r);
    if (r?.from && r?.to) {
      setCalOpen(false);
      setCalOpenDesktop(false);
    }
  };

  const days = range?.from && range?.to
    ? daysBetween(range.from.toISOString(), range.to.toISOString()) : 0;

  // Fetch user's active plan info
  const { data: activePlan } = useCurrentPlan(user?.id);

  const trainingDays = (activePlan?.training_days ?? []) as string[];
  const totalSessions = activePlan?.total_sessions ?? 0;
  const maxCarryForward = Math.floor(totalSessions / 3);

  // Sessions that actually fall in the selected range
  const sessionCount = range?.from && range?.to
    ? countSessionsInRange(range.from, range.to, trainingDays)
    : 0;

  const tooFewSessions = range?.from && range?.to && sessionCount < 2;
  const tooManySessions = range?.from && range?.to && sessionCount > maxCarryForward;

  const handlePause = async () => {
    if (!range?.from || !range?.to) return;
    try {
      await pause(toLocalISODate(range.from), toLocalISODate(range.to));
      toast.success("Pause scheduled successfully");
      setRange(undefined);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply pause");
    }
  };

  const handleResume = async () => {
    try {
      await resume();
      toast.success("Pause cancelled successfully");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel pause");
    }
  };

  // Lock pause deletion if it has already started (i.e. start date <= today)
  const todayStr = toLocalISODate(new Date());
  const isLocked = activePause && activePause.from <= todayStr;

  const hasActivePlan = deriveSubscriptionStatus(activePlan) === "active";

  // Online customers don't get pause classes — send them home rather than
  // render a section that doesn't apply to their plan. Checked before every
  // other early return so a direct URL can't slip past it.
  if (!modeLoading && blocked) return <Navigate to="/dashboard" replace />;

  if (!hasActivePlan) {
    return (
      <>
        {/* Mobile empty state */}
        <div className="md:hidden" style={{ background: "#f4f2ee", minHeight: "100%" }}>
          <div style={{ padding: "8px 20px 16px" }}>
            <p style={{ color: MUTED, fontSize: 13 }}>Pause subscription</p>
            <h2 className="font-display" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: NAVY }}>Pause classes</h2>
          </div>
          <div className="mx-4 rounded-[20px] p-8 text-center"
            style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
            <p style={{ color: MUTED, fontSize: 14 }}>
              You do not have an active plan. Pausing classes is only available when you have an active subscription.
            </p>
          </div>
        </div>

        {/* Desktop empty state */}
        <div className="hidden md:block space-y-6">
          <header>
            <h1 className="font-display text-3xl text-foreground">Pause classes</h1>
            <p className="mt-1 text-muted-foreground">Manage pauses and extensions for your training sessions.</p>
          </header>
          <Card className="p-8 rounded-2xl shadow-card text-center">
            <p className="text-muted-foreground">
              You do not have an active plan. Pausing classes is only available when you have an active subscription.
            </p>
          </Card>
        </div>
      </>
    );
  }

  const isPaused = !!activePause;

  return (
    <>
      {/* ── Mobile Layout ──────────────────────────────────────────── */}
      <div className="md:hidden" style={{ background: "#f4f2ee", minHeight: "100%" }}>

        {/* Page header */}
        <div style={{ padding: "8px 20px 20px" }}>
          <p style={{ color: MUTED, fontSize: 13 }}>Take a break</p>
          <h2 className="font-display" style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em", color: NAVY }}>
            Pause classes
          </h2>
        </div>

        {/* Policy banner */}
        <div className="mx-4 mb-4 rounded-[20px] p-4" style={{ background: "rgba(30,58,95,0.03)", border: `1px solid ${BORDER}` }}>
          <p className="font-semibold mb-2 flex items-center gap-1.5" style={{ fontSize: 13, color: NAVY }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#f0a720" }} />
            Class Pause Policy
          </p>
          <ul className="space-y-1.5 text-[11px] text-muted-foreground list-disc list-inside">
            <li>Applicable only when you'll miss 2 or more consecutive sessions (Single missed sessions is not eligible).</li>
            <li>You need to apply pause in advance; backdated pauses are not allowed.</li>
            <li>You can pause for as long as you want, but a maximum of {maxCarryForward} sessions (1/3 of your plan) will be carried forward.</li>
          </ul>
        </div>

        {/* Schedule a pause — shown first when not paused */}
        {!isPaused && (
          <div className="mx-4 mb-4 rounded-[20px] p-4"
            style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
            <p className="font-bold mb-1" style={{ fontSize: 14, color: NAVY }}>Schedule a pause</p>
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 14 }}>Pick the start and end date for your break.</p>

            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left font-normal h-11")}
                  style={{
                    border: `2px solid ${range?.from ? NAVY : "#c8d4e3"}`,
                    color: range?.from ? NAVY : MUTED,
                    background: "#f8fafd",
                    fontWeight: range?.from ? 600 : 400,
                  }}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" style={{ color: NAVY, opacity: 0.7 }} />
                  {range?.from ? (
                    range.to ? <>{format(range.from, "PP")} — {format(range.to, "PP")}</> : format(range.from, "PP")
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range" selected={range} onSelect={handleRangeSelect} numberOfMonths={1}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            {tooFewSessions && (
              <p className="text-sm mt-2" style={{ color: RED }}>
                Class pauses apply only when you'll miss 2 or more sessions.
              </p>
            )}
            {tooManySessions && (
              <p className="text-sm mt-2 text-warning-foreground font-medium">
                Note: You are pausing {sessionCount} sessions, but only {maxCarryForward} sessions will be carried forward (1/3 of plan limit).
              </p>
            )}
            {range?.from && range?.to && !tooFewSessions && sessionCount > 0 && !tooManySessions && (
              <p className="text-sm text-muted-foreground mt-2">
                Pausing <span className="font-medium text-foreground">{sessionCount} sessions</span> ({days} days).
              </p>
            )}

            <button
              onClick={handlePause}
              disabled={!range?.from || !range?.to || !!tooFewSessions}
              className="mt-3 w-full rounded-2xl border-none cursor-pointer disabled:opacity-50"
              style={{ background: RED, padding: "13px", fontSize: 14, fontWeight: 700, color: "#fff" }}
            >
              Pause My Classes
            </button>
          </div>
        )}

        {/* Status card — below schedule section */}
        <div className="mx-4 mb-4 rounded-3xl text-center"
          style={{
            background: "#fff", padding: "30px 24px",
            border: `1px solid ${BORDER}`, boxShadow: "0 4px 16px rgba(30,58,95,0.07)",
          }}>
          <div className="flex items-center justify-center rounded-full mx-auto mb-4"
            style={{ width: 80, height: 80, background: isPaused ? RED_LIGHT : GREEN_LIGHT }}>
            {isPaused
              ? <PauseCircle size={34} color={RED} />
              : <CheckCircle2 size={34} color={GREEN} />}
          </div>
          <p className="font-display" style={{ fontSize: 24, fontWeight: 600, color: NAVY }}>
            {isPaused ? "Classes Paused" : "Classes Running"}
          </p>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 8, lineHeight: 1.6 }}>
            {isPaused
              ? `Paused from ${formatDate(activePause!.from)} to ${formatDate(activePause!.to)}.`
              : "All sessions are scheduled as planned."}
          </p>
          {isPaused && !isLocked ? (
            <button
              onClick={handleResume}
              className="mt-5 w-full rounded-2xl border-none cursor-pointer"
              style={{ background: RED, padding: "14px", fontSize: 15, fontWeight: 700, color: "#fff" }}
            >
              Delete Pause
            </button>
          ) : isPaused && isLocked ? (
            <p className="mt-5 text-sm" style={{ color: MUTED }}>
              Pause has already started. Please contact support to resume early.
            </p>
          ) : null}
        </div>

        {/* Past pauses */}
        {history.length > 0 && (
          <div className="mx-4 mb-4 rounded-[20px] p-4"
            style={{ background: "#fff", border: `1px solid ${BORDER}` }}>
            <p className="font-semibold uppercase mb-3" style={{ fontSize: 12, color: MUTED, letterSpacing: "0.08em" }}>
              Past pauses
            </p>
            <ul>
              {history.map((p) => {
                const isCancelled = p.to < p.from;
                return (
                  <li key={p.id} className="flex items-center justify-between py-2.5"
                    style={{ borderTop: `1px solid ${BORDER}` }}>
                    <div>
                      {isCancelled ? (
                        <>
                          <p className="font-medium" style={{ fontSize: 13, color: NAVY }}>
                            {formatDate(p.from)}
                          </p>
                          <p style={{ fontSize: 11, color: MUTED }}>Cancelled on day 1</p>
                        </>
                      ) : (
                        <>
                          <p className="font-medium" style={{ fontSize: 13, color: NAVY }}>
                            {formatDate(p.from)} — {formatDate(p.to)}
                          </p>
                          <p style={{ fontSize: 11, color: MUTED }}>{daysBetween(p.from, p.to)} days</p>
                        </>
                      )}
                    </div>
                    <span className="rounded-full font-semibold" style={{ fontSize: 11, color: isCancelled ? MUTED : GREEN, background: isCancelled ? "rgba(30,58,95,0.07)" : GREEN_LIGHT, padding: "3px 10px" }}>
                      {isCancelled ? "Cancelled" : "Done"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {/* ── Desktop Layout (original) ──────────────────────────────── */}
      <div className="hidden md:block space-y-6">
        <header>
          <h1 className="font-display text-3xl text-foreground">Pause classes</h1>
          <p className="mt-1 text-muted-foreground">Need a break? Pause your sessions for any date range.</p>
        </header>

        {/* Policy banner */}
        <Card className="p-5 rounded-2xl flex gap-4 items-start" style={{ background: "rgba(30,58,95,0.02)", border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: "rgba(240,167,32,0.12)" }}>
            <span className="font-bold text-fv-orange" style={{ color: "#f0a720", fontSize: 16 }}>!</span>
          </div>
          <div>
            <h3 className="font-display font-semibold text-base mb-1" style={{ color: NAVY }}>Class Pause Policy</h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Applicable only when you'll miss 2 or more consecutive sessions (Single missed sessions is not eligible).</li>
              <li>You need to apply pause in advance; backdated pauses are not allowed.</li>
              <li>You can pause for as long as you want, but a maximum of {maxCarryForward} sessions (1/3 of your plan) will be carried forward.</li>
            </ul>
          </div>
        </Card>

        <Card className={cn(
          "p-6 rounded-2xl shadow-card border-l-4",
          activePause ? "border-l-warning bg-warning/5" : "border-l-success bg-success/5"
        )}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={cn(
                "grid h-11 w-11 place-items-center rounded-full",
                activePause ? "bg-warning/15 text-warning-foreground" : "bg-success/15 text-success"
              )}>
                {activePause ? <PauseCircle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
              </span>
              <div>
                <p className="font-display text-lg">{activePause ? "Currently paused" : "All classes active"}</p>
                <p className="text-sm text-muted-foreground">
                  {activePause
                    ? `From ${formatDate(activePause.from)} to ${formatDate(activePause.to)}`
                    : "You have no active pause."}
                </p>
              </div>
            </div>
            {activePause && !isLocked && (
              <Button onClick={handleResume} variant="destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete pause
              </Button>
            )}
            {activePause && isLocked && (
              <p className="text-sm text-muted-foreground mt-2 md:mt-0">
                Contact support to resume early
              </p>
            )}
          </div>
        </Card>

        <Card className="p-6 rounded-2xl shadow-card">
          <h2 className="font-display text-xl">Schedule a pause</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick the start and end date for your break.</p>
          <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <p className="text-sm font-medium">Date range</p>
              <Popover open={calOpenDesktop} onOpenChange={setCalOpenDesktop}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full sm:w-[320px] justify-start text-left font-normal h-11", !range?.from && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {range?.from ? (
                      range.to ? <>{format(range.from, "PP")} — {format(range.to, "PP")}</> : format(range.from, "PP")
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range" selected={range} onSelect={handleRangeSelect} numberOfMonths={2}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex-1">
              {tooFewSessions && (
                <p className="text-sm mt-3" style={{ color: RED }}>
                  Class pauses apply only when you'll miss 2 or more sessions.
                </p>
              )}
              {tooManySessions && (
                <p className="text-sm mt-3 text-warning-foreground font-medium">
                  Note: You are pausing {sessionCount} sessions, but only {maxCarryForward} sessions will be carried forward (1/3 of plan limit).
                </p>
              )}
              {range?.from && range?.to && !tooFewSessions && sessionCount > 0 && !tooManySessions && (
                <p className="text-sm text-muted-foreground mt-3">
                  Pausing <span className="font-medium text-foreground">{sessionCount} sessions</span> ({days} days).
                </p>
              )}

              <Button
                onClick={handlePause}
                disabled={!range?.from || !range?.to || !!tooFewSessions}
                className="mt-5 w-full sm:w-auto px-8"
              >
                Pause my classes
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6 rounded-2xl shadow-card">
          <h2 className="font-display text-xl">Past pauses</h2>
          <ul className="mt-4 divide-y divide-border">
            {history.length === 0 ? (
              <li className="py-4 text-sm text-muted-foreground">No past pauses yet.</li>
            ) : (
              history.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{formatDate(p.from)} — {formatDate(p.to)}</p>
                    <p className="text-xs text-muted-foreground">{daysBetween(p.from, p.to)} days</p>
                  </div>
                  <Badge variant="secondary">Completed</Badge>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </>
  );
}
