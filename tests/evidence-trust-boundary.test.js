'use strict';

/**
 * Phase 2J Wave 1: Evidence trust boundary（inherited-field consumption）のテスト。
 *
 * ── 何を固定しているか ───────────────────────────────────────
 *
 * Phase 2F の Evidence contract は、契約値を素のproperty read
 * （`evidence.level` / `spec.factKey` / `caseObj.floor` …）で消費する。
 * 呼び出し側が custom prototype にそれらを載せて渡すと、
 *   - `Object.keys()` ベースのallowlistは**空虚に真**になり
 *   - `field in obj` の必須field検査も通り
 *   - 契約値そのものは prototype から読まれる
 * という形で、検査を通過したまま契約値を注入できた（Wave 1で実測・修正）。
 *
 * ── 名前について（重要）──────────────────────────────────────
 *
 * これは prototype pollution では**ない**。`Object.prototype` は一切
 * 変更されない（下でテストしている）。正しい名前は
 * **inherited-field consumption / custom-prototype contract-value injection**。
 * 名前を取り違えると対策が key sanitization へ逸れ、的を外す。
 *
 * ── fixtureはすべて合成である ────────────────────────────────
 *
 * ここに出てくる寸法・圧力・caseIdは説明用の合成値であり、
 * 案件の実測値でも Evidence でもない。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Evidence = require('../project-config/evidence.js');
const EvidenceLedger = require('../project-config/evidence-ledger.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');

const EVIDENCE_SRC = path.join(__dirname, '..', 'project-config', 'evidence.js');

/** 合成Evidence。実案件のEvidenceではない。 */
function synEvidence() {
  return {
    level: 'primary',
    checkedAt: '2026-09-20',
    publicDescription: '合成fixture（一次資料で直接確認したことにする）',
    privateReferenceAvailable: true
  };
}

/** 合成verified case。実案件のケースではない。 */
function synVerifiedCase() {
  return {
    caseId: 'SYNTB1',
    floor: '2',
    zone: 'general',
    widthMm: 1000,
    heightMm: 2000,
    glassType: '合成fixture',
    designPressure: 1000,
    evidence: {
      widthEvidence: synEvidence(),
      heightEvidence: synEvidence(),
      pressureEvidence: synEvidence()
    },
    publicEvidenceDescription: '合成fixture'
  };
}

/** 合成ledger entry spec。 */
function synSpec() {
  return {
    factKey: 'pane_width_mm',
    value: 1000,
    unit: 'mm',
    verificationStatus: 'verified',
    evidence: synEvidence()
  };
}

/**
 * 継承由来であることを理由に拒否されたことを確かめる。
 *
 * 「throwした」だけでは不十分である。別の理由（値が欠けている等）で
 * たまたま落ちているなら、このテストはガードを**何も固定していない**。
 * Phase 2G/2I で3度繰り返した教訓（positive control を先に取る）に従い、
 * 同じfixtureの素のobject版が**通る**ことを先に確認してから、
 * 継承版が構造を理由に落ちることを確認する。
 */
function assertRejectedForStructure(positiveControl, attack) {
  positiveControl(); // ここでthrowしたらfixtureが壊れている（テストが空虚になる）
  assert.throws(attack, (err) => {
    assert.match(err.message, /no inherited properties|own "__proto__"|plain object/);
    return true;
  });
}

// ============================================================
// §26: 各trust boundaryで custom prototype が拒否される
// ============================================================

test('P2J-TB01: createEntry(spec) は custom prototype の spec を拒否する', () => {
  assertRejectedForStructure(
    () => EvidenceLedger.createEntry(synSpec()),
    () => EvidenceLedger.createEntry(Object.create(synSpec()))
  );
});

