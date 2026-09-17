'use strict';

/**
 * Phase 2A: project-config/miyoshi.js のテスト。
 *
 * - calc.js に残る非推奨(deprecated)の後方互換定数と、
 *   project-config/miyoshi.js の値が完全に一致することを確認する
 *   （config分離が値のズレを生んでいないことの保証）。
 * - 各値のverificationStatusが実態どおりであることを確認する
 *   （2026-09-17 Provenance Required Fix時点）：
 *     - identity: "verified"（社内資料で確認済み。ただし公開repoでは
 *       disclosureStatus="redacted"とし、identity.publicLabelのみ開示）
 *     - wind.V0 / wind.roughnessCategory: "verified"
 *       （社内基本設計資料の外構風荷重条件で直接確認済み）
 *     - wind.status（positivePressureByFloor / negativePressureByZoneの
 *       各値を含む）: "partially_verified"のまま
 *       （V0/roughness自体の確認と、階別ガラス風圧プリセット値の元となる
 *       外装材/ガラス構造計算書・各階評価高さZとの対応付けの確認は別軸）
 *     - dimensions（defaultW / defaultH）: "unverified"のまま
 *   いずれも誤って想定より高いverificationStatusへ昇格・降格していないこと、
 *   および内部限定識別子（Drive/Notion等のURL）を含まないことを確認する。
 * - 代表ケース（FL6, W=1250/1500, H=2050, 2F, general, extraFactor=1.00）で、
 *   project-configの値をcalc.jsの汎用計算コアに渡した結果が、
 *   Phase 1時点の既知の値と完全に一致すること（config分離前後で
 *   計算値が不変であること）を回帰確認する。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const GlassCalc = require('../calc.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');

test('project-config: projectId/projectName が定義されている', () => {
  assert.equal(MiyoshiProjectConfig.projectId, 'miyoshi');
  assert.equal(typeof MiyoshiProjectConfig.projectName, 'string');
  assert.ok(MiyoshiProjectConfig.projectName.length > 0);
});

/* ============================================================
   Provenance / disclosure（2026-09-17 Provenance Required Fix）
   verificationStatus（社内で確認できているか）と disclosureStatus
   （公開リポジトリで何を開示するか）を分離して扱う。
============================================================ */

test('project-config: identity — 社内確認済み状態を表現でき、publicLabelは"みよし案件"、private固有名詞を要求しない構造', () => {
  const identity = MiyoshiProjectConfig.identity;
  assert.equal(identity.publicLabel, 'みよし案件');
  assert.equal(identity.verificationStatus, 'verified');
  assert.equal(identity.disclosureStatus, 'redacted');
  assert.equal(identity.evidence.level, 'primary');
  assert.equal(identity.evidence.checkedAt, '2026-09-17');
  assert.equal(typeof identity.evidence.publicDescription, 'string');
  assert.equal(typeof identity.evidence.privateReferenceAvailable, 'boolean');
  // identityの構造自体が、施主名・建物名称等のprivateな固有名詞フィールドを
  // 要求しないこと（publicLabel等の既知キーのみで完結する）。
  const allowedKeys = ['publicLabel', 'verificationStatus', 'disclosureStatus', 'evidence'];
  for (const key of Object.keys(identity)) {
    assert.ok(allowedKeys.indexOf(key) !== -1, `identityに想定外のキー ${key} が存在する`);
  }
  // evidence.publicDescription等に内部限定識別子（Drive URL/ファイルID等）を含まないこと
  const serialized = JSON.stringify(identity);
  assert.doesNotMatch(serialized, /drive\.google|docs\.google|notion\.(so|com)|sharepoint|dropbox\.com/i);
});

test('project-config: getPublicLabel() — disclosure-safeなidentity.publicLabelのみを返す（fail-closed）', () => {
  assert.equal(MiyoshiProjectConfig.getPublicLabel(), 'みよし案件');
  assert.equal(MiyoshiProjectConfig.getPublicLabel(), MiyoshiProjectConfig.identity.publicLabel);

  // publicLabelが欠落している場合、projectName等へフォールバックせず
  // 例外を投げること（公開UIの表示元をfail-closedにする境界の確認）。
  const saved = MiyoshiProjectConfig.identity.publicLabel;
  delete MiyoshiProjectConfig.identity.publicLabel;
  try {
    assert.throws(() => MiyoshiProjectConfig.getPublicLabel());
  } finally {
    MiyoshiProjectConfig.identity.publicLabel = saved;
  }
});

test('project-config: wind.V0 — 社内基本設計資料で直接確認済み（verified）、evidence.level=primary、checkedAt=2026-09-17', () => {
  const V0 = MiyoshiProjectConfig.wind.V0;
  assert.equal(V0.value, 34);
  assert.notEqual(V0.value, 32);
  assert.equal(V0.verificationStatus, 'verified');
  assert.equal(V0.evidence.level, 'primary');
  assert.equal(V0.evidence.checkedAt, '2026-09-17');
});

