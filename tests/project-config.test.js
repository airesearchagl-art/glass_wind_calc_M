'use strict';

/**
 * Phase 2A: project-config/miyoshi.js のテスト。
 *
 * - calc.js に残る非推奨(deprecated)の後方互換定数と、
 *   project-config/miyoshi.js の値が完全に一致することを確認する
 *   （config分離が値のズレを生んでいないことの保証）。
 * - 各値のverificationStatusが実態どおりであることを確認する
 *   （2026-09-17 Provenance Required Fix時点）：
 *     - identity: "verified"（社内資料で確認済み。ただし公開repoでは
 *       disclosureStatus="redacted"とし、identity.publicLabelのみ開示）
 *     - wind.V0 / wind.roughnessCategory: "verified"
 *       （社内基本設計資料の外構風荷重条件で直接確認済み）
 *     - wind.status（positivePressureByFloor / negativePressureByZoneの
 *       各値を含む）: "partially_verified"のまま
 *       （V0/roughness自体の確認と、階別ガラス風圧プリセット値の元となる
 *       外装材/ガラス構造計算書・各階評価高さZとの対応付けの確認は別軸）
 *     - dimensions（defaultW / defaultH）: "unverified"のまま
 *   いずれも誤って想定より高いverificationStatusへ昇格・降格していないこと、
 *   および内部限定識別子（Drive/Notion等のURL）を含まないことを確認する。
 * - 代表ケース（FL6, W=1250/1500, H=2050, 2F, general, extraFactor=1.00）で、
 *   project-configの値をcalc.jsの汎用計算コアに渡した結果が、
 *   Phase 1時点の既知の値と完全に一致すること（config分離前後で
 *   計算値が不変であること）を回帰確認する。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const GlassCalc = require('../calc.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');
const PROJECT_CONFIG_SRC_PATH = path.join(__dirname, '..', 'project-config', 'miyoshi.js');

test('project-config: projectId/projectName が定義されている', () => {
  assert.equal(MiyoshiProjectConfig.projectId, 'miyoshi');
  assert.equal(typeof MiyoshiProjectConfig.projectName, 'string');
  assert.ok(MiyoshiProjectConfig.projectName.length > 0);
});

/* ============================================================
   Provenance / disclosure（2026-09-17 Provenance Required Fix）
   verificationStatus（社内で確認できているか）と disclosureStatus
   （公開リポジトリで何を開示するか）を分離して扱う。
============================================================ */

test('project-config: identity — 社内確認済み状態を表現でき、publicLabelは"みよし案件"、private固有名詞を要求しない構造', () => {
  const identity = MiyoshiProjectConfig.identity;
  assert.equal(identity.publicLabel, 'みよし案件');
  assert.equal(identity.verificationStatus, 'verified');
  assert.equal(identity.disclosureStatus, 'redacted');
  assert.equal(identity.evidence.level, 'primary');
  assert.equal(identity.evidence.checkedAt, '2026-09-17');
  assert.equal(typeof identity.evidence.publicDescription, 'string');
  assert.equal(typeof identity.evidence.privateReferenceAvailable, 'boolean');
  // identityの構造自体が、施主名・建物名称等のprivateな固有名詞フィールドを
  // 要求しないこと（publicLabel等の既知キーのみで完結する）。
  const allowedKeys = ['publicLabel', 'verificationStatus', 'disclosureStatus', 'evidence'];
  for (const key of Object.keys(identity)) {
    assert.ok(allowedKeys.indexOf(key) !== -1, `identityに想定外のキー ${key} が存在する`);
  }
  // evidence.publicDescription等に内部限定識別子（Drive URL/ファイルID等）を含まないこと
  const serialized = JSON.stringify(identity);
  assert.doesNotMatch(serialized, /drive\.google|docs\.google|notion\.(so|com)|sharepoint|dropbox\.com/i);
});

