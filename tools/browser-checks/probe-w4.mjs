import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { fileURLToPath } from 'url';
// リポジトルートは**このファイルの位置から**求める。
// 絶対パスを埋め込むと、harness は自分が入っている tree ではなく
// **そのパスにある tree** を測る。独立検証8 F8-04 は、tag guard を
// `return false;` にした copy で parser-boundary がなお「bypass 0」と
// 報告することを実証した——欠陥を原理的に検出できない形だった。
const REPO = fileURLToPath(new URL('../../', import.meta.url));

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
      currentValue: null, evidenceGateStatus: 'FAIL',
      evidenceGateReason: ATTACK_IMG,
      reconciliationApplicable: true, reconciliationStatus: ATTACK_SCRIPT,
      closureStatus: ATTACK_IMG, blockerKinds: []
    }],
    categoryResults: [{ categoryId: ATTACK_IMG, status: ATTACK_SCRIPT,
      requiredSlotKeys: [ATTACK_IMG], blockedSlotKeys: [ATTACK_IMG] }],
    caseReadiness: [], promotionCandidate: null
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
    htmlHasLiveImg: /<img[^>]*onerror/i.test(host.innerHTML)
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
  ['attack text rendered as literal text', out.textHasRawImg && out.textHasRawScript],
  ['no live img markup in innerHTML', out.htmlHasLiveImg === false],
  ['no dialog raised', alerted === false],
  ['no page errors', pageErrors.length === 0]
];
let fail = 0;
for (const [name, ok] of checks) { if (!ok) fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}`); }
console.log(`\ninjection probe: ${checks.length - fail} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
