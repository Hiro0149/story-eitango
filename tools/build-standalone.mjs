// サーバーなしで開ける1ファイル版を作る(CSS・JS・物語データ・挿絵をすべて埋め込む)。
// 使い方: node tools/build-standalone.mjs <出力先.html> [パックのフォルダ(既定 packs/locker7)]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = process.argv[2];
const packDir = path.resolve(root, process.argv[3] || "packs/locker7");
if (!out) { console.error("出力先を指定してください"); process.exit(1); }

const read = f => fs.readFileSync(path.join(root, f), "utf8");
const pack = JSON.parse(fs.readFileSync(path.join(packDir, "pack.json"), "utf8"));
const mime = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
for (const e of pack.episodes) {
  if (!e.img) continue;
  const f = path.join(packDir, e.img);
  e.img = "data:" + mime[path.extname(f).toLowerCase()] + ";base64," + fs.readFileSync(f).toString("base64");
}
// BGM(パック全体と、編ごとの指定)も埋め込む。1曲の文字列でも、複数曲の配列でもよい
const embed = rel => { const f = path.join(packDir, rel); return "data:" + mime[path.extname(f).toLowerCase()] + ";base64," + fs.readFileSync(f).toString("base64"); };
for (const o of [pack, ...(pack.parts || [])]) {
  if (!o.bgm) continue;
  o.bgm = Array.isArray(o.bgm) ? o.bgm.map(embed) : embed(o.bgm);
}
// 埋め込んだ中身に "</script" があっても途中で閉じないようにする
const safe = s => s.replace(/<\/(script|style)/gi, "<\\/$1");
let html = read("locker7.html");
const swap = (find, text) => { if (!html.includes(find)) throw new Error("locker7.html に見つかりません: " + find); html = html.replace(find, () => text); };
swap('<link rel="stylesheet" href="engine/style.css">', "<style>\n" + read("engine/style.css") + "</style>");
swap('<script src="engine/app.js" data-pack="packs/locker7" data-top="./"></script>',
  "<script>window.__PACK__ = " + safe(JSON.stringify(pack)) + ";</script>\n<script>\n" + safe(read("engine/app.js")) + "</script>");
fs.writeFileSync(out, html);
console.log(out, fs.statSync(out).size, "bytes");
