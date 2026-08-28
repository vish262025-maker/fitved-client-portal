import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { SessionRow } from "@/lib/classCount";
import { classKey } from "@/lib/classCount";

const NAVY = "#1E3A5F";
const MUTED = "#8a8f9e";
const BORDER = "rgba(30,58,95,0.08)";
const GREEN = "#1b7a43";
const GOLD = "#b07d10";
const RED = "#d23b34";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Class activity for ONE service track.
 *
 * Driven by real session rows, so a day is green because classes were taught,
 * not because the dates imply it. Tapping a day lists that day's clients by
 * what actually happened to them — attended, absent, on pause, day off.
 */
export function ModeCalendar({
  sessions, nameOf, month, onMonthChange,
}: {
  sessions: SessionRow[];
  nameOf: (userId: string) => string;
  month: string;
  onMonthChange: (m: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const yy = Number(month.slice(0, 4));
  const mm = Number(month.slice(5, 7));
  const firstDow = new Date(yy, mm - 1, 1).getDay();
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const todayISO = new Date().toISOString().slice(0, 10);

  const byDate = useMemo(() => {
    const m = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      if (!s.session_date.startsWith(month)) continue;
      const list = m.get(s.session_date) ?? [];
      list.push(s);
      m.set(s.session_date, list);
    }
    return m;
  }, [sessions, month]);

  const shift = (delta: number) => {
    const d = new Date(yy, mm - 1 + delta, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSelected(null);
  };

  const cells: (string | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];

  const dayState = (rows: SessionRow[] | undefined, date: string) => {
    if (!rows?.length) return "none" as const;
    if (rows.some((r) => r.status === "completed")) return "taught" as const;
    if (rows.every((r) => r.status === "trainer_off")) return "off" as const;
    if (rows.every((r) => r.status === "paused")) return "paused" as const;
    if (rows.some((r) => r.status === "scheduled") && date >= todayISO) return "upcoming" as const;
    return "none" as const;
  };

  // Someone missed this class, even if it went ahead for everyone else.
  const missedCount = (rows: SessionRow[] | undefined) =>
    (rows ?? []).filter((r) => r.attended === false || r.status === "paused").length;

  /**
   * One row per client for the selected day.
   *
   * Consecutive plans can overlap by a day or two, which puts two session rows
   * on the same date for the same person — the header then counted them as two
   * clients and their name appeared twice in the list. They are one client
   * attending one class; prefer the row that carries a real outcome.
   */
  const rank = (r: SessionRow) =>
    r.status === "completed" ? 0 : r.attended === false ? 1
      : r.status === "paused" ? 2 : r.status === "trainer_off" ? 3 : 4;
  const selRaw = selected ? byDate.get(selected) : null;
  const sel = selRaw
    ? [...new Map([...selRaw].sort((a, b) => rank(a) - rank(b))
        .map((r) => [r.user_id ?? r.id, r])).values()]
    : null;
  const classesThatDay = selected && sel ? new Set(sel.map(classKey)).size : 0;

  const attended = (sel ?? []).filter((r) => r.status === "completed" && r.attended !== false);
  const absent = (sel ?? []).filter((r) => r.attended === false || r.status === "missed");
  const paused = (sel ?? []).filter((r) => r.status === "paused" && r.attended !== false);
  const off = (sel ?? []).filter((r) => r.status === "trainer_off");

  /**
   * Everyone the four groups above don't claim.
   *
   * The header counts every client on the day, but only listed the ones that
   * fell into a known bucket — so a class the trainer never marked showed as
   * "2 clients" above a list of one name. Deriving the last group by exclusion
   * means the names always add up to the count, whatever statuses exist later.
   */
  const grouped = new Set([...attended, ...absent, ...paused, ...off]);
  const unmarked = (sel ?? []).filter((r) => !grouped.has(r));
  const isPastDay = !!selected && selected < todayISO;

  return (
    <div className="rounded-2xl border p-3.5 sm:p-4" style={{ borderColor: BORDER, background: "#fff" }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="font-semibold" style={{ fontSize: 14, color: NAVY }}>Class activity</p>
        <div className="flex items-center gap-2">
          <button onClick={() => shift(-1)} aria-label="Previous month"
            className="grid h-7 w-7 place-items-center rounded-lg"
            style={{ background: "rgba(30,58,95,0.06)" }}>
            <ChevronLeft className="h-4 w-4" style={{ color: NAVY }} />
          </button>
          <span className="text-[13px] font-semibold" style={{ color: NAVY }}>
            {new Date(month + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => shift(1)} aria-label="Next month"
            className="grid h-7 w-7 place-items-center rounded-lg"
            style={{ background: "rgba(30,58,95,0.06)" }}>
            <ChevronRight className="h-4 w-4" style={{ color: NAVY }} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW.map((d, i) => (
          <span key={i} className="py-1 text-[10px] sm:text-[11px]" style={{ color: MUTED }}>{d}</span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={i} />;
          const rows = byDate.get(date);
          const st = dayState(rows, date);
          const isToday = date === todayISO;
          const missed = missedCount(rows);
          const bg = st === "taught" ? "rgba(27,122,67,0.12)"
            : st === "off" ? "rgba(210,59,52,0.10)"
            : st === "paused" ? "rgba(176,125,16,0.12)"
            : st === "upcoming" ? "rgba(30,58,95,0.05)" : "transparent";
          const fg = st === "taught" ? GREEN : st === "off" ? RED
            : st === "paused" ? GOLD : NAVY;
          return (
            <button key={date} type="button"
              onClick={() => setSelected(rows?.length ? date : null)}
              className="rounded-lg py-1.5 text-[12px] font-medium sm:rounded-xl sm:py-2 sm:text-[13px]"
              style={{
                background: bg, color: st === "none" ? MUTED : fg,
                border: isToday ? `1.5px solid ${NAVY}` : "1.5px solid transparent",
                cursor: rows?.length ? "pointer" : "default",
              }}>
              <span className="relative inline-block">
                {Number(date.slice(8, 10))}
                {missed > 0 && (
                  <span
                    className="absolute -right-2 -top-0.5 h-1.5 w-1.5 rounded-full"
                    style={{ background: GOLD }}
                    title={`${missed} client${missed === 1 ? "" : "s"} missed this class`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px] sm:text-[11px]" style={{ color: MUTED }}>
        <Legend color={GREEN} label="Completed" />
        <Legend color={NAVY} label="Upcoming" />
        <Legend color={GOLD} label="Client missed" />
        <Legend color={RED} label="Day off" />
      </div>

      {selected && sel && (
        <div className="mt-3 rounded-xl p-3.5 sm:p-4" style={{ background: "rgba(30,58,95,0.04)" }}>
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold" style={{ color: NAVY }}>
                {new Date(selected + "T12:00:00").toLocaleDateString("en-IN",
                  { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <p className="text-[12px]" style={{ color: MUTED }}>
                {classesThatDay} {classesThatDay === 1 ? "class" : "classes"} · {sel.length} client{sel.length === 1 ? "" : "s"}
              </p>
            </div>
            <button onClick={() => setSelected(null)} aria-label="Close"
              className="grid h-7 w-7 place-items-center rounded-full"
              style={{ background: "rgba(30,58,95,0.06)" }}>
              <X className="h-3.5 w-3.5" style={{ color: NAVY }} />
            </button>
          </div>

          <NameGroup title={`Attended (${attended.length})`} color={GREEN}
            bg="rgba(27,122,67,0.10)" rows={attended} nameOf={nameOf} />
          <NameGroup title={`Absent (${absent.length})`} color={RED}
            bg="rgba(210,59,52,0.10)" rows={absent} nameOf={nameOf} />
          <NameGroup title={`Absent — on pause (${paused.length})`} color={GOLD}
            bg="rgba(176,125,16,0.12)" rows={paused} nameOf={nameOf} />
          <NameGroup title={`Trainer day off (${off.length})`} color={RED}
            bg="rgba(210,59,52,0.10)" rows={off} nameOf={nameOf} />
          <NameGroup
            title={`${isPastDay ? "Not marked" : "Upcoming"} (${unmarked.length})`}
            color={NAVY} bg="rgba(30,58,95,0.07)" rows={unmarked} nameOf={nameOf} />
        </div>
      )}
    </div>
  );
}

function NameGroup({ title, color, bg, rows, nameOf }: {
  title: string; color: string; bg: string; rows: SessionRow[]; nameOf: (id: string) => string;
}) {
  if (!rows.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>{title}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {rows.map((r) => (
          <span key={r.id} className="rounded-full px-2.5 py-1 text-[12px]"
            style={{ background: bg, color }}>
            {nameOf(r.user_id ?? "")}
          </span>
        ))}
      </div>
    </div>
  );
}

const Legend = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}
  </span>
);
