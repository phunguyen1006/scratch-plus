import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ArrowRightIcon, PlusIcon } from "../icons";
import {
  addDays,
  dailyTotals,
  groupOnThisDayByYear,
  isBoilerplateJournalHeading,
  onThisDay,
  onThisDayYearPresence,
  parseJournalDate,
  periodMetrics,
  sanitizeEntryPreview,
  type JournalEntry,
} from "../../lib/journal";
import { dreamInsightSummary, insightSummary } from "../../lib/journalInsights";
import { ActivityHeatmap } from "./Insights";
export { EntriesPage, type EntriesScope } from "./EntriesGallery";

const niceDate = (date: string) => parseJournalDate(date)?.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) || date;
const byDate = (a: JournalEntry, b: JournalEntry) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
const count = (n: number) => n.toLocaleString();

function CalendarLineIcon() {
  return <svg className="journal-kpi-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
}

function toImageUrl(notesFolder: string | undefined, image: string | undefined): string | null {
  if (!image) return null;
  if (/^(https?:|data:|blob:|asset:|tauri:)/i.test(image)) return image;
  const normalizedImage = image.replace(/^[\\/]+/, "");
  if (!notesFolder) return normalizedImage;
  const normalizedFolder = notesFolder.replace(/[\\/]+$/, "");
  const fullPath = `${normalizedFolder}/${normalizedImage}`;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return convertFileSrc(fullPath);
  }
  return fullPath;
}

function EntryList({ entries, empty, open }: { entries: JournalEntry[]; empty: string; open: (id: string) => void }) {
  return entries.length ? <div className="journal-home-recent-list">{entries.map(entry => {
    const cleanPreview = sanitizeEntryPreview(entry.preview);
    return <button key={entry.id} type="button" onClick={() => open(entry.id)} className="journal-home-recent-row">
      <span><strong>{entry.title || niceDate(entry.date)}</strong><small>{niceDate(entry.date)}{cleanPreview ? ` · ${cleanPreview}` : ""}</small></span><span className="journal-home-row-arrow" aria-hidden="true"><ArrowRightIcon className="w-3.5 h-3.5" /></span>
    </button>;
  })}</div> : <p className="journal-home-empty">{empty}</p>;
}

