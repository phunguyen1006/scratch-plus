import { addDays, dailyTotals, parseJournalDate, periodBounds, streaks, type JournalEntry, type Period } from "./journal.ts";

export interface ChartPoint {
  key: string;
  label: string;
  words: number;
  entries: number;
  dailyWords?: number;
  dreamWords?: number;
  dailyEntries?: number;
  dreamEntries?: number;
}

export interface DailySourceTotal {
  count: number;
  words: number;
  dailyCount: number;
  dreamCount: number;
  dailyWords: number;
  dreamWords: number;
}

export function dailySourceTotals(entries: JournalEntry[]): Map<string, DailySourceTotal> {
  const totals = new Map<string, DailySourceTotal>();
  for (const entry of entries) {
    const current = totals.get(entry.date) || {
      count: 0,
      words: 0,
      dailyCount: 0,
      dreamCount: 0,
      dailyWords: 0,
      dreamWords: 0,
    };
    const isDream = entry.kind === "dream";
    totals.set(entry.date, {
      count: current.count + 1,
      words: current.words + entry.words,
      dailyCount: current.dailyCount + (isDream ? 0 : 1),
      dreamCount: current.dreamCount + (isDream ? 1 : 0),
      dailyWords: current.dailyWords + (isDream ? 0 : entry.words),
      dreamWords: current.dreamWords + (isDream ? entry.words : 0),
    });
  }
  return totals;
}

export function calendarDaysBetween(from: string, to: string): number {
  const a = parseJournalDate(from);
  const b = parseJournalDate(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

export function insightSummary(entries: JournalEntry[], today: string) {
  const past = entries.filter(entry => entry.date <= today);
  const totals = dailyTotals(past);
  const dates = [...totals.keys()].sort();
  const active = dates.filter(date => (totals.get(date)?.words || 0) > 0);
  const weekdays = Array<number>(7).fill(0);
  for (const date of active) weekdays[(parseJournalDate(date)!.getDay() + 6) % 7]++;
  const maxWeekday = Math.max(...weekdays);
  const totalWords = past.reduce((sum, entry) => sum + entry.words, 0);
  const bestDay = [...totals].filter(([, value]) => value.words > 0).sort((a, b) => b[1].words - a[1].words || b[0].localeCompare(a[0]))[0] || null;
  const longestEntry = [...past].filter(entry => entry.words > 0).sort((a, b) => b.words - a.words || b.date.localeCompare(a.date))[0] || null;
  return {
    totalWords,
    entries: past.length,
    activeDays: active.length,
    activeDaysLastYear: active.filter(date => date >= addDays(today, -364)).length,
    average: past.length ? Math.round(totalWords / past.length) : 0,
    first: dates[0] || null,
    last: dates[dates.length - 1] || null,
    daysSinceLast: dates.length ? calendarDaysBetween(dates[dates.length - 1], today) : null,
    weekdays,
    mostActiveDays: maxWeekday ? weekdays.flatMap((value, index) => value === maxWeekday ? [index] : []) : [],
    bestDay: bestDay ? { date: bestDay[0], words: bestDay[1].words } : null,
    longestEntry,
    streak: streaks(past, today),
  };
}

export function trendPoints(entries: JournalEntry[], period: Period, today: string): ChartPoint[] {
  const totals = dailySourceTotals(entries.filter(entry => entry.date <= today));
  const [start, end] = periodBounds(period, today);
  const points: ChartPoint[] = [];
  if (period === "all") {
    const years = [...new Set([...totals.keys()].map(date => date.slice(0, 4)))].sort();
    if (!years.length) return [];
    for (let year = Number(years[0]); year <= Number(today.slice(0, 4)); year++) {
      const prefix = String(year);
      const matching = [...totals].filter(([date]) => date.startsWith(`${prefix}-`));
      points.push({
        key: prefix,
        label: prefix,
        words: matching.reduce((n, [, value]) => n + value.words, 0),
        entries: matching.reduce((n, [, value]) => n + value.count, 0),
        dailyWords: matching.reduce((n, [, value]) => n + value.dailyWords, 0),
        dreamWords: matching.reduce((n, [, value]) => n + value.dreamWords, 0),
        dailyEntries: matching.reduce((n, [, value]) => n + value.dailyCount, 0),
        dreamEntries: matching.reduce((n, [, value]) => n + value.dreamCount, 0),
      });
    }
  } else if (period === "year") {
    for (let index = 0; index < 12; index++) {
      const prefix = `${today.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`;
      const matching = [...totals].filter(([date]) => date.startsWith(`${prefix}-`));
      points.push({
        key: prefix,
        label: new Date(Number(today.slice(0, 4)), index, 1).toLocaleDateString(undefined, { month: "short" }),
        words: matching.reduce((n, [, value]) => n + value.words, 0),
        entries: matching.reduce((n, [, value]) => n + value.count, 0),
        dailyWords: matching.reduce((n, [, value]) => n + value.dailyWords, 0),
        dreamWords: matching.reduce((n, [, value]) => n + value.dreamWords, 0),
        dailyEntries: matching.reduce((n, [, value]) => n + value.dailyCount, 0),
        dreamEntries: matching.reduce((n, [, value]) => n + value.dreamCount, 0),
      });
    }
  } else {
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const value = totals.get(date);
      points.push({
        key: date,
        label: period === "week" ? parseJournalDate(date)!.toLocaleDateString(undefined, { weekday: "short" }) : String(Number(date.slice(8))),
        words: value?.words || 0,
        entries: value?.count || 0,
        dailyWords: value?.dailyWords || 0,
        dreamWords: value?.dreamWords || 0,
        dailyEntries: value?.dailyCount || 0,
        dreamEntries: value?.dreamCount || 0,
      });
    }
  }
  return points;
}

export function weekdayPoints(entries: JournalEntry[], period: Period, today: string): ChartPoint[] {
  const [start, end] = periodBounds(period, today);
  const points: ChartPoint[] = Array.from({ length: 7 }, (_, index) => ({ key: String(index), label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index], words: 0, entries: 0 }));
  for (const entry of entries) {
    if (entry.date < start || entry.date > end || entry.date > today) continue;
    const day = parseJournalDate(entry.date);
    if (!day) continue;
    const point = points[(day.getDay() + 6) % 7];
    point.words += entry.words;
    point.entries++;
  }
  return points;
}

