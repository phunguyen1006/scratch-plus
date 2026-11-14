/** Journal calculations use local calendar dates, never UTC timestamps. */
export interface JournalEntry {
  id: string;
  date: string;
  title: string;
  preview: string;
  words: number;
  kind?: "daily" | "dream";
  lucid?: boolean;
  vividness?: number;
  tags?: string[];
  image?: string;
  images?: string[];
  imageCount?: number;
  modified?: number;
  hasCustomTitle?: boolean;
  searchText?: string;
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseJournalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 100 || year > 9999) return null;
  const result = new Date(year, month - 1, day, 12);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day ? result : null;
}

export function addDays(value: string, days: number): string {
  const date = parseJournalDate(value);
  if (!date) throw new Error("Invalid journal date");
  date.setDate(date.getDate() + days);
  return localDate(date);
}

export function dateFromId(id: string, root: string): string | null {
  if (!id.startsWith(`${root}/`)) return null;
  // Dreams live under the same parent but are a separate collection.
  if (id.startsWith(`${root}/Dreams/`)) return null;
  const leaf = id.slice(id.lastIndexOf("/") + 1);
  return parseJournalDate(leaf) ? leaf : null;
}

export type JournalKind = "daily" | "dream" | "other";

export function entriesForKind(entries: JournalEntry[], kind: "daily" | "dream"): JournalEntry[] {
  return entries.filter(entry => entry.kind === kind).sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

/** A note is a journal entry because of its configured path, never its title. */
export function classifyJournalId(id: string, root: string): JournalKind {
  if (!root || !id.startsWith(`${root}/`)) return "other";
  if (id.startsWith(`${root}/Dreams/`)) return "dream";
  return dateFromId(id, root) ? "daily" : "other";
}

/** Read simple portable frontmatter fields; never change the source on read. */
export function dreamMetadata(markdown: string, id: string) {
  const front = markdown.match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/)?.[1] ?? "";
  const scalar = (key: string) => {
    const raw = front.match(new RegExp(`^${key}:[ \\t]*(.*)$`, "m"))?.[1]?.trim();
    if (!raw) return undefined;
    if (raw.startsWith('"')) { try { return JSON.parse(raw) as string; } catch { return undefined; } }
    if (raw.startsWith("'")) { const quoted = raw.match(/^'((?:[^']|'')*)'(?:[ \t]*#.*)?$/); return quoted?.[1].replace(/''/g, "'"); }
    return raw.replace(/[ \t]+#.*$/, "").trim();
  };
  const filenameDate = id.slice(id.lastIndexOf("/") + 1).match(/^(\d{4}-\d{2}-\d{2})(?:_|$)/)?.[1];
  const specified = scalar("dream_date");
  const date = specified && parseJournalDate(specified) ? specified : filenameDate && parseJournalDate(filenameDate) ? filenameDate : null;
  const lucidValue = scalar("lucid");
  const vividnessValue = scalar("vividness");
  const vividness = vividnessValue && /^[1-5]$/.test(vividnessValue) ? Number(vividnessValue) : undefined;
  let tags: string[] = [];
  const inlineTags = scalar("tags");
  if (inlineTags?.startsWith("[")) { try { const value: unknown = JSON.parse(inlineTags); if (Array.isArray(value)) tags = value.filter((tag): tag is string => typeof tag === "string"); } catch { /* Existing YAML remains untouched. */ } }
  else {
    const block = front.match(/^tags:[ \t]*\r?\n((?:[ \t]+-[^\n]*(?:\r?\n|$))+)/m)?.[1];
    if (block) tags = block.split(/\r?\n/).map(line => line.replace(/^\s*-\s*/, "").trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  return { date, lucid: lucidValue === "true" ? true : lucidValue === "false" ? false : undefined, vividness, tags, emotions: scalar("emotions") || "" };
}

/** Update one supported YAML field without rewriting unrelated metadata. */
export function updateDreamFrontmatter(source: string, key: "dream_date" | "tags" | "emotions" | "lucid" | "vividness", value: string | null): string {
  const lines = source.split("\n");
  const matches = lines.flatMap((line, index) => new RegExp(`^${key}:[ \\t]*(.*)$`).test(line) ? [index] : []);
  if (matches.length > 1) throw new Error(`Duplicate ${key} fields; edit this metadata in Markdown source mode.`);
  if (!matches.length) return value === null ? source : [...lines.filter((line, index) => !(lines.length === 1 && index === 0 && !line)), `${key}: ${value}`].join("\n");
  const index = matches[0];
  const existing = lines[index].slice(lines[index].indexOf(":") + 1).trim();
  if (/^[|>]/.test(existing)) throw new Error(`Complex ${key} metadata must be edited in Markdown source mode.`);
  let end = index + 1;
  while (end < lines.length && /^\s+\S/.test(lines[end])) {
    if (key !== "tags" || !/^\s+-\s+/.test(lines[end])) throw new Error(`Complex ${key} metadata must be edited in Markdown source mode.`);
    end++;
  }
  lines.splice(index, end - index, ...(value === null ? [] : [`${key}: ${value}`]));
  return lines.join("\n");
}

export function markdownText(markdown: string, date?: string): string {
  let text = markdown.replace(/^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
  if (date) text = text.replace(new RegExp(`^\\s*#\\s*${date}\\s*(?:\\r?\\n|$)`), "");
  return text
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^\s*(```|~~~).*$/gm, " ")
    .replace(/[`*_~#>|\[\](){}]/g, " ")
    .replace(/^\s*(?:[-+]\s+|\d+[.)]\s+|[-]{3,}\s*$)/gm, " ")
    .replace(/\s+/g, " ").trim();
}

export function wordCount(markdown: string, date?: string): number {
  const text = markdownText(markdown, date);
  if (!text) return 0;
  // Unicode letters/marks preserve Vietnamese accents and exclude punctuation and dates.
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{N}\p{M}]*)*/gu) || []).length;
}