test('project-config: wind.roughnessCategory — 社内基本設計資料で直接確認済み（verified）、evidence.level=primary、checkedAt=2026-09-17', () => {
  const roughness = MiyoshiProjectConfig.wind.roughnessCategory;
  assert.equal(roughness.value, 'III');
  assert.equal(roughness.verificationStatus, 'verified');
  assert.equal(roughness.evidence.level, 'primary');
  assert.equal(roughness.evidence.checkedAt, '2026-09-17');
});

test('project-config: miyoshi configから現在と同じ正圧値を取得できる（calc.js旧定数との整合）', () => {
  const floors = ['1', '2', '3', 'R'];
  for (const f of floors) {
    assert.equal(
      MiyoshiProjectConfig.getPositivePressure(f),
      GlassCalc.POSITIVE_PRESSURE_MIYOSHI_PRESET[f],
      `floor=${f} の正圧値がcalc.jsの非推奨定数と一致しない`
    );
  }
  // 既知の値そのものも固定値で確認する
  assert.equal(MiyoshiProjectConfig.getPositivePressure('1'), 1297);
  assert.equal(MiyoshiProjectConfig.getPositivePressure('2'), 1525);
  assert.equal(MiyoshiProjectConfig.getPositivePressure('3'), 1695);
  assert.equal(MiyoshiProjectConfig.getPositivePressure('R'), 1729);
});

test('project-config: 同じ負圧値を取得できる（calc.js旧定数との整合）', () => {
  const zones = ['general', 'corner'];
  for (const z of zones) {
    assert.equal(
      MiyoshiProjectConfig.getNegativePressure(z),
      GlassCalc.NEGATIVE_PRESSURE_MIYOSHI_PRESET[z],
      `zone=${z} の負圧値がcalc.jsの非推奨定数と一致しない`
    );
  }
  assert.equal(MiyoshiProjectConfig.getNegativePressure('general'), 918);
  assert.equal(MiyoshiProjectConfig.getNegativePressure('corner'), 1122);
});

test('project-config: default W/H = 1250/2050（calc.js旧定数との整合）', () => {
  const dflt = MiyoshiProjectConfig.getDefaultDimensionsMM();
  assert.deepEqual(dflt, { W: 1250, H: 2050 });
  assert.deepEqual(dflt, GlassCalc.UNVERIFIED_DEFAULT_DIMENSIONS_MM);
});

test('project-config: dimensions.status = unverified（verifiedへ昇格していないこと）', () => {
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultW.verificationStatus, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultH.verificationStatus, 'unverified');
});

test('project-config: wind.status は verified ではない（元計算書・評価高さZは未確認）', () => {
  assert.notEqual(MiyoshiProjectConfig.wind.status, 'verified');
  assert.equal(MiyoshiProjectConfig.wind.status, 'partially_verified');
  for (const f of ['1', '2', '3', 'R']) {
    assert.notEqual(MiyoshiProjectConfig.wind.positivePressureByFloor[f].verificationStatus, 'verified');
  }
  for (const z of ['general', 'corner']) {
    assert.notEqual(MiyoshiProjectConfig.wind.negativePressureByZone[z].verificationStatus, 'verified');
  }
});

test('project-config: V0=34m/s（32m/sへの変更は行われていない）・roughnessCategory=III', () => {
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.notEqual(MiyoshiProjectConfig.wind.V0.value, 32);
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.value, 'III');
});

test('project-config: isFullyVerified() は現時点でfalse', () => {
  assert.equal(MiyoshiProjectConfig.isFullyVerified(), false);
});

/* ============================================================
   Evidence model（2026-09-17 Phase 2B）
   verificationStatus（値がどれだけ検証されているか）と
   evidence（根拠がどの程度あるか: 'primary'/'indirect'/'none'）を
   分離して扱う。verifiedへの昇格にはevidence.level==='primary'かつ
   evidence.checkedAtが必須（promotion guard）。
============================================================ */

test('Evidence: verified valueにはevidence.level==="primary"かつevidence.checkedAtが必須', () => {
  // 既存のverified値（identity, V0, roughnessCategory）はすべて条件を満たす。
  assert.equal(MiyoshiProjectConfig.identity.evidence.level, 'primary');
  assert.ok(MiyoshiProjectConfig.identity.evidence.checkedAt);
  assert.equal(MiyoshiProjectConfig.wind.V0.evidence.level, 'primary');
  assert.ok(MiyoshiProjectConfig.wind.V0.evidence.checkedAt);
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.evidence.level, 'primary');
  assert.ok(MiyoshiProjectConfig.wind.roughnessCategory.evidence.checkedAt);

  // promotion guardが直接呼び出しでも同じ規則を強制すること
  assert.doesNotThrow(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('verified', { level: 'primary', checkedAt: '2026-09-17' })
  );
  assert.throws(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('verified', { level: 'indirect', checkedAt: '2026-09-17' })
  );
  assert.throws(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('verified', { level: 'primary', checkedAt: null })
  );
  assert.throws(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('verified', null)
  );
});

