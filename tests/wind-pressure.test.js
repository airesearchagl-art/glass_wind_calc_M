'use strict';

/**
 * Phase 2E: Wind Pressure Trace Engine
 *
 * 採用根拠は .agent-run/LR-20260919-GLASS-P2E/EVIDENCE.md §4。
 * provenance: human_supplied_primary_evidence
 *   （Humanが本実行環境の外部で一次資料に対し独立に確認した内容。
 *     本実行環境が当該文書を取得したわけではない。）
 *
 * 丸めを挟まない厳密値で固定する（AC-03 / AC-14）。
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const W = require('../wind-pressure.js');

/** 浮動小数比較。式の同値変形による末尾差のみ許容する。 */
function approx(actual, expected, msg) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    (msg || '') + ' expected ≈ ' + expected + ', got ' + actual
  );
}

/** 有効な入力の雛形。個別testで必要な項目だけ上書きする。 */
function baseInput(overrides) {
  return Object.assign({
    V0: 34,
    roughnessCategory: 'III',
    buildingHeightM: 14.2,
    eavesHeightM: 14.2,
    evaluationHeightM: 10,
    buildingType: 'closed',
    zone: 'general',
    basis: 'notification_baseline'
  }, overrides || {});
}

/* ============================================================
   AC-14 known-answer（EVIDENCE.md §4.7）
   Human提供Evidenceの供給値を厳密値で固定する。
============================================================ */

test('AC-14 known-answer: roughness III / V0=34 / H=14.2 / y=1.00 の Er と qBar', () => {
  const er = W.calcEr(14.2, 5, 450, 0.20);
  assert.equal(er.HPrime, 14.2);
  assert.equal(er.clampedToZb, false);
  assert.equal(er.Er, 0.8516557589672942, 'Er は供給値とビット等価であること');

  const qBar = W.calcMeanVelocityPressure(er.Er, 34, 1.00);
  assert.equal(qBar, 503.08024004410464, 'qBar は供給値とビット等価であること');
});

test('AC-14 known-answer: 閉鎖型 / H<=45 の負圧（一般部・隅角部）', () => {
  // 閉鎖型で外圧が負のとき内圧係数は 0 なので Cf = 表値そのもの。
  const general = W.calculateWindPressure(baseInput({ zone: 'general' }));
  assert.equal(general.negative.externalPeakCoefficient, -1.8);
  assert.equal(general.negative.internalPeakCoefficient, 0);
  assert.equal(general.negative.Cf, -1.8);
  assert.equal(general.negative.pressure, -905.5444320793884);

  const corner = W.calculateWindPressure(baseInput({ zone: 'corner' }));
  assert.equal(corner.negative.externalPeakCoefficient, -2.2);
  assert.equal(corner.negative.Cf, -2.2);
  assert.equal(corner.negative.pressure, -1106.7765280970302);
});

test('AC-10 diagnostic: 算定値はMiyoshi presetを置換しない（差が残ることを固定）', () => {
  // これはsynthetic formula checkであり、H=14.2 を検証済みの案件平均高さとは呼ばない。
  const general = W.calculateWindPressure(baseInput({ zone: 'general' }));
  const corner = W.calculateWindPressure(baseInput({ zone: 'corner' }));

  // preset（既存・authoritative）は 918 / 1122。算定値はそれと一致しない。
  assert.notEqual(Math.abs(general.negative.pressure), 918);
  assert.notEqual(Math.abs(corner.negative.pressure), 1122);

  // 差が可視であること（comparison modeで見せる値）。
  assert.ok(Math.abs(Math.abs(general.negative.pressure) - 918) > 10);
  assert.ok(Math.abs(Math.abs(corner.negative.pressure) - 1122) > 10);
});

/* ============================================================
   Er の境界（H < Zb / H = Zb / H > Zb）
============================================================ */

