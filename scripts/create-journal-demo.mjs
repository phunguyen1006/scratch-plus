import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// This creates a separate Scratch notes folder; it never touches an existing one.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(projectRoot, "examples", "journal-demo");
const today = new Date();
today.setHours(12, 0, 0, 0);
const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateOffset = offset => { const date = new Date(today); date.setDate(date.getDate() - offset); return date; };
const paragraphs = [
  "Buổi sáng mình dành thời gian sắp xếp lại những việc quan trọng và bắt đầu bằng một tách cà phê. Một buổi sáng chậm rãi giúp mình tập trung hơn và bớt vội vàng.",
  "Hôm nay mình học được một điều mới. Lúc đầu có chút khó hiểu nhưng sau khi chia nhỏ vấn đề và thử lại, mọi thứ trở nên rõ ràng hơn nhiều.",
  "Buổi chiều mình ra ngoài đi bộ, để ý những hàng cây và không khí mát hơn sau cơn mưa. Có những điều rất bình thường nhưng khiến ngày hôm nay dễ chịu.",
  "Mình đã nói chuyện với một người bạn về những dự định trong thời gian tới. Cuộc trò chuyện khiến mình cảm thấy được lắng nghe và có thêm động lực.",
  "Cuối ngày, mình nhìn lại những việc đã làm, cả những việc hoàn thành lẫn những điều còn dang dở. Ngày mai mình sẽ tiếp tục từng bước một.",
  "Mình muốn ghi nhớ cảm giác bình yên của ngày hôm nay. Không cần lúc nào cũng phải làm thật nhiều, đôi khi nghỉ ngơi cũng là một phần của tiến bộ.",
  "Một ý tưởng nhỏ bất chợt xuất hiện khi mình đang làm việc. Mình đã ghi lại nó, tìm thêm một vài ví dụ và thấy rằng có thể phát triển thành một dự án thú vị.",
  "Tối nay mình đọc vài trang sách và nghe một bản nhạc yêu thích. Những khoảnh khắc giản dị như vậy giúp mình khép lại một ngày với tâm trạng thoải mái.",
];

try {
  mkdirSync(path.dirname(target), { recursive: true });
  mkdirSync(target); // Fail if the destination already exists: never overwrite notes.
} catch (error) {
  console.error(`Cannot create demo folder: ${target}\n${error.message}`);
  process.exit(1);
}

mkdirSync(path.join(target, ".scratch"));
writeFileSync(path.join(target, ".scratch", "settings.json"), JSON.stringify({
  theme: { mode: "system" },
  journal: { enabled: true, root: "Journal", openToday: false, showCalendar: true, showMetrics: true, showMemories: true, showHeatmap: true },
}, null, 2) + "\n", { flag: "wx" });

const dates = new Map();
for (let offset = 0; offset < 365; offset++) {
  if (offset === 0 || (offset < 18 && offset % 2 === 0) || offset % 7 === 1 || offset % 13 === 4) {
    dates.set(dateString(dateOffset(offset)), offset);
  }
}
// Include memories for today and the next six days, so the demo remains useful
// across a date change. Feb 29 matches only another leap year.
for (let day = 0; day < 7; day++) {
  const reference = dateOffset(-day);
  let memoryCount = 0;
  for (let years = 1; years <= 12 && memoryCount < 3; years++) {
    const date = new Date(reference.getFullYear() - years, reference.getMonth(), reference.getDate(), 12);
    if (date.getMonth() === reference.getMonth() && date.getDate() === reference.getDate()) {
      dates.set(dateString(date), 365 * years + day);
      memoryCount++;
    }
  }
}

for (const [day, offset] of dates) {
  const folder = path.join(target, "Journal", day.slice(0, 4));
  mkdirSync(folder, { recursive: true });
  const count = offset === 4 || offset === 29 ? 16 : 1 + (offset * 7 + 3) % 8;
  const body = Array.from({ length: count }, (_, index) => paragraphs[(offset + index) % paragraphs.length]).join("\n\n");
  const content = `# ${day}\n\n> Dữ liệu mẫu để kiểm thử Scratch Plus.\n\n${body}\n`;
  writeFileSync(path.join(folder, `${day}.md`), content, { flag: "wx" });
}

// Dreams are a separate collection; two examples share today and one past date.
const dreamDays = [dateString(today), dateString(today), ...[3, 8, 15, 25, 43].map(offset => dateString(dateOffset(offset)))];
let historic = null;
for (let years = 1; years <= 12 && !historic; years++) {
  const candidate = new Date(today.getFullYear() - years, today.getMonth(), today.getDate(), 12);
  if (candidate.getMonth() === today.getMonth() && candidate.getDate() === today.getDate()) historic = dateString(candidate);
}
if (historic) dreamDays.push(historic, historic);
const dreamTitles = ["Thành phố trên mây", "Chuyến tàu đêm", "Khu vườn lạ", "Con đường ven biển", "Một căn phòng đầy sách", "Bay qua những ngọn núi", "Buổi sáng mùa hè", "Ngôi nhà bên hồ", "Cánh cửa nhỏ"];
dreamDays.forEach((day, index) => {
  const folder = path.join(target, "Journal", "Dreams", day.slice(0, 4));
  mkdirSync(folder, { recursive: true });
  const front = [`type: dream`, `dream_date: ${day}`, `tags: ["mẫu", "giấc mơ"]`, ...(index % 3 === 0 ? ["lucid: true", "vividness: 4"] : [])].join("\n");
  writeFileSync(path.join(folder, `${day}_demo_${index + 1}.md`), `---\n${front}\n---\n\n# ${dreamTitles[index % dreamTitles.length]}\n\nMình nhớ một khung cảnh yên bình và vài chi tiết kỳ lạ. Đây là giấc mơ mẫu để kiểm thử ứng dụng.\n`, { flag: "wx" });
});

writeFileSync(path.join(target, "README.txt"), `SCRATCH PLUS - DU LIEU MAU\n\nDay la thu muc rieng de kiem thu, khong phai nhat ky that.\nTrong Scratch, chon thu muc nay lam notes folder. Journal da duoc bat san.\nCo cac ky niem cung ngay hom nay va 6 ngay tiep theo cua nhung nam truoc.\nNgay tao: ${dateString(today)}\n`, { flag: "wx" });
console.log(`Created ${dates.size} daily entries and ${dreamDays.length} dreams at: ${target}`);
console.log(`Open this folder in Scratch: ${target}`);
