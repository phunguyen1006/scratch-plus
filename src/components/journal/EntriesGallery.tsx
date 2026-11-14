import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import * as notesService from "../../services/notes";
import {
  dreamMetadata,
  extractImagesFromMarkdown,
  isBoilerplateJournalHeading,
  parseJournalDate,
  sanitizeEntryPreview,
  type JournalEntry,
} from "../../lib/journal";
import { resolveNoteImageToAssetRelPath } from "../../lib/attachments";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ImageIcon,
  MoreVerticalIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "../icons";

function MoonLineIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SparkLineIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
    </svg>
  );
}

export type EntriesScope = "all" | "daily" | "dream";
export type MediaFilter = "all" | "photos" | "text";
export type EntriesSort = "newest" | "oldest" | "longest";
export type EntriesView = "gallery" | "compact";

interface EntriesSessionState {
  scope: EntriesScope;
  searchQuery: string;
  mediaFilter: MediaFilter;
  yearFilter: string;
  monthFilter: string;
  dateFilter: string;
  sortOrder: EntriesSort;
  viewMode: EntriesView;
  collapsedMonths: Record<string, boolean>;
  scrollTop: number;
  visibleLimit: number;
}

const INITIAL_BATCH_SIZE = 80;

const entriesSessionState: EntriesSessionState = {
  scope: "all",
  searchQuery: "",
  mediaFilter: "all",
  yearFilter: "all",
  monthFilter: "all",
  dateFilter: "",
  sortOrder: "newest",
  viewMode: "gallery",
  collapsedMonths: {},
  scrollTop: 0,
  visibleLimit: INITIAL_BATCH_SIZE,
};

const formatCount = (n: number) => n.toLocaleString();

const formatCardDateEyebrow = (date: string, todayYear: string): string => {
  const parsed = parseJournalDate(date);
  if (!parsed) return "UNDATED";
  const sameYear = date.slice(0, 4) === todayYear;
  const formatted = parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return formatted.toUpperCase();
};

