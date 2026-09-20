'use strict';

/**
 * Phase 2F: 案件非依存 Evidence Ledger / case promotion / reconciliation のテスト。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Ledger = require('../project-config/evidence-ledger.js');
const Evidence = require('../project-config/evidence.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');

const PUBLIC_OK = 'https://www.mlit.go.jp/jutakukentiku/build/content/H12-1454.pdf';
const primary = (priv) => Evidence.makeEvidence('primary', '2026-09-20', '一次資料で直接確認', priv);
const indirect = () => Evidence.makeEvidence('indirect', '2026-09-20', '間接的に整合を確認', false);
const none = () => Evidence.makeEvidence('none', null, '未確認', false);

function verifiedEntry(factKey, value, unit) {
  return { factKey, value, unit: unit || null, verificationStatus: 'verified', evidence: primary(true) };
}

/* ============================================================
   AC-03 Ledger基本契約
============================================================ */

test('AC-03: Ledgerはfield単位のfactを検証状況付きで保持する', () => {
  const led = Ledger.createLedger();
  led.add({ factKey: 'pane_width_mm', value: 1200, unit: 'mm',
            verificationStatus: 'verified', evidence: primary(true) });
  led.add({ factKey: 'positive_pressure', value: 1500, unit: 'N/m2',
            verificationStatus: 'partially_verified', evidence: indirect() });

  assert.equal(led.size(), 2);
  assert.deepEqual(led.listFactKeys(), ['pane_width_mm', 'positive_pressure']);
  assert.deepEqual(led.listVerifiedFactKeys(), ['pane_width_mm']);

  const e = led.get('pane_width_mm');
  assert.equal(e.value, 1200);
  assert.equal(e.unit, 'mm');
  assert.equal(e.evidence.level, 'primary');
  assert.equal(e.sourceReference, null, 'private evidenceは所在を保持しない');
});

test('AC-03: 未登録factKeyはfail closed、重複追加も拒否', () => {
  const led = Ledger.createLedger();
  assert.throws(() => led.get('pane_width_mm'), /no entry for factKey/);
  assert.equal(led.find('pane_width_mm'), null);
  assert.equal(led.has('pane_width_mm'), false);

  led.add(verifiedEntry('pane_width_mm', 1200, 'mm'));
  assert.throws(() => led.add(verifiedEntry('pane_width_mm', 9999, 'mm')), /already has an entry/);
  assert.equal(led.get('pane_width_mm').value, 1200, '上書きされていない');
});

test('AC-01: factKeyにprivate filename / IDを使えない', () => {
  const led = Ledger.createLedger();
  for (const bad of ['secret-drawing-A-102.pdf', '/home/user/x', 'A-102 図面', '',
                     'drive.google.com/abc', 'x'.repeat(100)]) {
    assert.throws(() => led.add(Object.assign(verifiedEntry('k', 1), { factKey: bad })),
      /factKey must match/, JSON.stringify(bad) + ' はrejectされるはず');
  }
  // §8の推奨キーはすべて通る
  for (const k of Ledger.KNOWN_FACT_KEYS) {
    const l2 = Ledger.createLedger();
    assert.doesNotThrow(() => l2.add(verifiedEntry(k, 1)), k + ' は使えること');
  }
});

test('AC-04: Ledger entryはpromotion gateを迂回できない', () => {
  const led = Ledger.createLedger();
  // primary + checkedAt でも referenceが無ければ verified entry は作れない
  assert.throws(
    () => led.add({ factKey: 'pane_width_mm', value: 1200, unit: 'mm',
                    verificationStatus: 'verified', evidence: primary(false) }),
    /promotion gate/
  );
  // public primary reference があれば作れる
  assert.doesNotThrow(
    () => led.add({ factKey: 'pane_width_mm', value: 1200, unit: 'mm',
                    verificationStatus: 'verified', evidence: primary(false),
                    sourceReference: Evidence.makePublicPrimarySourceReference(PUBLIC_OK) })
  );
  // indirect evidence で verified は名乗れない（既存guard）
  const l2 = Ledger.createLedger();
  assert.throws(
    () => l2.add({ factKey: 'pane_width_mm', value: 1200, unit: 'mm',
                   verificationStatus: 'verified', evidence: indirect() }),
    /requires evidence\.level === "primary"/
  );
});

