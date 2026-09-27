// Playwright is resolved, not hardcoded (P2K-F06). See harness.mjs: a failed
// resolve reports UNVERIFIED and exits 3, never FAIL's exit 1.
import { openBrowser, finishRun } from './harness.mjs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
// リポジトルートは**このファイルの位置から**求める。
// 絶対パスを埋め込むと、harness は自分が入っている tree ではなく
// **そのパスにある tree** を測る。独立検証8 F8-04 は、tag guard を
// `return false;` にした copy で parser-boundary がなお「bypass 0」と
// 報告することを実証した——欠陥を原理的に検出できない形だった。
const REPO = fileURLToPath(new URL('../../', import.meta.url));

const require = createRequire(import.meta.url);
const E = require(REPO + 'project-config/evidence.js');
const guardRejects = t => { try { E.assertPublicSafeEvidenceText(t,'d'); return false; } catch { return true; } };

const FORMS = [
  '<img src=x onerror=alert(1)>', '<img'+' '.repeat(310)+'src=x onerror=alert(1)>',
  '<img: onclick=alert(1)>', '<a_ onmouseover=alert(1)>', '<img. onclick=alert(1)>',
  '<img! onclick=alert(1)>', '<img= onclick=alert(1)>', '<img​ onclick=alert(1)>',
  '<img onclick=alert(1)>', '<img　onclick=alert(1)>', '<svg onload=alert(1)>',
  '<img onerror=alert(1<2)>', '<td nowrap>', '<a+ href=x>', '<İmg onclick=1>',
  // expected NOT to create elements:
  '<img src=x onerror=alert(1)', '< img src=x>', '</ img>', '</1img>',
  '＜img onerror=alert(1)＞', '<', '<<<', '>>>', '3 < 5', '5<Z<40 の範囲',
  'W < H かつ P > Q', '見付幅W<見付高さH となる場合>注意',
  // review 6 F2/F4: classes the earlier sweep excluded
  '<1<img src=x onerror=alert(1)>', '<<img src=x onerror=alert(1)>', '<1<a href=x>y</a>',
  '<//a>', '</ >', '<!>', '</Aimg>', '</img src=x onerror=alert(1)>', '</<img>',
  '<img src="x>', '<img src="x>y', '</img>', '<! <img src=x>',
  'たわみδ<Dmaxかつ設計風圧力P>Pa', '見付幅W<Hとなる場合、P>Qで検討する'
];

const { chromium, playwrightSource } = await openBrowser('parser-boundary');
const b = await chromium.launch();
const pg = await b.newPage();
await pg.goto('about:blank');
let agree = 0, bypasses = [], overRejections = [];
for (const f of FORMS) {
  // div 文脈だけでは不十分: `<td>` 等は tree construction で落とされるので
  // 「要素 0 個だからタグでない」とは言えない。table 文脈でも測る。
  const n = await pg.evaluate((html) => {
    const d = document.createElement('div');
    d.innerHTML = html;
    const t = document.createElement('table');
    t.innerHTML = '<tbody><tr>' + html;
    return Math.max(d.querySelectorAll('*').length,
                    t.querySelectorAll('*').length - t.querySelectorAll('tbody,tr').length);
  }, f);
  const rejected = guardRejects(f);
  const isElement = n > 0;
  const label = f.length > 44 ? f.slice(0,44)+'…' : f;
  if (rejected === isElement) agree++;
  else if (!rejected && isElement) bypasses.push({ f: label, elements: n });
  else overRejections.push({ f: label });
}
console.log('forms measured   : ' + FORMS.length);
console.log('exact agreement  : ' + agree + '/' + FORMS.length);
console.log('BYPASSES (accept but Chromium makes an element): ' + bypasses.length + '  <- must be 0');
bypasses.forEach(d => console.log('   !! ' + JSON.stringify(d)));
console.log('over-rejections (reject but 0 elements)        : ' + overRejections.length + '  <- fail-closed, allowed');
overRejections.forEach(d => console.log('      ' + d.f));
await b.close();
// A bypass is a failure; an over-rejection is fail-closed and allowed, so it is
// reported but not counted as one. checksRun is the number of forms measured,
// so a silent drop to zero forms classifies ERROR instead of PASS.
finishRun('parser-boundary', FORMS.length, bypasses.length,
  { playwrightSource, overRejections: overRejections.length });
