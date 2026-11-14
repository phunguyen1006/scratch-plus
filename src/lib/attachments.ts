import { classifyJournalId, dateFromId, parseJournalDate } from "./journal.ts";

export type ImageWidthPercent = 50 | 75 | 100;

export function normalizePosixPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/**
 * Computes a Markdown-portable relative path from a note (identified by its workspace-relative
 * note ID without `.md`) to a workspace-relative asset path such as `assets/2026-11/photo.png`.
 */
export function relativeAssetPathForNote(noteId: string, assetRelPath: string): string {
  const cleanNote = normalizePosixPath(noteId).replace(/^\/+|\/+$/g, "").replace(/\.md$/i, "");
  const cleanAsset = normalizePosixPath(assetRelPath).replace(/^\/+/, "");
  const parts = cleanNote ? cleanNote.split("/").filter(Boolean) : [];
  const dirDepth = Math.max(0, parts.length - 1);
  return `${"../".repeat(dirDepth)}${cleanAsset}`;
}

/**
 * Resolves a Markdown image `src` (relative to the note's directory) into a workspace-relative
 * path, or returns `null` for external/asset URLs and paths that escape the workspace root.
 */
export function resolveNoteImageToAssetRelPath(noteId: string, src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (/^(https?:|data:|blob:|asset:|tauri:)/i.test(trimmed)) return null;

  const cleanSrc = normalizePosixPath(trimmed).split(/[?#]/)[0];
  if (!cleanSrc) return null;

  if (cleanSrc.startsWith("/")) {
    const rooted = cleanSrc.replace(/^\/+/, "");
    return rooted || null;
  }

  const noteParts = normalizePosixPath(noteId).replace(/^\/+|\/+$/g, "").replace(/\.md$/i, "").split("/").filter(Boolean);
  noteParts.pop();

  const stack = [...noteParts];
  for (const segment of cleanSrc.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(segment);
  }

  return stack.length ? stack.join("/") : null;
}

/**
 * Returns the `YYYY-MM` asset subfolder for journal entries so attachments stay organized by month,
 * or `undefined` for non-journal notes.
 */
export function assetSubfolderForNote(noteId: string, journalRoot = "Journal"): string | undefined {
  const root = journalRoot.trim() || "Journal";
  const date = dateFromId(noteId, root);
  if (date) return date.slice(0, 7);
  if (classifyJournalId(noteId, root) === "dream") {
    const leaf = normalizePosixPath(noteId).split("/").pop() || "";
    const match = leaf.match(/^(\d{4}-\d{2}-\d{2})(?:_|$)/);
    if (match && parseJournalDate(match[1])) {
      return match[1].slice(0, 7);
    }
  }
  return undefined;
}

const SIZE_TOKEN_RE = /(?:^|\s)(?:width:)?(50|75|100)%(?=\s|$)/i;

export function parseImageSizeTitle(title?: string | null): {
  widthPercent: ImageWidthPercent | null;
  caption: string;
} {
  if (!title) return { widthPercent: null, caption: "" };
  const match = title.match(SIZE_TOKEN_RE);
  if (!match) return { widthPercent: null, caption: title.trim() };
  const widthPercent = Number(match[1]) as ImageWidthPercent;
  const caption = title.replace(SIZE_TOKEN_RE, " ").replace(/\s+/g, " ").trim();
  return { widthPercent, caption };
}

export function formatImageSizeTitle(
  widthPercent: ImageWidthPercent,
  existingTitle?: string | null,
): string | undefined {
  const { caption } = parseImageSizeTitle(existingTitle);
  if (widthPercent === 100) {
    return caption || undefined;
  }
  return caption ? `${caption} width:${widthPercent}%` : `width:${widthPercent}%`;
}