test('AC-01: Ledgerはprivate locationを保持できない', () => {
  const led = Ledger.createLedger();
  for (const bad of ['https://drive.google.com/file/d/abc',
                     'https://contoso.sharepoint.com/x',
                     'https://localhost/doc', '/home/user/secret.pdf', 'x']) {
    assert.throws(
      () => led.add({ factKey: 'pane_width_mm', value: 1200, unit: 'mm',
                      verificationStatus: 'verified', evidence: primary(true),
                      sourceReference: { kind: 'public_primary', url: bad } }),
      /public source reference/, bad + ' はrejectされるはず'
    );
  }
  // 未知フィールドでの密輸も拒否
  assert.throws(
    () => led.add({ factKey: 'pane_width_mm', value: 1200, unit: 'mm',
                    verificationStatus: 'verified', evidence: primary(true),
                    privateFileName: 'A-102.pdf' }),
    /unexpected field/
  );
});

/* ============================================================
   AC-05 / AC-14 field verified ≠ case verified
============================================================ */

test('AC-05: 一部のfactがverifiedでもcaseはverifiedにならない', () => {
  const led = Ledger.createLedger();
  // 寸法だけ verified、圧力は未確認
  led.add(verifiedEntry('pane_width_mm', 1200, 'mm'));
  led.add(verifiedEntry('pane_height_mm', 2000, 'mm'));
  led.add({ factKey: 'positive_pressure', value: 1500, unit: 'N/m2',
            verificationStatus: 'partially_verified', evidence: indirect() });
  led.add({ factKey: 'negative_pressure', value: -900, unit: 'N/m2',
            verificationStatus: 'unverified', evidence: none() });

  // field levelでは2件verified
  assert.deepEqual(led.listVerifiedFactKeys(), ['pane_height_mm', 'pane_width_mm']);

  // case levelではverifiedにならない
  const r = Ledger.evaluateCasePromotion(led, 'glass_pane');
  assert.equal(r.verified, false);
  assert.deepEqual(r.missing.sort(), ['negative_pressure', 'positive_pressure']);
  assert.throws(() => Ledger.assertCaseCanBeVerified(led, 'glass_pane'), /cannot be promoted to verified/);
});

test('AC-06 / AC-14: critical factが全て揃ってはじめてcase verified', () => {
  const led = Ledger.createLedger();
  for (const [k, v, u] of [['pane_width_mm', 1200, 'mm'], ['pane_height_mm', 2000, 'mm'],
                           ['positive_pressure', 1500, 'N/m2'], ['negative_pressure', -900, 'N/m2']]) {
    led.add(verifiedEntry(k, v, u));
  }
  const r = Ledger.evaluateCasePromotion(led, 'glass_pane');
  assert.equal(r.verified, true);
  assert.deepEqual(r.missing, []);
  assert.doesNotThrow(() => Ledger.assertCaseCanBeVerified(led, 'glass_pane'));
});

test('AC-10: 算定provenanceを主張するcaseは評価高さの根拠も必要', () => {
  const led = Ledger.createLedger();
  for (const [k, v] of [['pane_width_mm', 1200], ['pane_height_mm', 2000],
                        ['positive_pressure', 1500], ['negative_pressure', -900]]) {
    led.add(verifiedEntry(k, v));
  }
  // 主張しなければ evaluation_height は要求されない
  assert.equal(Ledger.evaluateCasePromotion(led, 'glass_pane').verified, true);
  // 主張するなら必要
  const withCalc = Ledger.evaluateCasePromotion(led, 'glass_pane', { claimsCalculationProvenance: true });
  assert.equal(withCalc.verified, false);
  assert.deepEqual(withCalc.missing, ['evaluation_height']);

  led.add(verifiedEntry('evaluation_height', 10, 'm'));
  assert.equal(
    Ledger.evaluateCasePromotion(led, 'glass_pane', { claimsCalculationProvenance: true }).verified, true
  );
});

test('AC-06: 未知のcase typeはfail closed', () => {
  const led = Ledger.createLedger();
  assert.throws(() => Ledger.evaluateCasePromotion(led, 'unknown_case'), /unknown case type/);
});

