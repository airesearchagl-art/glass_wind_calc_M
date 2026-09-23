// Shared corpus for the public-safe guard differentials.
//
// Every figure the Run Artifact quotes about this guard is produced here, so a
// reader can recompute it. Five rounds of independent review found figures that
// reproduced under no corpus at all, because the corpus lived in a scratch
// directory and only the count was written down.
import { createRequire as __cr } from 'module';
const evidenceModule = __cr(import.meta.url)(
  new URL('../../project-config/evidence.js', import.meta.url).pathname);

export const STEMS = ['構造計算書', '図面', '見積書', 'plan'];
export const DECORATIONS = ['', '（最新）', '(1)', ' ', '「最新」', '＂', '，', '＿'];
// Every character in the implementation's dot set, plus the deliberate
// exclusions. Review 13 (F13-03) found this array sampled 6 of 12 members, so
// `diff-heads.mjs` reported 0 regressions for a commit that removed four of
// them — the corpus tracked the previous review's axis, not the current diff's.
// Derived from the implementation's own set plus the deliberate exclusions, so
// the corpus cannot drift from the constant it is meant to police. The previous
// version hand-listed 16 entries and got it wrong in both directions: U+0387 (a
// real member) was absent and U+00B7 (an exclusion) appeared twice, so
// diff-heads certified "0 regressions" for removing U+0387 (review 14, F14-04).
const EXCLUDED_DOTS = ['\u30fb', '\uff65', '\u00b7'];
export const DOTS = ['.', '\uff0e']
  .concat([...evidenceModule.DOT_EQUIVALENTS])
  .concat(EXCLUDED_DOTS);
export const TRAILING = ['', 'Ａ', '１', '９', 'A', '2'];

// Rule cores for the non-filename rules, so a differential covers all 12 rules
// rather than only the one under repair. Review 11 (F11-01) found a regression
// that a filename-only corpus could not see: the wide fold maps ＿ to a word
// character, which destroys the \b anchor in the `www` rule.
// Path segments are DERIVED over the character classes that distinguish a path
// from prose, not hand-picked. Every hand-written core in this file used to start
// each segment with a letter, so the \u00a5 axis below could never produce a digit
// after a separator — which is exactly the shape that regressed in round 10 and
// that this differential certified as `REGRESSIONS: 0` (F15-E3).
// Adding one digit example would repeat the mistake one axis later; the product is
// what keeps the class from going blind again.
export const PATH_SEGMENTS = [
  'Users', 'share', 'docs',        // letter-initial
  '2024', '01', '1458',            // digit-initial
  '2024年度', '3階', '1458号',      // digit-initial, CJK tail
  '案件', '図面', '共有',            // CJK
  '192.168.10.5', '10.0.0.1',      // dotted, digit-initial (IPv4 file servers)
  '2026-09-23', 'a1', '1a'         // mixed
];

const DRIVE_CORES = [];
const UNC_CORES = [];
const POSIX_CORES = [];
PATH_SEGMENTS.forEach((seg) => {
  PATH_SEGMENTS.forEach((tail) => {
    DRIVE_CORES.push('C:\\' + seg + '\\' + tail);
    UNC_CORES.push('\\\\' + seg + '\\' + tail);
  });
  DRIVE_CORES.push('C:\\' + seg);          // single-segment drive
  POSIX_CORES.push('/home/' + seg + '/x', '/Users/' + seg + '/x', '~/' + seg + '/x');
});

export const RULE_CORES = [
  'abc@example.com', 'https://drive.google.com/x', 'www.example.com',
  'notion.so/page',
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', '<img src=x onerror=alert(1)>', '<!--x-->'
].concat(DRIVE_CORES, UNC_CORES, POSIX_CORES);

export const PROSE = [
  'index.html の初期値', 'calc.js を参照', 'README.md に記載', 'data.json 形式',
  'window.document を触らない', 'Workspace.csvEscape を使う', 'e.target.value を読む',
  'PDF・doc形式で提出', '１．５倍で検討', 'W < H かつ P > Q', '5<Z<40 の範囲',
  'バージョン 1.1.0', 'Ver.1.1', 'No.21', 'Fig.3', 'p.21', '3.14159', 'ガラス厚 6.8mm',
  '一次資料で確認した。PDFは社内にある', '出力形式を選ぶ。PDFとDXFに対応する。',
  '等級はIII。V0は34m/s。', 'PDF、DWG、XLSX で提出', 'PDF形式で提出'
];

const fw = (s) => s.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));

export function expandExtensions(source) {
  const out = [];
  source.split('|').forEach((alt) => {
    let forms = ['']; let i = 0;
    while (i < alt.length) {
      let tok;
      if (alt.charAt(i) === '[') { const j = alt.indexOf(']', i); tok = alt.slice(i + 1, j).split(''); i = j + 1; }
      else { tok = [alt.charAt(i)]; i += 1; }
      const opt = alt.charAt(i) === '?'; if (opt) i += 1;
      const nx = []; forms.forEach((p) => { if (opt) nx.push(p); tok.forEach((c) => nx.push(p + c)); });
      forms = nx;
    }
    forms.forEach((f) => { if (out.indexOf(f) === -1) out.push(f); });
  });
  return out;
}

export function buildCorpus(extensionSource) {
  const exts = expandExtensions(extensionSource);
  const extForms = [];
  exts.forEach((e) => { [e, e.toUpperCase(), fw(e), fw(e.toUpperCase())].forEach((f) => extForms.push(f)); });
  const out = [];
  STEMS.forEach((st) => DECORATIONS.forEach((dc) => DOTS.forEach((d) =>
    extForms.forEach((ef) => TRAILING.forEach((tr) => out.push(st + dc + d + ef + tr))))));
  // Left context is its own axis. The first version of this file emitted each
  // core at string start, after a space, and after a fullwidth character — all
  // three of which are favourable to the `\b` and `(^|\s)` anchors the rules
  // used to carry. Independent review 12 (F12-01) found a live bypass there and
  // noted that this corpus reproduced the blind spot exactly.
  const LEFT_CONTEXTS = ['', ' ', '資料_', '検討2', 'a', 'Z', '_', '9',
    '図面は', '参考:', '（', '「', '資料＿', '一次資料-', '添付.', 'x/'];
  RULE_CORES.forEach((core) => {
    LEFT_CONTEXTS.forEach((pre) => { out.push(pre + core, pre + fw(core)); });
  });
  // Japanese-locale Windows path separator (F13-07).
  RULE_CORES.forEach((core) => {
    if (core.indexOf('\\') !== -1) out.push(core.replace(/\\/g, '\u00a5'), core.replace(/\\/g, '\uffe5'));
  });
  // Invisible format characters and compatibility lookalikes: normalization
  // kinds, not members (F12-06).
  const INVISIBLE = ['\u200b', '\u00ad', '\ufeff', '\u2060', '\u200c',
    '\ufe0f', '\u{e0041}', '\u{e0001}', '\ufff9', '\u0600'];
  RULE_CORES.forEach((core) => {
    INVISIBLE.forEach((ch) => {
      if (core.length > 4) out.push(core.slice(0, 3) + ch + core.slice(3));
    });
  });
  PROSE.forEach((t) => { out.push(t, fw(t)); });
  return out;
}
