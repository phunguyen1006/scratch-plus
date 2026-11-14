import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useNotes } from "../../context/NotesContext";
import * as notesService from "../../services/notes";
import type { SearchResult } from "../../services/notes";
import type { NoteMetadata } from "../../types/note";
import { classifyJournalId, dateFromId, parseJournalDate, sanitizeEntryPreview, type JournalEntry } from "../../lib/journal";
import { ArrowRightIcon, SearchIcon, XIcon } from "../icons";

function PanelFrame({ title, onClose, children, focusHeading = true }: { title: string; onClose: () => void; children: ReactNode; focusHeading?: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focusHeading) heading.current?.focus(); }, [focusHeading]);
  return <section className="journal-summary flex flex-col h-full bg-bg border-r border-border" aria-label={`${title} panel`}>
    <header className="flex items-center justify-between px-5 py-4 border-b border-border">
      <h2 ref={heading} tabIndex={-1} className="text-base font-semibold tracking-tight outline-none">{title}</h2>
      <button type="button" onClick={onClose} aria-label={`Close ${title}`} className="journal-icon-button"><XIcon className="w-4 h-4" /></button>
    </header>
    <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
  </section>;
}

function journalDate(date: string) {
  return parseJournalDate(date)?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) || date;
}

export function JournalStatusPanel({ title, message, onOpenSettings, onClose }: { title: string; message: string; onOpenSettings?: () => void; onClose: () => void }) {
  return <PanelFrame title={title} onClose={onClose}><div className="journal-panel-notice">{message} {onOpenSettings && <button type="button" onClick={onOpenSettings} className="underline">Open Settings</button>}</div></PanelFrame>;
}

export function HomePanel({ today, journalEnabled, recentNotes, busy, onToday, onOpenNote, onOpenSettings, onClose }: {
  today: string; journalEnabled: boolean; recentNotes: NoteMetadata[]; busy: boolean;
  onToday: () => void; onOpenNote: (id: string) => void; onOpenSettings?: () => void; onClose: () => void;
}) {
  return <PanelFrame title="Home" onClose={onClose}>
    <p className="text-sm text-text-muted leading-relaxed">{journalDate(today)}</p>
    {journalEnabled ? <button type="button" disabled={busy} onClick={onToday} className="journal-primary-action mt-4 disabled:opacity-50"><span>{busy ? "Opening…" : "Open today's journal"}</span><ArrowRightIcon className="w-4 h-4" /></button> : <div className="journal-panel-notice mt-4">Enable Journal mode in Settings to create a daily entry. {onOpenSettings && <button type="button" onClick={onOpenSettings} className="underline">Open Settings</button>}</div>}
    <div className="mt-7 flex items-center justify-between"><h3 className="journal-section-title">Recent notes</h3></div>
    <div className="mt-2">{recentNotes.length ? recentNotes.map(note => <button type="button" className="journal-panel-entry" key={note.id} onClick={() => onOpenNote(note.id)}><span className="font-medium block truncate">{note.title || "Untitled"}</span><span className="text-xs text-text-muted block mt-1 line-clamp-2">{note.preview || "No preview"}</span></button>) : <p className="journal-empty">Your recent notes will appear here.</p>}</div>
  </PanelFrame>;
}

export function MemoriesPanel({ today, entries, enabled, shown, loading, error, notesFolder, onOpenNote, onOpenSettings, onClose }: {
  today: string; entries: JournalEntry[]; enabled: boolean; shown: boolean; loading: boolean; error: boolean;
  notesFolder?: string; onOpenNote: (id: string) => void; onOpenSettings?: () => void; onClose: () => void;
}) {
  const monthDay = parseJournalDate(today)?.toLocaleDateString(undefined, { month: "long", day: "numeric" }) || today;
  const resolveThumb = (image?: string) => {
    if (!image) return null;
    if (/^(https?:|data:|blob:|asset:|tauri:)/i.test(image)) return image;
    const cleanImage = image.replace(/^[\\/]+/, "");
    const full = notesFolder ? `${notesFolder.replace(/[\\/]+$/, "")}/${cleanImage}` : cleanImage;
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window ? convertFileSrc(full) : full;
  };
  return <PanelFrame title="On This Day" onClose={onClose}>
    <p className="text-sm text-text-muted leading-relaxed">Memories from {monthDay} in previous years.</p>
    {loading ? <p className="journal-empty">Looking for memories…</p>
      : !enabled || !shown ? <div className="journal-panel-notice mt-5">{!enabled ? "Enable Journal mode to look back on your entries." : "On This Day is hidden in Settings."} {onOpenSettings && <button type="button" onClick={onOpenSettings} className="underline">Open Settings</button>}</div>
      : <>
        {error && <p role="status" className="text-xs text-text-muted mt-3">Some entries could not be read.</p>}
        {entries.length ? <div className="mt-5 space-y-3">{entries.map(entry => {
          const years = Number(today.slice(0, 4)) - Number(entry.date.slice(0, 4));
          const thumb = resolveThumb(entry.image);
          const preview = sanitizeEntryPreview(entry.preview, entry.date, entry.title) || "No preview available";
          return <button type="button" key={entry.id} className="journal-memory-card" onClick={() => onOpenNote(entry.id)}><span className="journal-meta-label">{entry.date.slice(0, 4)} · {years} {years === 1 ? "YEAR" : "YEARS"} AGO</span><strong>{entry.title || journalDate(entry.date)}</strong>{thumb && <img src={thumb} alt="" loading="lazy" className="journal-memory-thumb" />}<span>{preview}</span><small>{journalDate(entry.date)}</small></button>;
        })}</div> : <div className="journal-panel-notice mt-5"><strong className="block text-text mb-1">No memories for today yet</strong>Entries from the same date in earlier years appear here.</div>}
      </>}
  </PanelFrame>;
}