/* ============================================================
   AC-11 / AC-12 reconciliation — MATCH ≠ verified
============================================================ */

test('AC-12: 数値が完全一致してもEvidenceがverifiedでなければ INSUFFICIENT_EVIDENCE', () => {
  const led = Ledger.createLedger();
  led.add({ factKey: 'positive_pressure', value: 1525, unit: 'N/m2',
            verificationStatus: 'partially_verified', evidence: indirect() });

  const r = Ledger.reconcileFact(1525, led.find('positive_pressure'));
  assert.equal(r.status, 'INSUFFICIENT_EVIDENCE', '完全一致でもverifiedにしない');
  assert.notEqual(r.status, 'MATCH');
  assert.match(r.note, /数値が一致していても検証済みとして扱わない/);
});

test('AC-11 / AC-12: Evidenceがverifiedのときだけ MATCH / MISMATCH を返す', () => {
  const led = Ledger.createLedger();
  led.add(verifiedEntry('positive_pressure', 1525, 'N/m2'));
  led.add(verifiedEntry('negative_pressure', -900, 'N/m2'));

  const m = Ledger.reconcileFact(1525, led.find('positive_pressure'));
  assert.equal(m.status, 'MATCH');
  assert.equal(m.difference, 0);
  assert.match(m.note, /presetの検証状況を変えない/, 'MATCHが昇格根拠でないことを明示');

  const mm = Ledger.reconcileFact(918, led.find('negative_pressure'));
  assert.equal(mm.status, 'MISMATCH');
  assert.equal(mm.evidenceValue, -900);
  assert.equal(mm.presetValue, 918);
  assert.match(mm.note, /自動変更せずHuman Gateへ回付/);
});

test('AC-11: entryが無ければ INSUFFICIENT_EVIDENCE', () => {
  const led = Ledger.createLedger();
  const r = Ledger.reconcileFact(1250, led.find('pane_width_mm'));
  assert.equal(r.status, 'INSUFFICIENT_EVIDENCE');
  assert.equal(r.evidenceValue, null);
  assert.deepEqual(Ledger.RECONCILIATION_STATUSES, ['MATCH', 'MISMATCH', 'INSUFFICIENT_EVIDENCE']);
});

test('AC-13: reconciliationはread-onlyでpresetを変更しない', () => {
  const before = {
    positives: ['1', '2', '3', 'R'].map((f) => MiyoshiProjectConfig.getPositivePressure(f)),
    negatives: ['general', 'corner'].map((z) => MiyoshiProjectConfig.getNegativePressure(z)),
    dims: MiyoshiProjectConfig.getDefaultDimensionsMM(),
    status: MiyoshiProjectConfig.dimensions.status
  };
  const led = Ledger.createLedger();
  led.add(verifiedEntry('positive_pressure', 9999, 'N/m2'));
  // 大きくMISMATCHするEvidenceで突き合わせても…
  const r = Ledger.reconcileFact(MiyoshiProjectConfig.getPositivePressure('2'), led.find('positive_pressure'));
  assert.equal(r.status, 'MISMATCH');
  // presetは1つも変わらない
  assert.deepEqual(['1', '2', '3', 'R'].map((f) => MiyoshiProjectConfig.getPositivePressure(f)), before.positives);
  assert.deepEqual(['general', 'corner'].map((z) => MiyoshiProjectConfig.getNegativePressure(z)), before.negatives);
  assert.deepEqual(MiyoshiProjectConfig.getDefaultDimensionsMM(), before.dims);
  assert.equal(MiyoshiProjectConfig.dimensions.status, before.status);
});

/* ============================================================
   AC-07 / AC-08 / AC-09 / AC-10 現状のMiyoshi factは昇格しない
============================================================ */