test('P2J-TB02: createEntry は spec.evidence の custom prototype を拒否する', () => {
  // これが Wave 1 で最も見落としやすかった経路である。
  // createEntry は TOCTOU対策として spec.evidence.* を一度だけ読んで
  // 素のsnapshotへ写す。その結果 gate が見るのは**漂白済みの literal** になり、
  // gate側の構造ガードはここでは発火しない。
  // 呼び出し側objectを読む地点で閉じなければ塞がらない。
  assertRejectedForStructure(
    () => EvidenceLedger.createEntry(synSpec()),
    () => {
      const spec = synSpec();
      spec.evidence = Object.create(synEvidence());
      return EvidenceLedger.createEntry(spec);
    }
  );
});

test('P2J-TB03: assertPromotionGate は custom prototype の evidence を拒否する', () => {
  assertRejectedForStructure(
    () => Evidence.assertPromotionGate('verified', synEvidence(), 'tb03'),
    () => Evidence.assertPromotionGate('verified', Object.create(synEvidence()), 'tb03')
  );
});

test('P2J-TB04: assertPromotionGate は custom prototype の options を拒否する', () => {
  const noPrivateRef = Object.assign(synEvidence(), { privateReferenceAvailable: false });
  const ref = { kind: 'public_primary', url: 'https://www.example.jp/notice.html' };
  assertRejectedForStructure(
    () => Evidence.assertPromotionGate('verified', noPrivateRef, 'tb04', { sourceReference: ref }),
    () => Evidence.assertPromotionGate('verified', noPrivateRef, 'tb04', Object.create({ sourceReference: ref }))
  );
});

test('P2J-TB05: assertSourceReference / canonicalize は custom prototype を拒否する', () => {
  const ref = { kind: 'public_primary', url: 'https://www.example.jp/notice.html' };
  assertRejectedForStructure(
    () => Evidence.assertSourceReference(ref, 'tb05'),
    () => Evidence.assertSourceReference(Object.create(ref), 'tb05')
  );
  assertRejectedForStructure(
    () => Evidence.canonicalizeSourceReference(ref, 'tb05'),
    () => Evidence.canonicalizeSourceReference(Object.create(ref), 'tb05')
  );
});

test('P2J-TB06: validateVerifiedCase は custom prototype の caseObj を拒否する', () => {
  assertRejectedForStructure(
    () => MiyoshiProjectConfig.validateVerifiedCase(synVerifiedCase()),
    () => MiyoshiProjectConfig.validateVerifiedCase(Object.create(synVerifiedCase()))
  );
});

test('P2J-TB07: validateVerifiedCase は nested evidence の custom prototype を拒否する', () => {
  // top-levelを閉じてもnestedは閉じない。container と個々のEvidenceの両方。
  assertRejectedForStructure(
    () => MiyoshiProjectConfig.validateVerifiedCase(synVerifiedCase()),
    () => {
      const c = synVerifiedCase();
      c.evidence = Object.create({
        widthEvidence: synEvidence(), heightEvidence: synEvidence(), pressureEvidence: synEvidence()
      });
      return MiyoshiProjectConfig.validateVerifiedCase(c);
    }
  );
  assertRejectedForStructure(
    () => MiyoshiProjectConfig.validateVerifiedCase(synVerifiedCase()),
    () => {
      const c = synVerifiedCase();
      c.evidence.widthEvidence = Object.create(synEvidence());
      return MiyoshiProjectConfig.validateVerifiedCase(c);
    }
  );
});

test('P2J-TB08: validateVerifiedCase は必須fieldを own property として要求する', () => {
  // `field in caseObj` は prototype chain まで見るため必須field検査として弱い。
  // 構造ガードと own-property 要求の二重防御になっていることを固定する。
  const c = synVerifiedCase();
  delete c.zone;
  assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(c), /missing required field: zone/);
});