export function HomeDashboard({ today, daily, dreams, enabled, loading, error, showMetrics, showHeatmap, showMemories, busy, onToday, onDream, onDate, onCreateDate, onOpen, onNavigate, onSettings, onDreamJournal }: {
  today: string; daily: JournalEntry[]; dreams: JournalEntry[]; enabled: boolean; loading: boolean; error: boolean; showMetrics: boolean; showHeatmap: boolean; showMemories: boolean; busy: boolean;
  onToday: () => void; onDream: () => void; onDate: (date: string) => void; onCreateDate: (date: string) => void; onOpen: (id: string) => void;
  onNavigate: (page: "insights" | "memories" | "entries") => void; onSettings?: () => void; onDreamJournal: () => void;
}) {
  const [emptyDate, setEmptyDate] = useState<string | null>(null);
  const summary = useMemo(() => insightSummary(daily, today), [daily, today]);
  const totals = useMemo(() => dailyTotals(daily), [daily]);
  const featuredMemory = useMemo(() => onThisDay(daily, today)[0] ?? null, [daily, today]);
  const recentDaily = useMemo(() => [...daily].filter(e => e.date <= today).sort(byDate).slice(0, 4), [daily, today]);
  const recentDreams = useMemo(() => [...dreams].filter(e => e.date <= today).sort(byDate).slice(0, 3), [dreams, today]);
  const dreamsMonth = dreams.filter(e => e.date.startsWith(today.slice(0, 7)) && e.date <= today).length;
  const longDate = parseJournalDate(today)?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) || today;
  const heatDate = (date: string) => { if (totals.has(date)) { setEmptyDate(null); onDate(date); } else setEmptyDate(date); };
  const memoryYears = featuredMemory ? Number(today.slice(0, 4)) - Number(featuredMemory.date.slice(0, 4)) : 0;
  const memoryPreview = featuredMemory ? sanitizeEntryPreview(featuredMemory.preview) : "";
  const metricItems = [
    { key: "entries", label: "DAILY ENTRIES", value: count(summary.entries), detail: "" },
    { key: "streak", label: "STREAK", value: `${summary.streak.current}d`, detail: summary.streak.longest ? `Best ${summary.streak.longest}d` : "" },
    { key: "words", label: "WORDS", value: count(summary.totalWords), detail: "" },
    { key: "active", label: "ACTIVE DAYS", value: count(summary.activeDays), detail: `${summary.activeDaysLastYear} / 365d` },
  ];
  return <main className="journal-page" aria-label="Home dashboard"><div className="journal-page-content">
    <header className="journal-home-hero"><div><h1>Home</h1><p>{longDate}</p></div>
      {enabled && <div className="journal-home-actions"><button type="button" disabled={busy} onClick={onToday} className="journal-home-primary">Write today <ArrowRightIcon className="w-3.5 h-3.5" /></button><button type="button" disabled={busy} onClick={onDream} className="journal-home-secondary">Record a dream <PlusIcon className="w-3.5 h-3.5" /></button></div>}
    </header>
    {loading ? <p className="journal-home-empty" role="status">Loading…</p> : !enabled ? <div className="journal-panel-notice mt-6">Enable Journal mode to start writing. {onSettings && <button type="button" className="underline" onClick={onSettings}>Open Settings</button>}</div> : <>
      {error && <p className="journal-panel-notice mt-6" role="status">Some entries could not be read.</p>}
      {showMetrics && <section aria-label="Daily journal overview" className="journal-metric-strip journal-home-strip">{metricItems.map(item => (
        <button key={item.key} type="button" onClick={() => onNavigate("insights")} className="journal-metric-cell is-interactive">
          <span className="journal-meta-label">{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail ? <small>{item.detail}</small> : null}
        </button>
      ))}</section>}
      {showHeatmap && <section className="journal-home-band journal-home-activity"><div className="journal-home-heading"><h2>Writing activity</h2><button type="button" onClick={() => onNavigate("insights")}>Detailed insights <ArrowRightIcon className="w-3 h-3" /></button></div>
        <ActivityHeatmap entries={daily} today={today} onDate={heatDate} allowEmpty />
        {emptyDate && <div className="journal-inline-prompt">No daily entry on {niceDate(emptyDate)}. <button type="button" onClick={() => { onCreateDate(emptyDate); setEmptyDate(null); }}>Create entry</button><button type="button" onClick={() => setEmptyDate(null)}>Cancel</button></div>}
      </section>}
      <div className="journal-home-trio">
        {showMemories && <section className="journal-home-col"><div className="journal-home-heading"><h2>On This Day</h2><button type="button" onClick={() => onNavigate("memories")}>See all <ArrowRightIcon className="w-3 h-3" /></button></div>
          {featuredMemory ? <button type="button" onClick={() => onOpen(featuredMemory.id)} className="journal-home-memory">
            <span className="journal-meta-label">{memoryYears} {memoryYears === 1 ? "YEAR" : "YEARS"} AGO</span>
            <strong>{featuredMemory.title || niceDate(featuredMemory.date)}</strong>
            {memoryPreview && <p>{memoryPreview}</p>}
            <small>{niceDate(featuredMemory.date)}</small>
          </button> : <p className="journal-home-empty">No memories yet.</p>}
        </section>}
        <section className="journal-home-col"><div className="journal-home-heading"><h2>Recent Entries</h2><button type="button" onClick={() => onNavigate("entries")}>See all <ArrowRightIcon className="w-3 h-3" /></button></div>
          <EntryList entries={recentDaily} open={onOpen} empty="Your daily entries will appear here." />
        </section>
        <section className="journal-home-col"><div className="journal-home-heading"><div><h2>Dream Journal</h2><p>{count(dreamsMonth)} {dreamsMonth === 1 ? "dream" : "dreams"} this month</p></div><button type="button" onClick={onDreamJournal}>See all <ArrowRightIcon className="w-3 h-3" /></button></div>
          {recentDreams.length ? <EntryList entries={recentDreams} open={onOpen} empty="No dreams recorded yet." /> : <div className="journal-home-dream-empty">
            <strong>No dreams recorded yet</strong>
            {enabled && <button type="button" disabled={busy} onClick={onDream} className="journal-inline-link">Record a dream</button>}
          </div>}
        </section>
      </div>
    </>}
  </div></main>;
}

