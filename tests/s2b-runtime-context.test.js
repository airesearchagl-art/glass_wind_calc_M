'use strict';

/**
 * Phase 2L-B2 / S2-B: legacy runtime → ProjectContext wiring の静的 architecture guard。
 *
 * index.html の案件プリセット表示・入力・Evidence UI は active ProjectContext から読む。
 * 案件 module（built-in preset）を直接読む経路・案件 id / topology / 寸法の hard-code が
 * 実行コードに戻っていないことを、ここで固定する。実ブラウザでの挙動は
 * tools/browser-checks/context-runtime.mjs が確かめる（合成 built-in への差し替えを含む）。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const STATIC = HTML.split('<script')[0];

const { inlineScripts, stripComments } = require('./support/inline-script.js');

const CODE = stripComments(inlineScripts(HTML));

function fnBody(name) {
  const start = CODE.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  // 次の top-level function 宣言までを本体とみなす
  const next = CODE.indexOf('\nfunction ', start + 1);
  return CODE.slice(start, next === -1 ? CODE.length : next);
}

test('P2L-S2B-01: 走査の前提——実行コードを取り出せている（陽性対照）', () => {
  assert.equal(CODE.length > 50000, true, 'inline script を取り出せていない');
  assert.match(CODE, /function runCalc\(/);
  assert.match(CODE, /function renderEvidenceClosureMatrix\(/);
  // コメントは除かれ、文字列は残っている
  assert.equal(CODE.includes('案件プリセットを読み込めませんでした'), true);
  assert.equal((CODE.match(/\/\*/g) || []).length, 0, 'block comment が残っている（走査が途中で崩れた）');
  // 走査が途中で崩れていない: script 末尾近くの宣言まで届き、top-level 宣言の数が一致する
  assert.match(CODE, /function batchImportJson\(/);
  const decl = (t) => (t.match(/^function [A-Za-z0-9_]+\(/gm) || []).length;
  assert.equal(decl(CODE), decl(inlineScripts(HTML)));
});

test('P2L-S2B-02: script の読み込み順——project-input → project-pack → project-context', () => {
  const at = (f) => HTML.indexOf('<script src="' + f + '"></script>');
  const order = ['calc.js', 'wind-pressure.js', 'project-config/evidence.js', 'project-config/evidence-ledger.js',
    'project-config/sample.js', 'project-config/manual.js', 'project-config/registry.js',
    'project-config/evidence-closure.js', 'project-config/project-input.js',
    'project-config/project-pack.js', 'project-config/project-context.js',
    'workspace.js', 'project-profile.js', 'review-package.js'];
  order.forEach((f) => assert.notEqual(at(f), -1, f + ' が読み込まれていない'));
  for (let i = 1; i < order.length; i++) {
    assert.equal(at(order[i - 1]) < at(order[i]), true, order[i - 1] + ' は ' + order[i] + ' より前');
  }
  // project-context.js の依存はすべて先に読み込まれている
  ['project-config/evidence.js', 'project-config/registry.js', 'project-config/project-pack.js', 'wind-pressure.js']
    .forEach((dep) => assert.equal(at(dep) < at('project-config/project-context.js'), true, dep));
});

