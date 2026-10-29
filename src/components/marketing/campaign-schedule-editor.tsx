"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SELECT_CLASS } from "@/components/marketing/form-classes";
import { describeSchedule, type CampaignSchedule, type RepeatEvery } from "@/lib/campaign-schedule";
import { addDays, etDay, formatClock } from "@/lib/friday-schedule";
import { cn } from "@/lib/utils";

const pad = (n: number) => String(n).padStart(2, "0");
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMES = Array.from({ length: 48 }, (_, i) => ({ hour: Math.floor(i / 2), minute: (i % 2) * 30 }));

function TimeSelect({ id, hour, minute, onChange }: { id: string; hour: number; minute: number; onChange: (t: { hour: number; minute: number }) => void }) {
  const value = `${pad(hour)}:${pad(minute)}`;
  // A time that isn't on the half hour (set by the assistant) still has to show up in the list.
  const options = TIMES.some((t) => t.hour === hour && t.minute === minute) ? TIMES : [...TIMES, { hour, minute }].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  return (
    <select
      id={id}
      className={SELECT_CLASS}
      value={value}
      onChange={(e) => {
        const [h, m] = e.target.value.split(":").map(Number);
        onChange({ hour: h, minute: m });
      }}
    >
      {options.map((t) => (
        <option key={`${t.hour}:${t.minute}`} value={`${pad(t.hour)}:${pad(t.minute)}`}>
          {formatClock(t)} ET
        </option>
      ))}
    </select>
  );
}

const MODES = [
  { mode: "draft", label: "Not yet" },
  { mode: "once-now", label: "Right away" },
  { mode: "once", label: "Once, at a set time" },
  { mode: "repeat", label: "Repeat" },
] as const;

export function CampaignScheduleEditor({ schedule, onChange }: { schedule: CampaignSchedule; onChange: (s: CampaignSchedule) => void }) {
  const today = etDay(new Date());
  const tomorrow = addDays(today, 1);
  const activeMode = schedule.mode === "once" ? (schedule.now ? "once-now" : "once") : schedule.mode;

  function pick(mode: (typeof MODES)[number]["mode"]) {
    if (mode === "draft") onChange({ mode: "draft" });
    else if (mode === "once-now") onChange({ mode: "once", now: true });
    else if (mode === "once") onChange({ mode: "once", now: false, date: tomorrow, hour: 9, minute: 0 });
    else onChange({ mode: "repeat", every: "week", weekday: 5, dayOfMonth: 1, hour: 9, minute: 0, startDate: tomorrow, endDate: null, maxRuns: null });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.mode}
            type="button"
            onClick={() => pick(m.mode)}
            className={cn("rounded-md border px-3 py-1.5 text-sm", activeMode === m.mode ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {m.label}
          </button>
        ))}
      </div>

      {schedule.mode === "once" && !schedule.now && (
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sch-date">Date</Label>
            <Input id="sch-date" type="date" min={today} value={schedule.date} onChange={(e) => e.target.value && onChange({ ...schedule, date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sch-time">Time</Label>
            <TimeSelect id="sch-time" hour={schedule.hour} minute={schedule.minute} onChange={(t) => onChange({ ...schedule, ...t })} />
          </div>
        </div>
      )}

      {schedule.mode === "repeat" && (
        <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rep-every">How often</Label>
            <select id="rep-every" className={SELECT_CLASS} value={schedule.every} onChange={(e) => onChange({ ...schedule, every: e.target.value as RepeatEvery })}>
              <option value="week">Every week</option>
              <option value="two_weeks">Every two weeks</option>
              <option value="month">Every month</option>
            </select>
          </div>
          {schedule.every === "month" ? (
            <div className="space-y-1.5">
              <Label htmlFor="rep-dom">Day of the month</Label>
              <select id="rep-dom" className={SELECT_CLASS} value={schedule.dayOfMonth} onChange={(e) => onChange({ ...schedule, dayOfMonth: Number(e.target.value) })}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="rep-dow">On</Label>
              <select id="rep-dow" className={SELECT_CLASS} value={schedule.weekday} onChange={(e) => onChange({ ...schedule, weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="rep-time">At</Label>
            <TimeSelect id="rep-time" hour={schedule.hour} minute={schedule.minute} onChange={(t) => onChange({ ...schedule, ...t })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-start">Starting</Label>
            <Input id="rep-start" type="date" min={today} value={schedule.startDate} onChange={(e) => e.target.value && onChange({ ...schedule, startDate: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-end">Stop on (optional)</Label>
            <Input id="rep-end" type="date" min={schedule.startDate} value={schedule.endDate ?? ""} onChange={(e) => onChange({ ...schedule, endDate: e.target.value || null })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rep-max">Or after this many sends (optional)</Label>
            <Input
              id="rep-max"
              type="number"
              min={1}
              max={1000}
              value={schedule.maxRuns ?? ""}
              onChange={(e) => onChange({ ...schedule, maxRuns: e.target.value ? Math.max(1, Math.min(1000, Number(e.target.value))) : null })}
            />
          </div>
        </div>
      )}
      <p className="text-sm text-muted-foreground">{describeSchedule(schedule)}</p>
    </div>
  );
}