test('P2J-TB09: evaluateCasePromotion / reconcileFact も custom prototype を拒否する', () => {
  const ledger = EvidenceLedger.createLedger();
  assertRejectedForStructure(
    () => EvidenceLedger.evaluateCasePromotion(ledger, 'glass_pane', { claimsCalculationProvenance: true }),
    () => EvidenceLedger.evaluateCasePromotion(ledger, 'glass_pane', Object.create({ claimsCalculationProvenance: true }))
  );
  const entry = EvidenceLedger.createEntry(synSpec());
  assertRejectedForStructure(
    () => EvidenceLedger.reconcileFact(1000, entry, { tolerance: 0 }),
    () => EvidenceLedger.reconcileFact(1000, entry, Object.create({ tolerance: 0 }))
  );
  assertRejectedForStructure(
    () => EvidenceLedger.reconcileFact(1000, entry),
    () => EvidenceLedger.reconcileFact(1000, Object.create(entry))
  );
});

// ============================================================
// §24: 形の違いを別々に固定する
// ============================================================

test('P2J-TB10: own "__proto__" は運搬体として拒否される', () => {
  // `JSON.parse('{"__proto__":{...}}')` は prototype を**変えない**（own keyになる）。
  // したがって prototype 判定だけでは通ってしまう。
  const parsed = JSON.parse(
    '{"__proto__":{"privateReferenceAvailable":true},' +
    '"level":"primary","checkedAt":"2026-09-20",' +
    '"publicDescription":"合成fixture","privateReferenceAvailable":false}'
  );
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, '__proto__'), true,
    'fixture前提: JSON.parse は own "__proto__" を作る');
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype,
    'fixture前提: JSON.parse は prototype を差し替えない');

  // 危険なのは値ではなく、下流の [[Set]] copy で custom prototype として**再生する**こと。
  const laundered = Object.assign({}, parsed);
  assert.notEqual(Object.getPrototypeOf(laundered), Object.prototype,
    'own "__proto__" は Object.assign 経由で prototype へ戻る（これが塞ぐ理由）');

  assert.throws(() => Evidence.assertOrdinaryObject(parsed, 'evidence'), /own "__proto__"/);
  assert.throws(() => Evidence.assertPromotionGate('verified', parsed, 'tb10'), /own "__proto__"/);
});

test('P2J-TB11: object literal の __proto__ は Object.create と同じ形である', () => {
  const viaLiteral = { __proto__: synEvidence() };
  assert.equal(Object.prototype.hasOwnProperty.call(viaLiteral, '__proto__'), false,
    'literal の __proto__ は own key ではなく prototype 差し替えである');
  assert.equal(Object.getPrototypeOf(viaLiteral).level, 'primary');
  assert.throws(() => Evidence.assertPromotionGate('verified', viaLiteral, 'tb11'),
    /no inherited properties/);
});

test('P2J-TB12: class instance / Date / Map も拒否される', () => {
  function FakeEvidence() {}
  FakeEvidence.prototype = synEvidence();
  assert.throws(() => Evidence.assertPromotionGate('verified', new FakeEvidence(), 'tb12'),
    /no inherited properties/);
  assert.throws(() => Evidence.assertOrdinaryObject(Object.assign(new Date(), synEvidence()), 'x'),
    /no inherited properties/);
  assert.throws(() => Evidence.assertOrdinaryObject(new Map(), 'x'), /no inherited properties/);
  assert.throws(() => Evidence.assertOrdinaryObject([], 'x'), /must be a plain object/);
});

// ============================================================
// §23: null prototype は「意図した決定」であって偶然ではない
// ============================================================

test('P2J-TB13: null prototype は通す（明示的決定）', () => {
  // 継承元が無い＝継承値が入り得ないため、required fieldは必ず own property になる。
  const ev = Object.create(null);
  ev.level = 'primary';
  ev.checkedAt = '2026-09-20';
  ev.publicDescription = '合成fixture';
  ev.privateReferenceAvailable = true;
  assert.equal(Object.getPrototypeOf(ev), null);
  assert.equal(Evidence.assertPromotionGate('verified', ev, 'tb13'), true);

  // 必須fieldが own で無ければ（＝何も継承できないので）落ちる
  const empty = Object.create(null);
  assert.throws(() => Evidence.assertPromotionGate('verified', empty, 'tb13'), /evidence\.level/);
});

