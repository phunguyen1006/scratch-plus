import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { dreamMetadata, parseJournalDate, updateDreamFrontmatter } from "../../lib/journal";

/** Changes the frontmatter node through TipTap, so metadata shares its autosave. */
export function DreamMetadata({ editor, noteId }: { editor: Editor | null; noteId: string }) {
  const [values, setValues] = useState({ date: "", tags: "", emotions: "", lucid: "", vividness: "" });
  useEffect(() => {
    if (!editor) return;
    const sync = () => {
      const first = editor.state.doc.firstChild;
      const source = first?.type.name === "frontmatter" ? first.textContent : "";
      const meta = dreamMetadata(`---\n${source}\n---\n`, noteId);
      setValues({ date: meta.date || "", tags: meta.tags.join(", "), emotions: meta.emotions, lucid: meta.lucid === undefined ? "" : String(meta.lucid), vividness: meta.vividness ? String(meta.vividness) : "" });
    };
    sync();
    editor.on("update", sync);
    return () => { editor.off("update", sync); };
  }, [editor, noteId]);

  const update = (key: "dream_date" | "tags" | "emotions" | "lucid" | "vividness", value: string | null) => {
    if (!editor) return;
    const first = editor.state.doc.firstChild;
    const hasFrontmatter = first?.type.name === "frontmatter";
    const previous = hasFrontmatter ? first.textContent : "type: dream";
    try {
      const next = updateDreamFrontmatter(previous, key, value);
      if (previous === next && hasFrontmatter) return;
      const text = next ? editor.schema.text(next) : null;
      const node = editor.schema.nodes.frontmatter.create(null, text);
      editor.view.dispatch(editor.state.tr.replaceWith(0, hasFrontmatter ? first.nodeSize : 0, node));
    } catch (error) { toast.error(String(error)); }
  };

  return <details className="journal-dream-metadata" data-journal-panel>
    <summary>Dream details <span>Optional</span></summary>
    <div className="journal-dream-fields">
      <label>Dream date<input type="date" value={values.date} onChange={event => { const date = event.target.value; setValues(v => ({ ...v, date })); if (parseJournalDate(date)) update("dream_date", date); }} /></label>
      <label>Tags<input type="text" value={values.tags} placeholder="flying, city…" onChange={event => setValues(v => ({ ...v, tags: event.target.value }))} onBlur={() => { const tags = values.tags.split(",").map(tag => tag.trim()).filter(Boolean); update("tags", tags.length ? JSON.stringify(tags) : null); }} /></label>
      <label>Emotions<input type="text" value={values.emotions} placeholder="Optional" onChange={event => setValues(v => ({ ...v, emotions: event.target.value }))} onBlur={() => update("emotions", values.emotions.trim() ? JSON.stringify(values.emotions.trim()) : null)} /></label>
      <label>Lucid<select value={values.lucid} onChange={event => { const value = event.target.value; setValues(v => ({ ...v, lucid: value })); update("lucid", value || null); }}><option value="">Not specified</option><option value="true">Yes</option><option value="false">No</option></select></label>
      <label>Vividness<select value={values.vividness} onChange={event => { const value = event.target.value; setValues(v => ({ ...v, vividness: value })); update("vividness", value || null); }}><option value="">Not specified</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} / 5</option>)}</select></label>
    </div>
  </details>;
}