test('AC-14 boundary: Er は H <= Zb のとき Zb にクランプされる', () => {
  const below = W.calcEr(3, 5, 450, 0.20);
  assert.equal(below.HPrime, 5, 'H < Zb のとき H\' = Zb');
  assert.equal(below.clampedToZb, true);

  const atZb = W.calcEr(5, 5, 450, 0.20);
  assert.equal(atZb.HPrime, 5, 'H = Zb は境界に含まれる');
  assert.equal(atZb.clampedToZb, true);
  assert.equal(below.Er, atZb.Er, 'H < Zb と H = Zb は同じ Er を与える');

  const above = W.calcEr(10, 5, 450, 0.20);
  assert.equal(above.HPrime, 10);
  assert.equal(above.clampedToZb, false);
  assert.ok(above.Er > atZb.Er, 'H > Zb では Er が増加する');

  // 式そのものを固定（1.7 × (H'/ZG)^α）
  approx(atZb.Er, 1.7 * Math.pow(5 / 450, 0.20), 'Er at Zb:');
  approx(above.Er, 1.7 * Math.pow(10 / 450, 0.20), 'Er above Zb:');
});

/* ============================================================
   粗度区分（I / II / III / IV→III 読み替え）
============================================================ */

test('AC-14 roughness: I / II / III のパラメータが告示表のとおり', () => {
  assert.deepEqual(W.ROUGHNESS_PARAMETERS.I, { Zb: 5, ZG: 250, alpha: 0.10 });
  assert.deepEqual(W.ROUGHNESS_PARAMETERS.II, { Zb: 5, ZG: 350, alpha: 0.15 });
  assert.deepEqual(W.ROUGHNESS_PARAMETERS.III, { Zb: 5, ZG: 450, alpha: 0.20 });
  assert.deepEqual(W.ROUGHNESS_PARAMETERS.IV, { Zb: 10, ZG: 550, alpha: 0.27 });
});

test('AC-14 roughness: 板ガラスでは区分IVが区分IIIの数値へ読み替えられる', () => {
  const four = W.resolveGlassRoughness('IV');
  assert.equal(four.inputRoughnessCategory, 'IV', '入力を書き換えないこと');
  assert.equal(four.calculationRoughnessCategory, 'III');
  assert.equal(four.substitutionApplied, true);
  assert.ok(four.substitutionNote && four.substitutionNote.length > 0);
  // 計算パラメータはIIIのもの（IVの 10/550/0.27 ではない）
  assert.equal(four.Zb, 5);
  assert.equal(four.ZG, 450);
  assert.equal(four.alpha, 0.20);

  const three = W.resolveGlassRoughness('III');
  assert.equal(three.substitutionApplied, false);
  assert.equal(three.substitutionNote, null);

  // IV と III は同一の算定結果を与える（読み替えが実効であること）
  const asFour = W.calculateWindPressure(baseInput({ roughnessCategory: 'IV' }));
  const asThree = W.calculateWindPressure(baseInput({ roughnessCategory: 'III' }));
  assert.equal(asFour.designPressure, asThree.designPressure);
  // ただしtrace上は区別できること
  assert.equal(asFour.inputs.inputRoughnessCategory, 'IV');
  assert.equal(asFour.normalized.calculationRoughnessCategory, 'III');
  assert.equal(asFour.normalized.roughnessSubstitutionApplied, true);
  assert.equal(asThree.normalized.roughnessSubstitutionApplied, false);
});

test('AC-12: 未知の粗度区分は拒否される', () => {
  assert.throws(() => W.resolveGlassRoughness('V'), /roughnessCategory must be one of/);
  assert.throws(() => W.resolveGlassRoughness('iii'), /roughnessCategory must be one of/);
  assert.throws(() => W.resolveGlassRoughness(3), /roughnessCategory must be one of/);
});

/* ============================================================
   正圧 Cpe の3分岐
============================================================ */

test('AC-14 boundary: 正圧 Cpe の3分岐（H<=5 / H>5,Z<=5 / H>5,Z>5）', () => {
  const alpha = 0.20;

  const flat = W.calcCpePositive(5, 20, alpha);
  assert.equal(flat.Cpe, 1.0, 'H = 5 は H<=5 分岐（境界を含む）');
  assert.equal(flat.branch, 'H<=5');
  assert.equal(W.calcCpePositive(3, 20, alpha).Cpe, 1.0);

  const lowZ = W.calcCpePositive(20, 5, alpha);
  assert.equal(lowZ.branch, 'H>5,Z<=5', 'Z = 5 は Z<=5 分岐（境界を含む）');
  approx(lowZ.Cpe, Math.pow(5 / 20, 2 * alpha), 'Cpe (Z<=5):');

  const highZ = W.calcCpePositive(20, 10, alpha);
  assert.equal(highZ.branch, 'H>5,Z>5');
  approx(highZ.Cpe, Math.pow(10 / 20, 2 * alpha), 'Cpe (Z>5):');

  // Z=5 で分岐が切り替わるが、関数は連続であること。
  // ε を小さくすると差が 0 へ収束する（分岐の取り違えなら段差が残る）。
  const eps = 1e-9;
  const justAbove = W.calcCpePositive(20, 5 + eps, alpha);
  assert.equal(justAbove.branch, 'H>5,Z>5', 'Z=5+ε は Z>5 分岐');
  approx(justAbove.Cpe, lowZ.Cpe, 'Z=5 境界の連続性:');
});