export function SearchPanel({ onClose, journalRoot = "Journal", journalEntries = [] }: { onClose: () => void; journalRoot?: string; journalEntries?: JournalEntry[] }) {
  const { notes, selectNote } = useNotes();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultsQuery, setResultsQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<"all" | "daily" | "dream" | "other">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    window.addEventListener("focus-journal-search", focus);
    return () => window.removeEventListener("focus-journal-search", focus);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term) { setResults([]); setResultsQuery(""); setSearching(false); setError(false); return; }
    let cancelled = false;
    const lower = term.toLocaleLowerCase();
    const instant: SearchResult[] = notes.filter(note => note.title.toLocaleLowerCase().includes(lower) || note.preview.toLocaleLowerCase().includes(lower)).slice(0, 20).map(note => ({ ...note, score: 0 }));
    setResults(instant); setResultsQuery(term); setSearching(true); setError(false);
    const timer = window.setTimeout(async () => {
      try {
        const found = await notesService.searchNotes(term);
        if (cancelled) return;
        const seen = new Set(found.map(note => note.id));
        setResults([...found, ...instant.filter(note => !seen.has(note.id))]);
      } catch { if (!cancelled) setError(true); }
      finally { if (!cancelled) setSearching(false); }
    }, 220);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query, notes]);

  const displayed = useMemo(() => query.trim() && query.trim() === resultsQuery ? results.filter(note => filter === "all" || classifyJournalId(note.id, journalRoot.trim()) === filter) : [], [query, results, resultsQuery, filter, journalRoot]);
  const pending = searching || (!!query.trim() && query.trim() !== resultsQuery);
  const open = (id: string) => { onClose(); void selectNote(id); };
  return <PanelFrame title="Search" onClose={onClose} focusHeading={false}>
    <label htmlFor="journal-search-input" className="sr-only">Search all notes</label>
    <div className="journal-search-field"><SearchIcon className="w-4 h-4 text-text-muted shrink-0" /><input id="journal-search-input" ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (query) setQuery(""); else onClose(); }
      if (event.key === "Enter" && displayed[0]) { event.preventDefault(); void open(displayed[0].id); }
    }} placeholder="Search all notes…" /></div>
    <div className="journal-periods journal-filter mt-4" role="group" aria-label="Search scope">{([ ["all", "All"], ["daily", "Daily"], ["dream", "Dreams"], ["other", "Other notes"] ] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <div aria-live="polite" className="text-xs text-text-muted mt-3">{!query.trim() ? "Search titles and note contents." : pending ? "Searching…" : `${displayed.length} ${displayed.length === 1 ? "result" : "results"}`}</div>
    {error && <p className="text-xs text-text-muted mt-2">Full-text search is unavailable; showing title and preview matches.</p>}
    <div className="mt-2">{displayed.map(note => {
      const kind = classifyJournalId(note.id, journalRoot.trim());
      const date = journalEntries.find(entry => entry.id === note.id)?.date || (kind === "daily" ? dateFromId(note.id, journalRoot.trim()) : null);
      return <button key={note.id} type="button" onClick={() => open(note.id)} className="journal-panel-entry"><span className="font-medium block truncate">{note.title || "Untitled"}</span><span className="text-xs text-text-muted block mt-1 line-clamp-2">{note.preview || "No preview"}</span><span className="block text-2xs text-text-muted mt-1 truncate">{kind === "daily" ? "Daily" : kind === "dream" ? "Dream" : "Other note"}{date ? ` · ${date}` : ""} · {note.id}</span></button>;
    })}{query.trim() && !pending && displayed.length === 0 && <p className="journal-empty">No notes matched your search.</p>}</div>
  </PanelFrame>;
}
