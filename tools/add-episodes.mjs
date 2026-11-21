// 話を pack.json の末尾に追加する(1文・1語を1行にした書式を保つ)。
// 使い方: node tools/add-episodes.mjs <追加する話の JSON ファイル> [パックのフォルダ(既定 packs/locker7)]
//   JSON は [{ "title", "ja", "sentences": [["英文","和訳"],...], "words": [["見出し語","意味",["語形",...]],...] }, ...]
//   引数なしで実行すると、今の pack.json を同じ書式に整えるだけ。
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/words.mjs";

const args = process.argv.slice(2);
const srcFile = args.find(a => a.endsWith(".json"));
const packDir = path.resolve(ROOT, args.find(a => !a.endsWith(".json")) || "packs/locker7");
const file = path.join(packDir, "pack.json");
const pack = JSON.parse(fs.readFileSync(file, "utf8"));

if (srcFile) {
  const add = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  const titles = new Set(pack.episodes.map(e => e.title));
  for (const e of add) {
    if (titles.has(e.title)) throw new Error(`同じタイトルの話がすでにあります: ${e.title}`);
    if (!e.title || !e.ja || !Array.isArray(e.sentences) || !Array.isArray(e.words)) throw new Error("形式が違います: " + JSON.stringify(e).slice(0, 80));
    pack.episodes.push(e);
  }
  console.log(`${add.length} 話を追加(全 ${pack.episodes.length} 話)`);
}

const j = JSON.stringify;
const ep = e => {
  const head = [`"title": ${j(e.title)}`, `"ja": ${j(e.ja)}`];
  if (e.img) head.push(`"img": ${j(e.img)}`);
  return "    {\n      " + head.join(", ") + ",\n"
    + '      "sentences": [\n' + e.sentences.map(s => "        " + j(s)).join(",\n") + "\n      ],\n"
    + '      "words": [\n' + e.words.map(w => "        " + j(w)).join(",\n") + "\n      ]\n    }";
};
const { episodes, ...meta } = pack;
// 編(parts)のような「オブジェクトの配列」は、1件を1行にする
const val = v => Array.isArray(v) && v.length && v.every(x => x && typeof x === "object")
  ? "[\n" + v.map(x => "    " + j(x)).join(",\n") + "\n  ]" : j(v);
const out = "{\n" + Object.entries(meta).map(([k, v]) => `  ${j(k)}: ${val(v)},`).join("\n")
  + '\n  "episodes": [\n' + episodes.map(ep).join(",\n") + "\n  ]\n}\n";
if (j(JSON.parse(out)) !== j(pack)) throw new Error("書き出しの確認に失敗しました");
fs.writeFileSync(file, out);
