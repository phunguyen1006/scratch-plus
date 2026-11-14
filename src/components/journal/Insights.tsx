import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftIcon, ArrowRightIcon, XIcon } from "../icons";
import { parseJournalDate, periodBounds, periodMetrics, sanitizeEntryPreview, type JournalEntry, type Period } from "../../lib/journal";
import { activityGrid, dailySourceTotals, dreamInsightSummary, insightSummary, monthLabel, trendPoints, type ChartPoint } from "../../lib/journalInsights";

export type InsightsSource = "all" | "daily" | "dream";

type InsightsProps = {
  entries: JournalEntry[];
  today: string;
  showMetrics: boolean;
  showHeatmap: boolean;
  onDate: (date: string) => void;
};

const sources: { id: InsightsSource; label: string }[] = [
  { id: "all", label: "All" },
  { id: "daily", label: "Daily" },
  { id: "dream", label: "Dreams" },
];

const periods: { id: Period; label: string }[] = [
  { id: "week", label: "Week" }, { id: "month", label: "Month" },
  { id: "year", label: "Year" }, { id: "all", label: "All time" },
];
const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const number = (value: number) => value.toLocaleString();
const displayDate = (date: string) => parseJournalDate(date)?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) || date;

function MoonLineIcon() {
  return <svg className="journal-kpi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
}

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return <div className="flex justify-between gap-3 py-1.5 text-sm"><span className="text-text-muted">{label}</span><span className="font-medium text-right tabular-nums">{value}</span></div>;
}