/* ============================================================
   正圧 Gpe の端点と線形補間
============================================================ */

test('AC-14 boundary: 正圧 Gpe の端点値（Z=5 / Z=40）', () => {
  assert.equal(W.calcGpePositive(5, 'I').Gpe, 2.2);
  assert.equal(W.calcGpePositive(40, 'I').Gpe, 1.9);
  assert.equal(W.calcGpePositive(5, 'II').Gpe, 2.6);
  assert.equal(W.calcGpePositive(40, 'II').Gpe, 2.1);
  assert.equal(W.calcGpePositive(5, 'III').Gpe, 3.1);
  assert.equal(W.calcGpePositive(40, 'III').Gpe, 2.3);

  // 端点の外側はクランプ（端点値のまま）
  assert.equal(W.calcGpePositive(1, 'III').Gpe, 3.1);
  assert.equal(W.calcGpePositive(100, 'III').Gpe, 2.3);
  assert.equal(W.calcGpePositive(5, 'III').branch, 'Z<=5');
  assert.equal(W.calcGpePositive(40, 'III').branch, 'Z>=40');
});

test('AC-14 boundary: 正圧 Gpe は 5 < Z < 40 で線形補間される', () => {
  // 中点 Z = 22.5 は端点の平均になる
  approx(W.calcGpePositive(22.5, 'III').Gpe, (3.1 + 2.3) / 2, 'Gpe III 中点:');
  approx(W.calcGpePositive(22.5, 'I').Gpe, (2.2 + 1.9) / 2, 'Gpe I 中点:');
  approx(W.calcGpePositive(22.5, 'II').Gpe, (2.6 + 2.1) / 2, 'Gpe II 中点:');
  assert.match(W.calcGpePositive(22.5, 'III').branch, /interpolation/);

  // 1/4 点
  approx(W.calcGpePositive(5 + (40 - 5) * 0.25, 'III').Gpe, 3.1 + (2.3 - 3.1) * 0.25, 'Gpe III 1/4点:');

  // 単調減少
  const zs = [6, 10, 20, 30, 39];
  for (let i = 1; i < zs.length; i++) {
    assert.ok(
      W.calcGpePositive(zs[i], 'III').Gpe < W.calcGpePositive(zs[i - 1], 'III').Gpe,
      'Gpe は Z について単調減少'
    );
  }
});

/* ============================================================
   負圧 外圧ピーク係数の端点と線形補間
============================================================ */

test('AC-14 boundary: 負圧係数の端点（H=45 / H=60）と一般部・隅角部', () => {
  assert.equal(W.calcNegativeExternalPeak(45, 'general').externalPeakCoefficient, -1.8);
  assert.equal(W.calcNegativeExternalPeak(45, 'corner').externalPeakCoefficient, -2.2);
  assert.equal(W.calcNegativeExternalPeak(60, 'general').externalPeakCoefficient, -2.4);
  assert.equal(W.calcNegativeExternalPeak(60, 'corner').externalPeakCoefficient, -3.0);

  // H = 45 は H<=45 分岐（境界を含む）
  assert.equal(W.calcNegativeExternalPeak(45, 'general').branch, 'H<=45');
  assert.equal(W.calcNegativeExternalPeak(60, 'general').branch, 'H>=60');

  // 端点の外側はクランプ
  assert.equal(W.calcNegativeExternalPeak(10, 'general').externalPeakCoefficient, -1.8);
  assert.equal(W.calcNegativeExternalPeak(200, 'corner').externalPeakCoefficient, -3.0);

  // 隅角部は常に一般部より絶対値が大きい
  for (const h of [10, 45, 50, 60, 100]) {
    const g = W.calcNegativeExternalPeak(h, 'general').externalPeakCoefficient;
    const c = W.calcNegativeExternalPeak(h, 'corner').externalPeakCoefficient;
    assert.ok(Math.abs(c) > Math.abs(g), 'H=' + h + ' で隅角部 > 一般部');
  }
});

