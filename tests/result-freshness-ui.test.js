'use strict';

/**
 * Phase 2L-B2 / S3-B3B2-B1: index.html の結果の鮮度と、告示風圧計算の出どころの表示。
 *
 *   - 単一ケース: 最後に成功した計算の入力（正規化した ProjectInput と、結果の表示に効く設定）を snapshot として持ち、
 *     現在の入力から作り直した snapshot との比較で「現在の結果 / 変更前 / 以前の入力（正規化できない・計算が失敗）」を示す
 *   - Workspace: 最後に成功した一括計算の入力（serializeWorkspace と診断）を snapshot として持ち、サマリと一覧の両方で
 *     「変更前」を示す。結果 CSV は現在の結果のときだけ出す
 *   - 告示風圧計算の結果を「手入力値」と表示しない
 *
 * 前半は実行コードの静的な検査、後半は index.html の該当 block を vm で動かす挙動の検査（最小の偽 DOM と、
 * 実際の ProjectInput / WorkspaceCore / registry。入力の組み立ては index.html の buildCurrentProjectInput() そのもの）。
 * 実ブラウザは tools/browser-checks/result-freshness.mjs。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ProjectInput = require('../project-config/project-input.js');
const Registry = require('../project-config/registry.js');
const WorkspaceCore = require('../workspace.js');
const { inlineScripts, stripComments } = require('./support/inline-script.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const RAW_CODE = inlineScripts(HTML);
const CODE = stripComments(RAW_CODE);

const SINGLE_TEXT = {
  stale: '入力が変更されました。この結果は変更前の入力によるものです。再計算してください。',
  invalid: '現在の入力では計算できません。表示中の結果は以前の入力によるもので、現在の入力に対する結果ではありません。',
  failed: '直前の計算を完了できませんでした。表示中の結果は以前の入力によるもので、現在の入力に対する結果ではありません。'
};
const WS_TEXT = {
  summaryStale: 'Workspaceが変更されています。表示中の集計は変更前の結果です。一括計算し直してください。',
  resultsStale: 'Workspaceが変更されています。表示中の一覧は変更前の結果です。一括計算し直してください。',
  summaryFailed: '一括計算を完了できませんでした。表示中の集計は以前のWorkspaceの結果で、現在の内容に対する結果ではありません。',
  csvNotCurrent: 'CSVを出力しませんでした。表示中の結果は現在のWorkspaceの内容と一致していません。一括計算し直してから出力してください。',
  csvOutputStale: 'この欄の結果CSVは変更前のWorkspaceの結果です。現在の内容のCSVが必要な場合は、一括計算し直してから出力してください。'
};

/** top-level の関数 1 つ（次の top-level の function / var の手前まで）。 */
function fnBody(name) {
  const start = CODE.indexOf('\nfunction ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const ends = ['\nfunction ', '\nvar '].map((m) => CODE.indexOf(m, start + 1)).filter((i) => i !== -1);
  return CODE.slice(start + 1, ends.length > 0 ? Math.min(...ends) : CODE.length);
}
/** 単一ケースの鮮度の block（コメントから runCalc の見出しの手前まで）。 */
function singleBlock() {
  const marker = RAW_CODE.indexOf('単一ケースの結果の鮮度（Phase 2L-B2 / S3-B3B2-B1）');
  assert.notEqual(marker, -1, '単一ケースの鮮度の block が無い');
  const start = RAW_CODE.lastIndexOf('/*', marker);
  const end = RAW_CODE.lastIndexOf('/* ====', RAW_CODE.indexOf('\nfunction runCalc(', start));
  return RAW_CODE.slice(start, end);
}
/** Workspace の鮮度の block（コメントから setView の手前まで）。 */
function workspaceBlock() {
  const marker = RAW_CODE.indexOf('Workspace の結果の鮮度（Phase 2L-B2 / S3-B3B2-B1）');
  assert.notEqual(marker, -1, 'Workspace の鮮度の block が無い');
  const start = RAW_CODE.lastIndexOf('/*', marker);
  return RAW_CODE.slice(start, RAW_CODE.indexOf('\nfunction setView(', start));
}
const codeOnly = (src) => stripComments(src).replace(/'(?:[^'\\]|\\.)*'/g, "''");

