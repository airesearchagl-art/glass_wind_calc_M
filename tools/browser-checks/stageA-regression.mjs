import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
let pass=0, fail=0; const out=[];
const ck=(id,c,d)=>{ if(c){pass++;out.push(`  ok   ${id}  ${d??''}`);} else {fail++;out.push(`  FAIL ${id}  ${d??''}`);} };

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors=[], pageErrors=[], requests=[];
page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()); });
page.on('pageerror', e=>pageErrors.push(e.message));
page.on('request', r=>{ if(!r.url().startsWith('file://')) requests.push(r.url()); });
await page.goto('file:///home/user/glass_wind_calc_m/index.html');
await page.waitForTimeout(400);

// existing feature surfaces still present and wired
const surfaces = await page.evaluate(() => ({
  modes: [...document.getElementById('inp-mode').options].map(o=>o.value),
  batch: !!document.querySelector('[id*="batch"]'),
  profile: !!document.querySelector('[id*="profile"]'),
  scenario: !!document.querySelector('[id*="scenario"]'),
  review: !!document.getElementById('review-report'),
  evidence: !!document.getElementById('evidence-status-table'),
  closure: !!document.getElementById('evidence-closure-area'),
  globals: {
    GlassCalc: typeof window.GlassCalc === 'object',
    WorkspaceCore: typeof window.WorkspaceCore === 'object',
    ProjectProfile: typeof window.ProjectProfile === 'object',
    ReviewPackage: typeof window.ReviewPackage === 'object',
    EvidenceClosure: typeof window.EvidenceClosure === 'object'
  }
}));
ck('A-surfaces', surfaces.batch&&surfaces.profile&&surfaces.scenario&&surfaces.review&&surfaces.evidence&&surfaces.closure,
   'batch/profile/scenario/review/evidence/closure all present');
ck('A-globals', Object.values(surfaces.globals).every(Boolean), JSON.stringify(surfaces.globals));
ck('A-modes', surfaces.modes.length >= 3, 'modes=' + surfaces.modes.join(','));

// §34 precursor: other UI inputs must not change closure (Stage A evidence)
const before = await page.evaluate(() => {
  const r = EvidenceClosure.evaluateClosure(MiyoshiProjectConfig.projectId, []);
  return [r.status, r.readySlotCount, r.readyCategoryCount, r.readyCaseScopeCount, r.promotionCandidate];
});
await page.evaluate(async () => {
  const set = (id,v) => { const el=document.getElementById(id); if(el){ el.value=v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); } };
  set('inp-w','1500'); set('inp-h','2400');
  const btn=[...document.querySelectorAll('button')].find(b=>/計算|Calculate/.test(b.textContent));
  if(btn) btn.click();
  await new Promise(r=>setTimeout(r,250));
});
const after = await page.evaluate(() => {
  const r = EvidenceClosure.evaluateClosure(MiyoshiProjectConfig.projectId, []);
  return [r.status, r.readySlotCount, r.readyCategoryCount, r.readyCaseScopeCount, r.promotionCandidate];
});
ck('A-closure-immune', JSON.stringify(before)===JSON.stringify(after),
   `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);

// calculator still produces output after all interaction
const calc = await page.evaluate(() => {
  const g = window.GlassCalc;
  return g.calcP_notification(6, g.getK1_FL(6), 1.0, (1250*2050)/1e6);
});
ck('A-calc', Math.abs(calc-1756.09756097561)<1e-9, 'FL6 1250x2050 = '+calc);

ck('A-pageErrors', pageErrors.length===0, `${pageErrors.length} ${pageErrors[0]||''}`);
ck('A-consoleErrors', consoleErrors.length===0, `${consoleErrors.length} ${consoleErrors[0]||''}`);
ck('A-network', requests.length===0, `non-file requests=${requests.length}`);
const st = await page.evaluate(()=>{ try{return {l:localStorage.length,s:sessionStorage.length,c:document.cookie.length};}catch(e){return{l:-1,s:-1,c:-1};} });
ck('A-storage', st.l===0&&st.s===0&&st.c===0, JSON.stringify(st));

const facts = await page.evaluate(()=>({
  vc: MiyoshiProjectConfig.verifiedCases.length, mode: MiyoshiProjectConfig.dimensions.mode,
  w: MiyoshiProjectConfig.dimensions.defaultW.value, h: MiyoshiProjectConfig.dimensions.defaultH.value,
  v0: MiyoshiProjectConfig.wind.V0.value, r: MiyoshiProjectConfig.wind.roughnessCategory.value }));
ck('A-facts', facts.vc===0&&facts.mode==='sample_default'&&facts.w===1250&&facts.h===2050&&facts.v0===34&&facts.r==='III',
   JSON.stringify(facts));

console.log(out.join('\n'));
console.log(`\nStage A extended regression: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail?1:0);