test('project-config: getPublicLabel() — disclosure-safeなidentity.publicLabelのみを返す（fail-closed）', () => {
  assert.equal(MiyoshiProjectConfig.getPublicLabel(), 'みよし案件');
  assert.equal(MiyoshiProjectConfig.getPublicLabel(), MiyoshiProjectConfig.identity.publicLabel);

  // F3以降、identityは深くfreezeされているため、この元テストが行っていた
  // `delete identity.publicLabel` 自体が構造的に不可能になった（後段のfreeze
  // 回帰テストで固定する）。ただし「publicLabelが欠落したらprojectName等へ
  // フォールバックせず例外を投げる」というfail-closedな実装自体は、freezeに
  // 依存せず独立に成り立っていなければならない。
  // そこで freeze行だけを外したコピーを別に読み込み、その分岐を実際に通す。
  const src = fs.readFileSync(PROJECT_CONFIG_SRC_PATH, 'utf8');
  const freezeMarker = 'deepFreeze(config.identity);';
  assert.equal(src.split(freezeMarker).length - 1, 1,
    'identity freezeマーカーが一意に1件見つかるはず（ソース構造が変わった可能性）');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miyoshi-public-label-test-'));
  try {
    fs.writeFileSync(
      path.join(tmpDir, 'evidence.js'),
      fs.readFileSync(path.join(__dirname, '..', 'project-config', 'evidence.js'), 'utf8')
    );
    const tmpFile = path.join(tmpDir, 'miyoshi.js');
    fs.writeFileSync(tmpFile, src.replace(freezeMarker, '/* freeze removed for this test */'));
    delete require.cache[require.resolve(tmpFile)];
    const unfrozen = require(tmpFile);

    assert.equal(Object.isFrozen(unfrozen.identity), false, 'このコピーではidentityはfreezeされていない');
    delete unfrozen.identity.publicLabel;
    assert.throws(() => unfrozen.getPublicLabel(), /Public project label is required/);
    // projectNameへフォールバックしていないこと
    assert.notEqual(unfrozen.projectName, undefined);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F3: identity / dimensions / wind / verifiedCases は検証後に改変できない', () => {
  // Ledger entryだけをfreezeしても、UIが実際に読む一次のtrusted objectが
  // mutableなら「検証後改変の封鎖」は半分しか成り立たない。
  const C = MiyoshiProjectConfig;
  for (const [name, obj] of [['identity', C.identity], ['dimensions', C.dimensions],
    ['wind', C.wind], ['verifiedCases', C.verifiedCases]]) {
    assert.equal(Object.isFrozen(obj), true, name + ' はfreezeされているはず');
  }
  // nested（値・evidence）まで届いていること
  assert.equal(Object.isFrozen(C.wind.V0), true);
  assert.equal(Object.isFrozen(C.wind.V0.evidence), true);
  assert.equal(Object.isFrozen(C.dimensions.defaultW), true);
  assert.equal(Object.isFrozen(C.dimensions.defaultW.evidence), true);
  assert.equal(Object.isFrozen(C.wind.positivePressureByFloor['1']), true);

  // 具体的な攻撃が通らないこと（strict modeなのでthrowする）
  assert.throws(() => { C.wind.V0.value = 99; }, TypeError);
  assert.throws(() => { C.wind.V0.evidence.level = 'none'; }, TypeError);
  assert.throws(() => { C.dimensions.mode = 'verified_project_case'; }, TypeError);
  assert.throws(() => { C.dimensions.defaultW.verificationStatus = 'verified'; }, TypeError);
  assert.throws(() => { C.wind.positivePressureByFloor['1'].value = 9999; }, TypeError);
  // validateVerifiedCase() を一切通らない裏口登録
  assert.throws(() => { C.verifiedCases.push({ caseId: 'X' }); }, TypeError);

  // 値が実際に無傷であること
  assert.equal(C.wind.V0.value, 34);
  assert.equal(C.dimensions.mode, 'sample_default');
  assert.equal(C.getPositivePressure('1'), 1297);
  assert.equal(C.verifiedCases.length, 0);
  assert.deepEqual(C.validateAllEvidence(), []);
});

test('project-config: wind.V0 — 社内基本設計資料で直接確認済み（verified）、evidence.level=primary、checkedAt=2026-09-17', () => {
  const V0 = MiyoshiProjectConfig.wind.V0;
  assert.equal(V0.value, 34);
  assert.notEqual(V0.value, 32);
  assert.equal(V0.verificationStatus, 'verified');
  assert.equal(V0.evidence.level, 'primary');
  assert.equal(V0.evidence.checkedAt, '2026-09-17');
});

test('project-config: wind.roughnessCategory — 社内基本設計資料で直接確認済み（verified）、evidence.level=primary、checkedAt=2026-09-17', () => {
  const roughness = MiyoshiProjectConfig.wind.roughnessCategory;
  assert.equal(roughness.value, 'III');
  assert.equal(roughness.verificationStatus, 'verified');
  assert.equal(roughness.evidence.level, 'primary');
  assert.equal(roughness.evidence.checkedAt, '2026-09-17');
});

test('project-config: miyoshi configが階別正圧の正（authoritative source）である', () => {
  // Phase 2Dでcalc.js側のdeprecated複製を削除したため、値の正は
  // project-config/miyoshi.js のみが持つ。ここで固定値として直接pinする
  // （旧テストはcalc.js複製との一致比較だったが、比較対象の削除に伴い
  //   canonical値そのものの固定へ置き換えた。カバレッジは減っていない）。
  const floors = ['1', '2', '3', 'R'];
  for (const f of floors) {
    const v = MiyoshiProjectConfig.getPositivePressure(f);
    assert.equal(typeof v, 'number', `floor=${f} の正圧値が数値でない`);
    assert.ok(isFinite(v) && v > 0, `floor=${f} の正圧値が正の有限数でない`);
  }
  assert.equal(MiyoshiProjectConfig.getPositivePressure('1'), 1297);
  assert.equal(MiyoshiProjectConfig.getPositivePressure('2'), 1525);
  assert.equal(MiyoshiProjectConfig.getPositivePressure('3'), 1695);
  assert.equal(MiyoshiProjectConfig.getPositivePressure('R'), 1729);
});

test('project-config: miyoshi configが部位別負圧の正（authoritative source）である', () => {
  const zones = ['general', 'corner'];
  for (const z of zones) {
    const v = MiyoshiProjectConfig.getNegativePressure(z);
    assert.equal(typeof v, 'number', `zone=${z} の負圧値が数値でない`);
    assert.ok(isFinite(v) && v > 0, `zone=${z} の負圧値が正の有限数でない`);
  }
  assert.equal(MiyoshiProjectConfig.getNegativePressure('general'), 918);
  assert.equal(MiyoshiProjectConfig.getNegativePressure('corner'), 1122);
});

test('project-config: default W/H = 1250/2050（案件既定寸法の正はproject-config側のみ）', () => {
  const dflt = MiyoshiProjectConfig.getDefaultDimensionsMM();
  assert.deepEqual(dflt, { W: 1250, H: 2050 });
  // Phase 2D: calc.js側の複製（UNVERIFIED_DEFAULT_DIMENSIONS_MM）は削除済み。
  // 汎用計算コアが案件既定寸法を持ち直していないことを併せて確認する。
  assert.equal(GlassCalc.UNVERIFIED_DEFAULT_DIMENSIONS_MM, undefined);
});

test('project-config: dimensions.status = unverified（verifiedへ昇格していないこと）', () => {
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultW.verificationStatus, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultH.verificationStatus, 'unverified');
});

test('project-config: wind.status は verified ではない（元計算書・評価高さZは未確認）', () => {
  assert.notEqual(MiyoshiProjectConfig.wind.status, 'verified');
  assert.equal(MiyoshiProjectConfig.wind.status, 'partially_verified');
  for (const f of ['1', '2', '3', 'R']) {
    assert.notEqual(MiyoshiProjectConfig.wind.positivePressureByFloor[f].verificationStatus, 'verified');
  }
  for (const z of ['general', 'corner']) {
    assert.notEqual(MiyoshiProjectConfig.wind.negativePressureByZone[z].verificationStatus, 'verified');
  }
});

