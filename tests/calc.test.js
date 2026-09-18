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
  STRENGTH_TYPES,
  K2_RATIO_CAP,
  generateCandidates,
  splitCandidates
} = require('../calc.js');

const GlassCalc = require('../calc.js');

const AREA = 1.0;

// 代表的な寸法・設計風圧の検証値。
// Phase 2Dでcalc.jsから案件固有定数を削除したため、汎用計算コアのテストでは
// 案件presetを参照せず、検証用の数値としてここに固定する。
// 案件preset値そのものの正しさ（1250×2050 / 2F=1525 N/m²等）は
// project-config側の正（project-config/miyoshi.js）に対して
// tests/project-config.test.js が独立に固定している。
const SAMPLE_W_MM = 1250;
const SAMPLE_H_MM = 2050;
const SAMPLE_DESIGN_PRESSURE = 1525;

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
   Phase 2D AC-01 / AC-10: calculation core purity
   calc.jsは案件非依存の汎用計算コアのみを担当し、案件固有値・
   案件固有ラベル・案件固有provenanceを保持しない。
   （旧 UNVERIFIED_DEFAULT_DIMENSIONS_MM 等のdeprecated複製は
    Phase 2Dで削除済み。正は project-config/ 側が持つ。）
============================================================ */

test('AC-01: calc.jsのexportsからdeprecatedな案件固有定数が削除されている', () => {
  const removed = [
    'POSITIVE_PRESSURE_MIYOSHI_PRESET',
    'NEGATIVE_PRESSURE_MIYOSHI_PRESET',
    'UNVERIFIED_DEFAULT_DIMENSIONS_MM'
  ];
  for (const name of removed) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(GlassCalc, name), false,
      `calc.jsは案件固有定数 ${name} をexportしてはならない`
    );
    assert.equal(GlassCalc[name], undefined);
  }
});

test('AC-01: calc.jsのソースにMiyoshi固有の識別子・案件固有値が存在しない', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'calc.js'), 'utf8');

  // 案件固有の識別子
  for (const token of ['MIYOSHI', 'Miyoshi', 'みよし']) {
    assert.equal(src.includes(token), false, `calc.jsに案件固有識別子 ${token} が残っている`);
  }
  // 案件固有の設計風圧プリセット値・案件既定寸法
  for (const value of ['1297', '1525', '1695', '1729', '918', '1122', '1250', '2050']) {
    assert.doesNotMatch(
      src, new RegExp('\\b' + value + '\\b'),
      `calc.jsに案件固有値 ${value} が残っている（正はproject-config側）`
    );
  }
  // 案件固有のprovenance / Evidence語彙
  for (const token of ['verificationStatus', 'evidence', 'UNVERIFIED PROJECT DEFAULT']) {
    assert.equal(src.includes(token), false, `calc.jsに案件provenance語彙 ${token} が残っている`);
  }
  // 小文字 'miyoshi' は「正がどこにあるか」を示すfile path pointerとしてのみ許容する。
  // 案件固有の値・ラベル・provenanceとして現れてはならない。
  const lowercaseHits = src.split('\n').filter((line) => line.includes('miyoshi'));
  for (const line of lowercaseHits) {
    assert.match(
      line, /project-config\/miyoshi\.js/,
      `calc.js内の 'miyoshi' はproject-config/miyoshi.jsへのpath pointerのみ許容: ${line.trim()}`
    );
    assert.equal(
      line.trim().startsWith('*') || line.trim().startsWith('//'), true,
      `calc.js内の 'miyoshi' はコメント内のpointerのみ許容（実行コード不可）: ${line.trim()}`
    );
  }
});

/* ============================================================
   代表寸法による感度テスト（H=2050mm固定、FL6）
   W=1250 / 1400 / 1500 / 1550mm で面積増加に伴い許容耐風圧が
   単調に低下することを確認する（汎用計算コアの性質のテスト）。
============================================================ */

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

