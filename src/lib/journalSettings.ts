import type { JournalSettings } from "../types/note";

export const defaultJournalSettings: JournalSettings = {
  enabled: false,
  root: "Journal",
  openToday: false,
  showCalendar: true,
  showMetrics: true,
  showMemories: true,
  showHeatmap: true,
};

export function journalSettings(value?: Partial<JournalSettings>): JournalSettings {
  return { ...defaultJournalSettings, ...value };
}
