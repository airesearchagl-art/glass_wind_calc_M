// Browser-local Project Pack intake & preview（Phase 2L-B2 / S3-B1）を実ブラウザで確かめる。
//
// この harness は page の UI（ファイル選択・貼り付け・ドロップ・解除）だけを操作して、
// page の状態と画面を観測する。Pack の検証器・adapter を Node 側で呼ばない（期待値は
// 合成 fixture の JSON を数えて作る）。harness が新しい trust 経路を作らないためである。
//
// 確かめること:
//   - 3 つの入力（貼り付け / ファイル / ドロップ）がどれも同じ経路で staged Pack を作る
//   - staged は active ではない（activeProjectContext・案件プリセット UI・計算結果が変わらない）
//   - trust は pack_unreviewed だけ、preview は件数と ID だけで raw JSON を出さない
//   - 失敗は transactional（前の Pack も残らない）で、入力の値・stack を表示しない
//   - 取り込み上限は解析前に効く（貼り付けは UTF-8 byte、ファイルは size で読む前に）
//   - 保存・通信・URL 反映・console への出力をしない
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

// リポジトルートはこのファイルの位置から求める（絶対パスを埋め込まない）。
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);
const FILE = 'file://' + REPO + 'index.html';
const FIXTURE_DIR = REPO + 'tests/fixtures/project-pack/';
const MAX_BYTES = 8 * 1024 * 1024;

// active 側の期待値は page の外（Node の registry）から取る
const Registry = require(REPO + 'project-config/registry.js');
const RUNTIME_DEFAULT = Registry.getBuiltInPreset(Registry.getRuntimeDefaultBuiltInPresetId());

const FIXTURES = {
  notification1458: 'synthetic-notification1458.json',
  project_pressure_map: 'synthetic-project-pressure-map.json',
  case_direct: 'synthetic-case-direct.json'
};
const fixtureText = (mode) => fs.readFileSync(FIXTURE_DIR + FIXTURES[mode], 'utf8');
const fixture = (mode) => JSON.parse(fixtureText(mode));

/** fixture の JSON を数えて preview の期待値を作る（検証器を通さない独立の oracle）。 */
function expectedPreview(mode) {
  const p = fixture(mode);
  const claimed = {};
  p.evidence.sourceScopes.forEach((s) => { claimed[s.sourceClaim.claimedLevel] = (claimed[s.sourceClaim.claimedLevel] || 0) + 1; });
  const out = {
    publicLabel: p.projectMetadata.publicLabel,
    mode,
    panes: p.panes.length,
    cases: p.glazingCases.length,
    scopes: p.evidence.sourceScopes.length,
    records: p.evidence.records.length,
    caseIds: p.glazingCases.map((c) => c.caseId).sort(),
    paneIds: p.panes.map((x) => x.paneId).sort(),
    claimed,
    modeRows: []
  };
  if (mode === 'notification1458') {
    out.modeRows = ['ケースが参照する階: ' + new Set(p.glazingCases.map((c) => c.floor)).size + ' 階',
      '評価高さ（evaluationHeights）: ' + p.windConditions.evaluationHeights.length + ' 件',
      'ケース: ' + p.glazingCases.length + ' 件'];
  } else if (mode === 'project_pressure_map') {
    out.modeRows = ['正圧の階（positivePressures）: ' + p.windConditions.positivePressures.length + ' 階',
      '負圧の部位（negativePressures）: ' + p.windConditions.negativePressures.length + ' 部位',
      'ケース: ' + p.glazingCases.length + ' 件'];
  } else {
    out.modeRows = ['ケース別の設計風圧（designPressure）: ' + p.glazingCases.length + ' 件',
      'ケース: ' + p.glazingCases.length + ' 件'];
  }
  return out;
}

const FAILURE_LEAD = '読み込みに失敗しました。Project Packは現在読み込まれていません。';
const FORBIDDEN_WORDING = /Verified|確認済|承認済|一次資料で確認済|計算可能|公開可能|問題なし|\bsafe\b/i;
const PRESSURE_CAPS = ['notificationCalculation', 'projectPressureMap', 'caseDirectPressure'];
const CAP_BY_MODE = { notification1458: 'notificationCalculation', project_pressure_map: 'projectPressureMap',
  case_direct: 'caseDirectPressure' };

let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('project-pack-intake', () => ({ checksRun: pass + fail, failures: fail }));

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleMessages = [];
const pageErrors = [];
const requests = [];
page.on('console', (m) => consoleMessages.push({ type: m.type(), text: m.text() }));
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('request', (r) => { if (!r.url().startsWith('file://')) requests.push(r.url()); });

