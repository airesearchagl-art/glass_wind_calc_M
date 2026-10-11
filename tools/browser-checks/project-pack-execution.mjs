// Project Pack Case Execution（Phase 2L-B2 / S3-B2）を実ブラウザで確かめる。
//
// この harness は page の UI（貼り付け・ケースの選択・計算ボタン・解除）だけを操作して、
// page の状態と画面を観測する。Pack の検証器・adapter・executor を Node 側で呼ばない。
// 期待値は page の外で作る: fixture の literal と、wind-pressure.js・calc.js を Node で直接
// 呼んだ値（executor の出力からは作らない）。harness が新しい trust 経路を作らないためである。
//
// 確かめること:
//   - 起動時はケース計算の欄が閉じていて、Pack を読み込んだだけでは計算しない
//   - 明示操作で選んだ 1 ケースだけを計算し、未レビュー（pack_unreviewed）・計算済み ≠ 検証済みと示す
//   - mode ごとに G002 が完全一致で解決される（先頭行・先頭 pane・general ではない）
//   - case_direct は designPressure だけ（正圧・負圧を出さない）
//   - 選択変更・新しい Pack・読込失敗・解除で古い結果が消える。計算失敗は固定文で Pack は残る
//   - active context・案件プリセット UI・通常の計算結果は変わらない
//   - 保存・通信・URL 反映・console 出力をしない。強い表現を使わない。申告で trust が変わらない
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';
const FIXTURE_DIR = REPO + 'tests/fixtures/project-pack/';

// 期待値の oracle（page の外・executor を使わない）
const Wind = require(REPO + 'wind-pressure.js');
const Glass = require(REPO + 'calc.js');
const Registry = require(REPO + 'project-config/registry.js');
const RUNTIME_DEFAULT = Registry.getBuiltInPreset(Registry.getRuntimeDefaultBuiltInPresetId());

const FIXTURES = {
  notification1458: 'synthetic-notification1458.json',
  project_pressure_map: 'synthetic-project-pressure-map.json',
  case_direct: 'synthetic-case-direct.json'
};
const fixtureText = (mode) => fs.readFileSync(FIXTURE_DIR + FIXTURES[mode], 'utf8');
const fixture = (mode) => JSON.parse(fixtureText(mode));
const PU = ' N/m²';
const fmt = (v) => v.toFixed(1) + PU;

function glassRows(glassType, widthMm, heightMm, designPressure) {
  const area = Glass.paneAreaM2(widthMm, heightMm);
  const s = Glass.splitCandidates(Glass.generateCandidates(glassType, area, designPressure, 1));
  const best = s.okCandidates[0];
  return ['面積: ' + area.toFixed(3) + ' m²', '推奨候補（OK の最小構成）: ' + best.label, '許容風圧 P: ' + fmt(best.P),
    'OK ' + s.okCandidates.length + ' / NG ' + s.ngCandidates.length + ' / 適用範囲外 ' + s.outOfScopeCandidates.length];
}

// notification G002: fixture の入力を手で写して wind-pressure.js を直接呼ぶ
const nf = fixture('notification1458');
const N_IN = { V0: nf.windConditions.V0.value, roughnessCategory: nf.windConditions.roughnessCategory,
  buildingHeightM: nf.windConditions.buildingHeightM.value, eavesHeightM: nf.windConditions.eavesHeightM.value,
  evaluationHeightM: 10.2, buildingType: nf.windConditions.buildingType, zone: 'corner', basis: nf.windConditions.basis };
