import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const FILE = 'file:///home/user/glass_wind_calc_m/index.html';
let pass = 0, fail = 0;
const results = [];
function check(id, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${id}  ${detail ?? ''}`); }
  else { fail++; results.push(`  FAIL ${id}  ${detail ?? ''}`); }
}

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
const mode = await page.evaluate(() => document.getElementById('inp-mode').value);
const visible = async () => page.evaluate(() => {
  const el = document.getElementById('evidence-closure-area');
  if (!el) return false;
  const block = el.closest('.mode-field-miyoshi');
  // 包含されていなければ false を返す（例外で落ちると harness の異常終了が
  // 「検出できた」と誤読される。実際に U4-13 でそれが起きた）。
  if (!block) return false;
  return !!el.textContent.trim() && block.style.display !== 'none';
});
check('B2', mode === 'miyoshi' && await visible(), `mode=${mode}`);

// header numbers
const head = await page.evaluate(() => {
  const t = document.getElementById('evidence-closure-area').textContent;
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
  const trs = [...tb.querySelectorAll('tr')].slice(1);
  return trs.map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()));
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
    const block = el ? el.closest('.mode-field-miyoshi') : null;
    if (!block) return 'not-contained';   // 例外にせず、検出可能な失敗として返す
    return block.style.display === 'none';
  }, m);
  check(id, ok === true || ok === 'absent', `${m}: ${ok}`);
}
await page.evaluate(() => {
  const sel = document.getElementById('inp-mode');
  sel.value = 'miyoshi'; sel.dispatchEvent(new Event('change'));
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

// project facts unchanged after UI interaction
const facts = await page.evaluate(() => ({
  verifiedCases: MiyoshiProjectConfig.verifiedCases.length,
  mode: MiyoshiProjectConfig.dimensions.mode,
  w: MiyoshiProjectConfig.dimensions.defaultW.value,
  h: MiyoshiProjectConfig.dimensions.defaultH.value,
  v0: MiyoshiProjectConfig.wind.V0.value,
  rough: MiyoshiProjectConfig.wind.roughnessCategory.value
}));
check('B-facts', facts.verifiedCases === 0 && facts.mode === 'sample_default' &&
  facts.w === 1250 && facts.h === 2050 && facts.v0 === 34 && facts.rough === 'III',
  JSON.stringify(facts));

console.log(results.join('\n'));
console.log(`\nbrowser: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