test('AC-14 boundary: 負圧係数は 45 < H < 60 で線形補間される', () => {
  approx(W.calcNegativeExternalPeak(52.5, 'general').externalPeakCoefficient, (-1.8 + -2.4) / 2, '負圧 一般部 中点:');
  approx(W.calcNegativeExternalPeak(52.5, 'corner').externalPeakCoefficient, (-2.2 + -3.0) / 2, '負圧 隅角部 中点:');
  assert.match(W.calcNegativeExternalPeak(52.5, 'general').branch, /interpolation/);

  // 単調（絶対値が増加）
  const hs = [46, 50, 55, 59];
  for (let i = 1; i < hs.length; i++) {
    const prev = Math.abs(W.calcNegativeExternalPeak(hs[i - 1], 'general').externalPeakCoefficient);
    const cur = Math.abs(W.calcNegativeExternalPeak(hs[i], 'general').externalPeakCoefficient);
    assert.ok(cur > prev, '負圧は H について単調に強くなる');
  }
});

/* ============================================================
   内圧ピーク係数（閉鎖型 / 開放型）
============================================================ */

test('AC-14: 内圧ピーク係数は建物種別と外圧の符号で決まる', () => {
  assert.equal(W.calcInternalPeak('closed', true), -0.5);
  assert.equal(W.calcInternalPeak('closed', false), 0);
  assert.equal(W.calcInternalPeak('open', true), -1.2);
  assert.equal(W.calcInternalPeak('open', false), 1.5);

  assert.throws(() => W.calcInternalPeak('semi-open', true), /buildingType must be one of/);
});

test('AC-14: Cf = 外圧ピーク係数 − 内圧ピーク係数（符号を統合しない）', () => {
  // 閉鎖型: 正圧は内圧 -0.5 が引かれる => +0.5 される
  const closed = W.calculateWindPressure(baseInput({ buildingType: 'closed' }));
  approx(closed.positive.Cf, closed.positive.externalPeakCoefficient + 0.5, '閉鎖型 正圧 Cf:');
  assert.equal(closed.negative.Cf, closed.negative.externalPeakCoefficient - 0);

  // 開放型: 正圧は +1.2、負圧は -1.5 される
  const open = W.calculateWindPressure(baseInput({ buildingType: 'open' }));
  approx(open.positive.Cf, open.positive.externalPeakCoefficient + 1.2, '開放型 正圧 Cf:');
  approx(open.negative.Cf, open.negative.externalPeakCoefficient - 1.5, '開放型 負圧 Cf:');

  // 開放型のほうが正圧・負圧とも絶対値が大きい
  assert.ok(open.positive.pressure > closed.positive.pressure);
  assert.ok(Math.abs(open.negative.pressure) > Math.abs(closed.negative.pressure));
});

/* ============================================================
   算定基準（D-005: notification_baseline / itakyo_recommended）
============================================================ */

test('AC-14: notification_baseline は y = 1.00 固定で再現期間を受け付けない', () => {
  const b = W.resolveBasis('notification_baseline');
  assert.equal(b.recurrenceMultiplier, 1.00);
  assert.equal(b.recurrenceYears, null);

  // 暗黙に割増へ倒れないこと
  assert.throws(
    () => W.resolveBasis('notification_baseline', 100),
    /does not take recurrenceYears/
  );
});

test('AC-14: itakyo_recommended は再現期間の明示選択を必須とする', () => {
  // 明示しなければ例外。silent default（y>1.00）は存在しない。
  assert.throws(() => W.resolveBasis('itakyo_recommended'), /requires an explicit recurrenceYears/);
  assert.throws(() => W.resolveBasis('itakyo_recommended', null), /requires an explicit recurrenceYears/);
  assert.throws(() => W.resolveBasis('itakyo_recommended', 75), /recurrenceYears must be one of/);

  assert.equal(W.resolveBasis('itakyo_recommended', 50).recurrenceMultiplier, 1.00);
  assert.equal(W.resolveBasis('itakyo_recommended', 100).recurrenceMultiplier, 1.07);
  assert.equal(W.resolveBasis('itakyo_recommended', 200).recurrenceMultiplier, 1.15);
  assert.equal(W.resolveBasis('itakyo_recommended', 300).recurrenceMultiplier, 1.19);
  assert.equal(W.resolveBasis('itakyo_recommended', 500).recurrenceMultiplier, 1.25);
});

