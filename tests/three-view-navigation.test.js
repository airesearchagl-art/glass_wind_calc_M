'use strict';

/**
 * Phase 2L-B2 / S3-B3B2-B2: 目的別の 3 画面（単一ケース / 複数ケース（Workspace） / Project Pack（未レビュー））。
 *
 *   - 3 つの画面は排他的（表示は常に 1 つ）。未知の値では何も変えない
 *   - タブは WAI-ARIA の tab pattern（tablist / tab / tabpanel、aria-selected・aria-controls・aria-labelledby、
 *     選んだタブだけ tabindex=0、←→ / Home / End）。隠れる画面の中に focus を残さない
 *   - Project Pack 欄は内部構造を変えずに Project Pack の画面（#view-pack）へ移し、単一ケース・Workspace の画面には出さない
 *   - 画面の切替は表示だけ（計算・Import / Export・保存・URL 反映をしない）。単一ケース・Workspace の鮮度の判定は従来どおり
 *   - Project Pack の画面は印刷しない
 *
 * 前半は index.html の静的な検査、後半は setView() / onViewTabKeydown() を vm で動かす挙動の検査（最小の偽 DOM）。
 * 実ブラウザは tools/browser-checks/three-view-navigation.mjs。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { inlineScripts, stripComments } = require('./support/inline-script.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const CSS = HTML.slice(HTML.indexOf('<style>'), HTML.indexOf('</style>'));
const CODE = stripComments(inlineScripts(HTML));
const VIEWS = ['single', 'batch', 'pack'];

/** top-level の関数 1 つ（次の top-level の function / var の手前まで）。 */
function fnBody(name) {
  const start = CODE.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const ends = ['\nfunction ', '\nvar '].map((m) => CODE.indexOf(m, start + 1)).filter((i) => i !== -1);
  return CODE.slice(start + 1, ends.length > 0 ? Math.min(...ends) : CODE.length);
}
/** 開始 tag から、その要素の終わりまで（同じ tag 名の入れ子を数える）。 */
function element(src, openTagStart) {
  const tag = /^<([a-z]+)/.exec(src.slice(openTagStart))[1];
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'g');
  re.lastIndex = openTagStart;
  let depth = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return src.slice(openTagStart, re.lastIndex);
  }
  throw new Error('閉じていない: ' + tag);
}
/** 画面（#view-*）の要素全体の markup。 */
const panelMarkup = (view) => element(STATIC, STATIC.lastIndexOf('<', STATIC.indexOf('id="view-' + view + '"')));
const ruleBody = (selectorRe) => { const m = new RegExp(selectorRe + '\\s*\\{([^}]*)\\}').exec(CSS); return m ? m[1] : null; };

/* ============================================================
   静的な検査
============================================================ */

test('P2L-S3B3B2B2-T01: タブは tablist / tab で、各タブは実在の tabpanel を aria-controls で指し、panel はタブで名前が付く', () => {
  assert.match(STATIC, /<div class="view-switch" role="tablist" aria-label="表示する画面" onkeydown="onViewTabKeydown\(event\)">/);
  const tabs = [...STATIC.matchAll(/<button type="button" id="view-tab-(\w+)" class="view-tab( is-active)?" role="tab"\s+aria-selected="(true|false)" aria-controls="view-(\w+)" tabindex="(0|-1)" onclick="setView\('(\w+)'\)">([^<]+)<\/button>/g)];
  assert.deepEqual(tabs.map((m) => m[1]), VIEWS, 'タブの並び（単一ケース / 複数ケース / Project Pack）');
  tabs.forEach((m) => {
    const [, name, active, selected, controls, tabindex, onclick] = m;
    assert.equal(controls, name);
    assert.equal(onclick, name);
    assert.equal(selected === 'true', name === 'single', '既定で選ばれているのは単一ケースだけ');
    assert.equal(!!active, name === 'single');
    assert.equal(tabindex, name === 'single' ? '0' : '-1', '選んだタブだけが tabindex=0');
  });
  assert.deepEqual(tabs.map((m) => m[7]), ['単一ケース', '複数ケース（Workspace）', 'Project Pack（未レビュー）']);
  // panel: 実在し、tabpanel で、タブで名前が付き、既定で見えるのは単一ケースだけ
  VIEWS.forEach((v) => {
    const open = new RegExp('<div class="[a-z-]+" id="view-' + v + '" role="tabpanel" aria-labelledby="view-tab-' + v + '"( hidden)?>').exec(STATIC);
    assert.ok(open, v + ' の panel が無い');
    assert.equal(!!open[1], v !== 'single', v + ' の初期の hidden');
    assert.equal((STATIC.match(new RegExp('id="view-' + v + '"', 'g')) || []).length, 1);
  });
  assert.equal((STATIC.match(/role="tabpanel"/g) || []).length, 3);
  assert.equal((STATIC.match(/role="tab"/g) || []).length, 3);
});