// ============================================================
// §20 / §27: 誤診しない・現状を動かさない
// ============================================================

test('P2J-TB14: Object.prototype は変更されていない（prototype pollution ではない）', () => {
  assert.deepEqual(Object.keys(Object.prototype), []);
  assert.equal({}.level, undefined);
  assert.equal({}.privateReferenceAvailable, undefined);
  assert.equal({}.factKey, undefined);
  assert.equal({}.claimsCalculationProvenance, undefined);
});

test('P2J-TB15: 素のobjectは従来どおり通る（ガードが過剰拒否していない）', () => {
  assert.equal(Evidence.assertPromotionGate('verified', synEvidence(), 'tb15'), true);
  assert.equal(EvidenceLedger.createEntry(synSpec()).factKey, 'pane_width_mm');
  assert.equal(MiyoshiProjectConfig.validateVerifiedCase(synVerifiedCase()), true);
  assert.equal(
    Evidence.assertSourceReference({ kind: 'public_primary', url: 'https://www.example.jp/a.html' }, 'tb15'),
    true
  );
});

test('P2J-TB16: Miyoshi config は読み込め、現状のfactは変わっていない', () => {
  // §27: Wave 1 は現状のprojectのfactを一切動かさない。
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultW.value, 1250);
  assert.equal(MiyoshiProjectConfig.dimensions.defaultW.verificationStatus, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultH.value, 2050);
  assert.equal(MiyoshiProjectConfig.dimensions.defaultH.verificationStatus, 'unverified');
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.value, 'III');
});

test('P2J-TB17: 構造ガードの判定は evidence.js の1か所だけにある', () => {
  // 「1か所で判定する」という設計をsourceレベルで固定する。
  // field ごとの継承チェックを増やすと、前段が生きている限り後段が発火せず、
  // どちらが効いているのか分からなくなる。
  const src = fs.readFileSync(EVIDENCE_SRC, 'utf8');
  assert.equal((src.match(/function assertOrdinaryObject\(/g) || []).length, 1);
  assert.equal(typeof Evidence.assertOrdinaryObject, 'function');

  // 下位moduleは自前で prototype 判定を持たず、canonical guardを呼ぶ
  for (const rel of ['evidence-ledger.js', 'miyoshi.js']) {
    const s = fs.readFileSync(path.join(__dirname, '..', 'project-config', rel), 'utf8');
    assert.equal((s.match(/function assertOrdinaryObject\(/g) || []).length, 0,
      rel + ' は独自の prototype ガードを定義しない');
    assert.equal(/assertOrdinaryObject\(/.test(s), true, rel + ' は canonical guard を呼ぶ');
  }
});

test('P2J-TB18: 必須field検査は Object.prototype 汚染下でも成立する', () => {
  // Wave 1のmutation testで、`hasOwnProperty` を `field in caseObj` へ戻す
  // mutantが**生存**した。構造ガードが先に custom prototype を弾くため、
  // 通常経路では両者に差が出ないからである。
  //
  // しかし差が消えるのは「Object.prototype が汚れていない」という前提の下だけで、
  // これは本moduleが保証している事実ではない（他のlibraryが汚しうる）。
  // つまりこれは到達不能なのではなく、到達可能だがテストが無かった。
  // D-011（到達不能なら削除、到達可能なら testで固定する）に従い固定する。
  const polluted = 'zone';
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, polluted), false,
    '前提: 開始時点で Object.prototype は汚れていない');
  Object.defineProperty(Object.prototype, polluted, {
    value: 'general', configurable: true, enumerable: false, writable: true
  });
  try {
    const c = synVerifiedCase();
    delete c.zone; // own propertyとしては欠けているが、`'zone' in c` は true になる
    assert.equal(polluted in c, true, '前提: 汚染により `in` は真を返す');
    assert.equal(Object.prototype.hasOwnProperty.call(c, polluted), false);
    assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(c),
      /missing required field: zone/,
      '汚染由来の継承値を必須fieldの充足として数えない');
  } finally {
    delete Object.prototype[polluted];
  }
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, polluted), false,
    '後始末: 汚染を残さない');
  assert.equal({}.zone, undefined);
});

