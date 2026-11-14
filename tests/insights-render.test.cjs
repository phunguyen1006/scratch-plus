const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const esbuild = require("esbuild");

const bundled = esbuild.buildSync({
  stdin: {
    contents: 'export * from "./src/components/journal/Insights"; export * from "./src/components/journal/JournalPanels"; export * from "./src/components/journal/JournalDashboard"; export * from "./src/components/journal/JournalNavigation"; export { NotesProvider } from "./src/context/NotesContext"; export { Frontmatter } from "./src/components/editor/Frontmatter"; export { updateDreamFrontmatter } from "./src/lib/journal";',
    resolveDir: process.cwd(),
    sourcefile: "journal-components.ts",
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  write: false,
  logLevel: "silent",
});
const bundle = new Module("insights-render-test", module);
bundle.filename = path.join(process.cwd(), "insights-render-test.cjs");
bundle.paths = Module._nodeModulePaths(process.cwd());
bundle._compile(bundled.outputFiles[0].text, bundle.filename);
const { InsightsSummary, InsightsDashboard, ActivityHeatmap, HomePanel, MemoriesPanel, SearchPanel, JournalNavigation, NotesProvider, HomeDashboard, MemoriesPage, DreamInsights, EntriesPage, Frontmatter, updateDreamFrontmatter } = bundle.exports;
const { MarkdownManager } = require("@tiptap/markdown");
const { StarterKit } = require("@tiptap/starter-kit");

const entry = (date, words, title = date) => ({ id: `Journal/${date.slice(0, 4)}/${date}`, date, words, title, preview: "" });
const base = { today: "2026-11-12", showMetrics: true, showHeatmap: true, onDate() {} };

test("summary presents actual counts and handles absent previous data", () => {
  const entries = [entry("2026-11-12", 12), entry("2026-11-11", 8), entry("2027-01-01", 999)];
  const html = renderToStaticMarkup(React.createElement(InsightsSummary, { ...base, entries, onClose() {}, onExpand() {} }));
  assert.match(html, /CURRENT STREAK/);
  assert.match(html, /View detailed insights/);
  assert.match(html, /No previous data/);
  assert.doesNotMatch(html, /999/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("dashboard renders charts and provides a meaningful empty state", () => {
  const html = renderToStaticMarkup(React.createElement(InsightsDashboard, { ...base, entries: [], dreams: [], onBack() {}, onOpenEntry() {} }));
  assert.match(html, /Writing over time/);
  assert.match(html, /Writing activity/);
  assert.match(html, /Highlights/);
  assert.match(html, /Your recent entries will appear here/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("navigation and home show the requested destinations", () => {
  const nav = renderToStaticMarkup(React.createElement(JournalNavigation, { activePanel: "home", onToggle() {} }));
  for (const label of ["Home", "Search", "Insights", "On This Day"]) assert.match(nav, new RegExp(label));
  assert.match(nav, /aria-pressed="true"/);
  const home = renderToStaticMarkup(React.createElement(HomePanel, { today: base.today, journalEnabled: true, recentNotes: [], busy: false, onToday() {}, onOpenNote() {}, onClose() {} }));
  assert.match(home, /Open today/);
  assert.match(home, /Recent notes/);
});

test("memories panel shows past entries and a clear empty state", () => {
  const props = { today: base.today, enabled: true, shown: true, loading: false, error: false, onOpenNote() {}, onClose() {} };
  const memory = renderToStaticMarkup(React.createElement(MemoriesPanel, { ...props, entries: [entry("2025-11-12", 12, "A memory")] }));
  assert.match(memory, /1 YEAR AGO/);
  assert.match(memory, /A memory/);
  const monthDay = new Date(2026, 10, 12, 12).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  assert.ok(memory.includes(`Memories from ${monthDay} in previous years`));
  const empty = renderToStaticMarkup(React.createElement(MemoriesPanel, { ...props, entries: [] }));
  assert.match(empty, /No memories for today yet/);
});

test("search panel exposes a labelled input and empty guidance", () => {
  const html = renderToStaticMarkup(React.createElement(NotesProvider, null, React.createElement(SearchPanel, { onClose() {} })));
  assert.match(html, /Search all notes/);
  assert.match(html, /Search titles and note contents/);
  assert.match(html, /Other notes/);
});

test("full Home derives distinct daily and dream sections from journal files", () => {
  const daily = [
    { ...entry("2026-11-12", 12), preview: "# 2026-11-12 Calm reflection" },
    entry("2025-11-12", 8, "Memory"),
  ];
  const dreams = [{ ...entry("2026-11-12", 6, "Flying dream"), kind: "dream" }];
  const noop = () => {};
  const html = renderToStaticMarkup(React.createElement(HomeDashboard, { today: base.today, daily, dreams, enabled: true, loading: false, error: false, showMetrics: true, showHeatmap: true, showMemories: true, busy: false, onToday: noop, onDream: noop, onDate: noop, onCreateDate: noop, onOpen: noop, onNavigate: noop, onDreamJournal: noop }));
  assert.match(html, /Write today/);
  assert.match(html, /Record a dream/);
  assert.match(html, /Writing activity/);
  assert.doesNotMatch(html, /Writing trend/);
  assert.match(html, /Recent Entries/);
  assert.match(html, /Calm reflection/);
  assert.doesNotMatch(html, /# 2026-11-12/);
  assert.match(html, /Flying dream/);
  assert.match(html, /1 dream this month/);
  assert.doesNotMatch(html, /ProseMirror/);

  const zeroDreamHtml = renderToStaticMarkup(React.createElement(HomeDashboard, { today: base.today, daily, dreams: [], enabled: true, loading: false, error: false, showMetrics: true, showHeatmap: true, showMemories: true, busy: false, onToday: noop, onDream: noop, onDate: noop, onCreateDate: noop, onOpen: noop, onNavigate: noop, onDreamJournal: noop }));
  assert.match(zeroDreamHtml, /No dreams recorded yet/);
});

test("dream insights do not report missing lucid status as false", () => {
  const dreams = [{ ...entry("2026-11-12", 8), kind: "dream" }];
  const html = renderToStaticMarkup(React.createElement(DreamInsights, { entries: dreams, today: base.today, onOpen() {} }));
  assert.match(html, /Not specified/);
  assert.match(html, /Dreams by month/);
  assert.doesNotMatch(html, /streak/i);
});

test("memories page defaults to daily without mixing in dreams", () => {
  const daily = [{ ...entry("2025-11-12", 1, "Daily memory"), kind: "daily" }];
  const dreams = [{ ...entry("2025-11-12", 1, "Dream memory"), kind: "dream" }];
  const html = renderToStaticMarkup(React.createElement(MemoriesPage, { today: base.today, daily, dreams, onOpen() {} }));
  assert.match(html, /Daily memory/);
  assert.doesNotMatch(html, /Dream memory/);
  assert.match(html, /All memories/);
});

test("TipTap markdown round trip keeps dream frontmatter and body", () => {
  const manager = new MarkdownManager({ extensions: [StarterKit, Frontmatter] });
  const markdown = '---\ntype: dream\ndream_date: 2026-11-13\ntags: ["mây", "bay"]\ncustom: keep\n---\n\n# Giấc mơ\n\nNội dung **quan trọng**.';
  const parsed = manager.parse(markdown);
  assert.equal(parsed.content[0].type, "frontmatter");
  const saved = manager.serialize(parsed);
  assert.match(saved, /dream_date: 2026-11-13/);
  assert.match(saved, /tags: \["mây", "bay"\]/);
  assert.match(saved, /custom: keep/);
  assert.match(saved, /Nội dung \*\*quan trọng\*\*/);
  parsed.content[0].content[0].text = updateDreamFrontmatter(parsed.content[0].content[0].text, "dream_date", "2024-02-29");
  parsed.content[1].content[0].text = "Tên mới";
  const edited = manager.serialize(parsed);
  assert.match(edited, /dream_date: 2024-02-29/);
  assert.match(edited, /# Tên mới/);
  assert.match(edited, /custom: keep/);
  assert.match(edited, /Nội dung \*\*quan trọng\*\*/);
});

test("dream insights renders recurring tags, vividness bars, and lucid percentage", () => {
  const dreams = [
    { ...entry("2026-11-11", 25, "d1"), kind: "dream", lucid: true, vividness: 5, tags: ["flying", "sky"] },
    { ...entry("2026-11-12", 15, "d2"), kind: "dream", lucid: false, vividness: 4, tags: ["flying"] },
  ];
  const html = renderToStaticMarkup(React.createElement(DreamInsights, { entries: dreams, today: base.today, onOpen() {} }));
  assert.match(html, /1 \(50%\)/);
  assert.match(html, /4\.5 \/ 5/);
  assert.match(html, /#flying/);
  assert.match(html, /#sky/);
  assert.match(html, /Vividness distribution/);
  assert.match(html, /journal-horizontal-bar/);
});

test("activity heatmap clamps month header column spans within week columns", () => {
  const html = renderToStaticMarkup(React.createElement(ActivityHeatmap, { entries: [entry("2026-11-02", 5)], today: "2026-11-02", onDate() {} }));
  const colMatch = html.match(/grid-template-columns:\s*repeat\((\d+),\s*minmax\(0,\s*1fr\)\)/);
  assert.ok(colMatch, "heatmap header should render grid columns");
  const totalCols = Number(colMatch[1]);
  const monthSpans = [...html.matchAll(/grid-column:\s*(\d+)\s*\/\s*span\s+(\d+)/g)].map(m => [Number(m[1]), Number(m[2])]);
  assert.ok(monthSpans.length >= 10);
  for (let i = 0; i < monthSpans.length; i++) {
    const [col, span] = monthSpans[i];
    assert.ok(col + span - 1 <= totalCols, `month span ${col}+${span}-1 exceeds ${totalCols}`);
    if (i > 0) {
      const [prevCol, prevSpan] = monthSpans[i - 1];
      assert.ok(prevCol + prevSpan <= col, `month span ${prevCol}+${prevSpan} overlaps ${col}`);
    }
  }
});

test("memories page renders entry image thumbnails and non-blocking error banner", () => {
  const daily = [{ ...entry("2025-11-12", 10, "Journal/2025/2025-11-12"), kind: "daily", image: "assets/2025-11/photo.png" }];
  const html = renderToStaticMarkup(React.createElement(MemoriesPage, { today: base.today, daily, dreams: [], notesFolder: "C:/Notes", error: true, onOpen() {}, onBack() {} }));
  assert.match(html, /Some entries could not be read/);
  assert.match(html, /journal-memory-thumb/);
  assert.match(html, /photo\.png/);
  assert.match(html, /← Back/);
});

test("navigation renders Entries directly beneath Search", () => {
  const html = renderToStaticMarkup(React.createElement(JournalNavigation, { activePanel: "entries", onToggle() {} }));
  const labels = [...html.matchAll(/<span>(Home|Search|Entries|Insights|On This Day)<\/span>/g)].map(m => m[1]);
  assert.deepEqual(labels, ["Home", "Search", "Entries", "Insights", "On This Day"]);
});

test("entries page renders Daily and Dreams tabs and switches active list", () => {
  const daily = [{ ...entry("2026-11-12", 42, "Morning reflection"), kind: "daily" }];
  const dreams = [{ ...entry("2026-11-12", 18, "Flying over clouds"), kind: "dream", id: "Journal/Dreams/2026/2026-11-12-dream" }];
  const dailyHtml = renderToStaticMarkup(React.createElement(EntriesPage, {
    today: base.today,
    daily,
    dreams,
    kind: "daily",
    onKindChange() {},
    busy: false,
    onToday() {},
    onDream() {},
    onOpen() {},
  }));
  assert.match(dailyHtml, /Daily \(1\)/);
  assert.match(dailyHtml, /Dreams \(1\)/);
  assert.match(dailyHtml, /Morning reflection/);
  assert.doesNotMatch(dailyHtml, /Flying over clouds/);

  const dreamsHtml = renderToStaticMarkup(React.createElement(EntriesPage, {
    today: base.today,
    daily,
    dreams,
    kind: "dream",
    onKindChange() {},
    busy: false,
    onToday() {},
    onDream() {},
    onOpen() {},
  }));
  assert.match(dreamsHtml, /Flying over clouds/);
  assert.doesNotMatch(dreamsHtml, /Morning reflection/);
});

test("unified insights dashboard supports source tabs, dream stats, and zero-dream empty state", () => {
  const daily = [entry("2026-11-12", 30)];
  const dreams = [{ ...entry("2026-11-12", 20, "Lantern Dream"), kind: "dream", lucid: true, mood: "calm", vividness: 4, tags: ["sky"] }];
  const allHtml = renderToStaticMarkup(React.createElement(InsightsDashboard, {
    ...base,
    entries: daily,
    dreams,
    onDate() {},
    onBack() {},
    onOpenEntry() {},
  }));
  assert.match(allHtml, /Insights/);
  assert.match(allHtml, /Insights source/);
  assert.match(allHtml, /journal-metric-strip/);
  assert.doesNotMatch(allHtml, /class="journal-kpi-card"/);
  assert.match(allHtml, /journal-trend-bar-stack/);
  assert.match(allHtml, /Series legend/);
  assert.match(allHtml, /All/);
  assert.match(allHtml, /Daily/);
  assert.match(allHtml, /Dreams/);
  assert.match(allHtml, /Motifs: #sky/);
  assert.match(allHtml, /1\/1 lucid \(100%\)/);
  assert.match(allHtml, /Avg vividness 4\/5/);
  assert.match(allHtml, /Lantern Dream/);

  const dailyOnlyAllHtml = renderToStaticMarkup(React.createElement(InsightsDashboard, {
    ...base,
    entries: daily,
    dreams: [],
    onDate() {},
    onBack() {},
    onOpenEntry() {},
  }));
  assert.doesNotMatch(dailyOnlyAllHtml, /journal-highlights-dream-bar/);
  assert.doesNotMatch(dailyOnlyAllHtml, /Series legend/);

  const dreamHtml = renderToStaticMarkup(React.createElement(InsightsDashboard, {
    ...base,
    entries: daily,
    dreams,
    defaultSource: "dream",
    onDate() {},
    onBack() {},
    onOpenEntry() {},
  }));
  assert.match(dreamHtml, /LUCID DREAMS/);
  assert.match(dreamHtml, /1 \(100%\)/);
  assert.match(dreamHtml, /#sky/);

  const emptyDreamHtml = renderToStaticMarkup(React.createElement(InsightsDashboard, {
    ...base,
    entries: daily,
    dreams: [],
    defaultSource: "dream",
    onDate() {},
    onBack() {},
    onOpenEntry() {},
    onDream() {},
  }));
  assert.match(emptyDreamHtml, /No dreams recorded yet/);
  assert.match(emptyDreamHtml, /Record a dream/);
});

test("entries card gallery handles 471 daily / 0 dreams with batching, photo variants, and dream empty state", () => {
  const makeDate = (index) => {
    const d = new Date(2026, 10, 12, 12);
    d.setDate(d.getDate() - index);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const daily471 = Array.from({ length: 471 }, (_, i) => {
    const date = makeDate(i);
    if (i === 0) {
      return {
        ...entry(date, 120, date),
        kind: "daily",
        hasCustomTitle: false,
        preview: "📁 Pictures · Một buổi sáng nhẹ nhàng ở nhà.",
        image: "assets/2026-11/cover.jpg",
        images: ["assets/2026-11/cover.jpg", "assets/2026-11/second.jpg", "assets/2026-11/third.jpg"],
        imageCount: 3,
      };
    }
    if (i === 1) {
      return {
        ...entry(date, 0, "   "),
        kind: "daily",
        hasCustomTitle: false,
        preview: "",
      };
    }
    return {
      ...entry(date, 45, `Reflection #${i}`),
      kind: "daily",
      hasCustomTitle: true,
      preview: "Plain text memory without attached images.",
    };
  });
  daily471.push({
    ...entry("invalid-date", 12, "Undated draft"),
    kind: "daily",
    hasCustomTitle: true,
    preview: "Needs proper date key",
  });

  const allHtml = renderToStaticMarkup(React.createElement(EntriesPage, {
    today: base.today,
    daily: daily471,
    dreams: [],
    kind: "all",
    onKindChange() {},
    notesFolder: "C:/Notes",
    busy: false,
    onToday() {},
    onDream() {},
    onOpen() {},
  }));

  assert.match(allHtml, /All \(472\)/);
  assert.match(allHtml, /Daily \(472\)/);
  assert.match(allHtml, /Dreams \(0\)/);
  assert.match(allHtml, /journal-entry-card--photo/);
  assert.match(allHtml, /journal-entry-card--text/);
  assert.match(allHtml, /\+2/);
  assert.match(allHtml, /Một buổi sáng nhẹ nhàng ở nhà\./);
  assert.doesNotMatch(allHtml, /📁 Pictures/);
  assert.match(allHtml, /No text yet/);
  assert.match(allHtml, /Show more entries/);

  const mountedCards = (allHtml.match(/class="journal-entry-card /g) || []).length;
  assert.equal(mountedCards, 80);

  const emptyDreamsHtml = renderToStaticMarkup(React.createElement(EntriesPage, {
    today: base.today,
    daily: daily471,
    dreams: [],
    kind: "dream",
    onKindChange() {},
    busy: false,
    onToday() {},
    onDream() {},
    onOpen() {},
  }));
  assert.match(emptyDreamsHtml, /No dream entries yet/);
  assert.match(emptyDreamsHtml, /Write a dream/);
});

test("on this day timeline handles single memory, date selection, year grouping, sanitized previews, and empty state", () => {
  const singleDaily = [{
    ...entry("2025-11-13", 142, "2025-11-13"),
    kind: "daily",
    preview: "## 📁 Pictures\nMột buổi sáng nhẹ nhàng ở Hà Nội",
  }];
  const singleHtml = renderToStaticMarkup(React.createElement(MemoriesPage, {
    today: "2026-11-13",
    daily: singleDaily,
    dreams: [],
    onOpen() {},
  }));
  assert.match(singleHtml, /Daily \(1\)/);
  assert.match(singleHtml, /Dreams \(0\)/);
  assert.match(singleHtml, /All memories \(1\)/);
  assert.match(singleHtml, /1 YEAR AGO/);
  assert.match(singleHtml, /1 memory · 1 year remembered · 142 words/);
  assert.match(singleHtml, /Một buổi sáng nhẹ nhàng ở Hà Nội/);
  assert.doesNotMatch(singleHtml, /📁 Pictures/);
  assert.match(singleHtml, /Yearly presence/);
  assert.match(singleHtml, /text-only/);
  assert.doesNotMatch(singleHtml, /photo/);

  const multiDaily = [
    ...singleDaily,
    { ...entry("2024-05-02", 80, "May Memory"), kind: "daily", preview: "Spring coffee", image: "assets/2024/cup.png", imageCount: 2 },
    { ...entry("2023-11-13", 55, "Second 2023 Entry"), kind: "daily", preview: "Late evening reflection" },
  ];
  const selectedHtml = renderToStaticMarkup(React.createElement(MemoriesPage, {
    today: "2026-11-13",
    selectedDate: "2026-05-02",
    daily: multiDaily,
    dreams: [{ ...entry("2024-05-02", 45, "Ocean Dream"), kind: "dream", lucid: true, vividness: 4, preview: "Floating above clear water" }],
    notesFolder: "C:/Notes",
    onOpen() {},
  }));
  assert.match(selectedHtml, /2024/);
  assert.match(selectedHtml, /2 YEARS AGO/);
  assert.match(selectedHtml, /May Memory/);
  assert.match(selectedHtml, /2 photos/);
  assert.match(selectedHtml, /cup\.png/);
  assert.doesNotMatch(selectedHtml, /Một buổi sáng nhẹ nhàng ở Hà Nội/);

  const noMatchHtml = renderToStaticMarkup(React.createElement(MemoriesPage, {
    today: "2026-11-13",
    selectedDate: "2026-01-19",
    daily: multiDaily,
    dreams: [],
    onOpen() {},
    onNavigateEntries() {},
  }));
  assert.match(noMatchHtml, /No memories for this date yet/);
  assert.match(noMatchHtml, /Back to today/);
  assert.match(noMatchHtml, /Browse all entries/);
});
