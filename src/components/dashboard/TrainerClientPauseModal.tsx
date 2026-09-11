import { useState } from "react";
import { pauseDatesError } from "@/lib/pauseRules";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { recalculatePlanDates } from "@/stores/pauseStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { countTrainingDaysInRange } from "@/lib/sessionPlan";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
}

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function TrainerClientPauseModal({ open, onOpenChange, clientId, clientName }: Props) {
  const qc = useQueryClient();
  const [range, setRange] = useState<DateRange | undefined>();
  const [calOpen, setCalOpen] = useState(false);

  const { data: activePlan, isLoading } = useQuery({
    queryKey: ["trainer-client-active-plan", clientId],
    enabled: open && !!clientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("plans")
        .select("training_days, total_sessions")
        .eq("user_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const trainingDays = (activePlan?.training_days ?? []) as string[];
  const totalSessions = activePlan?.total_sessions ?? 0;
  const maxCarryForward = Math.floor(totalSessions / 3);

  const sessionCount = range?.from && range?.to
    ? countTrainingDaysInRange(range.from, range.to, trainingDays)
    : 0;

  const tooFewSessions = range?.from && range?.to && sessionCount < 2;
  const tooManySessions = range?.from && range?.to && sessionCount > maxCarryForward;

  const handleRangeSelect = (r: DateRange | undefined) => {
    setRange(r);
    if (r?.from && r?.to) setCalOpen(false);
  };

  const pauseMut = useMutation({
    mutationFn: async () => {
      if (!range?.from || !range?.to) throw new Error("Please select a date range");
      const problem = pauseDatesError(toLocalISODate(range.from), toLocalISODate(range.to), toLocalISODate(new Date()));
      if (problem) throw new Error(problem);
      if (tooFewSessions) throw new Error("Client must miss at least 2 sessions to pause.");
      if (tooManySessions) throw new Error(`Maximum allowed pause is ${maxCarryForward} sessions.`);

      const { error } = await (supabase.from("pauses") as any).insert({
        user_id: clientId,
        client_id: clientId,
        from_date: toLocalISODate(range.from),
        to_date: toLocalISODate(range.to),
        status: "active",
      });
      if (error) throw error;
      await recalculatePlanDates(clientId);
    },
    onSuccess: () => {
      toast.success(`Paused ${clientName}'s classes successfully`);
      qc.invalidateQueries({ queryKey: ["trainer-pauses"] });
      onOpenChange(false);
      setRange(undefined);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not pause"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Pause Classes for {clientName}</DialogTitle>
          <DialogDescription>
            Select the date range the client will be absent.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : !activePlan ? (
          <p className="text-sm text-destructive py-4">This client does not have an active plan.</p>
        ) : (
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !range && "text-muted-foreground")}
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
                    mode="range"
                    selected={range}
                    onSelect={handleRangeSelect}
                    numberOfMonths={1}
                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            {tooFewSessions && (
              <p className="text-sm text-destructive">
                Client must miss at least 2 scheduled sessions to qualify for a pause.
              </p>
            )}
            {tooManySessions && (
              <p className="text-sm text-destructive">
                Maximum carry forward allowed is {maxCarryForward} sessions (1/3 of plan).
              </p>
            )}
            {range?.from && range?.to && !tooFewSessions && !tooManySessions && sessionCount > 0 && (
              <p className="text-sm text-muted-foreground">
                Pausing <strong>{sessionCount} sessions</strong> based on their training days.
              </p>
            )}

            <Button
              className="w-full mt-2"
              disabled={!range?.from || !range?.to || tooFewSessions || tooManySessions || pauseMut.isPending}
              onClick={() => pauseMut.mutate()}
            >
              {pauseMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Pause
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