export function InsightsSummary({ entries, today, showMetrics, onClose, onExpand }: InsightsProps & { onClose: () => void; onExpand: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const summary = useMemo(() => insightSummary(entries, today), [entries, today]);
  const periodStats = useMemo(() => periods.map(period => periodMetrics(entries, period.id, today)), [entries, today]);
  const todayWords = useMemo(() => entries.filter(entry => entry.date === today).reduce((sum, entry) => sum + entry.words, 0), [entries, today]);
  return <section className="journal-summary flex flex-col h-full bg-bg border-r border-border" aria-label="Insights summary">
    <header className="flex items-center justify-between px-5 py-4 border-b border-border">
      <h2 ref={heading} tabIndex={-1} className="text-base font-semibold tracking-tight outline-none">Insights</h2>
      <button type="button" onClick={onClose} aria-label="Close insights" className="journal-icon-button"><XIcon className="w-4 h-4" /></button>
    </header>
    <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
      {showMetrics && <>
        <div className="journal-streak-card">
          <div><span className="journal-meta-label">CURRENT STREAK</span><div className="mt-1"><strong className="text-2xl tracking-tight tabular-nums">{summary.streak.current}</strong><span className="text-sm text-text-muted ml-1.5">days</span></div></div>
          <span className="journal-best">Best {summary.streak.longest}</span>
        </div>
        <section><h3 className="journal-section-title">Entries</h3><div className="grid grid-cols-4 gap-1.5 mt-2">{periods.map((p, i) => <div key={p.id} className="journal-small-stat"><strong>{number(periodStats[i].entries)}</strong><span>{p.label === "All time" ? "All-time" : p.label}</span></div>)}</div></section>
        <section><h3 className="journal-section-title">Words</h3><div className="journal-summary-box mt-2"><MetricRow label="Today" value={number(todayWords)} />{periods.map((p, i) => <MetricRow key={p.id} label={p.id === "all" ? "All-time" : `This ${p.label.toLowerCase()}`} value={number(periodStats[i].words)} />)}<div className="border-t border-border mt-1 pt-1"><MetricRow label="Average per entry" value={number(summary.average)} /></div></div></section>
        <section><h3 className="journal-section-title">Compared to last period</h3><div className="grid grid-cols-3 gap-1.5 mt-2">{periods.slice(0, 3).map((p, i) => <div key={p.id} className="journal-small-stat" title={periodStats[i].comparison === null ? "No previous data" : "Change vs. previous period"}><strong>{periodStats[i].comparison === null ? "—" : `${periodStats[i].comparison! > 0 ? "+" : ""}${periodStats[i].comparison}%`}</strong><span>{p.label}</span></div>)}</div></section>
        <section><h3 className="journal-section-title">Activity</h3><div className="mt-2"><MetricRow label="Days since last entry" value={summary.daysSinceLast ?? "—"} /><MetricRow label="Most active day" value={summary.mostActiveDays.length ? summary.mostActiveDays.map(i => weekdays[i]).join(", ") : "—"} /><MetricRow label="Journaling since" value={summary.first ? monthLabel(summary.first) : "—"} /></div></section>
      </>}
      {!showMetrics && <p className="text-sm text-text-muted">Metrics hidden in settings.</p>}
      <button type="button" onClick={onExpand} className="journal-primary-action">View detailed insights <ArrowRightIcon className="w-4 h-4" /></button>
    </div>
  </section>;
}

export function InsightsDashboard({
  entries,
  dreams = [],
  defaultSource = "all",
  today,
  showMetrics,
  showHeatmap,
  onDate,
  onBack,
  onOpenEntry,
  onDream,
  children,
}: InsightsProps & {
  dreams?: JournalEntry[];
  defaultSource?: InsightsSource;
  onBack: () => void;
  onOpenEntry: (id: string) => void;
  onDream?: () => void;
  children?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [source, setSource] = useState<InsightsSource>(defaultSource);
  const [period, setPeriod] = useState<Period>("month");
  const sourceEntries = useMemo(() => {
    if (source === "daily") return entries;
    if (source === "dream") return dreams;
    return [...entries, ...dreams];
  }, [entries, dreams, source]);
  const pastDreams = useMemo(() => dreams.filter(entry => entry.date <= today), [dreams, today]);
  const summary = useMemo(() => insightSummary(sourceEntries, today), [sourceEntries, today]);
  const dreamSummary = useMemo(() => dreamInsightSummary(dreams, today), [dreams, today]);
  const metrics = useMemo(() => periodMetrics(sourceEntries, period, today), [sourceEntries, period, today]);
  const trends = useMemo(() => trendPoints(sourceEntries, period, today), [sourceEntries, period, today]);
  const [start] = periodBounds(period, today);
  const periodActiveDays = useMemo(() => new Set(
    sourceEntries.filter(e => e.date >= start && e.date <= today && (source === "dream" ? true : e.words > 0)).map(e => e.date)
  ).size, [sourceEntries, start, today, source]);
  const recent = useMemo(() => [...sourceEntries].filter(entry => entry.date <= today).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)).slice(0, 5), [sourceEntries, today]);
  const dreamEmpty = source === "dream" && pastDreams.length === 0;
  const meaningfulComparison = metrics.comparison !== null && period !== "all" && metrics.previousWords >= 10;

  const metricStrip = source === "dream"
    ? [
        { key: "entries", label: "DREAMS", value: number(metrics.entries), detail: period === "all" ? "All time" : `This ${period}` },
        { key: "words", label: "WORDS", value: number(metrics.words), detail: "" },
        { key: "active", label: "DREAM DAYS", value: number(periodActiveDays), detail: "" },
        dreamSummary.lucidSpecified > 0
          ? { key: "lucid", label: "LUCID DREAMS", value: `${dreamSummary.lucidCount} (${dreamSummary.lucidPercent}%)`, detail: `${dreamSummary.lucidSpecified} tagged` }
          : { key: "avg", label: "AVG WORDS", value: number(metrics.average), detail: "Per dream" },
      ]
    : [
        { key: "entries", label: "ENTRIES", value: number(metrics.entries), detail: period === "all" ? "All time" : `This ${period}` },
        {
          key: "words",
          label: "WORDS",
          value: number(metrics.words),
          detail: meaningfulComparison
            ? `${metrics.comparison! > 0 ? "+" : ""}${metrics.comparison}% vs prev`
            : "",
        },
        { key: "active", label: "ACTIVE DAYS", value: number(periodActiveDays), detail: "" },
        { key: "streak", label: "STREAK", value: `${summary.streak.current}d`, detail: summary.streak.longest ? `Best ${summary.streak.longest}d` : "" },
      ];

  const samePeakAsLongest = !!(
    summary.bestDay &&
    summary.longestEntry &&
    summary.bestDay.words === summary.longestEntry.words &&
    summary.bestDay.date === summary.longestEntry.date
  );

  return <section className="journal-page" aria-label="Detailed insights">
    <div className="journal-page-content journal-dashboard">
      <button type="button" onClick={onBack} className="journal-back"><ArrowLeftIcon className="w-3.5 h-3.5" /> Home</button>
      <header className="journal-editorial-header">
        <h1 ref={heading} tabIndex={-1} className="journal-dashboard-title outline-none">Insights</h1>
        <div className="journal-insights-controls">
          <div className="journal-periods" role="group" aria-label="Insights source">
            {sources.map(s => <button key={s.id} type="button" aria-pressed={source === s.id} onClick={() => setSource(s.id)} className={source === s.id ? "active" : ""}>{s.label}</button>)}
          </div>
          {showMetrics && !dreamEmpty && <div className="journal-periods" role="group" aria-label="Insights period">
            {periods.map(p => <button key={p.id} type="button" aria-pressed={period === p.id} onClick={() => setPeriod(p.id)} className={period === p.id ? "active" : ""}>{p.label}</button>)}
          </div>}
        </div>
      </header>
      {dreamEmpty ? <section className="journal-editorial-band journal-insights-empty-dreams" aria-label="No dreams recorded yet">
        <MoonLineIcon />
        <h2>No dreams recorded yet</h2>
        {onDream && <button type="button" onClick={onDream} className="journal-home-secondary">Record a dream</button>}
      </section> : <>
        {showMetrics && <>
          <div className="journal-metric-strip" role="region" aria-label="Selected period metrics">
            {metricStrip.map(item => (
              <div key={item.key} className="journal-metric-cell">
                <span className="journal-meta-label">{item.label}</span>
                <strong>{item.value}</strong>
                {item.detail ? <small>{item.detail}</small> : null}
              </div>
            ))}
          </div>
          <div className="journal-editorial-grid">
            <section className="journal-editorial-primary">
              <div className="journal-band-head">
                <h2>Writing over time</h2>
                <span className="journal-caption">{number(metrics.words)} words</span>
              </div>
              <TrendChart points={trends} onDate={onDate} showSourceBreakdown={source === "all"} />
            </section>
            <section className="journal-editorial-aside">
              <div className="journal-band-head">
                <h2>Writing rhythm</h2>
              </div>
              <div className="journal-ledger">
                <MetricRow label="Avg per entry" value={`${number(metrics.average)} words`} />
                <MetricRow label="Avg per active day" value={`${number(periodActiveDays ? Math.round(metrics.words / periodActiveDays) : 0)} words`} />
                {source === "dream" ? <>
                  {dreamSummary.averageVividness !== null && (
                    <MetricRow label="Vividness" value={`${dreamSummary.averageVividness} / 5`} />
                  )}
                  {dreamSummary.topTags.length > 0 && (
                    <MetricRow label="Motifs" value={dreamSummary.topTags.slice(0, 3).map(t => `#${t.tag}`).join(" ")} />
                  )}
                </> : <>
                  <MetricRow label="Best streak" value={`${summary.streak.longest} days`} />
                  <MetricRow label="Active days" value={number(summary.activeDays)} />
                </>}
                <MetricRow label="Last entry" value={summary.last ? displayDate(summary.last) : "—"} />
              </div>
            </section>
          </div>
        </>}
        {showHeatmap && <section className="journal-editorial-band">
          <div className="journal-band-head">
            <h2>Writing activity</h2>
            <span className="journal-caption">{number(summary.activeDaysLastYear)} active · 365d</span>
          </div>
          <ActivityHeatmap entries={sourceEntries} today={today} onDate={onDate} />
        </section>}
        {showMetrics && <div className="journal-editorial-grid">
          <section className="journal-editorial-primary">
            <div className="journal-band-head">
              <h2>Highlights</h2>
            </div>
            <div className="journal-highlights-list">
              <div className="journal-highlight-item">
                <span className="journal-meta-label">TOTAL ENTRIES</span>
                <strong>{number(summary.entries)}</strong>
              </div>
              <div className="journal-highlight-item">
                <span className="journal-meta-label">TOTAL WORDS</span>
                <strong>{number(summary.totalWords)}</strong>
              </div>
              {samePeakAsLongest ? <>
                <div className="journal-highlight-item">
                  <span className="journal-meta-label">PEAK DAY & ENTRY</span>
                  <strong>{summary.bestDay ? number(summary.bestDay.words) : "—"}</strong>
                  <small>{summary.bestDay ? displayDate(summary.bestDay.date) : "—"}</small>
                </div>
                <div className="journal-highlight-item">
                  <span className="journal-meta-label">SINCE</span>
                  <strong>{summary.first ? monthLabel(summary.first) : "—"}</strong>
                  <small>{summary.first ? displayDate(summary.first) : "—"}</small>
                </div>
              </> : <>
                <div className="journal-highlight-item">
                  <span className="journal-meta-label">PEAK DAY</span>
                  <strong>{summary.bestDay ? number(summary.bestDay.words) : "—"}</strong>
                  <small>{summary.bestDay ? displayDate(summary.bestDay.date) : "—"}</small>
                </div>
                <div className="journal-highlight-item">
                  <span className="journal-meta-label">LONGEST ENTRY</span>
                  <strong>{summary.longestEntry ? number(summary.longestEntry.words) : "—"}</strong>
                  <small>{summary.longestEntry ? displayDate(summary.longestEntry.date) : "—"}</small>
                </div>
              </>}
            </div>
            {source !== "daily" && pastDreams.length > 0 && (
              <div className="journal-highlights-dream-bar">
                <span><strong>Dreams</strong> · {number(pastDreams.length)}</span>
                {dreamSummary.lucidSpecified > 0 && (
                  <span>{dreamSummary.lucidCount}/{dreamSummary.lucidSpecified} lucid ({dreamSummary.lucidPercent}%)</span>
                )}
                {dreamSummary.averageVividness !== null && (
                  <span>Avg vividness {dreamSummary.averageVividness}/5</span>
                )}
                {dreamSummary.topTags.length > 0 && (
                  <span>Motifs: {dreamSummary.topTags.slice(0, 3).map(t => `#${t.tag}`).join(" ")}</span>
                )}
              </div>
            )}
          </section>
          <section className="journal-editorial-aside">
            <div className="journal-band-head">
              <h2>Recent entries</h2>
            </div>
            <div className="mt-2">{recent.length ? recent.map(entry => {
              const snippet = sanitizeEntryPreview(entry.preview);
              return <button type="button" key={entry.id} onClick={() => onOpenEntry(entry.id)} className="journal-recent">
                <span className="min-w-0">
                  <strong>{entry.title || displayDate(entry.date)}</strong>
                  <small>{displayDate(entry.date)}{source === "all" && entry.kind === "dream" ? " · Dream" : ""}{snippet ? ` · ${snippet}` : ""}</small>
                </span>
                <span className="shrink-0 tabular-nums">{number(entry.words)}w <ArrowRightIcon className="w-3.5 h-3.5" /></span>
              </button>;
            }) : <div className="journal-empty">Your recent entries will appear here.</div>}</div>
          </section>
        </div>}
      </>}
      {children}
    </div>
  </section>;
}

