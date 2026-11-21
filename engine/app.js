/* 物語学習エンジン。作品(パック)に依存する内容はここに書かず、packs/<id>/pack.json に置く。
   読み込むパックは index.html の <script data-pack="packs/<id>"> で指定する。 */
const PACK_DIR = (document.currentScript && document.currentScript.dataset.pack || "").replace(/\/+$/, "");
// サイトのトップへ戻るリンク。<script data-top="./"> で指定。1ファイル版などで指定がなければ pack.json の "site"
const TOP_URL = document.currentScript && document.currentScript.dataset.top || "";
let PACK = null;      // pack.json の中身
let EPISODES = [];    // PACK.episodes

/* ---------- storage (best effort) ---------- */
const store = {
  get(k, d){ try{ const v = localStorage.getItem("eiken_"+k); return v===null? d : JSON.parse(v);}catch(e){return d;} },
  set(k, v){ try{ localStorage.setItem("eiken_"+k, JSON.stringify(v)); }catch(e){} }
};
let scores = store.get("scores", {});
let rate = store.get("rate", 0.85);
let voiceName = store.get("voice", "");

/* ---------- speech ---------- */
const synth = window.speechSynthesis;
const hasSpeech = !!(synth && window.SpeechSynthesisUtterance);
let voices = [];
let token = 0;
function loadVoices(){
  if(!hasSpeech) return;
  voices = synth.getVoices().filter(v => /^en[-_]/i.test(v.lang) || v.lang === "en");
  const good = /Samantha|Ava|Allison|Evan|Zoe|Aria|Jenny|Guy|Zira|David|Mark|Google US English/i;
  const rank = v => (/en[-_]US/i.test(v.lang) ? 0 : 2) + (good.test(v.name) ? 0 : 1);
  voices.sort((a,b) => rank(a) - rank(b));
  if(voices.length && !voices.some(v => v.name === voiceName)) voiceName = voices[0].name;
  const ne = document.getElementById("noEn");
  if(ne){ ne.style.display = voices.length ? "none" : "";
    const all = synth.getVoices();
    let d = document.getElementById("noEnD");
    if(d) d.textContent = "検出された声: " + (all.length ? all.map(v => v.name + " [" + v.lang + "]").join(" / ") : "なし"); }
  const sel = document.getElementById("voiceSel");
  if(sel){
    sel.innerHTML = voices.length
      ? voices.map(v => `<option value="${v.name}" ${v.name===voiceName?"selected":""}>${v.name} (${v.lang})</option>`).join("")
      : `<option value="">標準の英語音声</option>`;
  }
}
if(hasSpeech){ loadVoices(); synth.onvoiceschanged = loadVoices; }
function speak(text, onend){
  if(!hasSpeech) { if(onend) onend(); return; }
  const my = ++token;
  try{ synth.cancel(); synth.resume(); }catch(e){}
  if(window.onPauseReset) window.onPauseReset();
  const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, "."));
  u.lang = "en-US";
  const v = voices.find(v => v.name === voiceName);
  if(v){ u.voice = v; u.lang = v.lang; }
  u.rate = rate;
  u.onend = () => { if(my === token && onend) onend(); };
  u.onerror = () => {};
  try{ synth.speak(u); }catch(e){}
}
function stopSpeak(){ token++; if(hasSpeech){ try{ synth.cancel(); synth.resume(); }catch(e){} } if(window.onPauseReset) window.onPauseReset(); }

/* ---------- bgm: 曲は pack.json の "bgm"(パックのフォルダからの相対パス)。編ごとに変えるなら parts[i].bgm ----------
   読み上げが主役なので、曲のファイル自体を小さな音量で作っておく(iPhone・iPad は音量をプログラムから変えられないため)。 */
let bgmOn = store.get("bgm", true);
let bgmVol = store.get("bgmVol", 0.6);
const bgm = new Audio(); bgm.preload = "auto";
const bgmCanVol = (() => { try{ const a = new Audio(); a.volume = 0.5; return a.volume === 0.5; }catch(e){ return false; } })();
// "bgm" は1曲(文字列)でも、複数曲の配列でもよい。配列なら1曲ずつ順番に流し、最後まで行ったら最初に戻る
let bgmList = [], bgmIdx = 0, bgmKey = "";
function bgmPlay(){
  if(!bgmList.length) return;
  try{ bgm.volume = bgmVol; }catch(e){}
  if(bgmOn && !document.hidden){ const p = bgm.play(); if(p && p.catch) p.catch(() => {}); }
  else bgm.pause();
}
function bgmLoad(){
  const src = bgmList[bgmIdx];
  bgm.loop = bgmList.length === 1;
  bgm.src = /^data:/.test(src) ? src : PACK_DIR + "/" + src;
}
function setBgm(src){
  const list = (Array.isArray(src) ? src : [src]).filter(Boolean);
  const key = list.map(s => s.slice(0, 200)).join("|");
  if(key === bgmKey) return;
  bgmKey = key; bgmList = list;
  if(!list.length){ bgm.pause(); bgm.removeAttribute("src"); return; }
  bgmIdx = Math.floor(Math.random() * list.length);   // 毎回同じ曲から始まらないように
  bgmLoad(); bgmPlay();
}
bgm.addEventListener("ended", () => { if(bgmList.length > 1){ bgmIdx = (bgmIdx + 1) % bgmList.length; bgmLoad(); bgmPlay(); } });
function setBgmOn(v){ bgmOn = v; store.set("bgm", v); bgmPlay(); }
const hasBgm = () => [PACK.bgm, ...PARTS.map(p => p.bgm)].some(b => Array.isArray(b) ? b.length : b);
// ブラウザは操作の前に音を鳴らせないので、最初のタップで始める。画面を離れたら止める
document.addEventListener("click", () => { if(bgmOn && bgmList.length && bgm.paused) bgmPlay(); }, true);
document.addEventListener("visibilitychange", bgmPlay);