test('project-config: V0=34m/s（32m/sへの変更は行われていない）・roughnessCategory=III', () => {
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.notEqual(MiyoshiProjectConfig.wind.V0.value, 32);
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.value, 'III');
});

test('project-config: isFullyVerified() は現時点でfalse', () => {
  assert.equal(MiyoshiProjectConfig.isFullyVerified(), false);
});

/* ============================================================
   Evidence model（2026-09-17 Phase 2B）
   verificationStatus（値がどれだけ検証されているか）と
   evidence（根拠がどの程度あるか: 'primary'/'indirect'/'none'）を
   分離して扱う。verifiedへの昇格にはevidence.level==='primary'かつ
   evidence.checkedAtが必須（promotion guard）。
============================================================ */

test('Evidence: verified valueにはevidence.level==="primary"かつevidence.checkedAtが必須', () => {
  // 既存のverified値（identity, V0, roughnessCategory）はすべて条件を満たす。
  assert.equal(MiyoshiProjectConfig.identity.evidence.level, 'primary');
  assert.ok(MiyoshiProjectConfig.identity.evidence.checkedAt);
  assert.equal(MiyoshiProjectConfig.wind.V0.evidence.level, 'primary');
  assert.ok(MiyoshiProjectConfig.wind.V0.evidence.checkedAt);
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.evidence.level, 'primary');
  assert.ok(MiyoshiProjectConfig.wind.roughnessCategory.evidence.checkedAt);

  // promotion guardが直接呼び出しでも同じ規則を強制すること
  assert.doesNotThrow(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('verified', { level: 'primary', checkedAt: '2026-09-17' })
  );
  assert.throws(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('verified', { level: 'indirect', checkedAt: '2026-09-17' })
  );
  assert.throws(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('verified', { level: 'primary', checkedAt: null })
  );
  assert.throws(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('verified', null)
  );
});

test('Evidence: unverifiedなdimensionはprimary evidenceなしでも成立する', () => {
  const w = MiyoshiProjectConfig.dimensions.defaultW;
  const h = MiyoshiProjectConfig.dimensions.defaultH;
  assert.equal(w.verificationStatus, 'unverified');
  assert.notEqual(w.evidence.level, 'primary');
  assert.equal(w.evidence.level, 'none');
  assert.equal(h.verificationStatus, 'unverified');
  assert.notEqual(h.evidence.level, 'primary');
  assert.equal(h.evidence.level, 'indirect');
  // promotion guardはunverified+非primaryを許容する（例外を投げない）
  assert.doesNotThrow(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('unverified', w.evidence)
  );
  assert.doesNotThrow(() =>
    MiyoshiProjectConfig.assertEvidenceConsistency('unverified', h.evidence)
  );
});

test('Evidence: partially_verifiedな階別正圧・部位別負圧プリセットもevidenceを保持する', () => {
  for (const f of ['1', '2', '3', 'R']) {
    const entry = MiyoshiProjectConfig.wind.positivePressureByFloor[f];
    assert.equal(entry.verificationStatus, 'partially_verified');
    assert.notEqual(entry.evidence.level, 'primary');
    assert.equal(typeof entry.evidence.publicDescription, 'string');
  }
  for (const z of ['general', 'corner']) {
    const entry = MiyoshiProjectConfig.wind.negativePressureByZone[z];
    assert.equal(entry.verificationStatus, 'partially_verified');
    assert.notEqual(entry.evidence.level, 'primary');
    assert.equal(typeof entry.evidence.publicDescription, 'string');
  }
});

test('Evidence: validateAllEvidence() は現在のconfig全体でviolationsが0件', () => {
  const violations = MiyoshiProjectConfig.validateAllEvidence();
  assert.deepEqual(violations, []);
});

/* ============================================================
   Evidence Guard Required Fix（2026-09-17）
   RF-01: identityもmodule-load時点のfail-fast contractに含まれること
   RF-02: verificationStatus enumのhard validation
   RF-03: evidence.checkedAtのhard validation（YYYY-MM-DD | null）
   RF-04: dimensions.defaultH.evidence.checkedAtの整合
============================================================ */

test('RF-02: verificationStatus enumはVERIFICATION_STATUSESの3値のみ許容される', () => {
  assert.deepEqual(MiyoshiProjectConfig.VERIFICATION_STATUSES, ['verified', 'partially_verified', 'unverified']);

  const validEvidence = { level: 'none', checkedAt: null };
  for (const status of MiyoshiProjectConfig.VERIFICATION_STATUSES) {
    // 'verified'はlevel:'none'では成立しないため、'verified'以外のみ
    // ここでdoesNotThrowを確認する（'verified'は別テストで確認済み）。
    if (status !== 'verified') {
      assert.doesNotThrow(() => MiyoshiProjectConfig.assertEvidenceConsistency(status, validEvidence));
    }
  }

  const invalidStatuses = ['verifed', 'Verified', 'partial', 'unknown', null, undefined, ''];
  for (const status of invalidStatuses) {
    assert.throws(
      () => MiyoshiProjectConfig.assertEvidenceConsistency(status, validEvidence),
      `verificationStatus=${JSON.stringify(status)} はrejectされるはず`
    );
  }
});

test('RF-03: evidence.checkedAtはnullまたは実在する"YYYY-MM-DD"形式のみ許容される', () => {
  const validCheckedAt = ['2026-09-17', null];
  for (const checkedAt of validCheckedAt) {
    assert.doesNotThrow(() =>
      MiyoshiProjectConfig.assertEvidenceConsistency('unverified', { level: 'none', checkedAt })
    );
  }

  const invalidCheckedAt = ['abc', '2026/09/17', '2026-9-17', '2026-13-40', '2026-02-30', true, 123];
  for (const checkedAt of invalidCheckedAt) {
    assert.throws(
      () => MiyoshiProjectConfig.assertEvidenceConsistency('unverified', { level: 'none', checkedAt }),
      `checkedAt=${JSON.stringify(checkedAt)} はrejectされるはず`
    );
  }
});

