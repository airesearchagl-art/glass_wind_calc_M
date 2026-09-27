'use strict';
// Phase 2K Wave 2 — publication-lint discovery independence (QD-J23).
//
// QD-J23: defaultRoots() used one flat readdirSync, and its test used the same
// flat readdirSync, so a config module one directory down was missed by both
// and the suite stayed green. Measured, not asserted:
//
//   node tools/verification/experiments/lint-discovery-depth.mjs
//
//   before (flat)      : 3 planted values, 0 discovered, suite 7/7 green
//   after  (recursive) : 3 planted values, 3 discovered,
//                        1 advisory + 1 hard error reported, suite went red
//
// The rule this file exists to enforce: the implementation's walker and this
// file's oracles must be DIFFERENT MECHANISMS. Three are used here, none of
// them the implementation's stack descent:
//
//   1. a hand-written literal expectation over a committed fixture tree
//   2. `git ls-files` -- git's index, nothing to do with node:fs
//   3. a temporary tree built by this test, whose contents are known by
//      construction
//
// A copy of the implementation's algorithm is not an oracle. That is what
// QD-J20 / QD-J21 / QD-J23 all were.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'lint-discovery');
const BROKEN_FIXTURE_DIR = path.join(__dirname, 'fixtures', 'lint-discovery-broken');

function loadLint() {
  return import('../tools/evidence-publication-lint.mjs');
}

// ---------------------------------------------------------------------------
// Oracle 1 — a literal list. Nothing computes this; it is read off the tree.
//
//   tests/fixtures/lint-discovery/
//     alpha.js                  <- top level
//     notes.md                  <- not .js, must be skipped
//     sub/beta.js               <- one down
//     sub/README.txt            <- not .js, must be skipped
//     sub/deeper/gamma.js       <- two down
// ---------------------------------------------------------------------------
const FIXTURE_MODULES_LITERAL = [
  'alpha.js',
  'sub/beta.js',
  'sub/deeper/gamma.js'
];

test('P2K-L01: discovery は再帰する。深さ・拡張子・順序を literal で固定する', async () => {
  const lint = await loadLint();
  const found = lint.discoverConfigModules(FIXTURE_DIR);

  // deepEqual against a literal pins four things at once: recursion happens,
  // it reaches depth 2, non-.js files are skipped, and the order is sorted.
  // A count assertion would pin only the count -- and this campaign has been
  // caught by counting instead of comparing several times (F13-03, F16-07).
  assert.deepEqual(found, FIXTURE_MODULES_LITERAL,
    'discovery の結果が literal と違う: ' + JSON.stringify(found));

  // Stated separately so a failure says which property broke.
  assert.equal(found.some((f) => f.includes('/')), true,
    'サブディレクトリの module が 1 件も無い——再帰していない（QD-J23 の再発）');
  assert.equal(found.some((f) => f.split('/').length >= 3), true,
    '深さ 2 に届いていない');
  assert.deepEqual(found.filter((f) => !f.endsWith('.js')), [],
    '.js 以外を拾っている');
});

test('P2K-L02: nested module の root 名は POSIX 相対路である（人が場所を特定できる）', async () => {
  const lint = await loadLint();
  const roots = Object.keys(lint.defaultRoots(FIXTURE_DIR)).sort();

  // Literal again. The naming convention is load-bearing: the report has to
  // say WHERE the value is, and a nested module collapsed to its basename
  // (`beta`) would be ambiguous the moment two subdirectories both hold one.
  assert.deepEqual(roots, ['alpha', 'sub/beta', 'sub/deeper/gamma'],
    'root 名の文法が変わった: ' + JSON.stringify(roots));
  roots.forEach((r) => {
    assert.equal(r.includes('\\'), false, 'Windows 区切りが混ざった: ' + r);
    assert.equal(r.endsWith('.js'), false, '拡張子が残っている: ' + r);
  });
});