test('AC-14: 再現期間係数は qBar へ二乗で効く', () => {
  const base = W.calculateWindPressure(baseInput());
  for (const years of W.RECURRENCE_YEARS) {
    const y = W.RECURRENCE_MULTIPLIERS[years];
    const t = W.calculateWindPressure(baseInput({ basis: 'itakyo_recommended', recurrenceYears: years }));
    approx(t.positive.qBar, base.positive.qBar * y * y, '再現期間 ' + years + '年 の qBar:');
    assert.equal(t.basis.type, 'itakyo_recommended');
    assert.equal(t.basis.recurrenceYears, years);
  }
  // 50年 は baseline と同値（ただし基準表示は異なる）
  const y50 = W.calculateWindPressure(baseInput({ basis: 'itakyo_recommended', recurrenceYears: 50 }));
  assert.equal(y50.designPressure, base.designPressure);
  assert.notEqual(y50.basis.type, base.basis.type, '値が同じでも基準は区別される');
});

/* ============================================================
   AC-07 設計風圧 / AC-03 traceability
============================================================ */

test('AC-07: designPressure = max(|正圧|, |負圧|)', () => {
  const t = W.calculateWindPressure(baseInput());
  assert.equal(
    t.designPressure,
    Math.max(Math.abs(t.positive.pressure), Math.abs(t.negative.pressure))
  );
  // 常に正
  assert.ok(t.designPressure > 0);

  // 隅角部では負圧が大きくなるが、それでも max で選ばれる
  const corner = W.calculateWindPressure(baseInput({ zone: 'corner' }));
  assert.equal(
    corner.designPressure,
    Math.max(Math.abs(corner.positive.pressure), Math.abs(corner.negative.pressure))
  );
});

test('AC-03: traceは入力→中間値→最終値を欠落なく保持する', () => {
  const t = W.calculateWindPressure(baseInput({ roughnessCategory: 'IV', buildingShortSideM: 20 }));

  const steps = t.trace.map((s) => s.step);
  for (const required of [
    'basis', 'meanHeightH', 'roughness', 'HPrime', 'Er', 'qBar',
    'CpePositive', 'GpePositive', 'externalPeakPositive', 'internalPeakPositive',
    'CfPositive', 'positivePressure',
    'externalPeakNegative', 'internalPeakNegative', 'CfNegative', 'negativePressure',
    'designPressure'
  ]) {
    assert.ok(steps.includes(required), 'trace に ' + required + ' が必要');
  }

  // 各stepが式と単位を持つ
  for (const s of t.trace) {
    assert.ok(typeof s.formula === 'string' && s.formula.length > 0, s.step + ' に式がない');
    assert.ok(typeof s.unit === 'string' && s.unit.length > 0, s.step + ' に単位がない');
    assert.ok(s.value !== undefined && s.value !== null, s.step + ' に値がない');
  }

  // traceの最終値が返り値と一致する
  const designStep = t.trace.find((s) => s.step === 'designPressure');
  assert.equal(designStep.value, t.designPressure);
  const qBarStep = t.trace.find((s) => s.step === 'qBar');
  assert.equal(qBarStep.value, t.positive.qBar);
});

test('AC-03: 内部計算で丸めていない（有効桁が落ちていない）', () => {
  const t = W.calculateWindPressure(baseInput());
  // 丸めていれば末尾が0で終わる短い値になる。full doubleであることを確認。
  assert.equal(t.positive.qBar, 503.08024004410464);
  assert.ok(String(t.positive.Er).length > 10, 'Er が丸められていないこと');
  assert.notEqual(t.designPressure, Math.round(t.designPressure));
});

/* ============================================================
   AC-04 検証状態の分離
============================================================ */

test('AC-04: 式のverifiedが入力をverifiedへ昇格させない', () => {
  const t = W.calculateWindPressure(baseInput());
  assert.equal(t.provenance.formulaVerificationStatus, 'verified_primary_source');
  assert.equal(t.provenance.inputVerificationStatus, 'user_input_unverified');
  assert.equal(t.provenance.calculationStatus, 'calculated');

  // どの入力値にもverified属性が付与されない
  const inputsJson = JSON.stringify(t.inputs);
  assert.ok(!/verified/i.test(inputsJson), 'inputs に verified 語彙が混入しないこと');

  // Miyoshiのverified値（V0=34 / roughness III）を使っても入力statusは昇格しない
  const withPresetFacts = W.calculateWindPressure(baseInput({ V0: 34, roughnessCategory: 'III' }));
  assert.equal(withPresetFacts.provenance.inputVerificationStatus, 'user_input_unverified');
});

