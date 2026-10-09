// Phase 2L-B2 / S2-B: index.html の案件プリセット UI が active ProjectContext から読まれることを、
// 実ブラウザで確かめる。Playwright は resolve する（P2K-F06）。harness.mjs を経由するので、
// browser が無ければ UNVERIFIED（exit 3）であって FAIL ではない。
//
// 測る tree（S3-A で runtime default の方針に合わせて組み直した）:
//   real       … この tree そのもの。runtime default（合成サンプル）だけを読み込み、runtimeDefault でない
//                built-in の module は page に読み込まれない
//   decoy      … bootstrap 後に runtime default module の global を別物へ差し替える
//   synthetic  … runtime default module を別の合成 preset に差し替えた一時 copy（ラベル・階・部位の順・
//                寸法・圧力・Evidence level がすべて違う）。hard-code や「現在値の偶然一致」はここで落ちる
//   failure    … project-context.js を読めない一時 copy。別の module へ fallback せず明示エラー
//   missing    … runtime default module を読み込まず、代わりに runtimeDefault でない built-in を読み込む
//                一時 copy。読み込まれている別の built-in へ fallback せず fail closed
//   duplicate  … runtimeDefault の宣言が 2 件ある一時 copy。どちらも選ばず fail closed
//   extra      … runtimeDefault でない built-in が追加で読み込まれた一時 copy。runtime default は変わらない
//   reordered  … 宣言の順序を入れ替えた一時 copy（id 一覧の先頭が変わる）。runtime default は変わらない
//
// 期待値は page の外（Node 側で module を require して）求める。page の値を page で確かめない。
//
// S2-C: UI mode token は 'preset'、階の初期選択は context の先頭、案件ラベルは publicLabel だけ
// （registryProjectId を表示しない）。合成 tree の先頭階は実 tree に無い階で、2 階も無い。
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('context-runtime', () => ({ checksRun: pass + fail, failures: fail }));

// ── Node 側の正（page とは独立に module から求める）──────────────────
const Registry = require(REPO + 'project-config/registry.js');
const PC = require(REPO + 'project-config/project-context.js');
const PI = require(REPO + 'project-config/project-input.js');
const Closure = require(REPO + 'project-config/evidence-closure.js');
// 実 tree の runtime default。id 一覧（BUILT_IN_PRESET_IDS）の位置ではなく runtimeDefault の宣言で決まる。
const REAL_ID = Registry.getRuntimeDefaultBuiltInPresetId();
const REAL_CTX = PC.fromLegacyPreset(REAL_ID);
const REAL_PRESET = Registry.getBuiltInPreset(REAL_ID);

// 実 tree（runtime default）の値（差し替えた tree に漏れていないことの確認用）。test に書き写さず module から読む。
const REAL_VALUES = new Set();
REAL_CTX.capabilities.projectPressureMap.positivePressures.forEach((r) => REAL_VALUES.add(String(r.pressure.value)));
REAL_CTX.capabilities.projectPressureMap.negativePressures.forEach((r) => REAL_VALUES.add(String(r.magnitude.value)));
REAL_VALUES.add(String(REAL_CTX.capabilities.sampleDefaultDimensions.widthMm.value));
REAL_VALUES.add(String(REAL_CTX.capabilities.sampleDefaultDimensions.heightMm.value));

const floorLabel = (f) => (f === 'PH' ? 'PH' : f + '階');
const zoneLabel = (z) => ({ general: '一般部', corner: '隅角部' })[z];

// ── 一時 tree ─────────────────────────────────────────────────────
function scriptSources(html) {
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
}
function makeTree(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'context-runtime-'));
  const html = fs.readFileSync(REPO + 'index.html', 'utf8');
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  for (const src of scriptSources(html)) {
    fs.mkdirSync(path.dirname(path.join(dir, src)), { recursive: true });
    fs.copyFileSync(REPO + src, path.join(dir, src));
  }
  mutate(dir);
  return dir;
}
const DECLARATION_RE = /\{ projectId: '([^']+)', nodePath: '([^']+)', globalName: '([^']+)', runtimeDefault: (true|false) \}/g;
function builtInModules() {
  const src = fs.readFileSync(REPO + 'project-config/registry.js', 'utf8');
  return [...src.matchAll(DECLARATION_RE)]
    .map((m) => ({ projectId: m[1], nodePath: m[2], globalName: m[3], runtimeDefault: m[4] === 'true' }));
}
const declaration = (m) => `{ projectId: '${m.projectId}', nodePath: '${m.nodePath}', globalName: '${m.globalName}', runtimeDefault: ${m.runtimeDefault} }`;
/** 一時 tree の registry.js の built-in 宣言を mods で置き換える（宣言の行だけを書き換える）。 */
function writeDeclarations(dir, mods) {
  const reg = path.join(dir, 'project-config', 'registry.js');
  const src = fs.readFileSync(reg, 'utf8');
  const out = src.replace(/(var BUILT_IN_PRESET_MODULES = \[\n)([\s\S]*?)(\n  \];)/,
    (all, open, body, close) => open + mods.map((m) => '    ' + declaration(m)).join(',\n') + close);
  if (out === src) throw new Error('could not rewrite the built-in declarations');
  fs.writeFileSync(reg, out);
}
/** 一時 tree の index.html で script を足す（registry.js の直前）・外す。 */
function addScriptBeforeRegistry(dir, src) {
  const idx = path.join(dir, 'index.html');
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('<script src="project-config/registry.js"></script>',
    '<script src="' + src + '"></script>\n<script src="project-config/registry.js"></script>'));
}
function removeScript(dir, src) {
  const idx = path.join(dir, 'index.html');
  const html = fs.readFileSync(idx, 'utf8');
  const out = html.replace('<script src="' + src + '"></script>\n', '');
  if (out === html) throw new Error('script not found: ' + src);
  fs.writeFileSync(idx, out);
}
const MODS = builtInModules();
const DEFAULT_MOD = MODS.filter((m) => m.runtimeDefault)[0];
const NON_DEFAULT_MODS = MODS.filter((m) => !m.runtimeDefault);
const SECOND = { projectId: 'synthetic-second', nodePath: './synthetic-second.js', globalName: 'SyntheticSecondConfig', runtimeDefault: false };