// 保存・通信・URL 反映の呼び出しを数える（page の script より先に入れる）。JSON.parse と
// Blob.text も数え、上限超過が解析・読込より前で止まることを確かめる。
await page.addInitScript(() => {
  const calls = { storage: 0, cookie: 0, idb: 0, caches: 0, beacon: 0, fetch: 0, xhr: 0, history: 0,
    jsonParse: 0, blobText: 0 };
  window.__packProbe = calls;
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
  const parse = JSON.parse;
  JSON.parse = function () { calls.jsonParse++; return parse.apply(JSON, arguments); };
  wrap(Blob.prototype, 'text', 'blobText');
});

await page.goto(FILE);
await page.waitForTimeout(400);

/* ---------- helpers ---------- */

const probe = () => page.evaluate(() => Object.assign({}, window.__packProbe));

/**
 * S3-B3B2-B2: 画面は 3 つ（単一ケース / 複数ケース / Project Pack）。表示していなければタブを押して開く。
 * Pack の操作・表示の読み取りは Pack の画面で、単一ケースの計算・表示の読み取りは単一ケースの画面で行う
 * （隠れた画面の innerText は描画を伴わないので、表示中と同じ条件で読む）。
 */
async function showView(view) {
  if (await page.evaluate((v) => document.getElementById('view-' + v).hidden, view)) await page.click('#view-tab-' + view);
}

/** 画面と page 変数から、staged / active / panel の状態を読む。 */
async function state() {
  await showView('pack');
  return page.evaluate(() => {
    const ctx = window.stagedProjectPackContext;
    const status = document.getElementById('pack-status');
    const preview = document.getElementById('pack-preview');
    const out = {
      staged: window.stagedProjectPack !== null && window.stagedProjectPack !== undefined,
      stagedContext: ctx !== null && ctx !== undefined,
      status: status ? status.textContent : null,
      statusError: status ? status.classList.contains('is-error') : null,
      previewHidden: preview ? preview.hidden : null,
      previewText: preview ? preview.innerText : null,
      previewItems: preview ? [...preview.querySelectorAll('li')].map((li) => li.textContent) : [],
      previewIdLists: preview ? [...preview.querySelectorAll('.pack-id-list')].map((d) => d.textContent) : [],
      panelText: document.getElementById('project-pack-section').innerText,
      pasteValue: document.getElementById('pack-paste').value,
      fileValue: document.getElementById('pack-file').value
    };
    if (ctx) {
      const caps = Object.keys(ctx.capabilities).sort();
      out.context = {
        contextType: ctx.contextType, schemaVersion: ctx.schemaVersion, sourceKind: ctx.sourceKind,
        trust: ctx.trust, mode: ctx.pressureModel.mode, publicLabel: ctx.publicLabel,
        originKeys: Object.keys(ctx.origin).sort(), packType: ctx.origin.packType,
        packSchemaVersion: ctx.origin.packSchemaVersion, advisories: ctx.origin.publicationAdvisories.length,
        caps,
        claimKinds: ctx.capabilities.evidenceClaims.sourceScopes.map((s) => s.evidenceKind),
        claimKeys: ctx.capabilities.evidenceClaims.sourceScopes.map((s) => Object.keys(s.sourceClaim).sort().join(',')),
        frozen: Object.isFrozen(ctx) && Object.isFrozen(ctx.capabilities) && Object.isFrozen(window.stagedProjectPack),
        isContext: ProjectContext.isProjectContext(ctx),
        stagedTrust: window.stagedProjectPack.trust,
        stagedMode: window.stagedProjectPack.pressureModel.mode,
        cases: ctx.capabilities.declaredGlazingCases.glazingCases.map((c) => Object.assign({}, c))
      };
      out.stagedJson = JSON.stringify(window.stagedProjectPack) + JSON.stringify(ctx);
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
      origin: ctx && JSON.stringify(ctx.origin),
      caps: ctx && Object.keys(ctx.capabilities).sort().join(','),
      mode: document.getElementById('inp-mode').value,
      presetLabel: text('preset-name-label'),
      floors: opts('inp-floor').join('|'), zones: opts('inp-zone').join('|'),
      w: document.getElementById('inp-W').value, h: document.getElementById('inp-H').value,
      result: text('result-area')
    };
  });
  await showView('pack');
  return snap;
}

