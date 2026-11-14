import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { useNotes } from "../../context/NotesContext";
import * as notesService from "../../services/notes";
import { addDays, classifyJournalId, cleanJournalExcerpt, dateFromId, dreamMetadata, entriesForKind, extractImagesFromMarkdown, isBoilerplateJournalHeading, localDate, markdownText, parseJournalDate, wordCount, type JournalEntry } from "../../lib/journal";
import { resolveNoteImageToAssetRelPath } from "../../lib/attachments";
import { defaultJournalSettings, journalSettings } from "../../lib/journalSettings";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../ui";
import { InsightsDashboard } from "./Insights";
import { JournalStatusPanel, SearchPanel } from "./JournalPanels";
import { EntriesPage, HomeDashboard, MemoriesPage } from "./JournalDashboard";
import type { JournalPanel } from "../../lib/journalNavigation";

const launchedFolders = new Set<string>();
const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const dateLabel = (date: string) => parseJournalDate(date)?.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) ?? date;

export function JournalSidebar({ activePanel, onClosePanel, onOpenSettings }: {
  activePanel: JournalPanel | null;
  onClosePanel: () => void;
  onOpenSettings?: () => void;
}) {
  const { notes, notesFolder, currentNote, selectedNoteId, selectNote, deleteNote, refreshNotes } = useNotes();
  const [settings, setSettings] = useState(defaultJournalSettings);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState(localDate);
  const [selected, setSelected] = useState(localDate);
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [indexError, setIndexError] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<"daily" | "dream">("daily");
  const [entriesScope, setEntriesScope] = useState<"all" | "daily" | "dream">("all");
  const [entryToDelete, setEntryToDelete] = useState<JournalEntry | null>(null);
  const cache = useRef(new Map<string, { key: string; entry: JournalEntry }>());
  const changed = useRef(new Set<string>());

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => notesService.getSettings().then(s => {
      if (!cancelled) { setSettings(journalSettings(s.journal)); setReady(true); }
    }).catch(() => { if (!cancelled) { setReady(true); toast.error("Could not load journal settings"); } });
    setReady(false); cache.current.clear(); changed.current.clear(); setEntries([]);
    void load();
    window.addEventListener("journal-settings-changed", load);
    return () => { cancelled = true; window.removeEventListener("journal-settings-changed", load); };
  }, [notesFolder]);

  useEffect(() => {
    if (!settings.enabled) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<{ changed_ids: string[] }>("file-change", event => {
      for (const id of event.payload.changed_ids || []) changed.current.add(id);
      setRevision(v => v + 1);
    }).then(fn => { if (cancelled) fn(); else unlisten = fn; }).catch(() => setIndexError(true));
    return () => { cancelled = true; unlisten?.(); };
  }, [settings.enabled]);

  useEffect(() => {
    if (!ready || !settings.enabled) { setEntries([]); setIndexLoading(false); return; }
    let cancelled = false;
    setIndexLoading(true);
    const root = settings.root.trim();
    const candidates = notes.map(note => ({ note, kind: classifyJournalId(note.id, root) })).filter((item): item is { note: typeof notes[number]; kind: "daily" | "dream" } => item.kind !== "other");
    const validIds = new Set(candidates.map(item => item.note.id));
    for (const id of cache.current.keys()) if (!validIds.has(id)) cache.current.delete(id);
    const dirty = new Set(changed.current);
    changed.current.clear();
    const load = async () => {
      let failed = false;
      let next = 0;
      const worker = async () => {
        while (next < candidates.length) {
          const { note, kind } = candidates[next++];
          const key = `${note.modified}|${note.title}|${note.preview}`;
          const cached = cache.current.get(note.id);
          if (cached?.key === key && !dirty.has(note.id) && currentNote?.id !== note.id) continue;
          try {
            // Always read saved bytes: currentNote may be stale after an external edit.
            const full = await notesService.readNote(note.id);
            if (cancelled) return;
            const metadata = kind === "dream" ? dreamMetadata(full.content, note.id) : null;
            const date = metadata?.date || (kind === "daily" ? dateFromId(note.id, root) : null);
            if (!date) { cache.current.delete(note.id); failed = true; continue; }
            const text = markdownText(full.content, date);
            const rawTitle = full.title?.trim() || "";
            const hasCustomTitle = Boolean(
              rawTitle &&
              rawTitle !== date &&
              !isBoilerplateJournalHeading(rawTitle, date),
            );
            const excerpt = cleanJournalExcerpt(full.content, date, hasCustomTitle ? rawTitle : undefined);
            const fallbackPreview = kind === "dream" && text.startsWith(full.title) ? text.slice(full.title.length).trim() : text;
            const preview = (excerpt || fallbackPreview).slice(0, 360);
            const countable = kind === "dream" ? full.content.replace(/^#\s+Untitled dream\s*$/im, "") : full.content;
            const images = extractImagesFromMarkdown(full.content).map(
              raw => resolveNoteImageToAssetRelPath(note.id, raw) || raw,
            );
            cache.current.set(note.id, {
              key,
              entry: {
                id: note.id,
                date,
                title: full.title,
                preview,
                words: wordCount(countable, date),
                kind,
                lucid: metadata?.lucid,
                vividness: metadata?.vividness,
                tags: metadata?.tags,
                image: images[0],
                images,
                imageCount: images.length,
                modified: full.modified || note.modified,
                hasCustomTitle,
                searchText: text.slice(0, 4000).toLocaleLowerCase(),
              },
            });
          } catch { if (!cancelled) { cache.current.delete(note.id); failed = true; } }
        }
      };
      await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, worker));
      if (!cancelled) {
        setEntries(candidates.flatMap(({ note }) => { const found = cache.current.get(note.id); return found ? [found.entry] : []; }));
        setIndexError(failed);
        setIndexLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; for (const id of dirty) changed.current.add(id); };
  }, [notes, settings.enabled, settings.root, ready, currentNote, revision]);

  const daily = useMemo(() => entriesForKind(entries, "daily"), [entries]);
  const dreams = useMemo(() => entriesForKind(entries, "dream"), [entries]);
  const byDate = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const entry of (kind === "daily" ? daily : dreams)) map.set(entry.date, [...(map.get(entry.date) || []), entry]);
    return map;
  }, [kind, daily, dreams]);

  const openDate = useCallback(async (date: string, create: boolean) => {
    setKind("daily"); setSelected(date); setMonth(date.slice(0, 7));
    const found = daily.filter(entry => entry.date === date);
    if (found.length > 1) { toast("More than one daily entry exists for this date. Choose one in the calendar."); return; }
    if (found.length === 1) {
      await selectNote(found[0].id);
      window.dispatchEvent(new Event("journal-open-editor"));
      if (create) window.setTimeout(() => window.dispatchEvent(new Event("journal-focus-editor")), 150);
      return;
    }
    if (!create) return;
    setBusy(true);
    try {
      const id = await invoke<string>("create_journal_entry", { date });
      await refreshNotes();
      await selectNote(id);
      window.dispatchEvent(new Event("journal-open-editor"));
      window.setTimeout(() => window.dispatchEvent(new Event("journal-focus-editor")), 150);
    } catch (error) { toast.error(`Could not open journal entry: ${String(error)}`); }
    finally { setBusy(false); }
  }, [daily, refreshNotes, selectNote]);

  const createDream = useCallback(async (date: string) => {
    setBusy(true);
    try {
      const id = await invoke<string>("create_dream_entry", { date });
      setKind("dream"); setSelected(date); setMonth(date.slice(0, 7));
      await refreshNotes();
      await selectNote(id);
      window.dispatchEvent(new Event("journal-open-editor"));
      window.setTimeout(() => window.dispatchEvent(new Event("journal-focus-editor")), 150);
    } catch (error) { toast.error(`Could not create dream: ${String(error)}`); }
    finally { setBusy(false); }
  }, [refreshNotes, selectNote]);

  useEffect(() => {
    if (!ready || !notesFolder || !settings.enabled || !settings.openToday || launchedFolders.has(notesFolder)) return;
    launchedFolders.add(notesFolder);
    void openDate(localDate(), true);
  }, [ready, notesFolder, settings.enabled, settings.openToday, openDate]);

  useEffect(() => {
    const onAction = (event: Event) => {
      if (!ready || !settings.enabled) return;
      const action = (event as CustomEvent<"today" | "dream">).detail;
      if (action === "today") void openDate(today, true);
      else if (action === "dream") void createDream(today);
    };
    window.addEventListener("journal-action", onAction);
    return () => window.removeEventListener("journal-action", onAction);
  }, [ready, settings.enabled, openDate, createDream, today]);

  useEffect(() => {
    if (!selectedNoteId || !settings.enabled) return;
    const selectedEntry = entries.find(entry => entry.id === selectedNoteId);
    const date = selectedEntry?.date || dateFromId(selectedNoteId, settings.root.trim());
    const selectedKind = classifyJournalId(selectedNoteId, settings.root.trim());
    if (selectedKind !== "other") setKind(selectedKind);
    if (date) { setSelected(date); setMonth(date.slice(0, 7)); }
  }, [selectedNoteId, entries, settings.enabled, settings.root]);

  const first = parseJournalDate(`${month}-01`)!;
  const offset = (first.getDay() + 6) % 7;
  const gridStart = addDays(`${month}-01`, -offset);
  const matches = byDate.get(selected) || [];
  const listedEntries = kind === "daily" ? daily : dreams;
  const shiftMonth = (amount: number) => setMonth(localDate(new Date(first.getFullYear(), first.getMonth() + amount, 1, 12)).slice(0, 7));
  const summarySlot = mounted ? document.getElementById("journal-insights-slot") : null;
  const showInsights = ready && settings.enabled && (settings.showMetrics || settings.showHeatmap);
  const selectFromSidebar = (date: string, create: boolean) => {
    if (kind === "dream") { setSelected(date); setMonth(date.slice(0, 7)); if (create) void createDream(date); }
    else void openDate(date, create);
  };
  const openFromPanel = (id: string) => { onClosePanel(); void selectNote(id); };
  const insightProps = { entries: daily, today, showMetrics: settings.showMetrics, showHeatmap: settings.showHeatmap, onDate: (date: string) => { void openDate(date, false); } };
  const navigate = (page: JournalPanel) => window.dispatchEvent(new CustomEvent("journal-navigate", { detail: page }));

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!listedEntries.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const index = listedEntries.findIndex(entry => entry.id === selectedNoteId);
      const nextIndex = event.key === "ArrowDown"
        ? (index >= 0 && index < listedEntries.length - 1 ? index + 1 : 0)
        : (index > 0 ? index - 1 : listedEntries.length - 1);
      const target = listedEntries[nextIndex];
      void selectNote(target.id);
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-entry-id]");
      buttons[nextIndex]?.focus();
      return;
    }
    if ((event.key === "Delete" || event.key === "Backspace") && selectedNoteId) {
      const target = listedEntries.find(entry => entry.id === selectedNoteId);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      setEntryToDelete(target);
    }
  };
  const confirmDeleteEntry = async () => {
    if (!entryToDelete) return;
    try {
      await deleteNote(entryToDelete.id);
      setEntryToDelete(null);
    } catch (error) {
      toast.error(`Could not delete entry: ${String(error)}`);
    }
  };

  return <>
  {ready && settings.enabled && <section data-journal-calendar className="px-3 py-2 text-sm" aria-label="Journal">
    <div className="flex items-center justify-between mb-2"><span className="font-medium text-xs text-text-muted">Calendar</span><button disabled={busy} onClick={() => selectFromSidebar(today, kind === "daily")} className="text-xs px-2 py-0.5 rounded border border-border hover:border-text-muted hover:bg-bg-muted disabled:opacity-50">Today</button></div>
    <div className="journal-periods journal-type-switch mb-2.5" role="group" aria-label="Journal type"><button type="button" className={kind === "daily" ? "active" : ""} aria-pressed={kind === "daily"} onClick={() => setKind("daily")}>Daily</button><button type="button" className={kind === "dream" ? "active" : ""} aria-pressed={kind === "dream"} onClick={() => setKind("dream")}>Dreams</button></div>
    {indexError && <p role="status" className="text-xs text-text-muted mb-1.5">Some entries could not be read.</p>}
    {settings.showCalendar && <div>
      <div className="flex justify-between items-center mb-1.5">
        <button title="Previous month" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="px-2 rounded hover:bg-bg-muted">‹</button>
        <button title="Jump to today" onClick={() => { setSelected(today); setMonth(today.slice(0, 7)); }} className="text-xs font-medium hover:underline">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</button>
        <button title="Next month" aria-label="Next month" onClick={() => shiftMonth(1)} className="px-2 rounded hover:bg-bg-muted">›</button>
      </div>
      <div className="grid grid-cols-7 text-center text-2xs text-text-muted mb-0.5">{dayNames.map(d => <span key={d}>{d.slice(0, 1)}</span>)}</div>
      <div className="grid grid-cols-7 gap-y-0.5">{Array.from({ length: 42 }, (_, i) => {
        const date = addDays(gridStart, i), has = byDate.has(date);
        const isSelected = date === selected;
        return <button key={date} onClick={() => selectFromSidebar(date, false)} aria-label={`${dateLabel(date)}${has ? ", entry available" : ", no entry"}${date === today ? ", today" : ""}`} aria-pressed={isSelected} title={`${dateLabel(date)}${has ? " · Entry" : ""}`} className={`relative h-6 rounded text-xs tabular-nums focus-visible:outline focus-visible:outline-1 ${isSelected ? "bg-text text-text-inverse font-semibold" : "hover:bg-bg-muted"} ${!isSelected && !date.startsWith(month) ? "text-text-muted opacity-45" : ""} ${date === today && !isSelected ? "underline underline-offset-2 font-medium" : ""}`}>
          {Number(date.slice(8))}{has && <span aria-hidden="true" className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-current" />}
        </button>;
      })}</div>
      <div className="mt-2 text-xs text-text-muted">{dateLabel(selected)}{kind === "dream" ? <button disabled={busy} onClick={() => selectFromSidebar(selected, true)} className="ml-2 underline text-text">+ Dream</button> : matches.length === 0 ? <button disabled={busy} onClick={() => selectFromSidebar(selected, true)} className="ml-2 underline text-text">Create</button> : matches.length > 1 ? <span> · {matches.length} entries</span> : null}</div>
      {(kind === "dream" || matches.length > 1) && <div className="mt-1 max-h-14 overflow-y-auto scrollbar-none space-y-0.5">{matches.map(entry => <button key={entry.id} onClick={() => { void selectNote(entry.id); }} className="block w-full truncate text-xs text-left hover:underline">{entry.title || "Untitled dream"}</button>)}{kind === "dream" && matches.length === 0 && <span className="text-xs text-text-muted">No dreams.</span>}</div>}
    </div>}
  </section>}
  {activePanel === "home" && summarySlot && createPortal(<HomeDashboard today={today} daily={daily} dreams={dreams} enabled={ready && settings.enabled} loading={!ready || indexLoading} error={indexError} showMetrics={settings.showMetrics} showHeatmap={settings.showHeatmap} showMemories={settings.showMemories} busy={busy} onToday={() => void openDate(today, true)} onDream={() => void createDream(today)} onDate={date => void openDate(date, false)} onCreateDate={date => void openDate(date, true)} onOpen={openFromPanel} onNavigate={page => navigate(page)} onSettings={onOpenSettings} onDreamJournal={() => { setKind("dream"); setEntriesScope("dream"); navigate("entries"); }} />, summarySlot)}
  {(activePanel === "entries" || activePanel === "dreams") && summarySlot && createPortal(!ready ? <JournalStatusPanel title="Entries" message="Loading your journal…" onClose={onClosePanel} /> : !settings.enabled ? <JournalStatusPanel title="Entries" message="Enable Journal mode to browse your entries." onOpenSettings={onOpenSettings} onClose={onClosePanel} /> : <EntriesPage today={today} daily={daily} dreams={dreams} kind={activePanel === "dreams" ? "dream" : entriesScope} onKindChange={next => { setEntriesScope(next); if (activePanel === "dreams" && next !== "dream") navigate("entries"); }} selectedNoteId={selectedNoteId} notesFolder={notesFolder || ""} loading={indexLoading} busy={busy} error={indexError} onToday={() => void openDate(today, true)} onDream={() => void createDream(today)} onOpen={openFromPanel} onDelete={entry => setEntryToDelete(entry)} onRetry={() => setRevision(v => v + 1)} onKeyDown={handleListKeyDown} />, summarySlot)}
  {activePanel === "search" && summarySlot && createPortal(<SearchPanel onClose={onClosePanel} journalRoot={settings.root} journalEntries={entries} />, summarySlot)}
  {activePanel === "memories" && summarySlot && createPortal(!ready || indexLoading ? <JournalStatusPanel title="On This Day" message="Loading your journal…" onClose={onClosePanel} /> : !settings.enabled || !settings.showMemories ? <JournalStatusPanel title="On This Day" message="On This Day is disabled in Journal settings." onOpenSettings={onOpenSettings} onClose={onClosePanel} /> : <MemoriesPage today={today} daily={daily} dreams={dreams} notesFolder={notesFolder || ""} error={indexError} onOpen={openFromPanel} onBack={() => navigate("home")} onNavigateEntries={() => navigate("entries")} onDream={() => void createDream(today)} />, summarySlot)}
  {activePanel === "insights" && summarySlot && createPortal(!ready || indexLoading ? <JournalStatusPanel title="Insights" message="Loading your journal." onClose={onClosePanel} /> : showInsights ? <div className="journal-insights-page">{indexError && <p role="status" className="text-xs text-text-muted px-6 pt-3">Some entries could not be read. Showing indexed entries.</p>}<InsightsDashboard {...insightProps} dreams={dreams} onDream={() => void createDream(today)} onBack={() => navigate("home")} onOpenEntry={openFromPanel} /></div> : <JournalStatusPanel title="Insights" message={!ready ? "Loading journal settings." : !settings.enabled ? "Enable Journal mode to see your writing insights." : "Insights are hidden in Journal settings."} onOpenSettings={ready ? onOpenSettings : undefined} onClose={onClosePanel} />, summarySlot)}
  <AlertDialog open={!!entryToDelete} onOpenChange={(open) => { if (!open) setEntryToDelete(null); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete entry?</AlertDialogTitle>
        <AlertDialogDescription>
          This will delete &ldquo;{entryToDelete?.title || "Untitled"}&rdquo; permanently.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={() => void confirmDeleteEntry()}>Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  </>;
}