const N = Wind.calculateWindPressure(N_IN);
const EXPECT = {
  notification1458: ['trust: pack_unreviewed（未レビュー）— 計算済み ≠ 検証済み', '公開表示名: Synthetic Pack N1458',
    'caseId: G002 / paneId: P002', 'W × H: 760 × 1880 mm', 'glassType: lowe_fl', 'pressureModel.mode: notification1458',
    '設計風圧（designPressure）: ' + fmt(N.designPressure), '風圧の出どころ: Pack入力から算定（告示1458号系の式）',
    '階: 3階', '部位: 隅角部（corner）', '評価高さ: 10.2 m', '正圧: ' + fmt(N.positive.pressure),
    '負圧: ' + fmt(N.negative.pressure)].concat(glassRows('lowe_fl', 760, 1880, N.designPressure)),
  project_pressure_map: ['trust: pack_unreviewed（未レビュー）— 計算済み ≠ 検証済み', '公開表示名: Synthetic Pack Map',
    'caseId: G002 / paneId: P002', 'W × H: 760 × 1880 mm', 'glassType: tp_single', 'pressureModel.mode: project_pressure_map',
    '設計風圧（designPressure）: ' + fmt(1835), '風圧の出どころ: Pack map lookup（階別正圧・部位別負圧）', '階: 5階',
    '部位: 隅角部（corner）', '正圧: ' + fmt(1135), '負圧（絶対値）: ' + fmt(1835)].concat(glassRows('tp_single', 760, 1880, 1835)),
  case_direct: ['trust: pack_unreviewed（未レビュー）— 計算済み ≠ 検証済み', '公開表示名: Synthetic Pack Direct',
    'caseId: G002 / paneId: P002', 'W × H: 760 × 1880 mm', 'glassType: lowe_fl', 'pressureModel.mode: case_direct',
    '設計風圧（designPressure）: ' + fmt(1365), '風圧の出どころ: Packがcaseに宣言したdesignPressure']
    .concat(glassRows('lowe_fl', 760, 1880, 1365))
};
const FAILURE_TEXT = '選択ケースを計算できませんでした。未レビューPackの計算結果は現在ありません。';
const STRONG_WORDING = /Verified|承認|確定|安全|問題なし|計算可能|公開可能|確認済|\bsafe\b|\bapproved\b/i;

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('project-pack-execution', () => ({ checksRun: pass + fail, failures: fail }));

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleMessages = [];
const pageErrors = [];
const requests = [];
page.on('console', (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith('file://')) requests.push(r.url()); });

await page.addInitScript(() => {
  const calls = { storage: 0, cookie: 0, idb: 0, caches: 0, beacon: 0, fetch: 0, xhr: 0, history: 0 };
  window.__execProbe = calls;
  const wrap = (obj, name, key) => {
    try {
      const orig = obj[name];
      if (typeof orig !== 'function') return;
      obj[name] = function () { calls[key]++; return orig.apply(this, arguments); };
    } catch (e) { /* 読み取り専用なら数えない */ }
  };
  try { wrap(Storage.prototype, 'setItem', 'storage'); } catch (e) { /* none */ }
  try {
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(Document.prototype, 'cookie', { configurable: true,
      get() { return desc.get.call(this); }, set(v) { calls.cookie++; return desc.set.call(this, v); } });
  } catch (e) { /* none */ }
  if (window.indexedDB) wrap(window.indexedDB, 'open', 'idb');
  if (window.caches) wrap(window.caches, 'open', 'caches');
  wrap(navigator, 'sendBeacon', 'beacon');
  wrap(window, 'fetch', 'fetch');
  wrap(XMLHttpRequest.prototype, 'open', 'xhr');
  wrap(history, 'pushState', 'history');
  wrap(history, 'replaceState', 'history');
});

await page.goto(FILE);
await page.waitForTimeout(400);

/* ---------- helpers ---------- */

/**
 * S3-B3B2-B2: 画面は 3 つ（単一ケース / 複数ケース / Project Pack）。表示していなければタブを押して開く。
 * Pack の操作・表示の読み取りは Pack の画面で、単一ケースの計算・表示の読み取りは単一ケースの画面で行う
 * （隠れた画面の innerText は描画を伴わないので、表示中と同じ条件で読む）。
 */