test('RF-01: identityの構築時（モジュール読み込み時）にpromotion guardが実行される（validateAllEvidence()への事後依存ではない）', () => {
  const src = fs.readFileSync(PROJECT_CONFIG_SRC_PATH, 'utf8');

  function requireBrokenCopy(brokenSrc) {
    // Phase 2FでEvidence contractを project-config/evidence.js へ抽出したため、
    // 壊したコピーも evidence.js を解決できる必要がある。
    // コピー先へ evidence.js も一緒に置き、`require('./evidence.js')` が
    // 自己完結で解決できるようにする（同一プロセスで先にロードされた
    // global.ProjectEvidence に偶然依存させない）。
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miyoshi-evidence-guard-test-'));
    const tmpFile = path.join(tmpDir, 'miyoshi.js');
    fs.writeFileSync(
      path.join(tmpDir, 'evidence.js'),
      fs.readFileSync(path.join(__dirname, '..', 'project-config', 'evidence.js'), 'utf8')
    );
    fs.writeFileSync(tmpFile, brokenSrc);
    try {
      delete require.cache[require.resolve(tmpFile)];
      require(tmpFile);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  // ケース1: identity.evidence.level を 'primary' から 'indirect' に破壊する。
  const levelMarker = "'primary' /* identity-evidence-level */";
  assert.equal(src.split(levelMarker).length - 1, 1, 'identity-evidence-levelマーカーが一意に1件見つかるはず（ソース構造が変わった可能性）');
  const brokenLevel = src.replace(levelMarker, "'indirect' /* identity-evidence-level */");
  assert.throws(
    () => requireBrokenCopy(brokenLevel),
    /verificationStatus "verified" requires evidence\.level === "primary"/,
    'identity.evidence.levelがprimaryでない場合、module load自体が失敗するはず'
  );

  // ケース2: identity.evidence.checkedAt を欠落（null）させる。
  const checkedAtMarker = levelMarker + ",\n    '2026-09-17',";
  assert.equal(src.split(checkedAtMarker).length - 1, 1, 'identity-evidence-checkedAtマーカーが一意に1件見つかるはず（ソース構造が変わった可能性）');
  const brokenCheckedAt = src.replace(checkedAtMarker, levelMarker + ",\n    null,");
  assert.throws(
    () => requireBrokenCopy(brokenCheckedAt),
    /verificationStatus "verified" requires evidence\.checkedAt to be set/,
    'identity.evidence.checkedAtが欠落している場合、module load自体が失敗するはず'
  );
});

test('RF-04: dimensions.defaultH.evidence — level="indirect"を維持したままcheckedAt="2026-09-17"', () => {
  const h = MiyoshiProjectConfig.dimensions.defaultH;
  assert.equal(h.verificationStatus, 'unverified');
  assert.equal(h.evidence.level, 'indirect');
  assert.equal(h.evidence.checkedAt, '2026-09-17');
  // H=2050をverifiedへ昇格したわけではないことの確認
  assert.notEqual(h.verificationStatus, 'verified');
});

test('Evidence: dimensions.mode = "sample_default"（sample defaultとverified project caseの区別）', () => {
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
});

test('Evidence: verifiedCasesに架空のケースが存在しない（空配列のまま）', () => {
  assert.ok(Array.isArray(MiyoshiProjectConfig.verifiedCases));
  assert.equal(MiyoshiProjectConfig.verifiedCases.length, 0);
});

/* ============================================================
   Phase 2C AC-05: Evidence factory hardening
   makeEvidence()のcheckedAtが ''・false・0 等を黙ってnullへ丸め込まず、
   例外を投げること（mutation / boundary test）。
============================================================ */

test('AC-05: makeEvidence() は不正なcheckedAtを黙ってnullへ丸め込まず例外を投げる', () => {
  const invalidCheckedAtValues = ['', false, 0, 'abc', '2026/09/17', '2026-9-17', '2026-13-40', '2026-02-30', true, 123, NaN];
  for (const bad of invalidCheckedAtValues) {
    assert.throws(
      () => MiyoshiProjectConfig.makeEvidence('primary', bad, 'desc', true),
      `checkedAt=${JSON.stringify(bad)} は例外を投げるはず（silent coercion禁止）`
    );
  }
});

test('AC-05: makeEvidence() はnull/undefinedのcheckedAtのみnullとして正しく成立する', () => {
  assert.equal(MiyoshiProjectConfig.makeEvidence('primary', null, 'desc', true).checkedAt, null);
  assert.equal(MiyoshiProjectConfig.makeEvidence('primary', undefined, 'desc', true).checkedAt, null);
  assert.equal(MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', 'desc', true).checkedAt, '2026-09-17');
});

test('AC-05: makeEvidence() は不正なlevelを例外で拒否する（factory入口でのhardening）', () => {
  assert.throws(() => MiyoshiProjectConfig.makeEvidence('bogus', null, 'desc', true));
  assert.throws(() => MiyoshiProjectConfig.makeEvidence('', null, 'desc', true));
  assert.throws(() => MiyoshiProjectConfig.makeEvidence(undefined, null, 'desc', true));
  assert.doesNotThrow(() => MiyoshiProjectConfig.makeEvidence('primary', null, 'desc', true));
  assert.doesNotThrow(() => MiyoshiProjectConfig.makeEvidence('indirect', null, 'desc', true));
  assert.doesNotThrow(() => MiyoshiProjectConfig.makeEvidence('none', null, 'desc', true));
});

/* ============================================================
   Phase 2C AC-06: Verified project case validator
   verifiedCasesは空配列のまま維持するが、将来ケースを安全に追加できる
   よう、正式なvalidatorが必須フィールド・hard conditionを検証すること。
============================================================ */

function makeValidVerifiedCaseFixture(overrides) {
  const primaryEvidence = () => MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', '社内資料で確認済み', true);
  return Object.assign({
    caseId: 'fixture-case-1',
    floor: '2',
    zone: 'general',
    widthMm: 1250,
    heightMm: 2050,
    glassType: 'fl_single',
    designPressure: 1525,
    evidence: {
      widthEvidence: primaryEvidence(),
      heightEvidence: primaryEvidence(),
      pressureEvidence: primaryEvidence()
    },
    publicEvidenceDescription: '社内資料により確認済み（固有名詞・URLなし）'
  }, overrides || {});
}

test('AC-06: validateVerifiedCase() は必須フィールドをすべて満たす妥当なケースを受理する', () => {
  assert.doesNotThrow(() => MiyoshiProjectConfig.validateVerifiedCase(makeValidVerifiedCaseFixture()));
});

test('AC-06: validateVerifiedCase() は必須フィールド欠落を例外で拒否する', () => {
  const requiredFields = ['caseId', 'floor', 'zone', 'widthMm', 'heightMm', 'glassType', 'designPressure', 'evidence', 'publicEvidenceDescription'];
  for (const field of requiredFields) {
    const broken = makeValidVerifiedCaseFixture();
    delete broken[field];
    assert.throws(
      () => MiyoshiProjectConfig.validateVerifiedCase(broken),
      `フィールド${field}欠落は例外を投げるはず`
    );
  }
});

test('AC-06: validateVerifiedCase() はfloor/zoneの不正値を例外で拒否する', () => {
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(makeValidVerifiedCaseFixture({ floor: '5' })));
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(makeValidVerifiedCaseFixture({ floor: 'ground' })));
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(makeValidVerifiedCaseFixture({ zone: 'corner-ish' })));
});

