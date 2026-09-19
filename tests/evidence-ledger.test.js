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
