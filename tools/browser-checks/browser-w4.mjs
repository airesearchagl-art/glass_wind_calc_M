// Playwright is RESOLVED, not hardcoded (P2K-F06). This file used to open with
// an absolute path into one machine's global module root, which meant a fresh
// verifier could not run it -- see resolve-playwright.mjs for the candidates
// and why each is discovered rather than listed.
//
// The resolve-and-classify logic lives in harness.mjs, shared by all five
// harnesses. It was inline here for one wave, which is precisely why the other
// four never got it: a repair that exists as one copy gets applied to one file
// and reported as done.
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';
// リポジトルートは**このファイルの位置から**求める。
// 絶対パスを埋め込むと、harness は自分が入っている tree ではなく
// **そのパスにある tree** を測る。独立検証8 F8-04 は、tag guard を
// `return false;` にした copy で parser-boundary がなお「bypass 0」と
// 報告することを実証した——欠陥を原理的に検出できない形だった。
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(import.meta.url);

// B-facts の期待値は page の外で求める（page の値を page で確かめない）。
//   NODE_FACTS : Node 側で registry の runtime default built-in（getRuntimeDefaultBuiltInPresetId）から読んだ値
//   SPEC_FACTS : verification-spec.json の evidenceStateExpected（tree から読まない手書きの期待値）
// page 側は案件 module の global ではなく、runtime と同じ active ProjectContext から読む。
const Registry = require(REPO + 'project-config/registry.js');
const BUILT_IN = Registry.getBuiltInPreset(Registry.getRuntimeDefaultBuiltInPresetId());
const NODE_FACTS = {
  verifiedCases: BUILT_IN.verifiedCases.length,
  mode: BUILT_IN.dimensions.mode,
  w: BUILT_IN.dimensions.defaultW.value,
  h: BUILT_IN.dimensions.defaultH.value,
  v0: BUILT_IN.wind.V0.value,
  rough: BUILT_IN.wind.roughnessCategory.value
};
const SPEC = JSON.parse(fs.readFileSync(REPO + 'tools/verification/verification-spec.json', 'utf8')).evidenceStateExpected;
const SPEC_FACTS = {
  verifiedCases: SPEC.project.verifiedCaseCount,
  mode: SPEC.preset.dimensions.mode,
  w: SPEC.preset.dimensions.widthMm,
  h: SPEC.preset.dimensions.heightMm,
  v0: SPEC.preset.wind.V0,
  rough: SPEC.preset.wind.roughnessCategory
};


const FILE = 'file://' + REPO + 'index.html';
let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

const { chromium, playwrightSource } =
  await openBrowser('browser-w4', () => ({ checksRun: pass + fail, failures: fail }));

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
const pageErrors = [];
const requests = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(e.message));
page.on('request', r => { if (!r.url().startsWith('file://')) requests.push(r.url()); });

await page.goto(FILE);
await page.waitForTimeout(400);

// B1 load order
const order = await page.evaluate(() => {
  const srcs = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
  return { closure: srcs.indexOf('project-config/evidence-closure.js'),
           registry: srcs.indexOf('project-config/registry.js'),
           hasModule: typeof window.EvidenceClosure === 'object' };
});
check('B1', order.closure > order.registry && order.registry !== -1 && order.hasModule,
  `closure@${order.closure} > registry@${order.registry}, module=${order.hasModule}`);

