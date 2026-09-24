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
await page.goto('file://' + REPO + 'index.html');
await page.waitForTimeout(300);

// §38: evaluateClosure を投げさせる。期待は「見える警告」であって
// 空欄でも "0 blockers" でも "Verified" でもない。
const out = await page.evaluate(() => {
  window.EvidenceClosure = Object.assign({}, window.EvidenceClosure, {
    evaluateClosure: () => { throw new Error('forced closure failure'); }
  });
  renderEvidenceClosureMatrix();
  const host = document.getElementById('evidence-closure-area');
  return {
    text: host.textContent.trim(),
    blank: host.textContent.trim().length === 0,
    hasMatrix: !!document.getElementById('evidence-closure-matrix'),
    // 他パネルが巻き添えで消えていないこと（独立guard）
    statusPanel: !!document.getElementById('evidence-status-table').textContent.trim(),
    reconPanel: !!document.getElementById('reconciliation-area').textContent.trim(),
    // 計算機能が止まっていないこと
    calcAlive: !!(window.GlassCalc && typeof window.GlassCalc.calcP_notification === 'function')
  };
});

const checks = [
  ['area is not blank', out.blank === false],
  ['warning is visible', /表示できませんでした/.test(out.text)],
  ['warns against reading absence as verified', /検証済み.{0,20}解釈/.test(out.text)],
  ['no matrix table rendered as if normal', out.hasMatrix === false],
  ['does not claim zero blockers', !/0\s*\/\s*0|blockers?\s*:\s*0/.test(out.text)],
  ['does not say Verified', !/Verified|検証済みです|承認済み/.test(out.text.replace(/検証済み」と解釈/g,''))],
  ['Phase 2F status panel survived', out.statusPanel === true],
  ['Phase 2F reconciliation panel survived', out.reconPanel === true],
  ['calculator still alive', out.calcAlive === true],
  ['no uncaught page errors', pageErrors.length === 0]
];
let fail = 0;
for (const [n, ok] of checks) { if (!ok) fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}`); }
console.log(`\nfail-open check: ${checks.length - fail} pass / ${fail} fail`);
console.log(`warning text: ${out.text.slice(0, 90)}`);
await browser.close();
process.exit(fail ? 1 : 0);