async function showView(view, p = page) {
  if (await p.evaluate((v) => document.getElementById('view-' + v).hidden, view)) await p.click('#view-tab-' + view);
}

async function paste(text) {
  await showView('pack');
  await page.evaluate((t) => { document.getElementById('pack-paste').value = t; }, text);
  await page.click('#btn-pack-load');
  await page.waitForTimeout(50);
}

async function choose(caseId) {
  await showView('pack');
  await page.selectOption('#pack-exec-case', caseId);
  await page.waitForTimeout(30);
}

async function execute() {
  await showView('pack');
  await page.click('#btn-pack-exec');
  await page.waitForTimeout(50);
}

/** ケース計算の欄と page 変数から状態を読む。 */
async function execState() {
  await showView('pack');
  return page.evaluate(() => {
    const r = window.stagedProjectPackExecution;
    const section = document.getElementById('pack-exec');
    const box = document.getElementById('pack-exec-result');
    const status = document.getElementById('pack-exec-status');
    const select = document.getElementById('pack-exec-case');
    const out = {
      hasResult: r !== null && r !== undefined,
      sectionHidden: section.hidden,
      sectionVisible: getComputedStyle(section).display !== 'none',
      resultHidden: box.hidden,
      rows: [...box.querySelectorAll('li')].map((li) => li.textContent),
      resultText: box.innerText,
      sectionText: section.innerText,
      status: status.textContent,
      statusError: status.classList.contains('is-error'),
      options: [...select.options].map((o) => [o.value, o.textContent]),
      selectDisabled: select.disabled,
      buttonDisabled: document.getElementById('btn-pack-exec').disabled,
      packStaged: window.stagedProjectPackContext !== null && window.stagedProjectPackContext !== undefined,
      packPreviewHidden: document.getElementById('pack-preview').hidden
    };
    if (out.hasResult) {
      out.result = {
        issued: ProjectPackExecution.isExecutionResult(r),
        frozen: Object.isFrozen(r) && Object.isFrozen(r.calculation) && Object.isFrozen(r.pressure),
        trust: r.trust, sourceKind: r.sourceKind, caseId: r.case.caseId, mode: r.pressure.mode,
        pressureKeys: Object.keys(r.pressure).sort(), json: JSON.stringify(r)
      };
    }
    return out;
  });
}

/** active ProjectContext と、それに依存する案件プリセット UI・計算結果の snapshot（単一ケースの画面で読み、Pack の画面へ戻る）。 */
async function activeSnapshot() {
  await showView('single');
  const snap = await page.evaluate(() => {
    const ctx = activeProjectContext;
    const opts = (id) => [...document.querySelectorAll('#' + id + ' option')].map((o) => o.value + '=' + o.textContent);
    const text = (id) => { const el = document.getElementById(id); return el ? el.innerText : null; };
    return {
      sameObject: ctx === window.__activeAtStart,
      sourceKind: ctx && ctx.sourceKind, trust: ctx && ctx.trust, publicLabel: ctx && ctx.publicLabel,
      mode: document.getElementById('inp-mode').value, presetLabel: text('preset-name-label'),
      floors: opts('inp-floor').join('|'), zones: opts('inp-zone').join('|'),
      w: document.getElementById('inp-W').value, h: document.getElementById('inp-H').value,
      result: text('result-area')
    };
  });
  await showView('pack');
  return snap;
}

