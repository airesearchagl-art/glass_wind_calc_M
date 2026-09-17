'use strict';

/**
 * Phase 2A: project-config/miyoshi.js のテスト。
 *
 * - calc.js に残る非推奨(deprecated)の後方互換定数と、
 *   project-config/miyoshi.js の値が完全に一致することを確認する
 *   （config分離が値のズレを生んでいないことの保証）。
 * - dimensions/wind の verificationStatus が誤って "verified" に
 *   昇格していないことを確認する。
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

test('project-config: 案件識別情報(identity)はverifiedへ昇格していない', () => {
  assert.notEqual(MiyoshiProjectConfig.identity.status, 'verified');
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