export function streaks(entries: JournalEntry[], today = localDate()): { current: number; longest: number } {
  const dates = [...new Set(entries.filter(e => e.words > 0 && e.date <= today).map(e => e.date))].sort();
  const set = new Set(dates);
  let current = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) { current++; cursor = addDays(cursor, -1); }
  let longest = 0, run = 0, previous = "";
  for (const date of dates) {
    run = previous && addDays(previous, 1) === date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }
  return { current, longest };
}

export type Period = "week" | "month" | "year" | "all";
export function periodBounds(period: Period, today = localDate(), previous = false): [string, string] {
  const date = parseJournalDate(today);
  if (!date) throw new Error("Invalid journal date");
  if (period === "all") return ["0000-01-01", "9999-12-31"];
  if (period === "week") {
    const monday = addDays(today, -((date.getDay() + 6) % 7) - (previous ? 7 : 0));
    return [monday, addDays(monday, 6)];
  }
  if (period === "month") {
    const start = new Date(date.getFullYear(), date.getMonth() - (previous ? 1 : 0), 1, 12);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 12);
    return [localDate(start), localDate(end)];
  }
  const year = date.getFullYear() - (previous ? 1 : 0);
  return [`${year}-01-01`, `${year}-12-31`];
}

export function periodMetrics(entries: JournalEntry[], period: Period, today = localDate()) {
  const [start, end] = periodBounds(period, today);
  const selected = entries.filter(e => e.date >= start && e.date <= end && e.date <= today);
  const words = selected.reduce((sum, e) => sum + e.words, 0);
  const [beforeStart, beforeEnd] = periodBounds(period, today, true);
  const previousWords = period === "all" ? 0 : entries.filter(e => e.date >= beforeStart && e.date <= beforeEnd).reduce((sum, e) => sum + e.words, 0);
  return { entries: selected.length, words, average: selected.length ? Math.round(words / selected.length) : 0, previousWords, comparison: previousWords ? Math.round((words - previousWords) / previousWords * 100) : null };
}

export interface OnThisDayYearGroup {
  year: number;
  yearsAgo: number;
  entries: JournalEntry[];
}

export interface OnThisDayYearPresenceItem {
  year: number;
  yearsAgo: number;
  count: number;
  hasMemory: boolean;
}

