/**
 * project-config/registry.js
 *
 * Generic preset registry（Phase 2D, AC-04）。
 *
 * 案件presetを projectId で登録・参照するための境界。個別案件モジュール
 * （project-config/miyoshi.js 等）を直接globalで掴む代わりに、この
 * registry経由でlookupできるようにする。
 *
 * trust boundary:
 *   - registered presetとして登録できるのは、**repository内のbuilt-in config**
 *     だけである。registryはimport pathを一切持たず、外部JSONやユーザー入力から
 *     presetを登録する経路を提供しない。
 *   - したがって「registered presetがverified stateを持てる」のは、
 *     repository内のコードがそのconfigを同梱している場合に限られる。
 *   - 手入力（project-config/manual.js）はpresetではなく入力modeであり、
 *     trusted presetとして登録できない（`hasFixedPreset !== true` をrejectする）。
 *   - unknown projectId は fail closed（undefinedを返さず例外を投げる）。
 *   - **registry にあること ≠ repository の built-in であること**（Phase 2L-B2 RF-16-01）。
 *     registerPreset() は公開されており、形の要件を満たす config なら後からでも登録できる。
 *     built-in であることは、bootstrap 時に BUILT_IN_PRESET_MODULES から捕まえた
 *     module instance の**同一性**だけで決まり、getBuiltInPreset() がそれだけを返す。
 *     後から登録した config は getPreset() では引けても、getBuiltInPreset() では引けない。
 *     export する BUILT_IN_PRESET_IDS は参照用の凍結した写しで、権威ではない。
 *     将来 built-in（合成 sample preset を含む）を足すときは、BUILT_IN_PRESET_MODULES に
 *     source として追加する（review を通る経路だけが built-in を作る）。
 *   - **runtime default は選択の方針であって trust の方針ではない**（Phase 2L-B2 / S3-A）。
 *     BUILT_IN_PRESET_MODULES の宣言で runtimeDefault: true のものが**ちょうど 1 件**あり、
 *     その module が今の環境で built-in として捕まえられているときだけ、
 *     getRuntimeDefaultBuiltInPresetId() がその id を返す。0 件・2 件以上・module 未読込は
 *     fail closed で、別の built-in や id 一覧の先頭へ fallback しない。後から registerPreset()
 *     した config は built-in ではないので runtime default になれない。trust の判定は
 *     引き続き getBuiltInPreset() の同一性だけで決まる。
 *   - built-in の宣言は 2 件ある。合成サンプル（sample.js、runtimeDefault: true）は公開 browser
 *     runtime の標準で、index.html はこれだけを読み込む。以前の案件 preset（runtimeDefault: false）は
 *     legacy validation 用で、Node では require() で捕まえられるが、browser では読み込まない。
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式の
 * プレーンJSとして提供する（<script src> と require() の両対応）。
 * ブラウザでは calc.js / sample.js / manual.js の後に読み込むこと。
 */
