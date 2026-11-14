import test from "node:test";
import assert from "node:assert/strict";
import { addDays, classifyJournalId, cleanJournalExcerpt, dailyTotals, dateFromId, dreamMetadata, entriesForKind, extractImagesFromMarkdown, firstImageFromMarkdown, groupOnThisDayByYear, isBoilerplateJournalHeading, localDate, markdownText, onThisDay, onThisDayYearPresence, parseJournalDate, periodBounds, periodMetrics, sanitizeEntryPreview, streaks, updateDreamFrontmatter, wordCount } from "../src/lib/journal.ts";
import { activityGrid, calendarDaysBetween, dailySourceTotals, dreamInsightSummary, insightSummary, trendPoints, weekdayPoints } from "../src/lib/journalInsights.ts";
import { assetSubfolderForNote, formatImageSizeTitle, parseImageSizeTitle, relativeAssetPathForNote, resolveNoteImageToAssetRelPath } from "../src/lib/attachments.ts";

const entry = (date, words, id = `Journal/${date.slice(0, 4)}/${date}`) => ({ date, words, id, title: date, preview: "" });

test("validates local dates and journal scope", () => {
  assert.equal(localDate(parseJournalDate("2024-02-29")), "2024-02-29");
  assert.equal(parseJournalDate("2023-02-29"), null);
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2024-12-31", 1), "2025-01-01");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09");
  assert.equal(addDays("2026-11-01", 1), "2026-11-02");
  assert.equal(dateFromId("Journal/2024/2024-02-29", "Journal"), "2024-02-29");
  assert.equal(dateFromId("Journal2/2024-02-29", "Journal"), null);
});

test("counts Vietnamese text and excludes date header, frontmatter and image URLs", () => {
  const md = "---\ntags: ignore\n---\n# 2026-11-12\nXin chào Việt Nam! ![ảnh](../assets/a.png) [bạn](https://example.com)";
  assert.equal(wordCount(md, "2026-11-12"), 5);
  assert.equal(wordCount("# 2026-11-12\n![x](x.png)", "2026-11-12"), 0);
  assert.equal(wordCount("Xin chào Việt Nam".normalize("NFD")), 4);
  assert.equal(markdownText("# hi\n\n**hello**"), "hi hello");
});

test("streaks handle duplicates, empty and future entries", () => {
  const entries = [entry("2026-11-09", 1), entry("2026-11-10", 2), entry("2026-11-11", 1), entry("2026-11-11", 3, "Journal/other/2026-11-11"), entry("2026-11-12", 0), entry("2026-11-13", 2)];
  assert.deepEqual(streaks(entries, "2026-11-12"), { current: 3, longest: 3 });
  assert.deepEqual(streaks(entries, "2026-11-14"), { current: 1, longest: 3 });
});

test("periods start Monday and compare to previous full period", () => {
  assert.deepEqual(periodBounds("week", "2026-01-01"), ["2025-12-29", "2026-01-04"]);
  assert.deepEqual(periodBounds("month", "2024-03-02", true), ["2024-02-01", "2024-02-29"]);
  const data = [entry("2026-11-02", 10), entry("2026-11-09", 15), entry("2026-11-15", 100)];
  assert.deepEqual(periodMetrics(data, "week", "2026-11-12"), { entries: 1, words: 15, average: 15, previousWords: 10, comparison: 50 });
  assert.equal(periodMetrics([], "week", "2026-11-12").comparison, null);
});

test("memories match exact month/day and totals aggregate duplicate dates", () => {
  const data = [entry("2024-02-29", 4), entry("2020-02-29", 5), entry("2023-02-28", 2)];
  assert.equal(onThisDay(data, "2026-02-28").length, 1);
  assert.equal(onThisDay(data, "2028-02-29").length, 2);
  const totals = dailyTotals([...data, entry("2024-02-29", 7, "Journal/old/2024-02-29")]);
  assert.deepEqual(totals.get("2024-02-29"), { count: 2, words: 11 });
});

