'use strict';
// Phase 2K Wave 3 — the differential's own independence (P2K-F01..F03).
//
// Wave 0 measured the blindness: the corpus derived DOT_EQUIVALENTS from the
// module under test, and diff-heads passed it the extension source from the
// head under test, so a commit that SHRANK either constant shrank the corpus
// meant to police it. Both experiments made a real value publishable and the
// differential reported REGRESSIONS: 0.
//
// Re-measured in Wave 3 with the corpus owning its own threat list:
//
//   drop one dot equivalent      0  ->  26,496 regressions, exit 1
//   drop 4 extension atoms       0  ->  32,000 regressions, exit 1
//
// Reproduce: apply either change to project-config/evidence.js and run
//   node tools/guard-diff/diff-heads.mjs HEAD

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const loadCorpus = () => import('../tools/guard-diff/corpus.mjs');
const loadDiff = () => import('../tools/guard-diff/differential.mjs');

test('P2K-D01: corpus は production から何も import しない（P2K-F01 の構造的な錠）', () => {
  // Structural, deliberately. The defect was not a wrong value but a wrong
  // DEPENDENCY DIRECTION, and a value assertion cannot see a dependency. If
  // this file ever reads project-config again, every "REGRESSIONS: 0" it
  // produces becomes unfalsifiable for the constants it reads.
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'tools/guard-diff/corpus.mjs'), 'utf8');
  const offenders = src.split('\n')
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /project-config/.test(line) && !/^\s*(\/\/|\*)/.test(line.trim()));
  assert.deepEqual(offenders, [],
    'corpus.mjs が project-config を参照している: ' + JSON.stringify(offenders));
});

test('P2K-D02: 委託リストは committed な literal であり、production 由来ではない', async () => {
  const c = await loadCorpus();
  // Counts are hardcoded. A derived list would silently follow production.
  assert.equal(c.CORPUS_DOT_EQUIVALENTS.length, 12,
    'dot 脅威リストの件数が変わった: ' + c.CORPUS_DOT_EQUIVALENTS.length);
  assert.equal(c.CORPUS_EXCLUDED_DOTS.length, 3);
  assert.equal(c.CORPUS_EXTENSION_ATOMS.length, 36,
    'extension atom の件数が変わった: ' + c.CORPUS_EXTENSION_ATOMS.length);
  assert.equal(c.expandExtensions(c.CORPUS_EXTENSION_SOURCE).length, 46,
    '46 個の具体形に展開されない');
  // Spot-check membership literally, including the one whose removal Wave 0
  // used as experiment A and the ones experiment B removed.
  assert.equal(c.CORPUS_DOT_EQUIVALENTS.includes('\u0387'), true, 'U+0387 が無い');
  ['rar', '7z', 'lzh', 'gz'].forEach((a) => {
    assert.equal(c.CORPUS_EXTENSION_ATOMS.includes(a), true, a + ' が無い');
  });
});

test('P2K-D03: constantCoverage は報告する。決して採用しない', async () => {
  const c = await loadCorpus();
  const sizeBefore = c.buildCorpus().length;

  // A production module that LOST one dot and four extension atoms. This is
  // exactly Wave 0's two experiments, as data rather than as a patch.
  const shrunken = {
    DOT_EQUIVALENTS: c.CORPUS_DOT_EQUIVALENTS
      .filter((d) => d !== '\u0387').join(''),
    PRIVATE_DOCUMENT_EXTENSION_SOURCE: c.CORPUS_EXTENSION_ATOMS
      .filter((a) => ['rar', '7z', 'lzh', 'gz'].indexOf(a) === -1).join('|')
  };
  const cov = c.constantCoverage(shrunken);
  assert.deepEqual(cov.dots.extraInCorpus, ['\u0387'],
    'production が失った dot を報告していない: ' + JSON.stringify(cov.dots));
  assert.deepEqual(cov.extensionAtoms.extraInCorpus.slice().sort(),
    ['7z', 'gz', 'lzh', 'rar'],
    'production が失った extension を報告していない');
  assert.deepEqual(cov.dots.missingFromCorpus, []);

  // And the corpus is the same size as before: reporting a gap must not shrink
  // the corpus. This is the assertion that makes it a report and not a
  // derivation.
  assert.equal(c.buildCorpus().length, sizeBefore,
    'coverage を見た後で corpus が変わった——導出に戻っている');

  // The other direction: production GREW. That is a call to widen the corpus
  // deliberately, and must be reported too.
  const grown = {
    DOT_EQUIVALENTS: c.CORPUS_DOT_EQUIVALENTS.join('') + '\u2e2e',
    PRIVATE_DOCUMENT_EXTENSION_SOURCE: c.CORPUS_EXTENSION_SOURCE + '|kra'
  };
  const cov2 = c.constantCoverage(grown);
  assert.deepEqual(cov2.dots.missingFromCorpus, ['\u2e2e']);
  assert.deepEqual(cov2.extensionAtoms.missingFromCorpus, ['kra']);
});

