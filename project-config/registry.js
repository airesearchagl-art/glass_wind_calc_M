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
 *
 * 静的HTML/JS構成・ビルド不要という制約を維持するため、UMD形式の
 * プレーンJSとして提供する（<script src> と require() の両対応）。
 * ブラウザでは calc.js / miyoshi.js / manual.js の後に読み込むこと。
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
  var BUILT_IN_PRESET_MODULES = [
    { projectId: 'miyoshi', nodePath: './miyoshi.js', globalName: 'MiyoshiProjectConfig' }
  ];

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

  // 既定registryにbuilt-in presetを登録する。
  var defaultRegistry = createRegistry();
  for (var i = 0; i < BUILT_IN_PRESET_MODULES.length; i++) {
    var entry = BUILT_IN_PRESET_MODULES[i];
    var cfg = resolveBuiltIn(entry);
    if (cfg) {
      defaultRegistry.registerPreset(cfg);
    }
  }

  return {
    createRegistry: createRegistry,
    registerPreset: function (config) { return defaultRegistry.registerPreset(config); },
    getPreset: function (projectId) { return defaultRegistry.getPreset(projectId); },
    hasPreset: function (projectId) { return defaultRegistry.hasPreset(projectId); },
    listPresets: function () { return defaultRegistry.listPresets(); },
    BUILT_IN_PRESET_IDS: BUILT_IN_PRESET_MODULES.map(function (e) { return e.projectId; })
  };
});