function checkResult(id, s, mode) {
  const want = EXPECT[mode];
  const missing = want.filter((row) => !s.rows.includes(row));
  check(id + '-shown', s.hasResult && !s.resultHidden && missing.length === 0,
    missing.length ? 'missing ' + missing.join(' / ') : `${s.rows.length} rows`);
  const r = s.result || {};
  check(id + '-issued', r.issued === true && r.frozen === true && r.trust === 'pack_unreviewed' &&
    r.sourceKind === 'project_pack_unreviewed' && r.caseId === 'G002' && r.mode === mode,
    `${r.trust}/${r.caseId}/${r.mode}/issued=${r.issued}/frozen=${r.frozen}`);
  const strong = s.sectionText.replace(/計算済み ≠ 検証済み/g, '');
  check(id + '-wording', !STRONG_WORDING.test(strong) && !/検証済/.test(strong) && s.sectionText.includes('計算済み ≠ 検証済み'),
    (strong.match(STRONG_WORDING) || ['none'])[0]);
  check(id + '-no-provenance', !/verified_primary_source|formulaVerificationStatus|formulaSource|provenance|合成テスト用/.test(s.resultText + (r.json || '')),
    '風圧側の provenance・申告文を結果に出さない');
  check(id + '-status', !s.statusError && s.status.includes('G002') && s.status.includes('未レビュー'), s.status);
}

/* ---------- 1. clean startup ---------- */

await page.evaluate(() => { window.__activeAtStart = activeProjectContext; });
await showView('single');
await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE0 = await activeSnapshot();
const s0 = await execState();
check('E1-clean', !s0.hasResult && s0.sectionHidden && !s0.sectionVisible && s0.options.length === 0 &&
  s0.selectDisabled && s0.buttonDisabled && s0.status === '', JSON.stringify({ hidden: s0.sectionHidden, opts: s0.options.length }));
check('E1-active', ACTIVE0.sourceKind === 'legacy_builtin' && ACTIVE0.publicLabel === RUNTIME_DEFAULT.getPublicLabel(),
  `${ACTIVE0.sourceKind}/${ACTIVE0.publicLabel}`);

/* ---------- 2. notification load: 自動では計算しない ---------- */

await paste(fixtureText('notification1458'));
const s2 = await execState();
check('E2-no-auto', !s2.hasResult && s2.resultHidden && s2.rows.length === 0, 'Pack を読み込んだだけでは計算しない');
check('E2-controls', s2.sectionVisible && !s2.buttonDisabled && !s2.selectDisabled &&
  JSON.stringify(s2.options) === JSON.stringify([['G001', 'G001 — P001'], ['G002', 'G002 — P002'], ['G003', 'G003 — P001']]) &&
  s2.status.includes('押したときだけ'), JSON.stringify(s2.options));
// ファイルから読み込んでも計算しない
await showView('pack');
await page.setInputFiles('#pack-file', { name: 'pack.json', mimeType: 'application/json', buffer: Buffer.from(fixtureText('case_direct'), 'utf8') });
await page.waitForFunction(() => /読み込み経路: ファイル選択/.test(document.getElementById('pack-status').textContent));
const s2f = await execState();
check('E2-no-auto-file', !s2f.hasResult && s2f.options.length === 2, 'ファイル読込でも計算しない');

/* ---------- 3. notification G002 ---------- */

await paste(fixtureText('notification1458'));
await choose('G002');
const before3 = await execState();
check('E3-select-no-auto', !before3.hasResult, '選んだだけでは計算しない');
await execute();
const s3 = await execState();
checkResult('E3-notification', s3, 'notification1458');
const NOTIF_JSON = s3.result ? s3.result.json : '';
check('E3-active', JSON.stringify(await activeSnapshot()) === JSON.stringify(ACTIVE0), 'active context・preset UI・結果は不変');

/* ---------- 4. map G002 ---------- */

await paste(fixtureText('project_pressure_map'));
await choose('G002');
await execute();
const s4 = await execState();
checkResult('E4-map', s4, 'project_pressure_map');
check('E4-not-first-row', !s4.rows.includes('正圧: ' + fmt(1015)) && !s4.rows.includes('負圧（絶対値）: ' + fmt(1565)),
  '先頭の正圧行・general の負圧を使っていない');

/* ---------- 5. direct G002 ---------- */