test('P2K-D04: 両方 reject でも rule が変われば記録される（P2K-F03）', async () => {
  const d = await loadDiff();
  // Synthetic guard modules. The instrument supplies inputs and the
  // comparison; each side answers with its own code.
  const rejectAs = (rule) => ({
    assertPublicSafeEvidenceText() { throw new Error('bad (pattern: ' + rule + ')'); },
    HARD_REJECT_RULES: [{ name: rule }]
  });
  const accept = { assertPublicSafeEvidenceText() {}, HARD_REJECT_RULES: [] };

  const shifted = d.compare(rejectAs('unc-path'), rejectAs('windows-absolute-path'), ['x']);
  assert.equal(shifted.regressions.length, 0, 'safety regression ではない');
  assert.equal(shifted.tightened.length, 0);
  assert.deepEqual(shifted.reattributed, [['x', 'unc-path', 'windows-absolute-path']],
    'rule が移ったのに記録されていない——これが P2K-F03');

  // The two original buckets still behave.
  assert.equal(d.compare(rejectAs('r'), accept, ['x']).regressions.length, 1);
  assert.equal(d.compare(accept, rejectAs('r'), ['x']).tightened.length, 1);
  // Same rule on both sides is not a change.
  assert.equal(d.compare(rejectAs('r'), rejectAs('r'), ['x']).reattributed.length, 0);
});

test('P2K-D05: corpus が触っていない rule は gap として名前が出る', async () => {
  const d = await loadDiff();
  const mod = { HARD_REJECT_RULES: [{ name: 'seen' }, { name: 'never' }] };
  assert.deepEqual(d.ruleCoverageGaps(mod, { seen: 3 }), ['never'],
    '未行使の rule を報告していない');
  assert.deepEqual(d.ruleCoverageGaps(mod, { seen: 1, never: 1 }), []);
  // The gap is what makes a zero meaningful. Reporting "0 regressions" for a
  // rule no input reaches is the defect, not the zero (P2K-F02).
});

test('P2K-D06: 9 つの hard rule すべてに corpus 内の positive control がある', async () => {
  const c = await loadCorpus();
  const d = await loadDiff();
  const Evidence = require('../project-config/evidence.js');

  // One literal input per rule, each verified to be a corpus member. Walking
  // all 643k inputs here would be slow and would pin nothing extra: what
  // matters is that each rule HAS a control and that the control is in the
  // corpus. `control-character` is in this table because the Wave 3 coverage
  // check found it NEVER EXERCISED -- the corpus had produced no input
  // attributed to it, so every zero printed before Wave 3 was silent about it.
  const CONTROLS = [
    ['url-scheme', 'https://drive.google.com/x'],
    ['windows-absolute-path', 'C:' + '\\' + 'Users' + '\\' + 'Users'],
    ['unc-path', '\\\\' + 'Users' + '\\' + 'Users'],
    ['unix-home-or-absolute-path', '/home/Users/x'],
    ['email-like', 'abc@example.com'],
    ['private-document-filename', '構造計算書.pdf'],
    ['html-like-tag', '<img src=x onerror=alert(1)>'],
    ['markup-construct', '<!--x-->'],
    ['control-character', '\u0000一次資料で確認した']
  ];

  const names = Evidence.HARD_REJECT_RULES.map((r) => r.name).sort();
  assert.deepEqual(CONTROLS.map(([n]) => n).sort(), names,
    'hard rule の集合と control の表がずれた: ' + JSON.stringify(names));

  const corpus = new Set(c.buildCorpus());
  for (const [rule, input] of CONTROLS) {
    assert.equal(d.attribute(Evidence, input), rule,
      rule + ' の control が別の rule に帰属した: ' + JSON.stringify(input));
    assert.equal(corpus.has(input), true,
      rule + ' の control が corpus に無い——差分は この rule を測れない: ' +
      JSON.stringify(input));
  }
});