async function paste(text) {
  await showView('pack');
  await page.evaluate((t) => { document.getElementById('pack-paste').value = t; }, text);
  await page.click('#btn-pack-load');
  await page.waitForTimeout(50);
}

async function chooseFile(name, mimeType, buffer) {
  await showView('pack');
  await page.setInputFiles('#pack-file', { name, mimeType, buffer });
}

async function waitStatus(re, timeout) {
  try {
    await page.waitForFunction((src) => new RegExp(src).test(document.getElementById('pack-status').textContent),
      re.source, { timeout: timeout || 5000 });
    return true;
  } catch (e) { return false; }
}

async function drop(files) {
  await showView('pack');
  await page.evaluate((list) => {
    const dt = new DataTransfer();
    // kind: 'string' はファイルではない項目（ドラッグした文字列など）として足す
    list.forEach((f) => (f.kind === 'string' ? dt.items.add(f.text, f.type)
      : dt.items.add(new File([f.text], f.name, { type: f.type }))));
    const zone = document.getElementById('pack-drop');
    zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, files);
}

function checkLoaded(id, s, mode, via) {
  const exp = expectedPreview(mode);
  const c = s.context || {};
  check(id + '-staged', s.staged && s.stagedContext && !s.statusError, `staged=${s.staged} context=${s.stagedContext}`);
  check(id + '-context', c.contextType === 'glass_wind_project_context' && c.schemaVersion === 1 &&
    c.sourceKind === 'project_pack_unreviewed' && c.trust === 'pack_unreviewed' && c.isContext === true &&
    c.stagedTrust === 'pack_unreviewed' && c.mode === mode && c.stagedMode === mode,
    `${c.contextType}/${c.schemaVersion}/${c.sourceKind}/${c.trust}/${c.mode}`);
  check(id + '-origin', JSON.stringify(c.originKeys) === JSON.stringify(['packSchemaVersion', 'packType', 'publicationAdvisories']) &&
    c.packType === 'glass_wind_project_pack' && c.packSchemaVersion === 1, JSON.stringify(c.originKeys));
  const pressureCaps = (c.caps || []).filter((k) => PRESSURE_CAPS.includes(k));
  check(id + '-caps', JSON.stringify(c.caps) === JSON.stringify(['declaredGlazingCases', 'declaredPanes', 'evidenceClaims',
    CAP_BY_MODE[mode]].sort()) && pressureCaps.length === 1, (c.caps || []).join(','));
  check(id + '-claims', (c.claimKinds || []).length === exp.scopes && c.claimKinds.every((k) => k === 'pack_unreviewed_claim') &&
    c.claimKeys.every((k) => k === 'claimedCheckedAt,claimedLevel,claimedPrivateReferenceAvailable,publicDescription'),
    (c.claimKinds || []).join(','));
  check(id + '-frozen', c.frozen === true, 'staged pack と context は凍結');
  check(id + '-status', s.status.includes('未レビュー') && s.status.includes('読み込み経路: ' + via) &&
    s.status.includes('反映していません'), s.status.split('\n')[0]);
  const items = s.previewItems;
  const want = ['公開表示名: ' + exp.publicLabel, 'trust: pack_unreviewed（未レビュー）', 'pressureModel.mode: ' + mode,
    'panes: ' + exp.panes, 'glazing cases: ' + exp.cases, 'source scopes: ' + exp.scopes,
    'evidence records: ' + exp.records, 'publication advisories: 0'].concat(exp.modeRows);
  const missing = want.filter((w) => !items.includes(w));
  check(id + '-preview', !s.previewHidden && missing.length === 0, missing.length ? 'missing ' + missing.join(' / ') : `${items.length} rows`);
  check(id + '-ids', s.previewIdLists.length === 2 && s.previewIdLists[0] === exp.caseIds.join(', ') &&
    s.previewIdLists[1] === exp.paneIds.join(', '), s.previewIdLists.join(' | '));
  const claimRows = Object.keys(exp.claimed).map((k) => 'claimed ' + k + ': ' + exp.claimed[k]);
  check(id + '-claimrows', claimRows.every((r) => items.includes(r)) && s.previewText.includes('Source claims (unreviewed)'),
    claimRows.join(', '));
  check(id + '-wording', !FORBIDDEN_WORDING.test(s.panelText) && s.panelText.includes('Closure判定はこの段階では行いません'),
    (s.panelText.match(FORBIDDEN_WORDING) || ['none'])[0]);
  // raw JSON は出さない（key 名の引用・波括弧・値の羅列が panel に現れない）
  check(id + '-noraw', !/"packType"|"schemaVersion"|\{"|"value"\s*:/.test(s.panelText) &&
    !s.panelText.includes(fixture(mode).evidence.sourceScopes[0].sourceClaim.publicDescription),
    'raw JSON・申告文を表示しない');
}

function checkFailed(id, s, stageLabel, secrets) {
  check(id + '-cleared', !s.staged && !s.stagedContext && s.previewHidden === true, `staged=${s.staged} preview hidden=${s.previewHidden}`);
  check(id + '-message', s.statusError === true && s.status.startsWith(FAILURE_LEAD) && s.status.includes('段階: ' + stageLabel),
    s.status.replace(/\n/g, ' | ').slice(0, 160));
  const leaked = (secrets || []).filter((x) => s.status.includes(x) || s.panelText.includes(x));
  check(id + '-noecho', leaked.length === 0 && !/\n\s+at |Error:|SyntaxError|Unexpected token|\{"/.test(s.status) &&
    s.status.length < 800, leaked.length ? 'leaked ' + leaked.join(',') : 'no echo / no stack');
}

/* ---------- 1. clean startup ---------- */

await page.evaluate(() => { window.__activeAtStart = activeProjectContext; });
// 計算結果を 1 度確定させてから比べる
await showView('single');
await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE0 = await activeSnapshot();
const s0 = await state();
check('I1-clean', !s0.staged && !s0.stagedContext && s0.previewHidden === true &&
  s0.status === 'Project Packは読み込まれていません。', s0.status);
check('I1-active', ACTIVE0.sourceKind === 'legacy_builtin' && ACTIVE0.trust === 'built_in_current' &&
  ACTIVE0.publicLabel === RUNTIME_DEFAULT.getPublicLabel() && ACTIVE0.mode === 'preset',
  `${ACTIVE0.sourceKind}/${ACTIVE0.publicLabel}/${ACTIVE0.mode}`);
const ui0 = await page.evaluate(() => {
  const file = document.getElementById('pack-file');
  return { accept: file.getAttribute('accept'), multiple: file.multiple,
    paste: !!document.getElementById('pack-paste'), drop: !!document.getElementById('pack-drop'),
    load: document.getElementById('btn-pack-load').textContent.trim(),
    unload: document.getElementById('btn-pack-unload').textContent.trim(),
    title: document.getElementById('pack-title').textContent.trim() };
});
// S3-B3B2-B2: Pack 欄は Project Pack の画面だけに出す（以前の「一括検討の表示でも見える」契約は意図して廃止）。
// 子要素の getComputedStyle().display は祖先の hidden を反映しないので、Playwright の可視判定・
// checkVisibility()・祖先の hidden 属性で調べる。各画面はタブを押して開く。
async function viewVisibility() {
  const dom = await page.evaluate(() => {
    const pack = document.getElementById('project-pack-section');
    return { pack: pack.checkVisibility(), packInHidden: !!pack.closest('[hidden]'),
      single: document.getElementById('result-area').checkVisibility(),
      batch: document.getElementById('batch-tsv').checkVisibility() };
  });
  return { pack: await page.isVisible('#project-pack-section') && dom.pack && !dom.packInHidden,
    single: await page.isVisible('#view-single') && dom.single, batch: await page.isVisible('#view-batch') && dom.batch };
}
const shown = {};
for (const v of ['single', 'batch', 'pack']) {
  await page.click('#view-tab-' + v);
  shown[v] = await viewVisibility();
  if (v === 'batch') {
    // Workspace の最初のカード（案件プロファイル）は Pack 欄に押し下げられず、タブの直下にある
    shown.firstCard = await page.evaluate(() => {
      const tabs = document.querySelector('.view-switch').getBoundingClientRect();
      const card = document.querySelector('#view-batch > .card');
      return { gap: Math.round(card.getBoundingClientRect().top - tabs.bottom), title: card.querySelector('.card-title').textContent,
        packHeight: document.getElementById('project-pack-section').getBoundingClientRect().height };
    });
  }
}
const only = (o, key) => ['single', 'batch', 'pack'].every((k) => o[k] === (k === key));
check('I1-panel', ui0.title === 'Project Pack（Unreviewed）' && ui0.accept === '.json,application/json' && ui0.multiple === false &&
  ui0.paste && ui0.drop && ui0.load === '検証して読み込む' && ui0.unload === 'Packを解除' &&
  only(shown.single, 'single') && only(shown.batch, 'batch') && only(shown.pack, 'pack') &&
  shown.firstCard.gap >= 0 && shown.firstCard.gap < 60 && shown.firstCard.title === '案件プロファイル（風条件の共通値）' &&
  shown.firstCard.packHeight === 0,
  JSON.stringify({ title: ui0.title, shown }));
check('I1-cap-note', s0.panelText.includes('8 MiB') && s0.panelText.includes('資源保護') &&
  s0.panelText.includes('schema の制限ではありません') && s0.panelText.includes('Closure判定はこの段階では行いません'),
  'byte cap is stated as a browser resource limit');

/* ---------- 2. valid notification pack via paste ---------- */

const parseBefore = (await probe()).jsonParse;
await showView('pack');
await page.fill('#pack-paste', fixtureText('notification1458'));
await page.waitForTimeout(100);
const typed = await state();
check('P1-no-parse-before-click', !typed.staged && (await probe()).jsonParse === parseBefore &&
  typed.status === s0.status, '貼り付けただけでは解析しない');
await page.click('#btn-pack-load');
await page.waitForTimeout(50);
const s1 = await state();
checkLoaded('P1', s1, 'notification1458', '貼り付け');
check('P1-paste-cleared', s1.pasteValue === '', '検証後に貼り付け欄へ raw text を残さない');
check('P1-active', JSON.stringify(await activeSnapshot()) === JSON.stringify(ACTIVE0), 'active context・preset UI・結果は不変');
// S3-B3B2-B2: 画面を切り替えても staged の Pack・preview・状態行は変わらない（解除も再検証もしない）
const parseBeforeSwitch = (await probe()).jsonParse;
for (const v of ['single', 'batch', 'pack']) await page.click('#view-tab-' + v);
const parseAfterSwitch = (await probe()).jsonParse;
const s1back = await state();
check('I1-panel-switch-keeps-staged', s1back.staged && s1back.stagedJson === s1.stagedJson && s1back.status === s1.status &&
  s1back.previewText === s1.previewText && s1back.previewHidden === false && parseAfterSwitch === parseBeforeSwitch,
  `single → batch → pack, JSON.parse ${parseBeforeSwitch} → ${parseAfterSwitch}`);

/* ---------- 3. valid pressure-map pack via file ---------- */

const FILE_NAME = 'synthetic-project-pressure-map.json';
await chooseFile(FILE_NAME, 'application/json', Buffer.from(fixtureText('project_pressure_map'), 'utf8'));
await waitStatus(/読み込み経路: ファイル選択|読み込みに失敗/);
const s2 = await state();
checkLoaded('F1', s2, 'project_pressure_map', 'ファイル選択');
check('F1-no-filename', !s2.panelText.includes('synthetic-project-pressure-map') && !s2.stagedJson.includes('synthetic-project-pressure-map') &&
  s2.fileValue === '', 'ファイル名を pack・context・画面・input に残さない');
check('F1-active', JSON.stringify(await activeSnapshot()) === JSON.stringify(ACTIVE0), 'active は不変');

/* ---------- 4. valid case-direct pack via drop ---------- */

await drop([{ name: 'pack.json', type: 'application/json', text: fixtureText('case_direct') }]);
await waitStatus(/読み込み経路: ドロップ|読み込みに失敗/);
const s3 = await state();
checkLoaded('D1', s3, 'case_direct', 'ドロップ');
// case_direct で floor / zone を推測しない（fixture に無いものは context にも無い）
const directCases = fixture('case_direct').glazingCases;
const noInvention = (s3.context ? s3.context.cases : []).every((c) => {
  const src = directCases.find((d) => d.caseId === c.caseId);
  return src && ('floor' in c) === ('floor' in src) && ('zone' in c) === ('zone' in src) && !('designPressure' in c);
});
check('D1-no-invented-fields', noInvention, '入力に無い floor / zone を作らない');
check('D1-active', JSON.stringify(await activeSnapshot()) === JSON.stringify(ACTIVE0), 'active は不変');

// drop の拒否（RF-21-01: 項目がちょうど 1 つのファイルであること）。各拒否の前に有効な Pack を
// 読み込んでおき、拒否で staged が空になる（前の Pack を残さない）ことも確かめる。
// D5（フォルダ）は script から作れないので tests/s3b1-project-pack-intake.test.js（vm）で確かめる。
const CASE_FILE = { name: 'pack.json', type: 'application/json', text: fixtureText('case_direct') };
async function rejectedDrop(id, items, secrets) {
  await paste(fixtureText('notification1458'));
  const reads = (await probe()).blobText;
  await drop(items);
  await page.waitForTimeout(50);
  const s = await state();
  checkFailed(id, s, 'ファイル', (secrets || []).concat(['Synthetic Pack N1458']));
  check(id + '-unread', (await probe()).blobText === reads, '拒否したドロップのファイルを読まない');
}
await rejectedDrop('D2-file-plus-string', [CASE_FILE, { kind: 'string', type: 'text/plain', text: 'STRING-ITEM-XYZ' }], ['STRING-ITEM-XYZ']);
await rejectedDrop('D2-string-plus-file', [{ kind: 'string', type: 'text/plain', text: 'STRING-ITEM-XYZ' }, CASE_FILE], ['STRING-ITEM-XYZ']);
await rejectedDrop('D3-string-only', [{ kind: 'string', type: 'text/plain', text: '{"schemaVersion":1}' }]);
await rejectedDrop('D4-two-files', [CASE_FILE, CASE_FILE]);
await rejectedDrop('D6-not-json', [{ name: 'picture.png', type: 'image/png', text: 'PNGDATA' }], ['PNGDATA']);

/* ---------- 5. invalid JSON ---------- */

await paste('{"schemaVersion": 1, "packType": "SECRET_TOKEN_XYZ", "projectMetadata": {');
checkFailed('J1', await state(), 'JSON 構文', ['SECRET_TOKEN_XYZ', 'projectMetadata']);

/* ---------- 6. schema-invalid pack ---------- */

const bad1 = fixture('case_direct');
bad1.secretProjectNameXYZ = 'Hidden Tower';
await paste(JSON.stringify(bad1));
const sb1 = await state();
checkFailed('V1', sb1, 'Project Pack 検証', ['secretProjectNameXYZ', 'Hidden Tower']);
check('V1-path', sb1.status.includes('場所: pack') && sb1.status.includes('unexpected field'), 'validator の path と理由を出す');
const bad2 = fixture('case_direct');
bad2.glazingCases[0].glassType = '秘密ガラスXYZ';
await paste(JSON.stringify(bad2));
const sb2 = await state();
checkFailed('V2', sb2, 'Project Pack 検証', ['秘密ガラスXYZ']);
check('V2-path', sb2.status.includes('場所: pack.glazingCases[0].glassType') && sb2.status.includes('must be one of'), 'path と理由');
const bad3 = fixture('case_direct');
bad3.panes[0]['秘密のキー: Hidden'] = 'x'.repeat(600);
await paste(JSON.stringify(bad3));
const sb3 = await state();
checkFailed('V3', sb3, 'Project Pack 検証', ['秘密のキー', 'Hidden', 'xxxxxxxxxx']);
check('V3-path', sb3.status.includes('場所: pack.panes[0].…') && sb3.status.includes('string is longer than'),
  'schema に無い key は path に出さない');

/* ---------- 7. oversized paste ---------- */

// length は上限以下だが UTF-8 では上限を超える（多 byte 文字）。解析より前に拒否する。
const parseBeforeBig = (await probe()).jsonParse;
await page.evaluate((max) => {
  const n = Math.floor(max / 3) + 1;          // 3 byte 文字 × n > max
  document.getElementById('pack-paste').value = '"' + 'あ'.repeat(n) + '"';
}, MAX_BYTES);
await page.click('#btn-pack-load');
await page.waitForTimeout(100);
const s7 = await state();
checkFailed('Z1', s7, '取り込み上限', []);
check('Z1-before-parse', (await probe()).jsonParse === parseBeforeBig && s7.status.includes('資源保護'),
  '上限超過は JSON.parse より前で止まる');
// 境界: ちょうど上限の byte 数は上限で止めない（JSON として読めずに JSON 構文で失敗する）
await page.evaluate((max) => { document.getElementById('pack-paste').value = 'x'.repeat(max); }, MAX_BYTES);
await page.click('#btn-pack-load');
await page.waitForTimeout(100);
const s7b = await state();
check('Z2-at-limit', s7b.status.includes('段階: JSON 構文'), s7b.status.split('\n')[1]);
await page.evaluate((max) => { document.getElementById('pack-paste').value = 'x'.repeat(max + 1); }, MAX_BYTES);
await page.click('#btn-pack-load');
await page.waitForTimeout(100);
check('Z3-over-limit', (await state()).status.includes('段階: 取り込み上限'), 'MAX + 1 byte は拒否');

/* ---------- 8. oversized file ---------- */

const textBefore = (await probe()).blobText;
await chooseFile('big.json', 'application/json', Buffer.alloc(MAX_BYTES + 1, 0x20));
await page.waitForTimeout(150);
const s8 = await state();
checkFailed('Z4', s8, '取り込み上限', []);
check('Z4-before-read', (await probe()).blobText === textBefore, 'file.size で読む前に拒否する');
await chooseFile('image.png', 'image/png', Buffer.from('PNGDATA'));
await page.waitForTimeout(100);
checkFailed('Z5-type', await state(), 'ファイル', ['PNGDATA']);

/* ---------- 9. unsafe publicDescription ---------- */

const bad9 = fixture('notification1458');
bad9.evidence.sourceScopes[0].sourceClaim.publicDescription = 'see https://private.example.invalid/secret-doc';
await paste(JSON.stringify(bad9));
const s9 = await state();
checkFailed('U1', s9, 'Project Pack 検証', ['private.example', 'secret-doc', 'https']);
check('U1-rule', s9.status.includes('url-scheme') && s9.status.includes('場所: pack.evidence.sourceScopes[0].sourceClaim'),
  '規則名と path だけを出す');

// RF-21-02: notification_baseline に recurrenceYears を付けると、風圧側の文面は "; got <値>" で
// 値を返す。区切りの形によらず、その値・公開表示名・ファイル名・JSON・stack を表示しない。
const REC_VALUE = '8642.97';
const rec = fixture('notification1458');
rec.projectMetadata.publicLabel = 'Synthetic Pack Recurrence Probe';
rec.windConditions.recurrenceYears = Number(REC_VALUE);
await chooseFile('recurrence-probe-file-XYZ.json', 'application/json', Buffer.from(JSON.stringify(rec), 'utf8'));
await waitStatus(/読み込みに失敗|読み込み経路/);
const sRec = await state();
checkFailed('G1-got-suffix', sRec, 'Project Pack 検証',
  [REC_VALUE, '8642', 'Synthetic Pack Recurrence Probe', 'recurrence-probe-file-XYZ', '"windConditions"']);
check('G1-path-reason', sRec.status.includes('場所: pack.glazingCases[0]') &&
  sRec.status.includes('notification_baseline does not take recurrenceYears') && !/\bgot\b/i.test(sRec.status),
  sRec.status.split('\n').slice(2).join(' | ').slice(0, 160));
// この文面は既定の表示長（200 字）で値の手前が切れるので、G1 だけでは「長さの上限で偶然隠れた」のか
// 「echo の規則が落とした」のかを区別できない。表示長の上限を外して、規則そのものを確かめる。
await page.evaluate(() => { window.__savedPackErrorMax = PROJECT_PACK_ERROR_MAX_LENGTH; PROJECT_PACK_ERROR_MAX_LENGTH = 100000; });
await paste(JSON.stringify(rec));
const sRec2 = await state();
await page.evaluate(() => { PROJECT_PACK_ERROR_MAX_LENGTH = window.__savedPackErrorMax; });
checkFailed('G2-got-suffix-uncapped', sRec2, 'Project Pack 検証',
  [REC_VALUE, '8642', 'Synthetic Pack Recurrence Probe', '"windConditions"']);
const recReason = (sRec2.status.split('\n').find((l) => l.startsWith('理由: ')) || '');
check('G2-rule-not-cap', /not part of the notification baseline\)$/.test(recReason) && !/…$/.test(recReason) &&
  !/\bgot\b/i.test(recReason), recReason.slice(-80));

// advisory は数と path・規則名だけを出し、0 件を安全と言わない
const adv = fixture('case_direct');
adv.projectMetadata.publicLabel = 'Synthetic www.example.com';
await paste(JSON.stringify(adv));
const sa = await state();
check('A1-advisory', sa.staged && sa.context.advisories === 1 && sa.previewItems.includes('publication advisories: 1') &&
  sa.previewItems.some((t) => t.startsWith('pack.projectMetadata.publicLabel — ')), sa.previewItems.filter((t) => t.startsWith('pack.')).join(','));
check('A1-wording', !FORBIDDEN_WORDING.test(sa.panelText) && sa.panelText.includes('0 件でも、公開してよいという判断にはなりません'),
  'advisory 0 件を安全・公開可能と表示しない');

/* ---------- 10. valid Pack A → invalid Pack B ---------- */

await paste(fixtureText('notification1458'));
const s10a = await state();
check('T1-A-loaded', s10a.staged && s10a.context.mode === 'notification1458', 'A を読み込んだ');
await paste('{"schemaVersion": 1');
const s10b = await state();
checkFailed('T1-B', s10b, 'JSON 構文', []);
check('T1-no-previous', !s10b.previewText.includes('Synthetic Pack N1458') && !s10b.panelText.includes('Synthetic Pack N1458'),
  '失敗後に前の Pack を残さない');
check('T1-active', JSON.stringify(await activeSnapshot()) === JSON.stringify(ACTIVE0), 'active は不変');

/* ---------- 11. unload ---------- */

await paste(fixtureText('project_pressure_map'));
check('L1-loaded', (await state()).staged, '解除の前に読み込む');
await page.click('#btn-pack-unload');
await page.waitForTimeout(50);
const s11 = await state();
check('L1-unloaded', !s11.staged && !s11.stagedContext && s11.previewHidden === true && !s11.statusError &&
  s11.status.includes('解除しました') && s11.status.includes('読み込まれていません'), s11.status);
check('L1-active', JSON.stringify(await activeSnapshot()) === JSON.stringify(ACTIVE0), 'active は不変');

/* ---------- 12. repeated valid load ---------- */

await paste(fixtureText('project_pressure_map'));
await paste(fixtureText('case_direct'));
const s12 = await state();
checkLoaded('R1', s12, 'case_direct', '貼り付け');
check('R1-replaced', !s12.previewItems.some((t) => t.startsWith('正圧の階')) && !s12.previewText.includes('Synthetic Pack Map'),
  '前の Pack の行を残さない');
await paste(fixtureText('case_direct'));
const s12b = await state();
check('R1-stable', s12b.previewItems.join('|') === s12.previewItems.join('|'), '同じ Pack の再読込で表示が変わらない');

// 進行中のファイル読込より後の試行が勝つ（遅い読込が後から staged を上書きしない）
await page.evaluate(() => {
  const orig = Blob.prototype.text;
  window.__restoreBlobText = () => { Blob.prototype.text = orig; };
  Blob.prototype.text = function () { const p = orig.apply(this, arguments); return new Promise((r) => setTimeout(() => r(p), 300)); };
});
await chooseFile('slow.json', 'application/json', Buffer.from(fixtureText('notification1458'), 'utf8'));
await paste(fixtureText('project_pressure_map'));
await page.waitForTimeout(600);
await page.evaluate(() => window.__restoreBlobText());
const sRace = await state();
check('R2-latest-wins', sRace.staged && sRace.context.mode === 'project_pressure_map' && sRace.status.includes('読み込み経路: 貼り付け'),
  sRace.context ? sRace.context.mode : 'none');

/* ---------- runtime parity・保存・通信 ---------- */

await showView('single');
await page.click('button.btn-calc');
await page.waitForTimeout(100);
const ACTIVE1 = await activeSnapshot();
check('X1-runtime-parity', JSON.stringify(ACTIVE1) === JSON.stringify(ACTIVE0) && ACTIVE1.sameObject === true,
  'Pack を読み込んでも active context・案件プリセット UI・計算結果は同じ');
const calls = await probe();
check('X2-no-persistence', calls.storage === 0 && calls.cookie === 0 && calls.idb === 0 && calls.caches === 0,
  JSON.stringify({ storage: calls.storage, cookie: calls.cookie, idb: calls.idb, caches: calls.caches }));
const storage = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie.length }));
check('X3-storage-empty', storage.ls === 0 && storage.ss === 0 && storage.cookie === 0, JSON.stringify(storage));
check('X4-no-network', requests.length === 0 && calls.fetch === 0 && calls.xhr === 0 && calls.beacon === 0,
  `requests=${requests.length} fetch=${calls.fetch} xhr=${calls.xhr} beacon=${calls.beacon}`);
const url = await page.evaluate(() => ({ hash: location.hash, search: location.search, href: location.href }));
check('X5-no-url', url.hash === '' && url.search === '' && url.href === FILE && calls.history === 0, JSON.stringify(url));
const leakyConsole = consoleMessages.filter((m) => /packType|schemaVersion|glazingCases|Synthetic Pack/.test(m.text));
check('X6-no-console-dump', leakyConsole.length === 0 && consoleMessages.filter((m) => m.type === 'error').length === 0,
  `console=${consoleMessages.length} leaky=${leakyConsole.length}`);
check('X7-no-page-error', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

console.log(results.join('\n'));
await browser.close();

console.log(`\nproject-pack-intake: ${pass} pass / ${fail} fail`);
finishRun('project-pack-intake', pass + fail, fail, { playwrightSource });