test('AC-07/08/09/10: 現在のEvidenceでは4群すべて INSUFFICIENT_EVIDENCE', () => {
  // Evidence UNAVAILABLE のため、Ledgerには verified entry が1件も無い
  const led = Ledger.createLedger();
  const checks = [
    ['pane_width_mm', MiyoshiProjectConfig.getDefaultDimensionsMM().W],
    ['pane_height_mm', MiyoshiProjectConfig.getDefaultDimensionsMM().H],
    ['positive_pressure', MiyoshiProjectConfig.getPositivePressure('2')],
    ['negative_pressure', MiyoshiProjectConfig.getNegativePressure('general')],
    ['evaluation_height', null]
  ];
  for (const [key, presetValue] of checks) {
    const r = Ledger.reconcileFact(presetValue, led.find(key));
    assert.equal(r.status, 'INSUFFICIENT_EVIDENCE', key + ' は INSUFFICIENT_EVIDENCE であるべき');
  }
  // caseも当然verifiedにならない
  assert.equal(Ledger.evaluateCasePromotion(led, 'glass_pane').verified, false);
  // verifiedCasesは空のまま
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
});

test('AC-07: sample_defaultは昇格していない', () => {
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultW.verificationStatus, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultH.verificationStatus, 'unverified');
});

/* ============================================================
   AC-02 / §8 generic moduleの純度
============================================================ */