await paste(fixtureText('case_direct'));
await choose('G002');
await execute();
const s5 = await execState();
checkResult('E5-direct', s5, 'case_direct');
check('E5-design-only', !s5.rows.some((t) => /正圧|負圧|部位|評価高さ/.test(t)) &&
  JSON.stringify((s5.result || {}).pressureKeys) === JSON.stringify(['designPressure', 'mode', 'pressureSource']),
  'case_direct は designPressure だけ（正圧・負圧・部位を出さない）');

/* ---------- 6. 選択変更で古い結果が消える ---------- */

await choose('G001');
const s6 = await execState();
check('E6-selector-clears', !s6.hasResult && s6.resultHidden && s6.rows.length === 0 && s6.status.includes('前の計算結果を消しました'),
  s6.status);

/* ---------- 7. 新しい Pack の読込で消える ---------- */

await choose('G002');
await execute();
check('E7-precondition', (await execState()).hasResult, '計算済み');
await paste(fixtureText('project_pressure_map'));
const s7 = await execState();
check('E7-new-pack-clears', !s7.hasResult && s7.resultHidden && s7.rows.length === 0 && s7.options.length === 4,
  '新しい Pack で前の結果が消える');

/* ---------- 8. 読込失敗で消える（Pack も消える: S3-B1） ---------- */

await choose('G002');
await execute();
await paste('{"schemaVersion": 1');
const s8 = await execState();
check('E8-invalid-pack-clears', !s8.hasResult && !s8.packStaged && s8.sectionHidden && s8.buttonDisabled,
  `result=${s8.hasResult} staged=${s8.packStaged} section hidden=${s8.sectionHidden}`);

/* ---------- 9. 解除で消える ---------- */

await paste(fixtureText('case_direct'));
await choose('G002');
await execute();
await showView('pack');
await page.click('#btn-pack-unload');
await page.waitForTimeout(50);
const s9 = await execState();
check('E9-unload-clears', !s9.hasResult && !s9.packStaged && s9.sectionHidden && s9.options.length === 0 && s9.buttonDisabled,
  `result=${s9.hasResult} staged=${s9.packStaged}`);

/* ---------- 10. 計算失敗: 固定文・Pack は残る ---------- */

await paste(fixtureText('notification1458'));
await choose('G002');
await execute();
await page.evaluate(() => {
  const sel = document.getElementById('pack-exec-case');
  const opt = document.createElement('option');
  opt.value = 'G999';
  opt.textContent = 'G999 — P999';
  sel.appendChild(opt);
  sel.value = 'G999';
});
await execute();
const s10 = await execState();
check('E10-failure', !s10.hasResult && s10.resultHidden && s10.statusError && s10.status === FAILURE_TEXT, s10.status);
check('E10-pack-remains', s10.packStaged && !s10.packPreviewHidden && !s10.sectionHidden, 'Pack は staged のまま');
// 選択肢には harness が足した G999 が見えているので、状態行と結果欄だけを見る
check('E10-no-raw-error', !/G999|ProjectPackExecution|no entry|Error|declaredGlazingCases/.test(s10.status + '\n' + s10.resultText),
  '例外の文面を出さない');

/* ---------- 14. 申告で trust・結果が変わらない ---------- */

const strong = fixture('notification1458');
strong.evidence.sourceScopes.forEach((sc) => { sc.sourceClaim.claimedLevel = 'primary'; sc.sourceClaim.claimedPrivateReferenceAvailable = true; });
await paste(JSON.stringify(strong));
await choose('G002');
await execute();
const s14 = await execState();
check('E14-claims-no-effect', s14.result && s14.result.trust === 'pack_unreviewed' && s14.result.json === NOTIF_JSON,
  '申告を primary にしても結果は同じ');

/* ---------- 11–13. active parity・保存・通信・文言 ---------- */

await showView('single');
await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE1 = await activeSnapshot();
check('E11-runtime-parity', JSON.stringify(ACTIVE1) === JSON.stringify(ACTIVE0) && ACTIVE1.sameObject === true,
  'Pack を計算しても active context・案件プリセット UI・計算結果は同じ');