export function TrendChart({
  points,
  onDate,
  showSourceBreakdown = false,
}: {
  points: ChartPoint[];
  onDate: (date: string) => void;
  showSourceBreakdown?: boolean;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const max = Math.max(1, ...points.map(point => point.words));
  const mid = Math.round(max / 2);
  const allZero = points.every(point => point.words === 0);
  const hasBothSources = showSourceBreakdown && points.some(p => (p.dailyWords || 0) > 0) && points.some(p => (p.dreamWords || 0) > 0);
  const peakPoint = useMemo(() => {
    if (allZero || !points.length) return null;
    return points.reduce((best, point) => (point.words > best.words ? point : best), points[0]);
  }, [points, allZero]);
  const activeIndex = activeKey ? points.findIndex(point => point.key === activeKey) : -1;
  const activePoint = activeIndex >= 0 ? points[activeIndex] : null;

  if (!points.length) {
    return <div className="journal-empty journal-chart-empty">No entries yet.</div>;
  }

  const labelStep = points.length <= 12 ? 1 : points.length <= 18 ? 2 : 6;
  const count = points.length;
  const slotPct = 100 / count;
  const barPct = Math.min(slotPct * 0.62, 5.2);
  const compactCount = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : number(n));

  return (
    <div className="journal-trend-container">
      <div className="journal-trend-meta">
        <span className="journal-trend-readout" aria-live="polite">
          {activePoint ? (
            <>
              <strong>{activePoint.key}</strong> · {number(activePoint.words)}w · {activePoint.entries} {activePoint.entries === 1 ? "entry" : "entries"}
              {hasBothSources && (activePoint.dailyWords || 0) > 0 && (activePoint.dreamWords || 0) > 0
                ? ` (${number(activePoint.dailyWords || 0)} daily · ${number(activePoint.dreamWords || 0)} dream)`
                : ""}
            </>
          ) : peakPoint ? (
            <>Peak <strong>{peakPoint.key}</strong> · {number(peakPoint.words)}w</>
          ) : null}
        </span>
        {hasBothSources && (
          <span className="journal-trend-legend" aria-label="Series legend">
            <span><i className="is-daily" aria-hidden="true" /> Daily</span>
            <span><i className="is-dream" aria-hidden="true" /> Dreams</span>
          </span>
        )}
      </div>
      <div className="journal-trend-wrap">
        <div className="journal-trend-y" aria-hidden="true">
          <span>{compactCount(allZero ? 0 : max)}</span>
          <span>{compactCount(allZero ? 0 : mid)}</span>
          <span>0</span>
        </div>
        <div className="journal-trend-main">
          <div className="journal-trend-plot">
            <svg className="journal-trend-svg" width="100%" height="100%" aria-hidden="true">
              <defs>
                <pattern id="journal-dream-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="6" height="6" fill="currentColor" fillOpacity="0.14" />
                  <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.7" />
                </pattern>
              </defs>
              <line x1="0%" y1="4%" x2="100%" y2="4%" className="journal-trend-gridline" />
              <line x1="0%" y1="52%" x2="100%" y2="52%" className="journal-trend-gridline" />
              <line x1="0%" y1="99.5%" x2="100%" y2="99.5%" className="journal-trend-baseline" />
              {points.map((point, index) => {
                const isActive = activeKey === point.key;
                const centerPct = index * slotPct + slotPct / 2;
                const xPct = index * slotPct + (slotPct - barPct) / 2;
                const dailyWords = point.dailyWords ?? point.words;
                const dreamWords = point.dreamWords ?? 0;
                const isStacked = hasBothSources && dailyWords > 0 && dreamWords > 0;
                const totalHeightPct = point.words ? Math.max(2.5, (point.words / max) * 94) : 0;
                const dailyHeightPct = point.words ? (dailyWords / point.words) * totalHeightPct : 0;
                const dreamHeightPct = point.words ? (dreamWords / point.words) * totalHeightPct : 0;

                return (
                  <g key={point.key}>
                    {isActive && (
                      <line
                        x1={`${centerPct}%`}
                        y1="0%"
                        x2={`${centerPct}%`}
                        y2="100%"
                        className="journal-trend-guide"
                      />
                    )}
                    {isStacked ? (
                      <g className={`journal-trend-bar-stack ${isActive ? "is-hovered" : ""}`}>
                        <rect
                          x={`${xPct}%`}
                          y={`${Math.max(4, 99.5 - totalHeightPct)}%`}
                          width={`${barPct}%`}
                          height={`${Math.max(1.5, dreamHeightPct - 0.8)}%`}
                          rx="1.5"
                          className="journal-trend-svg-dream"
                        />
                        <rect
                          x={`${xPct}%`}
                          y={`${99.5 - dailyHeightPct}%`}
                          width={`${barPct}%`}
                          height={`${Math.max(1.5, dailyHeightPct)}%`}
                          rx="1.5"
                          className="journal-trend-svg-daily"
                        />
                      </g>
                    ) : (
                      <rect
                        x={`${xPct}%`}
                        y={`${point.words ? 99.5 - totalHeightPct : 98.2}%`}
                        width={`${barPct}%`}
                        height={`${point.words ? totalHeightPct : 1.3}%`}
                        rx="1.5"
                        className={`journal-trend-svg-bar ${point.words === 0 ? "is-zero" : ""} ${isActive ? "is-hovered" : ""}`}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
            {activePoint && activeIndex >= 0 && (() => {
              const centerPct = ((activeIndex + 0.5) / count) * 100;
              const align = centerPct < 18 ? "is-left" : centerPct > 82 ? "is-right" : "is-center";
              return (
                <div
                  className={`journal-trend-popover ${align}`}
                  style={{ left: `${centerPct}%` }}
                  aria-hidden="true"
                >
                  <strong>{activePoint.key}</strong>
                  <span>{number(activePoint.words)}w</span>
                </div>
              );
            })()}
            <div className="journal-trend-overlay">
              {points.map((point, index) => {
                const clickable = point.key.length === 10 && point.entries > 0;
                const isFirst = index === 0;
                const isLast = index === points.length - 1;
                const showTick = isFirst || isLast || (index % labelStep === 0 && (points.length - 1 - index) >= Math.ceil(labelStep * 0.55));
                const labelText = `${point.key}: ${number(point.words)} words, ${point.entries} entries`;
                return (
                  <button
                    key={point.key}
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onDate(point.key)}
                    onMouseEnter={() => setActiveKey(point.key)}
                    onMouseLeave={() => setActiveKey(prev => (prev === point.key ? null : prev))}
                    onFocus={() => setActiveKey(point.key)}
                    onBlur={() => setActiveKey(prev => (prev === point.key ? null : prev))}
                    className={`journal-trend-column ${activeKey === point.key ? "is-hovered" : ""}`}
                    aria-label={labelText}
                  >
                    <span className="journal-trend-label">{showTick ? point.label : ""}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {allZero && <div className="journal-chart-note">No words in this period</div>}
        </div>
      </div>
    </div>
  );
}

export function ActivityHeatmap({ entries, today, onDate, allowEmpty = false }: { entries: JournalEntry[]; today: string; onDate: (date: string) => void; allowEmpty?: boolean }) {
  const totals = useMemo(() => dailySourceTotals(entries), [entries]);
  const grid = useMemo(() => activityGrid(today), [today]);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const totalCols = Math.max(1, grid.length / 7);
  const labels = useMemo(() => {
    const candidates: { date: string; col: number }[] = [];
    for (let i = 0; i < grid.length; i += 7) {
      const cell = grid[i];
      if (!cell.inRange || Number(cell.date.slice(8)) > 7) continue;
      const col = Math.floor(i / 7) + 1;
      const prev = candidates[candidates.length - 1];
      if (prev && col - prev.col < 3) continue;
      candidates.push({ date: cell.date, col });
    }
    return candidates.map((item, index) => {
      const nextCol = candidates[index + 1]?.col;
      const maxSpan = nextCol ? nextCol - item.col : totalCols - item.col + 1;
      const span = Math.max(1, Math.min(4, maxSpan, totalCols - item.col + 1));
      return { ...item, span };
    });
  }, [grid, totalCols]);

  const activeData = activeDate ? totals.get(activeDate) : null;

  return <div className="mt-4 overflow-x-auto pb-1"><div className="journal-heatmap-shell"><div className="journal-heatmap-months" style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}>{labels.map(label => <span key={label.date} style={{ gridColumn: `${label.col} / span ${label.span}` }}>{parseJournalDate(label.date)?.toLocaleDateString(undefined, { month: "short" })}</span>)}</div><div className="journal-heatmap-row"><div className="journal-heatmap-days"><span>Mon</span><span>Wed</span><span>Fri</span></div><div className="journal-heatmap-grid" style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}>{grid.map(cell => {
    const data = totals.get(cell.date), words = data?.words || 0;
    const level = !cell.inRange ? -1 : words === 0 ? 0 : words < 50 ? 1 : words < 150 ? 2 : words < 300 ? 3 : 4;
    const breakdown = data && data.dailyCount > 0 && data.dreamCount > 0
      ? ` (${data.dailyCount} daily, ${data.dreamCount} dream)`
      : "";
    const cellLabel = `${displayDate(cell.date)}: ${data?.count || 0} entries${breakdown}, ${number(words)} words`;
    return <button
      key={cell.date}
      type="button"
      disabled={!cell.inRange || (!allowEmpty && !data?.count)}
      onClick={() => onDate(cell.date)}
      onMouseEnter={() => cell.inRange && setActiveDate(cell.date)}
      onMouseLeave={() => setActiveDate(prev => (prev === cell.date ? null : prev))}
      onFocus={() => cell.inRange && setActiveDate(cell.date)}
      onBlur={() => setActiveDate(prev => (prev === cell.date ? null : prev))}
      aria-label={cellLabel}
      title={`${displayDate(cell.date)} · ${data?.count || 0} entries · ${number(words)} words`}
      className={`journal-heat-cell level-${level}`}
    />;
  })}</div></div>
    <div className="journal-heatmap-footer">
      <span className="journal-heatmap-readout" aria-live="polite">
        {activeDate ? (
          <>
            <strong>{displayDate(activeDate)}</strong> · {number(activeData?.words || 0)}w · {activeData?.count || 0} {(activeData?.count || 0) === 1 ? "entry" : "entries"}
            {activeData && activeData.dailyCount > 0 && activeData.dreamCount > 0
              ? ` (${activeData.dailyCount} daily, ${activeData.dreamCount} dream)`
              : ""}
          </>
        ) : (
          "365 days"
        )}
      </span>
      <div className="journal-heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`journal-heat-cell level-${level}`} />)}<span>More</span></div>
    </div>
    {!entries.some(e => e.date <= today) && <div className="journal-empty">Your writing activity will appear here.</div>}</div></div>;
}