// 合成 built-in。階は整数風 key を含むので、Object.keys の順（3, 5, B1, R, PH）が context の順になる。
// 先頭の 3 は実 tree の階に無く、2 階も無い（初期選択が「context の先頭」であって、特定の階の
// hard-code や旧 UI 既定ではないことを、実 tree と区別して確かめるため）。
const SYN = {
  label: 'Synthetic Built-in Sample',
  floors: { B1: [1111, 'verified', 'primary'], 3: [1222, 'partially_verified', 'indirect'], 5: [1333, 'unverified', 'none'],
    R: [1444, 'partially_verified', 'indirect'], PH: [1477, 'unverified', 'none'] },
  zones: { corner: [1666, 'partially_verified', 'indirect'], general: [1555, 'partially_verified', 'indirect'] },
  w: 987, h: 2345
};
function syntheticModule(projectId, globalName) {
  return `(function (global) {
  var P = 'N/m\\u00b2';
  function ev(level) {
    return { level: level, checkedAt: level === 'none' ? null : '2026-03-04',
      publicDescription: '合成テスト用の built-in（実案件ではない）', privateReferenceAvailable: level === 'primary' };
  }
  function v(value, unit, status, level) {
    return { value: value, unit: unit, verificationStatus: status, evidence: ev(level), sourceReference: null };
  }
  var floors = ${JSON.stringify(SYN.floors)};
  var zones = ${JSON.stringify(SYN.zones)};
  var cfg = {
    projectId: ${JSON.stringify(projectId)},
    hasFixedPreset: true,
    identity: { publicLabel: ${JSON.stringify(SYN.label)}, verificationStatus: 'unverified', disclosureStatus: 'redacted', evidence: ev('none') },
    dimensions: { mode: 'sample_default', defaultW: v(${SYN.w}, 'mm', 'unverified', 'none'),
      defaultH: v(${SYN.h}, 'mm', 'unverified', 'none'), status: 'unverified' },
    wind: { positivePressureByFloor: {}, negativePressureByZone: {},
      V0: v(31, 'm/s', 'unverified', 'none'), roughnessCategory: v('I', null, 'unverified', 'none'), status: 'partially_verified' },
    verifiedCases: [],
    getPublicLabel: function () { return this.identity.publicLabel; },
    getPositivePressure: function (f) { return this.wind.positivePressureByFloor[f].value; },
    getNegativePressure: function (z) { return this.wind.negativePressureByZone[z].value; },
    getDefaultDimensionsMM: function () { return { W: this.dimensions.defaultW.value, H: this.dimensions.defaultH.value }; }
  };
  Object.keys(floors).forEach(function (f) { cfg.wind.positivePressureByFloor[f] = v(floors[f][0], P, floors[f][1], floors[f][2]); });
  Object.keys(zones).forEach(function (z) { cfg.wind.negativePressureByZone[z] = v(zones[z][0], P, zones[z][1], zones[z][2]); });
  global[${JSON.stringify(globalName)}] = cfg;
})(window);
`;
}

