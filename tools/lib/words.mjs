// 語彙リストの読み込みと、語形(活用・派生)から見出し語を推定する共通処理。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CEFRJ_CSV = path.join(ROOT, "wordlists/cefrj-vocabulary-profile-1.5.csv");
const ORDER = { A1: 1, A2: 2, B1: 3, B2: 4 };

function parseCsvLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// 見出し語(小文字) → { level: 最も低いレベル, pos: [品詞...], canon, alt }。"a/b" のような異綴りは両方登録する。
export function loadLevels() {
  const map = new Map();
  const lines = fs.readFileSync(CEFRJ_CSV, "utf8").split(/\r?\n/).slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [head, pos, level] = parseCsvLine(line);
    if (!ORDER[level]) continue;
    const variants = head.split("/").map(h => h.trim().toLowerCase()).filter(Boolean);
    for (const w of variants) {
      // canon: 異綴り(behavior/behaviour など)をまとめる代表の綴り。どれか1つを使えば全部「使った」扱いにする
      const e = map.get(w) || { level, pos: [], canon: variants[0], alt: variants.slice(1) };
      if (ORDER[level] < ORDER[e.level]) e.level = level;
      if (!e.pos.includes(pos)) e.pos.push(pos);
      map.set(w, e);
    }
  }
  return map;
}

const IRREG = Object.fromEntries(`
was be|were be|been be|is be|are be|am be|has have|had have|does do|did do|done do|went go|gone go|
said say|made make|took take|taken take|came come|saw see|seen see|got get|gotten get|gave give|given give|
found find|thought think|told tell|became become|left leave|felt feel|brought bring|began begin|begun begin|
kept keep|held hold|wrote write|written write|stood stand|heard hear|meant mean|met meet|ran run|paid pay|
sat sit|spoke speak|spoken speak|led lead|grew grow|grown grow|lost lose|fell fall|fallen fall|sent send|
built build|understood understand|drew draw|drawn draw|broke break|broken break|spent spend|rose rise|risen rise|
drove drive|driven drive|bought buy|wore wear|worn wear|chose choose|chosen choose|sought seek|threw throw|
thrown throw|caught catch|dealt deal|won win|forgot forget|forgotten forget|laid lay|sold sell|fought fight|
bore bear|born bear|taught teach|ate eat|eaten eat|flew fly|flown fly|sang sing|sung sing|hid hide|hidden hide|
shook shake|shaken shake|woke wake|woken wake|froze freeze|frozen freeze|stole steal|stolen steal|rode ride|
ridden ride|swam swim|swum swim|slept sleep|knew know|known know|shone shine|hung hang|bit bite|bitten bite|
blew blow|blown blow|dug dig|fed feed|fled flee|forgave forgive|lent lend|lit light|rang ring|rung ring|
sank sink|sunk sink|slid slide|struck strike|swore swear|sworn swear|tore tear|torn tear|wept weep|bent bend|
bound bind|bled bleed|bred breed|crept creep|knelt kneel|leapt leap|shot shoot|spun spin|stuck stick|stung sting|
swept sweep|swung swing|wound wind|men man|women woman|children child|feet foot|teeth tooth|mice mouse|
people person|lives life|knives knife|leaves leaf|wives wife|shelves shelf|thieves thief|wolves wolf|
better good|best good|worse bad|worst bad|further far|farther far
`.replace(/\n/g, "").split("|").map(p => p.trim().split(" ")));

const doubled = s => s.length >= 3 && s[s.length - 1] === s[s.length - 2] && !/[aeiou]/.test(s[s.length - 1]);
const strip = (t, suf, extra = []) => {
  if (!t.endsWith(suf) || t.length - suf.length < 2) return [];
  const b = t.slice(0, -suf.length);
  const out = [b, ...extra.map(x => b + x)];
  if (doubled(b)) out.push(b.slice(0, -1));
  if (b.endsWith("i")) out.push(b.slice(0, -1) + "y");
  return out;
};

// 活用形(複数形・過去形・-ing・比較級など)から考えられる原形の候補
export function inflectionBases(token) {
  const t = token.toLowerCase().replace(/[’']s$/, "");
  const out = new Set([t]);
  if (IRREG[t]) out.add(IRREG[t]);
  for (const b of [...strip(t, "s"), ...strip(t, "es"), ...strip(t, "ed", ["e"]), ...strip(t, "d"),
    ...strip(t, "ing", ["e"]), ...strip(t, "er", ["e"]), ...strip(t, "est", ["e"])]) out.add(b);
  return out;
}

// 派生形(-ly, -ness, -ful, -ment, -tion など)から考えられる元の語の候補
export function derivationBases(token) {
  const out = new Set();
  for (const t of inflectionBases(token)) {
    for (const b of [...strip(t, "ly", ["le"]), ...strip(t, "ally"), ...strip(t, "ness"), ...strip(t, "ful"), ...strip(t, "less"),
      ...strip(t, "ment"), ...strip(t, "ion", ["e"]), ...strip(t, "ation", ["e"]), ...strip(t, "able", ["e"]),
      ...strip(t, "al", ["e"]), ...strip(t, "ous", ["e"]), ...strip(t, "y", ["e"]), ...strip(t, "or", ["e"]),
      ...strip(t, "er", ["e"]), ...strip(t, "ing", ["e"]), ...strip(t, "ed", ["e"]), ...strip(t, "en", ["e"])]) out.add(b);
    if (t.startsWith("un") && t.length > 4) out.add(t.slice(2));
  }
  return out;
}

// 語形 → リストに載っている見出し語。完全一致を最優先し、次に活用、最後に派生。
// 返り値: { lemma, how: "exact" | "inflect" | "derive" } または null
export function lookup(token, levels) {
  const t = token.toLowerCase();
  if (levels.has(t)) return { lemma: t, how: "exact" };
  for (const b of inflectionBases(t)) if (b !== t && levels.has(b)) return { lemma: b, how: "inflect" };
  for (const b of derivationBases(t)) if (levels.has(b)) return { lemma: b, how: "derive" };
  return null;
}

export const tokenize = text => text.match(/[A-Za-z]+(?:[’'][A-Za-z]+)?/g) || [];

export function loadPack(dir) {
  return JSON.parse(fs.readFileSync(path.join(path.resolve(ROOT, dir), "pack.json"), "utf8"));
}