/* ============================================================
   P2J-TB19 — 拡張子集合の単一化（独立検証6 F3）
============================================================ */

/**
 * `xls[xm]?` のような alternative を具体的な拡張子に展開する。
 * 具体列を手で書くと、まさにこの F3 と同じ「2 か所に同じ一覧」になる。
 */
function expandExtension(alt) {
  let out = [''];
  let i = 0;
  while (i < alt.length) {
    let token;
    if (alt.charAt(i) === '[') {
      const j = alt.indexOf(']', i);
      token = alt.slice(i + 1, j).split('');
      i = j + 1;
    } else {
      token = [alt.charAt(i)];
      i += 1;
    }
    const optional = alt.charAt(i) === '?';
    if (optional) i += 1;
    const next = [];
    out.forEach((prefix) => {
      if (optional) next.push(prefix);
      token.forEach((c) => next.push(prefix + c));
    });
    out = next;
  }
  return Array.from(new Set(out));
}

test('P2J-TB19: caseId の filename-like 判定は evidence.js の拡張子集合と一致する', () => {
  // 独立検証6 F3: evidence.js 側だけを日本の実務形式へ拡張した結果、
  // caseId 側だけが取り残され、`plan_dwg` は拒否 / `plan_jww` は受理 という
  // 、この修理が閉じたのとまったく同じ非対称が隣のモジュールで再現していた。
  // caseId は UI・export package・PR本文にそのまま出る公開 identifier である。
  const source = Evidence.PRIVATE_DOCUMENT_EXTENSION_SOURCE;
  assert.equal(typeof source, 'string');
  const exts = source.split('|').reduce((acc, alt) => acc.concat(expandExtension(alt)), []);
  assert.equal(exts.length > 40, true, '展開結果が少なすぎる: ' + exts.length);

  // 独立検証9 F9-05: この corpus は検査対象の定数から生えているので、
  // 定数を**縮める**変更には原理的に気づけない（corpus も一緒に縮む）。
  // 実際 `doc[xm]?→doc` / `tiff?→tif` / `ppt[xm]?→ppt` の変異が生き残っていた。
  // よって**定数とは独立に**含まれているべき具体形を直接列挙する。
  ['pdf', 'dwg', 'dxf', 'jww', 'jwc', 'xdw', 'sfc', 'p21', 'ifc', 'dwf', 'pln', 'rvt', 'skp',
   'xls', 'xlsx', 'xlsm', 'doc', 'docx', 'docm', 'ppt', 'pptx', 'pptm',
   'odt', 'ods', 'odp', 'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff',
   'heic', 'heif', 'webp', 'zip', 'rar', '7z', 'lzh', 'tar', 'gz',
   'msg', 'eml', 'txt', 'csv', 'bak'].forEach((ext) => {
    assert.equal(exts.indexOf(ext) !== -1, true, '拡張子集合から ' + ext + ' が消えている');
  });

  // positive control: 拡張子を持たない caseId は通る。
  // これが通らなければ下の assert.throws は何も証明していない。
  const control = synVerifiedCase();
  control.caseId = 'SYNTB19';
  assert.equal(MiyoshiProjectConfig.validateVerifiedCase(control), true);

  // 大文字・混合形も見る。独立検証7 F7-02: 旧テストは小文字のみだったため、
  // 規則から `i` フラグを外す変異が 629/0 で生き残っていた。
  // 図面番号は慣習的に大文字なので、`PLAN_PDF` の方が現実にはありうる。
  exts.forEach((ext) => {
    [ext, ext.toUpperCase(), ext.charAt(0).toUpperCase() + ext.slice(1)].forEach((form) => {
      const c = synVerifiedCase();
      c.caseId = 'SYN_' + form;
      assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(c),
        /caseId/, 'filename-like caseId が通った: ' + c.caseId);
    });
  });

  // 区切り文字クラス `[._-]` の 3 つとも押さえる（独立検証8 F8-03）。
  // 旧テストは `_` だけだったため `[._-]→[._]` の変異が生き残り、
  // `A102-dwg`（図面番号の現実的な形）が通っていた。
  // caseId に `.` は CASE_ID_PATTERN が先に禁じるので到達しないが、
  // `-` は到達する。
  ['SYN-pdf', 'A102-dwg', 'A-102-jww', 'SYN-xdw'].forEach((id) => {
    const c = synVerifiedCase();
    c.caseId = id;
    assert.throws(() => MiyoshiProjectConfig.validateVerifiedCase(c),
      /caseId/, 'filename-like caseId が通った: ' + id);
  });

  // `$` アンカーを固定する。末尾でない `_pdf` はファイル名らしくないので通る。
  // これが無いとアンカーを外す変異（= 過剰拒否）を検知できない。
  ['SYN_pdf_x', 'SYN_dwg_rev2', 'PDF_SYN'].forEach((id) => {
    const c = synVerifiedCase();
    c.caseId = id;
    assert.equal(MiyoshiProjectConfig.validateVerifiedCase(c), true, id);
  });

  // 同じ一覧を 2 か所で持たないこと自体を固定する。
  const miyoshiSrc = fs.readFileSync(
    path.join(__dirname, '..', 'project-config', 'miyoshi.js'), 'utf8');
  assert.match(miyoshiSrc, /PRIVATE_DOCUMENT_EXTENSION_SOURCE/,
    'miyoshi.js は拡張子集合を evidence.js から読むこと');
  assert.doesNotMatch(miyoshiSrc, /\/\[\._-\]\(pdf\|dwg/,
    'miyoshi.js に拡張子一覧を再度ハードコードしている');
});