(function (global, factory) {
  var mod = factory(global);
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = mod;
  }
  if (typeof global === 'object') {
    global.PresetRegistry = mod;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (global) {
  'use strict';

  // repository内のbuilt-in preset。ここに列挙されたものだけが
  // registered presetになり得る（外部入力からは追加できない）。
  // runtimeDefault は公開 runtime が既定で使う built-in の宣言（選択の方針。trust ではない）。
  var BUILT_IN_PRESET_MODULES = [
    { projectId: 'miyoshi', nodePath: './miyoshi.js', globalName: 'MiyoshiProjectConfig', runtimeDefault: false },
    { projectId: 'synthetic-sample', nodePath: './sample.js', globalName: 'SyntheticSampleProjectConfig', runtimeDefault: true }
  ];
  // 宣言は bootstrap 時に 1 度だけ読む（以後この配列を書き換える経路は無い）。
  var RUNTIME_DEFAULT_DECLARATIONS = Object.freeze(BUILT_IN_PRESET_MODULES
    .filter(function (e) { return e.runtimeDefault === true; })
    .map(function (e) { return e.projectId; }));

  var MAX_PROJECT_ID_LENGTH = 64;
  var PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

  function isPlainString(v) {
    return typeof v === 'string' && v.length > 0;
  }

  /**
   * registered presetとして受け入れ可能なconfigかどうかを検証する。
   * 違反があれば例外を投げる（fail closed）。
   */
  function assertRegistrablePreset(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('registerPreset(): preset config must be an object');
    }
    if (!isPlainString(config.projectId)) {
      throw new Error('registerPreset(): preset config must have a non-empty string projectId');
    }
    if (config.projectId.length > MAX_PROJECT_ID_LENGTH) {
      throw new Error('registerPreset(): projectId is too long');
    }
    if (!PROJECT_ID_PATTERN.test(config.projectId)) {
      throw new Error('registerPreset(): projectId must match ' + PROJECT_ID_PATTERN);
    }
    // 手入力モジュール等、固定presetを持たないものはregistered presetにしない。
    // （AC-04: manual inputをtrusted presetとして登録しない）
    if (config.hasFixedPreset !== true) {
      throw new Error(
        'registerPreset(): only built-in project presets (hasFixedPreset === true) can be registered as trusted presets: ' +
        config.projectId
      );
    }
    // 公開ラベルは必ず fail-closed な getPublicLabel() 経由で取得する。
    if (typeof config.getPublicLabel !== 'function') {
      throw new Error('registerPreset(): preset config must expose getPublicLabel()');
    }
    var label = config.getPublicLabel();
    if (!isPlainString(label)) {
      throw new Error('registerPreset(): getPublicLabel() must return a non-empty string');
    }
    return true;
  }

  function createRegistry() {
    var presets = Object.create(null);

    return {
      registerPreset: function (config) {
        assertRegistrablePreset(config);
        if (Object.prototype.hasOwnProperty.call(presets, config.projectId)) {
          throw new Error('registerPreset(): duplicate projectId is not allowed: ' + config.projectId);
        }
        presets[config.projectId] = config;
        return config.projectId;
      },

      // unknown projectIdはundefinedを返さず例外（fail closed）。
      getPreset: function (projectId) {
        if (!isPlainString(projectId) || !Object.prototype.hasOwnProperty.call(presets, projectId)) {
          throw new Error('getPreset(): unknown projectId: ' + JSON.stringify(projectId));
        }
        return presets[projectId];
      },

      hasPreset: function (projectId) {
        return isPlainString(projectId) && Object.prototype.hasOwnProperty.call(presets, projectId);
      },

      // 公開ラベルは各configのgetPublicLabel()境界のみを経由する
      // （projectName等の内部呼称へフォールバックしない）。
      listPresets: function () {
        return Object.keys(presets).sort().map(function (id) {
          return { projectId: id, publicLabel: presets[id].getPublicLabel() };
        });
      }
    };
  }

  function resolveBuiltIn(entry) {
    if (global && global[entry.globalName]) {
      return global[entry.globalName];
    }
    if (typeof require === 'function') {
      try {
        return require(entry.nodePath);
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  // 既定registryにbuilt-in presetを登録し、同時にその module instance を捕まえる。
  // builtInPresets はこの bootstrap でだけ書かれ、以後どの関数からも書き換えられない。
  var defaultRegistry = createRegistry();
  var builtInPresets = Object.create(null);
  for (var i = 0; i < BUILT_IN_PRESET_MODULES.length; i++) {
    var entry = BUILT_IN_PRESET_MODULES[i];
    var cfg = resolveBuiltIn(entry);
    if (cfg) {
      defaultRegistry.registerPreset(cfg);
      // 宣言した projectId と config 自身の projectId が一致するものだけを built-in とする
      if (cfg.projectId === entry.projectId) {
        builtInPresets[entry.projectId] = cfg;
      }
    }
  }

  /**
   * repository の built-in preset を返す（bootstrap で捕まえた module instance そのもの）。
   * 後から registerPreset() で登録された config は返さない（fail closed）。
   * built-in の trust を必要とする consumer はこの境界を使う。
   */
  function getBuiltInPreset(projectId) {
    if (!isPlainString(projectId) || !Object.prototype.hasOwnProperty.call(builtInPresets, projectId)) {
      throw new Error('getBuiltInPreset(): not a repository built-in preset: ' + JSON.stringify(projectId));
    }
    var builtIn = builtInPresets[projectId];
    // registry は重複登録を拒否するので食い違わないはずだが、食い違えば信用しない
    if (defaultRegistry.getPreset(projectId) !== builtIn) {
      throw new Error('getBuiltInPreset(): registry entry for ' + JSON.stringify(projectId) +
        ' is not the captured built-in instance');
    }
    return builtIn;
  }

  /**
   * 公開 runtime が既定で使う built-in の projectId（Phase 2L-B2 / S3-A）。
   *
   * 宣言上 runtimeDefault: true がちょうど 1 件で、その module が今の環境で built-in として
   * 捕まえられているときだけ返す。そうでなければ例外（fail closed）。別の built-in・
   * BUILT_IN_PRESET_IDS の先頭・後から registerPreset() された config へは fallback しない。
   */
  function getRuntimeDefaultBuiltInPresetId() {
    if (RUNTIME_DEFAULT_DECLARATIONS.length !== 1) {
      throw new Error('getRuntimeDefaultBuiltInPresetId(): exactly one built-in must be declared runtimeDefault (found ' +
        RUNTIME_DEFAULT_DECLARATIONS.length + ')');
    }
    var projectId = RUNTIME_DEFAULT_DECLARATIONS[0];
    if (!Object.prototype.hasOwnProperty.call(builtInPresets, projectId)) {
      throw new Error('getRuntimeDefaultBuiltInPresetId(): the runtime-default built-in ' + JSON.stringify(projectId) +
        ' is not loaded in this environment');
    }
    getBuiltInPreset(projectId);   // registry との同一性も確かめる（食い違えば例外）
    return projectId;
  }

  // export object も凍結する: 後から getBuiltInPreset や BUILT_IN_PRESET_IDS を差し替えて
  // built-in の判定を変えることはできない。
  return Object.freeze({
    createRegistry: createRegistry,
    registerPreset: function (config) { return defaultRegistry.registerPreset(config); },
    getPreset: function (projectId) { return defaultRegistry.getPreset(projectId); },
    hasPreset: function (projectId) { return defaultRegistry.hasPreset(projectId); },
    listPresets: function () { return defaultRegistry.listPresets(); },
    getBuiltInPreset: getBuiltInPreset,
    getRuntimeDefaultBuiltInPresetId: getRuntimeDefaultBuiltInPresetId,
    // 参照用の凍結した写し。trust の判定にも runtime default の選択にも使わない
    // （getBuiltInPreset() / getRuntimeDefaultBuiltInPresetId() を使う）。
    BUILT_IN_PRESET_IDS: Object.freeze(BUILT_IN_PRESET_MODULES.map(function (e) { return e.projectId; }))
  });
});
