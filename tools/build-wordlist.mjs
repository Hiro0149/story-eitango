// 対象語リスト wordlists/pre2.json を作る。  使い方: node tools/build-wordlist.mjs
// 土台: CEFR-J Wordlist の A2・B1・B2(A1 にも載っている語は既習とみなして除く)。各語に level を付ける。
// 英検の公式リストではなく、「A1 ≒ 3級まで、A2〜B1 ≒ 準2級〜2級、B2 ≒ 準1級」という目安による自前の選定。
// 異綴り(behavior/behaviour)は1語にまとめ、wordlists/pre2-skip.txt に書いた語は除く。
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadLevels } from "./lib/words.mjs";

const levels = loadLevels();
const skipFile = path.join(ROOT, "wordlists/pre2-skip.txt");
const skip = new Set(fs.existsSync(skipFile)
  ? fs.readFileSync(skipFile, "utf8").split(/\r?\n/).map(l => l.replace(/#.*/, "")).join(",").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
  : []);
// 物語の中で覚える対象にしにくい品詞(数詞・代名詞など)は除く
const skipPos = new Set(["number", "determiner", "pronoun", "be-verb", "do-verb", "have-verb", "modal auxiliary", "infinitive-to", "interjection"]);
const words = [...levels]
  .filter(([w, e]) => e.canon === w && e.level !== "A1" && /^[a-z][a-z' -]+$/.test(w) && !e.pos.every(p => skipPos.has(p)) && !skip.has(w))
  .map(([w, e]) => e.alt.length ? { w, level: e.level, pos: e.pos, alt: e.alt } : { w, level: e.level, pos: e.pos })
  .sort((a, b) => a.w.localeCompare(b.w));

const out = {
  name: "対象語(CEFR-J A2・B1・B2 を土台にした自前選定)",
  source: "The CEFR-J Wordlist Version 1.5. Compiled by Yukio Tono, Tokyo University of Foreign Studies. Retrieved from http://www.cefr-j.org/download.html (via https://github.com/openlanguageprofiles/olp-en-cefrj)",
  count: words.length,
  words,
};
fs.writeFileSync(path.join(ROOT, "wordlists/pre2.json"),
  JSON.stringify(out).replace(/\{"w"/g, "\n{\"w\"").replace(/\]\}$/, "\n]}") + "\n");
const byLevel = {};
words.forEach(x => byLevel[x.level] = (byLevel[x.level] || 0) + 1);
console.log("pre2.json:", words.length, "語", byLevel, "/ 除外指定", skip.size, "語");