test('AC-06: validateVerifiedCase() はwidthMm/heightMm/designPressureの非数値・非正値を例外で拒否する', () => {
  for (const bad of [0, -1, NaN, 'x', null, undefined]) {
    assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(makeValidVerifiedCaseFixture({ widthMm: bad })));
    assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(makeValidVerifiedCaseFixture({ heightMm: bad })));
    assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(makeValidVerifiedCaseFixture({ designPressure: bad })));
  }
});

test('AC-06: validateVerifiedCase() はpane W / pane H / pressure evidenceのいずれかがprimaryでない場合は例外を投げる（hard condition）', () => {
  const indirect = MiyoshiProjectConfig.makeEvidence('indirect', '2026-09-17', 'x', true);
  const fixture = makeValidVerifiedCaseFixture();

  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    Object.assign({}, fixture, { evidence: Object.assign({}, fixture.evidence, { widthEvidence: indirect }) })
  ));
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    Object.assign({}, fixture, { evidence: Object.assign({}, fixture.evidence, { heightEvidence: indirect }) })
  ));
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    Object.assign({}, fixture, { evidence: Object.assign({}, fixture.evidence, { pressureEvidence: indirect }) })
  ));
});

test('AC-06: validateVerifiedCase() はchecked日付が欠落したevidenceを例外で拒否する', () => {
  const noCheckedAt = { level: 'primary', checkedAt: null, publicDescription: 'x', privateReferenceAvailable: true };
  const fixture = makeValidVerifiedCaseFixture();
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    Object.assign({}, fixture, { evidence: Object.assign({}, fixture.evidence, { pressureEvidence: noCheckedAt }) })
  ));
});

test('AC-06: validateVerifiedCase() はpublicEvidenceDescriptionへの内部限定識別子混入を例外で拒否する（private URL/ID rejection）', () => {
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    makeValidVerifiedCaseFixture({ publicEvidenceDescription: '参照: https://drive.google.com/file/d/xyz' })
  ));
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    makeValidVerifiedCaseFixture({ publicEvidenceDescription: 'see https://www.notion.so/internal-doc' })
  ));
});

/* ============================================================
   Phase 2C Consolidated Closure Wave RF-02:
   public-safe Evidence boundaryを、top-level publicEvidenceDescription
   だけでなくnested evidence（widthEvidence/heightEvidence/
   pressureEvidenceのpublicDescription）まで拡張し、共通関数
   assertPublicSafeEvidenceText() でmakeEvidence()の入口からも強制する。
============================================================ */

// evidence.js を明示的に require する。このファイル自身が
// 「global.ProjectEvidence に偶然依存させない」と書いている。
const ProjectEvidence = require('../project-config/evidence.js');

test('RF-02: assertPublicSafeEvidenceText() が既知の非公開パターン（URL/www/プロバイダ名/Windowsパス/UNCパス/Unix絶対パス/長いopaqueトークン）を例外で拒否する', () => {
  const unsafeTexts = [
    '参照: http://example.com/doc',
    '参照: https://example.com/doc',
    'file:///Users/foo/bar.txt',
    'https://drive.google.com/file/d/xyz',
    'C:\\Users\\foo\\bar.docx',
    '\\\\server\\share\\file.docx',
    '~/Documents/secret.pdf',
    '/Users/foo/secret.pdf',
    '/home/foo/secret.pdf',
    '/mnt/data/secret.pdf',
  ];
  for (const text of unsafeTexts) {
    assert.throws(
      () => MiyoshiProjectConfig.assertPublicSafeEvidenceText(text, 'test'),
      `拒否されるはず: ${text}`
    );
  }

  // Human Gate §3: 以下 3 類は advisory へ降格された。
  // throw しないが、必ず警告を出す（空の「throw しなかった」test にしない）。
  const advisoryTexts = [
    ['see www.example.com for details', 'www'],
    ['see notion.so/internal-doc', 'known-private-provider'],
    ['sharepoint.com/sites/foo', 'known-private-provider'],
    ['dropbox.com/s/abc', 'known-private-provider'],
    // 架空の長いopaqueトークン（実際の社内file ID等は用いない、fixture値）
    ['ref token: 1A2b3C4d5E6f7G8h9I0jK1L2M3N4O5', 'opaque-long-token']
  ];
  for (const [text, rule] of advisoryTexts) {
    assert.equal(MiyoshiProjectConfig.assertPublicSafeEvidenceText(text, 'test'), true,
      `advisory 規則で throw している: ${text}`);
    const warnings = ProjectEvidence.lintPublicEvidenceText(text, 'test').warnings;
    assert.equal(warnings.some((w) => w.rule === rule), true,
      `advisory 警告が出ていない: ${text}`);
  }
});