test('P2L-S3B3B2B2-T02: [hidden] を CSS が上書きしない・タブは定義済みの変数だけを使う・focus が見える・狭い画面ではタブの列だけが横に流れる', () => {
  assert.match(CSS, /\.main-wrap\[hidden\], \.batch-wrap\[hidden\], \.pack-view\[hidden\] \{ display: none; \}/);
  // display を持つ画面の class が hidden 規則の後で display を上書きしない（.pack-view は display を指定しない）
  assert.equal(/\.pack-view\s*\{[^}]*display/.test(CSS), false);
  const defined = new Set([...CSS.slice(CSS.indexOf(':root'), CSS.indexOf('}', CSS.indexOf(':root'))).matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]));
  const tabRules = ['\\.view-switch', '\\.view-tab', '\\.view-tab\\.is-active', '\\.view-tab:focus-visible'].map((sel) => {
    const body = ruleBody(sel);
    assert.notEqual(body, null, sel + ' の規則が無い');
    return body;
  });
  const used = tabRules.join('\n').match(/var\((--[a-z0-9-]+)\)/g).map((v) => v.slice(4, -1));
  used.forEach((v) => assert.equal(defined.has(v), true, v + ' は :root に無い'));
  assert.equal(/--card|--text1/.test(tabRules.join('\n')), false, '未定義の --card / --text1 を使っている');
  assert.match(ruleBody('\\.view-switch'), /overflow-x: auto;/);
  assert.match(ruleBody('\\.view-tab'), /flex: none; white-space: nowrap;/);
  assert.match(ruleBody('\\.view-tab:focus-visible'), /outline: 2px solid var\(--accent2\);/);
  // 選んだタブは色だけでなく線でも示す
  assert.match(ruleBody('\\.view-tab\\.is-active'), /box-shadow: inset 0 -3px 0 var\(--accent\);/);
});

