// Gemini でダウンロードした挿絵を、保存日時の順に話へ割り当てて取り込む。
// 幅1600pxの JPEG に縮小して <パック>/img/epN.jpg に置き、pack.json に "img" を足す。ffmpeg が必要。
// 使い方: node tools/import-images.mjs [--dry] [--episodes 2,3,5-20] [--hours 24] [--dir <ダウンロード先>] [パックのフォルダ]
//   --episodes を省くと、まだ絵がない話を番号順に、見つかった枚数ぶん割り当てる。
//   --dry は割り当ての表示だけ。元のファイルは消さない。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/words.mjs";

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args.splice(i, 2)[1]; };
const dry = flag("--dry");
const hours = Number(opt("--hours", 24));
const dir = path.resolve(opt("--dir", path.join(os.homedir(), "Downloads")));
const epArg = opt("--episodes", "");
const packDir = path.resolve(ROOT, args[0] || "packs/locker7");
const packFile = path.join(packDir, "pack.json");
const pack = JSON.parse(fs.readFileSync(packFile, "utf8"));

const files = fs.readdirSync(dir)
  .filter(f => /^Gemini_Generated_Image.*\.(png|jpe?g|webp)$/i.test(f))
  .map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
  .filter(x => Date.now() - x.t < hours * 3600e3)
  .sort((a, b) => a.t - b.t);

let eps = epArg
  ? epArg.split(",").flatMap(s => { const [a, b = a] = s.split("-").map(Number); return Array.from({ length: b - a + 1 }, (_, i) => a + i); })
  : pack.episodes.map((e, i) => e.img ? 0 : i + 1).filter(Boolean).slice(0, files.length);

const time = t => new Date(t).toLocaleTimeString("ja-JP");
console.log(`${dir} の Gemini の絵(直近 ${hours} 時間): ${files.length} 枚`);
if (!files.length) process.exit(1);
if (epArg && eps.length !== files.length) {
  files.forEach(x => console.log(`  ${time(x.t)}  ${x.f}`));
  console.error(`枚数が合いません: 話 ${eps.length} / 絵 ${files.length}。--episodes か --hours を見直してください。`);
  process.exit(1);
}
for (const n of eps) if (!pack.episodes[n - 1]) { console.error(`第${n}話は pack.json にありません`); process.exit(1); }

let text = fs.readFileSync(packFile, "utf8");
const j = JSON.stringify;
eps.forEach((n, i) => {
  const e = pack.episodes[n - 1], src = files[i];
  console.log(`  第${n}話 ${e.title}  ←  ${time(src.t)}  ${src.f}`);
  if (dry) return;
  const out = path.join(packDir, "img", `ep${n}.jpg`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", path.join(dir, src.f), "-vf", "scale=1600:-2", "-q:v", "4", out]);
  if (!e.img) {
    const head = `"title": ${j(e.title)}, "ja": ${j(e.ja)},`;
    if (!text.includes(head)) throw new Error(`pack.json に見出し行が見つかりません: 第${n}話`);
    text = text.replace(head, () => `"title": ${j(e.title)}, "ja": ${j(e.ja)}, "img": ${j(`img/ep${n}.jpg`)},`);
  }
});
if (dry) { console.log("(--dry: 表示だけ。取り込んでいません)"); process.exit(0); }
JSON.parse(text);
fs.writeFileSync(packFile, text);
console.log(`${eps.length} 枚を取り込みました。絵と話が合っているか、アプリで確かめてください。`);