// ── page で UI の状態を読む（判定はしない）────────────────────────
async function observe(page, opts) {
  return page.evaluate(async (o) => {
    const $ = (id) => document.getElementById(id);
    const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
    const rowsOf = (el) => el ? [...el.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td')].map(txt)).filter((r) => r.length) : [];
    const setMode = async (m) => { const s = $('inp-mode'); s.value = m; s.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 60)); };
    const ctx = (typeof activeProjectContext !== 'undefined') ? activeProjectContext : null;
    const out = {
      hasContext: !!ctx,
      isIssued: !!(ctx && typeof ProjectContext !== 'undefined' && ProjectContext.isProjectContext(ctx)),
      ctx: ctx ? JSON.parse(JSON.stringify(ctx)) : null,
      modeOptionText: txt(document.querySelector('#inp-mode option[value="preset"]')),
      presetLabel: txt($('preset-name-label')),
      identityNote: txt($('preset-identity-note')),
      floorOptions: [...$('inp-floor').options].map((op) => [op.value, op.textContent]),
      zoneOptions: [...$('inp-zone').options].map((op) => [op.value, op.textContent]),
      floorDisabled: $('inp-floor').disabled,
      selected: [$('inp-floor').value, $('inp-zone').value],
      W: $('inp-W').value, H: $('inp-H').value,
      resultText: txt($('result-area')),
      statusRows: rowsOf($('evidence-status-table')),
      statusText: txt($('evidence-status-table')),
      verifiedCaseText: txt($('verified-case-selector-area')),
      verifiedCaseSelect: !!$('inp-verified-case'),
      reconRows: rowsOf($('reconciliation-area')),
      closureText: txt($('evidence-closure-area'))
    };
    if (ctx) {
      out.calc = [];
      for (const [f] of out.floorOptions) for (const [z] of out.zoneOptions) {
        try {
        $('inp-floor').value = f; $('inp-zone').value = z; runCalc();
        const pkg = buildCurrentProjectInput();
        const bridge = ProjectInput.fromPreset(PresetRegistry.getBuiltInPreset(ctx.origin.registryProjectId),
          { floorKey: f, zoneKey: z, widthMm: Number($('inp-W').value), heightMm: Number($('inp-H').value),
            glassType: $('inp-type').value, extraFactor: parseFloat($('inp-coeff').value) });
        const chips = [...document.querySelectorAll('.conclusion-card .meta-chip')].map(txt);
        out.calc.push({ f, z, pkg: JSON.parse(JSON.stringify(pkg)), bridgeSame: JSON.stringify(pkg) === JSON.stringify(bridge),
          designChip: chips.find((c) => /設計風圧/.test(c)) || null, resultText: txt($('result-area')) });
        } catch (e) {
          out.calc.push({ f, z, error: String(e && e.message || e), pkg: {}, resultText: '' });
        }
      }
      $('inp-floor').value = out.selected[0]; $('inp-zone').value = out.selected[1];
      await setMode('notification');
      $('inp-wind-compare').value = 'on';
      out.comparison = {};
      for (const z of ['general', 'corner']) {
        $('inp-wind-zone').value = z; runCalc();
        const t = [...document.querySelectorAll('.sec-title')].find((e) => /参考比較/.test(e.textContent));
        let n = t ? t.nextElementSibling : null;
        while (n && n.tagName !== 'TABLE') n = n.nextElementSibling;
        out.comparison[z] = n ? rowsOf(n)[0] : null;
      }
      $('inp-wind-compare').value = 'off';
      await setMode('preset'); runCalc();
    }
    // 他の mode は context に依存しない（失敗時も動く）
    if (!o.keepDims) { $('inp-W').value = 1100; $('inp-H').value = 1900; }
    await setMode('manual'); runCalc();
    out.manual = { pkg: JSON.parse(JSON.stringify(buildCurrentProjectInput())), glass: txt(document.querySelector('.conclusion-glass')) };
    await setMode('notification'); runCalc();
    out.notification = { kind: buildCurrentProjectInput().sourceKind, glass: txt(document.querySelector('.conclusion-glass')) };
    await setMode('manual');
    $('io-package').value = ProjectInput.serialize(buildCurrentProjectInput());
    importProjectInput();
    runCalc();
    out.imported = { kind: buildCurrentProjectInput().sourceKind, glass: txt(document.querySelector('.conclusion-glass')) };
    await setMode('preset'); runCalc();
    out.presetAfterReturnText = txt($('result-area'));
    return out;
  }, opts || {});
}

async function load(dir) {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('dialog', async (d) => { pageErrors.push('dialog: ' + d.message()); await d.dismiss(); });
  await page.goto('file://' + path.join(dir, 'index.html'));
  await page.waitForTimeout(400);
  return { page, pageErrors };
}

function closureFromNode(projectId) {
  const r = Closure.evaluateClosure(projectId, []);
  return [r.readySlotCount, r.requiredSlotCount, r.readyCategoryCount, r.categoryCount, r.readyCaseScopeCount, r.caseScopeCount];
}
/** 合成 tree の closure 件数は topology から数える（W/H 2 + 正圧 floor + 負圧 zone + 評価高さ floor）。 */
function closureFromTopology(floors, zones) {
  return [0, 2 + floors + zones + floors, 0, 4, 0, floors * zones];
}

