// Claude デスクトップ(Claude in Chrome)に渡す、Gemini での挿絵づくりの指示文を作る。
// 使い方: node tools/build-gemini-brief.mjs <出力先.md> [--from 2] [--to 20] [パックのフォルダ(既定 packs/locker7)]
//   プロンプトは <パック>/img/prompts-*.md の「## 第N話 タイトル」と直後のコードブロックから取る。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./lib/words.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i < 0 ? def : args.splice(i, 2)[1]; };
const from = Number(opt("--from", 2)), to = Number(opt("--to", 9999));
const out = args[0];
const packDir = path.resolve(ROOT, args[1] || "packs/locker7");
if (!out) { console.error("出力先を指定してください"); process.exit(1); }

const imgDir = path.join(packDir, "img");
const eps = [];
for (const f of fs.readdirSync(imgDir).filter(f => /^prompts.*\.md$/.test(f)).sort()) {
  const text = fs.readFileSync(path.join(imgDir, f), "utf8");
  for (const m of text.matchAll(/^## 第(\d+)話 (.+?)(?:\(.*\))?\r?\n+```\r?\n([\s\S]*?)\r?\n```/gm)) {
    eps.push({ n: Number(m[1]), title: m[2].trim(), prompt: m[3].trim() });
  }
}
const pack = JSON.parse(fs.readFileSync(path.join(packDir, "pack.json"), "utf8"));
const todo = eps.filter(e => e.n >= from && e.n <= to && !pack.episodes[e.n - 1]?.img).sort((a, b) => a.n - b.n);
if (!todo.length) { console.error("対象の話がありません"); process.exit(1); }
const ref = path.join(imgDir, "ep1.jpg");
const first = todo[0].n, last = todo.at(-1).n;

const brief = `# 依頼: Gemini で挿絵を ${todo.length} 枚作り、ダウンロードしてください

ブラウザで Gemini(https://gemini.google.com/app)を操作してください。Claude in Chrome でも、Claude アプリ内蔵のブラウザでも、使えるほうでかまいません。
英語学習用の物語アプリの挿絵で、第${first}話〜第${last}話の ${todo.length} 枚が必要です。プロンプトはこの文書の最後にすべて書いてあります。
途中で私に確認は取らず、最後の1枚まで続けてください。止まってよいのは「止まる場合」に書いた場合だけです。
${first > 2 ? `
これは前回の続きです。第${first - 1}話までの絵はすでに保存して取り込み済みなので、作り直さないでください。前回使った Gemini のチャットには私自身のやりとりが混ざっているので使わず、必ず新しいチャットで始めてください。
` : ""}
## 手順

1. Gemini を新しいタブで開き、新しいチャットを始める。画像生成のツール(「画像を作成」など)が選べるなら選ぶ。
2. 最初のメッセージには、参照用の絵を1枚添付する。全話で人物の顔・服・画風をそろえるためのもの。
   ファイル: \`${ref}\`
   添付できないときは、私に「この画像を Gemini の入力欄にドラッグしてください」と頼み、添付されたら続ける。
3. 第${first}話のプロンプトを**一字も変えずに**貼って送信する。
4. 絵ができるまで待つ(1枚に1分ほどかかることがある)。
5. できた絵を下の「合格の条件」で確かめる。
6. 合格なら、絵にカーソルを重ねて出る「フルサイズでダウンロード」のボタンで保存する。保存先はブラウザの既定のダウンロードフォルダ(\`${path.join(os.homedir(), "Downloads")}\`)のままでよい。名前の変更もいらない。
7. **同じチャットのまま**次の話のプロンプトを送り、4〜6 を繰り返す。必ず話番号の小さい順に進める。

## 合格の条件

- 横長の絵が1枚できていて、その話の場面だとわかる。
- 残酷な描写がない。

これだけ満たせば合格。**細かい違和感は気にせず、そのまま保存して次へ進む。** 看板に文字のような模様がある、人物の服や髪型が少し違う、小物の位置や人数がプロンプトと違う、といった点では作り直さない。Gemini の生成回数は少ないので、作り直しに使わない。

作り直すのは、絵が出なかった、縦長や別物の絵になった、残酷な描写がある、のどれかのときだけ。同じチャットで同じプロンプトをそのまま送り直す。作り直しは1話につき1回まで。それでもだめなら、その話は飛ばして次へ進み、報告に書く。

## 必ず守ること

- **ダウンロードは1話につき1枚だけ、話番号の順に。** あとで保存日時の順に ep${first}.jpg、ep${first + 1}.jpg…と名前を付けるので、順番が崩れたり余分な1枚が混ざったりすると、絵と話がずれる。
- 不合格の絵はダウンロードしない。まちがえて余分に保存したら、何話のあとに何枚余分があるかを報告に書く。
- ブラウザが「複数のファイルのダウンロードを許可しますか」と聞いたら許可する。
- 1枚のダウンロードが終わったのを確かめてから、次の話のプロンプトを送る。保存が止まって何枚かまとめて完了すると、保存日時の順が崩れる。崩れたときは、絵の中身を見て「どのファイルが何話か」の表を報告に書く。
- プロンプトは書き換えない。
- Gemini 以外のページは開かない。Google アカウントの設定、Gemini の設定、ほかのチャットにはさわらない。

## 止まる場合

次のときは、そこで止めて「何話まで保存したか」を報告する。

- ログイン、本人確認、支払いの画面が出た。
- 画像生成の回数制限に達したと表示された。${todo.length} 枚は1日の上限を超えるかもしれないので、途中で止まってかまわない。残りは後日、続きの話から再開する。
- 2話続けて生成が失敗した、または断られた(1話だけなら飛ばして続け、報告に書く)。
- チャットが長くなって応答しなくなった。この場合は新しいチャットで参照用の絵を添付し直し、続きの話から再開してよい。

## 終わったら

次の内容を報告する。途中で止まった場合も同じ。ファイルに書けるなら \`${path.join(imgDir, "claude-desktop-report.md")}\` を上書きし、書けなければチャットに書く。

- 保存した枚数と、「話番号とファイル名」の表(保存した順)
- 作り直した話、飛ばした話、余分に保存した絵

## プロンプト

${todo.map(e => `### 第${e.n}話 ${e.title}\n\n\`\`\`\n${e.prompt}\n\`\`\``).join("\n\n")}
`;
fs.writeFileSync(out, brief);
console.log(`${out}  第${first}〜${last}話の ${todo.length} 枚ぶん`);
