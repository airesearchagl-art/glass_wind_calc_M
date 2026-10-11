// Playwright is resolved, not hardcoded (P2K-F06). See harness.mjs: a failed
// resolve reports UNVERIFIED and exits 3, never FAIL's exit 1.
import { openBrowser, finishRun } from './harness.mjs';
import { fileURLToPath } from 'url';
// リポジトルートは**このファイルの位置から**求める。
// 絶対パスを埋め込むと、harness は自分が入っている tree ではなく
// **そのパスにある tree** を測る。独立検証8 F8-04 は、tag guard を
// `return false;` にした copy で parser-boundary がなお「bypass 0」と
// 報告することを実証した——欠陥を原理的に検出できない形だった。
const REPO = fileURLToPath(new URL('../../', import.meta.url));

const { chromium, playwrightSource } = await openBrowser('probe-w4', () => ({ checksRun: 0, failures: 0 }));
const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
let alerted = false;
page.on('dialog', async d => { alerted = true; await d.dismiss(); });
await page.goto('file://' + REPO + 'index.html');
await page.waitForTimeout(300);

// §35: これは **renderer の安全性** を見るprobeであって、
// core の validation を見るものではない（core は合成値を通さない）。
// 評価結果を差し替えて、runtime由来の文字列が DOM をどう扱われるか確かめる。
// RF-29-01: renderer は表示の前に評価の形（状態は CLOSURE_STATUSES のどれか・件数と配列の長さが一致 等）を確かめる。
// 文字列が表示まで届くよう、攻撃文字列は自由文の欄（factKey・unit・scope・categoryId・slot key・照合 / Gate の状態）に置き、
// 状態の欄は正しい値にする。状態の欄に攻撃文字列を入れた評価は、別に「表示しない（fail closed）」ことを確かめる。
const out = await page.evaluate(() => {
  const ATTACK_IMG = '<img src=x onerror="window.__pwned=1">';
  const ATTACK_SCRIPT = '<script>window.__pwned2=1<\/script>';
  const fake = {
    projectId: ATTACK_IMG,
    status: 'BLOCKED',
    blockerKinds: [],
    requiredSlotCount: 1, readySlotCount: 0,
    categoryCount: 1, readyCategoryCount: 0,
    caseScopeCount: 1, readyCaseScopeCount: 0,
    factResults: [{
      slotKey: ATTACK_IMG, factKey: ATTACK_SCRIPT, scope: { floor: ATTACK_IMG },
      unit: ATTACK_SCRIPT, observationPresent: false, candidateValue: null,
      currentValue: null, evidenceGateStatus: ATTACK_IMG,
      evidenceGateReason: ATTACK_IMG,
      reconciliationApplicable: true, reconciliationStatus: ATTACK_SCRIPT,
      closureStatus: 'BLOCKED', blockerKinds: []
    }],
    categoryResults: [{ categoryId: ATTACK_IMG, status: 'BLOCKED',
      requiredSlotKeys: [ATTACK_IMG], blockedSlotKeys: [ATTACK_IMG] }],
    caseReadiness: [{ caseScope: ATTACK_IMG }], promotionCandidate: null
  };
  const saved = window.EvidenceClosure.evaluateClosure;
  window.EvidenceClosure = Object.assign({}, window.EvidenceClosure,
    { evaluateClosure: () => fake });
  renderEvidenceClosureMatrix();
  const host = document.getElementById('evidence-closure-area');
  const res = {
    imgCount: host.querySelectorAll('img').length,
    scriptCount: host.querySelectorAll('script').length,
    pwned: !!window.__pwned, pwned2: !!window.__pwned2,
    textHasRawImg: host.textContent.includes('<img src=x'),
    textHasRawScript: host.textContent.includes('<script>'),
    htmlHasLiveImg: /<img[^>]*onerror/i.test(host.innerHTML),
    summaryNormal: !document.getElementById('evidence-summary-closure').classList.contains('is-error')
  };
  // 状態の欄に攻撃文字列（CLOSURE_STATUSES に無い値）を入れた評価は表示しない（fail closed）。要素も攻撃文字列も出さない
  const invalid = JSON.parse(JSON.stringify(fake));
  invalid.factResults[0].closureStatus = ATTACK_IMG;
  invalid.categoryResults[0].status = ATTACK_SCRIPT;
  window.EvidenceClosure = Object.assign({}, window.EvidenceClosure, { evaluateClosure: () => invalid });
  renderEvidenceClosureMatrix();
  const summary = document.getElementById('evidence-summary-closure');
  res.invalid = {
    elements: host.querySelectorAll('img, script, table').length,
    attackText: host.textContent.includes('<img') || host.textContent.includes('<script') || summary.textContent.includes('<img'),
    warned: /表示できませんでした/.test(host.textContent) && summary.classList.contains('is-error'),
    pwned: !!window.__pwned || !!window.__pwned2
  };
  window.EvidenceClosure = Object.assign({}, window.EvidenceClosure, { evaluateClosure: saved });
  renderEvidenceClosureMatrix();
  return res;
});
await page.waitForTimeout(200);

const checks = [
  ['no <img> element created', out.imgCount === 0],
  ['no <script> element created', out.scriptCount === 0],
  ['onerror did not fire', out.pwned === false],
  ['inline script did not run', out.pwned2 === false],
  ['attack text rendered as literal text', out.textHasRawImg && out.textHasRawScript && out.summaryNormal],
  ['no live img markup in innerHTML', out.htmlHasLiveImg === false],
  ['invalid status values fail closed (no element, no attack text, failure shown)',
    out.invalid.elements === 0 && out.invalid.attackText === false && out.invalid.warned === true && out.invalid.pwned === false],
  ['no dialog raised', alerted === false],
  ['no page errors', pageErrors.length === 0]
];
let fail = 0;
for (const [name, ok] of checks) { if (!ok) fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); }
console.log(`\ninjection probe: ${checks.length - fail} pass / ${fail} fail`);
await browser.close();
finishRun('probe-w4', checks.length, fail, { playwrightSource });