function checkLoaded(tag, o, expect) {
  const ctx = o.ctx;
  if (!o.hasContext || !o.calc) {
    check(tag + '-A0', false, 'no active ProjectContext in a tree that should have one');
    return;
  }
  check(tag + '-A0', o.calc.every((c) => !c.error), 'calculation errors: ' + JSON.stringify(o.calc.filter((c) => c.error).map((c) => c.f + '/' + c.z + ': ' + c.error)));
  // A
  check(tag + '-A1', o.hasContext && o.isIssued, 'active context is adapter-issued');
  check(tag + '-A2', ctx && ctx.sourceKind === 'legacy_builtin' && ctx.trust === 'built_in_current', ctx && (ctx.sourceKind + '/' + ctx.trust));
  if (expect.nodeCtx) {
    check(tag + '-A3', ctx && JSON.stringify(ctx) === JSON.stringify(expect.nodeCtx), 'page context equals the Node-side fromLegacyPreset()');
  }
  // B
  check(tag + '-B1', o.modeOptionText === '案件プリセット（' + expect.label + '）', o.modeOptionText);
  // 人間向けの表示は publicLabel だけ。registryProjectId（内部 origin）を併記しない。
  check(tag + '-B2', o.presetLabel === expect.label, o.presetLabel);
  const idPattern = new RegExp('(^|[^A-Za-z0-9_-])' + expect.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_-]|$)');
  const presetTexts = [o.modeOptionText, o.presetLabel, o.identityNote, o.statusText, o.reconRows.flat().join(' '), o.closureText,
    ...o.calc.map((c) => c.resultText)];
  check(tag + '-B3', !presetTexts.some((t) => idPattern.test(t || '')), 'projectId is not shown in the preset UI');
  // C / D
  const floors = expect.ctx.capabilities.projectPressureMap.positivePressures.map((r) => r.floor);
  const zones = expect.ctx.capabilities.projectPressureMap.negativePressures.map((r) => r.zone);
  check(tag + '-C1', JSON.stringify(o.floorOptions.map((x) => x[0])) === JSON.stringify(floors), JSON.stringify(o.floorOptions.map((x) => x[0])));
  check(tag + '-C2', JSON.stringify(o.floorOptions.map((x) => x[1])) === JSON.stringify(floors.map(floorLabel)), JSON.stringify(o.floorOptions.map((x) => x[1])));
  check(tag + '-C3', o.selected[0] === expect.initialFloor, 'initial floor ' + o.selected[0]);
  check(tag + '-D1', JSON.stringify(o.zoneOptions.map((x) => x[0])) === JSON.stringify(zones), JSON.stringify(o.zoneOptions.map((x) => x[0])));
  check(tag + '-D2', JSON.stringify(o.zoneOptions.map((x) => x[1])) === JSON.stringify(zones.map(zoneLabel)), JSON.stringify(o.zoneOptions.map((x) => x[1])));
  // E
  const dims = expect.ctx.capabilities.sampleDefaultDimensions;
  check(tag + '-E1', o.W === String(dims.widthMm.value) && o.H === String(dims.heightMm.value), o.W + '×' + o.H);
  // F
  const posOf = (f) => expect.ctx.capabilities.projectPressureMap.positivePressures.find((r) => r.floor === f).pressure.value;
  const negOf = (z) => expect.ctx.capabilities.projectPressureMap.negativePressures.find((r) => r.zone === z).magnitude.value;
  check(tag + '-F1', o.calc.length === floors.length * zones.length, 'combinations ' + o.calc.length);
  check(tag + '-F2', o.calc.every((c) => c.pkg.sourceKind === 'registered_preset' && c.pkg.sourceId === expect.id), 'registered_preset from the active built-in');
  check(tag + '-F3', o.calc.every((c) => c.pkg.positivePressure === posOf(c.f) && c.pkg.negativePressure === negOf(c.z)), 'pressures come from the context map');
  check(tag + '-F4', o.calc.every((c) => c.bridgeSame), 'UI package equals the compatibility bridge');
  check(tag + '-F5', o.calc.every((c) => c.pkg.designPressure === Math.max(posOf(c.f), negOf(c.z)) &&
    c.designChip === '設計風圧 ' + Math.round(c.pkg.designPressure) + ' N/m²'), 'design pressure shown = max(|pos|,|neg|)');
  check(tag + '-F6', o.calc.every((c) => c.resultText.includes('案件プリセット: ' + expect.label)), 'result names the preset by publicLabel');
  // G
  ['general', 'corner'].forEach((z) => {
    const row = o.comparison[z];
    check(tag + '-G-' + z, !!row && row[0] === '負圧（' + zoneLabel(z) + '）' && row[1] === negOf(z) + ' N/m²', JSON.stringify(row));
  });
  // H
  const cl = expect.closure;
  const want = ['必要な確認項目: ' + cl[0] + ' / ' + cl[1], 'closureカテゴリ: ' + cl[2] + ' / ' + cl[3], '想定case scope: ' + cl[4] + ' / ' + cl[5]];
  check(tag + '-H1', want.every((w) => o.closureText.includes(w)), want.join(' ; '));
  // I
  const pe = expect.ctx.capabilities.builtInEvidence.pressureEvidence;
  const lvl = (es) => [...new Set(es.map((e) => e.evidence.level))].map((l) => ({ primary: 'Primary', indirect: 'Indirect' })[l] || 'None').join(' / ');
  const pos = o.statusRows.find((r) => r[0] === '階別正圧プリセット');
  const neg = o.statusRows.find((r) => r[0] === '部位別負圧プリセット');
  check(tag + '-I1', !!pos && pos[2] === lvl(pe.positive) && pos[3] === floors.map(floorLabel).join(' / '), JSON.stringify(pos));
  check(tag + '-I2', !!neg && neg[2] === lvl(pe.negative) && neg[3] === zones.map(zoneLabel).join(' / '), JSON.stringify(neg));
  const reconLabels = ['ガラス見付幅', 'ガラス見付高さ'].concat(floors.map((f) => '階別正圧（' + floorLabel(f) + '）'),
    zones.map((z) => '部位別負圧（' + zoneLabel(z) + '）'), ['評価高さ Z / 階の対応']);
  check(tag + '-I3', JSON.stringify(o.reconRows.map((r) => r[0])) === JSON.stringify(reconLabels), JSON.stringify(o.reconRows.map((r) => r[0])));
  check(tag + '-I4', o.reconRows.slice(2, 2 + floors.length).every((r, i) => r[1] === String(posOf(floors[i]))) &&
    o.reconRows.every((r) => r[3] !== 'MATCH'), 'reconciliation values from context, no MATCH without Evidence');
  // J
  check(tag + '-J1', !o.verifiedCaseSelect && /0 件/.test(o.verifiedCaseText), o.verifiedCaseText);
  // J2 / J3: 文言は built-in の出どころを前提にしない（RF-20-01）。どの built-in でも同じ文言で、
  // 検証状況だけを context から述べる
  check(tag + '-J2', o.verifiedCaseText ===
    'Verified Case は現在 0 件です。このプリセットには verifiedCases が登録されていないため、case selectorは表示しません。',
    o.verifiedCaseText);
  const windStatus = expect.ctx.capabilities.builtInEvidence.groupStatus.wind;
  const warned = (t) => t.includes('⚠ 設計風圧プリセット — 未検証') &&
    t.includes('このプリセットの正圧・負圧は verificationStatus: ' + windStatus + ' です。') &&
    t.includes('実案件に使用する場合は、採用する入力条件と根拠を別途確認してください。');
  const sourceImplied = /構造計算書|原典照合|一次資料によるEvidenceが未取得/;
  check(tag + '-J3', windStatus !== 'verified' && o.calc.length > 0 && o.calc.every((c) => warned(c.resultText)) &&
    ![o.verifiedCaseText].concat(o.calc.map((c) => c.resultText)).some((t) => sourceImplied.test(t)),
    'source-agnostic preset warning (verificationStatus: ' + windStatus + ')');
  // K
  check(tag + '-K1', o.manual.pkg.sourceKind === 'manual' && !!o.manual.glass, 'manual ' + o.manual.glass);
  check(tag + '-K2', o.notification.kind === 'notification_calculation' && !!o.notification.glass, 'notification');
  check(tag + '-K3', o.imported.kind === 'imported_unverified' && !!o.imported.glass, 'imported');
}