/* ---------- helpers ---------- */
const app = document.getElementById("app");
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function markup(en, words){
  let out = en;
  words.forEach((w, i) => {
    w[2].forEach(f => {
      out = out.replace(new RegExp("\\b" + esc(f) + "\\b"), m => `<span class="w" data-i="${i}">${m}</span>`);
    });
  });
  return out;
}
function shuffle(a){ a = a.slice(); for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
const pop = document.getElementById("pop");
function showPop(w){ document.getElementById("popw").textContent = w[0]; document.getElementById("popm").textContent = w[1]; pop.classList.add("show"); speak(w[0]); }
document.getElementById("popx").onclick = () => pop.classList.remove("show");

/* ---------- parts: 10話ごとの「編」。名前と説明は pack.json の parts に書く(なくても動く) ---------- */
const PART_SIZE = 10;
let PARTS = [];
function buildParts(){
  const defs = PACK.parts || [];
  PARTS = Array.from({length: Math.ceil(EPISODES.length / PART_SIZE)}, (_, i) => ({
    title: "", en: "", lead: "", ...defs[i],
    no: i + 1, from: i * PART_SIZE, to: Math.min((i + 1) * PART_SIZE, EPISODES.length) }));
}
const partOf = n => Math.floor(n / PART_SIZE);
function partStat(p){
  let done = 0, known = 0, total = 0;
  for(let i = p.from; i < p.to; i++){
    if(scores[i] !== undefined) done++;
    EPISODES[i].words.forEach(w => { total++; if(wstat(w[0]) === "known") known++; });
  }
  return {done, known, total, eps: p.to - p.from};
}
function cover(p){ for(let i = p.from; i < p.to; i++) if(EPISODES[i].img) return art(i); return art(Math.min(p.from + p.no - 1, p.to - 1)); }   // 絵がまだない編は、編ごとに色の違う仮の絵

/* ---------- reading progress: how far each episode has been read (index of the furthest sentence) ---------- */
let readLog = store.get("read", {});
function markRead(n, i){ if(!(readLog[n] >= i)){ readLog[n] = i; store.set("read", readLog); } }
const isRead = n => readLog[n] >= EPISODES[n].sentences.length - 1;
function partProgress(p){
  let read = 0, next = -1;
  for(let n = p.from; n < p.to; n++){ if(isRead(n)) read++; else if(next < 0) next = n; }
  return {read, next, mid: next >= 0 && readLog[next] !== undefined};   // mid: 次の話を途中まで読んでいる
}
function resetPart(pi, all){
  const p = PARTS[pi];
  for(let n = p.from; n < p.to; n++){
    delete readLog[n];
    if(all){ delete scores[n]; EPISODES[n].words.forEach(w => delete wordLog[w[0]]); }
  }
  store.set("read", readLog);
  if(all){ store.set("scores", scores); store.set("words", wordLog); }
}

const ICON = {
  list: `<svg viewBox="0 0 24 24"><path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>`,
  quiz: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 12l3 3 5-6"/></svg>`,
  again: `<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>`,
  gear: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>`,
  home: `<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>`,
  more: `<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>`,
};

/* ---------- about: 設定の中に出すアプリの説明。文面は pack.json の about に書く ---------- */
function aboutHtml(){
  const a = PACK.about; if(!a) return "";
  const dl = rows => `<dl>${rows.map(([h, d]) => `<dt>${h}</dt><dd>${d}</dd>`).join("")}</dl>`;
  return `
    ${a.intro ? `<section class="info"><h4>このアプリについて</h4>${a.intro.map(x => `<p>${x}</p>`).join("")}</section>` : ""}
    ${a.features ? `<section class="info"><h4>特徴と使い方</h4>${dl(a.features)}</section>` : ""}
    ${a.advice ? `<section class="info"><h4>学習のアドバイス</h4>${dl(a.advice)}</section>` : ""}
    ${a.notes ? `<div class="notes">${a.notes.map(x => `<p>${x}</p>`).join("")}</div>` : ""}`;
}

/* ---------- home: メニュー、学習の状況、編の一覧(トップページ) ---------- */
let settingsOpen = false;
function home(){
  stopSpeak(); pop.classList.remove("show"); setBgm(PACK.bgm);
  const c = {known:0, review:0, wrong:0, new:0}; EPISODES.forEach(e => e.words.forEach(w => c[wstat(w[0])]++));
  const readAll = EPISODES.filter((_, n) => isRead(n)).length;
  app.innerHTML = `
    <header class="appbar">
      ${(TOP_URL || PACK.site) ? `<a class="icon" href="${TOP_URL || PACK.site}" aria-label="サイトのトップへ" title="サイトのトップへ">${ICON.home}</a>` : ""}
      <div><div class="apt">${PACK.title}</div><div class="aps">${PACK.lead}</div></div>
      <button class="icon ${settingsOpen ? "on" : ""}" id="gear" aria-label="設定">${ICON.gear}</button>
    </header>
    <div class="sheet" id="sheet" ${settingsOpen ? "" : "hidden"}>
      <h4 class="sh">読み上げの設定</h4>
      <div class="settings">
        <label>声 <select id="voiceSel"></select></label>
        <label>速さ
          <select id="rateSel">
            ${[[0.7,"ゆっくり"],[0.85,"やや遅め"],[1,"ふつう"]].map(([r,n]) => `<option value="${r}" ${r==rate?"selected":""}>${n}</option>`).join("")}
          </select>
        </label>
        ${hasBgm() ? `<label>BGM
          <select id="bgmSel">
            ${(bgmCanVol ? [[0,"オフ"],[0.35,"小さめ"],[0.6,"ふつう"],[1,"大きめ"]] : [[0,"オフ"],[bgmVol,"オン"]]).map(([v,n]) => `<option value="${v}" ${(bgmOn ? bgmVol : 0)==v?"selected":""}>${n}</option>`).join("")}
          </select>
        </label>` : ""}
        <button id="testBtn">▶ 声を試す</button>
        <div class="sample">試し読みの文: ${PACK.sampleSentence}</div>
      </div>
      ${aboutHtml()}
    </div>
    ${hasSpeech ? "" : `<div class="warn">この画面では読み上げ機能が使えないようです。SafariやChromeで直接開くと音声が出ます。</div>`}
    <div class="warn" id="noEn" style="display:none">この端末(またはこの画面)では英語の音声が見つかりません。日本語の声が英文を読むため、カタカナ読みになります。端末に英語の音声を追加してから、アプリを開き直してください。<div id="noEnD" style="margin-top:6px;color:var(--sub);font-size:12px"></div></div>
    <nav class="menu">
      <button id="mWords">${ICON.list}<span>単語リスト</span><b>${allWords().length}語</b></button>
      <button id="mQuiz">${ICON.quiz}<span>単語クイズ</span><b>編を選んで</b></button>
      <button id="mRev">${ICON.again}<span>もう一度確認</span><b>${reviewWords().length}語</b></button>
    </nav>
    <div class="stats">
      <div class="stat"><b>${readAll}<small>/${EPISODES.length}</small></b><span>読んだ話</span></div>
      ${Object.entries(WSTAT).map(([k, n]) => `<button class="stat tot ${k}" data-f="${k}"><b>${c[k]}</b><span>${n}</span></button>`).join("")}
    </div>
    <h3 class="sec">物語</h3>
    <div class="parts">
      ${PARTS.map((p, i) => { const st = partStat(p), pr = partProgress(p), eps = p.to - p.from; return `<div class="part" data-p="${i}" role="button" tabindex="0">
        <div class="cover">${cover(p)}<span class="badge ${pr.read === eps ? "done" : ""}">${pr.read === eps ? "✓ 読了" : `${pr.read} / ${eps} 話`}</span></div>
        <div class="pbody">
          <div class="pno">第${p.no}編<span>第${p.from+1}〜${p.to}話</span><button class="icon more" data-more="${i}" aria-label="記録のリセット">${ICON.more}</button></div>
          <div class="pt">${p.title || p.en}</div>
          ${p.title && p.en ? `<div class="pen">${p.en}</div>` : ""}
          <div class="pl">${p.lead}</div>
          <div class="bar"><i style="width:${Math.round(pr.read / eps * 100)}%"></i></div>
          ${pr.next >= 0
            ? `<button class="cont" data-ep="${pr.next}"><span class="cl">${pr.mid ? "続きから" : pr.read ? "次の話" : "はじめから"}</span><span class="ct">第${pr.next+1}話 ${EPISODES[pr.next].title}</span>${pr.mid ? `<span class="cs">${readLog[pr.next]+1}/${EPISODES[pr.next].sentences.length}文</span>` : ""}<span class="cgo">▶</span></button>`
            : `<div class="cont fin"><span class="cl">この編は読み終わりました</span></div>`}
          <div class="pst"><span>クイズ ${st.done}/${eps}話</span><span>覚えた ${st.known}/${st.total}語</span></div>
        </div>
        <div class="reset" hidden>
          <div class="rt">第${p.no}編の記録をリセット</div>
          <button data-r="read">読んだ位置だけ消す</button>
          <button data-r="all" class="danger">読んだ位置・クイズ・単語の記録を消す</button>
          <button data-r="cancel">やめる</button>
        </div>
      </div>`; }).join("")}
    </div>`;
  const $ = id => document.getElementById(id);
  loadVoices();
  $("gear").onclick = () => { settingsOpen = !settingsOpen; $("sheet").hidden = !settingsOpen; $("gear").classList.toggle("on", settingsOpen); };
  $("voiceSel").onchange = e => { voiceName = e.target.value; store.set("voice", voiceName); };
  $("rateSel").onchange = e => { rate = parseFloat(e.target.value); store.set("rate", rate); };
  $("testBtn").onclick = () => speak(PACK.sampleSentence);
  const bs = $("bgmSel"); if(bs) bs.onchange = e => { const v = parseFloat(e.target.value); if(v){ bgmVol = v; store.set("bgmVol", v); } setBgmOn(!!v); };
  $("mRev").onclick = reviewPage;
  $("mWords").onclick = () => wordsPage("all");
  $("mQuiz").onclick = quizPage;
  app.querySelectorAll(".tot").forEach(b => b.onclick = () => wordsPage(b.dataset.f));
  app.querySelectorAll(".part").forEach(card => {
    const i = +card.dataset.p, sheet = card.querySelector(".reset");
    card.onclick = () => { if(sheet.hidden) partPage(i); };
    card.onkeydown = ev => { if(ev.key === "Enter" && ev.target === card) partPage(i); };
    const cont = card.querySelector(".cont[data-ep]");
    if(cont) cont.onclick = ev => { ev.stopPropagation(); const n = +cont.dataset.ep; episode(n, isRead(n) ? 0 : readLog[n] || 0); };
    card.querySelector(".more").onclick = ev => { ev.stopPropagation(); sheet.hidden = false; };
    sheet.querySelectorAll("button").forEach(b => b.onclick = ev => {
      ev.stopPropagation();
      const r = b.dataset.r;
      if(r === "cancel"){ sheet.hidden = true; return; }
      if(r === "all" && !confirm(`第${i+1}編の、読んだ位置・クイズの結果・単語の記録(覚えた・不正解など)をすべて消します。よろしいですか?`)) return;
      resetPart(i, r === "all"); home();
    });
  });
  window.scrollTo(0,0);
}

/* ---------- part page: 1つの編の話の一覧 ---------- */
function partPage(i){
  stopSpeak(); pop.classList.remove("show");
  const p = PARTS[i]; setBgm(p.bgm || PACK.bgm);
  app.innerHTML = `
    <button class="back" id="back">← トップへ</button>
    <div class="phead">
      <div class="cover">${cover(p)}</div>
      <div class="ptext">
        <div class="pno">第${p.no}編<span>第${p.from+1}〜${p.to}話</span></div>
        <h2>${p.title || p.en}</h2>
        ${p.title && p.en ? `<div class="pen">${p.en}</div>` : ""}
        <div class="pl">${p.lead}</div>
      </div>
    </div>
    <div class="eplist">
      ${EPISODES.slice(p.from, p.to).map((e, k) => {
        const n = p.from + k, s = scores[n], r = readLog[n], len = e.sentences.length;
        const rd = isRead(n) ? `<span class="rd done">読んだ</span>` : r !== undefined ? `<span class="rd mid">途中 ${r+1}/${len}</span>` : `<span class="rd">未読</span>`;
        return `<button class="ep" data-ep="${n}">
          <span class="no">${n+1}</span>
          <span><div class="t">${e.title}</div><div class="j">${e.ja} ・ ${e.words.length}語</div></span>
          <span class="st">${rd}<span class="${s!==undefined?"done":""}">${s!==undefined ? `クイズ ${s}/${e.words.length}` : "クイズ未"}</span></span>
        </button>`; }).join("")}
    </div>
    <div class="pnav">
      ${i > 0 ? `<button id="pprev">← 第${i}編</button>` : "<span></span>"}
      ${i + 1 < PARTS.length ? `<button id="pnext">第${i+2}編 →</button>` : ""}
    </div>`;
  document.getElementById("back").onclick = home;
  const pv = document.getElementById("pprev"); if(pv) pv.onclick = () => partPage(i - 1);
  const nx = document.getElementById("pnext"); if(nx) nx.onclick = () => partPage(i + 1);
  app.querySelectorAll(".ep").forEach(b => b.onclick = () => { const n = +b.dataset.ep; episode(n, isRead(n) ? 0 : readLog[n] || 0); });
  window.scrollTo(0,0);
}

/* ---------- illustration (placeholder until a real picture is supplied) ---------- */
function art(n){
  const e = EPISODES[n];
  if(e.img) return `<img src="${/^data:/.test(e.img) ? e.img : PACK_DIR + "/" + e.img}" alt="">`;   // img はパックのフォルダからの相対パス
  const hue = [28, 215, 265, 150, 340][n % 5];
  let lockers = "";
  for(let i=0;i<9;i++){
    const x = 640 + i*104, seven = i === 6;
    lockers += `<rect x="${x}" y="250" width="96" height="400" rx="4" fill="${seven ? "#15161c" : "#3a4152"}" stroke="#1c2029" stroke-width="4"/>
      <rect x="${x+18}" y="280" width="60" height="8" fill="#232733"/><rect x="${x+18}" y="298" width="60" height="8" fill="#232733"/>
      <circle cx="${x+78}" cy="460" r="6" fill="${seven ? "#e0b04a" : "#1c2029"}"/>
      ${seven ? `<text x="${x+48}" y="400" text-anchor="middle" font-family="Georgia,serif" font-size="64" fill="#e0b04a" opacity=".85">7</text>` : ""}`;
  }
  let windows = "";
  for(let i=0;i<3;i++){ const x = 60 + i*180;
    windows += `<polygon points="${x},230 ${x+140},250 ${x+140},520 ${x},560" fill="hsl(${hue} 80% 60%)" opacity=".75"/>
      <polygon points="${x+20},650 ${x+190},650 ${x+420},900 ${x+120},900" fill="hsl(${hue} 80% 60%)" opacity=".12"/>`; }
  return `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs><linearGradient id="g${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 22%)"/><stop offset="1" stop-color="#0b0c12"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g${n})"/>
    <polygon points="0,650 1600,650 1600,900 0,900" fill="#0e1017"/>
    ${windows}${lockers}
    <g fill="#07080c"><circle cx="470" cy="470" r="38"/><path d="M425 700 Q430 520 470 515 Q510 520 515 700 Z"/>
      <circle cx="560" cy="450" r="40"/><path d="M512 700 Q518 505 560 498 Q602 505 608 700 Z"/></g>
  </svg>`;
}

/* ---------- episode: picture + one sentence at a time, quiz in the sidebar ---------- */
function episode(n, startAt){
  stopSpeak(); pop.classList.remove("show");
  const e = EPISODES[n]; setBgm(PARTS[partOf(n)].bgm || PACK.bgm);
  const last = e.sentences.length - 1;
  let cur = 0, auto = false;
  app.innerHTML = `
    <button class="back" id="back">← 第${partOf(n)+1}編へ</button>
    <div class="layout">
      <div class="main">
        <div class="stage">
          <div class="art">${art(n)}</div>
          <div class="eptitle">${n+1}. ${e.title}<span>${e.ja}</span></div>
          <div class="caption" id="cap">
            <div class="en" id="capEn"></div>
            <div class="ja" id="capJa"></div>
            <div class="hint" id="capHint">文をタップすると日本語訳</div>
          </div>
        </div>
        <div class="nav">
          <button id="prev">◀ 前へ</button>
          <button id="say">▶ 聞く</button>
          <button id="autoBtn">通して聞く</button>
          <button id="pauseBtn">⏸ 一時停止</button>
          ${hasBgm() ? `<button id="bgmBtn" class="${bgmOn ? "on" : ""}">♪ BGM</button>` : ""}
          <span class="count" id="count"></span>
          <button class="primary" id="next">次へ ▶</button>
        </div>
        <h3>この話の単語(タップで日本語訳と発音)</h3>
        <div class="h3j">訳を見た単語は「もう一度確認する単語」に入ります。</div>
        <div class="vocab">
          ${e.words.map((w,i) => `<button data-i="${i}"><span class="vw">${w[0]}</span><span class="vm">タップで訳</span></button>`).join("")}
        </div>
      </div>
      <aside class="side" id="side"></aside>
    </div>`;
  const $ = id => document.getElementById(id);
  function setAuto(v){ auto = v; $("autoBtn").classList.toggle("on", v); $("autoBtn").textContent = v ? "■ 止める" : "通して聞く"; }
  function say(){ speak(e.sentences[cur][0], () => { if(!auto) return; if(cur < last) show(cur+1, true); else setAuto(false); }); }
  function show(i, speakIt){
    cur = i; markRead(n, i);
    $("capEn").innerHTML = markup(e.sentences[i][0], e.words);
    $("capJa").textContent = e.sentences[i][1];
    $("capJa").style.display = "none"; $("capHint").style.display = "";
    $("count").textContent = (i+1) + " / " + e.sentences.length;
    $("prev").disabled = i === 0;
    $("next").textContent = i < last ? "次へ ▶" : n+1 >= EPISODES.length ? "トップへ" : partOf(n+1) === partOf(n) ? "次の話へ ▶" : `第${partOf(n+1)+1}編へ ▶`;
    $("capEn").querySelectorAll(".w").forEach(w => w.onclick = ev => { ev.stopPropagation(); setAuto(false); showPop(e.words[+w.dataset.i]); });
    if(speakIt) say();
  }
  let paused = false;
  function setPaused(v){ paused = v; const b = $("pauseBtn"); if(b){ b.classList.toggle("on", v); b.textContent = v ? "▶ 再開" : "⏸ 一時停止"; } }
  window.onPauseReset = () => setPaused(false);
  $("pauseBtn").onclick = () => {
    if(!hasSpeech) return;
    if(paused){ try{ synth.resume(); }catch(e){} setPaused(false); }
    else if(synth.speaking){ try{ synth.pause(); }catch(e){} setPaused(true); }
  };
  if($("bgmBtn")) $("bgmBtn").onclick = () => { setBgmOn(!bgmOn); $("bgmBtn").classList.toggle("on", bgmOn); };
  $("back").onclick = () => partPage(partOf(n));
  $("cap").onclick = () => { const j = $("capJa"); const on = j.style.display === "none"; j.style.display = on ? "block" : "none"; $("capHint").style.display = on ? "none" : ""; };
  $("prev").onclick = () => { setAuto(false); if(cur > 0) show(cur-1, true); };
  $("say").onclick = () => { setAuto(false); say(); };
  $("autoBtn").onclick = () => { if(auto){ setAuto(false); stopSpeak(); } else { setAuto(true); say(); } };
  $("next").onclick = () => { setAuto(false); if(cur < last) show(cur+1, true); else if(n+1 >= EPISODES.length) home(); else if(partOf(n+1) === partOf(n)) episode(n+1); else partPage(partOf(n+1)); };
  const quiz = sideQuiz(n, $("side"), () => setAuto(false));
  // 下の単語一覧: 訳は隠しておき、タップで見せる。訳を見た単語は「もう一度確認」に入れる
  app.querySelectorAll(".vocab button").forEach(b => b.onclick = () => {
    const w = e.words[+b.dataset.i];
    setAuto(false); speak(w[0]);
    if(b.classList.contains("open")) return;
    b.classList.add("open"); b.querySelector(".vm").textContent = w[1];
    record(w[0], "peek"); quiz.refresh();
  });
  show(Math.min(Math.max(startAt || 0, 0), last), true);
  window.scrollTo(0,0);
}

/* ---------- word log: tells "really knows it" apart from a lucky guess ---------- */
let wordLog = store.get("words", {});
function wstat(w){ const r = wordLog[w]; if(!r) return "new"; if(r.l === "x") return "wrong"; if(r.s >= 2) return "known"; return "review"; }
function record(w, kind){
  const r = wordLog[w] || {s:0, n:0};
  if(kind === "ok"){ r.n++; r.s++; r.l = "o"; }
  else if(kind === "luck"){ r.s = 0; r.l = "m"; }
  else if(kind === "peek"){ r.s = 0; if(r.l !== "x") r.l = "m"; }   // 訳を見た: 不正解の単語は不正解のまま
  else { r.n++; r.s = 0; r.l = "x"; }
  wordLog[w] = r; store.set("words", wordLog);
}

/* ---------- "check again" page: all review words across episodes, tap to jump to the example ---------- */
function sentenceIndex(e, w){ return e.sentences.findIndex(s => w[2].some(f => new RegExp("\\b"+esc(f)+"\\b").test(s[0]))); }
function reviewWords(){
  const seen = new Set(), rows = [];
  EPISODES.forEach((e, n) => e.words.forEach(w => {
    if(wstat(w[0]) !== "review" || seen.has(w[0])) return;
    seen.add(w[0]); rows.push({n, w, si: sentenceIndex(e, w)});
  }));
  return rows;
}
function reviewPage(){
  stopSpeak(); pop.classList.remove("show");
  const rows = reviewWords();
  app.innerHTML = `
    <button class="back" id="back">← トップへ</button>
    <h2>もう一度確認する単語</h2>
    <div class="h2j">1回だけ正解した単語、「まぐれ」と申告した単語、話の下の一覧で訳を見た単語です。単語をタップすると例文に移動します。</div>
    <div class="rvlist">${rows.length ? rows.map((r, k) => `<div class="rv">
      <button class="sp" data-k="${k}" aria-label="発音を聞く">▶</button>
      <button class="go" data-k="${k}"><span class="vw">${r.w[0]}</span><span class="vm">${r.w[1]}</span><span class="to">${r.n+1}. ${EPISODES[r.n].title} の例文へ →</span></button>
    </div>`).join("") : `<div class="lead">まだありません</div>`}</div>`;
  document.getElementById("back").onclick = home;
  app.querySelectorAll(".rv .sp").forEach(b => b.onclick = () => speak(rows[+b.dataset.k].w[0]));
  app.querySelectorAll(".rv .go").forEach(b => b.onclick = () => { const r = rows[+b.dataset.k]; episode(r.n, r.si); });
  window.scrollTo(0,0);
}

/* ---------- word list: every word in story order, filter by status, tap to jump to the example ---------- */
const WSTAT = {known:"覚えた", review:"もう一度確認", wrong:"不正解", new:"未出題"};
function allWords(){
  const seen = new Set(), rows = [];
  EPISODES.forEach((e, n) => e.words.forEach(w => { if(seen.has(w[0])) return; seen.add(w[0]); rows.push({n, w}); }));
  return rows;
}
let wordsOpen = null;   // 単語リストで開いている編・話(画面を移っても覚えておく)
function wordsPage(filter){
  stopSpeak(); pop.classList.remove("show");
  const rows = allWords().map(r => ({...r, st: wstat(r.w[0])}));
  const count = k => k === "all" ? rows.length : rows.filter(r => r.st === k).length;
  if(!wordsOpen){ const nx = EPISODES.findIndex((_, i) => scores[i] === undefined); wordsOpen = new Set(nx >= 0 ? ["p" + partOf(nx)] : []); }
  app.innerHTML = `
    <button class="back" id="back">← トップへ</button>
    <h2>単語リスト</h2>
    <div class="h2j">編と話ごとに分けています。見出しをタップで開閉、▶で発音、単語をタップするとその単語が出てくる例文に移動します。</div>
    <div class="wfilter">${[["all","すべて"], ...Object.entries(WSTAT)].map(([k, n]) => `<button data-f="${k}" class="${k === filter ? "on" : ""}">${n}<b>${count(k)}</b></button>`).join("")}</div>
    <input type="search" id="wq" class="wsearch" placeholder="英語か日本語で探す" autocomplete="off">
    <div id="wl"></div>`;
  const wl = document.getElementById("wl"), wq = document.getElementById("wq");
  let shown = [];
  function draw(){
    const q = wq.value.trim().toLowerCase();
    shown = rows.filter(r => (filter === "all" || r.st === filter) && (!q || r.w[0].toLowerCase().includes(q) || r.w[1].includes(q)));
    const isOpen = id => !!q || wordsOpen.has(id);   // 検索中は当たった編・話をすべて開く
    const byEp = {}; shown.forEach((r, k) => (byEp[r.n] = byEp[r.n] || []).push(k));
    const html = PARTS.map((p, pi) => {
      const eps = []; for(let n = p.from; n < p.to; n++) if(byEp[n]) eps.push(n);
      if(!eps.length) return "";
      const total = eps.reduce((t, n) => t + byEp[n].length, 0);
      return `<details class="wpart" data-id="p${pi}" ${isOpen("p" + pi) ? "open" : ""}>
        <summary><span class="pno">第${p.no}編</span><span class="wpt">${p.title || p.en}</span><b>${total}語</b></summary>
        ${eps.map(n => `<details class="wep" data-id="e${n}" ${isOpen("e" + n) ? "open" : ""}>
          <summary><span class="no">${n+1}</span><span class="t">${EPISODES[n].title}</span><span class="j">${EPISODES[n].ja}</span><b>${byEp[n].length}語</b></summary>
          <div class="rvlist">${byEp[n].map(k => { const r = shown[k]; return `<div class="rv">
            <button class="sp" data-k="${k}" aria-label="発音を聞く">▶</button>
            <button class="go" data-k="${k}"><span class="vw">${r.w[0]}</span><span class="vm">${r.w[1]}</span><span class="ws ${r.st}">${WSTAT[r.st]}</span></button>
          </div>`; }).join("")}</div>
        </details>`).join("")}
      </details>`; }).join("");
    wl.innerHTML = html || `<div class="lead">該当する単語はありません</div>`;
    wl.querySelectorAll(".sp").forEach(b => b.onclick = () => speak(shown[+b.dataset.k].w[0]));
    wl.querySelectorAll(".go").forEach(b => b.onclick = () => { const r = shown[+b.dataset.k]; episode(r.n, sentenceIndex(EPISODES[r.n], r.w)); });
    wl.querySelectorAll("details").forEach(d => d.ontoggle = () => { if(q) return; d.open ? wordsOpen.add(d.dataset.id) : wordsOpen.delete(d.dataset.id); });
  }
  app.querySelectorAll(".wfilter button").forEach(b => b.onclick = () => {
    filter = b.dataset.f; app.querySelectorAll(".wfilter button").forEach(x => x.classList.toggle("on", x === b)); draw();
  });
  wq.oninput = draw;
  document.getElementById("back").onclick = home;
  draw();
  window.scrollTo(0,0);
}

/* ---------- word quiz page: pick parts, then a run of meaning questions ---------- */
const QMODE = {nk:"覚えた以外", weak:"不正解・もう一度確認", new:"未出題", all:"全部"};
function quizPage(){
  stopSpeak(); pop.classList.remove("show"); setBgm(PACK.bgm);
  const sel = store.get("quizSel", {parts: [], mode: "nk", size: 20});
  const nx = EPISODES.findIndex((_, i) => scores[i] === undefined);
  if(!sel.parts.length) sel.parts = [nx >= 0 ? partOf(nx) : 0];
  const pool = () => { const out = [];
    sel.parts.forEach(pi => { const p = PARTS[pi]; for(let n = p.from; n < p.to; n++) EPISODES[n].words.forEach(w => {
      const st = wstat(w[0]);
      if(sel.mode === "all" || (sel.mode === "weak" && (st === "wrong" || st === "review")) || (sel.mode === "new" && st === "new") || (sel.mode === "nk" && st !== "known")) out.push({n, w});
    }); });
    return out; };
  app.innerHTML = `
    <button class="back" id="back">← トップへ</button>
    <h2>単語クイズ</h2>
    <div class="h2j">出題する編と単語を選んでください。2回続けて正解すると「覚えた」になります。</div>
    <h3>編(いくつでも選べます)</h3>
    <div class="qparts">${PARTS.map((p, i) => { const st = partStat(p); return `<button data-p="${i}">
      <span class="pno">第${p.no}編</span><span class="qpt">${p.title || p.en}</span><span class="qpk">覚えた ${st.known} / ${st.total} 語</span></button>`; }).join("")}</div>
    <div class="qall"><button id="qAll">すべて選ぶ</button><button id="qNone">選択を外す</button></div>
    <h3>出題する単語</h3>
    <div class="wfilter" id="qMode">${Object.entries(QMODE).map(([k, n]) => `<button data-m="${k}">${n}</button>`).join("")}</div>
    <h3>問題数</h3>
    <div class="wfilter" id="qSize">${[[10,"10問"],[20,"20問"],[50,"50問"],[0,"全部"]].map(([k, n]) => `<button data-s="${k}">${n}</button>`).join("")}</div>
    <button class="primary qstart" id="qGo"></button>`;
  const $ = id => document.getElementById(id);
  function refresh(){
    const c = pool().length, q = sel.size ? Math.min(sel.size, c) : c;
    app.querySelectorAll(".qparts button").forEach(b => b.classList.toggle("on", sel.parts.includes(+b.dataset.p)));
    app.querySelectorAll("#qMode button").forEach(b => b.classList.toggle("on", b.dataset.m === sel.mode));
    app.querySelectorAll("#qSize button").forEach(b => b.classList.toggle("on", +b.dataset.s === sel.size));
    $("qGo").disabled = !q;
    $("qGo").textContent = !sel.parts.length ? "編を選んでください" : q ? `はじめる(${q}問 / 対象 ${c}語)` : "対象の単語がありません";
    store.set("quizSel", sel);
  }
  app.querySelectorAll(".qparts button").forEach(b => b.onclick = () => { const i = +b.dataset.p;
    sel.parts = sel.parts.includes(i) ? sel.parts.filter(x => x !== i) : [...sel.parts, i].sort((a, b) => a - b); refresh(); });
  $("qAll").onclick = () => { sel.parts = PARTS.map((_, i) => i); refresh(); };
  $("qNone").onclick = () => { sel.parts = []; refresh(); };
  app.querySelectorAll("#qMode button").forEach(b => b.onclick = () => { sel.mode = b.dataset.m; refresh(); });
  app.querySelectorAll("#qSize button").forEach(b => b.onclick = () => { sel.size = +b.dataset.s; refresh(); });
  $("back").onclick = home;
  $("qGo").onclick = () => {
    const PRI = {wrong:0, review:1, new:2, known:3};
    let items = shuffle(pool()).sort((a, b) => PRI[wstat(a.w[0])] - PRI[wstat(b.w[0])]);   // 苦手な単語から先に選ぶ
    if(sel.size) items = shuffle(items.slice(0, sel.size));
    quizRun(items, sel);
  };
  refresh();
  window.scrollTo(0,0);
}
function quizRun(items, sel){
  stopSpeak();
  const allMeanings = EPISODES.flatMap(x => x.words.map(w => w[1]));
  const label = sel.parts.length === PARTS.length ? "全編" : sel.parts.map(i => "第" + (i + 1) + "編").join("・");
  let pos = 0, right = 0; const missed = [];
  app.innerHTML = `
    <button class="back" id="back">← 条件を選び直す</button>
    <div class="qbox" id="qz"></div>`;
  const qz = document.getElementById("qz");
  document.getElementById("back").onclick = quizPage;
  function ask(speakIt){
    if(pos >= items.length) return finish();
    const {n, w} = items[pos], e = EPISODES[n];
    const opts = shuffle([w[1], ...shuffle(allMeanings.filter(m => m !== w[1])).slice(0,3)]);
    const si = sentenceIndex(e, w), ctx = si >= 0 ? e.sentences[si] : null;
    qz.innerHTML = `
      <div class="qhead"><span>${label}・${QMODE[sel.mode]}</span><span class="prog">${pos+1} / ${items.length}</span></div>
      <div class="qbar"><i style="width:${Math.round(pos / items.length * 100)}%"></i></div>
      <div class="qword"><button class="sp" id="qsay" aria-label="発音を聞く">▶</button><span>${w[0]}</span></div>
      <div class="ctx" id="qctx"></div>
      <div class="opts">${opts.map(o => `<button data-o="${o}">${o}</button>`).join("")}
        <button class="dk" data-o="">わからない</button></div>
      <div id="qafter" style="display:none;margin-top:12px">
        <div class="qafter2">
          <button id="qluck" style="display:none">まぐれで当たった</button>
          <button id="qex">${n+1}. ${e.title} の例文へ</button>
        </div>
        <button class="primary" id="qnext" style="width:100%;margin-top:8px">次へ</button>
      </div>`;
    qz.querySelector("#qsay").onclick = () => speak(w[0]);
    let done = false;
    qz.querySelectorAll(".opts button").forEach(b => b.onclick = () => {
      if(done) return; done = true;
      const ok = b.dataset.o === w[1];
      qz.querySelectorAll(".opts button").forEach(x => { if(x.dataset.o === w[1]) x.classList.add("right"); });
      if(ok){ right++; record(w[0], "ok"); } else { b.classList.add("wrong"); record(w[0], "ng"); missed.push(items[pos]); }
      qz.querySelector("#qctx").innerHTML = ctx ? `${ctx[0]}<div class="cj">${ctx[1]}</div>` : "";
      qz.querySelector("#qafter").style.display = "";
      const luck = qz.querySelector("#qluck");
      if(ok){ luck.style.display = ""; luck.onclick = () => { right--; record(w[0], "luck"); missed.push(items[pos]); luck.disabled = true; luck.textContent = "「もう一度確認」に入れました"; }; }
      qz.querySelector("#qex").onclick = () => episode(n, si);
    });
    qz.querySelector("#qnext").onclick = () => { pos++; ask(true); };
    if(speakIt) speak(w[0]);
  }
  function finish(){
    qz.innerHTML = `
      <div class="qhead"><span>${label}・${QMODE[sel.mode]}</span><span class="prog">結果</span></div>
      <div class="result">${right} / ${items.length} 正解</div>
      ${missed.length ? `<div class="qmiss">${missed.map(r => `<div><span class="vw">${r.w[0]}</span><span class="vm">${r.w[1]}</span></div>`).join("")}</div>
        <button class="primary" id="qagain" style="width:100%;margin-bottom:8px">間違えた ${missed.length} 語をもう一度</button>` : ""}
      <button id="qmore" style="width:100%;margin-bottom:8px">同じ条件で次の問題へ</button>
      <button id="qsel" style="width:100%">条件を選び直す</button>`;
    const ag = qz.querySelector("#qagain"); if(ag) ag.onclick = () => quizRun(shuffle(missed), sel);
    qz.querySelector("#qmore").onclick = () => { quizPage(); const g = document.getElementById("qGo"); if(!g.disabled) g.click(); };
    qz.querySelector("#qsel").onclick = quizPage;
  }
  ask(true);
  window.scrollTo(0,0);
}

/* ---------- sidebar quiz: pick the meaning of the word ---------- */
function sideQuiz(n, el, onUse){
  const e = EPISODES[n];
  const allMeanings = EPISODES.flatMap(x => x.words.map(w => w[1]));
  const PRI = {wrong:0, review:1, new:2, known:3};
  el.innerHTML = `<div id="qz"></div><div class="lists" id="ql"></div>`;
  const qz = el.querySelector("#qz"), ql = el.querySelector("#ql");
  let order, pos, right, openList = "wrong";
  function lists(){
    const g = {wrong:[], review:[], known:[]};
    e.words.forEach((w,i) => { const s = wstat(w[0]); if(g[s]) g[s].push(i); });
    const sec = (k, label) => `<details data-k="${k}" ${openList===k?"open":""}><summary>${label} <b>${g[k].length}</b></summary>
      <div class="wl">${g[k].length ? g[k].map(i => `<button data-i="${i}"><span class="vw">${e.words[i][0]}</span><span class="vm">${e.words[i][1]}</span></button>`).join("") : `<div class="none">まだありません</div>`}</div></details>`;
    ql.innerHTML = sec("wrong","不正解だった単語")
      + `<button class="tolist" id="qrev">もう一度確認する単語 <b>${reviewWords().length}</b><span>一覧へ →</span></button>`
      + sec("known","覚えた単語")
      + `<div class="note">「覚えた」になるのは2回続けて正解したとき。1回だけの正解、「まぐれ」、下の一覧で訳を見た単語は「もう一度確認」に入ります。</div>`;
    ql.querySelectorAll("details").forEach(d => d.ontoggle = () => { if(d.open) openList = d.dataset.k; });
    ql.querySelector("#qrev").onclick = () => { onUse(); reviewPage(); };
    ql.querySelectorAll(".wl button").forEach(b => b.onclick = () => { onUse(); speak(e.words[+b.dataset.i][0]); });
  }
  function start(weakOnly){
    let idx = e.words.map((_,i) => i);
    if(weakOnly) idx = idx.filter(i => ["wrong","review"].includes(wstat(e.words[i][0])));
    order = shuffle(idx).sort((a,b) => PRI[wstat(e.words[a][0])] - PRI[wstat(e.words[b][0])]);
    pos = 0; right = 0; ask(false);
  }
  function ask(speakIt){
    lists();
    if(pos >= order.length) return finish();
    const w = e.words[order[pos]];
    const opts = shuffle([w[1], ...shuffle(allMeanings.filter(m => m !== w[1])).slice(0,3)]);
    const ctx = e.sentences.find(s => w[2].some(f => new RegExp("\\b"+esc(f)+"\\b").test(s[0])));
    qz.innerHTML = `
      <div class="qhead"><span>単語クイズ</span><span class="prog">${pos+1} / ${order.length}</span></div>
      <div class="qword"><button class="sp" id="qsay" aria-label="発音を聞く">▶</button><span>${w[0]}</span></div>
      <div class="ctx" id="qctx"></div>
      <div class="opts">${opts.map(o => `<button data-o="${o}">${o}</button>`).join("")}
        <button class="dk" data-o="">わからない</button></div>
      <div id="qafter" style="display:none;margin-top:10px">
        <button id="qluck" style="display:none;width:100%;margin-bottom:8px">まぐれで当たった</button>
        <button class="primary" id="qnext" style="width:100%">次へ</button>
      </div>`;
    qz.querySelector("#qsay").onclick = () => { onUse(); speak(w[0]); };
    let done = false;
    qz.querySelectorAll(".opts button").forEach(b => b.onclick = () => {
      if(done) return; done = true; onUse();
      const ok = b.dataset.o === w[1];
      qz.querySelectorAll(".opts button").forEach(x => { if(x.dataset.o === w[1]) x.classList.add("right"); });
      if(ok){ right++; record(w[0], "ok"); } else { b.classList.add("wrong"); record(w[0], "ng"); }
      qz.querySelector("#qctx").textContent = ctx ? ctx[0] : "";
      qz.querySelector("#qafter").style.display = "";
      const luck = qz.querySelector("#qluck");
      if(ok){ luck.style.display = ""; luck.onclick = () => { right--; record(w[0], "luck"); luck.disabled = true; luck.textContent = "「もう一度確認」に入れました"; lists(); }; }
      lists();
    });
    qz.querySelector("#qnext").onclick = () => { pos++; ask(true); };
    if(speakIt) speak(w[0]);
  }
  function finish(){
    if(order.length === e.words.length){ scores[n] = Math.max(right, scores[n] || 0); store.set("scores", scores); }
    const weak = e.words.filter(w => ["wrong","review"].includes(wstat(w[0]))).length;
    qz.innerHTML = `
      <div class="qhead"><span>単語クイズ</span><span class="prog">結果</span></div>
      <div class="result">${right} / ${order.length} 正解</div>
      ${weak ? `<button class="primary" id="qweak" style="width:100%;margin-bottom:8px">不正解・確認中の ${weak} 語だけ出題</button>` : ""}
      <button id="qretry" style="width:100%">全部もう一度</button>`;
    qz.querySelector("#qretry").onclick = () => start(false);
    const wk = qz.querySelector("#qweak"); if(wk) wk.onclick = () => start(true);
  }
  start(false);
  return {refresh: lists};
}

/* ---------- start: load the pack, then show the list ---------- */
async function boot(){
  try{
    if(window.__PACK__) PACK = window.__PACK__;   // 1ファイル版: パックが埋め込まれている
    else {
      if(!PACK_DIR) throw new Error("data-pack が指定されていません");
      const res = await fetch(PACK_DIR + "/pack.json");
      if(!res.ok) throw new Error("HTTP " + res.status);
      PACK = await res.json();
    }
  }catch(err){
    app.innerHTML = `<div class="warn">物語データ(${PACK_DIR}/pack.json)を読み込めませんでした。<br>
      index.html をダブルクリックで直接開いた場合は読み込めません。フォルダで <code>node tools/serve.mjs</code> を実行し、表示されたアドレスをブラウザで開いてください。
      <div style="margin-top:6px;color:var(--sub);font-size:12px">${String(err && err.message || err)}</div></div>`;
    return;
  }
  EPISODES = PACK.episodes;
  buildParts();
  if(PACK.docTitle) document.title = PACK.docTitle;
  home();
}
boot();
