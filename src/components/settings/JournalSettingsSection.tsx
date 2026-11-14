import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import * as notesService from "../../services/notes";
import { defaultJournalSettings, journalSettings } from "../../lib/journalSettings";
import type { JournalSettings } from "../../types/note";

interface GooglePhotosStatus {
  hasClientId: boolean;
  clientId: string;
  hasClientSecret: boolean;
  connected: boolean;
}

export function JournalSettingsSection() {
  const [settings, setSettings] = useState<JournalSettings>(defaultJournalSettings);
  const [folders, setFolders] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [photosStatus, setPhotosStatus] = useState<GooglePhotosStatus>({
    hasClientId: false,
    clientId: "",
    hasClientSecret: false,
    connected: false,
  });
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [photosBusy, setPhotosBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([notesService.getSettings(), notesService.listFolders()]).then(([saved, dirs]) => {
      if (!cancelled) {
        setSettings(journalSettings(saved.journal));
        setFolders(dirs.filter(dir => !dir.includes("/")));
      }
    }).catch(() => toast.error("Could not load journal settings"));

    invoke<GooglePhotosStatus>("get_google_photos_status")
      .then((status) => {
        if (!cancelled) {
          setPhotosStatus(status);
          setClientIdInput(status.clientId);
        }
      })
      .catch(() => { /* ignore outside Tauri */ });

    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    const root = settings.root.trim();
    if (!root || /[\\/:*?"<>|]/.test(root) || root === "." || root === ".." || ["assets", ".git", ".scratch", ".obsidian", ".trash"].includes(root.toLowerCase())) {
      toast.error("Choose a single valid folder name inside your notes folder");
      return;
    }
    setSaving(true);
    try {
      const current = await notesService.getSettings();
      await notesService.updateSettings({ ...current, journal: { ...settings, root } });
      window.dispatchEvent(new Event("journal-settings-changed"));
      toast.success("Journal settings saved");
    } catch (error) {
      toast.error(`Could not save journal settings: ${String(error)}`);
    } finally { setSaving(false); }
  };

  const saveClientId = async () => {
    setPhotosBusy(true);
    try {
      const status = await invoke<GooglePhotosStatus>("set_google_photos_client_id", {
        clientId: clientIdInput,
        clientSecret: clientSecretInput.trim() ? clientSecretInput : null,
      });
      setPhotosStatus(status);
      setClientSecretInput("");
      window.dispatchEvent(new Event("google-photos-changed"));
      toast.success(status.hasClientId ? "Google Photos client saved" : "Google Photos client cleared");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setPhotosBusy(false);
    }
  };

  const connectPhotos = async () => {
    setPhotosBusy(true);
    try {
      if (clientIdInput.trim() !== photosStatus.clientId || clientSecretInput.trim()) {
        await invoke<GooglePhotosStatus>("set_google_photos_client_id", {
          clientId: clientIdInput,
          clientSecret: clientSecretInput.trim() ? clientSecretInput : null,
        });
      }
      const status = await invoke<GooglePhotosStatus>("connect_google_photos");
      setPhotosStatus(status);
      setClientSecretInput("");
      window.dispatchEvent(new Event("google-photos-changed"));
      toast.success("Connected to Google Photos");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setPhotosBusy(false);
    }
  };

  const disconnectPhotos = async () => {
    setPhotosBusy(true);
    try {
      const status = await invoke<GooglePhotosStatus>("disconnect_google_photos");
      setPhotosStatus(status);
      window.dispatchEvent(new Event("google-photos-changed"));
      toast.success("Disconnected from Google Photos");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setPhotosBusy(false);
    }
  };

  const checks: { key: keyof JournalSettings; label: string; description: string }[] = [
    { key: "enabled", label: "Journal mode", description: "Show journaling tools in the notes sidebar." },
    { key: "openToday", label: "Open today on launch", description: "Create today's entry if it does not exist." },
    { key: "showCalendar", label: "Calendar", description: "Browse entries by date." },
    { key: "showMetrics", label: "Metrics and trends", description: "Show writing statistics in Insights." },
    { key: "showMemories", label: "On This Day", description: "Revisit entries from the same date in past years." },
    { key: "showHeatmap", label: "Activity heatmap", description: "Show daily activity in Insights." },
  ];
  return <div className="space-y-6 py-8">
    <div><h2 className="text-xl font-medium">Journal</h2><p className="text-sm text-text-muted">Private Markdown entries stored inside your notes folder.</p></div>
    <div className="space-y-2">
      <label htmlFor="journal-root" className="text-sm font-medium">Journal folder</label>
      <input id="journal-root" list="journal-folders" value={settings.root} onChange={e => setSettings({ ...settings, root: e.target.value })} className="w-full px-3 py-2 text-sm bg-bg border border-border rounded-md" />
      <datalist id="journal-folders">{folders.map(folder => <option key={folder} value={folder} />)}</datalist>
      <p className="text-xs text-text-muted">Choose or name a direct subfolder of your current notes folder. New entries use YYYY/YYYY-MM-DD.md.</p>
    </div>
    <div className="space-y-4">{checks.map(({ key, label, description }) => <label key={key} className="flex items-start gap-3 cursor-pointer text-sm">
      <input type="checkbox" className="mt-1 accent-current" checked={Boolean(settings[key])} onChange={e => setSettings({ ...settings, [key]: e.target.checked })} />
      <span><span className="font-medium block">{label}</span><span className="text-text-muted">{description}</span></span>
    </label>)}</div>
    <button type="button" disabled={saving} onClick={save} className="px-3 py-2 rounded-md border border-border hover:bg-bg-muted disabled:opacity-50 text-sm">{saving ? "Saving…" : "Save journal settings"}</button>

    <div className="pt-6 border-t border-border space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-medium">Google Photos (Optional)</h3>
          <p className="text-xs text-text-muted">Only photos you explicitly select in Google Photos Picker are downloaded locally into your assets folder.</p>
        </div>
        <span className="text-xs px-2 py-1 rounded border border-border text-text-muted shrink-0">
          {photosStatus.connected ? "Connected" : photosStatus.hasClientId ? "Ready to connect" : "Not configured"}
        </span>
      </div>

      <div className="space-y-2">
        <label htmlFor="gphotos-client-id" className="text-xs font-medium text-text-muted block">OAuth Desktop Client ID</label>
        <input
          id="gphotos-client-id"
          type="text"
          value={clientIdInput}
          onChange={e => setClientIdInput(e.target.value)}
          placeholder="1234567890-abc.apps.googleusercontent.com"
          className="w-full px-3 py-2 text-sm bg-bg border border-border rounded-md"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="gphotos-client-secret" className="text-xs font-medium text-text-muted block">
          Client Secret (optional for Desktop OAuth) {photosStatus.hasClientSecret ? "· Saved" : ""}
        </label>
        <input
          id="gphotos-client-secret"
          type="password"
          value={clientSecretInput}
          onChange={e => setClientSecretInput(e.target.value)}
          placeholder={photosStatus.hasClientSecret ? "Leave blank to keep existing secret" : "Optional"}
          className="w-full px-3 py-2 text-sm bg-bg border border-border rounded-md"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={photosBusy} onClick={saveClientId} className="px-3 py-1.5 rounded-md border border-border hover:bg-bg-muted disabled:opacity-50 text-xs font-medium">
          Save Client ID
        </button>
        {!photosStatus.connected ? (
          <button type="button" disabled={photosBusy || !clientIdInput.trim()} onClick={connectPhotos} className="px-3 py-1.5 rounded-md border border-border bg-bg-emphasis hover:bg-bg-muted disabled:opacity-50 text-xs font-medium">
            {photosBusy ? "Waiting for browser…" : "Connect Google Photos"}
          </button>
        ) : (
          <button type="button" disabled={photosBusy} onClick={disconnectPhotos} className="px-3 py-1.5 rounded-md border border-border hover:bg-bg-muted disabled:opacity-50 text-xs font-medium">
            Disconnect
          </button>
        )}
      </div>

      <details className="text-xs text-text-muted space-y-1">
        <summary className="cursor-pointer hover:text-text">Setup instructions (Google Cloud Desktop OAuth)</summary>
        <ol className="list-decimal pl-4 pt-2 space-y-1">
          <li>In Google Cloud Console, enable the <strong>Google Photos Picker API</strong>.</li>
          <li>Configure OAuth Consent Screen and add your Google account under Test Users if in testing mode.</li>
          <li>Create Credentials → OAuth Client ID → Application type: <strong>Desktop app</strong>.</li>
          <li>Paste the Client ID above, save, and click Connect Google Photos. Credentials are stored locally outside your notes folder.</li>
        </ol>
      </details>
    </div>
  </div>;
}
