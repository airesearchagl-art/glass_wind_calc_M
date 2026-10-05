/**
 * project-config/project-pack.js
 *
 * Generic Project Pack v1（Phase 2L-B1）。案件非依存。
 *
 * ── これは何か ───────────────────────────────────────────
 *
 * 1 つの案件の「ガラス耐風圧検討に必要な入力」を、案件ごとの private / local な
 * ファイルとして持ち運ぶための**新しい format**（packType: glass_wind_project_pack）と、
 * その validator である。目指す構成は次の 2 層:
 *
 *   generic public core（この repository）  +  private / local Project Pack（repository の外）
 *
 * 実案件の値・識別子は Project Pack 側に置き、public repository には置かない。
 * この phase では format と validator だけを定義する。既存の案件 preset はまだ
 * repository に残っており、移行は後続 stage で行う。
 *
 * ── これは何でないか ─────────────────────────────────────
 *
 * Project Input Package v1（project-input.js）・Workspace・Project Profile・
 * Review Package を**置き換えない**。それらは従来どおり別 format として残る。
 * Project Pack をそれらへ無理に統合しない。
 *
 * この phase では次のいずれにも接続しない: Evidence Closure、runtime の案件 context、
 * index.html、案件 preset、案件 Observation、browser runtime。
 * evidence.records は Evidence Closure の Observation では**ない**。Observation への
 * 変換は後続 stage で、必ず canonical な normalizer を通して行う（このモジュールで
 * Observation を組み立てない）。
 *
 * ── trust ────────────────────────────────────────────────
 *
 * 読み込んだ Project Pack の trust は常に `pack_unreviewed` である。pack が自分を
 * verified / reviewed / primary と名乗っても trust は上がらない。trust・
 * verificationStatus 等を宣言する field は schema に存在せず、書けば未知 key として
 * 拒否される。外部から取り込んだものを verified にしない既存の取り込み規約
 * （Project Input Package の imported_unverified）を緩めない。review 済み pack の
 * attestation は後続 stage。
 *
 * ── source claim は canonical Evidence ではない ──────────────
 *
 * 出典ごとの「出典が何を主張しているか」は sourceClaim として受け取り、そのまま返す:
 *
 *   { sourceScopeId, sourceClaim: { claimedLevel, claimedCheckedAt,
 *                                   publicDescription, claimedPrivateReferenceAvailable } }
 *
 * field 名を canonical Evidence（level / checkedAt / privateReferenceAvailable）と
 * **わざと違えてある**。canonical な形のまま返すと、primary + checkedAt +
 * privateReferenceAvailable: true の申告は ProjectEvidence.assertPromotionGate('verified')
 * を単独で通ってしまい、top-level の trust を見落とした後続 consumer が未 review の
 * pack から verified を作れる。それを規約（「trust を見てから使え」）ではなく構造で塞ぐ。
 * 入力も同じ形なので、生の pack から canonical Evidence を拾うこともできない。
 *
 * 入力検証では ProjectEvidence.makeEvidence() を一時的な validator として再利用するが、
 * その戻り値は保存しない。sourceClaim → canonical Evidence の変換は、pack の trust を
 * 確かめる adapter が後続 stage でだけ明示的に行う。この phase にその adapter は無い。
 *
 * ── design value と evidence を混ぜない ──────────────────
 *
 * windConditions / panes / glazingCases は案件の**設計値**（計算に使う値）であり、
 * evidence.records は出典が述べる値の**申告**である。設計値があることと、それが一次資料で
 * 確認されたことは別である。validator は records と設計値を突き合わせない
 * （突き合わせは後続 stage の Evidence engine の責務）。
 *
 * Human Review の限界: pack の作成者が同じ値を設計値と record の両方へ写すことは
 * 構造上いつでもできる。そうすると後段の突き合わせは常に一致し、何も確かめていないのに
 * 一致したように見える。この validator はそれを検出できず、検出できるとも主張しない。
 * 2 つが独立した出典に由来することは、pack を review する人が確かめる。
 *
 * ── 識別子 ───────────────────────────────────────────────
 *
 * pane / case / source scope の ID は意味を持たない中立 ID に限る:
 *   pane P001…P9999 / case G001…G9999 / source scope S01…S999
 * 建具記号・図面番号・ファイル名・path・案件ラベルは pattern に合わないので
 * ID になれない。中立 ID と実際の開口の対応（private mapping）は schema に入れない。
 *
 * ── map ではなく配列 ─────────────────────────────────────
 *
 * ID で引く集合（panes / glazingCases / sourceScopes / 階別・区分別の値）は、すべて
 * 明示的な ID field を持つ配列で表す。JSON.parse は重複した object key を黙って
 * 後勝ちで 1 つにするので、object map では重複を validator が見ることができない。
 *
 * ── I/O ──────────────────────────────────────────────────
 *
 * pure function。network・storage・server・filesystem に一切触れない。渡された
 * object を検証し、新しい正規化済み object を返すだけである。入力はまず property
 * descriptor から 1 度だけ複製し、以後の検証は複製に対してだけ行う。getter・proxy・
 * 検証後の入力の書き換えは、検証された内容に影響しない。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式のプレーンJSとして
 * 提供する（<script src> と require() の両対応）。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.ProjectPack = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  function resolveDependency(globalName, requirePath, label) {
    if (global && global[globalName]) {
      return global[globalName];
    }
    if (typeof require === 'function') {
      try {
        return require(requirePath);
      } catch (e) {
        /* fallthrough */
      }
    }
    throw new Error('project-pack.js: ' + label + ' is required but not available');
  }

  var Evidence = resolveDependency('ProjectEvidence', './evidence.js', 'project-config/evidence.js');
  var ProjectInput = resolveDependency('ProjectInput', './project-input.js', 'project-config/project-input.js');
  var GlassCalc = resolveDependency('GlassCalc', '../calc.js', 'calc.js');
  var Wind = resolveDependency('WindPressure', '../wind-pressure.js', 'wind-pressure.js');

  // 圧力の安全上限は Project Input Package と同じ値を使う（重複定義しない）。読み込み時に
  // 1 度だけ値を確定させる: ProjectInput の export object は freeze されていないので、
  // 呼び出しのたびに読むと、後から書き換えられた上限で検証してしまう。
  var MAX_PRESSURE = ProjectInput.MAX_PRESSURE;
  if (typeof MAX_PRESSURE !== 'number' || !isFinite(MAX_PRESSURE) || MAX_PRESSURE <= 0) {
    throw new Error('project-pack.js: ProjectInput.MAX_PRESSURE must be a finite positive number');
  }

  // ============================================================
  // Contract
  // ============================================================

  var PACK_TYPE = 'glass_wind_project_pack';
  var SCHEMA_VERSION = 1;

  /** 取りうる trust は 1 つだけ。pack の内容によって変わらない。 */
  var TRUST_UNREVIEWED = 'pack_unreviewed';
  var TRUST_LEVELS = [TRUST_UNREVIEWED];

  var MODE_NOTIFICATION = 'notification1458';
  var MODE_PRESSURE_MAP = 'project_pressure_map';
  var MODE_CASE_DIRECT = 'case_direct';
  var PRESSURE_MODES = [MODE_NOTIFICATION, MODE_PRESSURE_MAP, MODE_CASE_DIRECT];

  var ID_PATTERNS = {
    pane: /^P[0-9]{3,4}$/,
    glazingCase: /^G[0-9]{3,4}$/,
    sourceScope: /^S[0-9]{2,3}$/,
    // 階は中立 token に限る（地下 B1-B9、1-99、R、PH）。棟名・ゾーン名は入らない。
    floor: /^(?:B[1-9]|[1-9][0-9]?|R|PH)$/
  };

  /** 単位は量ごとに 1 つだけ。単位変換は一切しない。 */
  var UNITS = {
    length: 'mm',
    pressure: 'N/m²',
    height: 'm',
    speed: 'm/s'
  };

  var LIMITS = {
    maxDepth: 8,
    maxValues: 50000,
    maxStringLength: 512,
    maxPublicLabelLength: 80,
    maxPanes: 500,
    maxGlazingCases: 2000,
    maxFloors: 120,
    maxSourceScopes: 99,
    maxRecords: 5000
  };

  /**
   * evidence.sourceScopes[].sourceClaim の field。canonical Evidence の field 名
   * （level / checkedAt / privateReferenceAvailable）とは意図的に違えてある（冒頭の説明を参照）。
   */
  var SOURCE_CLAIM_KEYS = ['claimedLevel', 'claimedCheckedAt', 'publicDescription',
    'claimedPrivateReferenceAvailable'];

  var TOP_LEVEL_KEYS = [
    'schemaVersion', 'packType', 'projectMetadata', 'pressureModel',
    'windConditions', 'panes', 'glazingCases', 'evidence'
  ];

  /**
   * pressureModel.mode ごとの windConditions の field。ここに無い field は拒否する。
   * 別 mode の field を持ち込むと、同じ case について風圧の出どころが 2 つになる。
   */
  var WIND_FIELDS = {};
  WIND_FIELDS[MODE_NOTIFICATION] = {
    required: ['basis', 'V0', 'roughnessCategory', 'buildingHeightM', 'eavesHeightM',
      'buildingType', 'evaluationHeights'],
    optional: ['recurrenceYears', 'buildingShortSideM']
  };
  WIND_FIELDS[MODE_PRESSURE_MAP] = {
    required: ['positivePressures', 'negativePressures'],
    optional: ['evaluationHeights']
  };
  WIND_FIELDS[MODE_CASE_DIRECT] = { required: [], optional: [] };

  /**
   * glazing case の field。floor / zone を推測して埋めることはしない。
   * case_direct では floor / zone は文脈としてだけ受け取り、無ければ無いまま残す。
   */
  var CASE_COMMON = ['caseId', 'paneId', 'glassType', 'extraFactor'];
  var CASE_FIELDS = {};
  CASE_FIELDS[MODE_NOTIFICATION] = { required: CASE_COMMON.concat(['floor', 'zone']), optional: [] };
  CASE_FIELDS[MODE_PRESSURE_MAP] = { required: CASE_COMMON.concat(['floor', 'zone']), optional: [] };
  CASE_FIELDS[MODE_CASE_DIRECT] = {
    required: CASE_COMMON.concat(['designPressure']),
    optional: ['floor', 'zone']
  };

  /**
   * evidence.records の subject。kind ごとに参照先・単位・成立する mode が決まっている。
   * 設計値が存在しない対象への record は受け付けない。
   */
  var RECORD_SUBJECTS = {
    pane_width: { refField: 'paneId', unit: UNITS.length, modes: PRESSURE_MODES },
    pane_height: { refField: 'paneId', unit: UNITS.length, modes: PRESSURE_MODES },
    positive_pressure: { refField: 'floor', unit: UNITS.pressure, modes: [MODE_PRESSURE_MAP] },
    negative_pressure_magnitude: { refField: 'zone', unit: UNITS.pressure, modes: [MODE_PRESSURE_MAP] },
    evaluation_height: { refField: 'floor', unit: UNITS.height, modes: [MODE_NOTIFICATION, MODE_PRESSURE_MAP] },
    case_design_pressure: { refField: 'caseId', unit: UNITS.pressure, modes: [MODE_CASE_DIRECT] },
    wind_v0: { refField: null, unit: UNITS.speed, modes: [MODE_NOTIFICATION] }
  };

  // ============================================================
  // helpers
  // ============================================================

  function fail(path, message) {
    throw new Error('Project Pack: ' + path + ': ' + message);
  }

  function show(value) {
    var s = JSON.stringify(value);
    if (typeof s !== 'string') return String(value);
    return s.length > 48 ? s.slice(0, 45) + '...' : s;
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isArrayIndex(name, length) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(name)) return false;
    return Number(name) < length;
  }

  /**
   * 入力を property descriptor から 1 度だけ複製する。ここを通った値だけを以後の検証に使う。
   *
   * 受け付けるのは JSON で表せる純粋なデータだけ: null / boolean / 有限の number /
   * string / 素の object / 素の配列。accessor（getter / setter）は**呼ばずに**拒否する。
   * 呼べば任意のコードが走り、読むたびに違う値を返しうる。
   */
  function cloneAsPlainData(root) {
    var count = 0;
    var path = [];
    function visit(value, where, depth) {
      if (depth > LIMITS.maxDepth) {
        fail(where, 'nesting is deeper than ' + LIMITS.maxDepth + ' levels');
      }
      count += 1;
      if (count > LIMITS.maxValues) {
        fail(where, 'contains more than ' + LIMITS.maxValues + ' values');
      }
      if (value === null) return null;
      var type = typeof value;
      if (type === 'string') {
        if (value.length > LIMITS.maxStringLength) {
          fail(where, 'string is longer than ' + LIMITS.maxStringLength + ' characters');
        }
        return value;
      }
      if (type === 'number') {
        if (!isFinite(value)) fail(where, 'number must be finite');
        return value;
      }
      if (type === 'boolean') return value;
      if (type !== 'object') {
        fail(where, 'unsupported value type ' + show(type) + ' (only JSON data is accepted)');
      }
      if (path.indexOf(value) !== -1) fail(where, 'circular reference');
      if (Object.getOwnPropertySymbols(value).length > 0) {
        fail(where, 'symbol-keyed properties are not accepted');
      }
      path.push(value);
      var out;
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
          fail(where, 'array must not have a custom prototype');
        }
        var lengthDesc = Object.getOwnPropertyDescriptor(value, 'length');
        var length = lengthDesc.value;
        Object.getOwnPropertyNames(value).forEach(function (name) {
          if (name !== 'length' && !isArrayIndex(name, length)) {
            fail(where, 'array carries a non-index property ' + show(name));
          }
        });
        out = [];
        for (var i = 0; i < length; i++) {
          var d = Object.getOwnPropertyDescriptor(value, String(i));
          if (!d) fail(where + '[' + i + ']', 'sparse array (missing element)');
          if (!hasOwn(d, 'value')) fail(where + '[' + i + ']', 'accessor property is not data');
          out.push(visit(d.value, where + '[' + i + ']', depth + 1));
        }
      } else {
        Evidence.assertOrdinaryObject(value, 'Project Pack: ' + where);
        out = {};
        Object.getOwnPropertyNames(value).forEach(function (name) {
          var desc = Object.getOwnPropertyDescriptor(value, name);
          if (!hasOwn(desc, 'value')) {
            fail(where + '.' + name, 'accessor property (getter/setter) is not data');
          }
          if (!desc.enumerable) {
            fail(where + '.' + name, 'non-enumerable property is not data');
          }
          out[name] = visit(desc.value, where + '.' + name, depth + 1);
        });
      }
      path.pop();
      return out;
    }
    return visit(root, 'pack', 1);
  }

  function requireObject(value, where) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail(where, 'must be an object');
    }
    return value;
  }

  function exactKeys(obj, required, optional, where, context) {
    var allowed = required.concat(optional || []);
    Object.keys(obj).forEach(function (k) {
      if (allowed.indexOf(k) === -1) {
        fail(where, 'unexpected field ' + show(k) + (context ? ' ' + context : ''));
      }
    });
    required.forEach(function (k) {
      if (!hasOwn(obj, k)) fail(where, 'missing required field ' + show(k) + (context ? ' ' + context : ''));
    });
    return obj;
  }

  function requireArray(value, where, min, max) {
    if (!Array.isArray(value)) fail(where, 'must be an array');
    if (value.length < min) fail(where, 'must contain at least ' + min + ' item(s)');
    if (value.length > max) fail(where, 'must contain at most ' + max + ' items');
    return value;
  }

  function readId(value, kind, where) {
    if (typeof value !== 'string' || !ID_PATTERNS[kind].test(value)) {
      fail(where, kind + ' id must match ' + ID_PATTERNS[kind] + ' (got ' + show(value) + '). ' +
        'Use a neutral id; real opening marks, drawing numbers, file names, paths and labels ' +
        'are not accepted, and the private mapping stays outside the pack.');
    }
    return value;
  }

  function readOneOf(value, allowed, where) {
    if (typeof value !== 'string' || allowed.indexOf(value) === -1) {
      fail(where, 'must be one of ' + allowed.join(', ') + ' (got ' + show(value) + ')');
    }
    return value;
  }

  function readQuantity(value, unit, where) {
    requireObject(value, where);
    exactKeys(value, ['value', 'unit'], [], where);
    if (value.unit !== unit) {
      fail(where + '.unit', 'must be exactly ' + show(unit) + ' (got ' + show(value.unit) + '). ' +
        'Project Pack performs no unit conversion.');
    }
    if (typeof value.value !== 'number' || !isFinite(value.value)) {
      fail(where + '.value', 'must be a finite number');
    }
    if (value.value <= 0) {
      fail(where + '.value', 'must be greater than 0 (negative pressure is stored as a magnitude)');
    }
    if (unit === UNITS.pressure && value.value > MAX_PRESSURE) {
      fail(where + '.value', 'exceeds the allowed pressure maximum (' + MAX_PRESSURE + ' ' + UNITS.pressure +
        ', shared with Project Input Package)');
    }
    return { value: value.value, unit: unit };
  }

  function rejectDuplicate(seen, key, where, what) {
    if (hasOwn(seen, key)) {
      fail(where, 'duplicate ' + what + ' ' + show(key) + ' (also at ' + seen[key] + ')');
    }
    seen[key] = where;
  }

  function collectAdvisories(text, where, sink) {
    var result = Evidence.lintPublicEvidenceText(text, where);
    (result.warnings || []).forEach(function (w) {
      sink.push({ path: where, rule: w.rule });
    });
  }

  // ============================================================
  // sections
  // ============================================================

  function readProjectMetadata(meta, advisories) {
    requireObject(meta, 'pack.projectMetadata');
    exactKeys(meta, ['publicLabel'], [], 'pack.projectMetadata');
    var label = meta.publicLabel;
    var where = 'pack.projectMetadata.publicLabel';
    if (typeof label !== 'string' || label.trim() === '') fail(where, 'must be a non-empty string');
    if (label.length > LIMITS.maxPublicLabelLength) {
      fail(where, 'must be at most ' + LIMITS.maxPublicLabelLength + ' characters');
    }
    Evidence.assertPublicSafeEvidenceText(label, where);
    collectAdvisories(label, where, advisories);
    return { publicLabel: label };
  }

  function readFloorTable(list, valueField, unit, where) {
    requireArray(list, where, 1, LIMITS.maxFloors);
    var seen = {};
    return list.map(function (row, i) {
      var at = where + '[' + i + ']';
      requireObject(row, at);
      exactKeys(row, ['floor', valueField], [], at);
      var floor = readId(row.floor, 'floor', at + '.floor');
      rejectDuplicate(seen, floor, at, 'floor');
      var out = { floor: floor };
      out[valueField] = readQuantity(row[valueField], unit, at + '.' + valueField);
      return out;
    });
  }

  function floorsOf(rows) {
    return rows.map(function (r) { return r.floor; });
  }

  function readWindConditions(wind, mode) {
    var where = 'pack.windConditions';
    requireObject(wind, where);
    var fields = WIND_FIELDS[mode];
    exactKeys(wind, fields.required, fields.optional, where,
      'for pressureModel.mode ' + show(mode));

    if (mode === MODE_CASE_DIRECT) {
      return {};
    }

    if (mode === MODE_PRESSURE_MAP) {
      var positive = readFloorTable(wind.positivePressures, 'pressure', UNITS.pressure,
        where + '.positivePressures');
      var negWhere = where + '.negativePressures';
      requireArray(wind.negativePressures, negWhere, 1, Wind.ZONES.length);
      var seenZone = {};
      var negative = wind.negativePressures.map(function (row, i) {
        var at = negWhere + '[' + i + ']';
        requireObject(row, at);
        exactKeys(row, ['zone', 'magnitude'], [], at);
        var zone = readOneOf(row.zone, Wind.ZONES, at + '.zone');
        rejectDuplicate(seenZone, zone, at, 'zone');
        return { zone: zone, magnitude: readQuantity(row.magnitude, UNITS.pressure, at + '.magnitude') };
      });
      var out = { positivePressures: positive, negativePressures: negative };
      if (hasOwn(wind, 'evaluationHeights')) {
        var heights = readFloorTable(wind.evaluationHeights, 'height', UNITS.height,
          where + '.evaluationHeights');
        var known = floorsOf(positive);
        heights.forEach(function (h, i) {
          if (known.indexOf(h.floor) === -1) {
            fail(where + '.evaluationHeights[' + i + ']',
              'floor ' + show(h.floor) + ' has no entry in positivePressures');
          }
        });
        out.evaluationHeights = heights;
      }
      return out;
    }

    // notification1458
    var n = {
      basis: readOneOf(wind.basis, Wind.CALCULATION_BASES, where + '.basis'),
      V0: readQuantity(wind.V0, UNITS.speed, where + '.V0'),
      roughnessCategory: readOneOf(wind.roughnessCategory, Wind.ROUGHNESS_CATEGORIES,
        where + '.roughnessCategory'),
      buildingHeightM: readQuantity(wind.buildingHeightM, UNITS.height, where + '.buildingHeightM'),
      eavesHeightM: readQuantity(wind.eavesHeightM, UNITS.height, where + '.eavesHeightM'),
      buildingType: readOneOf(wind.buildingType, Wind.BUILDING_TYPES, where + '.buildingType'),
      evaluationHeights: readFloorTable(wind.evaluationHeights, 'height', UNITS.height,
        where + '.evaluationHeights')
    };
    if (hasOwn(wind, 'recurrenceYears')) {
      if (typeof wind.recurrenceYears !== 'number' || !isFinite(wind.recurrenceYears)) {
        fail(where + '.recurrenceYears', 'must be a number');
      }
      n.recurrenceYears = wind.recurrenceYears;
    }
    if (hasOwn(wind, 'buildingShortSideM')) {
      n.buildingShortSideM = readQuantity(wind.buildingShortSideM, UNITS.height,
        where + '.buildingShortSideM');
    }
    return n;
  }

  function readPanes(list) {
    var where = 'pack.panes';
    requireArray(list, where, 1, LIMITS.maxPanes);
    var seen = {};
    return list.map(function (pane, i) {
      var at = where + '[' + i + ']';
      requireObject(pane, at);
      exactKeys(pane, ['paneId', 'widthMm', 'heightMm'], [], at);
      var paneId = readId(pane.paneId, 'pane', at + '.paneId');
      rejectDuplicate(seen, paneId, at, 'paneId');
      var width = readQuantity(pane.widthMm, UNITS.length, at + '.widthMm');
      var height = readQuantity(pane.heightMm, UNITS.length, at + '.heightMm');
      ProjectInput.assertPaneDimensionMm(width.value, at + '.widthMm.value');
      ProjectInput.assertPaneDimensionMm(height.value, at + '.heightMm.value');
      return { paneId: paneId, widthMm: width, heightMm: height };
    });
  }

  /**
   * notification1458 の case は、wind-pressure.js 自身の入力検証へ委ねる。
   * 風の規則（基準と再現期間、V0 の範囲、高さ、建物種別、区分、粗度）をここへ
   * 写すと、規則が 2 か所になって片方だけ変わる。計算結果は使わず、捨てる。
   */
  function assertWindInputForCase(wind, glazingCase, where) {
    var height = null;
    wind.evaluationHeights.forEach(function (h) {
      if (h.floor === glazingCase.floor) height = h.height.value;
    });
    var input = {
      V0: wind.V0.value,
      roughnessCategory: wind.roughnessCategory,
      buildingHeightM: wind.buildingHeightM.value,
      eavesHeightM: wind.eavesHeightM.value,
      evaluationHeightM: height,
      buildingType: wind.buildingType,
      zone: glazingCase.zone,
      basis: wind.basis
    };
    if (hasOwn(wind, 'recurrenceYears')) input.recurrenceYears = wind.recurrenceYears;
    if (hasOwn(wind, 'buildingShortSideM')) input.buildingShortSideM = wind.buildingShortSideM.value;
    try {
      Wind.calculateWindPressure(input);
    } catch (e) {
      fail(where, 'wind conditions are not a valid notification-1458 input: ' + e.message);
    }
  }

  function readGlazingCases(list, mode, panes, wind) {
    var where = 'pack.glazingCases';
    requireArray(list, where, 1, LIMITS.maxGlazingCases);
    var paneIds = panes.map(function (p) { return p.paneId; });
    var glassTypes = Object.keys(GlassCalc.GLASS_TYPES);
    var seen = {};
    var fields = CASE_FIELDS[mode];

    return list.map(function (c, i) {
      var at = where + '[' + i + ']';
      requireObject(c, at);
      // 二重の真実: 算定または案件 map を使う mode で case が風圧を直接持つと、
      // 同じ case について風圧の出どころが 2 つになる。どちらかを黙って選ばない。
      if (mode !== MODE_CASE_DIRECT && hasOwn(c, 'designPressure')) {
        fail(at, 'double truth: designPressure is only allowed when pressureModel.mode is ' +
          show(MODE_CASE_DIRECT) + '; in ' + show(mode) + ' the pressure comes from ' +
          (mode === MODE_NOTIFICATION ? 'the notification calculation' : 'the project pressure map'));
      }
      exactKeys(c, fields.required, fields.optional, at, 'for pressureModel.mode ' + show(mode));

      var caseId = readId(c.caseId, 'glazingCase', at + '.caseId');
      rejectDuplicate(seen, caseId, at, 'caseId');
      var paneId = readId(c.paneId, 'pane', at + '.paneId');
      if (paneIds.indexOf(paneId) === -1) {
        fail(at + '.paneId', 'references pane ' + show(paneId) + ', which is not declared in pack.panes');
      }
      var out = {
        caseId: caseId,
        paneId: paneId,
        glassType: readOneOf(c.glassType, glassTypes, at + '.glassType'),
        extraFactor: ProjectInput.assertExtraFactor(c.extraFactor)
      };

      if (hasOwn(c, 'floor')) out.floor = readId(c.floor, 'floor', at + '.floor');
      if (hasOwn(c, 'zone')) out.zone = readOneOf(c.zone, Wind.ZONES, at + '.zone');

      if (mode === MODE_CASE_DIRECT) {
        out.designPressure = readQuantity(c.designPressure, UNITS.pressure, at + '.designPressure');
      } else if (mode === MODE_PRESSURE_MAP) {
        if (floorsOf(wind.positivePressures).indexOf(out.floor) === -1) {
          fail(at + '.floor', 'floor ' + show(out.floor) + ' has no entry in windConditions.positivePressures');
        }
        var zones = wind.negativePressures.map(function (n) { return n.zone; });
        if (zones.indexOf(out.zone) === -1) {
          fail(at + '.zone', 'zone ' + show(out.zone) + ' has no entry in windConditions.negativePressures');
        }
      } else {
        if (floorsOf(wind.evaluationHeights).indexOf(out.floor) === -1) {
          fail(at + '.floor', 'floor ' + show(out.floor) + ' has no entry in windConditions.evaluationHeights');
        }
        assertWindInputForCase(wind, out, at);
      }
      return out;
    });
  }

  function readEvidence(ev, mode, panes, cases, wind, advisories) {
    var where = 'pack.evidence';
    requireObject(ev, where);
    exactKeys(ev, ['sourceScopes', 'records'], [], where);

    var scopeWhere = where + '.sourceScopes';
    requireArray(ev.sourceScopes, scopeWhere, 0, LIMITS.maxSourceScopes);
    var seenScope = {};
    var scopes = ev.sourceScopes.map(function (s, i) {
      var at = scopeWhere + '[' + i + ']';
      requireObject(s, at);
      exactKeys(s, ['sourceScopeId', 'sourceClaim'], [], at);
      var id = readId(s.sourceScopeId, 'sourceScope', at + '.sourceScopeId');
      rejectDuplicate(seenScope, id, at, 'sourceScopeId');
      var claimWhere = at + '.sourceClaim';
      var c = requireObject(s.sourceClaim, claimWhere);
      exactKeys(c, SOURCE_CLAIM_KEYS, [], claimWhere);
      // level / checkedAt / public-safe prose / boolean の検証は canonical な Evidence 契約に
      // 委ねる（規則を写さない）。戻り値は promotion gate を通りうる canonical Evidence なので、
      // 検証にだけ使って捨てる。返すのは claimed* の名前を持つ申告だけである。
      try {
        Evidence.makeEvidence(c.claimedLevel, c.claimedCheckedAt, c.publicDescription,
          c.claimedPrivateReferenceAvailable);
      } catch (e) {
        fail(claimWhere, 'is not a valid source claim: ' + e.message);
      }
      collectAdvisories(c.publicDescription, claimWhere + '.publicDescription', advisories);
      return {
        sourceScopeId: id,
        sourceClaim: {
          claimedLevel: c.claimedLevel,
          claimedCheckedAt: c.claimedCheckedAt,
          publicDescription: c.publicDescription,
          claimedPrivateReferenceAvailable: c.claimedPrivateReferenceAvailable
        }
      };
    });

    var targets = {
      paneId: panes.map(function (p) { return p.paneId; }),
      caseId: cases.map(function (c) { return c.caseId; }),
      positiveFloor: wind.positivePressures ? floorsOf(wind.positivePressures) : [],
      zone: wind.negativePressures ? wind.negativePressures.map(function (n) { return n.zone; }) : [],
      heightFloor: wind.evaluationHeights ? floorsOf(wind.evaluationHeights) : []
    };

    var recWhere = where + '.records';
    requireArray(ev.records, recWhere, 0, LIMITS.maxRecords);
    var seenSubject = {};
    var records = ev.records.map(function (r, i) {
      var at = recWhere + '[' + i + ']';
      requireObject(r, at);
      exactKeys(r, ['sourceScopeId', 'subject', 'quantity'], [], at);
      var scopeId = readId(r.sourceScopeId, 'sourceScope', at + '.sourceScopeId');
      if (!hasOwn(seenScope, scopeId)) {
        fail(at + '.sourceScopeId', 'references source scope ' + show(scopeId) + ', which is not declared');
      }
      var subject = requireObject(r.subject, at + '.subject');
      var kind = readOneOf(subject.kind, Object.keys(RECORD_SUBJECTS), at + '.subject.kind');
      var spec = RECORD_SUBJECTS[kind];
      if (spec.modes.indexOf(mode) === -1) {
        fail(at + '.subject', 'a ' + show(kind) + ' record has no design value to refer to when ' +
          'pressureModel.mode is ' + show(mode));
      }
      var normalizedSubject = { kind: kind };
      if (spec.refField === null) {
        exactKeys(subject, ['kind'], [], at + '.subject');
      } else {
        exactKeys(subject, ['kind', spec.refField], [], at + '.subject');
        var ref = subject[spec.refField];
        var known;
        if (spec.refField === 'paneId') { readId(ref, 'pane', at + '.subject.paneId'); known = targets.paneId; }
        else if (spec.refField === 'caseId') { readId(ref, 'glazingCase', at + '.subject.caseId'); known = targets.caseId; }
        else if (spec.refField === 'zone') { readOneOf(ref, Wind.ZONES, at + '.subject.zone'); known = targets.zone; }
        else {
          readId(ref, 'floor', at + '.subject.floor');
          known = kind === 'positive_pressure' ? targets.positiveFloor : targets.heightFloor;
        }
        if (known.indexOf(ref) === -1) {
          fail(at + '.subject.' + spec.refField, 'refers to ' + show(ref) +
            ', for which the pack declares no design value');
        }
        normalizedSubject[spec.refField] = ref;
      }
      var subjectKey = kind + (spec.refField === null ? '' : '|' + normalizedSubject[spec.refField]);
      // 1 つの対象に複数の record を置くには、どれを採るかの明示的な設計が要る。黙って選ばない。
      rejectDuplicate(seenSubject, subjectKey, at, 'record subject');
      var quantity = readQuantity(r.quantity, spec.unit, at + '.quantity');
      // pane 寸法の record にも panes と同じ canonical 上限をかける。上限は書き写さず、
      // readPanes() と同じ ProjectInput の契約を呼ぶ（mm の record は pane 寸法だけ）。
      if (spec.unit === UNITS.length) {
        ProjectInput.assertPaneDimensionMm(quantity.value, at + '.quantity.value');
      }
      return {
        sourceScopeId: scopeId,
        subject: normalizedSubject,
        quantity: quantity
      };
    });

    return { sourceScopes: scopes, records: records };
  }

  function byKey(field) {
    return function (a, b) {
      return a[field] < b[field] ? -1 : (a[field] > b[field] ? 1 : 0);
    };
  }

  // ============================================================
  // entry point
  // ============================================================

  /**
   * Project Pack を検証し、新しい正規化済み object を返す（pure、deep-frozen）。
   *
   * 返り値の trust は常に 'pack_unreviewed'。返り値は入力 format ではない
   * （trust field を含むので、そのまま入力へ戻すと未知 key として拒否される）。
   * 検証に失敗した pack は一部だけ受け入れることをせず、例外で全体を拒否する。
   */
  function validateProjectPack(pack) {
    var data = cloneAsPlainData(pack);
    requireObject(data, 'pack');
    exactKeys(data, TOP_LEVEL_KEYS, [], 'pack');

    if (data.schemaVersion !== SCHEMA_VERSION) {
      fail('pack.schemaVersion', 'must be ' + SCHEMA_VERSION + ' (got ' + show(data.schemaVersion) + ')');
    }
    if (data.packType !== PACK_TYPE) {
      fail('pack.packType', 'must be ' + show(PACK_TYPE) + ' (got ' + show(data.packType) + ')');
    }

    var advisories = [];
    var metadata = readProjectMetadata(data.projectMetadata, advisories);

    requireObject(data.pressureModel, 'pack.pressureModel');
    exactKeys(data.pressureModel, ['mode'], [], 'pack.pressureModel');
    var mode = readOneOf(data.pressureModel.mode, PRESSURE_MODES, 'pack.pressureModel.mode');

    var wind = readWindConditions(data.windConditions, mode);
    var panes = readPanes(data.panes);
    var cases = readGlazingCases(data.glazingCases, mode, panes, wind);
    var evidence = readEvidence(data.evidence, mode, panes, cases, wind, advisories);

    return Evidence.deepFreeze({
      packType: PACK_TYPE,
      schemaVersion: SCHEMA_VERSION,
      trust: TRUST_UNREVIEWED,
      projectMetadata: metadata,
      pressureModel: { mode: mode },
      windConditions: wind,
      panes: panes.slice().sort(byKey('paneId')),
      glazingCases: cases.slice().sort(byKey('caseId')),
      evidence: {
        sourceScopes: evidence.sourceScopes.slice().sort(byKey('sourceScopeId')),
        records: evidence.records
      },
      publicationAdvisories: advisories
    });
  }

  return Evidence.deepFreeze({
    PACK_TYPE: PACK_TYPE,
    SCHEMA_VERSION: SCHEMA_VERSION,
    TRUST_LEVELS: TRUST_LEVELS,
    PRESSURE_MODES: PRESSURE_MODES,
    ID_PATTERNS: ID_PATTERNS,
    UNITS: UNITS,
    LIMITS: LIMITS,
    TOP_LEVEL_KEYS: TOP_LEVEL_KEYS,
    WIND_FIELDS: WIND_FIELDS,
    CASE_FIELDS: CASE_FIELDS,
    RECORD_SUBJECTS: RECORD_SUBJECTS,
    SOURCE_CLAIM_KEYS: SOURCE_CLAIM_KEYS,
    validateProjectPack: validateProjectPack
  });
});
