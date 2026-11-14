# Journal preview

This is an experimental, opt-in addition to Scratch. Try new features with a
separate test folder before relying on them for important notes.

## Getting started

1. Select a Scratch notes folder, then open **Settings → Journal**.
2. Enable Journal mode, select or enter the name of a direct subfolder, and
   save the settings. The default name is `Journal`; the folder is created
   only when you explicitly create a journal entry.
3. In the sidebar, choose **Today** to open or create today's entry. Select a
   different day in the calendar to open an existing entry; use **Create entry**
   to create a missing one. Merely selecting a date does not create a file.
4. **Home** fills the workspace with daily metrics, a 365-day heatmap, writing
   trends, daily memories and separate recent daily entries and dreams. Use
   **Write today** or **Record a dream** to open the editor.
5. Switch **Daily / Dreams** above the calendar to see the selected collection.
   Daily opens the dated entry; Dreams lists every dream on that date and offers
   **+ Add dream**. The sidebar's **Journal entries** list follows this switch;
   **All notes** retains the original full notes list and folder tree. Dream
   details are optional and editable above the editor.
6. **Search** filters All, Daily, Dreams or Other notes; `Ctrl+Shift+F` opens it
   on Windows. **Insights** and **On This Day** have separate Daily and Dream
   views. Click any entry to open the original Markdown file.

Daily files are named `Journal/YYYY/YYYY-MM-DD.md`. Existing dated entries
elsewhere below the configured journal root, including `Journal/Daily/YYYY/`,
remain recognized without being moved. Dreams live independently under
`Journal/Dreams/YYYY/`, with unique names so multiple dreams can share a date.
Each dream's Markdown contains a `dream_date` in YAML frontmatter; it may differ
from the filename after changing the date. A dream title is the first heading.
Optional tags, emotions, lucid status and vividness are stored in frontmatter.
Complex custom metadata remains accessible in the editor's Markdown source mode.
Dreams are excluded from Daily metrics, heatmaps and memories by default.
The journal folder is currently limited to a direct subfolder of the Scratch
notes folder: to use Google Drive for desktop, choose a notes folder within
your Google Drive for desktop directory using Scratch's existing folder
settings, then select a journal subfolder. Drive for desktop handles syncing.
Do not use this preview to edit the same file simultaneously on two devices.
Scratch's existing external-change detection is not a complete conflict-proof
sync mechanism.

Daily filenames remain stable when the title changes while the configured
journal folder is unchanged. If the journal folder setting changes, older
entries in the former folder become ordinary Scratch notes and Scratch's
normal title-based rename behavior applies to them. Duplicate dated files are
listed separately; creating a date with multiple existing files is blocked.

## Metrics conventions

- A week begins Monday. Entry and word counts cover dates up to today; the
  comparison uses the complete preceding period. All-time includes entries up
  to today. Empty entries count as entries but not as active writing days.
- A streak requires at least one word; yesterday's streak is preserved before
  the first entry today. Future entries do not extend the streak.
- The date heading added to an empty new entry, YAML frontmatter, Markdown
  image references and URLs are excluded from the word count. Counts are
  approximate for complex Markdown; Unicode words including Vietnamese are
  supported.
- Multiple files for one date count as separate entries but a single active
  day. Activity intensity uses the sum of words for that date.
- On This Day matches the exact month and day. February 29 memories appear
  only on February 29.

## Sample journal

Run `npm run demo:journal` to create `examples/journal-demo`, a separate
notes folder with generated Vietnamese daily entries and dreams, including
multiple dreams on one date and memories from earlier years. In Scratch, use
**Settings → Folder → Change Folder** to select that folder; journal mode is
enabled for this demo.
The command refuses to overwrite an existing demo folder. To create another
independent demo, pass a new folder path: `npm run demo:journal -- <new-path>`.
After testing, select your original notes folder again. The example folder is
ignored by Git and can be regenerated whenever needed.

## Local images and portable attachments

- **Relative Markdown paths**: Images added via the toolbar, `/image`, clipboard
  paste, drag-and-drop, or Google Photos Picker are saved locally under
  `assets/` (or `assets/<YYYY-MM>/` for dated daily and dream journal entries)
  and stored in Markdown using note-relative paths (for example,
  `../../../assets/2026-11/photo.png`). Moving or syncing your notes folder keeps
  all image links intact across devices.
- **Image context menu**: Right-click any image in the editor to resize it
  (`50%`, `75%`, or `100%`, persisted in standard Markdown title metadata),
  open its folder in the system file manager, or remove it from the entry.
- **On This Day & Dream Insights**: Entries containing images display previews on
  On This Day memory cards. Dream Insights summarizes lucid dream percentage,
  average vividness, vividness distribution (`1–5`), and recurring dream tags.
- **Command Palette**: When Journal mode is active, `Write Today's Entry`,
  `Record a Dream`, `Open Home Dashboard`, `Open Insights`, and
  `Open On This Day` are available directly from the command palette.

## Google Photos Picker (optional)

Google Photos integration uses the OAuth 2.0 PKCE Desktop loopback flow and the
official **Google Photos Picker API** (`photospicker.mediaitems.readonly` scope).
Only photos you explicitly select in the Picker are downloaded locally into your
`assets/` folder with verified magic bytes and linked by relative path; your
full library is never synced or scanned. Tokens and OAuth client credentials are
stored locally in the app data directory (`google_photos_auth.json`), separate
from your Markdown notes folder.

Setup:

1. Create/select a Google Cloud project and enable the **Google Photos Picker API**
   in the API Library.
2. Configure the Google Auth Platform consent screen and add your account under
   Test Users if your app is in testing mode. Request only
   `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`.
3. Create an OAuth Client ID for a **Desktop app** (optionally noting the Client
   Secret if required by your Google Cloud client configuration).
4. In Scratch **Settings → Journal → Google Photos (Optional)**, paste your
   Client ID, save, and click **Connect Google Photos**.
5. Once connected, use the Google Photos button in the editor toolbar or the
   `/google photos` slash command to pick and download images into the current
   note.

Note: Interactive end-to-end Google OAuth sign-in requires your own Desktop
OAuth Client ID and live Google network access.

Official references: [Picker setup](https://developers.google.com/photos/overview/configure-your-app),
[Picker flow](https://developers.google.com/photos/picker/guides/get-started-picker),
[sessions](https://developers.google.com/photos/picker/guides/sessions),
[media](https://developers.google.com/photos/picker/guides/media-items), and
[desktop OAuth](https://developers.google.com/identity/protocols/oauth2/native-app).

## Development and verification

Install Node.js 24, the current Rust stable toolchain with the Windows MSVC
target, the Visual C++ build tools and WebView2. Then from the repository root:

```powershell
npm ci
node --test tests/*.test.mjs tests/*.test.cjs
npm run build
cd src-tauri
cargo check
cd ..
npm run tauri dev
```

For an unsigned local installer, use:

```powershell
npm run tauri build -- --target x86_64-pc-windows-msvc --config src-tauri/tauri.preview.conf.json
```

The separate **Windows preview build** GitHub Actions workflow can build an
installer as an artifact after the changes have been pushed to GitHub and the
workflow is available there. It does not create a GitHub Release. It has not
yet been run for this change. The preview build uses a separate application
identifier and has its inherited updater endpoints disabled; it is intended
for testing rather than automatic updates.
