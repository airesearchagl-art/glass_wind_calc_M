/**
 * project-config/miyoshi-observations.js
 *
 * みよし案件の Evidence Closure Observation 集合（Phase 2L-A）。案件固有。
 *
 * ── これは何か ───────────────────────────────────────────
 *
 * 案件用の一次資料（メーカー発行の板ガラス耐風圧検討書）で直接確認した scalar fact を、
 * Evidence Closure Observation v1 の**生の申告**として保持する。
 * これは Evidence の**入力**であって trust status ではない。
 *
 *   - 検証・正規化・Evidence gate・reconciliation をこのmoduleで行わない。
 *     必ず EvidenceClosure.normalizeObservationSet() / evaluateClosure() の
 *     canonical path を通す。ここで判定を書くと、判定が2つになる。
 *   - current preset（miyoshi.js）を書き換えない。verificationStatus も変えない。
 *   - Promotion Candidate を作らない。verifiedCases を足さない。
 *   - closure の出力をここへ書き戻す経路を作らない（一方向の入力境界）。
 *
 * ── runtime との境界（Phase 2L-A） ─────────────────────────
 *
 * このmoduleは index.html から読み込まれない。UI の Closure Matrix と
 * tools/verification/project-state-probe.mjs は、引き続き
 * evaluateClosure(projectId, []) を評価する。runtime へ配線すると UI の表示が変わるので、
 * それは別の gate で決める。load時の依存を持たないので、配線時の読み込み位置は問わない。
 *
 * ── 含めないもの: pane 寸法 ──────────────────────────────
 *
 * pane_width_mm / pane_height_mm は意図的に含めない。一次資料には建具ごとに複数の
 * 実ガラス寸法があり、現行 contract（scope = null の単一 W/H）では表現できない。
 * 1枚を代表として選ぶこと、複数を1つの W/H へ潰すこと、1250×2050 を確認済みと
 * することは、いずれも行わない。表現方法の決定は Phase 2L-B の architecture decision。
 *
 * ── 負圧の符号 ─────────────────────────────────────────
 *
 * 一次資料は負圧を -918 / -1122 と表記する。Observation contract は observedValue > 0 を
 * 要求し、current preset も負圧を絶対値で保持するため、ここでは**大きさ**（918 / 1122）を
 * 保持する。符号を捨てたのではなく、表記の規約を揃えた。規約は
 * negativePressureConvention に明示する。
 *
 * ── source scope ──────────────────────────────────────
 *
 * この一次資料が述べる風条件（V0 等）は sourceScope.statedWindConditions に**文脈として**
 * 記録する。これは Observation ではなく、preset の V0（別の社内基本設計資料由来）とは
 * 突き合わせない。両者は別の source scope であり、このmoduleはどちらも変えない。
 * 風圧値は、この一次資料で直接確認された scalar fact として扱う。
 *
 * ── privacy ──────────────────────────────────────────
 *
 * private source の所在（ファイル名・URL・ID・path・案件正式名・施主名・メーカー名・
 * 図面番号）を一切保持しない。保持するのは privateReferenceAvailable: true と、
 * 一般化した publicDescription だけである。sourceReference は null。
 * このmoduleの散文はすべて publicDescription に置く。publication lint が検査するのは
 * その key だけなので、別の key に書いた散文は lint を素通りする。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式のプレーンJSとして
 * 提供する（<script src> と require() の両対応）。
 */
(function (global, factory) {
  var mod = factory();
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.MiyoshiObservations = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PROJECT_ID = 'miyoshi';
  var CHECKED_AT = '2026-10-03';
  var PUBLIC_DESCRIPTION = '案件用のメーカー耐風圧検討書で直接確認。';

  var PRESSURE_UNIT = 'N/m²';
  var HEIGHT_UNIT = 'm';

  function primaryPrivateEvidence() {
    return {
      level: 'primary',
      checkedAt: CHECKED_AT,
      publicDescription: PUBLIC_DESCRIPTION,
      privateReferenceAvailable: true
    };
  }

  function observation(factKey, scope, observedValue, unit) {
    return {
      schemaVersion: 1,
      observationType: 'evidence_closure_observation',
      factKey: factKey,
      scope: scope,
      observedValue: observedValue,
      unit: unit,
      evidence: primaryPrivateEvidence(),
      sourceReference: null
    };
  }

  var OBSERVATIONS = [
    // 階別正圧
    observation('positive_pressure', { floor: '1' }, 1297, PRESSURE_UNIT),
    observation('positive_pressure', { floor: '2' }, 1525, PRESSURE_UNIT),
    observation('positive_pressure', { floor: '3' }, 1695, PRESSURE_UNIT),
    observation('positive_pressure', { floor: 'R' }, 1729, PRESSURE_UNIT),
    // 部位別負圧の大きさ（一次資料の表記は -918 / -1122）
    observation('negative_pressure', { zone: 'general' }, 918, PRESSURE_UNIT),
    observation('negative_pressure', { zone: 'corner' }, 1122, PRESSURE_UNIT),
    // 階 → 評価高さ Z
    observation('evaluation_height', { floor: '1' }, 4.6, HEIGHT_UNIT),
    observation('evaluation_height', { floor: '2' }, 8.8, HEIGHT_UNIT),
    observation('evaluation_height', { floor: '3' }, 13.1, HEIGHT_UNIT),
    observation('evaluation_height', { floor: 'R' }, 14.2, HEIGHT_UNIT)
  ];

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      Object.keys(value).forEach(function (k) { deepFreeze(value[k]); });
    }
    return value;
  }

  return deepFreeze({
    projectId: PROJECT_ID,
    observations: OBSERVATIONS,

    negativePressureConvention: {
      convention: 'magnitude',
      sourceSign: 'negative',
      publicDescription:
        '一次資料は負圧を負の値で表記する。Observation と current preset は大きさを正の数で保持する。'
    },

    deferredFactKeys: ['pane_height_mm', 'pane_width_mm'],
    deferral: {
      phase: '2L-B',
      publicDescription:
        '一次資料には建具ごとに複数の実ガラス寸法がある。現行の単一 W/H の契約では表現できないため取り込まない。'
    },

    sourceScope: {
      sourceScopeId: 'project_glass_wind_pressure_review',
      sourceKind: 'private_primary',
      statedWindConditions: {
        V0: { value: 32, unit: 'm/s' },
        roughnessCategory: 'III',
        recurrenceYears: 100,
        recurrenceMultiplier: 1.07
      },
      reconciledAgainstPreset: false,
      publicDescription:
        '一次資料が述べる風条件の文脈記録。Observation ではなく preset の V0 とは突き合わせない。preset の V0 は別の資料に由来し、ここでは変更しない。'
    }
  });
});