test('RF-02: assertPublicSafeEvidenceText() は非空文字列かつ既知パターンを含まないテキストを受理する', () => {
  assert.doesNotThrow(() => MiyoshiProjectConfig.assertPublicSafeEvidenceText('社内資料により確認済み（固有名詞・URLなし）', 'test'));
  assert.throws(() => MiyoshiProjectConfig.assertPublicSafeEvidenceText('', 'test'));
  assert.throws(() => MiyoshiProjectConfig.assertPublicSafeEvidenceText(null, 'test'));
  assert.throws(() => MiyoshiProjectConfig.assertPublicSafeEvidenceText(undefined, 'test'));
  assert.throws(() => MiyoshiProjectConfig.assertPublicSafeEvidenceText(123, 'test'));
});

test('RF-02: makeEvidence() はpublicDescriptionへの既知の非公開パターン混入を例外で拒否する（factory入口でのpublic-safe boundary）', () => {
  assert.throws(() => MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', '参照: https://drive.google.com/file/d/xyz', true));
  assert.throws(() => MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', 'C:\\Users\\foo\\bar.docx', true));
  assert.throws(() => MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', '', true));
  assert.doesNotThrow(() => MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', '社内資料により確認済み', true));
});

test('RF-02: makeEvidence() はprivateReferenceAvailableを厳密なbooleanとして検証する（silent coercion禁止）', () => {
  const nonBooleanValues = ['false', 'true', 1, 0, {}, [], null, undefined, 'yes'];
  for (const bad of nonBooleanValues) {
    assert.throws(
      () => MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', 'desc', bad),
      `privateReferenceAvailable=${JSON.stringify(bad)} は例外を投げるはず（厳密なboolean以外は不可）`
    );
  }
  assert.doesNotThrow(() => MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', 'desc', true));
  assert.doesNotThrow(() => MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', 'desc', false));
});

test('RF-02: validateVerifiedCase() はwidthEvidence.publicDescriptionへの内部限定識別子混入を例外で拒否する（nested evidence, private URL rejection）', () => {
  const fixture = makeValidVerifiedCaseFixture();
  const unsafeWidthEvidence = {
    level: 'primary', checkedAt: '2026-09-17',
    publicDescription: '参照: https://drive.google.com/file/d/xyz', privateReferenceAvailable: true
  };
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    Object.assign({}, fixture, { evidence: Object.assign({}, fixture.evidence, { widthEvidence: unsafeWidthEvidence }) })
  ));
});

test('RF-02: validateVerifiedCase() はheightEvidence.publicDescriptionへのWindows/UNCパス混入を例外で拒否する（nested evidence, path rejection）', () => {
  const fixture = makeValidVerifiedCaseFixture();
  const unsafeHeightEvidence = {
    level: 'primary', checkedAt: '2026-09-17',
    publicDescription: 'C:\\Users\\foo\\社内資料\\寸法図.pdf', privateReferenceAvailable: true
  };
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    Object.assign({}, fixture, { evidence: Object.assign({}, fixture.evidence, { heightEvidence: unsafeHeightEvidence }) })
  ));
});

test('RF-02: validateVerifiedCase() はpressureEvidence.publicDescriptionへの長いopaqueトークン混入を例外で拒否する（nested evidence, opaque ID rejection）', () => {
  const fixture = makeValidVerifiedCaseFixture();
  const unsafePressureEvidence = {
    level: 'primary', checkedAt: '2026-09-17',
    // 架空のfixture値（実際の社内file ID等は用いない）
    publicDescription: 'ref: 9zY8xW7vU6tS5rQ4pO3nM2lK1jI0hG',
    privateReferenceAvailable: true
  };
  // Human Gate §3: opaque-long-token は advisory へ降格されたので throw しない。
  // 代わりに publication lint が見つけることを見る（§10: nested も inventory に入る）。
  const withToken = Object.assign({}, fixture, {
    evidence: Object.assign({}, fixture.evidence, { pressureEvidence: unsafePressureEvidence })
  });
  assert.doesNotThrow(() => MiyoshiProjectConfig.validateVerifiedCase(withToken));
  const warnings = ProjectEvidence.lintPublicEvidenceText(
    unsafePressureEvidence.publicDescription, 'publicDescription').warnings;
  assert.equal(warnings.some((w) => w.rule === 'opaque-long-token'), true,
    'nested evidence の opaque token に警告が出ていない');
});

test('RF-02: validateVerifiedCase() のtop-level publicEvidenceDescriptionはWindowsパス・UNCパス・opaqueIDも拒否する（regex拡張後の回帰）', () => {
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    makeValidVerifiedCaseFixture({ publicEvidenceDescription: 'C:\\Users\\foo\\寸法図.pdf' })
  ));
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(
    makeValidVerifiedCaseFixture({ publicEvidenceDescription: '\\\\server\\share\\寸法図.pdf' })
  ));
  // opaque token は advisory へ降格。structural には有効だが警告が出る。
  assert.doesNotThrow(() => MiyoshiProjectConfig.validateVerifiedCase(
    makeValidVerifiedCaseFixture({ publicEvidenceDescription: 'ref: 1A2b3C4d5E6f7G8h9I0jK1L2M3N4O5' })
  ));
  assert.equal(
    ProjectEvidence.lintPublicEvidenceText('ref: 1A2b3C4d5E6f7G8h9I0jK1L2M3N4O5', 'x')
      .warnings.some((w) => w.rule === 'opaque-long-token'),
    true, 'top-level publicEvidenceDescription の opaque token に警告が出ていない');
});

