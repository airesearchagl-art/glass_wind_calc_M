// Playwright is resolved, not hardcoded (P2K-F06). See harness.mjs: a failed
// resolve reports UNVERIFIED and exits 3, never FAIL's exit 1.
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

// A-facts の期待値は page の外で求める（Node 側の runtime default built-in と、tree から読まない
// verification-spec.json の evidenceStateExpected）。page 側は active ProjectContext から読む。
const Registry = require(REPO + 'project-config/registry.js');
const BUILT_IN = Registry.getBuiltInPreset(Registry.getRuntimeDefaultBuiltInPresetId());
const NODE_FACTS = { vc: BUILT_IN.verifiedCases.length, mode: BUILT_IN.dimensions.mode,
  w: BUILT_IN.dimensions.defaultW.value, h: BUILT_IN.dimensions.defaultH.value,
  v0: BUILT_IN.wind.V0.value, r: BUILT_IN.wind.roughnessCategory.value };
const SPEC = JSON.parse(fs.readFileSync(REPO + 'tools/verification/verification-spec.json', 'utf8')).evidenceStateExpected;
const SPEC_FACTS = { vc: SPEC.project.verifiedCaseCount, mode: SPEC.preset.dimensions.mode,
  w: SPEC.preset.dimensions.widthMm, h: SPEC.preset.dimensions.heightMm,
  v0: SPEC.preset.wind.V0, r: SPEC.preset.wind.roughnessCategory };

let pass=0, fail=0; const out=[];
const ck=(id,c,d)=>{ if(c){pass++;out.push(`  ok   ${id}  ${d??''}`);} else {fail++;out.push(`  FAIL ${id}  ${d??''}`);} };

const { chromium, playwrightSource } = await openBrowser('stageA-regression', () => ({ checksRun: pass + fail, failures: fail }));
const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors=[], pageErrors=[], requests=[];
page.on('console', m=>{ if(m.type()==='error') consoleErrors.push(m.text()); });
page.on('pageerror', e=>pageErrors.push(e.message));
page.on('request', r=>{ if(!r.url().startsWith('file://')) requests.push(r.url()); });
await page.goto('file://' + REPO + 'index.html');
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
// closure の対象は runtime と同じ active ProjectContext の built-in。context が無ければ null（不一致扱い）。
const closureNow = () => page.evaluate(() => {
  if (typeof activeProjectContext === 'undefined' || !activeProjectContext) return null;
  const r = EvidenceClosure.evaluateClosure(activeProjectContext.origin.registryProjectId, []);
  return [r.status, r.readySlotCount, r.readyCategoryCount, r.readyCaseScopeCount, r.promotionCandidate];
});
const before = await closureNow();
await page.evaluate(async () => {
  const set = (id,v) => { const el=document.getElementById(id); if(el){ el.value=v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); } };
  set('inp-w','1500'); set('inp-h','2400');
  const btn=[...document.querySelectorAll('button')].find(b=>/計算|Calculate/.test(b.textContent));
  if(btn) btn.click();
  await new Promise(r=>setTimeout(r,250));
});
const after = await closureNow();
ck('A-closure-immune', before !== null && JSON.stringify(before)===JSON.stringify(after),
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

const facts = await page.evaluate(()=>{
  try {
    const be = ProjectContext.requireCapability(activeProjectContext, 'builtInEvidence');
    const dims = ProjectContext.requireCapability(activeProjectContext, 'sampleDefaultDimensions');
    const value = (k) => { const f = be.fields.find((x) => x.fieldKey === k); return f ? f.value : null; };
    return { vc: be.verifiedCases.length, mode: dims.mode, w: dims.widthMm.value, h: dims.heightMm.value,
      v0: value('wind.V0'), r: value('wind.roughnessCategory') };
  } catch (e) { return { error: String(e && e.message || e) }; }
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ck('A-facts', same(facts, NODE_FACTS) && same(NODE_FACTS, SPEC_FACTS),
   `page=${JSON.stringify(facts)} page==node:${same(facts, NODE_FACTS)} node==spec:${same(NODE_FACTS, SPEC_FACTS)}`);

console.log(out.join('\n'));
console.log(`\nStage A extended regression: ${pass} pass / ${fail} fail`);
await browser.close();
finishRun('stageA-regression', pass + fail, fail, { playwrightSource });