/* ============================================================
   AC-11 Z / H の自動推定を持たない
============================================================ */

test('AC-11: 階ラベルからZやHを導出する経路が存在しない', () => {
  // floor系のキーは未知フィールドとして拒否される
  assert.throws(
    () => W.calculateWindPressure(baseInput({ floorKey: '2' })),
    /unknown wind input field/
  );
  assert.throws(
    () => W.calculateWindPressure(baseInput({ floor: 2 })),
    /unknown wind input field/
  );

  // モジュールソースに階→高さのマッピングが存在しない
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'wind-pressure.js'), 'utf8');
  for (const token of ['floorKey', 'FLOOR_HEIGHT', 'floorToZ', 'RF']) {
    assert.equal(src.includes(token), false, 'wind-pressure.js に ' + token + ' があってはならない');
  }
});

test('AC-02: wind-pressure.js は案件非依存（案件固有値・名称を持たない）', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'wind-pressure.js'), 'utf8');

  for (const token of ['MIYOSHI', 'Miyoshi', 'miyoshi', 'みよし']) {
    assert.equal(src.includes(token), false, '案件識別子 ' + token + ' が残っている');
  }
  // 案件固有の風圧値・寸法
  for (const value of ['1297', '1525', '1695', '1729', '918', '1122', '1250', '2050']) {
    assert.doesNotMatch(src, new RegExp('\\b' + value + '\\b'), '案件固有値 ' + value + ' が残っている');
  }
  // V0=34 も案件固有事実なのでハードコードしない
  assert.doesNotMatch(src, /V0\s*[:=]\s*34\b/, 'V0=34 をハードコードしてはならない');
});

/* ============================================================
   AC-12 error boundary（fail closed）
============================================================ */

test('AC-12: NaN / Infinity はすべて拒否される', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.throws(() => W.calculateWindPressure(baseInput({ V0: bad })), /V0/);
    assert.throws(() => W.calculateWindPressure(baseInput({ evaluationHeightM: bad })), /evaluationHeightM/);
    assert.throws(() => W.calculateWindPressure(baseInput({ buildingHeightM: bad })), /buildingHeightM/);
    assert.throws(() => W.calculateWindPressure(baseInput({ eavesHeightM: bad })), /eavesHeightM/);
  }
});

test('AC-12: 非正の高さ・V0は拒否される', () => {
  assert.throws(() => W.calculateWindPressure(baseInput({ evaluationHeightM: 0 })), /must be > 0/);
  assert.throws(() => W.calculateWindPressure(baseInput({ evaluationHeightM: -1 })), /must be > 0/);
  assert.throws(() => W.calculateWindPressure(baseInput({ buildingHeightM: 0 })), /must be > 0/);
  assert.throws(() => W.calculateWindPressure(baseInput({ V0: 0 })), /V0 must be within/);
  assert.throws(() => W.calculateWindPressure(baseInput({ V0: -34 })), /V0 must be within/);
});

test('AC-12: V0 と高さの hard bounds', () => {
  assert.throws(() => W.calculateWindPressure(baseInput({ V0: 1000 })), /V0 must be within/);
  assert.throws(
    () => W.calculateWindPressure(baseInput({ buildingHeightM: 99999, eavesHeightM: 99999 })),
    /must be within/
  );
  // 境界は許容
  assert.doesNotThrow(() => W.calculateWindPressure(baseInput({ V0: W.V0_MIN_MS })));
  assert.doesNotThrow(() => W.calculateWindPressure(baseInput({ V0: W.V0_MAX_MS })));
});

test('AC-12: 文字列・null・配列など型違いを拒否する', () => {
  assert.throws(() => W.calculateWindPressure(baseInput({ V0: '34' })), /V0 must be a number/);
  assert.throws(() => W.calculateWindPressure(baseInput({ evaluationHeightM: null })), /must be a number/);
  assert.throws(() => W.calculateWindPressure(null), /input object is required/);
  assert.throws(() => W.calculateWindPressure([]), /input object is required/);
  assert.throws(() => W.calculateWindPressure('x'), /input object is required/);
});