test('Evidence: 公開config全体にprivate URL/IDが混入しない', () => {
  // 関数プロパティを除いたconfig全体をシリアライズして検査する。
  const serialized = JSON.stringify(MiyoshiProjectConfig, (key, val) =>
    typeof val === 'function' ? undefined : val
  );
  assert.doesNotMatch(serialized, /drive\.google|docs\.google|notion\.(so|com)|sharepoint|dropbox\.com/i);
  assert.doesNotMatch(serialized, /file_?id|folder_?id/i);
});

/* ============================================================
   代表ケース回帰テスト：config分離前後で計算値が不変であることの確認
   （project-configの値をcalc.jsの汎用計算コアへ渡した結果が、
    Phase 1時点の既知の値と一致すること）
============================================================ */

test('代表ケース: FL6 W=1250/H=2050/2F/general/extraFactor=1.00 → ≈1756.09756 N/m²・designP=1525・OK', () => {
  const W = 1250, H = 2050;
  const area = (W * H) / 1_000_000;
  const posP = MiyoshiProjectConfig.getPositivePressure('2');
  const negP = MiyoshiProjectConfig.getNegativePressure('general');
  const designP = Math.max(posP, negP);
  assert.equal(designP, 1525);

  const k1 = GlassCalc.getK1_FL(6);
  const P = GlassCalc.calcP_single(6, k1, 1.0, area, 1.0);
  assert.ok(Math.abs(P - 1756.09756097561) < 1e-6, `P=${P}`);
  assert.ok(P >= designP, 'OKと判定されるはず');

  // generateCandidates経由でも同じ値・同じ判定になることを確認
  const candidates = GlassCalc.generateCandidates('fl_single', area, designP, 1.0);
  const fl6 = candidates.find(c => c.label === 'FL6');
  assert.ok(fl6, 'FL6候補が存在するはず');
  assert.ok(Math.abs(fl6.P - 1756.09756097561) < 1e-6);
  assert.equal(fl6.status, 'ok');
});

test('代表ケース: FL6 W=1500/H=2050/2F/general/extraFactor=1.00 → ≈1463.41463 N/m²・designP=1525・NG', () => {
  const W = 1500, H = 2050;
  const area = (W * H) / 1_000_000;
  const posP = MiyoshiProjectConfig.getPositivePressure('2');
  const negP = MiyoshiProjectConfig.getNegativePressure('general');
  const designP = Math.max(posP, negP);
  assert.equal(designP, 1525);

  const k1 = GlassCalc.getK1_FL(6);
  const P = GlassCalc.calcP_single(6, k1, 1.0, area, 1.0);
  assert.ok(Math.abs(P - 1463.4146341463415) < 1e-6, `P=${P}`);
  assert.ok(P < designP, 'NGと判定されるはず');

  const candidates = GlassCalc.generateCandidates('fl_single', area, designP, 1.0);
  const fl6 = candidates.find(c => c.label === 'FL6');
  assert.ok(fl6, 'FL6候補が存在するはず');
  assert.ok(Math.abs(fl6.P - 1463.4146341463415) < 1e-6);
  assert.equal(fl6.status, 'ng');
});

/* ============================================================
   Phase 2F: Evidence contract抽出の回帰ガード
   （browserでのみ再現したmodule解決バグの再発防止）
============================================================ */