test("insights use calendar days, exclude future dates and aggregate activity", () => {
  const data = [entry("2026-11-09", 10), entry("2026-11-09", 5, "Journal/old/2026-11-09"), entry("2026-11-11", 0), entry("2026-11-13", 100)];
  const summary = insightSummary(data, "2026-11-12");
  assert.equal(summary.entries, 3);
  assert.equal(summary.totalWords, 15);
  assert.equal(summary.activeDays, 1);
  assert.equal(summary.activeDaysLastYear, 1);
  assert.equal(summary.daysSinceLast, 1);
  assert.deepEqual(summary.mostActiveDays, [0]);
  assert.deepEqual(summary.bestDay, { date: "2026-11-09", words: 15 });
  assert.equal(summary.longestEntry.words, 10);
  const historical = insightSummary([...data, entry("2020-11-12", 10)], "2026-11-12");
  assert.equal(historical.activeDays, 2);
  assert.equal(historical.activeDaysLastYear, 1);
  assert.equal(calendarDaysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(calendarDaysBetween("2026-11-01", "2026-11-02"), 1);
  assert.equal(weekdayPoints(data, "week", "2026-11-12")[0].words, 15);
  assert.equal(trendPoints(data, "week", "2026-11-12")[0].entries, 2);
  assert.equal(trendPoints(data, "all", "2026-11-12")[0].words, 15);
});

test("activity grid covers 365 days without including future cells", () => {
  const grid = activityGrid("2026-11-12");
  assert.equal(grid.filter(cell => cell.inRange).length, 365);
  assert.equal(grid.filter(cell => cell.inRange).at(-1).date, "2026-11-12");
  assert.equal(grid.length % 7, 0);
});

test("chart totals agree with period metrics across a year boundary", () => {
  const today = "2026-01-02";
  const data = [entry("2025-12-29", 5), entry("2025-12-31", 20), entry("2026-01-01", 40), entry("2026-01-02", 10), entry("2026-01-04", 900)];
  for (const period of ["week", "month", "year", "all"]) {
    const chartTotal = trendPoints(data, period, today).reduce((sum, point) => sum + point.words, 0);
    assert.equal(chartTotal, periodMetrics(data, period, today).words, period);
  }
});

test("journal classification keeps existing dated entries and separates dreams and other notes", () => {
  assert.equal(classifyJournalId("Journal/2023/2023-11-13", "Journal"), "daily");
  assert.equal(classifyJournalId("Journal/Daily/2026/2026-11-13", "Journal"), "daily");
  assert.equal(classifyJournalId("Journal/Dreams/2026/2026-11-13_123_0", "Journal"), "dream");
  assert.equal(dateFromId("Journal/Dreams/2023/2023-11-13", "Journal"), null);
  assert.equal(classifyJournalId("Journal/2026/Shopping list", "Journal"), "other");
  assert.equal(classifyJournalId("Notes/2026-11-13", "Journal"), "other");
});

test("dream dates are independent of filenames and optional metadata stays unknown", () => {
  const id = "Journal/Dreams/2026/2026-11-13_123_0";
  const metadata = dreamMetadata('---\ntype: dream\ndream_date: 2024-02-29\ntags: ["flying", "mây"]\nlucid: false\nvividness: 4\n---\n\n# Bay', id);
  assert.equal(metadata.date, "2024-02-29");
  assert.deepEqual(metadata.tags, ["flying", "mây"]);
  assert.equal(metadata.lucid, false);
  assert.equal(metadata.vividness, 4);
  const missing = dreamMetadata("---\ntype: dream\n---\n# Dream", id);
  assert.equal(missing.date, "2026-11-13");
  assert.equal(missing.lucid, undefined);
  assert.equal(missing.vividness, undefined);
  assert.equal(dreamMetadata("---\ndream_date: '2024-02-29' # recorded date\n---\n# Dream", id).date, "2024-02-29");
});

test("metadata updates preserve unrelated YAML and reject unsafe duplicate keys", () => {
  const original = 'type: dream\ndream_date: 2026-11-13\ncustom: keep this\ntags:\n  - flying\n  - city\nnotes: keep';
  const changed = updateDreamFrontmatter(original, "dream_date", "2025-02-28");
  assert.equal(changed, original.replace("2026-11-13", "2025-02-28"));
  const tagged = updateDreamFrontmatter(changed, "tags", '["mây","bay"]');
  assert.match(tagged, /custom: keep this/);
  assert.match(tagged, /tags: \["mây","bay"\]\nnotes: keep/);
  assert.throws(() => updateDreamFrontmatter("lucid: true\nlucid: false", "lucid", "true"), /Duplicate/);
  assert.throws(() => updateDreamFrontmatter("emotions: |\n  complex", "emotions", '"x"'), /Complex/);
});

test("multiple dreams on one previous date stay separate in memories and metrics", () => {
  const daily = [entry("2025-11-13", 8), entry("2026-11-13", 6)];
  const dreams = [entry("2025-11-13", 5, "dream-1"), entry("2025-11-13", 7, "dream-2")];
  assert.equal(onThisDay(dreams, "2026-11-13").length, 2);
  assert.equal(insightSummary(daily, "2026-11-13").entries, 2);
  assert.equal(periodMetrics(dreams, "all", "2026-11-13").words, 12);
  assert.equal(new Set(dreams.map(d => d.date)).size, 1);
  const indexed = [...daily.map(e => ({ ...e, kind: "daily" })), ...dreams.map(e => ({ ...e, kind: "dream" }))];
  assert.deepEqual(entriesForKind(indexed, "daily").map(e => e.id), [daily[1].id, daily[0].id]);
  assert.deepEqual(entriesForKind(indexed, "dream").map(e => e.id), ["dream-1", "dream-2"]);
});

test("portable relative image paths, subfolders, and size metadata round-trip cleanly", () => {
  assert.equal(relativeAssetPathForNote("Journal/2026/2026-11-13", "assets/2026-11/photo.png"), "../../assets/2026-11/photo.png");
  assert.equal(relativeAssetPathForNote("Journal/Dreams/2026/2026-11-13_01", "assets/2026-11/dream.jpg"), "../../../assets/2026-11/dream.jpg");
  assert.equal(relativeAssetPathForNote("inbox-note", "assets/pic.png"), "assets/pic.png");

  assert.equal(resolveNoteImageToAssetRelPath("Journal/2026/2026-11-13", "../../assets/2026-11/photo.png"), "assets/2026-11/photo.png");
  assert.equal(resolveNoteImageToAssetRelPath("Journal/Dreams/2026/2026-11-13_01", "../../../assets/2026-11/dream.jpg"), "assets/2026-11/dream.jpg");
  assert.equal(resolveNoteImageToAssetRelPath("Journal/2026/2026-11-13", "https://example.com/a.png"), null);
  assert.equal(resolveNoteImageToAssetRelPath("Journal/2026/2026-11-13", "../../../../outside.png"), null);

  assert.equal(assetSubfolderForNote("Journal/2026/2026-11-13", "Journal"), "2026-11");
  assert.equal(assetSubfolderForNote("Journal/Dreams/2024/2024-02-29_1", "Journal"), "2024-02");
  assert.equal(assetSubfolderForNote("Notes/general", "Journal"), undefined);

  assert.deepEqual(parseImageSizeTitle("width:50%"), { widthPercent: 50, caption: "" });
  assert.deepEqual(parseImageSizeTitle("Sunset width:75%"), { widthPercent: 75, caption: "Sunset" });
  assert.equal(formatImageSizeTitle(50, "Sunset"), "Sunset width:50%");
  assert.equal(formatImageSizeTitle(100, "Sunset width:50%"), "Sunset");
  assert.equal(formatImageSizeTitle(100, "width:75%"), undefined);
});

test("firstImageFromMarkdown extracts Markdown and HTML image sources skipping frontmatter", () => {
  assert.equal(firstImageFromMarkdown('---\ntags: ["!img"]\n---\n\n# Note\n\n![alt](../../assets/2026-11/a.png "width:50%")'), "../../assets/2026-11/a.png");
  assert.equal(firstImageFromMarkdown("![alt](<../../assets/2026-11/my photo.jpg>)"), "../../assets/2026-11/my photo.jpg");
  assert.equal(firstImageFromMarkdown('<p><img src="../../assets/pic.webp" /></p>'), "../../assets/pic.webp");
  assert.equal(firstImageFromMarkdown("# Plain text only"), null);
});

test("dreamInsightSummary computes lucid %, average vividness, vividness buckets, and recurring tags", () => {
  const dreams = [
    { ...entry("2026-11-10", 40, "d1"), kind: "dream", lucid: true, vividness: 5, tags: ["Flying", "ocean"] },
    { ...entry("2026-11-11", 30, "d2"), kind: "dream", lucid: false, vividness: 3, tags: ["flying", "Forest"] },
    { ...entry("2026-11-12", 20, "d3"), kind: "dream" },
    { ...entry("2026-11-20", 10, "future"), kind: "dream", lucid: true, vividness: 1, tags: ["ignore"] },
  ];
  const summary = dreamInsightSummary(dreams, "2026-11-13");
  assert.equal(summary.total, 3);
  assert.equal(summary.lucidCount, 1);
  assert.equal(summary.lucidSpecified, 2);
  assert.equal(summary.lucidPercent, 50);
  assert.equal(summary.averageVividness, 4);
  assert.deepEqual(summary.topTags, [
    { tag: "flying", count: 2 },
    { tag: "forest", count: 1 },
    { tag: "ocean", count: 1 },
  ]);
  assert.deepEqual(summary.vividnessDistribution.find(d => d.score === 5), { score: 5, count: 1 });
  assert.deepEqual(summary.vividnessDistribution.find(d => d.score === 3), { score: 3, count: 1 });
  assert.deepEqual(summary.vividnessDistribution.find(d => d.score === 1), { score: 1, count: 0 });
});

test("extractImagesFromMarkdown handles multiple Markdown, HTML, and Obsidian embeds skipping code blocks", () => {
  const photos = Array.from({ length: 8 }, (_, i) => `![p${i}](../../assets/2026-11/p${i}.jpg)`).join("\n");
  const md = [
    "---",
    'cover: "ignore-frontmatter.png"',
    "---",
    "# 2026-11-12",
    "![[Attachments/obsidian-shot.png|600]]",
    photos,
    '<img src="assets/2026-11/html-pic.webp" alt="html">',
    "```md",
    "![ignored](ignore-in-code.png)",
    "```",
  ].join("\n");
  const extracted = extractImagesFromMarkdown(md);
  assert.equal(extracted.length, 10);
  assert.equal(extracted[0], "Attachments/obsidian-shot.png");
  assert.equal(extracted[9], "assets/2026-11/html-pic.webp");
});

test("cleanJournalExcerpt and sanitizeEntryPreview strip Obsidian template headers while keeping Vietnamese text", () => {
  const md = [
    "---",
    "rating: 4",
    "---",
    "# 2026-11-12",
    "## 📁 Pictures",
    "![[Pictures/morning.png]]",
    "## ⚡ Quick Notes",
    "- [x] Buổi sáng đi dạo dưới trời nắng nhẹ.",
    "## Q&A",
    "Hôm nay điều gì khiến mình mỉm cười?",
    "rating:: 5",
    "",
  ].join("\n");
  assert.equal(isBoilerplateJournalHeading("## 📁 Pictures", "2026-11-12"), true);
  assert.equal(isBoilerplateJournalHeading("2026-11-12", "2026-11-12"), true);
  assert.equal(isBoilerplateJournalHeading("Chiều thu Hà Nội", "2026-11-12"), false);

  const excerpt = cleanJournalExcerpt(md, "2026-11-12");
  assert.equal(excerpt, "Buổi sáng đi dạo dưới trời nắng nhẹ. Hôm nay điều gì khiến mình mỉm cười?");
  assert.doesNotMatch(excerpt, /Pictures|Quick Notes|morning\.png|rating::/i);

  assert.equal(
    sanitizeEntryPreview("📁 Pictures ⚡ Quick Notes · Một ngày bình yên", "2026-11-12"),
    "Một ngày bình yên",
  );
});

test("onThisDay, groupOnThisDayByYear, and onThisDayYearPresence enforce real-date matching and calendar years", () => {
  const pool = [
    entry("2026-11-13", 20, "Journal/2026/2026-11-13"),
    entry("2027-11-13", 20, "Journal/2027/2027-11-13"),
    entry("2025-11-12", 15, "Journal/2025/2025-11-12"),
    entry("2025-11-13", 120, "Journal/2025/2025-11-13"),
    entry("2025-11-13", 120, "Journal/2025/2025-11-13"),
    entry("2023-11-13", 50, "Journal/2023/2023-11-13-a"),
    entry("2023-11-13", 40, "Journal/2023/2023-11-13-b"),
    { ...entry("2022-05-01", 30, "Journal/2022/2022-05-01") },
  ];
  const matches = onThisDay(pool, "2026-11-13");
  assert.deepEqual(matches.map(m => m.id), [
    "Journal/2025/2025-11-13",
    "Journal/2023/2023-11-13-a",
    "Journal/2023/2023-11-13-b",
  ]);

  const groupsNewest = groupOnThisDayByYear(matches, "2026-11-13", "newest");
  assert.deepEqual(groupsNewest.map(g => [g.year, g.yearsAgo, g.entries.length]), [
    [2025, 1, 1],
    [2023, 3, 2],
  ]);
  const groupsOldest = groupOnThisDayByYear(matches, "2026-11-13", "oldest");
  assert.deepEqual(groupsOldest.map(g => g.year), [2023, 2025]);

  const presence = onThisDayYearPresence(pool, matches, "2026-11-13");
  assert.deepEqual(presence, [
    { year: 2025, yearsAgo: 1, count: 1, hasMemory: true },
    { year: 2024, yearsAgo: 2, count: 0, hasMemory: false },
    { year: 2023, yearsAgo: 3, count: 2, hasMemory: true },
    { year: 2022, yearsAgo: 4, count: 0, hasMemory: false },
  ]);

  const leapPool = [entry("2020-02-29", 35), entry("2024-02-28", 10), entry("2024-03-01", 10)];
  assert.deepEqual(onThisDay(leapPool, "2024-02-29").map(e => e.date), ["2020-02-29"]);
  assert.equal(groupOnThisDayByYear(onThisDay(leapPool, "2024-02-29"), "2024-02-29")[0].yearsAgo, 4);
  assert.deepEqual(onThisDay(leapPool, "2026-02-28").map(e => e.date), ["2024-02-28"]);
  assert.deepEqual(onThisDay(leapPool, "2026-02-29"), []);
});

test("unified daily and dream mini-fixture computes canonical totals, active days, and source breakdowns", () => {
  const daily = [
    { ...entry("2026-11-10", 120, "Journal/2026/2026-11-10"), kind: "daily" },
    { ...entry("2026-11-11", 10, "Journal/2026/2026-11-11"), kind: "daily" },
  ];
  const dreams = [
    { ...entry("2026-11-10", 80, "Journal/Dreams/2026/2026-11-10_0"), kind: "dream" },
  ];
  const all = [...daily, ...dreams];
  const today = "2026-11-12";

  const allSummary = insightSummary(all, today);
  assert.equal(allSummary.entries, 3);
  assert.equal(allSummary.totalWords, 210);
  assert.equal(allSummary.activeDays, 2);
  assert.equal(allSummary.average, 70);

  const dailySummary = insightSummary(daily, today);
  assert.equal(dailySummary.entries, 2);
  assert.equal(dailySummary.totalWords, 130);
  assert.equal(dailySummary.activeDays, 2);
  assert.equal(dailySummary.average, 65);

  const dreamSummary = insightSummary(dreams, today);
  assert.equal(dreamSummary.entries, 1);
  assert.equal(dreamSummary.totalWords, 80);
  assert.equal(dreamSummary.activeDays, 1);
  assert.equal(dreamSummary.average, 80);

  const byDay = dailySourceTotals(all);
  assert.deepEqual(byDay.get("2026-11-10"), {
    count: 2,
    words: 200,
    dailyCount: 1,
    dreamCount: 1,
    dailyWords: 120,
    dreamWords: 80,
  });
  assert.deepEqual(byDay.get("2026-11-11"), {
    count: 1,
    words: 10,
    dailyCount: 1,
    dreamCount: 0,
    dailyWords: 10,
    dreamWords: 0,
  });

  const weekPoints = trendPoints(all, "week", today);
  const nov10Point = weekPoints.find(p => p.key === "2026-11-10");
  assert.equal(nov10Point.words, 200);
  assert.equal(nov10Point.dailyWords, 120);
  assert.equal(nov10Point.dreamWords, 80);
  assert.equal(nov10Point.entries, 2);
});