test('AC-12: 未知フィールド・不正な列挙値を拒否する', () => {
  assert.throws(() => W.calculateWindPressure(baseInput({ bogus: 1 })), /unknown wind input field/);
  assert.throws(() => W.calculateWindPressure(baseInput({ buildingType: 'glass' })), /buildingType must be one of/);
  assert.throws(() => W.calculateWindPressure(baseInput({ zone: 'edge' })), /zone must be one of/);
  assert.throws(() => W.calculateWindPressure(baseInput({ basis: 'custom' })), /basis.type must be one of/);
});

test('AC-12: 軒高が建物高さを超える入力を拒否する', () => {
  assert.throws(
    () => W.calculateWindPressure(baseInput({ buildingHeightM: 10, eavesHeightM: 12 })),
    /eavesHeightM must not exceed buildingHeightM/
  );
  // 等しいのは許容（陸屋根等）
  assert.doesNotThrow(() => W.calculateWindPressure(baseInput({ buildingHeightM: 10, eavesHeightM: 10 })));
});

/* ============================================================
   H の定義 / 隅角部の幾何
============================================================ */

test('AC-14: H は建物高さと軒高の平均', () => {
  assert.equal(W.calcMeanHeightH(20, 10), 15);
  assert.equal(W.calcMeanHeightH(14.2, 14.2), 14.2);
  const t = W.calculateWindPressure(baseInput({ buildingHeightM: 20, eavesHeightM: 10 }));
  assert.equal(t.normalized.meanHeightH, 15);
});

test('AC-14: 隅角部の帯幅 aPrime = min(b, 2H)、幅 = 0.1 × aPrime', () => {
  // b が 2H より小さいとき b が効く
  const narrow = W.calcCornerGeometry(10, 20);
  assert.equal(narrow.aPrime, 10);
  approx(narrow.cornerStripWidth, 1.0, '狭い建物の帯幅:');

  // 2H が b より小さいとき 2H が効く
  const low = W.calcCornerGeometry(100, 20);
  assert.equal(low.aPrime, 40);
  approx(low.cornerStripWidth, 4.0, '低い建物の帯幅:');

  // traceへ載る
  const t = W.calculateWindPressure(baseInput({ buildingShortSideM: 10, zone: 'corner' }));
  assert.equal(t.geometry.aPrime, Math.min(10, 2 * t.normalized.meanHeightH));
  approx(t.geometry.cornerStripWidth, 0.1 * t.geometry.aPrime, 'trace上の帯幅:');

  // b 未指定でも係数算定は成立する（幅が出せないだけ）
  const noB = W.calculateWindPressure(baseInput({ zone: 'corner' }));
  assert.equal(noB.geometry, null);
  assert.equal(noB.negative.externalPeakCoefficient, -2.2);
});

/* ============================================================
   AC-13 単位規律
============================================================ */

test('AC-13: traceの各stepが単位を明示し、暗黙の単位変換がない', () => {
  const t = W.calculateWindPressure(baseInput({ buildingShortSideM: 20 }));
  const units = {};
  for (const s of t.trace) units[s.step] = s.unit;

  assert.equal(units.meanHeightH, 'm');
  assert.equal(units.HPrime, 'm');
  assert.equal(units.qBar, 'N/m²');
  assert.equal(units.positivePressure, 'N/m²');
  assert.equal(units.negativePressure, 'N/m²');
  assert.equal(units.designPressure, 'N/m²');
  // 無次元量
  assert.equal(units.Er, '-');
  assert.equal(units.CpePositive, '-');
  assert.equal(units.GpePositive, '-');
  assert.equal(units.CfPositive, '-');
  assert.equal(units.CfNegative, '-');

  // mm が紛れ込んでいない（ガラス寸法はmmだが風圧側はm）
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'wind-pressure.js'), 'utf8'
  );
  assert.doesNotMatch(src, /widthMm|heightMm|\bmm\b/, 'wind-pressure.js は mm を扱わない');
});

/* ============================================================
   決定性
============================================================ */

test('同じ入力は常に同じtraceを返す（決定的）', () => {
  const a = W.calculateWindPressure(baseInput({ roughnessCategory: 'IV', buildingShortSideM: 12 }));
  const b = W.calculateWindPressure(baseInput({ roughnessCategory: 'IV', buildingShortSideM: 12 }));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
