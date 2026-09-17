'use strict';

/**
 * known-answer tests: 平成12年建設省告示第1458号
 *   P = (300 × k1 × k2 / A) × (t + t²/4)
 *
 * すべて A = 1.0 m2 を基準ケースとして固定値検証する。
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calcP_notification,
  calcP_single,
  calcK2_IGU,
  calcP_IGU,
  getK1_FL,
  K1_TP,
  IGU_APPLICABLE_RATIO_MAX
} = require('../calc.js');

const AREA = 1.0;

test('FL6: 必須ケース（k1=1.0, k2=1.0, A=1.0） P = 4500 N/m2', () => {
  assert.equal(calcP_notification(6, 1.0, 1.0, AREA), 4500);
});

test('FL5: k1=1.0（t<=8mm） P = 3375 N/m2', () => {
  const k1 = getK1_FL(5);
  assert.equal(k1, 1.0);
  assert.equal(calcP_notification(5, k1, 1.0, AREA), 3375);
});

test('FL8: k1=1.0（t<=8mm境界） P = 7200 N/m2', () => {
  const k1 = getK1_FL(8);
  assert.equal(k1, 1.0);
  assert.equal(calcP_notification(8, k1, 1.0, AREA), 7200);
});

test('FL10: k1=0.9（8<t<=12mm） P = 9450 N/m2', () => {
  const k1 = getK1_FL(10);
  assert.equal(k1, 0.9);
  assert.equal(calcP_notification(10, k1, 1.0, AREA), 9450);
});

test('FL12: k1=0.9（8<t<=12mm境界） P = 12960 N/m2', () => {
  const k1 = getK1_FL(12);
  assert.equal(k1, 0.9);
  assert.equal(calcP_notification(12, k1, 1.0, AREA), 12960);
});

test('TP8: 強化ガラス k1=3.5 固定 P = 25200 N/m2', () => {
  assert.equal(calcP_notification(8, K1_TP, 1.0, AREA), 25200);
});

test('同厚複層 FL6+A+FL6: k2=1.5, P_outer=P_inner=6750 N/m2', () => {
  const k2 = calcK2_IGU(6, 6);
  assert.equal(k2, 1.5);
  const r = calcP_IGU(6, 6, 1.0, 1.0, AREA, 1.0);
  assert.equal(r.P_outer, 6750);
  assert.equal(r.P_inner, 6750);
  assert.equal(Math.min(r.P_outer, r.P_inner), 6750);
});

test('異厚複層 FL5+A+FL8: 内側(FL8)が支配し P_IGU ≈ 6718.359375 N/m2', () => {
  const r = calcP_IGU(5, 8, 1.0, 1.0, AREA, 1.0);
  assert.ok(Math.abs(r.P_outer - 12899.25) < 1e-6, `P_outer=${r.P_outer}`);
  assert.ok(Math.abs(r.P_inner - 6718.359375) < 1e-6, `P_inner=${r.P_inner}`);
  assert.equal(Math.min(r.P_outer, r.P_inner), r.P_inner);
  assert.equal(r.outOfScope, false);
});

test('複層の適用範囲：厚板/薄板 = 2.5 ちょうどは範囲内（板硝子協会計算法）', () => {
  const r = calcP_IGU(6, 15, 1.0, 0.8, AREA, 1.0); // 15/6 = 2.5
  assert.equal(r.rawRatio, 2.5);
  assert.equal(r.outOfScope, false);
});

test('複層の適用範囲：厚板/薄板 > 2.5 は適用範囲外としてフラグが立つ', () => {
  const r = calcP_IGU(5, 15, 1.0, 0.8, AREA, 1.0); // 15/5 = 3.0
  assert.equal(r.rawRatio, 3.0);
  assert.equal(r.outOfScope, true);
  assert.ok(IGU_APPLICABLE_RATIO_MAX < r.rawRatio);
});

test('告示外の追加低減係数（extraFactor）は告示式と分離されている（既定1.0）', () => {
  const base = calcP_notification(6, 1.0, 1.0, AREA);
  assert.equal(calcP_single(6, 1.0, 1.0, AREA), base); // 省略時は1.0
  assert.equal(calcP_single(6, 1.0, 1.0, AREA, 1.0), base);
  assert.equal(calcP_single(6, 1.0, 1.0, AREA, 0.9), base * 0.9);
});

test('回帰確認：旧式(t²)ではなく告示式(t + t²/4)であること', () => {
  const t = 6, k1 = 1.0, k2 = 1.0, area = 1.0;
  const correct = calcP_notification(t, k1, k2, area);
  const oldFormulaResult = (300 * k1 * k2 / area) * (t * t); // 是正前の誤った式
  assert.equal(correct, 4500);
  assert.notEqual(correct, oldFormulaResult);
  assert.ok(correct < oldFormulaResult, '是正前は許容耐力を過大評価していた（安全側ではない）');
});