test('P2L-S2B-03: 案件 module を runtime data source として読まない', () => {
  assert.equal(/MiyoshiProjectConfig/.test(CODE), false, 'MiyoshiProjectConfig を読んでいる');
  assert.equal(/\.getPreset\(/.test(CODE), false, 'getPreset() を使っている');
  assert.equal(/getBuiltInPreset\(\s*['"`]/.test(CODE), false, 'getBuiltInPreset() に id を書いている');
  assert.equal(/fromLegacyPreset\(\s*['"`]/.test(CODE), false, 'fromLegacyPreset() に id を書いている');
  assert.equal(/evaluateClosure\(\s*['"`]/.test(CODE), false, 'evaluateClosure() に id を書いている');
  // 案件名を UI の source にしない
  assert.equal(/みよし|Miyoshi|三好/.test(CODE), false, '実行コードに案件名がある');
  assert.equal(/みよし|Miyoshi|三好/.test(STATIC), false, '静的HTMLに案件名がある');
  // S2-C: 一時的な mode token 'miyoshi' は generic な 'preset' へ移った。実行コードに案件 id は残らない
  assert.equal(/miyoshi/i.test(CODE), false, '実行コードで案件 id を使っている: ' +
    (CODE.match(/.{0,60}miyoshi.{0,60}/i) || [''])[0]);
});

test('P2L-S2B-04: active ProjectContext は fromLegacyPreset() でだけ作り、runtime default の built-in だけを選ぶ（S3-A）', () => {
  // S3-A: 「built-in がちょうど 1 件なら先頭」は終了。選択は registry の runtimeDefault 宣言だけで決まり、
  // 曖昧・未読込は registry 側で fail closed（id 一覧の件数や位置では選ばない）。
  const init = fnBody('initActiveProjectContext');
  assert.match(init, /ProjectContext\.fromLegacyPreset\(PresetRegistry\.getRuntimeDefaultBuiltInPresetId\(\)\)/);
  assert.equal(/BUILT_IN_PRESET_IDS|candidates/.test(init), false, 'id 一覧から選んでいる');
  // id 一覧は trust の根ではない: context を作るのは fromLegacyPreset だけ
  assert.equal((CODE.match(/fromLegacyPreset\(/g) || []).length, 1);
  // S3-B1: Project Pack は staged preview の intake（loadProjectPackText）でだけ扱い、active context にはしない
  // （intake の境界は tests/s3b1-project-pack-intake.test.js）
  assert.equal((CODE.match(/fromProjectPack\(|validateProjectPack\(/g) || []).length, 2, 'Project Pack の経路が intake 以外にある');
  const intake = fnBody('loadProjectPackText');
  assert.match(intake, /ProjectPack\.validateProjectPack\(raw\)[\s\S]*ProjectContext\.fromProjectPack\(validated\)/);
  assert.equal(/activeProjectContext/.test(intake), false, 'Project Pack が active context になりうる');
  // 失敗時に案件 module へ fallback しない（明示エラー）
  const apply = fnBody('applyActiveProjectContextToUI');
  assert.match(apply, /読み込めませんでした/);
  const run = fnBody('runCalc');
  assert.match(run, /mode === 'preset' && !activeProjectContext/);
  assert.equal(run.indexOf("mode === 'preset' && !activeProjectContext") < run.indexOf('buildCurrentProjectInput()'), true,
    'context が無いときの分岐が package 生成より後にある');
  assert.match(fnBody('renderPresetContextUnavailable'), /案件プリセットモードでは計算しません/);
});

test('P2L-S2B-05: 階・部位の選択肢を HTML / コードに持たない（context から生成）', () => {
  const floorSel = STATIC.match(/<select id="inp-floor"[^>]*>([\s\S]*?)<\/select>/);
  const zoneSel = STATIC.match(/<select id="inp-zone"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(floorSel && zoneSel, 'selector が無い');
  assert.equal(/<option/.test(floorSel[1]), false, 'inp-floor に選択肢が hard-code されている');
  assert.equal(/<option/.test(zoneSel[1]), false, 'inp-zone に選択肢が hard-code されている');
  const apply = fnBody('applyActiveProjectContextToUI');
  assert.match(apply, /contextCapability\(ctx, 'projectPressureMap'\)/);
  assert.match(apply, /map\.positivePressures\.map\(/);
  assert.match(apply, /map\.negativePressures\.map\(/);
  // 案件の階表記・代表 scope を書かない
  assert.equal(/'1F|'2F|'RF'|1F \/ 2F|'R階'|'1階'|'2階'/.test(CODE), false, '階の表記が hard-code されている');
  assert.equal(/getPositivePressure\(|getNegativePressure\(/.test(CODE), false, 'preset の accessor を直接呼んでいる');
  // 部位の表示名は generic な zone 語彙にだけ対応する
  const Wind = require('../wind-pressure.js');
  const labels = CODE.match(/var ZONE_DISPLAY_LABELS = (\{[^}]*\});/);
  assert.ok(labels, 'ZONE_DISPLAY_LABELS が無い');
  const keys = Object.keys(Function('return ' + labels[1])());
  assert.deepEqual(keys.slice().sort(), Array.from(Wind.ZONES).slice().sort());
  assert.match(fnBody('zoneDisplayLabel'), /throw new Error\('unknown zone/);
});

test('P2L-S2B-06: 初期 W/H を HTML や literal から取らない（sampleDefaultDimensions が正）', () => {
  assert.equal(/<input[^>]*id="inp-W"[^>]*\svalue=/.test(STATIC), false, 'inp-W に既定値がある');
  assert.equal(/<input[^>]*id="inp-H"[^>]*\svalue=/.test(STATIC), false, 'inp-H に既定値がある');
  assert.equal(/1250|2050/.test(STATIC.replace(/placeholder="[^"]*"/g, '')), false, '静的HTMLに既定寸法がある');
  assert.equal(/getElementById\('inp-[WH]'\)\.(defaultValue|getAttribute)/.test(CODE), false);
  // inp-W / inp-H へ値を入れるのは、context の sampleDefaultDimensions（初期表示）と、
  // 取り込んだ package の寸法（importProjectInput の中だけ）。literal や HTML 値からは入れない。
  const writes = CODE.match(/getElementById\('inp-[WH]'\)\.value\s*=\s*[^;]+;/g) || [];
  assert.deepEqual(writes.map((w) => w.replace(/\s+/g, ' ')), [
    "getElementById('inp-W').value = dims.widthMm.value;",
    "getElementById('inp-H').value = dims.heightMm.value;",
    "getElementById('inp-W').value = pkg.widthMm;",
    "getElementById('inp-H').value = pkg.heightMm;"
  ]);
  const imp = fnBody('importProjectInput');
  assert.equal(imp.includes("getElementById('inp-W').value = pkg.widthMm;"), true, '取り込み以外で寸法を入れている');
  const apply = fnBody('applyActiveProjectContextToUI');
  assert.match(apply, /var dims = contextCapability\(ctx, 'sampleDefaultDimensions'\);/);
  const run = fnBody('runCalc');
  assert.match(run, /contextCapability\(presetCtx, 'sampleDefaultDimensions'\)/);
  assert.match(run, /groupStatus\.dimensions !== 'verified'/);
});

test('P2L-S2B-07: 計算は compatibility bridge 経由（context の id → getBuiltInPreset → fromPreset）', () => {
  const build = fnBody('buildCurrentProjectInput');
  assert.match(build, /ProjectInput\.fromPreset\(PresetRegistry\.getBuiltInPreset\(presetContext\.origin\.registryProjectId\)/);
  assert.equal((CODE.match(/getBuiltInPreset\(/g) || []).length, 1, 'bridge 以外で built-in を読んでいる');
});

test('P2L-S2B-08: 参考比較は context の負圧 map から引き、無い zone は表示しない', () => {
  const cmp = fnBody('renderPresetComparisonHtml');
  assert.match(cmp, /contextCapability\(activeProjectContext, 'projectPressureMap'\)\.negativePressures/);
  assert.match(cmp, /if \(!presetRow\) return '';/);
  assert.equal(/getNegativePressure|PresetRegistry/.test(cmp), false);
});

test('P2L-S2B-09: Evidence Closure は context の registryProjectId で、空の Observation 集合を評価する', () => {
  const matrix = fnBody('renderEvidenceClosureMatrix');
  assert.match(matrix, /var closureProjectId = requireActiveProjectContext\(\)\.origin\.registryProjectId;/);
  assert.match(matrix, /EvidenceClosure\.evaluateClosure\(closureProjectId, \[\]\)/);
});

test('P2L-S2B-10: Evidence panel は context-native（旧 config の形を読まない・再現しない）', () => {
  ['renderEvidenceStatus', 'renderVerifiedCaseSelector', 'renderReconciliation', 'buildProjectEvidenceLedger']
    .forEach((name) => {
      const body = fnBody(name);
      assert.match(body, new RegExp('function ' + name + '\\(ctx\\)'), name + ' が ctx を受け取らない');
      ['.dimensions.', '.wind.', '.identity.', 'getDefaultDimensionsMM', 'getPublicLabel', 'config.']
        .forEach((tok) => assert.equal(body.includes(tok), false, name + ' が旧 config の ' + tok + ' を読む'));
    });
  const panels = fnBody('renderPhase2FEvidencePanels');
  assert.match(panels, /var ctx = requireActiveProjectContext\(\);/);
  ['renderEvidenceStatus(ctx)', 'renderVerifiedCaseSelector(ctx)', 'renderReconciliation(ctx)']
    .forEach((call) => assert.equal(panels.includes(call), true, call));
  // reconciliation は context の topology から全 scope を作り、代表 scope を選ばない
  const recon = fnBody('renderReconciliation');
  assert.match(recon, /map\.positivePressures\.forEach/);
  assert.match(recon, /map\.negativePressures\.forEach/);
  assert.match(recon, /EvidenceLedger\.reconcileFact\(/);
  assert.equal(/'2'|'general'|'corner'/.test(recon), false, '代表 scope が hard-code されている');
  // verified case の唯一の source
  assert.match(fnBody('renderVerifiedCaseSelector'), /contextCapability\(ctx, 'builtInEvidence'\)\.verifiedCases/);
});