/** Sunday/Monday layout is calculated with local dates, not elapsed milliseconds. */
export function activityGrid(today: string): { date: string; inRange: boolean }[] {
  const first = addDays(today, -364);
  const weekday = (parseJournalDate(first)!.getDay() + 6) % 7;
  const start = addDays(first, -weekday);
  const endWeekday = (parseJournalDate(today)!.getDay() + 6) % 7;
  const end = addDays(today, 6 - endWeekday);
  const cells: { date: string; inRange: boolean }[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) cells.push({ date, inRange: date >= first && date <= today });
  return cells;
}

export function monthLabel(date: string): string {
  return parseJournalDate(date)?.toLocaleDateString(undefined, { month: "short", year: "numeric" }) || date;
}

export interface DreamInsightSummary {
  total: number;
  lucidCount: number;
  lucidSpecified: number;
  lucidPercent: number | null;
  averageVividness: number | null;
  topTags: { tag: string; count: number }[];
  vividnessDistribution: { score: number; count: number }[];
}

export function dreamInsightSummary(entries: JournalEntry[], today: string): DreamInsightSummary {
  const past = entries.filter(e => e.date <= today);
  const lucidKnown = past.filter(e => typeof e.lucid === "boolean");
  const lucidCount = lucidKnown.filter(e => e.lucid).length;
  const lucidPercent = lucidKnown.length ? Math.round((lucidCount / lucidKnown.length) * 100) : null;

  const vividnessCounts = new Map<number, number>([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]]);
  let vividnessSum = 0;
  let vividnessTotal = 0;
  const tagCounts = new Map<string, number>();

  for (const entry of past) {
    if (typeof entry.vividness === "number" && entry.vividness >= 1 && entry.vividness <= 5) {
      const score = Math.round(entry.vividness);
      vividnessCounts.set(score, (vividnessCounts.get(score) || 0) + 1);
      vividnessSum += entry.vividness;
      vividnessTotal++;
    }
    for (const rawTag of entry.tags || []) {
      const tag = rawTag.trim().toLowerCase();
      if (!tag) continue;
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));

  const vividnessDistribution = [1, 2, 3, 4, 5].map(score => ({
    score,
    count: vividnessCounts.get(score) || 0,
  }));

  return {
    total: past.length,
    lucidCount,
    lucidSpecified: lucidKnown.length,
    lucidPercent,
    averageVividness: vividnessTotal ? Number((vividnessSum / vividnessTotal).toFixed(1)) : null,
    topTags,
    vividnessDistribution,
  };
}


