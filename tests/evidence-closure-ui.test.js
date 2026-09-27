'use strict';

/**
 * Phase 2J Wave 4: Evidence Request Matrix UI の contract テスト。
 *
 * 見るのは index.html の**実行コード**であり、コメント文ではない
 * （自分の説明文に当たるgrepは、書いた本人以外には意味が無い）。
 *
 * ここで固定したいのは1点に尽きる:
 * **この画面から verified にできる経路が存在しないこと**、そして
 * closure状態をUIが独自に数え直していないこと。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/** コメントを落とし、実行コードだけを残す。 */
function scriptCode() {
  const m = HTML.match(/<script>([\s\S]*)<\/script>/);
  assert.notEqual(m, null, 'inline script が取れること');
  return m[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .map((line) => line.replace(/\s\/\/.*$/, ''))
    .join('\n');
}

function bodyOf(code, name) {
  const start = code.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, name + ' が存在すること');
  const end = code.indexOf('\n}', start);
  return code.slice(start, end === -1 ? undefined : end);
}

/** 文字列リテラルを落とす（表示文言に含まれる数字を数え直し判定に混ぜない）。 */
function withoutStringLiterals(code) {
  return code.replace(/'(\\.|[^'\\])*'/g, "''").replace(/"(\\.|[^"\\])*"/g, '""');
}

const CODE = scriptCode();
const MATRIX = bodyOf(CODE, 'renderEvidenceClosureMatrix');

// ============================================================
// 読み込み順と配置
// ============================================================

test('P2J-U01: evidence-closure.js を registry.js より後に読み込む', () => {
  assert.match(HTML, /<script src="project-config\/evidence-closure\.js"><\/script>/);
  const closure = HTML.indexOf('project-config/evidence-closure.js');
  ['project-config/evidence.js', 'project-config/evidence-ledger.js',
    'project-config/miyoshi.js', 'project-config/registry.js'].forEach((dep) => {
    const at = HTML.indexOf(dep);
    assert.notEqual(at, -1, dep + ' が読み込まれている');
    assert.equal(closure > at, true, 'evidence-closure.js は ' + dep + ' より後');
  });
});

/**
 * `<div>` の入れ子を数えて、開始タグに対応する終了タグの位置を返す。
 *
 * 「次の別ブロックより前にあるか」だけを見る素朴な判定では**足りない**。
 * 要素がブロックの外へ出ても、次のブロックより前でありさえすれば通ってしまう。
 * （Wave 4 の mutation U4-13 が実際にそれをすり抜けた。）
 * 実際に閉じた位置を求めて、包含を判定する。
 */
function blockEndIndex(html, startAt) {
  let depth = 0;
  const re = /<div\b|<\/div>/g;
  re.lastIndex = startAt;
  let m;
  while ((m = re.exec(html)) !== null) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return m.index;
  }
  throw new Error('unbalanced <div> from index ' + startAt);
}

test('P2J-U02: Matrix は案件preset modeの Evidence ブロック内にある', () => {
  assert.match(HTML, /id="evidence-closure-area"/);

  // evidence-status-table を含む mode-field-miyoshi ブロックの開始位置
  const statusAt = HTML.indexOf('id="evidence-status-table"');
  assert.notEqual(statusAt, -1);
  const blockStart = HTML.lastIndexOf('<div', HTML.lastIndexOf('mode-field-miyoshi', statusAt));
  assert.match(HTML.slice(blockStart, statusAt), /mode-field-miyoshi/);

  const blockEnd = blockEndIndex(HTML, blockStart);
  const closureAt = HTML.indexOf('id="evidence-closure-area"');
  const reconAt = HTML.indexOf('id="reconciliation-area"');

  // positive control: 既存の reconciliation は確かにこのブロック内にある
  assert.equal(reconAt > blockStart && reconAt < blockEnd, true,
    '前提: reconciliation はこのブロック内にある（判定が機能している）');
  assert.equal(closureAt > blockStart && closureAt < blockEnd, true,
    'Matrix は同じ mode-field-miyoshi ブロックの**内側**にある');
  assert.equal(closureAt > reconAt, true, 'reconciliation の後に置く');

  // Batch / Review / Profile / Scenario 側には置かない
  ['batch', 'review', 'profile', 'scenario'].forEach((other) => {
    assert.equal(new RegExp('id="' + other + '[^"]*"[\\s\\S]{0,200}evidence-closure-area').test(HTML),
      false, other + ' 側には置かない');
  });
});

// ============================================================
// 状態の出どころ（UIで数え直さない）
// ============================================================

test('P2J-U03: closure状態は evaluateClosure() からのみ得る', () => {
  assert.match(MATRIX, /EvidenceClosure\.evaluateClosure\(/);
  // 実案件のObservationは0件。UIに投入経路は無い。
  assert.match(MATRIX, /evaluateClosure\([^)]*,\s*\[\]\s*\)/);
});

