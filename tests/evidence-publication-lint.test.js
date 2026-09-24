'use strict';

/**
 * Human Gate §8 の実装に対する test。
 *
 *   §17  advisory 3 規則は throw せず、**必ず警告を出す**
 *   §18  警告に読み手がいる（QD-J17）。consumer が握り潰したら落ちる
 *   §19  caseId は opaque-long-token が throw することに依存しない（QD-J16）
 *
 * fixture はすべて合成である。実在の file ID / URL / 案件名は使わない。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const Evidence = require('../project-config/evidence.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');

const LINT = path.join(__dirname, '..', 'tools', 'evidence-publication-lint.mjs');
const loadLint = () => import(LINT);

// 合成の証人。各 advisory 規則を 1 つずつ踏む。
const ADVISORY_WITNESSES = [
  ['www', 'www.example.com を参照'],
  ['known-private-provider', 'notion.so のページを参照'],
  ['opaque-long-token', 'ref abcdefghijklmnopqrstuvwxyz0123456789']
];

test('§17: advisory 3 規則は throw せず、警告を必ず出す', () => {
  // 降格された規則が「黙って通る」ようになっていないことを、
  // **警告が出たこと**まで見て確かめる。throw しなかっただけの test にしない。
  const advisoryNames = Evidence.ADVISORY_LINT_RULES.map((r) => r.name).sort();
  assert.deepEqual(advisoryNames, ['known-private-provider', 'opaque-long-token', 'www'],
    'advisory 集合が変わっている');

  ADVISORY_WITNESSES.forEach(([rule, text]) => {
    // (a) throw しない
    assert.equal(Evidence.assertPublicSafeEvidenceText(text, 'prose'), true,
      rule + ' がまだ throw している: ' + text);
    // (b) 警告が出る（positive control）
    const warnings = Evidence.lintPublicEvidenceText(text, 'prose').warnings;
    const hit = warnings.filter((w) => w.rule === rule);
    assert.equal(hit.length, 1, rule + ' の警告が出ていない: ' + JSON.stringify(warnings));
    assert.equal(hit[0].severity, 'advisory');
    assert.equal(typeof hit[0].message, 'string');
    // 空でないだけでは人は動けない。何をすればよいかまで書かせる。
    // message を 'x' へ縮める変異がこれ無しでは生き残った（M-22）。
    assert.equal(hit[0].message.length >= 24, true,
      rule + ' の message が短すぎて判断に使えない: ' + JSON.stringify(hit[0].message));
    assert.match(hit[0].message, /human review/i,
      rule + ' の message が人の確認を求めていない');
  });

  // (c) 安全な散文では警告が出ない（警告が常時出る実装になっていないこと）
  ['一次資料で直接確認（合成fixture）', '基準風速 V0 は 34 m/s、地表面粗度区分 III']
    .forEach((text) => {
      assert.equal(Evidence.lintPublicEvidenceText(text, 'prose').warnings.length, 0, text);
    });

  // (d) hard 9 規則は throw のまま
  assert.equal(Evidence.HARD_REJECT_RULES.length, 9, 'hard 規則の数が変わっている');
  [['windows-absolute-path', 'C:\\Users\\x'], ['email-like', 'u@example.com'],
   ['unc-path', '\\\\srv\\share'], ['url-scheme', 'https://x.example.com']]
    .forEach(([rule, text]) => {
      assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
        new RegExp(rule), text);
    });
});

test('§18: 警告には読み手がいる——consumer が握り潰したら落ちる（QD-J17）', async () => {
  const lint = await loadLint();
  const inventory = ADVISORY_WITNESSES.map(([rule, value], i) => ({
    path: 'Synthetic.case' + i + '.publicDescription', field: 'publicDescription', value
  }));
  const { results, lines } = lint.runLint({ inventory });
  const rendered = lines.join('\n');

  // analyse() が警告を作っていること
  const produced = results.flatMap((r) => r.warnings.map((w) => w.rule)).sort();
  assert.deepEqual(produced, ['known-private-provider', 'opaque-long-token', 'www'],
    'lint が警告を作っていない');

  // **描画されていること**。ここが QD-J17 の要。
  // formatReport() から警告を落とす変異を入れると、この assert が落ちる。
  ADVISORY_WITNESSES.forEach(([rule, value]) => {
    assert.equal(rendered.includes(rule), true, '規則名が出力に無い: ' + rule);
    assert.equal(rendered.includes(value), true, '対象の値が出力に無い: ' + value);
  });
  assert.match(rendered, /ADVISORY WARNINGS \(3 value\(s\)\)/);

  // 「警告が空である」ことを安全の証明として書いていないこと（§13）
  assert.match(rendered, /NOT proof that the prose is safe to publish/);
  assert.match(rendered, /Human Review is required/);

  // advisory だけでは失敗しない（§7: gate ではない）
  assert.equal(lint.runLint({ inventory }).hardErrorCount, 0);
});

test('§18: 出荷済み config を lint しても advisory は 0 で、hard 違反も無い', async () => {
  const lint = await loadLint();
  const { results, hardErrorCount, lines } = lint.runLint();
  assert.equal(hardErrorCount, 0, 'hard 規則違反が出荷 config にある');
  assert.equal(results.length > 0, true, 'inventory が空——収集が壊れている');
  // inventory が publication-facing field を実際に見ていること
  assert.deepEqual(lint.PUBLICATION_FACING_FIELDS.slice().sort(),
    ['caseId', 'publicDescription', 'publicEvidenceDescription']);
  assert.match(lines.join('\n'), /No advisory warnings\./);
});

test('§19: caseId は opaque-long-token の throw に依存しない（QD-J16）', () => {
  // 形は project-config.test.js の makeValidVerifiedCaseFixture と揃える。
  const primaryEvidence = () =>
    MiyoshiProjectConfig.makeEvidence('primary', '2026-09-17', '合成fixtureで確認済み', true);
  const fixture = (caseId) => ({
    caseId: caseId, floor: '2', zone: 'general', widthMm: 1250, heightMm: 2050,
    glassType: 'fl_single', designPressure: 1525,
    evidence: {
      widthEvidence: primaryEvidence(),
      heightEvidence: primaryEvidence(),
      pressureEvidence: primaryEvidence()
    },
    publicEvidenceDescription: '合成fixtureにより確認済み（固有名詞・URLなし）'
  });

  // (a) 長い不透明 caseId は **長さの構造契約**で落ちる。advisory 降格で
  //     新たに有効化されてはならない。
  ['A1BcDeFgHiJkLmNoPqRsTuVwXyZ012345', 'AKIAIOSFODNN7EXAMPLEKEY123456',
   'abcdefghijklmnopqrstuvwxyz0123'].forEach((caseId) => {
    assert.equal(caseId.length >= 28, true, 'fixture が短すぎる: ' + caseId);
    assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(fixture(caseId)),
      /public-safe short identifier/, '長い caseId が通った: ' + caseId);
  });

  // (b) しきい値が opaque-long-token(28) を下回っていること自体を押さえる。
  //     27 文字は通り、28 文字は落ちる——guard 側の規則を一切使わずに。
  const at27 = 'a'.repeat(27);
  const at28 = 'a'.repeat(28);
  assert.equal(Evidence.lintPublicEvidenceText(at28, 'x').warnings.length > 0, true,
    '28 文字が advisory にかからない（前提が崩れている）');
  assert.doesNotThrow(() => MiyoshiProjectConfig.validateVerifiedCase(fixture(at27)),
    '27 文字の caseId が落ちた');
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(fixture(at28)),
    /public-safe short identifier/, '28 文字が長さ契約で落ちていない');

  // (c) provider に似た **構造的には妥当な** caseId は有効のまま。
  //     閉じた構造契約 と 開いた意味的 lint を混同しない（Human Gate §9）。
  //     ただし publication lint は必ず警告を出す。
  const providerish = 'sharepoint_case_01';
  assert.doesNotThrow(() => MiyoshiProjectConfig.validateVerifiedCase(fixture(providerish)),
    'provider 風 caseId を構造規則で落としている（開いた集合を閉じた規則で追っている）');
  assert.equal(
    Evidence.lintPublicEvidenceText(providerish, 'caseId')
      .warnings.some((w) => w.rule === 'known-private-provider'),
    true, 'provider 風 caseId に advisory 警告が出ていない');

  // (d) filename 風 caseId は hard structural rule のまま
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(fixture('plan_jww')),
    /filename/, 'filename 風 caseId が通った');
});

test('§10: publication lint の inventory は caseId と nested な記述も拾う', async () => {
  const lint = await loadLint();
  // 合成の root。出荷 config には verifiedCases が無い（空配列）ので、
  // nested な経路が収集されることを合成データで確かめる。
  const roots = {
    Synthetic: {
      verifiedCases: [{
        caseId: 'sharepoint_case_01',
        publicEvidenceDescription: 'ref abcdefghijklmnopqrstuvwxyz0123456789',
        evidence: { publicDescription: 'www.example.com を参照' }
      }]
    }
  };
  const inventory = lint.collectInventory(roots);
  const fields = inventory.map((i) => i.field).sort();
  assert.deepEqual(fields, ['caseId', 'publicDescription', 'publicEvidenceDescription'],
    '収集された field: ' + JSON.stringify(fields));

  const { lines } = lint.runLint({ inventory });
  const rendered = lines.join('\n');
  ['known-private-provider', 'opaque-long-token', 'www'].forEach((rule) => {
    assert.equal(rendered.includes(rule), true, rule + ' が出力に無い');
  });
  // path が出ていること（人が場所を特定できる）
  assert.match(rendered, /Synthetic\.verifiedCases\[0\]\.caseId/);
});
