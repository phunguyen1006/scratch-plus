import { HistoryIcon, HomeIcon, InsightsIcon, NoteIcon, SearchIcon } from "../icons";
import type { JournalPanel } from "../../lib/journalNavigation";

const items: { id: JournalPanel; label: string; icon: typeof HomeIcon }[] = [
  { id: "home", label: "Home", icon: HomeIcon },
  { id: "search", label: "Search", icon: SearchIcon },
  { id: "entries", label: "Entries", icon: NoteIcon },
  { id: "insights", label: "Insights", icon: InsightsIcon },
  { id: "memories", label: "On This Day", icon: HistoryIcon },
];

export function JournalNavigation({ activePanel, onToggle }: { activePanel: JournalPanel | null; onToggle: (panel: JournalPanel) => void }) {
  return <nav className="journal-navigation" data-journal-navigation aria-label="Journal navigation">{items.map(({ id, label, icon: Icon }) => <button
    key={id}
    type="button"
    className={activePanel === id ? "is-active" : ""}
    aria-pressed={activePanel === id}
    aria-controls="journal-insights-slot"
    onClick={() => onToggle(id)}
  ><Icon className="w-4 h-4 shrink-0" /><span>{label}</span></button>)}</nav>;
}