test('P2K-L03: nested な公開面値は inventory と report の両方に、経路付きで現れる', async () => {
  const lint = await loadLint();
  const inventory = lint.collectInventory(lint.defaultRoots(FIXTURE_DIR));
  const paths = inventory.map((i) => i.path).sort();

  assert.deepEqual(paths, [
    'alpha.publicDescription',
    'sub/beta.verifiedCases[0].caseId',
    'sub/beta.verifiedCases[0].publicEvidenceDescription',
    'sub/deeper/gamma.nested.publicDescription'
  ], '経路が変わった: ' + JSON.stringify(paths));

  // End to end: discovery -> analysis -> render. The advisory the nested
  // fixture trips must reach a human with its location attached. Discovery
  // that finds a value whose warning is then dropped is QD-J17 again.
  const { lines, results } = lint.runLint({ inventory });
  const rendered = lines.join('\n');
  // Address the value by its exact path, not by `find`-ing the first entry
  // under `sub/beta.` -- the first one is the warning-free caseId, so a
  // first-match lookup asserts nothing about the value that carries the
  // advisory. That is P2K-F03's shape, and it caught this test on first run.
  const nested = results.find(
    (r) => r.path === 'sub/beta.verifiedCases[0].publicEvidenceDescription');
  assert.notEqual(nested, undefined, '対象の経路が inventory に無い');
  assert.deepEqual(nested.warnings.map((w) => w.rule), ['www'],
    'nested fixture の advisory が期待と違う: ' + JSON.stringify(nested.warnings));
  assert.equal(nested.hardError, null, 'fixture が hard 規則を踏んでいる');
  assert.match(rendered, /sub\/beta\.verifiedCases\[0\]\.publicEvidenceDescription/);
  assert.equal(rendered.includes('www'), true, 'www 規則が report に無い');
});

