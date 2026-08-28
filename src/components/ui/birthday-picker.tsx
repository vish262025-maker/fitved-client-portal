import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const FROM_YEAR = 1925;

/**
 * Birthday field.
 *
 * react-day-picker's `captionLayout="dropdown"` renders native <select>s. On a
 * phone the OS takes those over: a full-screen list of a hundred years in the
 * system's own tiny type, which we cannot style and which covers the form it
 * belongs to. So the month and year are chosen with the app's own Select —
 * same styling as every other control, readable, and scoped to the popover —
 * and the calendar below simply follows them.
 */
export function BirthdayPicker({
  value, onChange, placeholder = "Pick your birthday", id,
}: {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const thisYear = new Date().getFullYear();
  // What the grid is showing. Starts on the chosen date, or a sensible
  // birthday-ish default rather than today.
  const [month, setMonth] = useState<Date>(value ?? new Date(1990, 0, 1));

  const years: number[] = [];
  for (let y = thisYear; y >= FROM_YEAR; y--) years.push(y);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className={cn("w-full justify-start text-left font-normal", !value && "text-muted-foreground")}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {value ? format(value, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        // Never wider than the phone it opens on.
        className="w-[min(20rem,calc(100vw-2rem))] p-3"
      >
        <div className="flex gap-2">
          <Select
            value={String(month.getMonth())}
            onValueChange={(v) => setMonth(new Date(month.getFullYear(), Number(v), 1))}
          >
            <SelectTrigger className="h-10 flex-1 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-64">
              {MONTHS.map((m, i) => (
                <SelectItem key={m} value={String(i)} className="text-sm">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={String(month.getFullYear())}
            onValueChange={(v) => setMonth(new Date(Number(v), month.getMonth(), 1))}
          >
            <SelectTrigger className="h-10 w-[7rem] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-64">
              {years.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-sm">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => { onChange(d); if (d) setOpen(false); }}
          month={month}
          onMonthChange={setMonth}
          fromYear={FROM_YEAR}
          toYear={thisYear}
          disabled={(d) => d > new Date() || d < new Date(`${FROM_YEAR}-01-01`)}
          initialFocus
          className="p-0 pt-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