test('P2J-U04: UI は closure判定を自前で再構成しない', () => {
  // core の判定APIをUIから直接呼ばない（判定は1か所）
  ['assertPromotionGate', 'reconcileFact', 'evaluateCasePromotion', 'createEntry']
    .forEach((fn) => {
      assert.equal(MATRIX.includes(fn), false, 'renderer が ' + fn + ' を直接呼ばない');
    });
  // 現在のconfigを読んでclosure状態を組み立てない
  ['config.dimensions', 'config.wind', 'verifiedCases',
    'MiyoshiProjectConfig.dimensions', 'MiyoshiProjectConfig.wind']
    .forEach((expr) => {
      assert.equal(MATRIX.includes(expr), false, 'renderer が ' + expr + ' を読まない');
    });
});

test('P2J-U05: 他機能の入力を Evidence として読まない', () => {
  // Scenario Matrix に Z を入れても evaluation_height Evidence にはならない。
  // Single/Batch に W/H を入れても pane 寸法は閉じない。
  ['activeProfile', 'scenarioMatrix', 'batchWorkspace', 'activeReview',
    'batchInvalidDiagnostics', 'inp-w', 'inp-h', 'inp-z']
    .forEach((src) => {
      assert.equal(MATRIX.includes(src), false, 'renderer が ' + src + ' を参照しない');
    });
});

test('P2J-U06: 件数は評価結果から取り、UIに正の数値を持たない', () => {
  const bare = withoutStringLiterals(MATRIX);
  [12, 8].forEach((n) => {
    assert.equal(new RegExp('\\b' + n + '\\b').test(bare), false,
      'slot/case 件数 ' + n + ' をUIに固定しない');
  });
  ['requiredSlotCount', 'readySlotCount', 'categoryCount', 'readyCategoryCount',
    'caseScopeCount', 'readyCaseScopeCount'].forEach((k) => {
    assert.match(MATRIX, new RegExp('evaluation\\.' + k));
  });
  // floor / zone 語彙もUIに持たない（scopeは評価結果から表示する）
  ['general', 'corner'].forEach((v) => {
    assert.equal(new RegExp("['\"]" + v + "['\"]").test(MATRIX), false,
      v + ' をUIの正として持たない');
  });
});

test('P2J-U07: カテゴリ数と確認項目数を混同しない表示になっている', () => {
  // 「未解決12件」と出さない。カテゴリ数も評価結果から取る。
  assert.match(MATRIX, /未解決カテゴリ/);
  assert.match(MATRIX, /必要な確認項目/);
  const bare = withoutStringLiterals(MATRIX);
  assert.equal(/未解決\s*12/.test(MATRIX), false);
  assert.equal(/\b4\b/.test(bare.replace(/var --?[a-z0-9]+/g, '')), false,
    'カテゴリ数4をUIに固定しない');
});

// ============================================================
// 入力経路が存在しないこと
// ============================================================

test('P2J-U08: Observation入力・昇格操作のUIが存在しない', () => {
  // Evidence を作れる/昇格できる入力要素を置かない
  ['observation', 'checkedAt', 'privateReferenceAvailable', 'sourceReference',
    'evidenceLevel', 'promote', 'applyCandidate']
    .forEach((token) => {
      assert.equal(new RegExp('id="[^"]*' + token + '[^"]*"', 'i').test(HTML), false,
        token + ' の入力要素を置かない');
    });
  // Matrix領域にフォーム要素を作らない
  ['createElement(\'input\')', 'createElement(\'textarea\')', 'createElement(\'select\')',
    'createElement(\'button\')', 'createElement(\'form\')']
    .forEach((call) => {
      assert.equal(MATRIX.includes(call), false, 'renderer が ' + call + ' をしない');
    });
  // Candidate の export 操作をProduction UIに出さない
  assert.equal(CODE.includes('serializePromotionCandidate'), false,
    'candidate export を Production UI に出さない');
});

test('P2J-U09: 外部JSONが trust になる経路を足していない', () => {
  assert.equal(MATRIX.includes('JSON.parse'), false, 'renderer に JSON.parse を置かない');
  assert.equal(MATRIX.includes('normalizeObservation'), false,
    'UIからObservationを作らない');
  assert.equal(MATRIX.includes('normalizeObservationSet'), false);
});

test('P2J-U10: 永続化・ネットワークを増やしていない', () => {
  ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket',
    'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']
    .forEach((api) => {
      assert.equal(MATRIX.includes(api), false, 'renderer が ' + api + ' を使わない');
    });
});

// ============================================================
// DOM安全性と fail-closed
// ============================================================

test('P2J-U11: model由来の値は textContent で描画する', () => {
  assert.equal(MATRIX.includes('innerHTML'), false, 'renderer は innerHTML を使わない');
  assert.equal(MATRIX.includes('insertAdjacentHTML'), false);
  assert.match(MATRIX, /textContent/);
  assert.match(bodyOf(CODE, 'closureCell'), /td\.textContent\s*=/);
  assert.equal(bodyOf(CODE, 'closureCell').includes('innerHTML'), false);
});