function MemoryTimelineCard({ entry, referenceYear, notesFolder, onOpen }: {
  entry: JournalEntry;
  referenceYear: number;
  notesFolder?: string;
  onOpen: (id: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const years = referenceYear - Number(entry.date.slice(0, 4));
  const thumbUrl = imgError ? null : toImageUrl(notesFolder, entry.image);
  const cleanTitle = entry.title && entry.title !== entry.date && !isBoilerplateJournalHeading(entry.title, entry.date)
    ? entry.title
    : niceDate(entry.date);
  const cleanPreview = sanitizeEntryPreview(entry.preview, entry.date, entry.title);
  const photoCount = entry.imageCount ?? entry.images?.length ?? (thumbUrl ? 1 : 0);

  return (
    <button
      type="button"
      onClick={() => onOpen(entry.id)}
      className={`journal-memory-card ${thumbUrl ? "has-thumb" : "text-only"}`}
    >
      {thumbUrl && (
        <div className="journal-memory-thumb-wrap">
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="journal-memory-thumb"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      <div className="journal-memory-body">
        <div className="journal-memory-top">
          <span className="journal-eyebrow">
            {entry.kind === "dream" ? "Dream" : "Daily"} · {years} {years === 1 ? "YEAR" : "YEARS"} AGO
          </span>
          {entry.kind === "dream" && entry.lucid === true && (
            <span className="journal-memory-badge">Lucid</span>
          )}
        </div>
        <strong className="journal-memory-title">{cleanTitle}</strong>
        {cleanPreview && <p className="journal-memory-excerpt">{cleanPreview}</p>}
        <div className="journal-memory-meta">
          <span>{niceDate(entry.date)}</span>
          <span>· {count(entry.words)}w</span>
          {photoCount > 0 && <span>· {photoCount} {photoCount === 1 ? "photo" : "photos"}</span>}
          {entry.kind === "dream" && typeof entry.vividness === "number" && (
            <span>· Vividness {entry.vividness}/5</span>
          )}
          <span className="journal-memory-open" aria-hidden="true">
            <ArrowRightIcon className="w-3.5 h-3.5 stroke-[1.7]" />
          </span>
        </div>
      </div>
    </button>
  );
}

export function MemoriesPage({
  today,
  selectedDate: initialSelectedDate,
  daily,
  dreams,
  notesFolder,
  error = false,
  onOpen,
  onBack,
  onNavigateEntries,
  onDream,
}: {
  today: string;
  selectedDate?: string;
  daily: JournalEntry[];
  dreams: JournalEntry[];
  notesFolder?: string;
  error?: boolean;
  onOpen: (id: string) => void;
  onBack?: () => void;
  onNavigateEntries?: () => void;
  onDream?: () => void;
}) {
  const [filter, setFilter] = useState<"daily" | "dream" | "all">("daily");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [referenceDate, setReferenceDate] = useState(() =>
    initialSelectedDate && parseJournalDate(initialSelectedDate) ? initialSelectedDate : today,
  );

  useEffect(() => {
    if (initialSelectedDate && parseJournalDate(initialSelectedDate)) {
      setReferenceDate(initialSelectedDate);
    } else {
      setReferenceDate(today);
    }
  }, [initialSelectedDate, today]);

  const dailyMatches = useMemo(() => onThisDay(daily, referenceDate), [daily, referenceDate]);
  const dreamMatches = useMemo(() => onThisDay(dreams, referenceDate), [dreams, referenceDate]);
  const allMatches = useMemo(() => onThisDay([...daily, ...dreams], referenceDate), [daily, dreams, referenceDate]);

  const activeMatches = filter === "daily" ? dailyMatches : filter === "dream" ? dreamMatches : allMatches;
  const sourcePool = useMemo(
    () => (filter === "daily" ? daily : filter === "dream" ? dreams : [...daily, ...dreams]),
    [filter, daily, dreams],
  );
  const yearGroups = useMemo(
    () => groupOnThisDayByYear(activeMatches, referenceDate, sortOrder),
    [activeMatches, referenceDate, sortOrder],
  );
  const yearPresence = useMemo(
    () => onThisDayYearPresence(sourcePool, activeMatches, referenceDate),
    [sourcePool, activeMatches, referenceDate],
  );

  const monthDay = parseJournalDate(referenceDate)?.toLocaleDateString(undefined, { month: "long", day: "numeric" }) || referenceDate;
  const shortMonthDay = parseJournalDate(referenceDate)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) || referenceDate;
  const referenceYear = Number(referenceDate.slice(0, 4));
  const totalWords = useMemo(() => activeMatches.reduce((sum, entry) => sum + entry.words, 0), [activeMatches]);
  const totalPhotos = useMemo(
    () => activeMatches.reduce((sum, entry) => sum + (entry.imageCount ?? entry.images?.length ?? (entry.image ? 1 : 0)), 0),
    [activeMatches],
  );

  const jumpToYear = (year: number) => {
    if (typeof document === "undefined") return;
    document.getElementById(`otd-year-${year}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <main className="journal-page" aria-label="On This Day"><div className="journal-page-content">
    {onBack && <button type="button" className="journal-back mb-3" onClick={onBack}>← Back</button>}
    <header className="journal-otd-header-row">
      <div className="journal-page-header">
        <h1>On This Day</h1>
        <p>{monthDay}</p>
      </div>
      <div className="journal-otd-date-controls">
        <button
          type="button"
          className="journal-otd-date-step"
          aria-label="Previous day"
          onClick={() => setReferenceDate(prev => addDays(prev, -1))}
        >‹</button>
        <label className="journal-otd-date-picker">
          <CalendarLineIcon />
          <span>{shortMonthDay}</span>
          <input
            type="date"
            aria-label="Select On This Day date"
            value={referenceDate}
            onChange={(event) => {
              const next = event.target.value;
              if (next && parseJournalDate(next)) setReferenceDate(next);
            }}
          />
        </label>
        <button
          type="button"
          className="journal-otd-date-step"
          aria-label="Next day"
          onClick={() => setReferenceDate(prev => addDays(prev, 1))}
        >›</button>
        {referenceDate !== today && (
          <button
            type="button"
            className="journal-otd-today-btn"
            onClick={() => setReferenceDate(today)}
          >Today</button>
        )}
      </div>
    </header>

    {error && <p role="status" className="text-xs text-text-muted mb-3">Some entries could not be read.</p>}

    <div className="journal-otd-toolbar">
      <div className="journal-periods journal-filter" role="group" aria-label="Memory type">
        {([
          ["daily", `Daily (${dailyMatches.length})`],
          ["dream", `Dreams (${dreamMatches.length})`],
          ["all", `All memories (${allMatches.length})`],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={filter === id}
            className={filter === id ? "active" : ""}
            onClick={() => setFilter(id)}
          >{label}</button>
        ))}
      </div>
      <div className="journal-otd-meta">
        {activeMatches.length > 0 && (
          <span className="journal-otd-summary">
            {activeMatches.length} {activeMatches.length === 1 ? "memory" : "memories"} · {yearGroups.length} {yearGroups.length === 1 ? "year" : "years"} remembered · {count(totalWords)} words{totalPhotos > 0 ? ` · ${totalPhotos} ${totalPhotos === 1 ? "photo" : "photos"}` : ""}
          </span>
        )}
        {activeMatches.length > 1 && (
          <button
            type="button"
            className="journal-otd-sort"
            onClick={() => setSortOrder(order => order === "newest" ? "oldest" : "newest")}
          >
            {sortOrder === "newest" ? "Newest first" : "Oldest first"}
          </button>
        )}
      </div>
    </div>

    {yearPresence.length > 0 && activeMatches.length > 0 && (
      <section className="journal-otd-presence" aria-label="Yearly presence">
        <div className="journal-otd-presence-head">
          <span>Yearly presence</span>
          <div className="journal-otd-presence-legend">
            <span><i className="is-active" aria-hidden="true" /> Has a memory</span>
            <span><i className="is-empty" aria-hidden="true" /> No entry</span>
          </div>
        </div>
        <div className="journal-otd-presence-years">
          {yearPresence.map(item => (
            <button
              key={item.year}
              type="button"
              disabled={!item.hasMemory}
              onClick={() => jumpToYear(item.year)}
              className={`journal-otd-year-pill ${item.hasMemory ? "is-active" : "is-empty"}`}
              aria-label={item.hasMemory ? `${item.year}: ${item.count} ${item.count === 1 ? "memory" : "memories"}` : `${item.year}: No entry`}
              title={item.hasMemory ? `${item.year} · ${item.count} ${item.count === 1 ? "memory" : "memories"}` : `${item.year} · No entry`}
            >
              <span>{item.year}</span>
            </button>
          ))}
        </div>
      </section>
    )}

    {activeMatches.length ? (
      <div className="journal-otd-timeline">
        {yearGroups.map(group => (
          <section key={group.year} id={`otd-year-${group.year}`} className="journal-otd-year-group">
            <div className="journal-otd-year-header">
              <h2>{group.year}</h2>
              <span className="journal-otd-year-badge">
                {group.yearsAgo} {group.yearsAgo === 1 ? "year" : "years"} ago · {group.entries.length} {group.entries.length === 1 ? "memory" : "memories"}
              </span>
            </div>
            <div className="journal-memory-grid">
              {group.entries.map(entry => (
                <MemoryTimelineCard
                  key={entry.id}
                  entry={entry}
                  referenceYear={referenceYear}
                  notesFolder={notesFolder}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    ) : filter === "dream" && dreams.length === 0 ? (
      <div className="journal-home-empty journal-memory-empty">
        <p>No memories for this date yet. No dreams recorded yet.</p>
        <div className="journal-otd-empty-actions">
          {onDream && <button type="button" onClick={onDream} className="journal-home-secondary">Record a dream</button>}
          {allMatches.length > 0 && <button type="button" onClick={() => setFilter("all")} className="journal-inline-link">View all memories ({allMatches.length})</button>}
        </div>
      </div>
    ) : (
      <div className="journal-home-empty journal-memory-empty">
        <p>No memories for this date yet.</p>
        <div className="journal-otd-empty-actions">
          {filter !== "all" && allMatches.length > 0 && (
            <button type="button" onClick={() => setFilter("all")} className="journal-home-secondary">Show all memories ({allMatches.length})</button>
          )}
          {referenceDate !== today && (
            <button type="button" onClick={() => setReferenceDate(today)} className="journal-inline-link">Back to today</button>
          )}
          {onNavigateEntries && (
            <button type="button" onClick={onNavigateEntries} className="journal-inline-link">Browse all entries</button>
          )}
        </div>
      </div>
    )}
  </div></main>;
}

export function DreamInsights({ entries, today, onOpen }: { entries: JournalEntry[]; today: string; onOpen: (id: string) => void }) {
  const past = entries.filter(entry => entry.date <= today);
  const words = past.reduce((total, entry) => total + entry.words, 0);
  const summary = useMemo(() => dreamInsightSummary(entries, today), [entries, today]);
  const months = Array.from({ length: 12 }, (_, index) => {
    const d = parseJournalDate(today)!;
    const month = new Date(d.getFullYear(), d.getMonth() - 11 + index, 1, 12);
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: month.toLocaleDateString(undefined, { month: "short" }), value: past.filter(entry => entry.date.startsWith(key)).length };
  });
  const max = Math.max(1, ...months.map(month => month.value));
  const maxVividnessCount = Math.max(1, ...summary.vividnessDistribution.map(item => item.count));
  const hasVividness = summary.vividnessDistribution.some(item => item.count > 0);
  return <div className="journal-dream-insights">
    <div className="journal-metric-strip">{[["TOTAL DREAMS", past.length, "All time"], ["THIS MONTH", periodMetrics(past, "month", today).entries, ""], ["LUCID DREAMS", summary.lucidSpecified ? `${summary.lucidCount} (${summary.lucidPercent}%)` : "—", summary.lucidSpecified ? `${summary.lucidSpecified} specified` : "Not specified"], ["WORDS PER DREAM", past.length ? Math.round(words / past.length) : 0, "Average"]].map(([label, value, description]) => <div className="journal-metric-cell" key={String(label)}><span className="journal-meta-label">{label}</span><strong>{typeof value === "number" ? count(value) : value}</strong>{description ? <small>{description}</small> : null}</div>)}</div>
    <div className="journal-editorial-grid"><section className="journal-editorial-primary"><h2>Dreams by month</h2><div className="journal-dream-chart">{months.map(month => <div key={month.key} title={`${month.key}: ${month.value} dreams`} aria-label={`${month.key}: ${month.value} dreams`}><strong>{month.value || ""}</strong><span style={{ height: `${Math.max(2, month.value / max * 100)}%` }} /><small>{month.label}</small></div>)}</div></section>
      <section className="journal-editorial-aside"><h2>Dream details</h2><dl className="journal-dream-details mt-2"><div><dt>This week</dt><dd>{periodMetrics(past, "week", today).entries}</dd></div><div><dt>This year</dt><dd>{periodMetrics(past, "year", today).entries}</dd></div><div><dt>Lucid dreams</dt><dd>{summary.lucidSpecified ? `${summary.lucidCount} of ${summary.lucidSpecified} (${summary.lucidPercent}%)` : "Not specified"}</dd></div><div><dt>Average vividness</dt><dd>{summary.averageVividness !== null ? `${summary.averageVividness} / 5` : "Not specified"}</dd></div></dl></section></div>
    <div className="journal-editorial-grid">
      <section className="journal-editorial-primary"><h2>Recurring tags</h2>{summary.topTags.length ? <div className="journal-tag-list">{summary.topTags.map(item => <span key={item.tag} className="journal-tag-pill"><span>#{item.tag}</span><small>{item.count}</small></span>)}</div> : <p className="journal-empty">No dream tags yet.</p>}</section>
      <section className="journal-editorial-aside"><h2>Vividness distribution</h2>{hasVividness ? <div className="space-y-2 mt-4">{[...summary.vividnessDistribution].reverse().map(item => <div key={item.score} className="flex items-center gap-3 text-xs"><span className="w-8 text-text-muted">{item.score} / 5</span><div className="journal-horizontal-track"><div className="journal-horizontal-bar" style={{ width: `${Math.round(item.count / maxVividnessCount * 100)}%` }} /></div><span className="w-6 text-right tabular-nums text-text-muted">{item.count}</span></div>)}</div> : <p className="journal-empty">No vividness scores yet.</p>}</section>
    </div>
    <section className="journal-editorial-band"><h2>Recent dreams</h2><EntryList entries={[...past].sort(byDate).slice(0, 5)} open={onOpen} empty="No dreams recorded yet." /></section>
  </div>;
}

export function DreamJournalPage({ dreams, today, onDream, onOpen, onBack, busy }: { dreams: JournalEntry[]; today: string; onDream: () => void; onOpen: (id: string) => void; onBack?: () => void; busy: boolean }) {
  return <main className="journal-page" aria-label="Dream Journal"><div className="journal-page-content">
    {onBack && <button type="button" className="journal-back mb-3" onClick={onBack}>← Back</button>}
    <header className="journal-home-hero"><div><h1>Dream Journal</h1><p>{count(dreams.length)} {dreams.length === 1 ? "dream" : "dreams"}</p></div><button type="button" className="journal-home-primary" disabled={busy} onClick={onDream}>Record a dream <PlusIcon className="w-3.5 h-3.5" /></button></header>
    <section className="journal-home-band"><div className="journal-home-heading"><h2>All dreams</h2></div><EntryList entries={[...dreams].sort(byDate)} open={onOpen} empty={`No dreams yet for ${niceDate(today)}.`} /></section>
  </div></main>;
}
