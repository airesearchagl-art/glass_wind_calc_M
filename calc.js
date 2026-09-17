/**
 * ガラス耐風圧 計算ロジック（案件非依存の汎用計算コア）
 *
 * 出典:
 *   - 国土交通省 平成12年建設省告示第1458号（4辺支持ガラスの構造計算）
 *   - 板硝子協会「4辺支持板ガラスの耐風圧強度計算法」
 *
 * ブラウザ（<script src="calc.js">、window.GlassCalc）と
 * Node.js（require('./calc.js')、テスト用）の両方から利用できる。
 *
 * Phase 2D（calculation coreの完全な案件非依存化）:
 * このファイルは k1・k2・告示式・複層ガラス計算・candidate generation /
 * sorting / split 等の「案件非依存の汎用計算コア」のみを担当する。
 *
 * 案件固有の値（設計風圧プリセット・案件既定寸法・案件ラベル・
 * 案件provenance / Evidence）は、このファイルに一切置かない。
 * それらの正（authoritative source）は以下が持つ:
 *   - project-config/miyoshi.js   … 個別案件のpreset（検証状況・Evidence付き）
 *   - project-config/registry.js  … registered presetのlookup境界
 *   - project-config/project-input.js … 入力条件のversioned package
 *
 * Phase 2A〜2Cで後方互換のために残していた案件固有プリセットの複製
 * （階別正圧 / 部位別負圧 / 案件既定寸法の3定数）は、全consumerの
 * 移行完了に伴いPhase 2Dで削除した。案件固有値をこのファイルへ
 * 再び複製しないこと。移行の詳細はREADMEのmigrationセクションを参照。
 */
