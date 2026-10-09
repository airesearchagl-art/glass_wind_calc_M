'use strict';

/**
 * Phase 2L-B2 / S3-B1: browser-local の Project Pack intake & preview。
 *
 *   raw JSON text → JSON.parse → ProjectPack.validateProjectPack(raw)
 *     → ProjectContext.fromProjectPack(validated) → stagedProjectPack / stagedProjectPackContext
 *
 *   - staged は active ではない。activeProjectContext は runtime default の built-in のまま
 *   - trust は pack_unreviewed だけ。sourceClaim は申告で、canonical Evidence・Promotion Gate・
 *     verifiedCases・Promotion Candidate へは流さない。Pack → ProjectInput の変換もしない
 *   - file / paste / drop はどれも loadProjectPackText を通る。失敗は transactional
 *   - 取り込み上限（8 MiB）はブラウザ取り込みの資源保護で、schema の制限ではない
 *   - memory-only。保存・通信・URL 反映をしない。raw text とファイル名を保持しない
 *
 * 前半は index.html の実行コードの静的な検査、後半は index.html の intake block そのものを
 * vm で動かす挙動の検査（最小の偽 DOM と実際の ProjectPack / ProjectContext を使う）。
 * 実ブラウザでの挙動は tools/browser-checks/project-pack-intake.mjs が確かめる。
 *
 * fixture（tests/fixtures/project-pack/）はすべて合成値で、実案件の値と 1 つも一致しない
 * ことをこの test がその場で確かめる（実値をこの test に書き写さない）。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Evidence = require('../project-config/evidence.js');
const Pack = require('../project-config/project-pack.js');
const ProjectContext = require('../project-config/project-context.js');
const ProjectInput = require('../project-config/project-input.js');
const { inlineScripts, stripComments } = require('./support/inline-script.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HTML = read('index.html');
const STATIC = HTML.split('<script')[0];
const RAW_CODE = inlineScripts(HTML);
const CODE = stripComments(RAW_CODE);
const MAX_BYTES = 8 * 1024 * 1024;

const FIXTURE_DIR = 'tests/fixtures/project-pack';
const FIXTURES = {
  notification1458: 'synthetic-notification1458.json',
  project_pressure_map: 'synthetic-project-pressure-map.json',
  case_direct: 'synthetic-case-direct.json'
};
const MODES = Object.keys(FIXTURES);
const fixtureText = (mode) => read(FIXTURE_DIR + '/' + FIXTURES[mode]);
const fixture = (mode) => JSON.parse(fixtureText(mode));
const PRESSURE_CAP = { notification1458: 'notificationCalculation', project_pressure_map: 'projectPressureMap',
  case_direct: 'caseDirectPressure' };

const FAILURE_LEAD = '読み込みに失敗しました。Project Packは現在読み込まれていません。';
const FORBIDDEN_WORDING = /Verified|確認済|承認済|一次資料で確認済|計算可能|公開可能|問題なし|\bsafe\b/i;

/** 実行コード（コメント除去後）の top-level function の本体。 */
function fnBody(name) {
  const start = CODE.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' が見つからない');
  const next = CODE.indexOf('\nfunction ', start + 1);
  return CODE.slice(start, next === -1 ? CODE.length : next);
}

/** intake block の範囲（実行コード、コメント除去後）。 */
function packCode() {
  const start = CODE.indexOf('var MAX_PROJECT_PACK_IMPORT_BYTES');
  const end = CODE.indexOf('function renderProjectPackPreview(');
  assert.notEqual(start, -1, 'intake block が無い');
  assert.notEqual(end, -1, 'renderProjectPackPreview が無い');
  return CODE.slice(start, CODE.indexOf('\nfunction ', end + 1));
}

/** intake block の raw text（vm で動かす用。コメント込み）。 */
function packBlockSource() {
  const start = RAW_CODE.indexOf('var MAX_PROJECT_PACK_IMPORT_BYTES');
  const marker = RAW_CODE.indexOf('入力モード切替', start);
  assert.notEqual(start, -1);
  assert.notEqual(marker, -1);
  return RAW_CODE.slice(start, RAW_CODE.lastIndexOf('/*', marker));
}

/** intake の関数（staged を扱ってよいのはこれらだけ）。 */
const PACK_FUNCTIONS = ['beginProjectPackAttempt', 'projectPackIntakeError', 'projectPackSizeMessage',
  'projectPackTextExceedsLimit', 'loadProjectPackText', 'loadProjectPackFromPaste', 'loadProjectPackFromFileInput',
  'projectPackDragOver', 'projectPackDragLeave', 'projectPackDrop', 'projectPackFileTypeAcceptable',
  'intakeProjectPackFile', 'failProjectPackIntake', 'unloadProjectPack', 'projectPackVocabulary',
  'readProjectPackPath', 'sanitizeProjectPackReason', 'sanitizeProjectPackValidatorMessage',
  'describeProjectPackFailure', 'renderProjectPackStatus', 'renderProjectPackFailure', 'packEl', 'packSection',
  'packIdList', 'projectPackAdvisoryText', 'projectPackModeRows', 'renderProjectPackPreview'];

/* ============================================================
   静的: 経路は 1 つ、staged ≠ active
============================================================ */

test('P2L-S3B1-01: 走査の前提——intake block を取り出せている（陽性対照）', () => {
  PACK_FUNCTIONS.forEach((name) => assert.match(CODE, new RegExp('\\nfunction ' + name + '\\('), name));
  assert.equal(packCode().includes('function loadProjectPackText('), true);
  assert.equal(packCode().includes('function renderProjectPackPreview('), true);
  assert.equal(packBlockSource().includes('var stagedProjectPackContext = null;'), true);
});