// B2 visible in preset mode
// S3-B3B2-B4: 案件の検証状況は「要約（常に表示）」と「詳細（<details id="evidence-details">、最初は閉じている）」に分かれた。
//   旧: evidence-closure-area に文があり、.mode-field-preset の block の inline style が display:none でない
//   新: 要約が実際に見え（checkVisibility）、2 行とも失敗表示でなく、詳細は最初は閉じていて閉じた中の表は見えない。
//       summary を 1 回 click すると evidence-closure-area と行列が実際に見える。
//       以下の B6〜B33 の数値・行は、開いた状態の**見える文**（innerText）から読む（閉じたままなら空になって FAIL する）。
const mode = await page.evaluate(() => document.getElementById('inp-mode').value);
const visible = async () => page.evaluate(() => {
  const el = document.getElementById('evidence-closure-area');
  if (!el) return false;
  const block = el.closest('.mode-field-preset');
  // 包含されていなければ false を返す（例外で落ちると harness の異常終了が
  // 「検出できた」と誤読される。実際に U4-13 でそれが起きた）。
  if (!block) return false;
  const matrix = document.getElementById('evidence-closure-matrix');
  return !!el.innerText.trim() && block.style.display !== 'none' && el.checkVisibility() &&
    !!matrix && matrix.checkVisibility();
});
const evidenceSummary = () => page.evaluate(() => {
  const box = document.getElementById('evidence-summary');
  const line = (id) => { const e = document.getElementById(id); return e ? { text: e.innerText.trim(), error: e.classList.contains('is-error'), visible: e.checkVisibility() } : null; };
  const details = document.getElementById('evidence-details');
  return { visible: !!box && box.checkVisibility() && !!box.closest('.mode-field-preset'),
    status: line('evidence-summary-status'), closure: line('evidence-summary-closure'),
    detailsOpen: details ? details.open : null, areaVisible: document.getElementById('evidence-closure-area').checkVisibility() };
});
const sum0 = await evidenceSummary();
await page.click('#evidence-details > summary');
await page.waitForTimeout(50);
const sumOk = sum0.visible && sum0.status && sum0.status.visible && !sum0.status.error && sum0.status.text.startsWith('案件入力値の検証状況: 全 ') &&
  sum0.closure && sum0.closure.visible && !sum0.closure.error && sum0.closure.text.startsWith('Evidence Closure: ');
check('B2', mode === 'preset' && sumOk && sum0.detailsOpen === false && sum0.areaVisible === false &&
  await page.evaluate(() => document.getElementById('evidence-details').open) === true && await visible(),
  `mode=${mode} summary=${JSON.stringify(sum0)}`);

// header numbers
const head = await page.evaluate(() => {
  const t = document.getElementById('evidence-closure-area').innerText;
  const g = (re) => { const m = t.match(re); return m ? m[1] : null; };
  return {
    status: g(/現在のclosure状態:\s*([^\s必]+)/),
    slots: g(/必要な確認項目:\s*(\d+\s*\/\s*\d+)/),
    cats: g(/closureカテゴリ:\s*(\d+\s*\/\s*\d+)/),
    cases: g(/想定case scope:\s*(\d+\s*\/\s*\d+)/),
    obs: g(/提出済みEvidence Observation:\s*(\d+)/),
    cand: g(/Promotion Candidate:\s*(\S+?)未解決/) || g(/Promotion Candidate:\s*(\S+)/),
    unresolved: g(/未解決カテゴリ:\s*(\d+)/)
  };
});
check('B6', head.status === '未充足', `status=${head.status}`);
check('B7', head.slots?.replace(/\s/g,'') === '0/12', `slots=${head.slots}`);
check('B8', head.cats?.replace(/\s/g,'') === '0/4', `categories=${head.cats}`);
check('B9', head.cases?.replace(/\s/g,'') === '0/8', `cases=${head.cases}`);
check('B10', head.cand?.startsWith('なし'), `candidate=${head.cand}`);
check('B10b', head.obs === '0', `observations=${head.obs}`);
check('B33', head.unresolved === '4', `unresolved categories=${head.unresolved}`);

// rows
const rows = await page.evaluate(() => {
  const tb = document.getElementById('evidence-closure-matrix');
  // 表が無ければ 0 行として返す（例外で落ちると ERROR になり、B11 以下の明示的な FAIL にならない）
  if (!tb) return [];
  const trs = [...tb.querySelectorAll('tr')].slice(1);
  return trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.innerText.trim()));
});
check('B11', rows.length === 12, `rows=${rows.length}`);
const byLabel = (s) => rows.filter(r => r[0].startsWith(s)).length;
check('B12', byLabel('ガラス見付幅') + byLabel('ガラス見付高さ') === 2, 'dimension rows');
check('B13', byLabel('階別正圧') === 4, `positive=${byLabel('階別正圧')}`);
check('B14', byLabel('部位別負圧') === 2, `negative=${byLabel('部位別負圧')}`);
check('B15', byLabel('評価高さ') === 4, `Z=${byLabel('評価高さ')}`);
check('B18', rows.every(r => r[7] === '未充足'), 'all rows BLOCKED');
check('B20a', rows.every(r => r[4] === '未提出'), 'all Observation 未提出');
check('B18b', rows.every(r => r[5] === '未評価'), 'all gate 未評価');

