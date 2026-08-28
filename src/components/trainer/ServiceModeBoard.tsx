import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, MapPin, Phone } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ModeCalendar } from "@/components/trainer/ModeCalendar";
import {
  SERVICE_MODES, SERVICE_MODE_LABEL, usesBatch, type ServiceMode,
} from "@/lib/serviceMode";
import { useTrainerModeData, type ModeCustomer, type ModeGroup } from "@/hooks/useTrainerModeData";
import {
  classesTaught, classesUpcoming, attendance, daysOff, activityMonths, monthLabel, type SessionRow,
} from "@/lib/classCount";

const NAVY = "#1E3A5F";
const MUTED = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";
const GREEN = "#1b7a43";
const GOLD = "#b07d10";

const MODE_CONTEXT: Record<ServiceMode, string> = {
  offline_group: "Group classes you run inside societies.",
  offline_personal: "One-to-one clients you train in person.",
  online_group: "Live online batches you run.",
  online_personal: "One-to-one clients you train online.",
};

import { sortDays } from "@/lib/daySets";

// Week order, not storage order.
const shortDays = (d: string[]) => sortDays(d).map((x) => x.slice(0, 3)).join(" · ");

interface Props {
  trainerId: string | undefined;
  mode: ServiceMode;
  onModeChange: (m: ServiceMode) => void;
  /**
   * When supplied, tapping a batch opens the full drill-down instead of
   * expanding inline. Mobile uses this so there is ONE society list rather
   * than this card plus a second one underneath it.
   */
  onOpenGroup?: (group: ModeGroup) => void;
}