test('P2K-L04: 実 project-config の discovery を git ls-files（別機構）と照合する', async () => {
  const lint = await loadLint();

  // Oracle 2: git's index. Not node:fs, not a walker, no shared assumption
  // about directory traversal at all. If git is missing or the repo is not a
  // checkout, this must fail loudly rather than skip -- a skipped independence
  // check is indistinguishable from a passing one in the summary.
  const tracked = execFileSync('git', ['ls-files', '-z', '--', 'project-config'],
    { cwd: REPO_ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((f) => f.endsWith('.js'))
    .map((f) => f.replace(/^project-config\//, ''))
    .sort();

  assert.equal(tracked.length > 0, true,
    'git ls-files が空——oracle が壊れている（独立性の検査が無意味になる）');

  const discovered = lint.discoverConfigModules();

  const missed = tracked.filter((f) => !discovered.includes(f));
  assert.deepEqual(missed, [],
    'lint が見ていない tracked config module: ' + JSON.stringify(missed));

  // The reverse direction is not automatically a defect: an untracked module in
  // a working tree is legitimately discovered and legitimately absent from git's
  // index. But the first version of this check was broken twice over, and an
  // independent verifier found both:
  //
  //   1. It called `git ls-files --error-unmatch`, which EXITS NON-ZERO for an
  //      untracked path, so execFileSync threw before the assertion ran. The
  //      very red its own comment warns about ("a red that accuses a correct
  //      lint"), with a message about pathspecs rather than about the lint.
  //   2. Even had it not thrown, it was vacuous: `extras` is by construction
  //      the set not in `tracked`, so asserting each extra is absent from
  //      `tracked` asserts nothing.
  //
  // The check that means something uses a DIFFERENT git view: an extra must
  // show up as untracked in `git status`. If a file is discovered, absent from
  // ls-files, and not reported untracked by status, the two git views disagree
  // and the oracle is broken.
  const extras = discovered.filter((f) => !tracked.includes(f));
  const untracked = new Set(
    execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'project-config'],
      { cwd: REPO_ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((l) => l.startsWith('??'))
      .map((l) => l.slice(3).trim().replace(/^project-config\//, ''))
  );
  const unexplained = extras.filter((f) => !untracked.has(f));
  assert.deepEqual(unexplained, [],
    'discovery にあり ls-files にも status にも無い——git の 2 つの見方が矛盾している: ' +
    JSON.stringify(unexplained));
  // Stated rather than hidden: with a clean tree `extras` is empty and the
  // assertion above is trivially true. Its job is to catch the disagreement
  // when a file IS there, not to prove anything on a clean checkout.
  assert.equal(Array.isArray(extras), true);
});

test('P2K-L05: symlink は辿らない（循環しない・木の外へ出ない）', async () => {
  const lint = await loadLint();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'p2k-lint-symlink-'));
  try {
    // Oracle 3: a tree this test builds, so its contents are known by
    // construction rather than by walking it.
    fs.writeFileSync(path.join(tmp, 'real.js'), 'module.exports = {};\n', 'utf8');
    fs.mkdirSync(path.join(tmp, 'inner'));
    fs.writeFileSync(path.join(tmp, 'inner', 'deep.js'), 'module.exports = {};\n', 'utf8');

    let symlinkSupported = true;
    try {
      // A directory symlink pointing at its own ancestor: following it loops.
      fs.symlinkSync(tmp, path.join(tmp, 'inner', 'loop'), 'dir');
      fs.symlinkSync(path.join(tmp, 'real.js'), path.join(tmp, 'linked.js'), 'file');
    } catch (e) {
      symlinkSupported = false;
    }

    const found = lint.discoverConfigModules(tmp);
    assert.deepEqual(found, ['inner/deep.js', 'real.js'],
      'symlink を辿った、または実ファイルを落とした: ' + JSON.stringify(found));

    if (symlinkSupported) {
      assert.equal(found.includes('linked.js'), false,
        'file symlink を module として拾った');
      assert.equal(found.some((f) => f.includes('loop')), false,
        'directory symlink を降りた——循環の入口');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('P2K-L06: 読み込めない config module は throw する（黙って件数を減らさない）', async () => {
  const lint = await loadLint();

  // Discovery itself succeeds -- the file exists and ends in .js.
  assert.deepEqual(lint.discoverConfigModules(BROKEN_FIXTURE_DIR), ['explodes.js']);

  // Loading it must propagate. The whole point of deriving roots was to stop
  // the inventory silently shrinking; a swallowed require() would restore
  // exactly that failure with a different mechanism.
  assert.throws(() => lint.defaultRoots(BROKEN_FIXTURE_DIR),
    /synthetic load failure/,
    '読み込み失敗が飲み込まれた——inventory が黙って縮む');
});

test('P2K-L07: QD-J23 実験は再現可能で、木を必ず元に戻す', () => {
  // Phase 2K §17: a load-bearing number needs a committed generator and a
  // recorded command. The before/after pair in EVIDENCE comes from this
  // script, so the script itself has to be exercised -- including its restore
  // path. An experiment that plants files in project-config and leaves them
  // behind on failure would put synthetic config into a commit.
  const probeDir = path.join(REPO_ROOT, 'project-config', 'p2k-discovery-probe');
  let out;
  let leftBehind;
  try {
    out = execFileSync(process.execPath,
      ['tools/verification/experiments/lint-discovery-depth.mjs'],
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } finally {
    // Observe, then clean unconditionally. A mutation that disables the
    // experiment's own restore() must be detectable WITHOUT leaving synthetic
    // config in project-config -- debris there would make every later mutant
    // in the battery fail for the wrong reason and be scored KILLED anyway.
    leftBehind = fs.existsSync(probeDir);
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
  assert.equal(leftBehind, false, 'experiment が probe を残した');

  const report = JSON.parse(out);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.experiment, 'lint-discovery-depth');

  // With recursive discovery in place the planted values must be seen, and a
  // planted HARD-rule value one directory down must turn the suite red. Both
  // were false before Wave 2; that is the whole finding.
  assert.equal(report.observed.discoveryReachedProbe, true,
    'nested probe が discovery に届いていない——QD-J23 の再発');
  assert.equal(report.observed.inventoryGrewBy, 3,
    'planted 値の数が合わない: ' + report.observed.inventoryGrewBy);
  assert.equal(report.withProbe.probeHardErrors, 1, 'hard 規則違反が報告されていない');
  assert.equal(report.withProbe.probeAdvisoryWarnings, 1, 'advisory が報告されていない');
  assert.equal(report.observed.shippedSuiteNoticed, true,
    '出荷 test が nested な公開不可値に気づかない');
});

test('P2K-L08: K2-03 の equivalence 主張には committed な生成器がある', () => {
  // The final independent review pointed out that the only EQUIVALENT claim in
  // the repository existed as prose in the Run Artifact with no generator, while
  // this repository's own rule says a load-bearing number needs one (§17). The
  // measurement is now regenerable, and this test keeps it that way.
  const out = execFileSync(process.execPath,
    ['tools/verification/experiments/dirent-symlink.mjs'],
    { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const report = JSON.parse(out);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.experiment, 'dirent-symlink');

  // The load-bearing property: every symlink is neither file nor directory, so
  // the two checks in discoverConfigModules already exclude them and the
  // explicit guard cannot change the outcome HERE.
  assert.equal(report.observed.symlinkCount >= 3, true,
    'symlink が 3 件未満——probe の木が壊れている');
  assert.equal(report.observed.everySymlinkIsNeitherFileNorDirectory, true,
    'symlink が file または directory として見えている——' +
    'K2-03 の equivalence 主張がこの環境では成立しない');
  assert.deepEqual(report.discovered, ['inner/deep.js', 'real.js'],
    'symlink を辿ったか、実ファイルを落とした: ' + JSON.stringify(report.discovered));

  // The scope must travel with the claim, not be inferred by the reader.
  assert.match(report.doesNotProve, /DT_UNKNOWN/,
    '限定（DT_UNKNOWN のファイルシステムは未検証）が報告に無い');
  assert.ok(report.platform.nodeVersion, 'platform が記録されていない');
});