const zRows = rows.filter(r => r[0].startsWith('評価高さ'));
check('B16', zRows.every(r => r[3].includes('—')), `Z current=${zRows[0]?.[3]}`);
check('B17', zRows.every(r => r[6] === '比較対象なし'), `Z recon=${zRows[0]?.[6]}`);
const nonZ = rows.filter(r => !r[0].startsWith('評価高さ'));
check('B17b', nonZ.every(r => r[6] === 'Evidenceが不十分'), `nonZ recon=${nonZ[0]?.[6]}`);

// B19 no verified wording in closure status column
const allText = await page.evaluate(() =>
  document.getElementById('evidence-closure-area').textContent);
check('B19', !/Verified|承認済み|確定値|検証値/.test(allText), 'no verified wording');

// B20/B21 no inputs or promote controls inside closure area
const controls = await page.evaluate(() => {
  const el = document.getElementById('evidence-closure-area');
  return { inputs: el.querySelectorAll('input,textarea,select,button,form').length };
});
check('B20', controls.inputs === 0, `controls=${controls.inputs}`);
check('B21', !/Promote|昇格する|適用|Apply/.test(allText), 'no promote/apply control');

// B3-B5 hidden in other modes
for (const [id, m] of [['B3','manual'],['B4','notification'],['B5','imported']]) {
  const ok = await page.evaluate(async (mm) => {
    const sel = document.getElementById('inp-mode');
    if (![...sel.options].some(o => o.value === mm)) return 'absent';
    sel.value = mm; sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 120));
    const el = document.getElementById('evidence-closure-area');
    const block = el ? el.closest('.mode-field-preset') : null;
    if (!block) return 'not-contained';   // 例外にせず、検出可能な失敗として返す
    // S3-B4: 要約・詳細（開いたままでも）・表のどれも実際に見えない（inline style だけでなく checkVisibility でも確かめる）
    const shown = ['evidence-summary', 'evidence-details', 'evidence-closure-area', 'evidence-status-table']
      .filter((id) => { const e = document.getElementById(id); return e && e.checkVisibility(); });
    if (shown.length) return 'visible:' + shown.join(',');
    return block.style.display === 'none';
  }, m);
  check(id, ok === true || ok === 'absent', `${m}: ${ok}`);
}
await page.evaluate(() => {
  const sel = document.getElementById('inp-mode');
  sel.value = 'preset'; sel.dispatchEvent(new Event('change'));
});
await page.waitForTimeout(150);

// B22 single calc still works
const calcOk = await page.evaluate(async () => {
  const btn = [...document.querySelectorAll('button')].find(b => /計算|Calculate/.test(b.textContent));
  if (btn) btn.click();
  await new Promise(r => setTimeout(r, 300));
  return document.body.textContent.includes('N/m') ;
});
check('B22', calcOk, 'single calc renders');

// B32 existing Phase 2F panels still present
const panels = await page.evaluate(() => ({
  status: !!document.getElementById('evidence-status-table')?.textContent.trim(),
  recon: !!document.getElementById('reconciliation-area')?.textContent.trim()
}));
check('B32', panels.status && panels.recon, `2F panels status=${panels.status} recon=${panels.recon}`);

// B26/B27 errors
check('B26', pageErrors.length === 0, `pageErrors=${pageErrors.length} ${pageErrors[0]||''}`);
check('B27', consoleErrors.length === 0, `consoleErrors=${consoleErrors.length} ${consoleErrors[0]||''}`);
// B28 network
check('B28', requests.length === 0, `non-file requests=${requests.length}`);
// B29 storage
const storage = await page.evaluate(() => {
  try { return { ls: localStorage.length, ss: sessionStorage.length, cookie: document.cookie.length }; }
  catch (e) { return { ls: -1, ss: -1, cookie: -1 }; }
});
check('B29', storage.ls === 0 && storage.ss === 0 && storage.cookie === 0, JSON.stringify(storage));