test('Evidence: unverifiedなdimensionはprimary evidenceなしでも成立する', () => {
  const w = MiyoshiProjectConfig.dimensions.defaultW;
  const h = MiyoshiProjectConfig.dimensions.defaultH;
  assert.equal(w.verificationStatus, 'unverified');
  assert.notEqual(w.evidence.level, 'primary');
  assert.equal(w.evidence.level, 'none');
  assert.equal(h.verificationStatus, 'unverified');
  assert.notEqual(h.evidence.level, 'primary');
  assert.equal(h.evidence.level, 'indirect');
  // promotion guardはunverified+非primaryを許容する（例外を投げない）
  assert.doesNotThrow(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('unverified', w.evidence)
  );
  assert.doesNotThrow(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('unverified', h.evidence)
  );
});

test('Evidence: partially_verifiedな階別正圧・部位別負圧プリセットもevidenceを保持する', () => {
  for (const f of ['1', '2', '3', 'R']) {
    const entry = MiyoshiProjectConfig.wind.positivePressureByFloor[f];
    assert.equal(entry.verificationStatus, 'partially_verified');
    assert.notEqual(entry.evidence.level, 'primary');
    assert.equal(typeof entry.evidence.publicDescription, 'string');
  }
  for (const z of ['general', 'corner']) {
    const entry = MiyoshiProjectConfig.wind.negativePressureByZone[z];
    assert.equal(entry.verificationStatus, 'partially_verified');
    assert.notEqual(entry.evidence.level, 'primary');
    assert.equal(typeof entry.evidence.publicDescription, 'string');
  }
});

test('Evidence: validateAllEvidence() は現在のconfig全体でviolationsが0件', () => {
  const violations = MiyoshiProjectConfig.validateAllEvidence();
  assert.deepEqual(violations, []);
});

test('Evidence: dimensions.mode = "sample_default"（sample defaultとverified project caseの区別）', () => {
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
});

test('Evidence: verifiedCasesに架空のケースが存在しない（空配列のまま）', () => {
  assert.ok(Array.isArray(MiyoshiProjectConfig.verifiedCases));
  assert.equal(MiyoshiProjectConfig.verifiedCases.length, 0);
});

test('Evidence: 公開config全体にprivate URL/IDが混入しない', () => {
  // 関数プロパティを除いたconfig全体をシリアライズして検査する。
  const serialized = JSON.stringify(MiyoshiProjectConfig, (key, val) =>
    typeof val === 'function' ? undefined : val
  );
  assert.doesNotMatch(serialized, /drive\.google|docs\.google|notion\.(so|com)|sharepoint|dropbox\.com/i);
  assert.doesNotMatch(serialized, /file_?id|folder_?id/i);
});

/* ============================================================
   代表ケース回帰テスト：config分離前後で計算値が不変であることの確認
   （project-configの値をcalc.jsの汎用計算コアへ渡した結果が、
    Phase 1時点の既知の値と一致すること）
============================================================ */

test('代表ケース: FL6 W=1250/H=2050/2F/general/extraFactor=1.00 → ≈1756.09756 N/m²・designP=1525・OK', () => {
  const W = 1250, H = 2050;
  const area = (W * H) / 1_000_000;
  const posP = MiyoshiProjectConfig.getPositivePressure('2');
  const negP = MiyoshiProjectConfig.getNegativePressure('general');
  const designP = Math.max(posP, negP);
  assert.equal(designP, 1525);

  const k1 = GlassCalc.getK1_FL(6);
  const P = GlassCalc.calcP_single(6, k1, 1.0, area, 1.0);
  assert.ok(Math.abs(P - 1756.09756097561) < 1e-6, `P=${P}`);
  assert.ok(P >= designP, 'OKと判定されるはず');

  // generateCandidates経由でも同じ値・同じ判定になることを確認
  const candidates = GlassCalc.generateCandidates('fl_single', area, designP, 1.0);
  const fl6 = candidates.find(c => c.label === 'FL6');
  assert.ok(fl6, 'FL6候補が存在するはず');
  assert.ok(Math.abs(fl6.P - 1756.09756097561) < 1e-6);
  assert.equal(fl6.status, 'ok');
});

test('代表ケース: FL6 W=1500/H=2050/2F/general/extraFactor=1.00 → ≈1463.41463 N/m²・designP=1525・NG', () => {
  const W = 1500, H = 2050;
  const area = (W * H) / 1_000_000;
  const posP = MiyoshiProjectConfig.getPositivePressure('2');
  const negP = MiyoshiProjectConfig.getNegativePressure('general');
  const designP = Math.max(posP, negP);
  assert.equal(designP, 1525);

  const k1 = GlassCalc.getK1_FL(6);
  const P = GlassCalc.calcP_single(6, k1, 1.0, area, 1.0);
  assert.ok(Math.abs(P - 1463.4146341463415) < 1e-6, `P=${P}`);
  assert.ok(P < designP, 'NGと判定されるはず');

  const candidates = GlassCalc.generateCandidates('fl_single', area, designP, 1.0);
  const fl6 = candidates.find(c => c.label === 'FL6');
  assert.ok(fl6, 'FL6候補が存在するはず');
  assert.ok(Math.abs(fl6.P - 1463.4146341463415) < 1e-6);
  assert.equal(fl6.status, 'ng');
});