const formatFullDate = (date: string): string => {
  const parsed = parseJournalDate(date);
  if (!parsed) return "Undated entry";
  return parsed.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const formatDisplayTitle = (entry: JournalEntry): string => {
  const rawTitle = entry.title?.trim() || "";
  if (
    rawTitle &&
    entry.hasCustomTitle !== false &&
    rawTitle !== entry.date &&
    !isBoilerplateJournalHeading(rawTitle, entry.date)
  ) {
    return rawTitle;
  }
  const parsed = parseJournalDate(entry.date);
  if (entry.kind === "dream") {
    return parsed
      ? `Dream · ${parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
      : "Dream entry";
  }
  if (parsed) {
    return parsed.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  return "Daily entry";
};

const formatMonthHeading = (monthKey: string): string => {
  if (monthKey === "undated") return "Undated";
  const parsed = parseJournalDate(`${monthKey}-01`);
  if (!parsed) return monthKey;
  return parsed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

const formatModifiedTimestamp = (modified?: number): string | null => {
  if (!modified || !Number.isFinite(modified)) return null;
  const ms = modified > 1e12 ? modified : modified * 1000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

function toTauriOrLocalUrl(notesFolder: string | undefined, relPath: string): string {
  const cleanRel = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!notesFolder) return cleanRel;
  const cleanFolder = notesFolder.replace(/[\\/]+$/, "");
  const fullPath = `${cleanFolder}/${cleanRel}`;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    return convertFileSrc(fullPath);
  }
  return fullPath;
}

export function resolveEntryImageCandidates(
  notesFolder: string | undefined,
  noteId: string,
  rawSrc?: string,
): string[] {
  if (!rawSrc) return [];
  const trimmed = rawSrc.trim();
  if (!trimmed) return [];
  if (/^(https?:|data:|blob:|asset:|tauri:)/i.test(trimmed)) {
    return [trimmed];
  }

  const normalized = trimmed.replace(/\\/g, "/").replace(/^[./]+/, "").replace(/^\/+/, "");
  const resolvedRel = resolveNoteImageToAssetRelPath(noteId, trimmed);
  const candidates = new Set<string>();
  if (resolvedRel) candidates.add(resolvedRel);
  if (normalized) candidates.add(normalized);
  const basename = normalized.split("/").pop();
  if (basename) {
    candidates.add(`assets/${basename}`);
    candidates.add(`Pictures/${basename}`);
    candidates.add(`Attachments/${basename}`);
  }
  return [...candidates].map((rel) => toTauriOrLocalUrl(notesFolder, rel));
}

function entryImages(entry: JournalEntry): string[] {
  if (entry.images && entry.images.length > 0) return entry.images;
  return entry.image ? [entry.image] : [];
}

function EntryCardImage({
  candidates,
  className,
  alt = "",
  onClick,
}: {
  candidates: string[];
  className: string;
  alt?: string;
  onClick?: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const key = candidates.join("|");

  useEffect(() => {
    setAttempt(0);
    setLoaded(false);
  }, [key]);

  if (!candidates.length || attempt >= candidates.length) {
    return (
      <div className="journal-entry-card-media-fallback" aria-label="Photo unavailable">
        <ImageIcon className="w-5 h-5 text-text-muted" />
        <span>Photo unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={candidates[attempt]}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => {
        setLoaded(false);
        setAttempt((prev) => prev + 1);
      }}
      onClick={onClick}
      className={`${className} ${loaded ? "is-loaded" : ""}`}
    />
  );
}

interface EntryCardProps {
  entry: JournalEntry;
  todayYear: string;
  notesFolder?: string;
  selected: boolean;
  previewOpen: boolean;
  viewMode: EntriesView;
  menuOpen: boolean;
  onToggleMenu: (id: string | null) => void;
  onQuickPreview: (entry: JournalEntry, trigger: HTMLElement | null) => void;
  onOpenEditor: (id: string) => void;
  onDelete?: (entry: JournalEntry) => void;
}

const EntryCard = memo(function EntryCard({
  entry,
  todayYear,
  notesFolder,
  selected,
  previewOpen,
  viewMode,
  menuOpen,
  onToggleMenu,
  onQuickPreview,
  onOpenEditor,
  onDelete,
}: EntryCardProps) {
  const images = useMemo(() => entryImages(entry), [entry]);
  const photoCount = entry.imageCount ?? images.length;
  const coverCandidates = useMemo(
    () => (images[0] ? resolveEntryImageCandidates(notesFolder, entry.id, images[0]) : []),
    [notesFolder, entry.id, images],
  );
  const hasPhoto = coverCandidates.length > 0;
  const dateEyebrow = formatCardDateEyebrow(entry.date, todayYear);
  const displayTitle = formatDisplayTitle(entry);
  const cleanExcerpt = useMemo(
    () => sanitizeEntryPreview(entry.preview || "", entry.date, entry.title),
    [entry.preview, entry.date, entry.title],
  );
  const isDream = entry.kind === "dream";
  const kindLabel = isDream ? "Dream" : "Daily";
  const activeState = selected || previewOpen;

  if (viewMode === "compact") {
    return (
      <article
        className={`journal-entry-compact ${activeState ? "is-selected" : ""}`}
        data-entry-id={entry.id}
      >
        <button
          type="button"
          className="journal-entry-compact-main"
          aria-pressed={previewOpen}
          aria-label={`${dateEyebrow}, ${kindLabel}, ${displayTitle}`}
          onClick={(e) => onQuickPreview(entry, e.currentTarget)}
          onDoubleClick={() => onOpenEditor(entry.id)}
        >
          {hasPhoto && (
            <div className="journal-entry-compact-thumb">
              <EntryCardImage candidates={coverCandidates} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="journal-entry-compact-body">
            <div className="journal-entry-compact-top">
              <span className="journal-entry-date">{dateEyebrow}</span>
              <span className="journal-entry-badge">{kindLabel}</span>
              {photoCount > 0 && (
                <span className="journal-entry-meta-inline">
                  <ImageIcon className="w-3 h-3" /> {photoCount}
                </span>
              )}
              {entry.words > 0 && (
                <span className="journal-entry-meta-inline">{formatCount(entry.words)} w</span>
              )}
            </div>
            <strong className="journal-entry-title">{displayTitle}</strong>
            <p className="journal-entry-excerpt">
              {cleanExcerpt || <span className="italic opacity-70">No text yet</span>}
            </p>
          </div>
        </button>
        <div className="journal-entry-actions" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label={`Actions for ${displayTitle}`}
            aria-expanded={menuOpen}
            className="journal-entry-menu-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(menuOpen ? null : entry.id);
            }}
          >
            <MoreVerticalIcon className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="journal-entry-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleMenu(null);
                  onQuickPreview(entry, null);
                }}
              >
                Quick preview
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onToggleMenu(null);
                  onOpenEditor(entry.id);
                }}
              >
                Open in editor
              </button>
              {onDelete && (
                <button
                  type="button"
                  role="menuitem"
                  className="is-danger"
                  onClick={() => {
                    onToggleMenu(null);
                    onDelete(entry);
                  }}
                >
                  Delete entry
                </button>
              )}
            </div>
          )}
        </div>
      </article>
    );
  }

  return (
    <article
      className={`journal-entry-card ${hasPhoto ? "journal-entry-card--photo" : "journal-entry-card--text"} ${activeState ? "is-selected" : ""}`}
      data-entry-id={entry.id}
    >
      <button
        type="button"
        className="journal-entry-card-trigger"
        data-card-trigger={entry.id}
        aria-pressed={previewOpen}
        aria-label={`${dateEyebrow}, ${kindLabel}, ${displayTitle}`}
        onClick={(e) => onQuickPreview(entry, e.currentTarget)}
        onDoubleClick={() => onOpenEditor(entry.id)}
      >
        {hasPhoto && (
          <div className="journal-entry-card-media">
            <EntryCardImage
              candidates={coverCandidates}
              className="journal-entry-card-img"
            />
            {photoCount > 1 && (
              <span className="journal-entry-photo-badge" aria-label={`${photoCount} photos`}>
                +{photoCount - 1}
              </span>
            )}
          </div>
        )}
        <div className="journal-entry-card-body">
          <div className="journal-entry-card-head">
            <span className="journal-entry-date">{dateEyebrow}</span>
          </div>
          <h3 className="journal-entry-title" title={displayTitle}>
            {displayTitle}
          </h3>
          <p
            className={`journal-entry-excerpt ${hasPhoto ? "line-clamp-3" : "line-clamp-5"}`}
          >
            {cleanExcerpt || <span className="italic opacity-70">No text yet</span>}
          </p>
          <div className="journal-entry-card-footer">
            <span className={isDream ? "journal-entry-badge" : "journal-entry-kind"}>
              {isDream && <MoonLineIcon className="w-3 h-3" />}
              {kindLabel}
            </span>
            {isDream && entry.lucid && (
              <span className="journal-entry-badge is-subtle">
                <SparkLineIcon className="w-3 h-3" /> Lucid
              </span>
            )}
            <span className="journal-entry-card-meta-right">
              {photoCount > 0 && (
                <span className="journal-entry-meta-inline" title={`${photoCount} photos`}>
                  <ImageIcon className="w-3 h-3" />
                  {photoCount}
                </span>
              )}
              {entry.words > 0 && (
                <span className="journal-entry-meta-inline">
                  {formatCount(entry.words)}w
                </span>
              )}
            </span>
          </div>
        </div>
      </button>
      <div className="journal-entry-actions" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label={`Actions for ${displayTitle}`}
          aria-expanded={menuOpen}
          className="journal-entry-menu-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMenu(menuOpen ? null : entry.id);
          }}
        >
          <MoreVerticalIcon className="w-4 h-4" />
        </button>
        {menuOpen && (
          <div className="journal-entry-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleMenu(null);
                onQuickPreview(entry, null);
              }}
            >
              Quick preview
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleMenu(null);
                onOpenEditor(entry.id);
              }}
            >
              Open in editor
            </button>
            {onDelete && (
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => {
                  onToggleMenu(null);
                  onDelete(entry);
                }}
              >
                Delete entry
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
});

interface MarkdownBlockProps {
  markdown: string;
  date: string;
  notesFolder?: string;
  noteId: string;
  onOpenLightbox: (candidates: string[]) => void;
}

function renderInlineNodes(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const wikiMatch = remaining.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);

    const candidates = [
      wikiMatch ? { type: "wiki", match: wikiMatch } : null,
      linkMatch ? { type: "link", match: linkMatch } : null,
      codeMatch ? { type: "code", match: codeMatch } : null,
      boldMatch ? { type: "bold", match: boldMatch } : null,
    ].filter((item): item is NonNullable<typeof item> => item !== null && item.match.index !== undefined);

    if (!candidates.length) {
      parts.push(remaining);
      break;
    }

    candidates.sort((a, b) => (a.match.index ?? 0) - (b.match.index ?? 0));
    const earliest = candidates[0];
    const index = earliest.match.index ?? 0;

    if (index > 0) {
      parts.push(remaining.slice(0, index));
    }

    const full = earliest.match[0];
    if (earliest.type === "wiki") {
      parts.push(
        <span key={key++} className="underline decoration-dotted underline-offset-2">
          {earliest.match[2] || earliest.match[1]}
        </span>,
      );
    } else if (earliest.type === "link") {
      const href = earliest.match[2];
      const safe = /^https?:\/\//i.test(href);
      parts.push(
        safe ? (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:opacity-75"
          >
            {earliest.match[1]}
          </a>
        ) : (
          <span key={key++} className="underline underline-offset-2">
            {earliest.match[1]}
          </span>
        ),
      );
    } else if (earliest.type === "code") {
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-bg-muted font-mono text-[12px]">
          {earliest.match[1]}
        </code>,
      );
    } else if (earliest.type === "bold") {
      parts.push(<strong key={key++}>{earliest.match[1]}</strong>);
    }

    remaining = remaining.slice(index + full.length);
  }

  return parts;
}

function PreviewRichContent({
  markdown,
  date,
  notesFolder,
  noteId,
  onOpenLightbox,
}: MarkdownBlockProps) {
  const body = useMemo(
    () =>
      markdown
        .replace(/^\uFEFF?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "")
        .trim(),
    [markdown],
  );

  const lines = body.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^\s*(```|~~~)/.test(line)) {
      if (inCode) {
        blocks.push(
          <pre key={key++} className="journal-preview-code">
            <code>{codeLines.join("\n")}</code>
          </pre>,
        );
        codeLines = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    if (!trimmed) continue;

    // Skip top duplicate date title.
    if (i < 2 && trimmed === `# ${date}`) continue;

    // Standalone image or multiple images on the line.
    const imgs = extractImagesFromMarkdown(trimmed);
    const withoutImages = trimmed
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/!\[\[[^\]]*\]\]/g, "")
      .replace(/<img\b[^>]*>/gi, "")
      .trim();

    if (imgs.length > 0 && !withoutImages) {
      for (const src of imgs) {
        const candidates = resolveEntryImageCandidates(notesFolder, noteId, src);
        blocks.push(
          <button
            key={key++}
            type="button"
            className="journal-preview-photo-btn"
            aria-label="Inspect photo"
            onClick={() => onOpenLightbox(candidates)}
          >
            <EntryCardImage candidates={candidates} className="journal-preview-photo" />
          </button>,
        );
      }
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push(<hr key={key++} className="border-border my-3" />);
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1
          ? "text-lg font-semibold mt-4 mb-1.5"
          : level === 2
            ? "text-base font-semibold mt-4 mb-1"
            : "text-sm font-semibold mt-3 mb-1";
      blocks.push(
        <div key={key++} className={cls}>
          {renderInlineNodes(heading[2])}
        </div>,
      );
      continue;
    }

    const task = trimmed.match(/^[-*+]\s+\[([ xX])\]\s*(.*)$/);
    if (task) {
      const checked = task[1].toLowerCase() === "x";
      blocks.push(
        <div key={key++} className="journal-preview-task">
          <span aria-hidden="true" className={`journal-preview-checkbox ${checked ? "is-checked" : ""}`}>
            {checked ? "✓" : ""}
          </span>
          <span className={checked ? "line-through text-text-muted" : ""}>
            {renderInlineNodes(task[2])}
          </span>
        </div>,
      );
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push(
        <blockquote key={key++} className="journal-preview-quote">
          {renderInlineNodes(quote[1])}
        </blockquote>,
      );
      continue;
    }

    const bullet = trimmed.match(/^(?:[-*+]|(\d+)[.)])\s+(.+)$/);
    if (bullet) {
      blocks.push(
        <div key={key++} className="journal-preview-list-item">
          <span aria-hidden="true" className="text-text-muted">
            {bullet[1] ? `${bullet[1]}.` : "•"}
          </span>
          <span>{renderInlineNodes(bullet[2])}</span>
        </div>,
      );
      continue;
    }

    blocks.push(
      <p key={key++} className="journal-preview-paragraph">
        {renderInlineNodes(trimmed)}
      </p>,
    );

    for (const src of imgs) {
      const candidates = resolveEntryImageCandidates(notesFolder, noteId, src);
      blocks.push(
        <button
          key={key++}
          type="button"
          className="journal-preview-photo-btn"
          aria-label="Inspect photo"
          onClick={() => onOpenLightbox(candidates)}
        >
          <EntryCardImage candidates={candidates} className="journal-preview-photo" />
        </button>,
      );
    }
  }

  if (inCode && codeLines.length) {
    blocks.push(
      <pre key={key++} className="journal-preview-code">
        <code>{codeLines.join("\n")}</code>
      </pre>,
    );
  }

  return blocks.length ? (
    <div className="journal-preview-prose">{blocks}</div>
  ) : (
    <p className="journal-home-empty">This entry has no written text yet.</p>
  );
}