const calls = await page.evaluate(() => Object.assign({}, window.__execProbe));
const storage = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie.length }));
check('E12-no-persistence', calls.storage === 0 && calls.cookie === 0 && calls.idb === 0 && calls.caches === 0 &&
  storage.ls === 0 && storage.ss === 0 && storage.cookie === 0, JSON.stringify(storage));
check('E12-no-network', requests.length === 0 && calls.fetch === 0 && calls.xhr === 0 && calls.beacon === 0, `requests=${requests.length}`);
const url = await page.evaluate(() => ({ hash: location.hash, search: location.search, href: location.href }));
check('E12-no-url', url.hash === '' && url.search === '' && url.href === FILE && calls.history === 0, JSON.stringify(url));
check('E12-no-console', consoleMessages.length === 0 && pageErrors.length === 0,
  `console=${consoleMessages.length} pageErrors=${pageErrors.length}`);
await showView('pack');
const panel = await page.evaluate(() => document.getElementById('project-pack-section').innerText);
// S3-B3B1 の派生レポートの注意文（「…公開安全の証明にはなりません」という否定の文）だけは除いて調べる
const strongPanel = panel.replace(/計算済み ≠ 検証済み/g, '').replace(/publication advisoryが0件でも公開安全の証明にはなりません。/g, '');
check('E13-wording', !STRONG_WORDING.test(strongPanel) && !/検証済/.test(strongPanel),
  (strongPanel.match(STRONG_WORDING) || ['none'])[0]);

/* ---------- RF-22-01: 依存は初期化時に掴む（後から差し替え・追加された global を使わない） ----------
   各 scenario は新しい page で、差し替えの後に「その page で最初の」計算を行う。偽物はわざと違う値を返す。 */

async function freshPage(url) {
  const p = await browser.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url || FILE);
  await p.waitForTimeout(300);
  await showView('pack', p);
  return { p, errors };
}
async function freshPaste(p, text) {
  await p.evaluate((t) => { document.getElementById('pack-paste').value = t; }, text);
  await p.click('#btn-pack-load');
  await p.waitForTimeout(50);
}
async function freshExecute(p, caseId) {
  await p.selectOption('#pack-exec-case', caseId);
  await p.click('#btn-pack-exec');
  await p.waitForTimeout(50);
  return p.evaluate(() => ({
    hasResult: !!window.stagedProjectPackExecution,
    rows: [...document.querySelectorAll('#pack-exec-result li')].map((li) => li.textContent),
    text: document.getElementById('pack-exec-result').innerText,
    status: document.getElementById('pack-exec-status').textContent,
    packStaged: !!window.stagedProjectPackContext,
    hits: window.__decoyHits || 0
  }));
}
const missingRows = (rows, mode) => EXPECT[mode].filter((r) => !rows.includes(r));

// D1: ProjectContext を初期化後・最初の計算前に差し替える
{
  const { p, errors } = await freshPage();
  await freshPaste(p, fixtureText('notification1458'));
  await p.evaluate(() => {
    window.__decoyHits = 0;
    window.ProjectContext = new Proxy({}, { get: (t, k) => { window.__decoyHits++;
      return k === 'TRUST_BY_SOURCE_KIND' ? { project_pack_unreviewed: 'pack_unreviewed' }
        : () => { throw new Error('DECOY ProjectContext'); }; } });
  });
  const d1 = await freshExecute(p, 'G002');
  const miss = missingRows(d1.rows, 'notification1458');
  check('D1-context-decoy', d1.hasResult && miss.length === 0 && d1.hits === 0 && errors.length === 0,
    `missing=${miss.length} decoy hits=${d1.hits} errors=${errors.length}`);
  await p.close();
}

