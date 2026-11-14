import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useNotes } from "../../context/NotesContext";
import { NoteList } from "../notes/NoteList";
import { JournalSidebar } from "../journal/JournalSidebar";
import { JournalNavigation } from "../journal/JournalNavigation";
import type { JournalPanel } from "../../lib/journalNavigation";
import { Footer } from "./Footer";
import { IconButton } from "../ui";
import {
  PlusIcon,
  AddNoteIcon,
  FolderPlusIcon,
  NoteIcon,
} from "../icons";
import { mod, isMac, isWindows } from "../../lib/platform";
import * as notesService from "../../services/notes";
import { FolderNameDialog } from "../notes/FolderNameDialog";

interface SidebarProps {
  onOpenSettings?: () => void;
  activePanel: JournalPanel | null;
  onTogglePanel: (panel: JournalPanel) => void;
  onClosePanel: () => void;
}

export function Sidebar({ onOpenSettings, activePanel, onTogglePanel, onClosePanel }: SidebarProps) {
  const {
    createNote,
    createFolder,
    notes,
    notesFolder,
    selectedNoteId,
    moveNote,
    moveFolder,
  } = useNotes();
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogParent, setFolderDialogParent] = useState("");
  const [foldersEnabled, setFoldersEnabled] = useState(true);
  const [journalEnabled, setJournalEnabled] = useState(false);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [dragCount, setDragCount] = useState(1);
  const [multiSelectedNoteIds, setMultiSelectedNoteIds] = useState<Set<string>>(new Set());
  const [lastClickedNoteId, setLastClickedNoteId] = useState<string | null>(null);
  const multiSelectedRef = useRef(multiSelectedNoteIds) as RefObject<Set<string>>;
  multiSelectedRef.current = multiSelectedNoteIds;

  // dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.type === "note") {
      const noteId = data.id as string;
      const leaf = noteId.includes("/")
        ? noteId.substring(noteId.lastIndexOf("/") + 1)
        : noteId;
      setDragLabel(leaf);

      // Multi-select: if dragged note is in selection, drag all; otherwise reset
      const selected = multiSelectedRef.current!;
      if (selected.has(noteId) && selected.size > 1) {
        setDragCount(selected.size);
      } else {
        setMultiSelectedNoteIds(new Set([noteId]));
        setDragCount(1);
      }
    } else if (data?.type === "folder") {
      const path = data.path as string;
      const name = path.includes("/")
        ? path.substring(path.lastIndexOf("/") + 1)
        : path;
      setDragLabel(name);
      setDragCount(1);
    }
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDragLabel(null);
      setDragCount(1);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;
      if (!activeData || !overData) return;

      const targetFolder = overData.path as string;

      try {
        if (activeData.type === "note") {
          const noteId = activeData.id as string;
          const selected = multiSelectedRef.current!;

          // Batch move if multi-selected
          if (selected.has(noteId) && selected.size > 1) {
            const noteIds = Array.from(selected).filter((id) => {
              const parent = id.includes("/")
                ? id.substring(0, id.lastIndexOf("/"))
                : "";
              return parent !== targetFolder;
            });
            if (noteIds.length === 0) return;
            let failures = 0;
            for (const id of noteIds) {
              try {
                await moveNote(id, targetFolder);
              } catch {
                failures++;
              }
            }
            if (failures > 0) {
              toast.error(`Failed to move ${failures} note(s)`);
            }
            setMultiSelectedNoteIds(new Set());
          } else {
            const noteParent = noteId.includes("/")
              ? noteId.substring(0, noteId.lastIndexOf("/"))
              : "";
            if (noteParent === targetFolder) return;
            await moveNote(noteId, targetFolder);
            setMultiSelectedNoteIds(new Set());
          }
        } else if (activeData.type === "folder") {
          const folderPath = activeData.path as string;
          if (
            targetFolder === folderPath ||
            targetFolder.startsWith(folderPath + "/")
          )
            return;
          const folderParent = folderPath.includes("/")
            ? folderPath.substring(0, folderPath.lastIndexOf("/"))
            : "";
          if (folderParent === targetFolder) return;
          await moveFolder(folderPath, targetFolder);
        }

        // Expand target folder so the moved item is visible
        if (targetFolder) {
          window.dispatchEvent(
            new CustomEvent("expand-folder", { detail: targetFolder }),
          );
        }
      } catch (error) {
        console.error("Failed to move item:", error);
        toast.error("Failed to move item");
      }
    },
    [moveNote, moveFolder],
  );

  // Keep ordinary notes available alongside the selected journal collection.
  useEffect(() => {
    let cancelled = false;
    const load = () => notesService.getSettings().then((s) => {
      if (!cancelled) {
        const enabled = s.journal?.enabled === true;
        setFoldersEnabled(s.foldersEnabled === true);
        setJournalEnabled(enabled);
      }
    }).catch((error) => {
      console.error("Failed to load settings:", error);
      if (!cancelled) {
        setFoldersEnabled(false);
        setJournalEnabled(false);
      }
    });
    void load();
    window.addEventListener("journal-settings-changed", load);
    return () => { cancelled = true; window.removeEventListener("journal-settings-changed", load); };
  }, [notesFolder]);

  const handleNewFolder = useCallback(() => {
    const lastSlash = selectedNoteId?.lastIndexOf("/") ?? -1;
    setFolderDialogParent(
      lastSlash > 0 ? selectedNoteId!.substring(0, lastSlash) : "",
    );
    setFolderDialogOpen(true);
  }, [selectedNoteId]);

  const handleFolderDialogConfirm = useCallback(
    async (name: string) => {
      try {
        await createFolder(folderDialogParent, name);
        setFolderDialogOpen(false);
      } catch (error) {
        console.error("Failed to create folder:", error);
        toast.error("Failed to create folder");
      }
    },
    [createFolder, folderDialogParent],
  );

  // Listen for create-new-folder event (from command palette / keyboard shortcut)
  useEffect(() => {
    const handleCreateFolder = () => {
      // Derive parent folder from currently selected note
      const lastSlash = selectedNoteId?.lastIndexOf("/") ?? -1;
      setFolderDialogParent(
        lastSlash > 0 ? selectedNoteId!.substring(0, lastSlash) : "",
      );
      setFolderDialogOpen(true);
    };

    window.addEventListener("create-new-folder", handleCreateFolder);
    return () =>
      window.removeEventListener("create-new-folder", handleCreateFolder);
  }, [selectedNoteId]);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragLabel(null)}
    >
    <div className="relative w-full h-full bg-bg-secondary border-r border-border flex flex-col select-none">
      {/* Drag region */}
      {!isWindows && <div className="h-11 shrink-0" data-tauri-drag-region></div>}
      <div className={`flex items-center justify-between pl-4 pr-3 pb-2 border-b border-border shrink-0${isWindows ? " pt-2" : ""}`}>
        <div className="flex items-center gap-1">
          <div className="font-medium text-base">Notes</div>
          <div className="text-text-muted font-medium text-2xs min-w-4.75 h-4.75 flex items-center justify-center px-1 bg-bg-muted rounded-sm mt-0.5 pt-px">
            {notes.length}
          </div>
        </div>
        <div className="flex items-center gap-px">
          {foldersEnabled ? (
            <DropdownMenu.Root
              open={plusMenuOpen}
              onOpenChange={setPlusMenuOpen}
            >
              <DropdownMenu.Trigger asChild>
                <IconButton
                  variant="ghost"
                  title="New Note or Folder"
                >
                  <PlusIcon className="w-5.25 h-5.25 stroke-[1.4]" />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="min-w-40 bg-bg border border-border rounded-md shadow-lg py-1 z-50"
                  sideOffset={5}
                  align="end"
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <DropdownMenu.Item
                    className="px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2"
                    onSelect={() => createNote()}
                  >
                    <AddNoteIcon className="w-4 h-4 stroke-[1.6]" />
                    <span className="flex-1">New Note</span>
                    <kbd className="text-xs text-text-muted ml-2">
                      {mod}
                      {isMac ? "" : "+"}N
                    </kbd>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    className="px-3 py-1.5 text-sm text-text cursor-pointer outline-none hover:bg-bg-muted focus:bg-bg-muted flex items-center gap-2"
                    onSelect={handleNewFolder}
                  >
                    <FolderPlusIcon className="w-4 h-4 stroke-[1.6]" />
                    New Folder
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <IconButton
              variant="ghost"
              onClick={() => createNote()}
              title={`New Note (${mod}${isMac ? "" : "+"}N)`}
            >
              <PlusIcon className="w-5.25 h-5.25 stroke-[1.4]" />
            </IconButton>
          )}
        </div>
      </div>
      {journalEnabled && <JournalNavigation activePanel={activePanel} onToggle={onTogglePanel} />}
      {/* Scrollable area with notes when journal mode is off */}
      {!journalEnabled && <div className="flex-1 overflow-y-auto">
        <NoteList
          multiSelectedNoteIds={multiSelectedNoteIds}
          setMultiSelectedNoteIds={setMultiSelectedNoteIds}
          lastClickedNoteId={lastClickedNoteId}
          setLastClickedNoteId={setLastClickedNoteId}
        />
      </div>}

      <div className={journalEnabled ? "journal-calendar-region flex-1 min-h-0 overflow-y-auto scrollbar-none" : "shrink-0"}>
        <JournalSidebar
          activePanel={activePanel}
          onClosePanel={onClosePanel}
          onOpenSettings={onOpenSettings}
        />
      </div>

      {/* Footer with git status, commit, and settings */}
      <Footer onOpenSettings={onOpenSettings} />

      {/* Folder name dialog */}
      <FolderNameDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onConfirm={handleFolderDialogConfirm}
        title="Create new folder"
        description="Enter a name for your new folder"
        confirmLabel="Create"
      />
    </div>

    {/* Drag overlay — floating label while dragging */}
    <DragOverlay>
      {dragLabel && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-bg border border-border rounded-md shadow-lg text-sm text-text">
          <NoteIcon className="w-3.5 h-3.5 stroke-[1.6] opacity-50 shrink-0" />
          {dragLabel}
          {dragCount > 1 && (
            <span className="ml-1 px-1.5 py-0.5 bg-accent text-text-inverse text-xs rounded-full leading-none">
              +{dragCount - 1}
            </span>
          )}
        </div>
      )}
    </DragOverlay>
    </DndContext>
  );
}