test('P2L-S3B3B2B2-T03: Project Pack 欄は内部を変えずに #view-pack の中へ移り、単一ケース・Workspace の画面には無い', () => {
  const pack = panelMarkup('pack');
  assert.match(pack, /^<div class="pack-view" id="view-pack" role="tabpanel" aria-labelledby="view-tab-pack" hidden>\n<section class="pack-wrap" id="project-pack-section" aria-labelledby="pack-title">/);
  assert.match(pack, /<\/section>\n<\/div>$/);
  const section = element(STATIC, STATIC.indexOf('<section class="pack-wrap"'));
  assert.equal(pack.includes(section), true);
  const ids = [...section.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  ['project-pack-section', 'project-pack-card', 'pack-title', 'pack-file', 'pack-drop', 'pack-paste', 'btn-pack-load', 'btn-pack-unload',
    'pack-status', 'pack-preview', 'pack-exec', 'pack-exec-case', 'btn-pack-exec', 'pack-exec-result', 'pack-batch', 'btn-pack-batch',
    'btn-pack-batch-cancel', 'pack-batch-result', 'pack-report', 'pack-report-out']
    .forEach((id) => assert.equal(ids.includes(id), true, id + ' が Pack 欄に無い'));
  ids.forEach((id) => assert.equal((STATIC.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, id + ' が重複'));
  // 単一ケース・Workspace の画面には Pack の欄も読込 UI も無い
  for (const v of ['single', 'batch']) {
    const other = panelMarkup(v);
    assert.equal(/id="(project-pack-section|pack-[a-z-]+|btn-pack-[a-z-]+)"|type="file"|ondrop=/.test(other), false, v + ' に Pack の欄がある');
  }
  // 未レビュー・保存しない・Closure 判定をしない、の注記は残る
  assert.match(section, /<h2 class="card-title" id="pack-title">Project Pack（Unreviewed）<\/h2>/);
  assert.match(section, /未レビュー\s*（pack_unreviewed）として扱い/);
  assert.match(section, /保存・送信しません。ファイル名も保持しません。/);
  // Workspace の画面の最初のカードは案件プロファイル
  assert.match(panelMarkup('batch'), /^<div class="batch-wrap" id="view-batch"[^>]*>\s*<!--[^>]*-->\s*<div class="card">\s*<div class="card-title">案件プロファイル（風条件の共通値）<\/div>/);
});

test('P2L-S3B3B2B2-T04: 印刷では Project Pack の画面・Pack 欄・タブを出さない（設計レビュー資料の印刷 gate は従来どおり）', () => {
  const print = HTML.slice(HTML.indexOf('@media print'));
  const hide = print.slice(0, print.indexOf('display: none !important;'));
  ['.view-switch', '#view-pack', '#project-pack-section', '.main-wrap', '#review-config-card'].forEach((sel) =>
    assert.equal(hide.includes(sel), true, sel + ' を印刷する'));
  assert.match(print, /#review-report \{ display: none !important; \}/);
  assert.match(print, /body\.review-print-allowed #review-report \{/);
  assert.equal(/beforeprint|afterprint|review-print-allowed/.test(fnBody('setView') + fnBody('onViewTabKeydown')), false);
});

test('P2L-S3B3B2B2-T05: 画面の切替は表示だけ（計算・Import / Export・保存・URL・Pack の解除をしない）', () => {
  const nav = fnBody('setView') + fnBody('onViewTabKeydown');
  [/runCalc\(/, /batchEvaluate\(/, /batchExport|batchImport|Export|Import/, /loadProjectPack|unloadProjectPack|clearProjectPack|stagedProjectPack/,
    /localStorage|sessionStorage|indexedDB|cookie/, /location\.|history\.|hash/, /fetch\(|XMLHttpRequest|sendBeacon/, /console\./, /innerHTML/]
    .forEach((re) => assert.equal(re.test(nav), false, String(re)));
  // setView を呼ぶのはタブの onclick だけ（初期化・計算・取り込みから画面を勝手に切り替えない）
  assert.equal((CODE.match(/setView\(/g) || []).length, 1, 'setView を script の中から呼んでいる');
  assert.equal((STATIC.match(/onclick="setView\('/g) || []).length, 3);
});

/* ============================================================
   setView() / onViewTabKeydown() を vm で動かす
============================================================ */

function fakeElement(id) {
  const classes = new Set();
  const attrs = {};
  const el = {
    id, hidden: false, focused: 0, clicked: 0, panel: null,
    classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); }, contains: (c) => classes.has(c) },
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
    focus() { el.focused++; sandbox.document.activeElement = el; },
    click() { el.clicked++; sandbox.setView(id.replace('view-tab-', '')); },
    closest(sel) { return sel === '[role="tabpanel"][hidden]' && el.panel && el.panel.hidden ? el.panel : null; }
  };
  return el;
}
let sandbox;
function navSandbox() {
  const els = {};
  VIEWS.forEach((v) => { els['view-' + v] = fakeElement('view-' + v); els['view-tab-' + v] = fakeElement('view-tab-' + v); });
  // 既定の状態（単一ケースだけ）
  els['view-batch'].hidden = true;
  els['view-pack'].hidden = true;
  const calls = [];
  sandbox = {
    document: { activeElement: null, getElementById: (id) => els[id] || null,
      querySelectorAll: (sel) => (sel === '.view-switch [role="tab"]' ? VIEWS.map((v) => els['view-tab-' + v]) : []) },
    renderSingleResultFreshness() { calls.push('single'); },
    renderWorkspaceResultFreshness() { calls.push('batch'); },
    renderWorkspaceCsvOutputFreshness() { calls.push('csv'); },
    // 切り替えで呼んではいけないもの（呼ばれたら記録する。staged の Pack がある状態で切り替える）
    runCalc() { calls.push('runCalc'); },
    batchEvaluate() { calls.push('batchEvaluate'); },
    unloadProjectPack() { calls.push('unloadProjectPack'); },
    window: { stagedProjectPackContext: { trust: 'pack_unreviewed' } }
  };
  vm.createContext(sandbox);
  vm.runInContext(fnBody('setView') + '\n' + fnBody('onViewTabKeydown'), sandbox);
  const shown = () => VIEWS.filter((v) => !els['view-' + v].hidden);
  const tabs = () => VIEWS.map((v) => {
    const t = els['view-tab-' + v];
    return v + ':' + t.getAttribute('aria-selected') + ':' + t.getAttribute('tabindex') + ':' + t.classList.contains('is-active');
  }).join(' ');
  return { sb: sandbox, els, calls, shown, tabs };
}

test('P2L-S3B3B2B2-T06: setView は 1 画面だけを出し、タブの aria-selected・tabindex・class を揃える。開いた側の鮮度だけを判定し直す', () => {
  const { sb, calls, shown, tabs } = navSandbox();
  assert.equal(sb.setView('pack'), true);
  assert.deepEqual(shown(), ['pack']);
  assert.equal(tabs(), 'single:false:-1:false batch:false:-1:false pack:true:0:true');
  assert.deepEqual(calls, [], 'Project Pack の画面で単一ケース・Workspace の判定・表示に触れた');
  assert.equal(sb.setView('batch'), true);
  assert.deepEqual(shown(), ['batch']);
  assert.equal(tabs(), 'single:false:-1:false batch:true:0:true pack:false:-1:false');
  assert.equal(sb.setView('single'), true);
  assert.deepEqual(shown(), ['single']);
  assert.equal(tabs(), 'single:true:0:true batch:false:-1:false pack:false:-1:false');
  // 開いた側の鮮度の判定だけ。計算・一括計算・Pack の解除はしない
  assert.deepEqual(calls, ['batch', 'single']);
  // 同じ画面をもう一度選んでも 1 画面のまま
  sb.setView('single');
  assert.deepEqual(shown(), ['single']);
  sb.setView('pack');
  assert.deepEqual(calls, ['batch', 'single', 'single'], 'Project Pack の画面で計算・解除・判定をした');
});

test('P2L-S3B3B2B2-T07: 未知の値（大文字・空白・prototype の名前・null など）では何も変えない', () => {
  const { sb, calls, shown, tabs } = navSandbox();
  sb.setView('pack');
  const before = tabs();
  calls.length = 0;
  for (const v of ['bogus', '', 'SINGLE', ' pack', 'pack ', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', null, undefined, 0, 1, true, {}, ['pack']]) {
    assert.equal(sb.setView(v), false, JSON.stringify(v));
    assert.deepEqual(shown(), ['pack'], JSON.stringify(v));
  }
  assert.equal(tabs(), before);
  assert.deepEqual(calls, []);
});

test('P2L-S3B3B2B2-T08: 隠れる画面の中に focus があれば、選んだ画面のタブへ移す（それ以外では focus を動かさない）', () => {
  const { sb, els } = navSandbox();
  const input = fakeElement('inp-W');
  input.panel = els['view-single'];
  sb.document.activeElement = input;
  sb.setView('batch');
  assert.equal(sb.document.activeElement.id, 'view-tab-batch', '隠れた画面の中に focus が残った');
  assert.equal(els['view-tab-batch'].focused, 1);
  // 隠れない画面の中の focus はそのまま
  const tsv = fakeElement('batch-tsv');
  tsv.panel = els['view-batch'];
  sb.document.activeElement = tsv;
  sb.setView('batch');
  assert.equal(sb.document.activeElement.id, 'batch-tsv');
  // focus が無い（body など）ときも何もしない
  sb.document.activeElement = null;
  sb.setView('pack');
  assert.equal(els['view-tab-pack'].focused, 0);
});

test('P2L-S3B3B2B2-T09: ←→ は隣（端で回る）、Home / End は端のタブへ移って開く。ほかのキー・タブ以外では何もしない', () => {
  const { sb, els, shown } = navSandbox();
  const press = (key, target) => {
    const ev = { key, target, prevented: false, preventDefault() { this.prevented = true; } };
    sb.onViewTabKeydown(ev);
    return ev.prevented;
  };
  const tab = (v) => els['view-tab-' + v];
  assert.equal(press('ArrowRight', tab('single')), true);
  assert.deepEqual(shown(), ['batch']);
  assert.equal(sb.document.activeElement.id, 'view-tab-batch');
  press('ArrowRight', tab('batch'));
  assert.deepEqual(shown(), ['pack']);
  press('ArrowRight', tab('pack'));
  assert.deepEqual(shown(), ['single'], '右端から先頭へ回る');
  press('ArrowLeft', tab('single'));
  assert.deepEqual(shown(), ['pack'], '先頭から右端へ回る');
  press('Home', tab('pack'));
  assert.deepEqual(shown(), ['single']);
  press('End', tab('single'));
  assert.deepEqual(shown(), ['pack']);
  assert.equal(sb.document.activeElement.id, 'view-tab-pack');
  // Enter / Space は button の既定の動作（onclick）に任せる。ほかのキー・タブ以外の要素では何もしない
  for (const key of ['Enter', ' ', 'Tab', 'ArrowUp', 'ArrowDown', 'a']) assert.equal(press(key, tab('pack')), false, key);
  assert.equal(press('ArrowRight', fakeElement('inp-W')), false);
  assert.deepEqual(shown(), ['pack']);
});

/* ============================================================
   harness の登録
============================================================ */

test('P2L-S3B3B2B2-T10: browser harness は登録され、Pack の検証器・adapter・executor・batch・report を Node 側で呼ばない', () => {
  const spec = JSON.parse(read('tools/verification/verification-spec.json'));
  const inst = spec.instruments.find((i) => i.id === 'three-view-navigation');
  assert.ok(inst, 'verification-spec に three-view-navigation が無い');
  assert.equal(inst.command, 'node tools/browser-checks/three-view-navigation.mjs');
  assert.equal(inst.admissibility, 'UNVERIFIED');
  assert.equal(inst.evidenceClass, 'observational');
  assert.ok(inst.instrumentFiles.includes('tools/browser-checks/three-view-navigation.mjs'));
  assert.ok(spec.browserAssertions.some((a) => a.id === 'three-view-one-panel-at-a-time' && a.instrument === 'three-view-navigation'));
  const src = read('tools/browser-checks/three-view-navigation.mjs');
  assert.match(src, /openBrowser\(/);
  assert.match(src, /finishRun\(/);
  assert.equal(/validateProjectPack|fromProjectPack|executeCase\(|createBatchRun\(|executeAll\(|buildReport\(|require\([^)]*(project-pack\.js|project-context)/.test(src), false);
  assert.match(read('tools/browser-checks/README.md'), /\| `three-view-navigation\.mjs` \| \d+ \|/);
});