test('P2K-D07: control 文字クラスの非メンバー（tab/改行/CR）は通ること', async () => {
  const c = await loadCorpus();
  const d = await loadDiff();
  const Evidence = require('../project-config/evidence.js');
  const corpus = new Set(c.buildCorpus());

  // The other half of the control. Without these, widening the class into
  // ordinary whitespace would pass unnoticed; with them it appears as
  // `tightened`.
  for (const ch of ['\t', '\n', '\r']) {
    const input = ch + '一次資料で確認した';
    assert.equal(corpus.has(input), true,
      '非メンバーの control 文字が corpus に無い: ' + JSON.stringify(ch));
    assert.equal(d.attribute(Evidence, input), null,
      'tab/改行/CR が reject された: ' + JSON.stringify(ch));
  }
});

test('P2K-D08: exit code —— regression と coverage gap のどちらでも落ちる', async () => {
  const d = await loadDiff();
  assert.equal(d.exitCodeFor({ regressions: 0, coverageGaps: 0 }), 0);
  assert.equal(d.exitCodeFor({ regressions: 1, coverageGaps: 0 }), 1, 'regression で落ちない');
  assert.equal(d.exitCodeFor({ regressions: 0, coverageGaps: 1 }), 1,
    '測れていない rule があるのに 0 で抜けた——「0 regressions」が無意味になる');
  // Re-attribution alone does not fail: nothing became publishable, and the
  // Phase 2J policy change would legitimately produce many.
  assert.equal(d.exitCodeFor({ regressions: 0, coverageGaps: 0, reattributed: 126 }), 0);
});

test('P2K-D09: corpus の大きさと digest を committed literal で固定する（P2K-F07）', async () => {
  const c = await loadCorpus();
  const corpus = c.buildCorpus();

  // Both are hardcoded. "REGRESSIONS: 0 over 643,419 inputs" names a number
  // but not the thing measured; two different corpora of the same size quote
  // identically. Pinning the digest makes every corpus change deliberate and
  // reviewed -- the corpus is this instrument's measuring scale, so a silent
  // change to it silently changes every figure derived from it.
  //
  // If you changed the corpus on purpose, update BOTH values here in the same
  // commit and say why in the Run Artifact.
  assert.equal(corpus.length, 643419, 'corpus の大きさが変わった: ' + corpus.length);
  assert.equal(c.corpusDigest(corpus),
    'sha256:ac68342ee1eb21aad45e2c7ed57199b0cd27fe28180a3ecfa55952789b97996e',
    'corpus digest が変わった: ' + c.corpusDigest(corpus));

  // Deterministic across builds, and order-sensitive: order decides which rule
  // wins first-match attribution, so a reordered corpus is a different scale.
  assert.equal(c.corpusDigest(c.buildCorpus()), c.corpusDigest(corpus), '決定的でない');
  assert.notEqual(c.corpusDigest(['a', 'b']), c.corpusDigest(['b', 'a']),
    'digest が順序を見ていない');
  // And separator-sensitive, so concatenation cannot collide.
  assert.notEqual(c.corpusDigest(['ab']), c.corpusDigest(['a', 'b']));
});

test('P2K-D10: advisory 3 規則も corpus が触っていることを確かめる', async () => {
  const c = await loadCorpus();
  const d = await loadDiff();
  const Evidence = require('../project-config/evidence.js');

  // The hard-rule check reads attribution out of the thrown error, which only
  // exists for hard rules. Advisory rules warn instead, so they had no
  // coverage check at all -- the same gap that hid `control-character`, one
  // layer over. These three are the entire Human Review surface for the Phase
  // 2J policy change.
  assert.deepEqual(d.advisoryCoverageGaps(Evidence, c.buildCorpus()), [],
    'advisory 規則のどれかを corpus が一度も触っていない');

  // The check must be able to report a gap, not just return [].
  const twoRules = {
    ADVISORY_LINT_RULES: [{ name: 'www' }, { name: 'ghost-rule' }],
    lintPublicEvidenceText: () => ({ warnings: [{ rule: 'www' }] })
  };
  assert.deepEqual(d.advisoryCoverageGaps(twoRules, ['x']), ['ghost-rule'],
    '触られていない advisory 規則を報告しない');
});