export function ServiceModeBoard({ trainerId, mode, onModeChange, onOpenGroup }: Props) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const q = useTrainerModeData(trainerId, mode);

  const sessions: SessionRow[] = q.data?.sessions ?? [];
  const groups = q.data?.groups ?? [];
  const clients = q.data?.clients ?? [];
  const names = q.data?.names ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const isGroup = usesBatch(mode);

  const months = useMemo(() => activityMonths(sessions), [sessions]);
  // ONE SLOT = ONE CLASS, for every mode. Customers never multiply this.
  const taught = useMemo(() => classesTaught(sessions, month), [sessions, month]);
  // Scoped to the selected month so it agrees with the label above it.
  const upcoming = useMemo(() => classesUpcoming(sessions, today, month), [sessions, today, month]);
  const att = useMemo(() => attendance(sessions, month), [sessions, month]);
  const off = useMemo(() => daysOff(sessions, month), [sessions, month]);

  // Names for the calendar's day detail, from whichever roster this mode uses.
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    // Session-derived names first, so someone who has a class here can always
    // be named even if they are no longer on this track's roster; the roster
    // then refines anyone it does know about.
    for (const [uid, n] of Object.entries(names)) m.set(uid, n);
    for (const g of groups) for (const c of g.customers) if (c.name) m.set(c.user_id, c.name);
    for (const c of clients) if (c.name) m.set(c.user_id, c.name);
    return (uid: string) => m.get(uid) ?? "Client";
  }, [groups, clients, names]);

  const headCount = isGroup
    ? groups.reduce((n, g) => n + g.customers.length, 0)
    : clients.length;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        {SERVICE_MODES.map((m) => {
          const on = m === mode;
          return (
            <button key={m} type="button" onClick={() => onModeChange(m)}
              className="shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition sm:px-4 sm:py-2 sm:text-[13px]"
              style={{ borderColor: on ? NAVY : BORDER, background: on ? NAVY : "#fff",
                       color: on ? "#fff" : NAVY }}>
              {SERVICE_MODE_LABEL[m]}
            </button>
          );
        })}
      </div>

      <section className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: BORDER, background: "#fff" }}>
        <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: MUTED }}>
              {SERVICE_MODE_LABEL[mode]}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug" style={{ color: MUTED }}>{MODE_CONTEXT[mode]}</p>
          </div>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger
              className="mt-2 h-9 w-full rounded-lg bg-white text-[13px] font-medium sm:mt-0 sm:w-[168px]"
              style={{ borderColor: BORDER, color: NAVY }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {months.map((m) => (
                <SelectItem key={m} value={m} className="text-[13px]">{monthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:mt-5 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-5 lg:grid-cols-5">
          <Kpi label="Total classes taken" value={taught} hint={monthLabel(month)} />
          <Kpi label="Clients" value={headCount}
               hint={isGroup ? `in ${groups.length} ${groups.length === 1 ? "batch" : "batches"}` : undefined} />
          <Kpi label="Upcoming classes" value={upcoming} hint={`rest of ${monthLabel(month)}`} />
          <Kpi label="Client absences" value={att.absent}
               hint={`${att.attended} of ${att.total} check-ins`} />
          <Kpi label="Your days off" value={off.days}
               hint={off.classes ? `${off.classes} class${off.classes === 1 ? "" : "es"} missed` : "none this month"} />
        </div>
        {isGroup && (
          <p className="mt-3 text-[11px] leading-snug" style={{ color: MUTED }}>
            One slot counts as one class, however many clients are in the batch.
          </p>
        )}
      </section>

      <ModeCalendar sessions={sessions} nameOf={nameOf} month={month} onMonthChange={setMonth} />

      <section className="space-y-2.5 sm:space-y-3">
        <h2 className="font-display text-lg sm:text-xl" style={{ color: NAVY }}>
          {mode === "offline_group" ? "My societies"
            : mode === "online_group" ? "My batches" : "My clients"}
        </h2>

        {q.isLoading && <Empty text="Loading…" />}
        {!q.isLoading && isGroup && groups.length === 0 && (
          <Empty text={`No ${SERVICE_MODE_LABEL[mode].toLowerCase()} batches assigned to you.`} />
        )}
        {!q.isLoading && !isGroup && clients.length === 0 && (
          <Empty text={`No ${SERVICE_MODE_LABEL[mode].toLowerCase()} clients assigned to you.`} />
        )}

        {isGroup
          ? groups.map((g) => (
              <GroupCard key={g.key} group={g} sessions={sessions} month={month}
                onOpen={onOpenGroup ? () => onOpenGroup(g) : undefined} />
            ))
          : clients.map((c) => (
              <ClientCard key={c.user_id} client={c} sessions={sessions} month={month} today={today} />
            ))}
      </section>
    </div>
  );
}

function GroupCard({ group, sessions, month, onOpen }: {
  group: ModeGroup; sessions: SessionRow[]; month: string; onOpen?: () => void;
}) {
  const [open, setOpen] = useState(!onOpen);
  // Classes for THIS batch only: its own slot and society/batch, then
  // collapsed to one class per date.
  const mine = sessions.filter((s: any) =>
    (group.batch_id ? s.batch_id === group.batch_id : true) &&
    (group.society_id ? s.society_id === group.society_id : true) &&
    (group.slot ? (s.time_slot ?? null) === group.slot : true));
  const taught = classesTaught(mine, month);

  return (
    <div className="rounded-2xl border" style={{ borderColor: BORDER, background: "#fff" }}>
      <button type="button" onClick={() => (onOpen ? onOpen() : setOpen((v) => !v))}
        className="flex w-full items-center justify-between gap-3 p-3.5 text-left sm:p-4">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold" style={{ color: NAVY }}>{group.title}</p>
          {group.subtitle && <p className="text-[12px]" style={{ color: MUTED }}>{group.subtitle}</p>}
          <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
            {group.slot ?? "—"}{group.days.length ? ` · ${shortDays(group.days)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-right text-[12px]" style={{ color: MUTED }}>
            {group.customers.length} {group.customers.length === 1 ? "client" : "clients"}
            <br /><span style={{ color: NAVY }}>{taught} classes</span>
          </span>
          {onOpen || !open
            ? <ChevronRight className="h-4 w-4" style={{ color: MUTED }} />
            : <ChevronDown className="h-4 w-4" style={{ color: MUTED }} />}
        </div>
      </button>
      {open && !onOpen && (
        <ul className="divide-y border-t" style={{ borderColor: BORDER }}>
          {group.customers.map((c) => (
            <li key={c.user_id} className="flex flex-wrap items-center justify-between gap-1.5 px-3.5 py-2 sm:px-4 sm:py-2.5">
              <span className="text-[14px]" style={{ color: NAVY }}>
                {c.name ?? "Client"}
                {c.phone && <span className="ml-2 text-[12px]" style={{ color: MUTED }}>{c.phone}</span>}
              </span>
              <span className="flex items-center gap-3 text-[12px]" style={{ color: MUTED }}>
                {c.plan_name && <span>{c.plan_name}</span>}
                {c.end_date && <span>to {c.end_date}</span>}
                <PlanPill status={c.plan_status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientCard({ client, sessions, month, today }: {
  client: ModeCustomer; sessions: SessionRow[]; month: string; today: string;
}) {
  const mine = sessions.filter((s: any) => s.user_id === client.user_id);
  const taught = classesTaught(mine, month);
  const up = classesUpcoming(mine, today, month);
  const att = attendance(mine, month);

  return (
    <div className="rounded-2xl border p-3.5 sm:p-4" style={{ borderColor: BORDER, background: "#fff" }}>
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div>
          <p className="text-[15px] font-semibold" style={{ color: NAVY }}>{client.name ?? "Client"}</p>
          <p className="text-[12px]" style={{ color: MUTED }}>
            {[client.plan_name, client.slot, client.days.length ? shortDays(client.days) : null]
              .filter(Boolean).join(" · ") || "—"}
          </p>
          {client.start_date && client.end_date && (
            <p className="text-[12px]" style={{ color: MUTED }}>
              {client.start_date} → {client.end_date}
            </p>
          )}
        </div>
        <PlanPill status={client.plan_status} />
      </div>

      {/* One-to-one training happens at the client's own society, so the
          trainer needs to get there — and to reach them if plans change. */}
      {(client.society || client.address || client.phone) && (
        <div className="mt-2.5 flex flex-col gap-1 text-[12.5px]" style={{ color: MUTED }}>
          {(client.society || client.address) && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [client.society, client.address].filter(Boolean).join(", "),
              )}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-1.5"
              style={{ color: MUTED, textDecoration: "none" }}
            >
              <MapPin size={13} className="mt-[2px] shrink-0" />
              <span>
                {client.society && <span style={{ color: NAVY, fontWeight: 600 }}>{client.society}</span>}
                {client.society && client.address ? " · " : ""}
                {client.address}
              </span>
            </a>
          )}
          {client.phone && (
            <a href={`tel:${client.phone}`} className="flex items-center gap-1.5"
              style={{ color: MUTED, textDecoration: "none" }}>
              <Phone size={13} className="shrink-0" />
              <span>{client.phone}</span>
            </a>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px]" style={{ color: MUTED }}>
        <span><strong style={{ color: NAVY }}>{taught}</strong> classes taken</span>
        <span><strong style={{ color: NAVY }}>{up}</strong> upcoming</span>
        <span><strong style={{ color: NAVY }}>{att.attended}</strong> attended · {att.absent} absent</span>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div>
      <p className="font-display text-2xl leading-none tabular-nums sm:text-3xl" style={{ color: NAVY }}>{value}</p>
      <p className="mt-1 text-[11px] leading-tight sm:text-[12px]" style={{ color: MUTED }}>{label}</p>
      {hint && <p className="text-[10px] leading-tight sm:text-[11px]" style={{ color: MUTED }}>{hint}</p>}
    </div>
  );
}

function PlanPill({ status }: { status: ModeCustomer["plan_status"] }) {
  const map = {
    active: ["Active", GREEN, "rgba(27,122,67,0.10)"],
    expired: ["Plan ended", GOLD, "rgba(176,125,16,0.12)"],
    none: ["No plan", MUTED, "rgba(30,58,95,0.06)"],
  } as const;
  const [label, color, bg] = map[status];
  return (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, background: bg }}>{label}</span>
  );
}

const Empty = ({ text }: { text: string }) => (
  <div className="rounded-2xl border border-dashed p-6 text-center text-[13px]"
    style={{ borderColor: BORDER, color: MUTED }}>{text}</div>
);
