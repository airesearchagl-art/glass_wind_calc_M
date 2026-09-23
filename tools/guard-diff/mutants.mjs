// Mutation operators for the public-safe guard, kept in the repo so a claimed
// mutation score can be re-derived by anyone.
//
// Independent review 16 (F16-07) could not reproduce the round-11 claim of
// "R15-01..R15-14, 14/14 KILLED": the artifact named the IDs, but the operators
// lived only in a throwaway script. A score whose operators are not written
// down is not a measurement.
//
// Anchors that need a literal backslash-u escape are BUILT FROM CHAR CODES.
// Writing them as escapes let a tool fold them into the real character, after
// which the operator reported PATCH-MISS -- which is the benign failure. The
// dangerous one is an anchor that stops matching for an unrelated reason and
// is then counted as KILLED. mutate.mjs treats any anchor count != 1 as a
// first-class failure for exactly that reason.
//
// Usage: node tools/guard-diff/mutate.mjs

const BS = String.fromCharCode(92);
const U = (hex) => BS + 'u' + hex;
const YEN = '[' + U('00a5') + U('ffe5') + ']';
const B2 = BS + BS;
const B3 = BS + BS + BS;
const SEP = '[' + B3 + '/]';          // [\\\/]  a separator class
const NOTSEP = '[^' + B3 + '/' + BS + 's]'; // [^\\\/\s]
const fold = (cls, extra) => 'text.replace(/' + cls + (extra || '') + "/g, '" + BS + BS + "')";

export const MUTANTS = [
  { id: 'M-01', describes: 'drive separator: forward slash dropped',
    find: 'pattern: /[A-Za-z]:' + SEP + '/',
    replace: 'pattern: /[A-Za-z]:[' + B2 + ']/' },
  { id: 'M-02', describes: 'drive letter: boundary re-added (the F16-01 hole)',
    find: 'pattern: /[A-Za-z]:' + SEP + '/',
    replace: 'pattern: /(^|[^A-Za-z0-9])[A-Za-z]:' + SEP + '/' },
  { id: 'M-03', describes: 'drive: currency carve-out re-introduced',
    find: 'pattern: /[A-Za-z]:' + SEP + '/',
    replace: 'pattern: /[A-Za-z]:' + SEP + '(?!(?:0|[1-9]' + BS + 'd{0,2})(?:,' + BS + 'd{3})*(?![' + BS + 'd' + BS + 'w.]))/' },
  { id: 'M-04', describes: 'UNC: separators forced to match again (F16-05)',
    find: 'pattern: /' + SEP + '{2}' + NOTSEP + '+' + SEP + NOTSEP + '*/',
    replace: 'pattern: /' + B2 + B2 + '[^' + B2 + BS + 's]+' + B2 + '[^' + B2 + BS + 's]*/' },
  { id: 'M-05', describes: 'UNC: tail made mandatory (the C23 hole)',
    find: SEP + NOTSEP + '*/ },',
    replace: SEP + NOTSEP + '/ },' },
  { id: 'M-06', describes: 'unix path: case flag removed',
    find: BS + '/mnt' + BS + '/)/i',
    replace: BS + '/mnt' + BS + '/)/' },
  { id: 'M-07', describes: 'email: local part back to ASCII-only',
    find: '[^' + BS + 's@<>()' + BS + '[' + BS + ']"]{1,64}@',
    replace: '[A-Za-z0-9._%+-]{1,64}@' },
  { id: 'M-08', describes: 'email: domain bound lowered so real addresses escape (F16-02)',
    find: '.-]{0,253}',
    replace: '.-]{0,12}' },
  { id: 'M-09', describes: 'email: IPv6 literal tag dropped (F16-06)',
    find: BS + '[(?:[Ii][Pp][Vv]6:)?[0-9A-Fa-f:.]{2,45}' + BS + ']',
    replace: BS + '[[0-9A-Fa-f:.]{2,45}' + BS + ']' },
  { id: 'M-10', describes: 'email: quoted local part branch disabled',
    find: '|"[^"]{0,64}"@',
    replace: '|"(?!)"@' },
  { id: 'M-11', describes: 'markup: back to DOCTYPE only',
    find: '<!--|<!' + BS + '[CDATA' + BS + '[|<![A-Za-z]|<' + BS + '?[A-Za-z=]|' + BS + ']' + BS + ']>',
    replace: '<!--|<!' + BS + '[CDATA' + BS + '[|<!DOCTYPE|<' + BS + '?[A-Za-z]' },
  { id: 'M-12', describes: 'exported rule table: deepFreeze downgraded',
    find: 'PUBLIC_UNSAFE_TEXT_PATTERNS: deepFreeze',
    replace: 'PUBLIC_UNSAFE_TEXT_PATTERNS: Object.freeze' },
  { id: 'M-13', describes: 'checkedAt contract left unfrozen',
    find: 'CHECKED_AT_PATTERN: deepFreeze(CHECKED_AT_PATTERN)',
    replace: 'CHECKED_AT_PATTERN: CHECKED_AT_PATTERN' },
  { id: 'M-14', describes: 'yen fold: round-10 currency exception restored',
    find: fold(YEN),
    replace: fold(YEN, '(?!' + BS + 'd)') },
  { id: 'M-15', describes: 'yen fold: fullwidth yen dropped',
    find: fold(YEN),
    replace: fold('[' + U('00a5') + ']') },
  { id: 'M-16', describes: 'closure convergence guard lowered to 4',
    find: 'guard > 16',
    replace: 'guard > 4' },
  { id: 'M-17', describes: 'invisible class: Default_Ignorable dropped',
    find: BS + 'p{Cf}' + BS + 'p{Default_Ignorable_Code_Point}',
    replace: BS + 'p{Cf}' },
  { id: 'M-18', describes: 'control characters: U+2028/2029 dropped',
    find: U('007F') + '-' + U('009F') + U('2028') + U('2029') + ']',
    replace: U('007F') + '-' + U('009F') + ']' }
];
