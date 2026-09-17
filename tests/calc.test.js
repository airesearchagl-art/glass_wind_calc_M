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
  getK1_TP,
  K1_TP,
  K1_TP_SUPPORTED_THICKNESSES_MM,
  IGU_APPLICABLE_RATIO_MAX,
  POSITIVE_PRESSURE_MIYOSHI_PRESET,
  UNVERIFIED_DEFAULT_DIMENSIONS_MM,
  STRENGTH_TYPES,
  generateCandidates
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

/* ============================================================
   案件代表寸法による感度テスト（H=2050mm固定、FL6）
   W=1250 / 1400 / 1500 / 1550mm で面積増加に伴い許容耐風圧が
   単調に低下することを確認する。1250×2050mm自体は
   UNVERIFIED PROJECT DEFAULT（リポジトリ履歴上、算定根拠の記載なし）
   であり、案件確定寸法ではない点に注意。
============================================================ */

test('UNVERIFIED PROJECT DEFAULT: 既定寸法は1250×2050mmのまま（変更検知用の回帰）', () => {
  assert.deepEqual(UNVERIFIED_DEFAULT_DIMENSIONS_MM, { W: 1250, H: 2050 });
});

test('寸法感度: FL6 W=1250/H=2050 ≈ 1756 N/m²', () => {
  const area = (1250 * 2050) / 1_000_000;
  const P = calcP_notification(6, getK1_FL(6), 1.0, area);
  assert.ok(Math.abs(P - 1756.09756097561) < 1e-6, `P=${P}`);
});

test('寸法感度: FL6 W=1500/H=2050 ≈ 1463 N/m²', () => {
  const area = (1500 * 2050) / 1_000_000;
  const P = calcP_notification(6, getK1_FL(6), 1.0, area);
  assert.ok(Math.abs(P - 1463.4146341463415) < 1e-6, `P=${P}`);
});

test('寸法感度: FL6はH=2050mm固定でW増加に伴い単調に低下する（W=1250/1400/1500/1550）', () => {
  const widths = [1250, 1400, 1500, 1550];
  const H = 2050;
  const values = widths.map(W => {
    const area = (W * H) / 1_000_000;
    return calcP_notification(6, getK1_FL(6), 1.0, area);
  });
  for (let i = 1; i < values.length; i++) {
    assert.ok(values[i] < values[i - 1], `W=${widths[i]}の値(${values[i]})はW=${widths[i - 1]}の値(${values[i - 1]})より小さいはず`);
  }
});

test('寸法感度・境界回帰: 2階プリセット設計風圧に対しW=1250はOK、W=1500はNGに反転する', () => {
  const H = 2050;
  const designP = POSITIVE_PRESSURE_MIYOSHI_PRESET['2']; // 1525 N/m²
  const area1250 = (1250 * H) / 1_000_000;
  const area1500 = (1500 * H) / 1_000_000;
  const P1250 = calcP_notification(6, getK1_FL(6), 1.0, area1250);
  const P1500 = calcP_notification(6, getK1_FL(6), 1.0, area1500);
  assert.ok(P1250 >= designP, `W=1250: P=${P1250} は設計風圧${designP}以上のはず（OK）`);
  assert.ok(P1500 < designP, `W=1500: P=${P1500} は設計風圧${designP}未満のはず（NG）`);
});

/* ============================================================
   TP（強化ガラス）候補厚の適用範囲テスト
   板硝子協会「4辺支持板ガラスの耐風圧強度計算法」表2.2.1では、
   強化ガラス k1=3.5 の呼び厚は 4,5,6,8,10,12,15mm のみで、
   19mmはこの表に含まれない。TP19を自動候補・OK判定してはならない。
============================================================ */

test('TP thicknessList に 19 が存在しない', () => {
  assert.deepEqual(STRENGTH_TYPES.TP.thicknessList, [5, 6, 8, 10, 12, 15]);
  assert.ok(STRENGTH_TYPES.TP.thicknessList.indexOf(19) === -1);
});

test('generateCandidates("tp_single", ...) に label === "TP19" が存在しない', () => {
  // designP を極端に低く設定し、19mmが候補リストに含まれていれば
  // 必ずOK候補として出現するはずの条件で確認する。
  const candidates = generateCandidates('tp_single', 1.0, 1, 1.0);
  const labels = candidates.map(c => c.label);
  assert.ok(labels.indexOf('TP19') === -1, `候補一覧にTP19が含まれてはならない: ${labels.join(', ')}`);
});

test('TP15は候補として存在し k1=3.5', () => {
  const candidates = generateCandidates('tp_single', 1.0, 1, 1.0);
  const tp15 = candidates.find(c => c.label === 'TP15');
  assert.ok(tp15, 'TP15が候補に存在するはず');
  assert.equal(tp15.detail.k1, 3.5);
});

test('TP候補の板厚下限はツール仕様どおり5mm（4mmは協会表には含まれるが自動候補には含まれない）', () => {
  const candidates = generateCandidates('tp_single', 1.0, 1, 1.0);
  const labels = candidates.map(c => c.label);
  assert.ok(labels.indexOf('TP4') === -1, '本ツールの自動候補にTP4は含まれない仕様');
  assert.ok(labels.indexOf('TP5') !== -1, 'TP5は自動候補の下限として存在するはず');
  // 協会表そのもの（K1_TP_SUPPORTED_THICKNESSES_MM）には4mmが含まれ、
  // getK1_TP(4) は k1=3.5 を返す（ツールの候補範囲とは別軸であることの確認）。
  assert.ok(K1_TP_SUPPORTED_THICKNESSES_MM.indexOf(4) !== -1);
  assert.equal(getK1_TP(4), 3.5);
});

test('getK1_TP: 板硝子協会表2.2.1の範囲外（19mm等）はk1=3.5を無条件に返さない', () => {
  assert.ok(Number.isNaN(getK1_TP(19)), '19mmはk1=3.5をそのまま適用できないためNaNを返すべき');
  assert.equal(getK1_TP(15), 3.5);
  assert.equal(K1_TP, 3.5); // K1_TP定数自体は変更されていないことの確認
});

test('FL19は従来どおり候補として残る（TP修正がFL候補へ波及していない）', () => {
  assert.deepEqual(STRENGTH_TYPES.FL.thicknessList, [5, 6, 8, 10, 12, 15, 19]);
  const candidates = generateCandidates('fl_single', 1.0, 1, 1.0);
  const labels = candidates.map(c => c.label);
  assert.ok(labels.indexOf('FL19') !== -1, 'FL19は従来どおり候補に存在するはず');
});
