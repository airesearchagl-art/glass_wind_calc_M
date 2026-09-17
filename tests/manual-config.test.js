'use strict';

/**
 * Phase 2C: project-config/manual.js のテスト（Wave 2, AC-02/AC-03/AC-09）。
 *
 * - Manual modeがMiyoshiのpressure presetを暗黙適用しないこと
 *   （manual.jsがmiyoshi.jsに一切依存していないこと）を確認する。
 * - Manual入力値が "user_input"（非verified）として明確に扱われること
 *   を確認する。
 * - designP = max(abs(positivePressure), abs(negativePressure)) の
 *   必須回帰ケースを固定する。
 * - 不正な入力（非数値・NaN・0以下の寸法等）が例外で拒否されることを
 *   確認する。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ManualProjectConfig = require('../project-config/manual.js');

test('manual-config: projectId/publicLabelが定義されている', () => {
  assert.equal(ManualProjectConfig.projectId, 'manual');
  assert.equal(ManualProjectConfig.getPublicLabel(), '手入力 (Manual / Generic)');
});

test('manual-config: identityは常にunverified（ツールがverifiedを主張しない。AC-03）', () => {
  assert.equal(ManualProjectConfig.identity.verificationStatus, 'unverified');
  assert.equal(ManualProjectConfig.identity.evidence.level, 'none');
});

test('manual-config: hasFixedPreset === false（固定プリセットを一切保持しない）', () => {
  assert.equal(ManualProjectConfig.hasFixedPreset, false);
});

test('manual-config: manual.jsのソースはmiyoshi.jsをrequireしない（no Miyoshi leakage, AC-02）', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'project-config', 'manual.js'), 'utf8');
  assert.doesNotMatch(src, /require\(['"].*miyoshi/i, 'manual.jsはmiyoshi.jsに依存してはならない');
  assert.doesNotMatch(src, /MiyoshiProjectConfig/, 'manual.jsはMiyoshiProjectConfigを参照してはならない');
  // みよし案件プリセットの数値（正圧・負圧）がmanual.js内にハードコードされて
  // いないことも確認する（暗黙適用の防止）。
  assert.doesNotMatch(src, /\b1297\b|\b1525\b|\b1695\b|\b1729\b|\b918\b|\b1122\b/);
});

/* ============================================================
   代表ケース: designP = max(abs(positivePressure), abs(negativePressure))
============================================================ */

test('必須回帰: Manual W=1250/H=2050/positive=1400/negative=-1000 → designP=1400', () => {
  const result = ManualProjectConfig.buildManualDesignInput({
    W: 1250, H: 2050, positivePressure: 1400, negativePressure: -1000
  });
  assert.equal(result.designP, 1400);
  assert.equal(result.W, 1250);
  assert.equal(result.H, 2050);
  assert.equal(result.source, 'user_input');
  assert.equal(result.verificationStatus, 'unverified');
  assert.equal(result.extraFactor, 1.0);
});

test('manual-config: designPは絶対値の大きい方（負圧側が大きいケース）', () => {
  const result = ManualProjectConfig.buildManualDesignInput({
    W: 1000, H: 1000, positivePressure: 800, negativePressure: -1200
  });
  assert.equal(result.designP, 1200);
});

test('manual-config: 負圧を正の数で入力しても絶対値で扱われる（符号を強制しない）', () => {
  const result = ManualProjectConfig.buildManualDesignInput({
    W: 1000, H: 1000, positivePressure: 800, negativePressure: 1200
  });
  assert.equal(result.designP, 1200);
});

test('manual-config: extraFactor省略時は既定値1.00', () => {
  const result = ManualProjectConfig.buildManualDesignInput({
    W: 1250, H: 2050, positivePressure: 1400, negativePressure: -1000
  });
  assert.equal(result.extraFactor, 1.0);
});

test('manual-config: extraFactorを明示指定できる', () => {
  const result = ManualProjectConfig.buildManualDesignInput({
    W: 1250, H: 2050, positivePressure: 1400, negativePressure: -1000, extraFactor: 0.9
  });
  assert.equal(result.extraFactor, 0.9);
});

/* ============================================================
   不正入力の拒否（AC-09: manual invalid inputs）
============================================================ */

test('manual-config: 不正なW/Hを例外で拒否する', () => {
  const base = { W: 1250, H: 2050, positivePressure: 1400, negativePressure: -1000 };
  for (const bad of [0, -1, NaN, 'abc', null, undefined, {}]) {
    assert.throws(() => ManualProjectConfig.buildManualDesignInput(Object.assign({}, base, { W: bad })));
    assert.throws(() => ManualProjectConfig.buildManualDesignInput(Object.assign({}, base, { H: bad })));
  }
});

test('manual-config: 不正な圧力値（非数値・NaN）を例外で拒否する', () => {
  const base = { W: 1250, H: 2050, positivePressure: 1400, negativePressure: -1000 };
  for (const bad of [NaN, 'abc', null, undefined, {}, Infinity, -Infinity]) {
    assert.throws(() => ManualProjectConfig.buildManualDesignInput(Object.assign({}, base, { positivePressure: bad })));
    assert.throws(() => ManualProjectConfig.buildManualDesignInput(Object.assign({}, base, { negativePressure: bad })));
  }
});

test('manual-config: 圧力値0は有限数として許容される（設計風圧0は物理的にありえないが、入力値としては数値エラーではない）', () => {
  assert.doesNotThrow(() => ManualProjectConfig.buildManualDesignInput({
    W: 1250, H: 2050, positivePressure: 0, negativePressure: -500
  }));
});

test('manual-config: 不正なextraFactor（0以下・非数値）を例外で拒否する', () => {
  const base = { W: 1250, H: 2050, positivePressure: 1400, negativePressure: -1000 };
  for (const bad of [0, -1, NaN, 'abc']) {
    assert.throws(() => ManualProjectConfig.buildManualDesignInput(Object.assign({}, base, { extraFactor: bad })));
  }
});

test('manual-config: inputがobjectでない場合は例外を投げる', () => {
  for (const bad of [null, undefined, 'string', 123, []]) {
    assert.throws(() => ManualProjectConfig.buildManualDesignInput(bad));
  }
});