test('P2J-U12: 表示できないときは黙って消さない', () => {
  assert.match(MATRIX, /catch/);
  assert.match(MATRIX, /検証済み.{0,20}解釈/, '「表示が無い＝検証済み」と読ませない警告を出す');
  assert.match(MATRIX, /warn\.textContent\s*=/, '例外メッセージをHTMLとして解釈させない');
  // 失敗時に「0 blockers」「問題なし」のような安全側の誤読を作らない
  assert.equal(/blockers?\s*:\s*0/.test(MATRIX), false);
});

test('P2J-U13: Phase 2F パネルと Closure Matrix は別々にguardされる', () => {
  // 片方の失敗でもう片方が消えると、消えたこと自体が「問題なし」と読まれる
  const outer = bodyOf(CODE, 'renderProjectEvidencePanels');
  assert.match(outer, /renderPhase2FEvidencePanels\(\)/);
  assert.match(outer, /renderEvidenceClosureMatrix\(\)/);
  assert.equal(outer.includes('try'), false, '外側で一括catchしない');
  // それぞれが自前のguardを持つ
  assert.match(bodyOf(CODE, 'renderPhase2FEvidencePanels'), /try\s*\{/);
  assert.match(MATRIX, /try\s*\{/);
});

// ============================================================
// 文言（current truth と読ませない）
// ============================================================

test('P2J-U14: closure状態を「検証済み」系の語で表示しない', () => {
  const labels = CODE.slice(CODE.indexOf('var CLOSURE_STATUS_LABELS'),
    CODE.indexOf('function closureScopeLabel'));
  ['Verified', '検証済み', '承認済み', '確定', 'VERIFIED', 'PROMOTED', 'APPROVED']
    .forEach((word) => {
      assert.equal(labels.includes(word), false, 'closure状態のラベルに ' + word + ' を使わない');
    });
  assert.match(labels, /READY_CANDIDATE/);
  assert.match(labels, /昇格候補条件を満たす/);
});

test('P2J-U15: 現在値の列が Evidence と混同されない名前になっている', () => {
  assert.match(MATRIX, /現在のpreset主張/);
  ['検証値', 'Evidence値', '確定値'].forEach((w) => {
    assert.equal(MATRIX.includes(w), false, '現在値の列に ' + w + ' を使わない');
  });
  // Observationが無いことを 0 や現在値で埋めない
  assert.match(MATRIX, /未提出/);
  assert.match(MATRIX, /observationPresent\s*\?/);
});

test('P2J-U16: 突き合わせ不能を「一致」と書かない', () => {
  // evaluation_height は reconciliationApplicable=false
  assert.match(MATRIX, /reconciliationApplicable === false/);
  assert.match(MATRIX, /比較対象なし/);
  assert.match(MATRIX, /現在の正なし/);
  // applicable=false の分岐が MATCH より先に効くこと
  const applicableAt = MATRIX.indexOf('reconciliationApplicable === false');
  const labelAt = MATRIX.indexOf('CLOSURE_RECONCILIATION_LABELS[fact.reconciliationStatus]');
  assert.equal(applicableAt !== -1 && applicableAt < labelAt, true,
    '突き合わせ不能の判定を先に行う');
});

test('P2J-U17: 静的な解釈注意が runtime値に置き換えられていない', () => {
  ['この画面からverifiedへ変更することはできません',
    '一致しても、それだけではverifiedになりません',
    'Promotion Gate の通過が必要',
    'current truthではありません'].forEach((line) => {
    assert.equal(MATRIX.includes(line), true, '固定注意文: ' + line);
  });
});

test('P2J-U18: 何を集めればよいかが項目ごとに示される（§43）', () => {
  const req = CODE.slice(CODE.indexOf('var CLOSURE_REQUEST_TEXT'),
    CODE.indexOf('var CLOSURE_CATEGORY_LABELS'));
  ['pane_width_mm', 'pane_height_mm', 'positive_pressure', 'negative_pressure',
    'evaluation_height'].forEach((k) => assert.match(req, new RegExp(k + ':')));
  assert.match(req, /一次資料/);
  assert.match(MATRIX, /CLOSURE_REQUEST_TEXT\[fact\.factKey\]/);
  // private な出典名・ファイル名を書かない
  ['.pdf', '.xls', '.dwg', 'drive.google', 'notion.', 'sharepoint']
    .forEach((w) => assert.equal(req.includes(w), false, req + ' に ' + w + ' を書かない'));
});

test('P2J-U19: session固有の可用性判定を製品状態として焼き込まない', () => {
  // UNAVAILABLE は開発セッションでの調査結果であって、
  // ブラウザが知り得る製品事実ではない（Run Artifact 側に残す）。
  assert.equal(MATRIX.includes('UNAVAILABLE'), false);
  assert.equal(MATRIX.includes('一次資料は利用できません'), false);
  // runtime の真実（提出されたObservation数）を出す
  assert.match(MATRIX, /observationPresent/);
  assert.match(MATRIX, /提出済みEvidence Observation/);
});