function EntryPreviewDrawer({
  entry,
  notesFolder,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onOpenEditor,
  onDelete,
}: {
  entry: JournalEntry;
  notesFolder?: string;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onOpenEditor: (id: string) => void;
  onDelete?: (entry: JournalEntry) => void;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [modified, setModified] = useState<number | undefined>(entry.modified);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [lightboxCandidates, setLightboxCandidates] = useState<string[] | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const openBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadFailed(false);
    setContent(null);
    notesService
      .readNote(entry.id)
      .then((note) => {
        if (cancelled) return;
        setContent(note.content);
        setModified(note.modified || entry.modified);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadFailed(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entry.id, entry.modified]);

  useEffect(() => {
    openBtnRef.current?.focus();
  }, [entry.id]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (lightboxCandidates) {
        setLightboxCandidates(null);
      } else {
        onClose();
      }
      return;
    }
    if (isInput || lightboxCandidates) return;
    if (event.key === "ArrowLeft" && hasPrev) {
      event.preventDefault();
      event.stopPropagation();
      onPrev();
    } else if (event.key === "ArrowRight" && hasNext) {
      event.preventDefault();
      event.stopPropagation();
      onNext();
    } else if (event.key === "Enter" && target === drawerRef.current) {
      event.preventDefault();
      event.stopPropagation();
      onOpenEditor(entry.id);
    }
  };

  const dreamMeta = useMemo(
    () => (entry.kind === "dream" && content ? dreamMetadata(content, entry.id) : null),
    [entry.kind, entry.id, content],
  );
  const images = useMemo(() => {
    if (content) {
      const extracted = extractImagesFromMarkdown(content);
      if (extracted.length > 0) return extracted;
    }
    return entryImages(entry);
  }, [content, entry]);
  const displayTitle = formatDisplayTitle(entry);
  const modifiedLabel = formatModifiedTimestamp(modified);
  const tags = dreamMeta?.tags?.length ? dreamMeta.tags : entry.tags || [];

  return (
    <>
      <div
        className="journal-preview-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className="journal-preview-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${displayTitle}`}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="journal-preview-header">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-text-muted font-semibold">
              <span>{entry.kind === "dream" ? "Dream journal" : "Daily journal"}</span>
              <span>·</span>
              <span>{formatFullDate(entry.date)}</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight mt-1.5 break-words">
              {displayTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick preview"
            className="journal-icon-button shrink-0"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </header>

        <div className="journal-preview-meta-row">
          <span>
            {formatCount(entry.words)} {entry.words === 1 ? "word" : "words"}
          </span>
          {images.length > 0 && (
            <span>
              · {images.length} {images.length === 1 ? "photo" : "photos"}
            </span>
          )}
          {modifiedLabel && <span>· Updated {modifiedLabel}</span>}
        </div>

        {(tags.length > 0 || typeof entry.vividness === "number" || typeof entry.lucid === "boolean") && (
          <div className="journal-preview-dream-meta">
            {typeof entry.lucid === "boolean" && (
              <span className="journal-tag-pill">
                {entry.lucid ? "Lucid dream" : "Non-lucid"}
              </span>
            )}
            {typeof entry.vividness === "number" && (
              <span className="journal-tag-pill">Vividness {entry.vividness}/5</span>
            )}
            {tags.map((tag) => (
              <span key={tag} className="journal-tag-pill">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <div className="journal-preview-content">
          {loading ? (
            <div className="space-y-2.5 py-2" aria-busy="true">
              <div className="journal-skeleton-line w-4/5" />
              <div className="journal-skeleton-line w-full" />
              <div className="journal-skeleton-line w-3/4" />
            </div>
          ) : loadFailed || content === null ? (
            <div className="space-y-4">
              {entry.preview ? (
                <p className="journal-preview-paragraph">{entry.preview}</p>
              ) : (
                <p className="journal-home-empty">
                  Preview unavailable for this file, but you can still open it in the editor.
                </p>
              )}
              {images.map((src) => {
                const candidates = resolveEntryImageCandidates(notesFolder, entry.id, src);
                return (
                  <button
                    key={src}
                    type="button"
                    className="journal-preview-photo-btn"
                    onClick={() => setLightboxCandidates(candidates)}
                  >
                    <EntryCardImage candidates={candidates} className="journal-preview-photo" />
                  </button>
                );
              })}
            </div>
          ) : (
            <PreviewRichContent
              markdown={content}
              date={entry.date}
              notesFolder={notesFolder}
              noteId={entry.id}
              onOpenLightbox={setLightboxCandidates}
            />
          )}
        </div>

        <footer className="journal-preview-footer">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!hasPrev}
              onClick={onPrev}
              className="journal-home-secondary !min-h-8 !px-2.5 disabled:opacity-40"
              aria-label="Previous entry"
            >
              ← Prev
            </button>
            <button
              type="button"
              disabled={!hasNext}
              onClick={onNext}
              className="journal-home-secondary !min-h-8 !px-2.5 disabled:opacity-40"
              aria-label="Next entry"
            >
              Next →
            </button>
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(entry)}
                className="journal-home-secondary !min-h-8 !px-3 text-text-muted hover:text-text"
              >
                Delete
              </button>
            )}
            <button
              ref={openBtnRef}
              type="button"
              onClick={() => onOpenEditor(entry.id)}
              className="journal-home-primary !min-h-8 !px-3.5"
            >
              Open / Edit
            </button>
          </div>
        </footer>
      </aside>

      {lightboxCandidates && (
        <div
          className="journal-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Image lightbox"
          onClick={() => setLightboxCandidates(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setLightboxCandidates(null);
            }
          }}
        >
          <button
            type="button"
            className="journal-lightbox-close"
            aria-label="Close image"
            onClick={() => setLightboxCandidates(null)}
          >
            <XIcon className="w-5 h-5" />
          </button>
          <div className="journal-lightbox-frame" onClick={(e) => e.stopPropagation()}>
            <EntryCardImage candidates={lightboxCandidates} className="journal-lightbox-img" />
          </div>
        </div>
      )}
    </>
  );
}

export function EntriesPage({
  today,
  daily,
  dreams,
  kind,
  onKindChange,
  selectedNoteId,
  notesFolder,
  loading = false,
  busy,
  error = false,
  onToday,
  onDream,
  onOpen,
  onDelete,
  onRetry,
  onKeyDown,
}: {
  today: string;
  daily: JournalEntry[];
  dreams: JournalEntry[];
  kind?: EntriesScope;
  onKindChange?: (kind: EntriesScope) => void;
  selectedNoteId?: string | null;
  notesFolder?: string;
  loading?: boolean;
  busy: boolean;
  error?: boolean;
  onToday: () => void;
  onDream: () => void;
  onOpen: (id: string) => void;
  onDelete?: (entry: JournalEntry) => void;
  onRetry?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
}) {
  const isControlledKind = kind !== undefined;
  const [uncontrolledScope, setUncontrolledScope] = useState<EntriesScope>(
    () => entriesSessionState.scope,
  );
  const scope: EntriesScope = isControlledKind ? kind : uncontrolledScope;

  const setScope = useCallback(
    (next: EntriesScope) => {
      entriesSessionState.scope = next;
      if (!isControlledKind) setUncontrolledScope(next);
      onKindChange?.(next);
    },
    [isControlledKind, onKindChange],
  );

  const [searchInput, setSearchInput] = useState(() => entriesSessionState.searchQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(() => entriesSessionState.searchQuery);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>(
    () => entriesSessionState.mediaFilter,
  );
  const [yearFilter, setYearFilter] = useState<string>(() => entriesSessionState.yearFilter);
  const [monthFilter, setMonthFilter] = useState<string>(() => entriesSessionState.monthFilter);
  const [dateFilter, setDateFilter] = useState<string>(() => entriesSessionState.dateFilter);
  const [sortOrder, setSortOrder] = useState<EntriesSort>(() => entriesSessionState.sortOrder);
  const [viewMode, setViewMode] = useState<EntriesView>(() => entriesSessionState.viewMode);
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>(
    () => entriesSessionState.collapsedMonths,
  );
  const [visibleLimit, setVisibleLimit] = useState<number>(
    () => entriesSessionState.visibleLimit,
  );
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null);
  const [previewEntryId, setPreviewEntryId] = useState<string | null>(null);

  const pageRef = useRef<HTMLElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    entriesSessionState.searchQuery = searchInput;
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    entriesSessionState.mediaFilter = mediaFilter;
    entriesSessionState.yearFilter = yearFilter;
    entriesSessionState.monthFilter = monthFilter;
    entriesSessionState.dateFilter = dateFilter;
    entriesSessionState.sortOrder = sortOrder;
    entriesSessionState.viewMode = viewMode;
    entriesSessionState.collapsedMonths = collapsedMonths;
    entriesSessionState.visibleLimit = visibleLimit;
  }, [
    mediaFilter,
    yearFilter,
    monthFilter,
    dateFilter,
    sortOrder,
    viewMode,
    collapsedMonths,
    visibleLimit,
  ]);

  // Restore scroll position within the session.
  useEffect(() => {
    if (pageRef.current && entriesSessionState.scrollTop > 0) {
      pageRef.current.scrollTop = entriesSessionState.scrollTop;
    }
  }, []);

  // Close menus/popovers on Escape or outside click.
  useEffect(() => {
    if (!menuEntryId && !filterOpen) return;
    const onPointerDown = () => {
      setMenuEntryId(null);
      setFilterOpen(false);
    };
    const onWinKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuEntryId(null);
        setFilterOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onWinKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onWinKeyDown);
    };
  }, [menuEntryId, filterOpen]);

  const allEntries = useMemo(() => [...daily, ...dreams], [daily, dreams]);

  const scopeEntries = useMemo(() => {
    if (scope === "daily") return daily;
    if (scope === "dream") return dreams;
    return allEntries;
  }, [scope, daily, dreams, allEntries]);

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    for (const entry of allEntries) {
      if (parseJournalDate(entry.date)) years.add(entry.date.slice(0, 4));
    }
    return [...years].sort((a, b) => b.localeCompare(a));
  }, [allEntries]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const entry of allEntries) {
      if (!parseJournalDate(entry.date)) continue;
      if (yearFilter !== "all" && !entry.date.startsWith(`${yearFilter}-`)) continue;
      months.add(entry.date.slice(0, 7));
    }
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [allEntries, yearFilter]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLocaleLowerCase();
    const list = scopeEntries.filter((entry) => {
      const imgs = entryImages(entry);
      if (mediaFilter === "photos" && imgs.length === 0) return false;
      if (mediaFilter === "text" && imgs.length > 0) return false;
      if (yearFilter !== "all" && entry.date.slice(0, 4) !== yearFilter) return false;
      if (monthFilter !== "all" && entry.date.slice(0, 7) !== monthFilter) return false;
      if (dateFilter && entry.date !== dateFilter) return false;
      if (q) {
        const haystack = [
          entry.title,
          entry.date,
          entry.preview,
          entry.searchText || "",
          ...(entry.tags || []),
        ]
          .join(" ")
          .toLocaleLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortOrder === "oldest") {
        return a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
      }
      if (sortOrder === "longest") {
        return b.words - a.words || b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
      }
      return b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
    });
  }, [
    scopeEntries,
    mediaFilter,
    yearFilter,
    monthFilter,
    dateFilter,
    debouncedQuery,
    sortOrder,
  ]);

  const renderedSlice = useMemo(
    () => filtered.slice(0, visibleLimit),
    [filtered, visibleLimit],
  );

  const hasMore = renderedSlice.length < filtered.length;

  useEffect(() => {
    if (!hasMore || typeof IntersectionObserver === "undefined") return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((item) => item.isIntersecting)) {
          setVisibleLimit((prev) => Math.min(filtered.length, prev + INITIAL_BATCH_SIZE));
        }
      },
      { root: pageRef.current, rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, filtered.length]);

  const filteredMonthCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of filtered) {
      const valid = Boolean(parseJournalDate(entry.date));
      const key = valid ? entry.date.slice(0, 7) : "undated";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [filtered]);

  const monthGroups = useMemo(() => {
    const groups: { key: string; label: string; totalCount: number; items: JournalEntry[] }[] = [];
    const byKey = new Map<string, { key: string; label: string; totalCount: number; items: JournalEntry[] }>();

    for (const entry of renderedSlice) {
      const valid = Boolean(parseJournalDate(entry.date));
      const key = valid ? entry.date.slice(0, 7) : "undated";
      let group = byKey.get(key);
      if (!group) {
        group = {
          key,
          label: formatMonthHeading(key),
          totalCount: filteredMonthCounts.get(key) || 0,
          items: [],
        };
        byKey.set(key, group);
        groups.push(group);
      }
      group.items.push(entry);
    }
    return groups;
  }, [renderedSlice, filteredMonthCounts]);

  const activeFilterCount =
    (mediaFilter !== "all" ? 1 : 0) +
    (yearFilter !== "all" ? 1 : 0) +
    (monthFilter !== "all" ? 1 : 0) +
    (dateFilter ? 1 : 0);

  const hasAnyFilterOrSearch = activeFilterCount > 0 || searchInput.trim().length > 0;

  const clearAllFilters = () => {
    setSearchInput("");
    setDebouncedQuery("");
    setMediaFilter("all");
    setYearFilter("all");
    setMonthFilter("all");
    setDateFilter("");
  };

  const todayYear = today.slice(0, 4);

  const previewIndex = useMemo(
    () => (previewEntryId ? filtered.findIndex((item) => item.id === previewEntryId) : -1),
    [filtered, previewEntryId],
  );
  const previewEntry = previewIndex >= 0 ? filtered[previewIndex] : null;

  const openQuickPreview = useCallback((entry: JournalEntry, trigger: HTMLElement | null) => {
    lastTriggerRef.current = trigger;
    setPreviewEntryId(entry.id);
  }, []);

  const closeQuickPreview = useCallback(() => {
    const restoreTarget = lastTriggerRef.current;
    setPreviewEntryId(null);
    if (restoreTarget) {
      window.requestAnimationFrame(() => restoreTarget.focus());
    }
  }, []);

  const handleToggleMonth = (monthKey: string) => {
    setCollapsedMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  };

  return (
    <main
      ref={pageRef}
      className="journal-page journal-entries-page"
      aria-label="Entries"
      onScroll={(e) => {
        entriesSessionState.scrollTop = e.currentTarget.scrollTop;
      }}
    >
      <div className="journal-entries-shell" data-journal-panel onKeyDown={onKeyDown}>
        <header className="journal-entries-header">
          <div>
            <h1>Entries</h1>
            <p className="journal-entries-subtitle">
              {loading
                ? "Loading…"
                : `${formatCount(allEntries.length)} ${allEntries.length === 1 ? "entry" : "entries"}`}
            </p>
          </div>
          <div className="journal-home-actions">
            {scope === "dream" ? (
              <button
                type="button"
                className="journal-home-primary"
                disabled={busy}
                onClick={onDream}
              >
                Record a dream <PlusIcon className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                {scope === "all" && (
                  <button
                    type="button"
                    className="journal-home-secondary"
                    disabled={busy}
                    onClick={onDream}
                  >
                    Record a dream <PlusIcon className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  className="journal-home-primary"
                  disabled={busy}
                  onClick={onToday}
                >
                  Write today <ArrowRightIcon className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </header>

        <div className="journal-entries-toolbar-wrap">
          <div className="journal-entries-toolbar">
            <div className="journal-periods journal-entries-scope" role="group" aria-label="Entries type">
              <button
                type="button"
                aria-pressed={scope === "all"}
                className={scope === "all" ? "active" : ""}
                onClick={() => setScope("all")}
              >
                All ({formatCount(allEntries.length)})
              </button>
              <button
                type="button"
                aria-pressed={scope === "daily"}
                className={scope === "daily" ? "active" : ""}
                onClick={() => setScope("daily")}
              >
                Daily ({formatCount(daily.length)})
              </button>
              <button
                type="button"
                aria-pressed={scope === "dream"}
                className={scope === "dream" ? "active" : ""}
                onClick={() => setScope("dream")}
              >
                Dreams ({formatCount(dreams.length)})
              </button>
            </div>

            <div className="journal-entries-controls">
              <div className="journal-entries-search">
                <SearchIcon className="w-4 h-4 text-text-muted shrink-0" />
                <label htmlFor="entries-search-input" className="sr-only">
                  Search entries
                </label>
                <input
                  id="entries-search-input"
                  type="text"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setVisibleLimit(INITIAL_BATCH_SIZE);
                  }}
                  placeholder="Search entries..."
                />
                {searchInput && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="journal-entries-search-clear"
                    onClick={() => {
                      setSearchInput("");
                      setDebouncedQuery("");
                    }}
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  aria-expanded={filterOpen}
                  aria-haspopup="true"
                  className={`journal-entries-control-btn ${activeFilterCount > 0 ? "is-active" : ""}`}
                  onClick={() => setFilterOpen((prev) => !prev)}
                >
                  <span>Filter</span>
                  {activeFilterCount > 0 && (
                    <span className="journal-entries-count-pill">{activeFilterCount}</span>
                  )}
                </button>
                {filterOpen && (
                  <div className="journal-filter-popover" role="dialog" aria-label="Entry filters">
                    <div className="journal-filter-group">
                      <span className="journal-filter-label">Media</span>
                      <div className="journal-filter-options">
                        {([
                          ["all", "All"],
                          ["photos", "Has photos"],
                          ["text", "Text only"],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            aria-pressed={mediaFilter === value}
                            className={mediaFilter === value ? "active" : ""}
                            onClick={() => setMediaFilter(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="journal-filter-group">
                      <label htmlFor="entries-year-select" className="journal-filter-label">
                        Year
                      </label>
                      <select
                        id="entries-year-select"
                        value={yearFilter}
                        onChange={(e) => {
                          setYearFilter(e.target.value);
                          setMonthFilter("all");
                        }}
                      >
                        <option value="all">All years</option>
                        {availableYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="journal-filter-group">
                      <label htmlFor="entries-month-select" className="journal-filter-label">
                        Month
                      </label>
                      <select
                        id="entries-month-select"
                        value={monthFilter}
                        onChange={(e) => setMonthFilter(e.target.value)}
                      >
                        <option value="all">All months</option>
                        {availableMonths.map((m) => (
                          <option key={m} value={m}>
                            {formatMonthHeading(m)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="journal-filter-group">
                      <label htmlFor="entries-date-input" className="journal-filter-label">
                        Exact date
                      </label>
                      <input
                        id="entries-date-input"
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                      />
                    </div>

                    {activeFilterCount > 0 && (
                      <button
                        type="button"
                        className="journal-filter-reset"
                        onClick={clearAllFilters}
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              <label htmlFor="entries-sort-select" className="sr-only">
                Sort entries
              </label>
              <select
                id="entries-sort-select"
                className="journal-entries-select"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as EntriesSort)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="longest">Longest first</option>
              </select>

              <div className="journal-periods journal-entries-view-toggle" role="group" aria-label="View layout">
                <button
                  type="button"
                  aria-pressed={viewMode === "gallery"}
                  className={viewMode === "gallery" ? "active" : ""}
                  onClick={() => setViewMode("gallery")}
                >
                  Gallery
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === "compact"}
                  className={viewMode === "compact" ? "active" : ""}
                  onClick={() => setViewMode("compact")}
                >
                  Compact
                </button>
              </div>
            </div>
          </div>

          {hasAnyFilterOrSearch && (
            <div className="journal-filter-chips" aria-label="Active filters">
              <span className="text-xs text-text-muted">
                {formatCount(filtered.length)} {filtered.length === 1 ? "result" : "results"}
              </span>
              {searchInput.trim() && (
                <button
                  type="button"
                  className="journal-filter-chip"
                  onClick={() => {
                    setSearchInput("");
                    setDebouncedQuery("");
                  }}
                >
                  Search: &ldquo;{searchInput.trim()}&rdquo; <span aria-hidden="true">×</span>
                </button>
              )}
              {mediaFilter !== "all" && (
                <button
                  type="button"
                  className="journal-filter-chip"
                  onClick={() => setMediaFilter("all")}
                >
                  {mediaFilter === "photos" ? "Has photos" : "Text only"}{" "}
                  <span aria-hidden="true">×</span>
                </button>
              )}
              {yearFilter !== "all" && (
                <button
                  type="button"
                  className="journal-filter-chip"
                  onClick={() => {
                    setYearFilter("all");
                    setMonthFilter("all");
                  }}
                >
                  Year: {yearFilter} <span aria-hidden="true">×</span>
                </button>
              )}
              {monthFilter !== "all" && (
                <button
                  type="button"
                  className="journal-filter-chip"
                  onClick={() => setMonthFilter("all")}
                >
                  {formatMonthHeading(monthFilter)} <span aria-hidden="true">×</span>
                </button>
              )}
              {dateFilter && (
                <button
                  type="button"
                  className="journal-filter-chip"
                  onClick={() => setDateFilter("")}
                >
                  Date: {dateFilter} <span aria-hidden="true">×</span>
                </button>
              )}
              <button type="button" className="journal-filter-clear-all" onClick={clearAllFilters}>
                Clear filters
              </button>
            </div>
          )}
        </div>

        {error && (
          <div role="status" className="journal-entries-banner">
            <span>Some entries could not be read. Showing available indexed entries.</span>
            {onRetry && (
              <button type="button" className="underline ml-2" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        )}

        {loading && allEntries.length === 0 ? (
          <div className="journal-gallery-grid" aria-busy="true" aria-label="Loading entries">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="journal-entry-skeleton">
                <div className="journal-skeleton-media" />
                <div className="p-4 space-y-2.5">
                  <div className="journal-skeleton-line w-24" />
                  <div className="journal-skeleton-line w-3/4" />
                  <div className="journal-skeleton-line w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : scope === "dream" && dreams.length === 0 && !hasAnyFilterOrSearch ? (
          <div className="journal-entries-empty">
            <MoonLineIcon className="w-7 h-7 text-text-muted mx-auto mb-3" />
            <h2>No dream entries yet</h2>
            <button
              type="button"
              className="journal-home-primary mt-4"
              disabled={busy}
              onClick={onDream}
            >
              Write a dream <PlusIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : scopeEntries.length === 0 && !hasAnyFilterOrSearch ? (
          <div className="journal-entries-empty">
            <h2>No entries yet</h2>
            <button
              type="button"
              className="journal-home-primary mt-4"
              disabled={busy}
              onClick={onToday}
            >
              Write today <ArrowRightIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="journal-entries-empty">
            <h2>No entries match your filters</h2>
            <button
              type="button"
              className="journal-home-secondary mt-4"
              onClick={clearAllFilters}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="journal-entries-groups">
            {monthGroups.map((group) => {
              const collapsed = Boolean(collapsedMonths[group.key]);
              return (
                <section
                  key={group.key}
                  className="journal-month-section"
                  aria-label={group.label}
                >
                  <button
                    type="button"
                    className="journal-month-header"
                    aria-expanded={!collapsed}
                    onClick={() => handleToggleMonth(group.key)}
                  >
                    <span className="journal-month-title-wrap">
                      {collapsed ? (
                        <ChevronRightIcon className="w-3.5 h-3.5 text-text-muted" />
                      ) : (
                        <ChevronDownIcon className="w-3.5 h-3.5 text-text-muted" />
                      )}
                      <span className="journal-month-title">{group.label}</span>
                    </span>
                    <span className="journal-month-count">
                      {formatCount(group.totalCount)}{" "}
                      {group.totalCount === 1 ? "entry" : "entries"}
                    </span>
                  </button>

                  {!collapsed && (
                    <div
                      className={
                        viewMode === "compact"
                          ? "journal-compact-list"
                          : "journal-gallery-grid"
                      }
                    >
                      {group.items.map((entry) => (
                        <EntryCard
                          key={entry.id}
                          entry={entry}
                          todayYear={todayYear}
                          notesFolder={notesFolder}
                          selected={selectedNoteId === entry.id}
                          previewOpen={previewEntryId === entry.id}
                          viewMode={viewMode}
                          menuOpen={menuEntryId === entry.id}
                          onToggleMenu={setMenuEntryId}
                          onQuickPreview={openQuickPreview}
                          onOpenEditor={onOpen}
                          onDelete={onDelete}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}

            {hasMore && (
              <div ref={sentinelRef} className="journal-entries-more">
                <button
                  type="button"
                  className="journal-home-secondary"
                  onClick={() =>
                    setVisibleLimit((prev) => Math.min(filtered.length, prev + INITIAL_BATCH_SIZE))
                  }
                >
                  Show more entries ({formatCount(filtered.length - renderedSlice.length)} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {previewEntry && (
        <EntryPreviewDrawer
          entry={previewEntry}
          notesFolder={notesFolder}
          hasPrev={previewIndex > 0}
          hasNext={previewIndex >= 0 && previewIndex < filtered.length - 1}
          onPrev={() => {
            if (previewIndex > 0) setPreviewEntryId(filtered[previewIndex - 1].id);
          }}
          onNext={() => {
            if (previewIndex < filtered.length - 1) setPreviewEntryId(filtered[previewIndex + 1].id);
          }}
          onClose={closeQuickPreview}
          onOpenEditor={(id) => {
            setPreviewEntryId(null);
            onOpen(id);
          }}
          onDelete={
            onDelete
              ? (target) => {
                  setPreviewEntryId(null);
                  onDelete(target);
                }
              : undefined
          }
        />
      )}
    </main>
  );
}