test('§8: generic moduleに案件固有値・案件名が含まれない', () => {
  for (const file of ['evidence.js', 'evidence-ledger.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'project-config', file), 'utf8');
    // 案件識別子そのものは禁止
    for (const token of ['Miyoshi', 'MIYOSHI', 'みよし']) {
      assert.equal(src.includes(token), false, file + ' に ' + token + ' が含まれてはならない');
    }
    // 小文字 'miyoshi' は「どこから抽出したか」を示すfile path pointerとしてのみ許容する。
    // 依存として現れてはならない（依存の向きは miyoshi.js -> evidence.js の一方向）。
    for (const line of src.split('\n').filter((l) => l.includes('miyoshi'))) {
      assert.match(line, /project-config\/miyoshi\.js/,
        file + ' の miyoshi 参照はpath pointerのみ許容: ' + line.trim());
      assert.equal(line.trim().startsWith('*') || line.trim().startsWith('//'), true,
        file + ' の miyoshi 参照はコメント内のみ許容: ' + line.trim());
    }
    // コードとしての依存が無いこと
    assert.doesNotMatch(src, /require\([^)]*miyoshi/, file + ' は miyoshi.js を require してはならない');
    assert.doesNotMatch(src, /MiyoshiProjectConfig/, file + ' は MiyoshiProjectConfig を参照してはならない');
    for (const value of ['1297', '1525', '1695', '1729', '918', '1122', '1250', '2050']) {
      assert.doesNotMatch(src, new RegExp('\\b' + value + '\\b'), file + ' に案件固有値 ' + value);
    }
  }
  // floor "1/2/3/R" 前提も持たない
  const ledgerSrc = fs.readFileSync(path.join(__dirname, '..', 'project-config', 'evidence-ledger.js'), 'utf8');
  assert.doesNotMatch(ledgerSrc, /'R'|"R"/, 'floor R の前提を持たない');
});

test('AC-02: Ledgerは Evidence contract を再実装しない', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'project-config', 'evidence-ledger.js'), 'utf8');
  for (const pattern of [/var EVIDENCE_LEVELS = \[/, /var VERIFICATION_STATUSES = \[/,
                         /function isValidCheckedAt/, /function makeEvidence/,
                         /function assertEvidenceConsistency/, /function assertPromotionGate/]) {
    assert.doesNotMatch(src, pattern, 'Ledgerが契約を再定義していないこと: ' + pattern);
  }
  assert.match(src, /assertPromotionGate\(/, 'Ledgerは契約を"使う"こと');
});

test('AC-05: verificationStatusがverifiedでないentryは、evidenceが強くてもcaseを昇格させない', () => {
  // mutation testで発見した抜け穴の回帰テスト。
  // evidence自体は primary + privateReference を満たすが、
  // factの検証状況は partially_verified にとどまる、というentryを作る。
  // promotion gateは（verifiedでないため）素通りするので、
  // case側が verificationStatus を独立に確認していないと誤って昇格する。
  const led = Ledger.createLedger();
  led.add(verifiedEntry('pane_width_mm', 1200, 'mm'));
  led.add(verifiedEntry('pane_height_mm', 2000, 'mm'));
  led.add({ factKey: 'positive_pressure', value: 1500, unit: 'N/m2',
            verificationStatus: 'partially_verified', evidence: primary(true) });
  led.add({ factKey: 'negative_pressure', value: -900, unit: 'N/m2',
            verificationStatus: 'partially_verified', evidence: primary(true) });

  // entry自体はgateを通せる強さのevidenceを持っている
  assert.doesNotThrow(
    () => Evidence.assertPromotionGate('verified', led.get('positive_pressure').evidence, 'x')
  );
  // それでもcaseはverifiedにならない（statusがverifiedではないため）
  const r = Ledger.evaluateCasePromotion(led, 'glass_pane');
  assert.equal(r.verified, false, 'partially_verified なfactでcaseを昇格させてはならない');
  assert.deepEqual(r.missing.sort(), ['negative_pressure', 'positive_pressure']);
  for (const reason of r.reasons) {
    assert.match(reason, /verificationStatus is "partially_verified", not "verified"/);
  }
  assert.throws(() => Ledger.assertCaseCanBeVerified(led, 'glass_pane'), /cannot be promoted/);
});

/* ============================================================
   Wave 2H §4: 検証後の改変によるbypass
   （Promotion Gateが「構築時のみのチェック」に退化していないこと）
============================================================ */

test('§4-1: 返されたentryのverificationStatusを書き換えても保存値は変わらない', () => {
  const led = Ledger.createLedger();
  const returned = led.add({ factKey: 'pane_width_mm', value: 1200, unit: 'mm',
                             verificationStatus: 'unverified', evidence: none() });
  try { returned.verificationStatus = 'verified'; } catch (e) { /* strict modeでは例外 */ }
  assert.equal(led.get('pane_width_mm').verificationStatus, 'unverified');
  assert.deepEqual(led.listVerifiedFactKeys(), [], '§4-7: verified一覧も変わらない');
});

test('§4-2 / §4-3: get() / find() 経由でnested evidenceを書き換えられない', () => {
  const led = Ledger.createLedger();
  led.add(verifiedEntry('pane_width_mm', 1200, 'mm'));

  const got = led.get('pane_width_mm');
  try { got.evidence.level = 'none'; } catch (e) { /* noop */ }
  try { got.evidence.checkedAt = null; } catch (e) { /* noop */ }
  try { got.evidence.privateReferenceAvailable = false; } catch (e) { /* noop */ }
  assert.equal(led.get('pane_width_mm').evidence.level, 'primary');
  assert.equal(led.get('pane_width_mm').evidence.checkedAt, '2026-09-20');
  assert.equal(led.get('pane_width_mm').evidence.privateReferenceAvailable, true);

  const found = led.find('pane_width_mm');
  try { found.value = 9999; } catch (e) { /* noop */ }
  assert.equal(led.get('pane_width_mm').value, 1200);
});

test('§4-4 / §4-5: add()後に呼び出し側の元objectを書き換えても保存値は変わらない', () => {
  const led = Ledger.createLedger();
  const evidence = Evidence.makeEvidence('primary', '2026-09-20', '一次資料で直接確認', true);
  const sourceReference = { kind: 'public_primary', url: PUBLIC_OK };
  led.add({ factKey: 'pane_height_mm', value: 2000, unit: 'mm',
            verificationStatus: 'verified', evidence, sourceReference });

  // 呼び出し側のobjectを後から改変
  evidence.level = 'none';
  evidence.privateReferenceAvailable = false;
  sourceReference.url = 'https://drive.google.com/file/d/leak';
  sourceReference.kind = 'private';

  const stored = led.get('pane_height_mm');
  assert.equal(stored.evidence.level, 'primary');
  assert.equal(stored.evidence.privateReferenceAvailable, true);
  assert.equal(stored.sourceReference.kind, 'public_primary');
  assert.equal(stored.sourceReference.url, PUBLIC_OK);
  assert.ok(!stored.sourceReference.url.includes('drive.google'));
});

test('§4-6: Object.definePropertyでも保護されたfieldを変えられない', () => {
  const led = Ledger.createLedger();
  led.add(verifiedEntry('pane_width_mm', 1200, 'mm'));
  const e = led.get('pane_width_mm');

  assert.equal(Object.isFrozen(e), true, 'entryがfrozenであること');
  assert.equal(Object.isFrozen(e.evidence), true, 'nested evidenceもfrozenであること');

  // 注: frozen objectへ**同じ値**でdefinePropertyするのは仕様上no-opで例外にならない。
  // 実際に値を変えようとした場合に落ちることを確認する。
  assert.throws(() => Object.defineProperty(e, 'verificationStatus', { value: 'unverified' }), TypeError);
  assert.throws(() => Object.defineProperty(e, 'value', { value: 9999 }), TypeError);
  assert.throws(() => Object.defineProperty(e.evidence, 'level', { value: 'none' }), TypeError);
  assert.throws(() => Object.defineProperty(e.evidence, 'privateReferenceAvailable', { value: false }), TypeError);
  assert.equal(led.get('pane_width_mm').verificationStatus, 'verified');
  assert.equal(led.get('pane_width_mm').evidence.level, 'primary');
  assert.equal(led.get('pane_width_mm').value, 1200);
});

test('§4-6b: sourceReferenceもfrozenで、URLを差し替えられない', () => {
  const led = Ledger.createLedger();
  led.add({ factKey: 'pane_width_mm', value: 1200, unit: 'mm',
            verificationStatus: 'verified', evidence: primary(false),
            sourceReference: Evidence.makePublicPrimarySourceReference(PUBLIC_OK) });
  const ref = led.get('pane_width_mm').sourceReference;
  assert.equal(Object.isFrozen(ref), true);
  assert.throws(() => Object.defineProperty(ref, 'url', { value: 'https://evil.example.com/' }), TypeError);
  assert.throws(() => Object.defineProperty(ref, 'kind', { value: 'private' }), TypeError);
  assert.equal(led.get('pane_width_mm').sourceReference.url, PUBLIC_OK);
});

test('§4-8: 以前返されたentryを書き換えてもcase promotion結果は変わらない', () => {
  const led = Ledger.createLedger();
  led.add(verifiedEntry('pane_width_mm', 1200, 'mm'));
  led.add(verifiedEntry('pane_height_mm', 2000, 'mm'));
  const weak1 = led.add({ factKey: 'positive_pressure', value: 1500, unit: 'N/m2',
                          verificationStatus: 'unverified', evidence: none() });
  const weak2 = led.add({ factKey: 'negative_pressure', value: -900, unit: 'N/m2',
                          verificationStatus: 'unverified', evidence: none() });

  assert.equal(Ledger.evaluateCasePromotion(led, 'glass_pane').verified, false);
  // 返されたentryを「verified」に見せかけようとする
  for (const w of [weak1, weak2]) {
    try { w.verificationStatus = 'verified'; } catch (e) { /* noop */ }
    try { w.evidence.level = 'primary'; } catch (e) { /* noop */ }
    try { w.evidence.checkedAt = '2026-09-20'; } catch (e) { /* noop */ }
    try { w.evidence.privateReferenceAvailable = true; } catch (e) { /* noop */ }
  }
  assert.equal(Ledger.evaluateCasePromotion(led, 'glass_pane').verified, false,
    '検証後の改変でcaseを昇格させられてはならない');
});

/* ============================================================
   Wave 2H §5: factKey allowlist（fail closed）
============================================================ */

test('§5: allowlistに無いfactKeyは、識別子として妥当でも拒否される', () => {
  const led = Ledger.createLedger();
  for (const bad of ['A_102_pdf', 'drawing_123', 'private_sheet', 'client_code_001',
                     'custom_fact', 'paneWidth', 'pane_width']) {
    assert.throws(
      () => led.add({ factKey: bad, value: 1, unit: null,
                      verificationStatus: 'unverified', evidence: none() }),
      /not in the reviewed allowlist/,
      JSON.stringify(bad) + ' はrejectされるはず'
    );
  }
});

test('§5: allowlistのkeyはすべて構造的に受理され、案件固有キーを含まない', () => {
  assert.deepEqual(Ledger.KNOWN_FACT_KEYS, [
    'pane_width_mm', 'pane_height_mm', 'positive_pressure', 'negative_pressure',
    'evaluation_height', 'floor_height_mapping', 'building_height', 'eaves_height',
    'V0', 'roughness_category'
  ]);
  for (const k of Ledger.KNOWN_FACT_KEYS) {
    const led = Ledger.createLedger();
    assert.doesNotThrow(() => led.add({ factKey: k, value: 1, unit: null,
                                        verificationStatus: 'unverified', evidence: none() }), k);
  }
  // 案件固有・floor固有のキーが混ざっていない
  for (const k of Ledger.KNOWN_FACT_KEYS) {
    assert.doesNotMatch(k, /miyoshi|floor_[123R]|_1F|_RF/i, k + ' は案件/floor固有でない');
  }
});

/* ============================================================
   Wave 2H §6: 非公開IPリテラル
============================================================ */

test('§6: fe80::/10 全域と未指定アドレスを拒否する', () => {
  // 旧実装は fe80: のみに一致し fe90/fea0/febf を取りこぼしていた。
  //
  // 重要: IPv6リテラルは後段のclass判定でも落ちるため、
  // 「どちらかで落ちる」ことを確認するだけでは範囲judgeの弱体化を検出できない
  // （実際、緩めるmutationが生き残った）。
  // 判定順序は 私設レンジ -> IP-literal class なので、
  // **私設レンジとして落ちること**をメッセージで固定する。
  for (const h of ['fe80::1', 'fe90::1', 'fea0::1', 'febf::1', 'feb0::dead']) {
    assert.throws(
      () => Evidence.assertPublicPrimarySourceReference('https://[' + h + ']/x'),
      /private-network address/,
      h + ' は「私設ネットワーク」として落ちること（IP-literal判定に救われていない）'
    );
  }
  for (const h of ['::1', '::', 'fc00::1', 'fd00::1']) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference('https://[' + h + ']/x'),
      /loopback|private-network address|IP-literal host/, h + ' はrejectされるはず');
  }
});