test('P2J-TB20: 拡張子集合が届かなければ module load で落ちる（fail closed）', () => {
  // 独立検証8 F8-06。この型検査は load-bearing だが未テストだった。
  // 無いと `/[._-](undefined)$/i` という**有効だが何も防がない**規則になり、
  // `plan_pdf` が通る。「コメントにしか存在しない guard」は本Campaignの反復する教訓。
  const path = require.resolve('../project-config/miyoshi.js');
  const realEvidence = require('../project-config/evidence.js');
  const stub = {};
  Object.keys(realEvidence).forEach((k) => { stub[k] = realEvidence[k]; });
  delete stub.PRIVATE_DOCUMENT_EXTENSION_SOURCE;

  const savedGlobal = globalThis.ProjectEvidence;
  const savedModule = require.cache[path];
  try {
    globalThis.ProjectEvidence = stub;
    delete require.cache[path];
    assert.throws(() => require('../project-config/miyoshi.js'),
      /PRIVATE_DOCUMENT_EXTENSION_SOURCE/,
      '拡張子集合が無いまま module が読み込めてしまった');

    // positive control: 完全な contract なら読み込めること。
    globalThis.ProjectEvidence = realEvidence;
    delete require.cache[path];
    assert.equal(typeof require('../project-config/miyoshi.js').validateVerifiedCase, 'function');
  } finally {
    if (savedGlobal === undefined) delete globalThis.ProjectEvidence;
    else globalThis.ProjectEvidence = savedGlobal;
    delete require.cache[path];
    if (savedModule) require.cache[path] = savedModule;
  }
});

