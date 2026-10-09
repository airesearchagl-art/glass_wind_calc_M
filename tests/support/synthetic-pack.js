'use strict';

/**
 * 合成の Project Pack（多ケース）をその場で作る。テストと browser harness の負荷・競合の確認用。
 *
 * 値はすべて index から決まる単純な数列で、実在の建物・案件とは対応しない（実案件の値は入れない）。
 * ファイルとして保存しない（呼ぶたびに作る）。ProjectPack の検証器・adapter・executor は呼ばない。
 *
 *   syntheticPack(caseCount, mode, options)
 *     caseCount  1–2000（G0001 から連番）
 *     mode       'notification1458' | 'project_pressure_map' | 'case_direct'
 *     options    { label, paneCount, designPressureOf(i) }（case_direct の設計風圧を差し替えるとき）
 */
const GLASS_TYPES = ['fl_single', 'lowe_fl', 'fl_fl', 'tp_single'];
const FLOORS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];
const PRESSURE_UNIT = 'N/m²';

const pad = (n) => String(n).padStart(4, '0');

function syntheticPack(caseCount, mode, options) {
  const opts = options || {};
  if (!(Number.isInteger(caseCount) && caseCount >= 1 && caseCount <= 2000)) throw new Error('caseCount must be 1-2000');
  const paneCount = opts.paneCount || Math.min(500, Math.max(1, Math.ceil(caseCount / 4)));
  const panes = [];
  for (let i = 0; i < paneCount; i++) {
    panes.push({ paneId: 'P' + pad(i + 1), widthMm: { value: 600 + (i * 7) % 900, unit: 'mm' },
      heightMm: { value: 1200 + (i * 13) % 1300, unit: 'mm' } });
  }
  const cases = [];
  for (let i = 0; i < caseCount; i++) {
    const c = { caseId: 'G' + pad(i + 1), paneId: panes[(i * 3) % paneCount].paneId,
      glassType: GLASS_TYPES[i % GLASS_TYPES.length], extraFactor: 1.0 };
    if (mode === 'case_direct') {
      const p = opts.designPressureOf ? opts.designPressureOf(i) : 1000 + (i * 11) % 900;
      c.designPressure = { value: p, unit: PRESSURE_UNIT };
    } else {
      c.floor = FLOORS[i % FLOORS.length];
      c.zone = i % 3 === 0 ? 'corner' : 'general';
    }
    cases.push(c);
  }
  let windConditions;
  if (mode === 'notification1458') {
    windConditions = { basis: 'notification_baseline', V0: { value: 30, unit: 'm/s' }, roughnessCategory: 'II',
      buildingHeightM: { value: 70, unit: 'm' }, eavesHeightM: { value: 69, unit: 'm' }, buildingType: 'closed',
      evaluationHeights: FLOORS.map((f, k) => ({ floor: f, height: { value: Math.round(34 * (k + 1)) / 10, unit: 'm' } })) };
  } else if (mode === 'project_pressure_map') {
    windConditions = {
      positivePressures: FLOORS.map((f, k) => ({ floor: f, pressure: { value: 1000 + 10 * k, unit: PRESSURE_UNIT } })),
      negativePressures: [{ zone: 'general', magnitude: { value: 1500, unit: PRESSURE_UNIT } },
        { zone: 'corner', magnitude: { value: 1800, unit: PRESSURE_UNIT } }] };
  } else if (mode === 'case_direct') {
    windConditions = {};
  } else {
    throw new Error('unknown mode');
  }
  return {
    schemaVersion: 1,
    packType: 'glass_wind_project_pack',
    projectMetadata: { publicLabel: opts.label || ('Synthetic Stress ' + caseCount) },
    pressureModel: { mode },
    windConditions,
    panes,
    glazingCases: cases,
    evidence: {
      sourceScopes: [{ sourceScopeId: 'S01', sourceClaim: { claimedLevel: 'none', claimedCheckedAt: '2026-01-01',
        publicDescription: '合成の負荷確認用（実案件ではない）', claimedPrivateReferenceAvailable: false } }],
      records: []
    }
  };
}

module.exports = { syntheticPack, GLASS_TYPES };
