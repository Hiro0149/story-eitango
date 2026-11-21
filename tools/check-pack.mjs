// パックの検証と、対象語リストの消化状況の確認。
// 使い方: node tools/check-pack.mjs [パックのフォルダ(既定 packs/locker7)] [--unused [A2|B1|B2]] [--from 6] [--min 2] [--max 3]
//   --unused [A2|B1|B2]  まだ使っていない対象語をレベル・品詞別に表示する
//   --idioms             まだ使っていない熟語を表示する
//   --from N             話ごとの検証を第N話以降だけ表示する(消化状況は全話で計算)
// 終了コード: 本文に出てこない語形などの「誤り」があれば 1。
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadLevels, loadPack, lookup, tokenize } from "./lib/words.mjs";

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? Number(args[i + 1]) : d; };
const packDir = args.find((a, i) => !a.startsWith("--") && !/^(A2|B1|B2)$/.test(a) && !(i > 0 && ["--min", "--max", "--from"].includes(args[i - 1]))) || "packs/locker7";
const MIN = opt("--min", 2), MAX = opt("--max", 3), FROM = opt("--from", 1);

const pack = loadPack(packDir);
const levels = loadLevels();
const list = JSON.parse(fs.readFileSync(path.join(ROOT, "wordlists/pre2.json"), "utf8"));
const target = new Set(list.words.map(x => x.w));
// 熟語リスト: 熟語 -> 意味
const idioms = new Map();
fs.readFileSync(path.join(ROOT, "wordlists/idioms.txt"), "utf8").split(/\r?\n/).forEach(line => {
  const [k, v] = line.replace(/#.*/, "").split("=").map(s => s.trim());
  if (!k) return;
  if (idioms.has(k.toLowerCase())) console.log(`(熟語リストに重複: ${k})`);
  idioms.set(k.toLowerCase(), v || "");
});
const usedIdioms = new Map();
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const has = (text, form) => new RegExp("\\b" + esc(form) + "\\b").test(text);
const label = (n, e) => `第${n + 1}話 ${e.title}`;
const isPhrase = s => /\s/.test(s);

let errors = 0;

// 対象語(見出し語と語形)から、リスト上の見出し語(代表の綴り)を求める
function lemmasOf(w) {
  const found = new Map();   // lemma -> how
  const rank = { exact: 0, inflect: 1, derive: 2 };
  const put = r => {
    if (!r) return;
    const lemma = levels.get(r.lemma).canon;
    if (!found.has(lemma) || rank[r.how] < rank[found.get(lemma)]) found.set(lemma, r.how);
  };
  const head = w[0].toLowerCase();
  if (levels.has(head)) put({ lemma: head, how: "exact" });
  else if (isPhrase(head)) tokenize(head).forEach(t => { const r = lookup(t, levels); if (r && r.how !== "derive") put(r); });   // 熟語は中の単語(belong to の belong)を消化
  else { put(lookup(w[0], levels)); (w[2] || []).forEach(f => { if (!isPhrase(f)) put(lookup(f, levels)); }); }
  return found;
}

/* ---- 1. 話ごとの検証 ---- */
console.log(`■ 話ごとの検証(${packDir}、1文あたりの対象語 ${MIN}〜${MAX} 語)`);
const seenHead = new Map();    // 見出し語 -> 最初に出た話
const used = new Map();        // リストの語 -> { how, where, head }
const levelCount = { A2: [], B1: [], B2: [], 熟語: [], A1: [], リスト外: [] };
pack.episodes.forEach((e, n) => {
  const show = n + 1 >= FROM;
  const out = [];
  const err = m => { errors++; out.push("  ✗ " + m); };
  const note = m => out.push("  ・" + m);
  const per = e.sentences.map(() => 0);
  const mix = {};
  e.words.forEach(w => {
    const head = w[0].toLowerCase();
    if (!w[1]) err(`${w[0]}: 意味が登録されていません`);
    if (!w[2] || !w[2].length) err(`${w[0]}: 語形が登録されていません`);
    (w[2] || []).forEach(f => {
      const si = e.sentences.findIndex(s => has(s[0], f));
      if (si < 0) err(`${w[0]}: 語形 "${f}" が本文にありません`); else per[si]++;
    });
    if (seenHead.has(head)) note(`${w[0]}: ${seenHead.get(head)} でも対象語になっています(重複)`);
    else seenHead.set(head, label(n, e));
    if (idioms.has(head)) { if (!usedIdioms.has(head)) usedIdioms.set(head, label(n, e)); }
    else if (isPhrase(head) && !levels.has(head)) note(`${w[0]}: 熟語リスト(wordlists/idioms.txt)にありません`);
    const lem = lemmasOf(w);
    let lv;
    if (isPhrase(w[0])) lv = "熟語";
    else if (!lem.size) lv = "リスト外";
    else lv = levels.get([...lem][0][0]).level;
    const how = lem.size ? [...lem][0][1] : "exact";
    levelCount[lv].push(lv === "熟語" || how === "exact" ? w[0] : `${w[0]}→${[...lem][0][0]}`);
    mix[lv] = (mix[lv] || 0) + 1;
    lem.forEach((h, l) => {
      if (!target.has(l)) return;
      if (used.has(l) && used.get(l).head !== head) note(`${w[0]}: リストの "${l}" は ${used.get(l).where} の ${used.get(l).head} で消化済みです`);
      if (!used.has(l)) used.set(l, { how: h, where: label(n, e), head });
    });
  });
  per.forEach((c, i) => {
    const s = e.sentences[i][0];
    if (/^To be continued/i.test(s)) return;
    if (c < MIN || c > MAX) note(`${i + 1}文目: 対象語 ${c} 語 — ${s.slice(0, 50)}${s.length > 50 ? "…" : ""}`);
  });
  if (!show) return;
  console.log(`${label(n, e)}(${e.sentences.length}文・${e.words.length}語) 内訳: ` + Object.keys(levelCount).filter(k => mix[k]).map(k => `${k} ${mix[k]}`).join(" / "));
  out.forEach(l => console.log(l));
});

/* ---- 2. 対象語のレベル内訳 ---- */
const total = pack.episodes.reduce((a, e) => a + e.words.length, 0);
console.log(`\n■ 対象語 ${total} 語のレベル内訳(CEFR-J。A1 ≒ 3級まで、A2 ≒ 準2級の目安)`);
for (const [k, v] of Object.entries(levelCount)) if (v.length) console.log(`  ${k.padEnd(4)} ${String(v.length).padStart(4)} 語` + (flag("--levels") || total <= 100 ? `: ${v.join(", ")}` : ""));

/* ---- 3. 対象語にしていないが本文に出ているリストの語(A2 のみ) ---- */
const incidental = new Map();
pack.episodes.forEach((e, n) => e.sentences.forEach(s => tokenize(s[0]).forEach(tok => {
  const r = lookup(tok, levels);
  if (!r || r.how === "derive") return;
  const c = levels.get(r.lemma).canon;
  if (!target.has(c) || used.has(c) || levels.get(c).level !== "A2") return;
  if (!incidental.has(c)) incidental.set(c, `${tok}(第${n + 1}話)`);
})));
if (incidental.size) {
  console.log(`\n■ 本文に出ているが対象語にしていない A2 の語 ${incidental.size} 語(まだ未消化の扱い)`);
  console.log("  " + [...incidental].map(([l, where]) => `${l} ← ${where}`).join(", "));
}

/* ---- 4. リストの消化状況 ---- */
const exact = [...used.values()].filter(u => u.how !== "derive").length;
const unused = list.words.filter(x => !used.has(x.w));
console.log(`\n■ 対象語リスト(${list.count} 語)の消化状況`);
for (const lv of ["A2", "B1", "B2"]) {
  const all = list.words.filter(x => x.level === lv), done = all.filter(x => used.has(x.w)).length;
  console.log(`  ${lv}: ${String(done).padStart(4)} / ${all.length} 語(未使用 ${all.length - done})`);
}
console.log(`  合計: 消化済み ${used.size} 語(うち派生形での消化 ${used.size - exact} 語) / 未使用 ${unused.length} 語`);
const a2left = unused.filter(x => x.level === "A2").length;
console.log(`  A2 の残り ${a2left} 語は、1話あたり 13 語ずつ消化すると約 ${Math.ceil(a2left / 13)} 話。`);
const idiomsLeft = [...idioms.keys()].filter(k => !usedIdioms.has(k));
console.log(`  熟語: ${String(usedIdioms.size).padStart(4)} / ${idioms.size} 個(未使用 ${idiomsLeft.length})`);
if (flag("--idioms")) console.log(`\n  [未使用の熟語] ${idiomsLeft.length} 個\n  ${idiomsLeft.join(", ")}`);
if (flag("--unused")) {
  const nextArg = args[args.indexOf("--unused") + 1] || "";
  const only = /^(A2|B1|B2)$/.test(nextArg) ? nextArg : null;
  const groups = {};
  unused.filter(x => !only || x.level === only).forEach(x => { const k = x.level + " " + x.pos[0]; (groups[k] = groups[k] || []).push(x.w); });
  for (const [p, ws] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) console.log(`\n  [${p}] ${ws.length} 語\n  ${ws.join(", ")}`);
} else console.log("  (未使用の語の一覧は --unused を付けて実行)");

console.log(errors ? `\n誤り ${errors} 件` : "\n誤りなし");
process.exit(errors ? 1 : 0);