/** preset UI の比較用の写し（表示・選択肢・寸法・Evidence・照合・全 package・参考比較・Closure）。 */
const pickUi = (o) => JSON.stringify([o.presetLabel, o.modeOptionText, o.floorOptions, o.zoneOptions, o.W, o.H, o.statusRows,
  o.reconRows, (o.calc || []).map((c) => c.pkg), o.comparison, o.closureText]);
let realPick = null;

const browser = await chromium.launch();
const temps = [];
// scenario が想定外の例外で止まっても、それを「測れなかった」ではなく FAIL として数える
async function scenario(name, fn) {
  try {
    await fn();
  } catch (e) {
    check(name + '-crash', false, 'scenario threw: ' + String(e && e.message || e).split('\n')[0].slice(0, 160));
  }
}
try {
  // ── real ─────────────────────────────────────────────────────────
  // 公開 runtime の現在の状態: runtime default（合成サンプル）だけが読み込まれ、それが active context になる。
  await scenario('real', async () => {
    const { page, pageErrors } = await load(REPO);
    const loaded = await page.evaluate((mods) => ({
      scripts: [...document.querySelectorAll('script[src]')].map((el) => el.getAttribute('src')),
      globals: mods.map((m) => typeof window[m.globalName]),
      runtimeDefault: (() => {
        try { return PresetRegistry.getRuntimeDefaultBuiltInPresetId(); } catch (e) { return 'ERR ' + e.message; }
      })()
    }), MODS);
    const o = await observe(page, { keepDims: false });
    checkLoaded('real', o, { ctx: JSON.parse(JSON.stringify(REAL_CTX)), nodeCtx: JSON.parse(JSON.stringify(REAL_CTX)),
      id: REAL_ID, label: REAL_CTX.publicLabel, closure: closureFromNode(REAL_ID),
      initialFloor: REAL_CTX.capabilities.projectPressureMap.positivePressures[0].floor });
    // F: fromPreset を Node 側で独立に計算した結果とも一致（page と module を共有しない）
    const nodeSame = o.calc.every((c) => JSON.stringify(PI.fromPreset(REAL_PRESET, { floorKey: c.f, zoneKey: c.z,
      widthMm: c.pkg.widthMm, heightMm: c.pkg.heightMm, glassType: c.pkg.glassType, extraFactor: c.pkg.extraFactor })) === JSON.stringify(c.pkg));
    check('real-F7', nodeSame, 'packages equal Node-side ProjectInput.fromPreset()');
    // P: 公開 runtime の読み込み境界。runtimeDefault でない built-in の module は page に無い
    const srcOf = (m) => 'project-config/' + path.basename(m.nodePath);
    check('real-P1', NON_DEFAULT_MODS.length >= 1 && loaded.scripts.includes(srcOf(DEFAULT_MOD)) &&
      NON_DEFAULT_MODS.every((m) => !loaded.scripts.includes(srcOf(m))),
      'only the runtime-default module is loaded (' + NON_DEFAULT_MODS.length + ' non-default module(s) absent)');
    check('real-P2', MODS.every((m, i) => loaded.globals[i] === (m.runtimeDefault ? 'object' : 'undefined')),
      'module globals defined: runtime default only');
    check('real-P3', loaded.runtimeDefault === REAL_ID && !!o.ctx && o.ctx.origin.registryProjectId === REAL_ID &&
      o.ctx.publicLabel === REAL_CTX.publicLabel, 'active context is the runtime default');
    // P4: Node では legacy validation 用に捕まえられる非 default built-in の label・圧力 map・寸法が
    // active context に混ざっていない（構造比較だけ。値を書き写さない）
    const others = NON_DEFAULT_MODS.filter((m) => Registry.BUILT_IN_PRESET_IDS.includes(m.projectId))
      .map((m) => PC.fromLegacyPreset(m.projectId));
    check('real-P4', !!o.ctx && others.length === NON_DEFAULT_MODS.length && others.every((c) =>
      c.publicLabel !== o.ctx.publicLabel &&
      JSON.stringify(c.capabilities.projectPressureMap) !== JSON.stringify(o.ctx.capabilities.projectPressureMap) &&
      JSON.stringify(c.capabilities.sampleDefaultDimensions) !== JSON.stringify(o.ctx.capabilities.sampleDefaultDimensions)),
      'non-default built-in state is not in the active context (' + others.length + ' compared)');
    // U: 合成サンプルであり実案件 Evidence ではないことが分かり、強い検証表現を作らない
    check('real-U1', o.identityNote === '⚠ ' + REAL_PRESET.identity.evidence.publicDescription &&
      (o.modeOptionText || '').includes(REAL_CTX.publicLabel), o.identityNote);
    const be = REAL_CTX.capabilities.builtInEvidence;
    const allUnverified = be.fields.every((f) => f.verificationStatus === 'unverified') &&
      be.groupStatus.wind === 'unverified' && be.groupStatus.dimensions === 'unverified';
    const rows = o.statusRows.filter((r) => r.length === 4 && r[1] !== '検証状況');
    check('real-U2', allUnverified && rows.length === 6 && rows.every((r) => r[1] === 'Unverified' && r[2] === 'None'),
      JSON.stringify(rows.map((r) => r.slice(1, 3))));
    const evidenceUi = [o.identityNote, o.statusText, o.reconRows.flat().join(' '), o.verifiedCaseText, o.closureText].join(' ');
    check('real-U3', !/確認済|検証済|一次資料で確認|(^|[^n])Verified(?! Case)|Primary/.test(evidenceUi),
      'no strong verified wording in the preset Evidence UI');
    check('real-Z1', pageErrors.length === 0, 'page errors: ' + JSON.stringify(pageErrors));
    realPick = pickUi(o);
    await page.close();
  });

  // ── decoy: bootstrap 後に runtime default module の global を別物へ差し替える ──────────
  // registry は bootstrap で instance を捕まえているので、context も bridge も影響を受けない。
  // UI が module の global を直接読んでいれば、ここで decoy の値が画面に出る。
  await scenario('decoy', async () => {
    const mod = DEFAULT_MOD;
    const { page, pageErrors } = await load(REPO);
    const before = await observe(page, { keepDims: false });
    await page.evaluate((globalName) => {
      const real = window[globalName];
      const P = 'N/m\u00b2';
      const ev = { level: 'primary', checkedAt: '2026-03-04', publicDescription: 'decoy', privateReferenceAvailable: true };
      const v = (value, unit) => ({ value, unit, verificationStatus: 'verified', evidence: ev, sourceReference: null });
      const decoy = Object.assign({}, real, {
        identity: { publicLabel: 'DECOY-GLOBAL', verificationStatus: 'verified', evidence: ev },
        dimensions: { mode: 'sample_default', status: 'verified', defaultW: v(4321, 'mm'), defaultH: v(4322, 'mm') },
        wind: Object.assign({}, real.wind, { status: 'verified',
          positivePressureByFloor: Object.fromEntries(Object.keys(real.wind.positivePressureByFloor).map((k, i) => [k, v(9001 + i, P)])),
          negativePressureByZone: Object.fromEntries(Object.keys(real.wind.negativePressureByZone).map((k, i) => [k, v(9101 + i, P)])) }),
        getPublicLabel: () => 'DECOY-GLOBAL',
        getPositivePressure: () => 9001, getNegativePressure: () => 9101,
        getDefaultDimensionsMM: () => ({ W: 4321, H: 4322 })
      });
      window[globalName] = decoy;
      applyActiveProjectContextToUI();
      renderProjectEvidencePanels();
      runCalc();
    }, mod.globalName);
    const after = await observe(page, { keepDims: false });
    check('decoy-1', pickUi(after) === pickUi(before), 'UI unchanged after replacing the module global');
    check('decoy-2', ![after.presetLabel, after.statusText, after.reconRows.flat().join(' '), JSON.stringify(after.comparison),
      ...(after.calc || []).map((c) => c.resultText)].join(' ').match(/DECOY|9001|9101|4321/), 'no decoy value reaches the UI');
    check('decoy-Z1', pageErrors.length === 0, 'page errors: ' + JSON.stringify(pageErrors));
    await page.close();
  });

  // ── synthetic: runtime default module を別の合成 preset に差し替える ─────────
  await scenario('syn', async () => {
    check('syn-0', MODS.filter((m) => m.runtimeDefault).length === 1 && MODS.length >= 2,
      'registry declares exactly one runtime-default built-in among ' + MODS.length + ' declarations');
    const mod = DEFAULT_MOD;
    const dir = makeTree((d) => fs.writeFileSync(path.join(d, 'project-config', path.basename(mod.nodePath)),
      syntheticModule(mod.projectId, mod.globalName)));
    temps.push(dir);
    const { page, pageErrors } = await load(dir);
    const o = await observe(page, { keepDims: false });
    // 期待値: 合成 preset から Node 側で直接組み立てる
    const floors = Object.keys(SYN.floors);
    const zones = Object.keys(SYN.zones);
    const synCtx = o.ctx ? JSON.parse(JSON.stringify(o.ctx)) : null;
    const shapeOk = !!synCtx &&
      JSON.stringify(synCtx.capabilities.projectPressureMap.positivePressures.map((r) => [r.floor, r.pressure.value])) ===
        JSON.stringify(floors.map((f) => [f, SYN.floors[f][0]])) &&
      JSON.stringify(synCtx.capabilities.projectPressureMap.negativePressures.map((r) => [r.zone, r.magnitude.value])) ===
        JSON.stringify(zones.map((z) => [z, SYN.zones[z][0]])) &&
      synCtx.capabilities.sampleDefaultDimensions.widthMm.value === SYN.w && synCtx.publicLabel === SYN.label &&
      JSON.stringify(synCtx.capabilities.builtInEvidence.pressureEvidence.positive.map((e) => e.evidence.level)) ===
        JSON.stringify(floors.map((f) => SYN.floors[f][2]));
    check('syn-ctx', shapeOk, 'page context reflects the synthetic built-in');
    if (synCtx) {
      checkLoaded('syn', o, { ctx: synCtx, id: mod.projectId, label: SYN.label,
        closure: closureFromTopology(floors.length, zones.length), initialFloor: floors[0] });
    }
    // 初期階は context の先頭。合成 tree には 2 階が無く、先頭は実 tree の先頭とも違う。
    const realFirst = REAL_CTX.capabilities.projectPressureMap.positivePressures[0].floor;
    check('syn-C4', !floors.includes('2') && floors[0] !== realFirst && o.selected[0] === floors[0],
      'initial floor ' + o.selected[0] + ' = context first ' + floors[0] + ' (no floor 2; real first ' + realFirst + ')');
    // 実 tree（runtime default）の名称・値が 1 つも出ない（hard-code や偶然一致の検出）
    const shown = [o.presetLabel, o.modeOptionText, o.statusText, o.reconRows.flat().join(' '), o.closureText,
      ...(o.calc || []).map((c) => c.resultText)].join(' ');
    const leaked = [...REAL_VALUES].filter((v) => new RegExp('(^|[^0-9])' + v + '([^0-9]|$)').test(shown));
    check('syn-L1', leaked.length === 0, 'runtime-default values shown: ' + JSON.stringify(leaked));
    check('syn-L2', !shown.includes(REAL_CTX.publicLabel), 'runtime-default label shown');
    check('syn-Z1', pageErrors.length === 0, 'page errors: ' + JSON.stringify(pageErrors));
    await page.close();
  });

  // ── failure: ProjectContext を読めない ─────────────────────────────
  await scenario('fail', async () => {
    const dir = makeTree((d) => fs.writeFileSync(path.join(d, 'project-config', 'project-context.js'),
      '/* intentionally empty: the ProjectContext module is unavailable in this tree */\n'));
    temps.push(dir);
    const { page, pageErrors } = await load(dir);
    const o = await observe(page, { keepDims: false });
    check('fail-1', !o.hasContext, 'no active context');
    check('fail-2', o.presetLabel === '読み込めませんでした' && /読み込めませんでした/.test(o.identityNote || ''), o.presetLabel);
    check('fail-3', o.floorDisabled && o.floorOptions.length === 0 && o.zoneOptions.length === 0, 'selectors empty and disabled');
    check('fail-4', /案件プリセットモードでは計算しません/.test(o.presetAfterReturnText || ''), (o.presetAfterReturnText || '').slice(0, 80));
    check('fail-5', /表示できませんでした/.test(o.statusText || '') && /表示できませんでした/.test(o.closureText || ''), 'Evidence panels warn instead of falling back');
    const shown = [o.presetLabel, o.statusText, o.closureText, o.presetAfterReturnText].join(' ');
    check('fail-6', ![...REAL_VALUES].some((v) => new RegExp('(^|[^0-9])' + v + '([^0-9]|$)').test(shown)) &&
      !shown.includes(REAL_CTX.publicLabel), 'no fallback to the project module');
    check('fail-7', o.manual.pkg.widthMm === 1100 && o.manual.pkg.sourceKind === 'manual' && !!o.manual.glass &&
      o.notification.kind === 'notification_calculation' && o.imported.kind === 'imported_unverified', 'other modes still work');
    check('fail-Z1', pageErrors.length === 0, 'page errors: ' + JSON.stringify(pageErrors));
    await page.close();
  });

  // ── missing: runtime default module を読み込まない（代わりに非 default built-in を読み込む）───
  await scenario('missing', async () => {
    const dir = makeTree((d) => {
      writeDeclarations(d, MODS.concat([SECOND]));
      fs.writeFileSync(path.join(d, 'project-config', 'synthetic-second.js'), syntheticModule(SECOND.projectId, SECOND.globalName));
      addScriptBeforeRegistry(d, 'project-config/synthetic-second.js');
      removeScript(d, 'project-config/' + path.basename(DEFAULT_MOD.nodePath));
    });
    temps.push(dir);
    const { page, pageErrors } = await load(dir);
    const captured = await page.evaluate((id) => {
      try { PresetRegistry.getBuiltInPreset(id); return true; } catch (e) { return false; }
    }, SECOND.projectId);
    const o = await observe(page, { keepDims: false });
    check('missing-0', captured, 'a non-default built-in is loaded and captured, so a fallback would be possible');
    check('missing-1', !o.hasContext && /is not loaded in this environment/.test(o.identityNote || ''), (o.identityNote || '').slice(0, 140));
    check('missing-2', o.floorOptions.length === 0 && /案件プリセットモードでは計算しません/.test(o.presetAfterReturnText || '') &&
      ![o.modeOptionText, o.presetLabel, o.statusText, o.closureText].join(' ').includes(SYN.label),
      'no fallback to the loaded non-default built-in');
    // 後から registerPreset() した config は、runtime default の id を名乗っても runtime default になれない
    const late = await page.evaluate((id) => {
      const fake = { projectId: id, hasFixedPreset: true, getPublicLabel: () => 'FAKE-RUNTIME-DEFAULT' };
      let registered = false;
      try { PresetRegistry.registerPreset(fake); registered = true; } catch (e) { /* not registrable */ }
      let selected = null;
      try { selected = PresetRegistry.getRuntimeDefaultBuiltInPresetId(); } catch (e) { selected = 'ERR'; }
      initActiveProjectContext();
      applyActiveProjectContextToUI();
      return { registered, selected, hasContext: !!activeProjectContext,
        label: document.getElementById('preset-name-label').textContent };
    }, DEFAULT_MOD.projectId);
    check('missing-3', late.registered && late.selected === 'ERR' && !late.hasContext && !/FAKE/.test(late.label),
      'a dynamically registered look-alike cannot become the runtime default: ' + JSON.stringify(late));
    check('missing-Z1', pageErrors.length === 0, 'page errors: ' + JSON.stringify(pageErrors));
    await page.close();
  });

  // ── duplicate: runtimeDefault の宣言が 2 件 ─────────────────────────
  await scenario('duplicate', async () => {
    const dir = makeTree((d) => {
      writeDeclarations(d, MODS.concat([Object.assign({}, SECOND, { runtimeDefault: true })]));
      fs.writeFileSync(path.join(d, 'project-config', 'synthetic-second.js'), syntheticModule(SECOND.projectId, SECOND.globalName));
      addScriptBeforeRegistry(d, 'project-config/synthetic-second.js');
    });
    temps.push(dir);
    const { page, pageErrors } = await load(dir);
    const o = await observe(page, { keepDims: false });
    check('duplicate-1', !o.hasContext && /exactly one built-in must be declared runtimeDefault \(found 2\)/.test(o.identityNote || ''),
      (o.identityNote || '').slice(0, 140));
    check('duplicate-2', o.floorOptions.length === 0 && /案件プリセットモードでは計算しません/.test(o.presetAfterReturnText || '') &&
      ![o.modeOptionText, o.presetLabel].join(' ').includes(SYN.label) && ![o.modeOptionText, o.presetLabel].join(' ').includes(REAL_CTX.publicLabel),
      'neither declaration is chosen');
    check('duplicate-Z1', pageErrors.length === 0, 'page errors: ' + JSON.stringify(pageErrors));
    await page.close();
  });

  // ── extra: runtimeDefault でない built-in が追加で読み込まれている ────────────
  await scenario('extra', async () => {
    const dir = makeTree((d) => {
      writeDeclarations(d, MODS.concat([SECOND]));
      fs.writeFileSync(path.join(d, 'project-config', 'synthetic-second.js'), syntheticModule(SECOND.projectId, SECOND.globalName));
      addScriptBeforeRegistry(d, 'project-config/synthetic-second.js');
    });
    temps.push(dir);
    const { page, pageErrors } = await load(dir);
    const captured = await page.evaluate((id) => {
      try { PresetRegistry.getBuiltInPreset(id); return true; } catch (e) { return false; }
    }, SECOND.projectId);
    const o = await observe(page, { keepDims: false });
    check('extra-0', captured, 'the extra non-default built-in is loaded and captured');
    check('extra-1', !!o.ctx && o.ctx.origin.registryProjectId === REAL_ID && realPick !== null && pickUi(o) === realPick,
      'runtime default and the whole preset UI are unchanged');
    check('extra-Z1', pageErrors.length === 0, 'page errors: ' + JSON.stringify(pageErrors));
    await page.close();
  });

  // ── reordered: 宣言の順序を入れ替える（id 一覧の先頭が変わる）────────────────
  await scenario('reordered', async () => {
    const dir = makeTree((d) => writeDeclarations(d, MODS.slice().reverse()));
    temps.push(dir);
    const { page, pageErrors } = await load(dir);
    const ids = await page.evaluate(() => Array.from(PresetRegistry.BUILT_IN_PRESET_IDS));
    const o = await observe(page, { keepDims: false });
    check('reordered-0', ids.length === MODS.length && ids[0] !== Registry.BUILT_IN_PRESET_IDS[0], 'the id list starts with a different entry');
    check('reordered-1', !!o.ctx && o.ctx.origin.registryProjectId === REAL_ID && realPick !== null && pickUi(o) === realPick,
      'runtime default and the whole preset UI are unchanged');
    check('reordered-Z1', pageErrors.length === 0, 'page errors: ' + JSON.stringify(pageErrors));
    await page.close();
  });
} finally {
  await browser.close();
  temps.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));
}

console.log(results.join('\n'));
console.log(`\ncontext-runtime: ${pass} pass / ${fail} fail`);
finishRun('context-runtime', pass + fail, fail, { playwrightSource });