export function onThisDay(entries: JournalEntry[], today = localDate()): JournalEntry[] {
  // Feb 29 is shown only on Feb 29; Feb 28 and March 1 are separate days.
  if (!parseJournalDate(today)) return [];
  const monthDay = today.slice(5);
  const seen = new Set<string>();
  return entries
    .filter((entry) => {
      if (!parseJournalDate(entry.date)) return false;
      if (entry.date >= today || entry.date.slice(5) !== monthDay) return false;
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function groupOnThisDayByYear(
  matchedEntries: JournalEntry[],
  referenceDate = localDate(),
  sortOrder: "newest" | "oldest" = "newest",
): OnThisDayYearGroup[] {
  if (!parseJournalDate(referenceDate) || !matchedEntries.length) return [];
  const refYear = Number(referenceDate.slice(0, 4));
  const buckets = new Map<number, JournalEntry[]>();
  for (const entry of matchedEntries) {
    if (!parseJournalDate(entry.date)) continue;
    const year = Number(entry.date.slice(0, 4));
    if (!Number.isFinite(year) || year >= refYear) continue;
    const list = buckets.get(year) || [];
    list.push(entry);
    buckets.set(year, list);
  }
  const years = [...buckets.keys()].sort((a, b) => (sortOrder === "newest" ? b - a : a - b));
  return years.map((year) => ({
    year,
    yearsAgo: refYear - year,
    entries: [...(buckets.get(year) || [])].sort((a, b) =>
      (sortOrder === "newest" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.id.localeCompare(b.id),
    ),
  }));
}

export function onThisDayYearPresence(
  sourceEntries: JournalEntry[],
  matchedEntries: JournalEntry[],
  referenceDate = localDate(),
): OnThisDayYearPresenceItem[] {
  if (!parseJournalDate(referenceDate)) return [];
  const refYear = Number(referenceDate.slice(0, 4));
  const counts = new Map<number, number>();
  let earliestYear = Infinity;

  for (const entry of sourceEntries) {
    if (!parseJournalDate(entry.date)) continue;
    const year = Number(entry.date.slice(0, 4));
    if (year < refYear && year < earliestYear) earliestYear = year;
  }

  for (const entry of matchedEntries) {
    if (!parseJournalDate(entry.date)) continue;
    const year = Number(entry.date.slice(0, 4));
    if (year >= refYear) continue;
    if (year < earliestYear) earliestYear = year;
    counts.set(year, (counts.get(year) || 0) + 1);
  }

  if (!Number.isFinite(earliestYear) || earliestYear >= refYear) return [];
  const items: OnThisDayYearPresenceItem[] = [];
  for (let year = refYear - 1; year >= earliestYear; year--) {
    const count = counts.get(year) || 0;
    items.push({
      year,
      yearsAgo: refYear - year,
      count,
      hasMemory: count > 0,
    });
  }
  return items;
}

export function dailyTotals(entries: JournalEntry[]): Map<string, { count: number; words: number }> {
  const totals = new Map<string, { count: number; words: number }>();
  for (const entry of entries) {
    const current = totals.get(entry.date) || { count: 0, words: 0 };
    totals.set(entry.date, { count: current.count + 1, words: current.words + entry.words });
  }
  return totals;
}

const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|bmp|avif|heic|ico|tiff?)(?:[?#]|$)/i;
const IMAGE_FOLDER_RE = /^(?:\.{1,2}\/)*(?:assets|pictures|attachments|photos)\//i;
const BOILERPLATE_HEADING_RE = /^(?:pictures|photos|images|attachments|gallery|quick\s+notes|daily\s+notes|notes|journal|entry|q\s*&\s*a|questions(?:\s*&\s*answers)?|ratings?|daily\s+rating|score|mood|tags|metadata|properties|links|backlinks|highlights|grateful|gratitude|daily\s+review|reflection|summary|tasks|to-?do|habits)$/i;
const INLINE_BOILERPLATE_RE = /(?:^|\s)(?:📁\s*Pictures|🖼️?\s*Pictures|⚡\s*Quick\s+Notes|📝\s*Notes|💬\s*Q&A|⭐\s*Ratings?)(?=\s|$|[·•:])/giu;
const LEADING_SYMBOL_RE = /^[\p{Emoji}\p{Emoji_Presentation}\p{So}\uFE0F\u200D#:*`>\-\s•·]+/gu;

function stripFrontmatterAndCode(markdown: string): string {
  return markdown
    .replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "")
    .replace(/^\s*(```|~~~)[\s\S]*?^\s*\1\s*$/gm, "\n");
}

/** Extract unique image sources in appearance order across Markdown, HTML, and Obsidian embeds. */
export function extractImagesFromMarkdown(markdown: string): string[] {
  const body = stripFrontmatterAndCode(markdown);
  const found: { index: number; src: string }[] = [];

  for (const match of body.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
    const src = (match[1] || match[2] || "").trim();
    if (src) found.push({ index: match.index ?? 0, src });
  }

  for (const match of body.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    const src = (match[1] || "").trim();
    if (src) found.push({ index: match.index ?? 0, src });
  }

  for (const match of body.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) {
    const target = (match[1] || "").trim();
    if (target && (IMAGE_EXT_RE.test(target) || IMAGE_FOLDER_RE.test(target))) {
      found.push({ index: match.index ?? 0, src: target });
    }
  }

  found.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const item of found) {
    if (!seen.has(item.src)) {
      seen.add(item.src);
      ordered.push(item.src);
    }
  }
  return ordered;
}

export function firstImageFromMarkdown(markdown: string): string | null {
  return extractImagesFromMarkdown(markdown)[0] ?? null;
}

/** Detect template/date/boilerplate headings that should not act as user-authored card titles or excerpts. */
export function isBoilerplateJournalHeading(text: string, date?: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^!\[/.test(trimmed) || /^!\[\[/.test(trimmed)) return true;
  if (/^[\p{L}\p{N}_\s-]+::/u.test(trimmed)) return true;

  const cleaned = trimmed
    .replace(LEADING_SYMBOL_RE, "")
    .replace(/[:\s•·]+$/g, "")
    .trim();

  if (!cleaned) return true;
  const lower = cleaned.toLowerCase();
  if (lower === "untitled" || lower === "untitled dream") return true;
  if (date && (cleaned === date || trimmed.replace(/^#+\s*/, "").trim() === date)) return true;
  return BOILERPLATE_HEADING_RE.test(cleaned);
}

/** Sanitize an already-extracted preview string for display inside Gallery cards. */
export function sanitizeEntryPreview(preview: string, date?: string, title?: string): string {
  let text = preview
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/file:\/\/\S+/g, " ")
    .replace(/obsidian:\/\/\S+/g, " ")
    .replace(INLINE_BOILERPLATE_RE, " ")
    .replace(/[`*_~#>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (date && text.startsWith(date)) {
    text = text.slice(date.length).replace(/^[\s·•:\-]+/, "").trim();
  }
  if (title && title.trim() && text.toLowerCase().startsWith(title.trim().toLowerCase())) {
    text = text.slice(title.trim().length);
  }
  return text.replace(/^[\s·•:\-]+/, "").trim();
}

/** Extract clean, human-readable excerpt text from raw Markdown without mutating the source file. */
export function cleanJournalExcerpt(markdown: string, date?: string, customTitle?: string): string {
  const body = stripFrontmatterAndCode(markdown)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/%%[\s\S]*?%%/g, " ");

  const cleanLines: string[] = [];
  const normalizedTitle = customTitle?.trim().toLowerCase() || "";

  for (const rawLine of body.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;

    // Skip horizontal rules, table delimiters, empty Dataview fields, and empty list/task markers.
    if (/^[-*_]{3,}$/.test(line)) continue;
    if (/^\|?[\s:|-]+\|[\s:|-]*$/.test(line)) continue;
    if (/^[\p{L}\p{N}_\s-]+::\s*$/u.test(line)) continue;
    if (/^(?:[-*+]|\d+[.)])\s*(?:\[[ xX]\]\s*)?$/.test(line)) continue;

    // Strip embeds, images, HTML tags, links, and bare URLs.
    line = line
      .replace(/!\[\[[^\]]*\]\]/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/<img\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/file:\/\/\S+/g, " ")
      .replace(/obsidian:\/\/\S+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!line) continue;

    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      const headingText = headingMatch[1].trim();
      if (isBoilerplateJournalHeading(headingText, date)) continue;
      if (normalizedTitle && headingText.toLowerCase() === normalizedTitle) continue;
      line = headingText;
    } else if (isBoilerplateJournalHeading(line, date)) {
      continue;
    } else if (normalizedTitle && line.toLowerCase() === normalizedTitle) {
      continue;
    }

    line = line
      .replace(/^>\s?/, "")
      .replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/, "")
      .replace(/[`*_~|]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (line && !isBoilerplateJournalHeading(line, date)) {
      cleanLines.push(line);
    }
  }

  return sanitizeEntryPreview(cleanLines.join(" "), date, customTitle);
}