// D2: WindPressure を差し替える（偽物は桁違いの風圧を返す）
{
  const { p, errors } = await freshPage();
  await freshPaste(p, fixtureText('notification1458'));
  await p.evaluate(() => {
    window.__decoyHits = 0;
    window.WindPressure = { calculateWindPressure: () => { window.__decoyHits++;
      return { positive: { pressure: 31415926.5 }, negative: { pressure: -27182818.5 }, designPressure: 31415926.5,
        inputs: {}, normalized: {}, geometry: null, trace: [] }; } };
  });
  const d2 = await freshExecute(p, 'G002');
  const miss = missingRows(d2.rows, 'notification1458');
  check('D2-wind-decoy', d2.hasResult && miss.length === 0 && d2.hits === 0 && !/31415926|27182818/.test(d2.text) &&
    errors.length === 0, `missing=${miss.length} decoy hits=${d2.hits}`);
  await p.close();
}

// D3: GlassCalc を差し替える（偽物は存在しない候補を返す）
{
  const { p, errors } = await freshPage();
  await freshPaste(p, fixtureText('project_pressure_map'));
  await p.evaluate(() => {
    window.__decoyHits = 0;
    const cand = { label: 'DECOY-GLASS', t_max: 1, t_total: 1, P: 123456, status: 'ok', outOfScope: false, detail: {} };
    const hit = (v) => () => { window.__decoyHits++; return v; };
    window.GlassCalc = { GLASS_TYPES: { tp_single: {} }, paneAreaM2: hit(42), generateCandidates: hit([cand]),
      splitCandidates: hit({ okCandidates: [cand], ngCandidates: [], outOfScopeCandidates: [] }), sortCandidates: hit([cand]) };
  });
  const d3 = await freshExecute(p, 'G002');
  const miss = missingRows(d3.rows, 'project_pressure_map');
  check('D3-glass-decoy', d3.hasResult && miss.length === 0 && d3.hits === 0 && !d3.text.includes('DECOY-GLASS') &&
    errors.length === 0, `missing=${miss.length} decoy hits=${d3.hits}`);
  await p.close();
}

// D4: 初期化時に ProjectContext が無い tree。後から本物（さらに偽物）を置いても executor は使えないまま
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-exec-d4-'));
  fs.cpSync(REPO, dir, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(src.slice(REPO.length - 1)) });
  fs.writeFileSync(path.join(dir, 'project-config', 'project-context.js'),
    '/* intentionally empty: ProjectContext is unavailable when the executor initialises */\n');
  const { p, errors } = await freshPage('file://' + dir + '/index.html');
  const boot = await p.evaluate(() => ({ ctx: typeof window.ProjectContext, exec: typeof window.ProjectPackExecution }));
  check('D4-boot', boot.ctx === 'undefined' && boot.exec === 'object' && errors.length === 0,
    `ProjectContext=${boot.ctx} executor=${boot.exec} page errors=${errors.length}`);
  // 本物の project-context.js を executor の後で読み込む: staged context は作れる
  await p.addScriptTag({ path: path.join(REPO, 'project-config', 'project-context.js') });
  await freshPaste(p, fixtureText('case_direct'));
  const d4 = await freshExecute(p, 'G002');
  check('D4-late-genuine-not-used', d4.packStaged && !d4.hasResult && d4.status === FAILURE_TEXT && d4.rows.length === 0,
    `staged=${d4.packStaged} result=${d4.hasResult} status=${d4.status}`);
  // 本物らしく振る舞う偽物でも同じ
  await p.evaluate(() => {
    window.ProjectContext = Object.assign({}, window.ProjectContext, { assertProjectContext: (c) => c });
  });
  const d4b = await freshExecute(p, 'G002');
  check('D4-late-fake-not-used', !d4b.hasResult && d4b.status === FAILURE_TEXT, d4b.status);
  check('D4-no-page-error', errors.length === 0, JSON.stringify(errors.slice(0, 2)));
  await p.close();
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(results.join('\n'));
await browser.close();

console.log(`\nproject-pack-execution: ${pass} pass / ${fail} fail`);
finishRun('project-pack-execution', pass + fail, fail, { playwrightSource });
