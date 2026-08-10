import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, Check, Pause } from "lucide-react";
import { offTimeAffectsSlot } from "@/lib/sessionPlan";

// ── Brand tokens (match the dashboard) ───────────────────────────────────
const GOLD   = "#f0a720";
const GOLD_DEEP = "#b07d10";
const NAVY   = "#1E3A5F";
const MUTED  = "#8a8f9e";
const FAINT  = "#c2c5cc";
const BORDER = "rgba(30,58,95,0.08)";
const RED    = "#d23b34";

const WEEK_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface Range { from: string; to: string }
interface OffTime { from_date: string; to_date: string; time_slot: string | null; reason?: string | null }

interface Props {
  startDate: string;
  endDate: string;
  trainingDays: string[];
  pauses: Range[];
  offTimes: OffTime[];
  customerSlot: string | null;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  highlightDate?: string; // optional — rings a specific day (e.g. plan end date)
  planActive?: boolean; // when false, future training days won't show as "upcoming"
}

type DayState = "attended" | "upcoming" | "paused" | "off" | "rest" | "outside";

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function isoOf(dt: Date) { return iso(dt.getFullYear(), dt.getMonth(), dt.getDate()); }
function inRange(date: string, from: string, to: string) { return date >= from && date <= to; }
function nice(d: string) {
  const dt = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

export { offTimeAffectsSlot } from "@/lib/sessionPlan";

interface Cell { d: number; date: string; dow: number; state: DayState; isToday: boolean }

export function ClassCalendar({ startDate, endDate, trainingDays, pauses, offTimes, customerSlot, expanded, onExpandedChange, highlightDate, planActive }: Props) {
  const today = todayLocalISO();
  const [selected, setSelected] = useState<string | null>(null);

  const trainingIdx = useMemo(() => {
    const set = new Set<number>();
    for (const name of trainingDays) {
      const i = DAY_NAMES.indexOf(name);
      if (i >= 0) set.add(i);
    }
    return set;
  }, [trainingDays]);

  const classify = (date: string, dow: number): DayState => {
    if (date < startDate || date > endDate) return "outside";
    if (pauses.some((p) => inRange(date, p.from, p.to))) return trainingIdx.has(dow) ? "paused" : "outside";
    if (offTimes.some((o) => inRange(date, o.from_date, o.to_date) && offTimeAffectsSlot(o.time_slot, customerSlot)))
      return trainingIdx.has(dow) ? "off" : "outside";
    if (!trainingIdx.has(dow)) return "rest";
    if (date < today) return "attended";
    return planActive !== false ? "upcoming" : "rest";
  };

  const makeCell = (dt: Date): Cell => {
    const date = isoOf(dt);
    const dow = dt.getDay();
    return { d: dt.getDate(), date, dow, state: classify(date, dow), isToday: date === today };
  };

  // Upcoming training days cancelled by a trainer off-time (today → plan end,
  // scanned up to 60 days ahead) — surfaced as a notice above the calendar.
  const upcomingOffDates = useMemo(() => {
    if (!offTimes.length || trainingIdx.size === 0 || planActive === false) return [] as string[];
    const res: string[] = [];
    const cursor = new Date(
      Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10))
    );
    for (let i = 0; i < 60; i++) {
      const date = isoOf(cursor);
      if (date > endDate) break;
      if (
        date >= startDate &&
        trainingIdx.has(cursor.getDay()) &&
        !pauses.some((p) => inRange(date, p.from, p.to)) &&
        offTimes.some((o) => inRange(date, o.from_date, o.to_date) && offTimeAffectsSlot(o.time_slot, customerSlot))
      ) {
        res.push(date);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return res;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offTimes, pauses, trainingIdx, customerSlot, startDate, endDate, today, planActive]);

  // Anchor (today clamped to the plan window) drives both the default week and month.
  const anchor = today < startDate ? startDate : today > endDate ? endDate : today;
  const anchorY = Number(anchor.slice(0, 4)), anchorM = Number(anchor.slice(5, 7)) - 1;

  const minIdx = Number(startDate.slice(0, 4)) * 12 + (Number(startDate.slice(5, 7)) - 1);
  const maxIdx = Number(endDate.slice(0, 4)) * 12 + (Number(endDate.slice(5, 7)) - 1);
  const [monthIdx, setMonthIdx] = useState(anchorY * 12 + anchorM);
  const y = Math.floor(monthIdx / 12), m = monthIdx % 12;
  const monthLabel = new Date(y, m, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Current week (Mon-first) for the collapsed view.
  const weekCells = useMemo(() => {
    const a = new Date(anchorY, anchorM, Number(anchor.slice(8, 10)));
    const offset = (a.getDay() + 6) % 7;
    const mon = new Date(a); mon.setDate(a.getDate() - offset);
    return Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(mon); dt.setDate(mon.getDate() + i);
      return makeCell(dt);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  // Full month grid.
  const monthCells = useMemo(() => {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const lead = (new Date(y, m, 1).getDay() + 6) % 7;
    const arr: (Cell | null)[] = [];
    for (let i = 0; i < lead; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(makeCell(new Date(y, m, d)));
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthIdx]);

  const describe = (cell: Cell): { title: string; sub: string } | null => {
    switch (cell.state) {
      case "attended": return { title: "Class attended", sub: nice(cell.date) };
      case "upcoming": return { title: "Upcoming class", sub: nice(cell.date) };
      case "paused": {
        const p = pauses.find((p) => inRange(cell.date, p.from, p.to));
        return { title: "Paused", sub: p ? `${nice(p.from)} – ${nice(p.to)}` : nice(cell.date) };
      }
      case "off": {
        const o = offTimes.find((o) => inRange(cell.date, o.from_date, o.to_date));
        return {
          title: "Trainer's day off — no class",
          sub: o?.reason ? `${nice(cell.date)} · ${o.reason}` : nice(cell.date),
        };
      }
      default: return null;
    }
  };

  const renderCell = (cell: Cell | null, col: number, key: number) => {
    if (!cell) return <div key={key} />;
    const tappable = expanded && cell.state !== "outside" && cell.state !== "rest";
    const isSel = selected === cell.date && tappable;

    let content: React.ReactNode;
    const box: React.CSSProperties = {
      aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 12, fontSize: 13, position: "relative",
      background: "#fff", border: `1px solid ${BORDER}`,
    };
    if (cell.state === "attended") {
      box.background = NAVY; box.border = "none";
      content = <Check size={13} color="#fff" strokeWidth={3} />;
    } else if (cell.state === "paused") {
      content = <Pause size={13} color={GOLD_DEEP} fill={GOLD} strokeWidth={0} />;
    } else if (cell.state === "off") {
      // Trainer's day off — red day number with a red dot beneath it.
      box.background = "rgba(210,59,52,0.07)";
      box.border = "1px solid rgba(210,59,52,0.35)";
      content = (
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1 }}>
          <span style={{ color: RED, fontWeight: 600, fontSize: 12 }}>{cell.d}</span>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: RED, marginTop: 2 }} />
        </span>
      );
    } else if (cell.state === "upcoming") {
      content = <span style={{ color: NAVY, fontWeight: 500 }}>{cell.d}</span>;
    } else {
      // rest / outside — inactive
      box.background = "transparent"; box.border = "none";
      content = <span style={{ color: cell.state === "outside" ? "#d8dade" : FAINT }}>{cell.d}</span>;
    }
    const isEnd = !!highlightDate && cell.date === highlightDate;
    if (isEnd) {
      // Plan end date — ring it in red so it stands out.
      box.boxShadow = `0 0 0 2px ${RED}`;
    } else if (cell.isToday) {
      box.boxShadow = `0 0 0 2px ${GOLD}`;
    }

    const desc = isSel ? describe(cell) : null;
    const align = col <= 1 ? "left" : col >= 5 ? "right" : "center";

    return (
      <div
        key={key}
        style={box}
        onClick={tappable ? (e) => { e.stopPropagation(); setSelected(isSel ? null : cell.date); } : undefined}
        role={tappable ? "button" : undefined}
      >
        {content}
        {desc && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 6px)", zIndex: 30,
            ...(align === "center" ? { left: "50%", transform: "translateX(-50%)" } : align === "left" ? { left: 0 } : { right: 0 }),
            background: NAVY, color: "#fff", borderRadius: 10, padding: "6px 10px",
            whiteSpace: "nowrap", boxShadow: "0 4px 14px rgba(30,58,95,0.25)",
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{desc.title}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>{desc.sub}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="px-5 pt-5 pb-1"
      onClick={!expanded ? () => { onExpandedChange(true); setSelected(null); } : undefined}
      style={{ cursor: !expanded ? "pointer" : undefined }}
    >
      {/* Header — tap to expand/collapse */}
      <button
        onClick={(e) => { e.stopPropagation(); onExpandedChange(!expanded); setSelected(null); }}
        className="flex items-center justify-between w-full mb-3"
      >
        <span className="font-semibold uppercase" style={{ fontSize: 13, color: MUTED, letterSpacing: "0.08em" }}>
          My classes
        </span>
        <span className="flex items-center gap-1" style={{ fontSize: 12, color: MUTED }}>
          {expanded ? "This week" : "Full month"}
          <ChevronDown size={15} color={MUTED} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </span>
      </button>

      {/* Trainer off-day notice — shown ahead of time so no one turns up to a cancelled class */}
      {upcomingOffDates.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl mb-3"
          style={{ background: "rgba(210,59,52,0.08)", border: "1px solid rgba(210,59,52,0.3)", padding: "9px 12px" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: RED, marginTop: 4, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: "#8f231e", lineHeight: 1.45 }}>
            <span style={{ fontWeight: 700 }}>Trainer's day off — no class on {nice(upcomingOffDates[0])}</span>
            {upcomingOffDates.length > 1 && ` and ${upcomingOffDates.length - 1} more day${upcomingOffDates.length > 2 ? "s" : ""}`}
            . These days are marked with a red dot below.
          </p>
        </div>
      )}

      {/* Weekday labels */}
      <div className="grid mb-1.5" style={{ gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {WEEK_LABELS.map((w, i) => (
          <span key={i} style={{ textAlign: "center", fontSize: 11, color: MUTED }}>{w}</span>
        ))}
      </div>

      {!expanded ? (
        /* Collapsed — current week */
        <div className="grid" style={{ gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {weekCells.map((c, i) => renderCell(c, i, i))}
        </div>
      ) : (
        <>
          {/* Month nav */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <button
              onClick={() => { setMonthIdx((i) => Math.max(minIdx, i - 1)); setSelected(null); }}
              disabled={monthIdx <= minIdx} aria-label="Previous month"
              className="flex items-center justify-center rounded-[10px]"
              style={{ width: 28, height: 28, background: "#fff", border: `1px solid ${BORDER}`, opacity: monthIdx <= minIdx ? 0.4 : 1 }}
            ><ChevronLeft size={16} color={NAVY} /></button>
            <span className="font-semibold" style={{ fontSize: 13, color: NAVY, minWidth: 110, textAlign: "center" }}>{monthLabel}</span>
            <button
              onClick={() => { setMonthIdx((i) => Math.min(maxIdx, i + 1)); setSelected(null); }}
              disabled={monthIdx >= maxIdx} aria-label="Next month"
              className="flex items-center justify-center rounded-[10px]"
              style={{ width: 28, height: 28, background: "#fff", border: `1px solid ${BORDER}`, opacity: monthIdx >= maxIdx ? 0.4 : 1 }}
            ><ChevronRight size={16} color={NAVY} /></button>
          </div>

          {/* Month grid */}
          <div className="grid" style={{ gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {monthCells.map((c, i) => renderCell(c, i % 7, i))}
          </div>
        </>
      )}

      {/* Legend — what each mark means */}
      <div className="flex flex-wrap items-center mt-3 pb-2" style={{ gap: "6px 14px" }}>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: MUTED }}>
          <span className="flex items-center justify-center rounded-[5px]"
            style={{ width: 15, height: 15, background: NAVY }}>
            <Check size={9} color="#fff" strokeWidth={3.5} />
          </span>
          Attended
        </span>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: MUTED }}>
          <span className="flex items-center justify-center rounded-[5px]"
            style={{ width: 15, height: 15, background: "#fff", border: `1px solid ${BORDER}` }}>
            <span style={{ fontSize: 9, color: NAVY, fontWeight: 600 }}>7</span>
          </span>
          Upcoming
        </span>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: MUTED }}>
          <Pause size={11} color={GOLD_DEEP} fill={GOLD} strokeWidth={0} />
          Paused
        </span>
        <span className="flex items-center gap-1.5" style={{ fontSize: 11, color: MUTED }}>
          <span className="flex items-center justify-center rounded-[5px]"
            style={{ width: 15, height: 15, background: "rgba(210,59,52,0.07)", border: "1px solid rgba(210,59,52,0.35)" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: RED }} />
          </span>
          Trainer's day off
        </span>
      </div>
    </div>
  );
}