// privacy: no private markers rendered
check('B-priv', !/drive\.google|notion\.|sharepoint|C:\\|\/home\/|\/Users\//.test(allText),
  'no private reference in matrix');

// project facts unchanged after UI interaction（page の active ProjectContext から読む）
const facts = await page.evaluate(() => {
  try {
    const ctx = activeProjectContext;
    const be = ProjectContext.requireCapability(ctx, 'builtInEvidence');
    const dims = ProjectContext.requireCapability(ctx, 'sampleDefaultDimensions');
    const value = (k) => { const f = be.fields.find((x) => x.fieldKey === k); return f ? f.value : null; };
    return { verifiedCases: be.verifiedCases.length, mode: dims.mode, w: dims.widthMm.value, h: dims.heightMm.value,
      v0: value('wind.V0'), rough: value('wind.roughnessCategory') };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
});
const sameFacts = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('B-facts', sameFacts(facts, NODE_FACTS) && sameFacts(NODE_FACTS, SPEC_FACTS),
  `page=${JSON.stringify(facts)} page==node:${sameFacts(facts, NODE_FACTS)} node==spec:${sameFacts(NODE_FACTS, SPEC_FACTS)}`);

// B2s: 常に表示する要約の数値は、開いた詳細（Closure の集計）と同じ評価結果の値（確認項目・カテゴリ・case scope を取り違えない）
const sumNow = await evidenceSummary();
const sumNums = (re) => { const m = sumNow.closure && sumNow.closure.text.match(re); return m ? m[1].replace(/\s/g, '') : null; };
check('B2s', sumNums(/必要な確認項目\s*(\d+\s*\/\s*\d+)/) === head.slots?.replace(/\s/g, '') &&
  sumNums(/closureカテゴリ\s*(\d+\s*\/\s*\d+)/) === head.cats?.replace(/\s/g, '') &&
  sumNums(/想定case scope\s*(\d+\s*\/\s*\d+)/) === head.cases?.replace(/\s/g, '') &&
  sumNow.closure.text.startsWith('Evidence Closure: ' + head.status + ' — '), sumNow.closure && sumNow.closure.text);

// B2f: 評価が失敗したら、要約は「失敗」をはっきり示す（0 件・問題なし・検証済みにしない）。最後に行う（以降は失敗状態）
const failed = await page.evaluate(() => {
  const realClosure = window.EvidenceClosure;
  window.EvidenceClosure = Object.assign({}, realClosure, { evaluateClosure: () => { throw new Error('forced closure failure'); } });
  renderEvidenceClosureMatrix();
  const c = document.getElementById('evidence-summary-closure');
  const closure = { text: c.innerText.trim(), error: c.classList.contains('is-error'), visible: c.checkVisibility() };
  window.EvidenceClosure = realClosure;
  const realRender = window.renderEvidenceStatus;
  window.renderEvidenceStatus = () => { throw new Error('forced status failure'); };
  renderPhase2FEvidencePanels();
  const st = document.getElementById('evidence-summary-status');
  const status = { text: st.innerText.trim(), error: st.classList.contains('is-error'), visible: st.checkVisibility() };
  window.renderEvidenceStatus = realRender;
  return { closure, status };
});
const isExplicitFailure = (l) => l.error && l.visible && /表示できません/.test(l.text) && /「検証済み」と解釈しないでください/.test(l.text) &&
  !/\d+\s*\/\s*\d+|0\s*件|問題なし|Verified|検証済みです/.test(l.text);
check('B2f', isExplicitFailure(failed.closure) && isExplicitFailure(failed.status), JSON.stringify(failed));

console.log(results.join('\n'));
await browser.close();

// The outcome is classified, not inferred from a boolean. Zero checks with zero
// failures is an ERROR, not a pass: a run that measured nothing would otherwise
// read exactly like a clean one.
console.log(`\nbrowser: ${pass} pass / ${fail} fail`);
finishRun('browser-w4', pass + fail, fail, { playwrightSource });
