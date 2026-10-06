'use strict';

/**
 * index.html の inline script を静的に走査する test のための共通 helper（Phase 2L-B2 S2-B / S2-C）。
 *
 * test 本体ではない（node --test の既定の探索 pattern に一致しない名前・場所に置く）。
 */

/** inline <script> の中身だけ（src 付き script は除く）。 */
function inlineScripts(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out.join('\n');
}

/**
 * コメントを除く（文字列・template literal・正規表現 literal の中身は残す）。禁止 token が
 * 文字列の中にあっても検出できるようにするため、文字列は消さない。template literal の
 * `${ ... }` の中は code として再帰的に読む（入れ子の template も追う）。
 */
function stripComments(code) {
  let i = 0;
  const n = code.length;
  const REGEX_PREV = /[(,=:[!&|?{};+\-*%<>~^]$/;
  function lastSignificant(out) {
    const t = out.replace(/\s+$/, '');
    return t.length ? t[t.length - 1] : '';
  }
  function copyQuoted(q) {
    let j = i + 1;
    while (j < n && code[j] !== q) { if (code[j] === '\\') j++; j++; }
    const s = code.slice(i, j + 1);
    i = j + 1;
    return s;
  }
  function copyRegex() {
    let j = i + 1;
    let inClass = false;
    while (j < n) {
      const c = code[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) break;
      else if (c === '\n') break;
      j++;
    }
    const s = code.slice(i, j + 1);
    i = j + 1;
    return s;
  }
  function scanTemplate() {
    let out = '`';
    i++;
    while (i < n) {
      const c = code[i];
      if (c === '\\') { out += code.slice(i, i + 2); i += 2; continue; }
      if (c === '`') { out += '`'; i++; return out; }
      if (c === '$' && code[i + 1] === '{') {
        out += '${';
        i += 2;
        out += scanCode(true);
        if (code[i] === '}') { out += '}'; i++; }
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }
  function scanCode(stopAtBrace) {
    let out = '';
    let depth = 0;
    while (i < n) {
      const c = code[i];
      const d = code[i + 1];
      if (stopAtBrace && c === '{') { depth++; out += c; i++; continue; }
      if (stopAtBrace && c === '}') { if (depth === 0) return out; depth--; out += c; i++; continue; }
      if (c === '/' && d === '*') { const e = code.indexOf('*/', i + 2); i = e === -1 ? n : e + 2; continue; }
      if (c === '/' && d === '/') { const e = code.indexOf('\n', i); i = e === -1 ? n : e; continue; }
      if (c === '\'' || c === '"') { out += copyQuoted(c); continue; }
      if (c === '`') { out += scanTemplate(); continue; }
      if (c === '/' && (REGEX_PREV.test(lastSignificant(out)) || lastSignificant(out) === '')) {
        out += copyRegex();
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }
  return scanCode(false);
}

module.exports = { inlineScripts, stripComments };