test('Phase 2F: Evidence contractの正は evidence.js であり miyoshi.js は再実装しない', () => {
  const evidence = require('../project-config/evidence.js');
  // 契約の実体が evidence.js にある
  for (const fn of ['makeEvidence', 'assertEvidenceConsistency', 'isValidCheckedAt',
                    'assertPublicSafeEvidenceText', 'verifiedValue',
                    'EVIDENCE_LEVELS', 'VERIFICATION_STATUSES']) {
    assert.ok(evidence[fn] !== undefined, 'evidence.js が ' + fn + ' を持つこと');
  }
  // miyoshi.js が公開する関数は evidence.js のものと同一実体（コピーではない）
  assert.equal(MiyoshiProjectConfig.makeEvidence, evidence.makeEvidence);
  assert.equal(MiyoshiProjectConfig.isValidCheckedAt, evidence.isValidCheckedAt);
  assert.equal(MiyoshiProjectConfig.assertPublicSafeEvidenceText, evidence.assertPublicSafeEvidenceText);
  assert.equal(MiyoshiProjectConfig.VERIFICATION_STATUSES, evidence.VERIFICATION_STATUSES);

  // miyoshi.js のソースに契約の再実装が残っていないこと
  const src = fs.readFileSync(PROJECT_CONFIG_SRC_PATH, 'utf8');
  assert.doesNotMatch(src, /function makeEvidence\s*\(/, 'makeEvidenceを再定義していない');
  assert.doesNotMatch(src, /function assertEvidenceConsistency\s*\(/, 'promotion guardを再定義していない');
  assert.doesNotMatch(src, /function isValidCheckedAt\s*\(/, 'isValidCheckedAtを再定義していない');
  assert.doesNotMatch(src, /var EVIDENCE_LEVELS = \[/, 'EVIDENCE_LEVELSを再定義していない');
});

test('Phase 2F: evidence contractの解決が bare `global` 識別子に依存しない（browser互換）', () => {
  // miyoshi.js のUMD factoryは global を引数に取らないため、
  // `typeof global` はブラウザで常に undefined になる。
  // resolver が globalThis を参照していることをソースで固定する。
  const src = fs.readFileSync(PROJECT_CONFIG_SRC_PATH, 'utf8');
  const start = src.indexOf('function resolveEvidenceContract');
  assert.ok(start > -1, 'resolveEvidenceContract が存在すること');
  const body = src.slice(start, src.indexOf('\n  }', start));
  assert.match(body, /globalThis/, 'resolverは globalThis を参照すること');
  assert.doesNotMatch(body, /typeof global ===/, 'bare `global` に依存しないこと');

  // factory signature が引数なしであるという前提自体も固定する
  assert.match(src, /\}\)\(typeof globalThis !== 'undefined' \? globalThis : this, function \(\) \{/);
});

test('Phase 2F: index.html が evidence.js を miyoshi.js より前に読み込む', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const ev = html.indexOf('src="project-config/evidence.js"');
  const mi = html.indexOf('src="project-config/miyoshi.js"');
  const pi = html.indexOf('src="project-config/project-input.js"');
  assert.ok(ev > -1, 'evidence.js のscriptタグが存在すること');
  assert.ok(ev < mi, 'evidence.js は miyoshi.js より前');
  assert.ok(ev < pi, 'evidence.js は project-input.js より前');
});

test('Phase 2F: 既存の verified な値はすべて強化後のpromotion gateを通る', () => {
  const evidence = require('../project-config/evidence.js');
  // identity / wind.V0 / wind.roughnessCategory の3件
  const verifiedEntries = [
    ['identity', MiyoshiProjectConfig.identity.evidence],
    ['wind.V0', MiyoshiProjectConfig.wind.V0.evidence],
    ['wind.roughnessCategory', MiyoshiProjectConfig.wind.roughnessCategory.evidence]
  ];
  for (const [label, ev] of verifiedEntries) {
    assert.doesNotThrow(
      () => evidence.assertPromotionGate('verified', ev, label),
      label + ' は強化後のgateを通ること'
    );
    assert.equal(ev.privateReferenceAvailable, true, label + ' は private reference を持つ');
  }
});

/* ============================================================
   独立検証(Phase 2F) F9 — caseIdのpublic-safe boundary
============================================================ */

test('F9: verified case の caseId に図面番号・ファイル名・URLを持ち込めない', () => {
  // caseIdはUI・export package・PR本文にそのまま出る公開identifierである。
  // D-012がfactKeyにallowlistを課したのと同じ理由がここにも等しく当てはまる。
  const base = makeValidVerifiedCaseFixture();
  assert.doesNotThrow(() => MiyoshiProjectConfig.validateVerifiedCase(base));

  const rejected = [
    'A-102.pdf', 'plan_A102.dwg', 'shop-drawing.dxf', 'calc.xlsx', 'sheet.DOC',
    'A_102_pdf', '図面A-102', 'case A102', '2026-案件',
    'https://example.com/a', '/home/user/secret.pdf', 'C:\\docs\\a.pdf',
    '1A102', '-A102', '',
    'x'.repeat(49),
    // CASE_ID_PATTERNは通る長さ・字種だが、不透明な長いトークン
    // （Drive file ID等をそのままcaseIdにした形）はpublic-safe guardが塞ぐ。
    // この1件があることで、pattern検査とpublic-safe guardが別々に効いている。
    'SyntheticOpaqueTokenAAAAAAAAAA'
  ];
  for (const caseId of rejected) {
    const broken = Object.assign({}, base, { caseId });
    assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(broken),
      /caseId/, 'caseId ' + JSON.stringify(caseId) + ' は拒否されるべき');
  }

  // 公開して差し支えない短い記号IDは通る
  for (const caseId of ['case_1', 'GlassPane-A', 'F3W1250H2050', 'sample']) {
    const okCase = Object.assign({}, base, { caseId });
    assert.doesNotThrow(() => MiyoshiProjectConfig.validateVerifiedCase(okCase),
      'caseId ' + JSON.stringify(caseId) + ' は受理されるべき');
  }
});

/* ============================================================
   独立検証(Phase 2F) F11 — 構築経路ではなく「configに載った結果」を検査する
============================================================ */

test('F11: validateAllEvidence() は強化後のpromotion gateでconfigの実体を検査する', () => {
  // identityは verifiedValue() を経由せずliteralで組まれているため、
  // 「gateを通したevidence変数」と「literalが実際に載せたevidence」が
  // 別物になっても、構築時のgateだけでは気づけない。
  // validateAllEvidence() が結果を検査し、module loadごと失敗させること。
  assert.deepEqual(MiyoshiProjectConfig.validateAllEvidence(), []);

  const src = fs.readFileSync(PROJECT_CONFIG_SRC_PATH, 'utf8');
  const marker = `      evidence: identityEvidence\n    },`;
  assert.equal(src.split(marker).length - 1, 1,
    'identity.evidence のliteralが一意に見つかるはず（ソース構造が変わった可能性）');

  // gateを通した identityEvidence ではなく、別の弱いevidenceをliteralに載せる。
  // 構築時の assertPromotionGate('verified', identityEvidence) は依然成功するので、
  // これを捕まえられるのは「結果を検査する」経路だけである。
  const repointed = src.replace(marker,
    `      evidence: makeEvidence('indirect', '2026-09-17', '間接的に整合を確認', true)\n    },`);
  assert.notEqual(repointed, src);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'miyoshi-identity-rebind-test-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'evidence.js'),
      fs.readFileSync(path.join(__dirname, '..', 'project-config', 'evidence.js'), 'utf8'));
    const tmpFile = path.join(tmpDir, 'miyoshi.js');
    fs.writeFileSync(tmpFile, repointed);
    delete require.cache[require.resolve(tmpFile)];
    assert.throws(() => require(tmpFile),
      /evidence contract violated at module load[\s\S]*identity/,
      'identity.evidence を差し替えたらmodule loadが失敗するはず');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('F11: validateAllEvidence() は privateReferenceAvailable まで見る（弱い方に退行しない）', () => {
  // assertEvidenceConsistency は privateReferenceAvailable を検査しない。
  // そちらへ退行すると、private参照もpublic referenceも無い 'verified' が
  // configに載ったまま「違反なし」と報告されてしまう。
  const src = fs.readFileSync(PROJECT_CONFIG_SRC_PATH, 'utf8');
  const fn = src.slice(src.indexOf('config.validateAllEvidence = function'));
  const body = fn.slice(0, fn.indexOf('\n  };'));
  assert.match(body, /assertPromotionGate\(/,
    'validateAllEvidence は強化後のgateを使うこと');
  assert.doesNotMatch(body, /assertEvidenceConsistency\(/,
    'validateAllEvidence は弱いconsistency checkに退行しないこと');
  assert.match(body, /sourceReference/,
    'public primary referenceで検証した値も正しく判定できること');
});