(function (global, factory) {
  var mod = factory();
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.GlassCalc = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ============================================================
  // k1：強度種別係数（板硝子協会資料準拠）
  // ============================================================
  function getK1_FL(t) {
    if (t <= 8) return 1.0;
    if (t <= 12) return 0.9;
    if (t <= 20) return 0.8;
    return 0.75;
  }
  var K1_TP = 3.5;

  // 板硝子協会「4辺支持板ガラスの耐風圧強度計算法」表2.2.1に示された、
  // 強化ガラス k1=3.5 が適用される呼び厚の全範囲（協会表そのもの）。
  // 19mmはこの表に含まれないため、k1=3.5をそのまま適用できない
  // （＝出典の適用範囲外）。
  var K1_TP_SUPPORTED_THICKNESSES_MM = [4, 5, 6, 8, 10, 12, 15];

  function getK1_TP(t) {
    if (K1_TP_SUPPORTED_THICKNESSES_MM.indexOf(t) === -1) {
      // 板硝子協会表2.2.1の適用範囲外の呼び厚。k1=3.5を無条件には
      // 適用せず、NaNを返して「算定不可（P>=designPが常にfalseになる）」
      // ことを明示する。
      return NaN;
    }
    return K1_TP;
  }

  // 強度種別（strengthType）ごとの k1・候補板厚。
  // Low-E は coating（表面コーティング）属性として独立させ、
  // 強度計算には影響させない。将来、熱強化(HS)等の強度種別を
  // 追加する場合はここにエントリを増やすだけでよい。
  //
  // thicknessList は「本ツールが自動推奨する候補厚」であり、
  // 出典（協会表・告示）が示す全呼び厚の一覧とは区別している：
  //   - FL: 板硝子協会k1表（getK1_FL）はt>20mmにも対応するが、
  //     本ツールの自動候補は 5〜19mm に限定している。
  //   - TP: 板硝子協会表2.2.1の全呼び厚は 4,5,6,8,10,12,15mm
  //     （K1_TP_SUPPORTED_THICKNESSES_MM）。本ツールの自動候補は
  //     さらに絞った 5〜15mm とし、19mmは表に無いため除外、
  //     4mmは外壁ガラス候補としての実用下限（ツール側の制約）として
  //     除外している。
  var STRENGTH_TYPES = {
    FL: { label: 'FL', k1: getK1_FL, thicknessList: [5, 6, 8, 10, 12, 15, 19] },
    TP: { label: 'TP', k1: getK1_TP, thicknessList: [5, 6, 8, 10, 12, 15] }
  };

  var COATINGS = {
    none: { label: '' },
    lowe: { label: 'Low-E' }
  };

  // ガラス構成の定義（pane / outer / inner は { strengthType, coating } を持つ）
  var GLASS_TYPES = {
    lowe_fl: {
      label: 'Low-E + A + FL', igu: true,
      outer: { strengthType: 'FL', coating: 'lowe' },
      inner: { strengthType: 'FL', coating: 'none' }
    },
    fl_fl: {
      label: 'FL + A + FL', igu: true,
      outer: { strengthType: 'FL', coating: 'none' },
      inner: { strengthType: 'FL', coating: 'none' }
    },
    fl_single: {
      label: 'FL（単板）', igu: false,
      pane: { strengthType: 'FL', coating: 'none' }
    },
    tp_single: {
      label: 'TP（単板）', igu: false,
      pane: { strengthType: 'TP', coating: 'none' }
    }
  };

  // 板硝子協会計算法の適用範囲：複層ガラスの厚板/薄板 ≦ 2.5
  var IGU_APPLICABLE_RATIO_MAX = 2.5;
  // k2式内の厚さ比の上限（告示・協会式で規定される式自体の上限。適用範囲の判定とは別）
  var K2_RATIO_CAP = 2.0;

  function calcK2_IGU(t_self, t_other) {
    var ratio = Math.min(K2_RATIO_CAP, t_other / t_self);
    return 0.75 * (1 + Math.pow(ratio, 3));
  }

  // 平成12年建設省告示第1458号：4辺支持ガラスの許容耐風圧圧力
  //   P = (300 × k1 × k2 / A) × (t + t²/4)
  // 補正係数を含まない、告示式そのものの値。
  function calcP_notification(t, k1, k2, area) {
    return (300 * k1 * k2 / area) * (t + (t * t) / 4);
  }

  // 告示準拠計算値（calcP_notification）に「告示外の追加低減係数」を乗じた値。
  // extraFactor の既定値は 1.00（= 告示準拠のまま）。
  // 0.90 等を用いる場合は、告示に規定のない追加の安全側係数であることが前提。
  function calcP_single(t, k1, k2, area, extraFactor) {
    if (extraFactor === undefined || extraFactor === null) extraFactor = 1.0;
    return calcP_notification(t, k1, k2, area) * extraFactor;
  }

  // 複層ガラスの許容風圧計算（外側・内側それぞれ計算し、小さい方を採用）
  function calcP_IGU(t_outer, t_inner, k1_outer, k1_inner, area, extraFactor) {
    if (extraFactor === undefined || extraFactor === null) extraFactor = 1.0;
    var k2_outer = calcK2_IGU(t_outer, t_inner);
    var k2_inner = calcK2_IGU(t_inner, t_outer);
    var P_outer = calcP_single(t_outer, k1_outer, k2_outer, area, extraFactor);
    var P_inner = calcP_single(t_inner, k1_inner, k2_inner, area, extraFactor);

    // 板硝子協会計算法の適用範囲チェック（k2式内のcapとは独立に、実際の厚さ比で判定）
    var rawRatio = Math.max(t_outer, t_inner) / Math.min(t_outer, t_inner);
    var outOfScope = rawRatio > IGU_APPLICABLE_RATIO_MAX;

    return { P_outer: P_outer, P_inner: P_inner, k2_outer: k2_outer, k2_inner: k2_inner, rawRatio: rawRatio, outOfScope: outOfScope };
  }

  function getK1(strengthType, t) {
    return STRENGTH_TYPES[strengthType].k1(t);
  }

  // ガラス表示名（coating があればそちらを優先表示。例: Low-E6 / FL6 / TP6）
  function paneLabel(pane, t) {
    var coatingLabel = COATINGS[pane.coating].label;
    if (coatingLabel) return coatingLabel + t;
    return STRENGTH_TYPES[pane.strengthType].label + t;
  }

  /* ============================================================
     候補生成
  ============================================================ */
  function generateCandidates(typeKey, area, designP, extraFactor) {
    var gt = GLASS_TYPES[typeKey];
    var candidates = [];

    if (!gt.igu) {
      // ===== 単板ガラス =====
      var list = STRENGTH_TYPES[gt.pane.strengthType].thicknessList;
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        var k1 = getK1(gt.pane.strengthType, t);
        var k2 = 1.0; // 単板
        var P = calcP_single(t, k1, k2, area, extraFactor);
        var status = P >= designP ? 'ok' : 'ng';
        candidates.push({
          label: paneLabel(gt.pane, t),
          t_max: t,
          t_total: t,
          P: P,
          status: status,
          outOfScope: false,
          detail: { igu: false, t: t, k1: k1, k2: k2, area: area, extraFactor: extraFactor, P: P }
        });
      }
    } else {
      // ===== 複層ガラス =====
      var listOuter = STRENGTH_TYPES[gt.outer.strengthType].thicknessList;
      var listInner = STRENGTH_TYPES[gt.inner.strengthType].thicknessList;
      for (var oi = 0; oi < listOuter.length; oi++) {
        var t_o = listOuter[oi];
        for (var ii = 0; ii < listInner.length; ii++) {
          var t_i = listInner[ii];
          var k1_outer = getK1(gt.outer.strengthType, t_o);
          var k1_inner = getK1(gt.inner.strengthType, t_i);

          var r = calcP_IGU(t_o, t_i, k1_outer, k1_inner, area, extraFactor);
          var P_IGU = Math.min(r.P_outer, r.P_inner);
          var wouldPass = P_IGU >= designP;
          var candStatus = r.outOfScope ? 'out_of_scope' : (wouldPass ? 'ok' : 'ng');

          var outerLabel = paneLabel(gt.outer, t_o);
          var innerLabel = paneLabel(gt.inner, t_i);

          candidates.push({
            label: outerLabel + ' + A + ' + innerLabel,
            t_max: Math.max(t_o, t_i),
            t_total: t_o + t_i,
            P: P_IGU,
            status: candStatus,
            outOfScope: r.outOfScope,
            rawRatio: r.rawRatio,
            wouldPass: wouldPass,
            detail: {
              igu: true, t_o: t_o, t_i: t_i, k1_outer: k1_outer, k1_inner: k1_inner,
              k2_outer: r.k2_outer, k2_inner: r.k2_inner,
              P_outer: r.P_outer, P_inner: r.P_inner, P_IGU: P_IGU,
              outer_label: outerLabel, inner_label: innerLabel,
              area: area, extraFactor: extraFactor,
              adopted_side: r.P_outer <= r.P_inner ? 'outer' : 'inner',
              rawRatio: r.rawRatio, outOfScope: r.outOfScope
            }
          });
        }
      }
    }

    return candidates;
  }

  // ソート：最大板厚昇順 → 合計板厚昇順 → 名前順
  function sortCandidates(candidates) {
    return candidates.slice().sort(function (a, b) {
      if (a.t_max !== b.t_max) return a.t_max - b.t_max;
      if (a.t_total !== b.t_total) return a.t_total - b.t_total;
      return a.label.localeCompare(b.label);
    });
  }

  // OK候補・NG候補・適用範囲外候補を明確に分離する。
  // 推奨候補（best）は必ず OK（かつ適用範囲内）から選ぶこと。
  function splitCandidates(candidates) {
    var sorted = sortCandidates(candidates);
    return {
      okCandidates: sorted.filter(function (c) { return c.status === 'ok'; }),
      ngCandidates: sorted.filter(function (c) { return c.status === 'ng'; }),
      outOfScopeCandidates: sorted.filter(function (c) { return c.status === 'out_of_scope'; })
    };
  }

  return {
    getK1_FL: getK1_FL,
    K1_TP: K1_TP,
    K1_TP_SUPPORTED_THICKNESSES_MM: K1_TP_SUPPORTED_THICKNESSES_MM,
    getK1_TP: getK1_TP,
    STRENGTH_TYPES: STRENGTH_TYPES,
    COATINGS: COATINGS,
    GLASS_TYPES: GLASS_TYPES,
    IGU_APPLICABLE_RATIO_MAX: IGU_APPLICABLE_RATIO_MAX,
    K2_RATIO_CAP: K2_RATIO_CAP,
    calcK2_IGU: calcK2_IGU,
    calcP_notification: calcP_notification,
    calcP_single: calcP_single,
    calcP_IGU: calcP_IGU,
    getK1: getK1,
    paneLabel: paneLabel,
    generateCandidates: generateCandidates,
    sortCandidates: sortCandidates,
    splitCandidates: splitCandidates
  };
});