/* ============================================================
   静的な検査
============================================================ */

test('P2L-S3B3B2B1-F01: 鮮度の表示は #result-area の外・role=status / aria-live で、既定は隠れている（色だけに頼らない）', () => {
  assert.match(STATIC, /<div class="result-wrap">\s*<!--[\s\S]*?-->\s*<div class="result-freshness" id="single-result-freshness" role="status" aria-live="polite" aria-atomic="true" hidden><\/div>\s*<div class="result-col" id="result-area" data-result-freshness="none" aria-describedby="single-result-freshness">/);
  assert.match(STATIC, /<div class="card" id="batch-summary-card" data-result-freshness="none" hidden>[\s\S]{0,300}<div class="result-freshness" id="batch-summary-freshness" role="status" aria-live="polite" aria-atomic="true" hidden><\/div>/);
  // 一覧の側は読み上げを重ねない（サマリ側の 1 か所だけが live region）
  assert.match(STATIC, /<div class="card" id="batch-results-card" data-result-freshness="none" hidden>[\s\S]{0,300}<div class="result-freshness" id="batch-results-freshness" hidden><\/div>/);
  // [hidden] を display で上書きしない（AC-01 と同じ落とし穴）
  assert.match(HTML, /\.result-freshness\[hidden\]\s*\{\s*display:\s*none;\s*\}/);
  // 変更前・以前の入力は、薄くするだけでなく文字でも示す
  assert.match(HTML, /#result-area\[data-result-freshness="stale"\] \.judge-badge::after \{\s*content: '変更前';/);
  assert.match(HTML, /#result-area\[data-result-freshness="failed"\] \.judge-badge::after \{\s*content: '以前の入力';/);
  ['stale', 'invalid', 'failed'].forEach((s) => assert.match(HTML, new RegExp('#result-area\\[data-result-freshness="' + s + '"\\]')));
});

test('P2L-S3B3B2B1-F02: runCalc() は最初に試行を始め、描画した後にだけ snapshot を記録する（失敗の経路も表示を更新する）', () => {
  const run = fnBody('runCalc');
  const first = run.indexOf('{') + 1;
  assert.equal(run.slice(first).trim().startsWith('beginSingleCalcAttempt();'), true, '最初の文が beginSingleCalcAttempt() ではない');
  assert.equal(run.indexOf('noteSingleCalcSuccess(mode, pkg);') > run.lastIndexOf('renderResults('), true, '描画の前に成功を記録している');
  assert.equal((run.match(/noteSingleCalcSuccess\(/g) || []).length, 1);
  // 案件プリセットを読めない分岐（既存の順序のまま）・入力の失敗の分岐
  assert.equal(run.indexOf("mode === 'preset' && !activeProjectContext") < run.indexOf('buildCurrentProjectInput()'), true);
  assert.match(run, /renderPresetContextUnavailable\(\);\s*noteSingleCalcUnavailable\(\);\s*return;/);
  assert.match(run, /renderSingleResultFreshness\(\);\s*alert\('幅・高さに正の数値を入力してください。'\);\s*return;/);
  assert.match(run, /renderSingleResultFreshness\(\);\s*alert\('入力値が不正です: ' \+ e\.message\);\s*return;/);
  // 入力を変えただけでは計算しない（入力のイベントは表示の更新だけ）
  const block = codeOnly(singleBlock());
  assert.equal(/runCalc\(|generateCandidates|GlassCalc|calculateWindPressure/.test(block), false);
  assert.match(block, /view\.addEventListener\(type, function \(\) \{ renderSingleResultFreshness\(\); \}\)/);
});

test('P2L-S3B3B2B1-F03: snapshot は正規化した ProjectInput と表示に効く設定から作り、旗ではなくその場で比べる', () => {
  const block = codeOnly(singleBlock());
  assert.match(fnBody('singleInputSnapshot'), /input: ProjectInput\.serialize\(pkg\)/);
  assert.match(fnBody('singleInputSnapshot'), /floor: mode === '' \? document\.getElementById\(''\)\.value : null|floor: mode === 'preset'/);
  assert.match(fnBody('currentSingleInputSnapshot'), /singleInputSnapshot\(mode, buildCurrentProjectInput\(\)\)/);
  assert.match(fnBody('getSingleResultFreshness'), /current === lastSuccessfulSingleInputSnapshot/);
  // 値を丸めない・弱い hash にしない・dirty の旗を持たない
  assert.equal(/toFixed|Math\.round|hash|dirty/i.test(block), false);
  // 表示は固定文を textContent で入れる（innerHTML を使わない）
  assert.equal(/innerHTML|insertAdjacentHTML/.test(block), false);
  assert.match(fnBody('renderSingleResultFreshness'), /host\.textContent = text/);
});

test('P2L-S3B3B2B1-F04: Workspace の snapshot は serializeWorkspace と診断で、件数だけを見ない。描画と件数の更新の両方で判定する', () => {
  assert.match(fnBody('currentWorkspaceSnapshot'),
    /JSON\.stringify\(\[WorkspaceCore\.serializeWorkspace\(batchWorkspace\), batchInvalidDiagnostics\]\)/);
  const block = codeOnly(workspaceBlock());
  assert.equal(/\.size\(\)|batchResults\.length|hash|dirty|toFixed/i.test(block), false, '件数・弱い hash・旗で判定している');
  assert.equal(/innerHTML|activeReview|review-print|applyPrintEligibility|ReviewPackage/.test(block), false,
    'Review の鮮度・印刷の gate に触れている');
  const evaluate = fnBody('batchEvaluate');
  assert.equal(evaluate.indexOf('lastWorkspaceEvaluationSucceeded = false;') < evaluate.indexOf('try {'), true);
  assert.equal(evaluate.indexOf('currentWorkspaceSnapshot()') < evaluate.indexOf('WorkspaceCore.evaluateWorkspace('), true,
    '評価する入力を評価の前に取っていない');
  assert.equal(evaluate.indexOf('lastEvaluatedWorkspaceSnapshot = evaluatedSnapshot;') < evaluate.indexOf('batchRender();'), true);
  assert.match(fnBody('batchUpdateCount'), /renderWorkspaceResultFreshness\(\);/);
  assert.match(fnBody('batchRender'), /renderWorkspaceResultFreshness\(\);/);
  assert.match(fnBody('setView'), /if \(isBatch\) renderWorkspaceResultFreshness\(\);\s*else renderSingleResultFreshness\(\);/);
  // 結果 CSV の gate は出力の直前。古い結果のときは出力欄を書き換えない
  const csv = fnBody('batchExportCsv');
  assert.equal(csv.indexOf('renderWorkspaceResultFreshness()') < csv.indexOf('WorkspaceCore.toCsv('), true);
  assert.match(csv, /!== WORKSPACE_RESULT_FRESHNESS\.FRESH\) \{\s*batchSetStatus\('batch-json-status', WORKSPACE_CSV_NOT_CURRENT_TEXT, true\);\s*return;/);
  // Workspace JSON の Export は計算結果ではないので gate を掛けない
  assert.equal(/Freshness|FRESHNESS/.test(fnBody('batchExportJson')), false);
});

test('P2L-S3B3B2B1-F05: 告示風圧計算の出どころは「手入力値」ではなく、風条件から算定した値として書く（verified にしない）', () => {
  const render = fnBody('renderResults');
  const title = render.slice(render.indexOf('const windSelectionTitle'), render.indexOf('const windSelectionNote'));
  const note = render.slice(render.indexOf('const windSelectionNote'), render.indexOf('const windHtml'));
  assert.match(title, /mode === 'notification' \? '設計風圧の選定（告示風圧計算: 入力した風条件から算定）'/);
  assert.equal(title.indexOf("mode === 'notification'") < title.indexOf("'設計風圧の選定（手入力値）'"), true);
  assert.match(note, /mode === 'notification'\s*\? '※ 正圧・負圧は、入力した風条件から告示1458号系の算定式で計算した値です（sourceKind: notification_calculation）。'/);
  assert.match(note, /'（verificationStatus: ' \+ escHtml\(windStatus\) \+ '）。'/);
  assert.equal(/verificationStatus: verified|検証済み/.test(note), false);
  // 手入力の注記は従来どおり
  assert.match(note, /'※ 正圧・負圧は現在画面に表示されている値（source: user_input）です。初期表示値も含め、案件原典との照合は本ツールでは行っていません。'/);
});

test('P2L-S3B3B2B1-F06: 鮮度の文は固定文で、入力値・snapshot を写さず、保存・通信・console をしない', () => {
  const both = codeOnly(singleBlock()) + codeOnly(workspaceBlock()) + codeOnly(fnBody('batchExportCsv'));
  [/localStorage/, /sessionStorage/, /indexedDB/, /fetch\(/, /XMLHttpRequest/, /sendBeacon/, /console\./, /location\./, /history\./]
    .forEach((re) => assert.equal(re.test(both), false, String(re)));
  // 文の定義は文字列の literal だけ（連結や template で値を差し込まない）
  for (const t of Object.values(SINGLE_TEXT).concat(Object.values(WS_TEXT))) {
    assert.equal(RAW_CODE.includes("'" + t + "'"), true, t);
    assert.equal(/\d/.test(t), false, '固定文に数字が入っている: ' + t);
  }
  assert.equal(/\$\{/.test(singleBlock() + workspaceBlock()), false);
});

test('P2L-S3B3B2B1-F07: browser harness は登録され、Pack の検証器・adapter・executor・batch・report を呼ばない', () => {
  const spec = JSON.parse(read('tools/verification/verification-spec.json'));
  const inst = spec.instruments.find((i) => i.id === 'result-freshness');
  assert.ok(inst, 'verification-spec に result-freshness が無い');
  assert.equal(inst.command, 'node tools/browser-checks/result-freshness.mjs');
  assert.equal(inst.admissibility, 'UNVERIFIED');
  assert.equal(inst.evidenceClass, 'observational');
  assert.ok(inst.instrumentFiles.includes('tools/browser-checks/result-freshness.mjs'));
  assert.ok(spec.browserAssertions.some((a) => a.id === 'result-freshness-not-shown-as-current' && a.instrument === 'result-freshness'));
  const src = read('tools/browser-checks/result-freshness.mjs');
  assert.match(src, /openBrowser\(/);
  assert.match(src, /finishRun\(/);
  assert.equal(/validateProjectPack|fromProjectPack|executeCase\(|createBatchRun\(|executeAll\(|buildReport\(|require\([^)]*(project-pack|project-context)/.test(src), false);
  assert.match(read('tools/browser-checks/README.md'), /\| `result-freshness\.mjs` \| \d+ \|/);
});

/* ============================================================
   単一ケースの block を vm で動かす（入力の組み立ては index.html の関数そのもの）
============================================================ */

function fakeElement(value) {
  return {
    value, hidden: true, textContent: '', attrs: {}, className: '', classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    addEventListener() {}
  };
}

function singleSandbox() {
  const presetId = Registry.getRuntimeDefaultBuiltInPresetId();
  const floors = Object.keys(Registry.getBuiltInPreset(presetId).wind.positivePressureByFloor);
  const els = {
    'inp-mode': fakeElement('manual'), 'inp-W': fakeElement('900'), 'inp-H': fakeElement('1800'), 'inp-type': fakeElement('lowe_fl'),
    'inp-coeff': fakeElement('1.00'), 'inp-floor': fakeElement(floors[0]), 'inp-zone': fakeElement('general'),
    'inp-manual-pos': fakeElement('1400'), 'inp-manual-neg': fakeElement('-1000'),
    'inp-wind-basis': fakeElement('notification_baseline'), 'inp-wind-recurrence': fakeElement('50'), 'inp-wind-v0': fakeElement('30'),
    'inp-wind-roughness': fakeElement('II'), 'inp-wind-building-h': fakeElement('12.0'), 'inp-wind-eaves-h': fakeElement('12.0'),
    'inp-wind-z': fakeElement('9.0'), 'inp-wind-building-type': fakeElement('closed'), 'inp-wind-zone': fakeElement('general'),
    'inp-wind-compare': fakeElement('on'), 'inp-wind-short-side': fakeElement(''),
    'result-area': fakeElement(''), 'single-result-freshness': fakeElement(''), 'view-single': fakeElement('')
  };
  const sandbox = {
    ProjectInput, PresetRegistry: Registry, importedPackage: null,
    activeProjectContext: { origin: { registryProjectId: presetId } },
    requireActiveProjectContext() { return sandbox.activeProjectContext; },
    document: { getElementById: (id) => els[id] || null },
    window: { addEventListener() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext([fnBody('getInputMode'), fnBody('buildWindInputFromUI'), fnBody('buildCurrentProjectInput'), singleBlock()].join('\n'), sandbox);
  /** runCalc() の成功と同じ順（試行の開始 → 入力の package → 記録）。 */
  sandbox.succeed = () => {
    sandbox.beginSingleCalcAttempt();
    sandbox.noteSingleCalcSuccess(els['inp-mode'].value, sandbox.buildCurrentProjectInput());
  };
  return { sb: sandbox, els };
}
const state = (sb) => sb.getSingleResultFreshness();

test('P2L-S3B3B2B1-S01..S05: 計算した後は現在の結果。W・H・構成・係数を変えると「変更前」、戻すと現在の結果', () => {
  const { sb, els } = singleSandbox();
  assert.equal(state(sb), 'none', '成功した計算が無ければ未計算');
  sb.succeed();
  assert.equal(state(sb), 'fresh');
  for (const [id, value] of [['inp-W', '1200'], ['inp-H', '2000'], ['inp-type', 'fl_single'], ['inp-coeff', '0.95']]) {
    const original = els[id].value;
    els[id].value = value;
    assert.equal(state(sb), 'stale', id);
    els[id].value = original;
    assert.equal(state(sb), 'fresh', id + ' を戻すと現在の結果');
  }
  // 丸めない（ごく小さな違いも「変更前」）
  els['inp-W'].value = '900.0000000001';
  assert.equal(state(sb), 'stale');
  els['inp-W'].value = '900';
});

test('P2L-S3B3B2B1-S06/S07/S14: 案件プリセットの階・部位、手入力の正圧・負圧。選んでいない mode の入力では変えない', () => {
  const { sb, els } = singleSandbox();
  sb.succeed();
  // manual: 告示・プリセットの隠れた入力は無関係
  for (const [id, value] of [['inp-wind-v0', '40'], ['inp-wind-compare', 'off'], ['inp-floor', 'R'], ['inp-zone', 'corner']]) {
    const original = els[id].value;
    els[id].value = value;
    assert.equal(state(sb), 'fresh', 'manual で ' + id);
    els[id].value = original;
  }
  els['inp-manual-pos'].value = '1500';
  assert.equal(state(sb), 'stale');
  els['inp-manual-pos'].value = '1400';
  els['inp-manual-neg'].value = '-1100';
  assert.equal(state(sb), 'stale');
  els['inp-manual-neg'].value = '-1000';
  // preset
  els['inp-mode'].value = 'preset';
  assert.equal(state(sb), 'stale', 'mode を変えたら（計算するまで）変更前');
  sb.succeed();
  assert.equal(state(sb), 'fresh');
  const floors = Object.keys(Registry.getBuiltInPreset(Registry.getRuntimeDefaultBuiltInPresetId()).wind.positivePressureByFloor);
  els['inp-floor'].value = floors[1];
  assert.equal(state(sb), 'stale');
  els['inp-floor'].value = floors[0];
  els['inp-zone'].value = 'corner';
  assert.equal(state(sb), 'stale');
  els['inp-zone'].value = 'general';
  els['inp-manual-pos'].value = '2999';
  assert.equal(state(sb), 'fresh', 'preset で手入力の値は無関係');
  // 階の表示は package に入らない（同じ package でも階が違えば別の snapshot）
  const pkg = sb.buildCurrentProjectInput();
  const a = sb.singleInputSnapshot('preset', pkg);
  els['inp-floor'].value = floors[1];
  assert.notEqual(sb.singleInputSnapshot('preset', pkg), a);
});

test('P2L-S3B3B2B1-S08/S15: 告示の風条件・参考比較の表示。協会推奨でないときの再現期間は無関係', () => {
  const { sb, els } = singleSandbox();
  els['inp-mode'].value = 'notification';
  sb.succeed();
  for (const [id, value] of [['inp-wind-v0', '32'], ['inp-wind-roughness', 'III'], ['inp-wind-building-h', '15'],
    ['inp-wind-eaves-h', '11'], ['inp-wind-z', '7.5'], ['inp-wind-building-type', 'open'], ['inp-wind-zone', 'corner'],
    ['inp-wind-short-side', '20'], ['inp-wind-compare', 'off'], ['inp-wind-basis', 'itakyo_recommended']]) {
    const original = els[id].value;
    els[id].value = value;
    assert.equal(state(sb), 'stale', id);
    els[id].value = original;
    assert.equal(state(sb), 'fresh', id + ' を戻す');
  }
  els['inp-wind-recurrence'].value = '300';
  assert.equal(state(sb), 'fresh', '告示1458号系では再現期間を使わない');
  els['inp-wind-basis'].value = 'itakyo_recommended';
  sb.succeed();
  els['inp-wind-recurrence'].value = '100';
  assert.equal(state(sb), 'stale', '協会推奨では再現期間が計算に効く');
  // 手入力の値は無関係
  els['inp-wind-recurrence'].value = '300';
  sb.succeed();
  els['inp-manual-pos'].value = '9999';
  assert.equal(state(sb), 'fresh');
});

test('P2L-S3B3B2B1-S09/S13: 取り込みデータ（package の差し替え・W の変更）、package が無ければ以前の入力', () => {
  const { sb, els } = singleSandbox();
  sb.importedPackage = ProjectInput.deserialize(ProjectInput.serialize(ProjectInput.fromManual({ widthMm: 900, heightMm: 1800,
    positivePressure: 1400, negativePressure: -1000, glassType: 'lowe_fl', extraFactor: 1 })));
  els['inp-mode'].value = 'imported';
  sb.succeed();
  assert.equal(state(sb), 'fresh');
  els['inp-W'].value = '1000';
  assert.equal(state(sb), 'stale');
  els['inp-W'].value = '900';
  assert.equal(state(sb), 'fresh');
  // 別の package を取り込むと（計算するまで）変更前
  sb.importedPackage = ProjectInput.deserialize(ProjectInput.serialize(ProjectInput.fromManual({ widthMm: 900, heightMm: 1800,
    positivePressure: 1600, negativePressure: -1000, glassType: 'lowe_fl', extraFactor: 1 })));
  assert.equal(state(sb), 'stale');
  sb.importedPackage = null;
  assert.equal(state(sb), 'invalid', '取り込みが無ければ比較できない');
});

test('P2L-S3B3B2B1-S10/S11/S12: 正規化できない入力・計算の失敗の後は現在扱いしない。成功すると戻る', () => {
  const { sb, els } = singleSandbox();
  sb.succeed();
  for (const value of ['', 'abc', '-5', '0']) {
    els['inp-W'].value = value;
    assert.equal(state(sb), 'invalid', JSON.stringify(value));
  }
  els['inp-W'].value = '900';
  els['inp-manual-pos'].value = 'x';
  assert.equal(state(sb), 'invalid', '正圧が数でない');
  els['inp-manual-pos'].value = '1400';
  assert.equal(state(sb), 'fresh');
  // 計算を始めて成功しなかった（例外・入力の失敗）: 入力が以前と同じでも現在扱いしない
  sb.beginSingleCalcAttempt();
  assert.equal(state(sb), 'failed');
  sb.succeed();
  assert.equal(state(sb), 'fresh');
  // 案件プリセットを読めない（結果の代わりにエラー）: 表示中の結果は無い
  sb.noteSingleCalcUnavailable();
  assert.equal(state(sb), 'none');
  els['inp-mode'].value = 'preset';
  sb.activeProjectContext = null;
  sb.succeed = null;
  assert.equal(sb.currentSingleInputSnapshot(), null);
});

test('P2L-S3B3B2B1-S16: 表示は固定文・属性だけで、状態ごとに出し分ける（現在の結果では消える）', () => {
  const { sb, els } = singleSandbox();
  const host = els['single-result-freshness'];
  const area = els['result-area'];
  assert.equal(sb.renderSingleResultFreshness(), 'none');
  assert.equal(host.hidden, true);
  assert.equal(area.getAttribute('data-result-freshness'), 'none');
  sb.succeed();
  assert.equal(host.hidden, true);
  assert.equal(host.textContent, '');
  els['inp-W'].value = '1234';
  assert.equal(sb.renderSingleResultFreshness(), 'stale');
  assert.equal(host.hidden, false);
  assert.equal(host.textContent, SINGLE_TEXT.stale);
  assert.equal(area.getAttribute('data-result-freshness'), 'stale');
  els['inp-W'].value = '';
  sb.renderSingleResultFreshness();
  assert.equal(host.textContent, SINGLE_TEXT.invalid);
  els['inp-W'].value = '900';
  sb.beginSingleCalcAttempt();
  sb.renderSingleResultFreshness();
  assert.equal(host.textContent, SINGLE_TEXT.failed);
  sb.succeed();
  assert.equal(host.hidden, true);
  assert.equal(host.textContent, '');
  assert.equal(area.getAttribute('data-result-freshness'), 'fresh');
});

/* ============================================================
   Workspace の block を vm で動かす（実際の WorkspaceCore。batchEvaluate / batchExportCsv / batchClear は index.html のもの）
============================================================ */

function workspaceSandbox() {
  const els = {};
  ['batch-summary-card', 'batch-results-card', 'batch-summary-freshness', 'batch-results-freshness', 'batch-json', 'batch-json-status',
    'batch-status'].forEach((id) => { els[id] = fakeElement(''); });
  const statuses = [];
  const sandbox = {
    WorkspaceCore, document: { getElementById: (id) => els[id] || null },
    batchWorkspace: WorkspaceCore.createWorkspace(), batchInvalidDiagnostics: [], batchResults: [],
    batchSetStatus(id, message, isError) { statuses.push([id, message, !!isError]); els[id].textContent = message; },
    renders: 0
  };
  vm.createContext(sandbox);
  vm.runInContext([workspaceBlock(), fnBody('batchEvaluate'), fnBody('batchExportCsv'), fnBody('batchClear'),
    'function batchUpdateCount() { renderWorkspaceResultFreshness(); }',
    'function batchRender() { renders++; renderWorkspaceResultFreshness(); }'].join('\n'), sandbox);
  return { sb: sandbox, els, statuses };
}
const manualPkg = (widthMm) => ProjectInput.fromManual({ widthMm, heightMm: 1800, positivePressure: 1400, negativePressure: -1000,
  glassType: 'lowe_fl', extraFactor: 1 });

test('P2L-S3B3B2B1-W01..W05/W09: 未計算 → 計算後は現在 → 追加・件数が同じ内容の変更で変更前（サマリと一覧の両方）→ 再計算で戻る', () => {
  const { sb, els } = workspaceSandbox();
  assert.equal(sb.renderWorkspaceResultFreshness(), 'none');
  sb.batchWorkspace.addCase(manualPkg(900));
  sb.batchEvaluate();
  assert.equal(sb.getWorkspaceResultFreshness(), 'fresh');
  assert.equal(els['batch-summary-card'].getAttribute('data-result-freshness'), 'fresh');
  assert.equal(els['batch-summary-freshness'].hidden, true);
  sb.batchWorkspace.addCase(manualPkg(1000));
  assert.equal(sb.renderWorkspaceResultFreshness(), 'stale');
  assert.equal(els['batch-summary-freshness'].textContent, WS_TEXT.summaryStale);
  assert.equal(els['batch-results-freshness'].textContent, WS_TEXT.resultsStale);
  assert.equal(els['batch-results-card'].getAttribute('data-result-freshness'), 'stale');
  assert.equal(sb.batchResults.length, 1, '古い結果は消さない（変更前と示すだけ）');
  sb.batchEvaluate();
  assert.equal(sb.getWorkspaceResultFreshness(), 'fresh');
  // 件数が同じで内容が違う
  const first = sb.batchWorkspace.listCases()[0].caseId;
  sb.batchWorkspace.removeCase(first);
  sb.batchWorkspace.addCase(manualPkg(1100));
  assert.equal(sb.batchWorkspace.size(), 2);
  assert.equal(sb.getWorkspaceResultFreshness(), 'stale');
  sb.batchEvaluate();
  assert.equal(sb.getWorkspaceResultFreshness(), 'fresh');
});

test('P2L-S3B3B2B1-W08: 診断（取り込めなかった行）の増減も検出する', () => {
  const { sb } = workspaceSandbox();
  sb.batchWorkspace.addCase(manualPkg(900));
  sb.batchInvalidDiagnostics = WorkspaceCore.errorsToInvalidResults([{ row: 2, caseId: 'T1', field: 'width_mm', reason: 'must be a number' }], 'tsv');
  sb.batchEvaluate();
  assert.equal(sb.getWorkspaceResultFreshness(), 'fresh');
  sb.batchInvalidDiagnostics = [];
  assert.equal(sb.getWorkspaceResultFreshness(), 'stale');
  sb.batchEvaluate();
  sb.batchInvalidDiagnostics = sb.batchInvalidDiagnostics.concat(
    WorkspaceCore.errorsToInvalidResults([{ row: 3, caseId: 'T2', field: 'height_mm', reason: 'must be a number' }], 'tsv'));
  assert.equal(sb.getWorkspaceResultFreshness(), 'stale');
});

test('P2L-S3B3B2B1-W10/W11: 古い結果の CSV は出さず出力欄を書き換えない。現在の結果の CSV は toCsv と同じ。残った古い CSV は注記する', () => {
  const { sb, els } = workspaceSandbox();
  sb.batchWorkspace.addCase(manualPkg(900));
  sb.batchEvaluate();
  sb.batchWorkspace.addCase(manualPkg(1000));
  els['batch-json'].value = '{"keep":"this"}';
  sb.batchExportCsv();
  assert.equal(els['batch-json'].value, '{"keep":"this"}');
  assert.equal(els['batch-json-status'].textContent, WS_TEXT.csvNotCurrent);
  sb.batchEvaluate();
  sb.batchExportCsv();
  assert.equal(els['batch-json'].value, WorkspaceCore.toCsv(WorkspaceCore.mergeEvaluationResults(WorkspaceCore.evaluateWorkspace(sb.batchWorkspace), [])));
  const written = els['batch-json'].value;
  sb.batchWorkspace.addCase(manualPkg(1100));
  sb.renderWorkspaceResultFreshness();
  assert.equal(els['batch-json'].value, written, '出力欄は書き換えない');
  assert.equal(els['batch-json-status'].textContent, WS_TEXT.csvOutputStale);
  // 未計算のまま押すと、従来どおり一括計算してから出す（現在の結果だけ）
  const fresh = workspaceSandbox();
  fresh.sb.batchWorkspace.addCase(manualPkg(900));
  fresh.sb.batchExportCsv();
  assert.equal(fresh.sb.getWorkspaceResultFreshness(), 'fresh');
  assert.equal(fresh.els['batch-json'].value.split('\n').length, 2);
});

test('P2L-S3B3B2B1-W-failed / W-clear: 一括計算の失敗の後は現在扱いせず CSV も出さない。すべて削除で未計算に戻る', () => {
  const { sb, els } = workspaceSandbox();
  sb.batchWorkspace.addCase(manualPkg(900));
  sb.batchEvaluate();
  const real = sb.WorkspaceCore;
  sb.WorkspaceCore = Object.assign({}, real, { evaluateWorkspace() { throw new Error('injected'); } });
  sb.batchEvaluate();
  assert.equal(sb.getWorkspaceResultFreshness(), 'failed');
  assert.equal(els['batch-summary-freshness'].textContent, WS_TEXT.summaryFailed);
  els['batch-json'].value = '';
  sb.batchExportCsv();
  assert.equal(els['batch-json'].value, '');
  assert.equal(els['batch-json-status'].textContent, WS_TEXT.csvNotCurrent);
  sb.WorkspaceCore = real;
  sb.batchEvaluate();
  assert.equal(sb.getWorkspaceResultFreshness(), 'fresh');
  sb.batchClear();
  assert.equal(sb.getWorkspaceResultFreshness(), 'none');
  assert.equal(els['batch-summary-card'].getAttribute('data-result-freshness'), 'none');
});