test('寸法感度・境界回帰: 設計風圧1525 N/m²に対しW=1250はOK、W=1500はNGに反転する', () => {
  const H = SAMPLE_H_MM;
  const designP = SAMPLE_DESIGN_PRESSURE; // 1525 N/m²
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


/* ============================================================
   Phase 2D repair wave: protected invariantのcandidate-level固定
   （independent verifierが指摘したtest gapを埋める。
    不変条件そのものは変更していない。）
============================================================ */

test('不変条件: k2式の厚さ比capは2.0で、比がそれを超えてもk2は増えない', () => {
  // K2_RATIO_CAP自体を固定する（値が変わればこのテストが落ちる）。
  assert.equal(K2_RATIO_CAP, 2.0);

  // 比 5:10 = 2.0（ちょうどcap）と 5:12 = 2.4（capが効く）で
  // 薄板側のk2が同一になること。= 比2.0超はk2に寄与しない。
  const K2_AT_CAP = 0.75 * (1 + Math.pow(2.0, 3)); // 6.75
  assert.equal(calcK2_IGU(5, 10), K2_AT_CAP);
  assert.equal(calcK2_IGU(5, 12), K2_AT_CAP);
  assert.equal(calcK2_IGU(8, 19), K2_AT_CAP); // 比2.375もcap
  assert.equal(K2_AT_CAP, 6.75);

  // capに達しない比では素の比が使われる（capが常時適用されていないこと）。
  assert.equal(calcK2_IGU(5, 6), 0.75 * (1 + Math.pow(6 / 5, 3)));
  assert.ok(calcK2_IGU(5, 6) < K2_AT_CAP);

  // 厚板側（比 < 1）はcapの影響を受けない。
  assert.equal(calcK2_IGU(12, 5), 0.75 * (1 + Math.pow(5 / 12, 3)));
});

test('不変条件: 厚板/薄板 > 2.5 の複層候補はOK候補に混入せず自動推奨されない', () => {
  // 適用範囲外でも「計算上は耐える」候補が生じる大きめのdesignPを使う。
  const candidates = generateCandidates('fl_fl', AREA, 1500, 1.0);
  const split = splitCandidates(candidates);

  const overRatio = candidates.filter((c) => c.rawRatio > IGU_APPLICABLE_RATIO_MAX);
  assert.ok(overRatio.length > 0, '比2.5超の候補が生成されていること（テストが空振りしていない）');

  for (const c of overRatio) {
    assert.equal(c.status, 'out_of_scope', `比${c.rawRatio}の候補は out_of_scope であるべき: ${c.label}`);
    assert.equal(c.outOfScope, true);
  }

  // split結果のどのバケツに入るか = 推奨対象になりうるかの境界。
  const labelsOf = (list) => list.map((c) => c.label);
  for (const c of overRatio) {
    assert.equal(labelsOf(split.okCandidates).includes(c.label), false,
      `適用範囲外候補がOK候補に混入している: ${c.label}`);
    assert.equal(labelsOf(split.ngCandidates).includes(c.label), false,
      `適用範囲外候補がNG候補に混入している: ${c.label}`);
    assert.equal(labelsOf(split.outOfScopeCandidates).includes(c.label), true,
      `適用範囲外候補がoutOfScopeバケツに入っていない: ${c.label}`);
  }

  // 「計算上は耐えるが適用範囲外」の候補が実在し、かつ推奨されないこと。
  const wouldPassButOutOfScope = overRatio.filter((c) => c.wouldPass === true);
  assert.ok(wouldPassButOutOfScope.length > 0,
    'wouldPass=trueかつ適用範囲外の候補が存在すること（自動推奨除外の実効性）');
  for (const c of wouldPassButOutOfScope) {
    assert.equal(labelsOf(split.okCandidates).includes(c.label), false);
  }

  // 推奨候補（OK先頭）は必ず適用範囲内。
  if (split.okCandidates.length > 0) {
    assert.equal(split.okCandidates[0].outOfScope, false);
    assert.ok(split.okCandidates[0].rawRatio === undefined ||
      split.okCandidates[0].rawRatio <= IGU_APPLICABLE_RATIO_MAX);
  }
});

test('不変条件: 比がちょうど2.5の複層候補は適用範囲内（境界は > で判定）', () => {
  // FL6 + FL15 = 2.5ちょうど。境界が >= に変わればこのテストが落ちる。
  const r = calcP_IGU(6, 15, getK1_FL(6), getK1_FL(15), AREA, 1.0);
  assert.equal(r.rawRatio, 2.5);
  assert.equal(r.outOfScope, false, '比2.5ちょうどは適用範囲内');

  const candidates = generateCandidates('fl_fl', AREA, 1500, 1.0);
  const at25 = candidates.filter((c) => c.rawRatio === 2.5);
  assert.ok(at25.length > 0);
  for (const c of at25) {
    assert.notEqual(c.status, 'out_of_scope', `比2.5ちょうどを除外してはならない: ${c.label}`);
  }

  // 一方で 5:15 = 3.0 は適用範囲外。
  const r3 = calcP_IGU(5, 15, getK1_FL(5), getK1_FL(15), AREA, 1.0);
  assert.equal(r3.rawRatio, 3);
  assert.equal(r3.outOfScope, true);
});