test('§6: IPv6リテラルはクラスとして拒否（IPv4-mapped経由の迂回も塞ぐ）', () => {
  for (const h of ['::ffff:192.168.0.1', '::ffff:127.0.0.1', '2001:db8::1', '2400:cb00::1']) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference('https://[' + h + ']/x'),
      /IP-literal host|private-network address|loopback/,
      h + ' はrejectされるはず（公開一次資料がIPリテラルで参照されることは想定しない）');
  }
});

test('§6: RFC1918 / 169.254 / localhost は引き続き拒否される', () => {
  for (const h of ['10.0.0.5', '192.168.1.5', '172.16.0.1', '172.31.255.1', '169.254.1.1']) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference('https://' + h + '/x'),
      /private-network address/, h);
  }
  for (const h of ['localhost', '127.0.0.1', '0.0.0.0']) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference('https://' + h + '/x'),
      /loopback/, h);
  }
});

/* ============================================================
   Wave 2H §8: verifiedValue の public reference 保持契約
============================================================ */

test('§8: verifiedValueはpublic referenceを破棄せず値に保持する', () => {
  const ref = Evidence.makePublicPrimarySourceReference(PUBLIC_OK);
  const v = Evidence.verifiedValue(1, 'mm', 'verified', primary(false), 'fact', { sourceReference: ref });
  assert.ok(v.sourceReference, 'referenceが失われていないこと');
  assert.equal(v.sourceReference.kind, 'public_primary');
  assert.equal(v.sourceReference.url, PUBLIC_OK);

  // private Evidence由来の値は null
  const vp = Evidence.verifiedValue(34, 'm/s', 'verified', primary(true), 'V0');
  assert.equal(vp.sourceReference, null);

  // 呼び出し側のobjectを後から書き換えても保持値は変わらない
  const mutable = { kind: 'public_primary', url: PUBLIC_OK };
  const v2 = Evidence.verifiedValue(1, 'mm', 'verified', primary(false), 'f', { sourceReference: mutable });
  mutable.url = 'https://drive.google.com/file/d/leak';
  assert.equal(v2.sourceReference.url, PUBLIC_OK);
});

test('§8: 既存の verified 値も sourceReference field を持つ（null）', () => {
  assert.equal(MiyoshiProjectConfig.wind.V0.sourceReference, null);
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.sourceReference, null);
  // 値・検証状況は不変
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.equal(MiyoshiProjectConfig.wind.V0.verificationStatus, 'verified');
});