test('P2L-S3B1-02: 読込経路は raw text → JSON.parse → validateProjectPack → fromProjectPack → staged の 1 本だけ', () => {
  const load = fnBody('loadProjectPackText');
  const at = (needle) => { const i = load.indexOf(needle); assert.notEqual(i, -1, needle); return i; };
  const order = [at('beginProjectPackAttempt()'), at('projectPackTextExceedsLimit(text)'), at('JSON.parse(text)'),
    at('ProjectPack.validateProjectPack(raw)'), at('ProjectContext.fromProjectPack(validated)'),
    at('ProjectContext.assertProjectContext(context)'), at('renderProjectPackPreview(context)'),
    at('stagedProjectPack = validated'), at('stagedProjectPackContext = context')];
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, '経路の順序が違う');
  // validator と adapter を呼ぶのは実行コード全体でここだけ
  assert.equal((CODE.match(/validateProjectPack\(/g) || []).length, 1, 'validateProjectPack の呼び出しが 1 か所でない');
  assert.equal((CODE.match(/fromProjectPack\(/g) || []).length, 1, 'fromProjectPack の呼び出しが 1 か所でない');
  assert.equal((load.match(/JSON\.parse\(/g) || []).length, 1);
  // staged に置くのは検証済みの結果だけ（raw を置かない）
  const commits = (CODE.match(/stagedProjectPack(?:Context)? = (?!null)[^;]+;/g) || []);
  assert.deepEqual(commits, ['stagedProjectPack = validated;', 'stagedProjectPackContext = context;']);
  // trust は context から読んで確かめるだけ（UI が trust を与えない）
  assert.match(load, /context\.sourceKind !== 'project_pack_unreviewed' \|\| context\.trust !== 'pack_unreviewed'/);
});

test('P2L-S3B1-03: file / paste / drop はどれも loadProjectPackText を通る', () => {
  assert.match(fnBody('loadProjectPackFromPaste'), /return loadProjectPackText\(text, '貼り付け'\)/);
  assert.match(fnBody('intakeProjectPackFile'), /loadProjectPackText\(text, via\)/);
  assert.match(fnBody('loadProjectPackFromFileInput'), /intakeProjectPackFile\(file, 'ファイル選択'\)/);
  assert.match(fnBody('projectPackDrop'), /intakeProjectPackFile\(files\[0\], 'ドロップ'\)/);
  // HTML の操作はこれらの入口だけを呼ぶ
  assert.match(STATIC, /<input type="file" id="pack-file" accept="\.json,application\/json"\s+onchange="loadProjectPackFromFileInput\(this\)">/);
  assert.match(STATIC, /ondrop="projectPackDrop\(event\)"/);
  assert.match(STATIC, /id="btn-pack-load"[^>]*\s+onclick="loadProjectPackFromPaste\(\)"/);
  assert.match(STATIC, /id="btn-pack-unload"[^>]*\s+onclick="unloadProjectPack\(\)"/);
  assert.equal(/<input type="file"[^>]*\bmultiple\b/.test(STATIC), false, '複数ファイルを選べる');
  // 貼り付け欄は入力のたびに解析しない（ボタンを押すまで解析しない）
  assert.equal(/id="pack-paste"[^>]*\son(?:input|change|paste|keyup)=/.test(STATIC), false);
  assert.equal(/pack-paste'\)\.addEventListener/.test(CODE), false);
});

test('P2L-S3B1-04: staged は active ではない（activeProjectContext を読みも書きもしない）', () => {
  const block = packCode();
  assert.equal(/activeProjectContext/.test(block), false, 'intake が active context に触れている');
  PACK_FUNCTIONS.forEach((name) => assert.equal(/activeProjectContext/.test(fnBody(name)), false, name));
  // active context を置くのは initActiveProjectContext だけ
  const init = fnBody('initActiveProjectContext');
  const assignsAll = (CODE.match(/activeProjectContext\s*=(?!=)/g) || []).length;
  const assignsInit = (init.match(/activeProjectContext\s*=(?!=)/g) || []).length;
  assert.equal(assignsAll, assignsInit + 1, 'initActiveProjectContext と宣言以外で active context を置いている');
  assert.equal(/activeProjectContext\s*=\s*[^;]*staged/.test(CODE), false);
  // staged を読むのは intake と、そのすぐ後に続く S3-B2 の Pack ケース計算 block だけ
  // （通常の計算・入力・Evidence・Closure・Review は読まない。ケース計算 block の境界は
  // tests/project-pack-execution-ui.test.js が確かめる）
  const intakeStart = CODE.indexOf('var MAX_PROJECT_PACK_IMPORT_BYTES');
  const intakeEnd = CODE.indexOf('\nfunction ', CODE.indexOf('function renderProjectPackPreview(') + 1);
  const execEnd = CODE.indexOf('\nfunction ', CODE.indexOf('function renderProjectPackExecutionResult(') + 1);
  assert.equal(intakeStart !== -1 && intakeEnd > intakeStart && execEnd > intakeEnd, true, 'block の範囲を取れない');
  assert.equal(CODE.slice(intakeEnd, execEnd).split('\nfunction ').slice(1).every((f) =>
    /^(renderProjectPackExecution|clearProjectPackExecution|projectPackExecution|executeSelectedProjectPackCase|packPressureText|packZoneText)/.test(f)),
  true, 'intake とケース計算の間に別の関数が入っている');
  const outside = CODE.slice(0, intakeStart) + CODE.slice(execEnd);
  assert.equal(/stagedProjectPack/.test(outside), false, 'intake・ケース計算以外が staged Pack を読んでいる');
});

test('P2L-S3B1-05: Pack → ProjectInput・計算・Evidence 昇格・Closure へ流さない', () => {
  const block = packCode();
  ['ProjectInput', 'buildCurrentProjectInput', 'runCalc', 'WindPressure', 'GlassCalc', 'EvidenceClosure',
    'EvidenceLedger', 'PresetRegistry', 'assertPromotionGate', 'canPromoteToVerified', 'makeEvidence',
    'verifiedCases', 'evaluateClosure', 'fromLegacyPreset', 'WorkspaceCore', 'ProjectProfile', 'ReviewPackage']
    .forEach((name) => assert.equal(block.includes(name), false, 'intake が ' + name + ' を使っている'));
  // ProjectInput の入力源は増えていない・schemaVersion も変わらない
  assert.deepEqual([...ProjectInput.SOURCE_KINDS],
    ['registered_preset', 'manual', 'notification_calculation', 'imported_unverified']);
  assert.equal(ProjectInput.SCHEMA_VERSION, 2);
  // 画面でも段階を明示する
  assert.match(STATIC, /Closure判定はこの段階では行いません/);
  assert.match(block, /Closure判定はこの段階では行いません/);
});

/* ============================================================
   静的: 上限・保存・通信・ファイル名・エラー表示・文言
============================================================ */

test('P2L-S3B1-06: 取り込み上限は 8 MiB の資源保護で、解析・読込の前に効き、切り詰めない', () => {
  assert.match(CODE, /var MAX_PROJECT_PACK_IMPORT_BYTES = 8 \* 1024 \* 1024;/);
  assert.match(fnBody('projectPackTextExceedsLimit'), /new TextEncoder\(\)\.encode\(text\)\.length > MAX_PROJECT_PACK_IMPORT_BYTES/);
  const intake = fnBody('intakeProjectPackFile');
  assert.equal(intake.indexOf('file.size <= MAX_PROJECT_PACK_IMPORT_BYTES') < intake.indexOf('file.text()'), true,
    'ファイルの大きさを読む前に確かめていない');
  const load = fnBody('loadProjectPackText');
  assert.equal(load.indexOf('projectPackTextExceedsLimit(text)') < load.indexOf('JSON.parse(text)'), true);
  ['loadProjectPackText', 'loadProjectPackFromPaste', 'intakeProjectPackFile', 'projectPackTextExceedsLimit']
    .forEach((fn) => assert.equal(/\.(?:slice|substring|substr)\(/.test(fnBody(fn)), false, fn + ' が入力を切り詰めうる'));
  // 画面と README が「schema の制限ではない」と書いている
  assert.match(STATIC, /取り込み上限は 8 MiB です。これはブラウザで取り込むときの資源保護のための上限で、\s*Project Pack schema の制限ではありません。/);
  const readme = read('README.md');
  assert.match(readme, /MAX_PROJECT_PACK_IMPORT_BYTES/);
  assert.match(readme, /資源保護/);
  assert.match(readme, /schema の制限ではありません/);
});

test('P2L-S3B1-07: memory-only——保存・通信・URL 反映・console 出力をしない', () => {
  const block = packCode();
  ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'caches', 'serviceWorker', 'fetch(',
    'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'navigator.', 'location', 'history.',
    'console.', 'FormData', 'postMessage', 'window.open', 'URL.createObjectURL']
    .forEach((api) => assert.equal(block.includes(api), false, 'intake が ' + api + ' を使っている'));
  // ページ全体でも URL への反映・console 出力が無い
  ['location.hash', 'location.search', 'history.pushState', 'history.replaceState', 'console.']
    .forEach((api) => assert.equal(CODE.includes(api), false, '実行コードが ' + api + ' を使っている'));
  assert.match(STATIC, /読み込んだ内容はこのタブのメモリ上だけに置き、保存・送信しません。/);
});

test('P2L-S3B1-08: raw text とファイル名を保持しない', () => {
  // 貼り付け欄とファイル選択は試行のたびに空へ戻す
  assert.match(fnBody('loadProjectPackFromPaste'), /if \(area\) area\.value = '';/);
  assert.match(fnBody('loadProjectPackFromFileInput'), /if \(input\) input\.value = '';/);
  // ファイル名を読むのは種類の判定だけ。どこにも置かない
  const block = packCode();
  const nameReads = block.match(/\.name\b/g) || [];
  assert.equal(nameReads.length, 1, 'file 名を種類の判定以外で読んでいる');
  assert.match(fnBody('projectPackFileTypeAcceptable'), /String\(file && file\.name \|\| ''\)/);
  assert.equal(/\.name\s*=(?!=)/.test(block), false);
  // raw text の参照を検証後に手放す
  const load = fnBody('loadProjectPackText');
  assert.match(load, /text = null;/);
  assert.match(load, /raw = null;/);
});

test('P2L-S3B1-09: 失敗の表示は path と理由だけ（stack・入力の断片・HTML sink を使わない）', () => {
  const block = packCode();
  assert.equal(/\.stack\b/.test(block), false, 'stack を読んでいる');
  ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']
    .forEach((sink) => assert.equal(block.includes(sink), false, sink));
  // JSON の構文エラーはブラウザの文面（入力の断片を含む）を使わず固定文にする
  const load = fnBody('loadProjectPackText');
  assert.equal((load.match(/parseError/g) || []).length, 1, '構文エラーの object を catch 以外で使っている');
  assert.match(load, /JSON として読めませんでした（構文エラー）。内容は表示しません。/);
  assert.match(CODE, /var PROJECT_PACK_FAILURE_LEAD = '読み込みに失敗しました。Project Packは現在読み込まれていません。';/);
  // 表示は textContent だけ
  assert.match(fnBody('renderProjectPackStatus'), /status\.textContent = text;/);
  assert.match(fnBody('packEl'), /el\.textContent = String\(text\)/);
});

test('P2L-S3B1-10: 文言——Verified / 確認済 / 承認済 / 計算可能 / 公開可能 / 問題なし を出さない', () => {
  const from = STATIC.indexOf('<section class="pack-wrap"');
  assert.notEqual(from, -1, 'panel が無い');
  const section = STATIC.slice(from, STATIC.indexOf('</section>', from) + 10);
  assert.equal(FORBIDDEN_WORDING.test(section), false, (section.match(FORBIDDEN_WORDING) || [])[0]);
  const literals = (packCode().match(/'(?:[^'\\]|\\.)*'/g) || []).join('\n');
  assert.equal(FORBIDDEN_WORDING.test(literals), false, (literals.match(FORBIDDEN_WORDING) || [])[0]);
  assert.match(section, /<h2 class="card-title" id="pack-title">Project Pack（Unreviewed）<\/h2>/);
  assert.match(literals, /'Source claims \(unreviewed\)'/);
  assert.match(literals, /0 件でも、公開してよいという判断にはなりません/);
  assert.match(literals, /この preview は計算しません。/);
  // 印刷には出さない
  assert.match(HTML, /@media print \{[\s\S]*?#project-pack-section[\s\S]*?display: none !important;/);
});

/* ============================================================
   fixture: 3 mode の合成 Pack
============================================================ */

test('P2L-S3B1-11: 3 mode の fixture はそれぞれ validate → fromProjectPack を通り、契約どおりの context になる', () => {
  assert.deepEqual(fs.readdirSync(path.join(ROOT, FIXTURE_DIR)).sort(), Object.values(FIXTURES).sort());
  MODES.forEach((mode) => {
    const validated = Pack.validateProjectPack(fixture(mode));
    assert.equal(validated.trust, 'pack_unreviewed', mode);
    assert.equal(validated.pressureModel.mode, mode);
    const ctx = ProjectContext.fromProjectPack(validated);
    assert.equal(ProjectContext.isProjectContext(ctx), true);
    assert.equal(ctx.contextType, 'glass_wind_project_context');
    assert.equal(ctx.schemaVersion, 1);
    assert.equal(ctx.sourceKind, 'project_pack_unreviewed');
    assert.equal(ctx.trust, 'pack_unreviewed');
    assert.deepEqual(Object.keys(ctx.origin).sort(), ['packSchemaVersion', 'packType', 'publicationAdvisories']);
    assert.equal(ctx.origin.packType, 'glass_wind_project_pack');
    assert.equal(ctx.origin.packSchemaVersion, 1);
    assert.deepEqual(Object.keys(ctx.capabilities).sort(),
      ['declaredGlazingCases', 'declaredPanes', 'evidenceClaims', PRESSURE_CAP[mode]].sort(), mode);
    const pressure = Object.keys(ctx.capabilities).filter((k) => Object.values(PRESSURE_CAP).includes(k));
    assert.equal(pressure.length, 1, mode + ': pressure capability が 1 つでない');
    ctx.capabilities.evidenceClaims.sourceScopes.forEach((s) => {
      assert.equal(s.evidenceKind, 'pack_unreviewed_claim');
      assert.equal(Evidence.canPromoteToVerified(s.sourceClaim), false);
      assert.equal(Evidence.canPromoteToVerified(s), false);
    });
    assert.equal(Object.isFrozen(ctx) && Object.isFrozen(validated), true);
  });
});

test('P2L-S3B1-12: fixture は合成——中立 ID・private reference なし・実案件の値と 1 つも一致しない', () => {
  // 実値はこの test に書き写さず、repository に現存する legacy module から読む
  const Legacy = require('../project-config/miyoshi.js');
  const Intake = require('../project-config/miyoshi-observations.js');
  const real = new Set();
  Object.values(Legacy.wind.positivePressureByFloor).forEach((v) => real.add(v.value));
  Object.values(Legacy.wind.negativePressureByZone).forEach((v) => real.add(v.value));
  [Legacy.wind.V0.value, Legacy.dimensions.defaultW.value, Legacy.dimensions.defaultH.value].forEach((v) => real.add(v));
  Intake.observations.forEach((o) => real.add(o.observedValue));
  const stated = Intake.sourceScope.statedWindConditions;
  [stated.V0.value, stated.recurrenceYears, stated.recurrenceMultiplier].forEach((v) => real.add(v));
  assert.equal(real.size >= 15, true, '実値の集合が小さすぎる——読み出しが壊れている');
  const realFloors = Object.keys(Legacy.wind.positivePressureByFloor).sort();

  MODES.forEach((mode) => {
    const pack = fixture(mode);
    const walk = (node, at) => {
      if (typeof node === 'number' && at !== '$.schemaVersion') {
        assert.equal(real.has(node), false, mode + ' ' + at + ' が実値と一致する');
      }
      if (typeof node === 'string') {
        assert.equal(/miyoshi|みよし|三好|https?:|www\.|[A-Za-z]:\\|\/home\/|\/Users\/|\.pdf\b/i.test(node), false, mode + ' ' + at);
      }
      if (node && typeof node === 'object') Object.keys(node).forEach((k) => walk(node[k], at + '.' + k));
    };
    walk(pack, '$');
    const floors = new Set();
    pack.glazingCases.forEach((c) => { if (c.floor) floors.add(c.floor); });
    (pack.windConditions.positivePressures || []).forEach((r) => floors.add(r.floor));
    assert.notDeepEqual([...floors].sort(), realFloors, mode + ': 階構成が実案件と同じ');
    pack.panes.forEach((p) => assert.match(p.paneId, /^P00[1-9]$/));
    pack.glazingCases.forEach((c) => assert.match(c.caseId, /^G00[1-9]$/));
    pack.evidence.sourceScopes.forEach((s) => {
      assert.match(s.sourceScopeId, /^S0[1-9]$/);
      assert.equal(s.sourceClaim.claimedPrivateReferenceAvailable, false, 'private reference を申告している');
      assert.match(s.sourceClaim.publicDescription, /合成テスト用.*実案件ではない/);
      assert.deepEqual(Evidence.lintPublicEvidenceText(s.sourceClaim.publicDescription).warnings, []);
    });
    assert.deepEqual(Evidence.lintPublicEvidenceText(pack.projectMetadata.publicLabel).warnings, []);
    assert.match(pack.projectMetadata.publicLabel, /^Synthetic Pack /);
  });
});

/* ============================================================
   挙動: index.html の intake block を vm で動かす
============================================================ */

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this._text = '';
    this.children = [];
    this.className = '';
    this.hidden = false;
    this.value = '';
    const set = new Set();
    this.classList = { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
  }
  get textContent() { return [this._text].concat(this.children.map((c) => c.textContent)).filter(Boolean).join('\n'); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  items(tag) {
    const out = [];
    const visit = (el) => { if (el.tagName === tag) out.push(el.textContent); el.children.forEach(visit); };
    visit(this);
    return out;
  }
}

const ACTIVE_SENTINEL = Object.freeze({ sentinel: 'runtime-default-built-in' });

function intakeSandbox() {
  const els = {};
  ['pack-status', 'pack-preview', 'pack-paste', 'pack-file', 'pack-drop'].forEach((id) => { els[id] = new FakeElement('div'); });
  els['pack-preview'].hidden = true;
  let parseCount = 0;
  const sandbox = {
    document: { getElementById: (id) => els[id] || null, createElement: (tag) => new FakeElement(tag) },
    ProjectPack: Pack,
    ProjectContext,
    TextEncoder,
    // browser では JSON.parse と検証器は同じ realm にある。vm でもそうなるように host の JSON を渡す
    // （vm 自身の JSON.parse が作る object は、host の検証器には「別の prototype」に見える）
    JSON: { parse: (...args) => { parseCount++; return JSON.parse(...args); }, stringify: JSON.stringify },
    activeProjectContext: ACTIVE_SENTINEL
  };
  vm.createContext(sandbox);
  vm.runInContext(packBlockSource(), sandbox, { filename: 'index.html#project-pack-intake' });
  const status = () => els['pack-status'].textContent;
  return { sandbox, els, status, parses: () => parseCount,
    staged: () => sandbox.stagedProjectPack, context: () => sandbox.stagedProjectPackContext };
}

/** 失敗表示の「場所」「理由」行は、印字可能な ASCII（と単位の ²・伏字 …）だけで 200 字以内。 */
function assertSafeFailure(box, secrets, label) {
  const text = box.status();
  assert.equal(text.startsWith(FAILURE_LEAD), true, label + ': ' + text);
  assert.equal(box.staged(), null, label);
  assert.equal(box.context(), null, label);
  assert.equal(box.els['pack-preview'].hidden, true, label);
  (secrets || []).forEach((s) => assert.equal(text.includes(s), false, label + ': ' + s + ' を表示した: ' + text));
  assert.equal(/\n\s+at |Error:|SyntaxError|Unexpected token/.test(text), false, label + ': stack / 例外名を表示した');
  // 検証器の理由（固定文ではないもの）は、印字可能な ASCII（と単位の ²・伏字 …）だけ
  const fromValidator = /\n段階: (Project Pack 検証|ProjectContext 変換)\n/.test(text);
  text.split('\n').filter((l) => /^(場所|理由): /.test(l)).forEach((line) => {
    const v = line.replace(/^(場所|理由): /, '');
    if (line.startsWith('場所')) assert.match(v, /^pack(?:\.[A-Za-z0-9_]+|\[\d+\])*(?:\.…)?$/, label + ': ' + v);
    if (line.startsWith('理由') && fromValidator && v !== '詳細は表示しません。') {
      assert.match(v, /^[\x20-\x7E\u00B2…]*$/, label + ': ' + v);
    }
    assert.equal(v.length <= 200, true, label + ': too long');
  });
  assert.equal(box.sandbox.activeProjectContext, ACTIVE_SENTINEL, label + ': active context が変わった');
}

test('P2L-S3B1-13: 3 mode の fixture を読み込むと staged だけが置かれ、active は変わらない', () => {
  MODES.forEach((mode) => {
    const box = intakeSandbox();
    assert.equal(box.sandbox.loadProjectPackText(fixtureText(mode), '貼り付け'), true, mode + ': ' + box.status());
    const ctx = box.context();
    assert.equal(ProjectContext.isProjectContext(ctx), true);
    assert.equal(ctx.trust, 'pack_unreviewed');
    assert.equal(ctx.pressureModel.mode, mode);
    assert.equal(box.staged().trust, 'pack_unreviewed');
    assert.equal(Object.isFrozen(box.staged()) && Object.isFrozen(ctx), true);
    assert.equal(box.sandbox.activeProjectContext, ACTIVE_SENTINEL, 'active context が変わった');
    assert.equal(box.els['pack-preview'].hidden, false);
    const items = box.els['pack-preview'].items('li');
    const p = fixture(mode);
    ['公開表示名: ' + p.projectMetadata.publicLabel, 'trust: pack_unreviewed（未レビュー）', 'pressureModel.mode: ' + mode,
      'panes: ' + p.panes.length, 'glazing cases: ' + p.glazingCases.length,
      'source scopes: ' + p.evidence.sourceScopes.length, 'evidence records: ' + p.evidence.records.length,
      'publication advisories: 0'].forEach((row) => assert.equal(items.includes(row), true, mode + ': ' + row));
    assert.equal(items.some((t) => /^claimed (primary|indirect|none): \d+$/.test(t)), true);
    // preview に値（圧力・寸法・申告文）を出さない
    const previewText = box.els['pack-preview'].textContent;
    assert.equal(previewText.includes(p.evidence.sourceScopes[0].sourceClaim.publicDescription), false);
    assert.equal(/\b(1020|2240|1245|1835|1045)\b/.test(previewText), false, '値を表示した');
    assert.equal(FORBIDDEN_WORDING.test(previewText + box.status()), false);
    assert.match(box.status(), /反映していません/);
  });
});

test('P2L-S3B1-14: 失敗は transactional——前の Pack も残さず、入力の値を表示しない', () => {
  const box = intakeSandbox();
  assert.equal(box.sandbox.loadProjectPackText(fixtureText('notification1458'), '貼り付け'), true);
  // A（有効）→ B（JSON 構文エラー）: staged は空になる
  assert.equal(box.sandbox.loadProjectPackText('{"schemaVersion": 1, "packType": "SECRET_TOKEN_XYZ",', '貼り付け'), false);
  assertSafeFailure(box, ['SECRET_TOKEN_XYZ', 'packType', 'Synthetic Pack N1458'], 'invalid JSON');
  assert.match(box.status(), /段階: JSON 構文/);

  const cases = [
    ['unknown top-level', (p) => { p.secretProjectNameXYZ = 'Hidden Tower'; }, ['secretProjectNameXYZ', 'Hidden Tower']],
    ['claimed level', (p) => { p.evidence.sourceScopes[0].sourceClaim.claimedLevel = 'TopSecretLevelXYZ'; }, ['TopSecretLevelXYZ']],
    ['claimed date', (p) => { p.evidence.sourceScopes[0].sourceClaim.claimedCheckedAt = 'Tokyo 2026 XYZ'; }, ['Tokyo', 'XYZ']],
    ['url description', (p) => { p.evidence.sourceScopes[0].sourceClaim.publicDescription = 'see https://private.example.invalid/doc-XYZ'; },
      ['private.example', 'doc-XYZ', 'https']],
    ['windows path', (p) => { p.evidence.sourceScopes[0].sourceClaim.publicDescription = 'C:\\Users\\someone\\XYZ.pdf'; },
      ['someone', 'XYZ.pdf', 'Users']],
    ['glass type', (p) => { p.glazingCases[0].glassType = '秘密ガラスXYZ'; }, ['秘密ガラスXYZ']],
    ['pane id', (p) => { p.panes[0].paneId = 'TowerA-Opening-XYZ'; p.glazingCases[0].paneId = 'TowerA-Opening-XYZ'; }, ['TowerA', 'XYZ']],
    ['mode', (p) => { p.pressureModel.mode = 'secretmodeXYZ'; }, ['secretmodeXYZ']],
    ['label too long', (p) => { p.projectMetadata.publicLabel = '秘密案件'.repeat(30); }, ['秘密案件']],
    ['user key with colon', (p) => { p.panes[0]['秘密のキー: HiddenXYZ'] = 'x'.repeat(600); }, ['秘密のキー', 'HiddenXYZ', 'xxxxxxxx']],
    ['ascii key with colon', (p) => { p.panes[0]['value: HiddenXYZ'] = 'x'.repeat(600); }, ['HiddenXYZ']],
    ['deep user keys', (p) => { p.panes[0].widthMm = { aXYZ: { b: { c: { d: { e: { f: { g: 1 } } } } } } }; }, ['aXYZ']],
    ['own __proto__', null, ['HiddenXYZ']],
    ['infinite number', null, ['HiddenXYZ']]
  ];
  cases.forEach(([label, mutate, secrets]) => {
    let text;
    if (label === 'own __proto__') {
      text = fixtureText('case_direct').replace('"projectMetadata": {', '"projectMetadata": { "HiddenXYZ": { "__proto__": { "a": 1 } },');
    } else if (label === 'infinite number') {
      text = fixtureText('case_direct').replace('"value": 1020', '"value": 1e999').replace('"publicLabel"', '"HiddenXYZ": 1, "publicLabel"');
    } else {
      const p = fixture(label === 'claimed level' || label === 'url description' ? 'case_direct' : 'notification1458');
      mutate(p);
      text = JSON.stringify(p);
    }
    assert.equal(box.sandbox.loadProjectPackText(fixtureText('project_pressure_map'), '貼り付け'), true);
    assert.equal(box.sandbox.loadProjectPackText(text, '貼り付け'), false, label);
    assertSafeFailure(box, secrets.concat(['Synthetic Pack Map']), label);
    assert.match(box.status(), /段階: Project Pack 検証/, label);
    assert.match(box.status(), /\n場所: pack/, label + ': path が無い');
  });
  // 規則名は出す（url-scheme）
  const p = fixture('case_direct');
  p.evidence.sourceScopes[0].sourceClaim.publicDescription = 'see https://private.example.invalid/doc';
  box.sandbox.loadProjectPackText(JSON.stringify(p), '貼り付け');
  assert.match(box.status(), /url-scheme/);
  assert.match(box.status(), /場所: pack\.evidence\.sourceScopes\[0\]\.sourceClaim\n/);
});

test('P2L-S3B1-15: 取り込み上限は UTF-8 byte で数え、JSON.parse より前に拒否する（境界は上限ちょうどまで可）', () => {
  const box = intakeSandbox();
  const parses = box.parses;
  // length は上限以下、UTF-8 では上限超過（3 byte 文字）
  const multi = '"' + 'あ'.repeat(Math.floor(MAX_BYTES / 3) + 1) + '"';
  assert.equal(multi.length <= MAX_BYTES, true);
  let before = parses();
  assert.equal(box.sandbox.loadProjectPackText(multi, '貼り付け'), false);
  assert.match(box.status(), /段階: 取り込み上限/);
  assert.match(box.status(), /資源保護.*schema の制限ではありません/);
  assert.equal(parses(), before, '上限超過なのに解析した');
  assertSafeFailure(box, [], 'oversized multibyte');
  // ちょうど上限は上限では止めない（JSON として読めずに JSON 構文で失敗する）
  before = parses();
  assert.equal(box.sandbox.loadProjectPackText('x'.repeat(MAX_BYTES), '貼り付け'), false);
  assert.match(box.status(), /段階: JSON 構文/);
  assert.equal(parses(), before + 1);
  before = parses();
  assert.equal(box.sandbox.loadProjectPackText('x'.repeat(MAX_BYTES + 1), '貼り付け'), false);
  assert.match(box.status(), /段階: 取り込み上限/);
  assert.equal(parses(), before);
  // 空・文字列でない入力
  assert.equal(box.sandbox.loadProjectPackText('   ', '貼り付け'), false);
  assert.match(box.status(), /JSON が空です/);
  assert.equal(box.sandbox.loadProjectPackText(null, '貼り付け'), false);
  assert.match(box.status(), /段階: 入力/);
});

function fakeFile(text, opts) {
  const o = opts || {};
  let reads = 0;
  return {
    name: o.name || 'pack.json',
    type: o.type === undefined ? 'application/json' : o.type,
    size: o.size === undefined ? Buffer.byteLength(text, 'utf8') : o.size,
    text() { reads++; return o.delay ? new Promise((r) => setTimeout(() => r(text), o.delay)) : Promise.resolve(text); },
    get reads() { return reads; }
  };
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms || 0));

test('P2L-S3B1-16: ファイルは種類と大きさを読む前に確かめ、読み込んだ text も同じ経路を通る', async () => {
  const box = intakeSandbox();
  const big = fakeFile('{}', { size: MAX_BYTES + 1 });
  box.sandbox.intakeProjectPackFile(big, 'ファイル選択');
  assert.equal(big.reads, 0, '上限を超えるファイルを読んだ');
  assert.match(box.status(), /段階: 取り込み上限/);
  const png = fakeFile('PNGDATA', { name: 'x.png', type: 'image/png' });
  box.sandbox.intakeProjectPackFile(png, 'ファイル選択');
  assert.equal(png.reads, 0);
  assertSafeFailure(box, ['PNGDATA', 'x.png'], 'png');
  // 型不明は拡張子 .json のときだけ
  assert.equal(box.sandbox.projectPackFileTypeAcceptable({ name: 'a.json', type: '' }), true);
  assert.equal(box.sandbox.projectPackFileTypeAcceptable({ name: 'a.txt', type: '' }), false);
  assert.equal(box.sandbox.projectPackFileTypeAcceptable({ name: 'a.json', type: 'image/png' }), false);
  // 有効なファイル
  const ok = fakeFile(fixtureText('project_pressure_map'), { name: 'secret-file-name-XYZ.json' });
  box.sandbox.intakeProjectPackFile(ok, 'ファイル選択');
  await settle(5);
  assert.equal(box.context().pressureModel.mode, 'project_pressure_map');
  const everything = JSON.stringify(box.staged()) + JSON.stringify(box.context()) + box.status() + box.els['pack-preview'].textContent;
  assert.equal(everything.includes('secret-file-name-XYZ'), false, 'ファイル名を保持・表示した');
  // ファイル選択 input: 0 件は何もしない、2 件は拒否、1 件は value を空へ戻す
  const input = { files: [], value: 'C:\\fakepath\\a.json' };
  box.sandbox.loadProjectPackFromFileInput(input);
  assert.equal(input.value, '');
  assert.equal(box.context().pressureModel.mode, 'project_pressure_map', '0 件で staged を変えた');
  box.sandbox.loadProjectPackFromFileInput({ files: [ok, ok], value: 'x' });
  assertSafeFailure(box, [], 'two files');
});

test('P2L-S3B1-17: 後から始まった試行が勝つ（遅いファイル読込が staged を上書きしない）・解除で空になる', async () => {
  const box = intakeSandbox();
  const slow = fakeFile(fixtureText('notification1458'), { delay: 30 });
  box.sandbox.intakeProjectPackFile(slow, 'ファイル選択');
  assert.equal(box.sandbox.loadProjectPackText(fixtureText('case_direct'), '貼り付け'), true);
  await settle(60);
  assert.equal(box.context().pressureModel.mode, 'case_direct', '遅いファイル読込が後から上書きした');
  // 読込中に解除しても、読み終わったファイルは staged にならない
  const slow2 = fakeFile(fixtureText('notification1458'), { delay: 30 });
  box.sandbox.intakeProjectPackFile(slow2, 'ファイル選択');
  box.sandbox.unloadProjectPack();
  await settle(60);
  assert.equal(box.staged(), null);
  assert.equal(box.context(), null);
  assert.equal(box.els['pack-preview'].hidden, true);
  assert.match(box.status(), /解除しました/);
  assert.equal(box.sandbox.activeProjectContext, ACTIVE_SENTINEL);
});

test('P2L-S3B1-18: drop は項目がちょうど 1 つのファイルだけ（RF-21-01: ファイル + 文字列も拒否）', async () => {
  const ev = (files, items) => ({ preventDefault() {}, stopPropagation() {}, dataTransfer: { files, items } });
  const fileItem = (entry) => ({ kind: 'file', webkitGetAsEntry: () => entry });
  const stringItem = { kind: 'string' };
  const accepted = async (label, files, items) => {
    const box = intakeSandbox();
    box.sandbox.projectPackDrop(ev(files, items));
    await settle(5);
    assert.equal(box.context() && box.context().pressureModel.mode, 'case_direct', label + ': ' + box.status());
    assert.match(box.status(), /読み込み経路: ドロップ/, label);
  };
  const rejected = (label, files, items) => {
    const box = intakeSandbox();
    assert.equal(box.sandbox.loadProjectPackText(fixtureText('notification1458'), '貼り付け'), true);
    box.sandbox.projectPackDrop(ev(files, items));
    assertSafeFailure(box, ['Synthetic Pack N1458'], label);
    assert.match(box.status(), /段階: ファイル/, label);
    return box;
  };
  // D1: ファイル 1 つだけ → 受け付ける（items が無い環境では files だけで判定する）
  const d1 = fakeFile(fixtureText('case_direct'));
  await accepted('D1 one file item', [d1], [fileItem({ isDirectory: false })]);
  await accepted('D1 files only (no items)', [fakeFile(fixtureText('case_direct'))], undefined);
  // D2: ファイル 1 つ + 文字列 1 つ → 拒否（以前はこれを受け付けていた）
  const d2 = fakeFile(fixtureText('case_direct'));
  rejected('D2 file + string', [d2], [fileItem({ isDirectory: false }), stringItem]);
  rejected('D2 string + file', [d2], [stringItem, fileItem({ isDirectory: false })]);
  assert.equal(d2.reads, 0, 'D2 のファイルを読んだ');
  // D3: 文字列だけ → 拒否
  rejected('D3 string only', [], [stringItem]);
  // D4: ファイル 2 つ → 拒否
  const d4 = fakeFile(fixtureText('case_direct'));
  rejected('D4 two files', [d4, d4], [fileItem(null), fileItem(null)]);
  assert.equal(d4.reads, 0);
  // D5: フォルダ → 拒否
  const d5 = fakeFile('');
  const box5 = rejected('D5 directory', [d5], [fileItem({ isDirectory: true })]);
  assert.match(box5.status(), /フォルダは受け付けません/);
  assert.equal(d5.reads, 0);
});

test('P2L-S3B1-19: advisory は件数と path・規則名だけ。0 件を安全と言わない', () => {
  const box = intakeSandbox();
  const p = fixture('case_direct');
  p.projectMetadata.publicLabel = 'Synthetic www.example.com';
  assert.equal(box.sandbox.loadProjectPackText(JSON.stringify(p), '貼り付け'), true);
  const items = box.els['pack-preview'].items('li');
  assert.equal(items.includes('publication advisories: 1'), true);
  assert.equal(items.some((t) => /^pack\.projectMetadata\.publicLabel — [a-z0-9-]+$/.test(t)), true, items.join(' / '));
  // advisory の path の形を確かめてから出す（形が違えば伏せる）
  assert.equal(box.sandbox.projectPackAdvisoryText({ path: 'pack.secretXYZ.publicLabel', rule: 'www' }), 'pack.… — www');
  assert.equal(box.sandbox.projectPackAdvisoryText({ path: 'pack.projectMetadata.publicLabel', rule: 'Rule XYZ!' }),
    'pack.projectMetadata.publicLabel — …');
  assert.equal(FORBIDDEN_WORDING.test(box.els['pack-preview'].textContent), false);
});

test('P2L-S3B1-21: 入力値の echo は "got" の後ろを区切りの形によらず落とす（RF-21-02）', () => {
  const box = intakeSandbox();
  const vocab = box.sandbox.projectPackVocabulary();
  const sanitize = (r) => box.sandbox.sanitizeProjectPackReason(r, vocab);
  // 区切りの形を列挙しない: どの形でも値の手前で止まる
  [['V0 must be within [1, 200] m/s (got 9876.54)', 'V0 must be within [1, 200] m/s'],
    ['checkedAt must be a valid "YYYY-MM-DD" date string, got: "Tokyo 9876"', 'checkedAt must be a valid "YYYY-MM-DD" date string'],
    ['does not take recurrenceYears (industry recommendation); got 9876.54', 'does not take recurrenceYears (industry recommendation)'],
    ['must not exceed buildingHeightM (got eaves 9876 m > building 12 m)', 'must not exceed buildingHeightM'],
    ['must be a string; Got 9876', 'must be a string'],
    ['value rejected: got 9876', 'value rejected'],
    ['value rejected - got 9876', 'value rejected -']
  ].forEach(([input, want]) => {
    const out = sanitize(input);
    assert.equal(out, want, input);
    assert.equal(/9876|Tokyo/.test(out), false, input);
  });
  // "got" を含む別の単語では切らない（単語としての got だけ）
  assert.equal(sanitize('forgotten field is not data'), 'forgotten field is not data');
});

test('P2L-S3B1-22: notification_baseline に recurrenceYears を付けた Pack は失敗し、その値を表示しない（RF-21-02）', async () => {
  const DISTINCT = 8642.97;
  const LABEL = 'Synthetic Pack Recurrence Probe';
  const build = () => {
    const p = fixture('notification1458');
    assert.equal(p.windConditions.basis, 'notification_baseline');
    p.projectMetadata.publicLabel = LABEL;
    p.windConditions.recurrenceYears = DISTINCT;
    return JSON.stringify(p);
  };
  // 前提: 検証器の文面そのものはこの値を "; got" の後ろに含む（含まなければこの test は何も確かめていない）
  assert.throws(() => Pack.validateProjectPack(JSON.parse(build())), (e) => e.message.includes('; got ' + DISTINCT));
  const secrets = [String(DISTINCT), '8642', LABEL, 'recurrence-probe-file-XYZ', '"windConditions"', '{"'];
  // 貼り付け
  const box = intakeSandbox();
  assert.equal(box.sandbox.loadProjectPackText(fixtureText('case_direct'), '貼り付け'), true);
  assert.equal(box.sandbox.loadProjectPackText(build(), '貼り付け'), false);
  assertSafeFailure(box, secrets, 'recurrenceYears via paste');
  assert.match(box.status(), /段階: Project Pack 検証/);
  assert.match(box.status(), /\n場所: pack\.glazingCases\[0\]\n/);
  assert.match(box.status(), /理由: wind conditions are not a valid notification-1458 input: notification_baseline does not take recurrenceYears/);
  // ファイル（ファイル名も表示しない）
  const box2 = intakeSandbox();
  box2.sandbox.intakeProjectPackFile(fakeFile(build(), { name: 'recurrence-probe-file-XYZ.json' }), 'ファイル選択');
  await settle(5);
  assertSafeFailure(box2, secrets, 'recurrenceYears via file');
  // この文面は長く、既定の表示長（200 字）で値の手前が切れる。長さの上限で偶然隠れるのではなく、
  // echo の規則そのものが値を落とすことを、上限を外して確かめる（外さないと規則を戻しても通ってしまう）。
  const box3 = intakeSandbox();
  box3.sandbox.PROJECT_PACK_ERROR_MAX_LENGTH = 100000;
  assert.equal(box3.sandbox.loadProjectPackText(build(), '貼り付け'), false);
  // 上限を外しているので行の長さは確かめない。それ以外（staged 空・値や本文を出さない・stack なし）は同じ
  const text3 = box3.status();
  assert.equal(text3.startsWith(FAILURE_LEAD) && box3.staged() === null && box3.context() === null, true);
  secrets.forEach((x) => assert.equal(text3.includes(x), false, 'cap lifted: ' + x + ' を表示した: ' + text3));
  assert.equal(/\n\s+at |Error:|\bgot\b/i.test(text3), false, text3);
  const reason = box3.status().split('\n').find((l) => l.startsWith('理由: '));
  assert.match(reason, /not part of the notification baseline\)$/, '値の手前で正しく止まっていない: ' + reason);
  assert.equal(reason.length < 1000 && !/…$/.test(reason), true, '上限で切られている（規則が働いたか確かめられない）');
});

test('P2L-S3B1-20: browser harness は登録され、Pack の検証器・adapter を呼ばない', () => {
  const spec = JSON.parse(read('tools/verification/verification-spec.json'));
  const inst = spec.instruments.find((i) => i.id === 'project-pack-intake');
  assert.ok(inst, 'verification-spec に project-pack-intake が無い');
  assert.equal(inst.command, 'node tools/browser-checks/project-pack-intake.mjs');
  assert.equal(inst.admissibility, 'UNVERIFIED');
  const src = read('tools/browser-checks/project-pack-intake.mjs');
  assert.match(src, /openBrowser\(/);
  assert.match(src, /finishRun\(/);
  assert.equal(/validateProjectPack|fromProjectPack|project-pack\.js|project-context\.js/.test(src), false,
    'harness が Pack の検証器・adapter を使っている（新しい trust 経路）');
  assert.match(src, /tests\/fixtures\/project-pack\//);
});
