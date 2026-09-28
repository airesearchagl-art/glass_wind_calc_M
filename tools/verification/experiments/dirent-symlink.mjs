#!/usr/bin/env node
// Regenerate the measurement behind the only EQUIVALENT claim in this tree.
//
//   node tools/verification/experiments/dirent-symlink.mjs
//
// K2-03 removes the explicit symlink guard from discoverConfigModules. The
// mutation harness reports that operator as NON-KILLED and does not assert
// equivalence -- equivalence comes from this measurement instead.
//
// The final independent review noted that this argument existed only as prose
// in the Run Artifact, with no committed generator, while the repository's own
// §17 rule says a load-bearing number needs one. It does now.
//
// What this measures, on the filesystem and Node version it runs on:
//   1. how readdirSync(withFileTypes) classifies a file symlink, a directory
//      symlink and a cyclic directory symlink
//   2. what discoverConfigModules() returns for such a tree
//
// The load-bearing property is (1): if every symlink reports isDirectory() AND
// isFile() as false, then the two checks in discoverConfigModules already
// exclude symlinks and the explicit guard cannot change the result. That is why
// removing it is equivalent HERE -- and why the claim is scoped to here.
// A filesystem reporting DT_UNKNOWN is NOT tested by this script.

import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverConfigModules } from '../../evidence-publication-lint.mjs';

const root = mkdtempSync(join(tmpdir(), 'p2k-dirent-'));
let report;
try {
  writeFileSync(join(root, 'real.js'), 'module.exports = {};\n', 'utf8');
  mkdirSync(join(root, 'inner'));
  writeFileSync(join(root, 'inner', 'deep.js'), 'module.exports = {};\n', 'utf8');

  let symlinksSupported = true;
  try {
    symlinkSync(join(root, 'real.js'), join(root, 'linked.js'), 'file');
    symlinkSync(join(root, 'inner'), join(root, 'dirlink'), 'dir');
    // Points at its own ancestor: following it loops forever.
    symlinkSync(root, join(root, 'inner', 'loop'), 'dir');
  } catch (e) {
    symlinksSupported = false;
  }
  if (!symlinksSupported) {
    throw new Error('this filesystem does not support symlinks, so the measurement ' +
      'cannot be made here; refusing to report an equivalence claim');
  }

  const entries = [];
  for (const dir of [root, join(root, 'inner')]) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      entries.push({
        name: (dir === root ? '' : 'inner/') + e.name,
        isSymbolicLink: e.isSymbolicLink(),
        isDirectory: e.isDirectory(),
        isFile: e.isFile()
      });
    }
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));

  const symlinks = entries.filter((e) => e.isSymbolicLink);
  const anySymlinkLooksTraversable = symlinks.some((e) => e.isDirectory || e.isFile);
  if (symlinks.length < 3) {
    throw new Error('expected 3 symlinks in the probe tree, saw ' + symlinks.length);
  }

  report = {
    schemaVersion: 1,
    experiment: 'dirent-symlink',
    question: 'does readdirSync(withFileTypes) already exclude symlinks without an explicit guard?',
    platform: { nodeVersion: process.version, platform: process.platform },
    entries,
    discovered: discoverConfigModules(root),
    observed: {
      symlinkCount: symlinks.length,
      everySymlinkIsNeitherFileNorDirectory: !anySymlinkLooksTraversable,
      // This is the sentence the equivalence rests on.
      conclusion: anySymlinkLooksTraversable
        ? 'NOT equivalent here: a symlink reports as a file or a directory, so the ' +
          'explicit guard does change the result'
        : 'equivalent here: isDirectory() and isFile() are both false for every ' +
          'symlink, so the two checks already exclude them'
    },
    doesNotProve: 'anything about a filesystem that reports DT_UNKNOWN, or about a ' +
      'Node version whose Dirent semantics differ. The claim is scoped to the ' +
      'platform printed above.'
  };
} finally {
  rmSync(root, { recursive: true, force: true });
}

process.stdout.write(JSON.stringify(report, null, 2) + '\n');
