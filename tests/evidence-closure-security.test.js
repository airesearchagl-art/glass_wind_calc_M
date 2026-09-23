'use strict';

/**
 * Phase 2J Wave 5: security / privacy / trust spoof / prototype 閉じ込め。
 *
 * ── 何を重点にしたか ─────────────────────────────────────────
 *
 * 既存の攻撃を機械的に全部並べ直さない。Phase 2J で**新しくできた4つの境界**
 * だけを狙う:
 *
 *   A. 生のObservation → canonical Evidence Observation
 *   B. Observation集合 → Closure Evaluation / 一時Ledger
 *   C. Closure Evaluation → Promotion Candidate → Candidate JSON
 *   D. Closure model → Evidence Request Matrix DOM（UI側テストに分離）
 *
 * Wave 3 で既に固定済みのもの（値一致でも不十分なら BLOCKED / MISMATCH /
 * evaluation_height の非突き合わせ / scope取り違え）はここで複製しない。
 *
 * ── fixtureはすべて合成である ────────────────────────────────
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Evidence = require('../project-config/evidence.js');
const Closure = require('../project-config/evidence-closure.js');
const ProjectInput = require('../project-config/project-input.js');
const WorkspaceCore = require('../workspace.js');
const ProjectProfile = require('../project-profile.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');

const CLOSURE_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'project-config', 'evidence-closure.js'), 'utf8');

const SYN_PROJECT = 'synthetic_closure_test';
const P = 'N/m²';

function syntheticPreset() {
  return {
    projectId: SYN_PROJECT, hasFixedPreset: true,
    getPublicLabel: function () { return 'synthetic closure test fixture'; },
    dimensions: { mode: 'synthetic_fixture',
      defaultW: { value: 777, unit: 'mm' }, defaultH: { value: 1888, unit: 'mm' } },
    wind: {
      positivePressureByFloor: { A: { value: 3111, unit: P }, B: { value: 3222, unit: P } },
      negativePressureByZone: { inner: { value: 4111, unit: P }, outer: { value: 4222, unit: P } }
    }
  };
}

function withSyntheticRegistry(fn) {
  const preset = syntheticPreset();
  const registry = {
    getPreset: function (id) {
      if (id !== preset.projectId) {
        throw new Error('getPreset(): unknown projectId: ' + JSON.stringify(id));
      }
      return preset;
    },
    hasPreset: function (id) { return id === preset.projectId; },
    listPresets: function () { return []; }
  };
  const p = require.resolve('../project-config/evidence-closure.js');
  const savedCache = require.cache[p];
  const savedRegistry = globalThis.PresetRegistry;
  const savedClosure = globalThis.EvidenceClosure;
  delete require.cache[p];
  globalThis.PresetRegistry = registry;
  try {
    return fn(require(p), preset);
  } finally {
    delete require.cache[p];
    if (savedCache) { require.cache[p] = savedCache; }
    globalThis.PresetRegistry = savedRegistry;
    globalThis.EvidenceClosure = savedClosure;
  }
}

function ev(overrides) {
  return Object.assign({
    level: 'primary', checkedAt: '2026-09-20',
    publicDescription: '合成テストfixture（査読済み案件Evidenceではない）',
    privateReferenceAvailable: true
  }, overrides || {});
}

function obsOf(factKey, scope, observedValue, unit, overrides) {
  return Object.assign({
    schemaVersion: 1, observationType: 'evidence_closure_observation',
    factKey: factKey, scope: scope, observedValue: observedValue, unit: unit,
    evidence: ev(), sourceReference: null
  }, overrides || {});
}

/** 合成presetの全slotを満たす観測集合。 */
function fullSet(overrides) {
  const set = [
    obsOf('pane_width_mm', null, 777, 'mm'),
    obsOf('pane_height_mm', null, 1888, 'mm'),
    obsOf('positive_pressure', { floor: 'A' }, 3111, P),
    obsOf('positive_pressure', { floor: 'B' }, 3222, P),
    obsOf('negative_pressure', { zone: 'inner' }, 4111, P),
    obsOf('negative_pressure', { zone: 'outer' }, 4222, P),
    obsOf('evaluation_height', { floor: 'A' }, 12.345, 'm'),
    obsOf('evaluation_height', { floor: 'B' }, 18.75, 'm')
  ];
  if (overrides) overrides(set);
  return set;
}

// ============================================================
// §3〜§9 public-safe prose boundary（Wave 5で実測して塞いだ4クラス）
// ============================================================

test('P2J-S01: email / 私的文書ファイル名 / タグ / 制御文字を拒否する', () => {
  // 4クラスとも Wave 5 の probe で実際に通り抜け、合成READY contextでは
  // Candidate JSON まで到達した。canonical な関門で塞ぐ（§5）。
  const attacks = [
    ['email-like', 'PRIVATEEMAILMARKER991@example.com で確認'],
    ['pdf filename', 'PRIVATEFILEMARKER992.pdf により確認'],
    ['dwg filename', 'PRIVATEFILEMARKER992b.dwg により確認'],
    ['xlsx filename', 'PRIVATEFILEMARKER992c.xlsx により確認'],
    ['html tag', '<b>PRIVATEHTMLMARKER993</b> により確認'],
    ['script tag', '<script>PRIVATEHTMLMARKER993b</script> により確認'],
    ['control char', 'CONTROL\u0001MARKER994 により確認'],
    ['NUL', 'CONTROL\u0000MARKER994b により確認'],
    ['DEL', 'CONTROL\u007fMARKER994c により確認']
  ];
  attacks.forEach(([label, text]) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, label),
      /must not contain private URLs\/paths\/identifiers/, label + ' must be rejected');
    assert.throws(() => Evidence.makeEvidence('primary', '2026-09-20', text, true),
      /must not contain/, label + ' must be rejected by makeEvidence');
  });
});

test('P2J-S02: 正当な技術散文を巻き込まない（過剰拒否していない）', () => {
  // positive control を兼ねる: これらが通らなければ上のテストは
  // 「何でも拒否する検証器」を確かめているだけになる。
  const valid = [
    '評価高さは 5<Z<40 の範囲で確認した',
    'index.html の初期値として導入された値',
    '一次資料で直接確認（合成fixture）',
    'W と H は別物であり、H > W の場合もある',
    '改行を含む説明\n2行目',
    'タブを含む説明\t続き'
  ];
  valid.forEach((text) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(text, 'valid'), true, text);
  });
});

test('P2J-S03: 現行の案件Evidenceは強化後の検証器を通る（書き換えていない）', () => {
  // validator hardening であって Evidence mutation ではない。
  const seen = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (typeof o.publicDescription === 'string') seen.push(o.publicDescription);
    Object.keys(o).forEach((k) => { try { walk(o[k]); } catch (e) { /* getter */ } });
  })(MiyoshiProjectConfig);
  assert.equal(seen.length > 0, true, '前提: 現行configにpublicDescriptionがある');
  seen.forEach((d) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(d, 'current'), true, d.slice(0, 40));
  });
  // 値そのものは不変
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.value, 'III');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultW.evidence.level, 'none');
  assert.equal(MiyoshiProjectConfig.dimensions.defaultH.evidence.checkedAt, '2026-09-17');
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
});

// ============================================================
// §11 / §26 Candidate の private reference sweep
// ============================================================

test('P2J-S04: private Evidence は boolean だけが残り、所在は一切出ない', () => {
  withSyntheticRegistry((C) => {
    const r = C.evaluateClosure(SYN_PROJECT, fullSet());
    assert.notEqual(r.promotionCandidate, null, '前提: READYでcandidateが出ている');
    const json = C.serializePromotionCandidate(r.promotionCandidate);
    const parsed = JSON.parse(json);

    parsed.proposedFacts.forEach((f) => {
      assert.deepEqual(Object.keys(f.evidence).sort(),
        ['checkedAt', 'level', 'privateReferenceAvailable', 'publicDescription']);
      assert.equal(f.evidence.privateReferenceAvailable, true);
      assert.equal(f.sourceReference, null, 'private Evidenceの所在は保持しない');
    });
    // 評価結果側（candidate以前）にも出ない
    const evalJson = JSON.stringify(r);
    ['url', 'href', 'filename', 'fileName', 'filePath', 'documentId', 'fileId']
      .forEach((k) => {
        assert.equal(evalJson.includes('"' + k + '"'), false, k + ' を評価結果に持たない');
      });
  });
});

test('P2J-S05: 公開一次資料の正しい経路は通り、正規形だけが残る', () => {
  // 拒否側だけを見ると「常に拒否する実装」でもテストが通ってしまう。
  withSyntheticRegistry((C) => {
    const url = 'https://www.mlit.go.jp/notice/example.html';
    const r = C.evaluateClosure(SYN_PROJECT, fullSet((set) => {
      set[0].evidence = ev({ privateReferenceAvailable: false });
      set[0].sourceReference = { kind: 'public_primary', url: url };
    }));
    assert.notEqual(r.promotionCandidate, null);
    const parsed = JSON.parse(C.serializePromotionCandidate(r.promotionCandidate));
    const f = parsed.proposedFacts.filter((x) => x.slotKey === 'pane_width_mm')[0];
    assert.deepEqual(f.sourceReference, { kind: 'public_primary', url: url });
    assert.equal(f.evidence.privateReferenceAvailable, false);

    // **構造がpublic-safeであること ≠ 人が一次資料だと確認したこと。**
    // このテストが証明しているのは前者だけである。
    assert.equal(f.proposedVerificationStatus, 'verified',
      'gateを通った提案であることを示すだけで、原典性の証明ではない');
  });
});

test('P2J-S06: private provider / 私設network / 資格情報URLは既存contractで落ちる', () => {
  // URLパーサをClosure側に複製していないことの確認も兼ねる。
  const bad = [
    'https://drive.google.com/file/d/x/view',
    'https://www.notion.so/page',
    'https://example.sharepoint.com/doc',
    'https://www.dropbox.com/s/x/doc',
    'https://onedrive.live.com/x',
    'https://localhost/doc.html',
    'https://127.0.0.1/doc.html',
    'https://192.168.1.5/doc.html',
    'https://100.64.0.1/doc.html',
    'https://[::1]/doc.html',
    'https://intranet.local/doc.html',
    'https://10.0.0.1.nip.io/doc.html',
    'https://user:pass@www.example.jp/doc.html',
    'https://www.example.jp/doc?access_token=abcdefghijklmnopqrstuvwxyz01',
    'https://www.example.jp/doc?%74oken=abcdefghijklmnopqrstuvwxyz01'
  ];
  withSyntheticRegistry((C) => {
    bad.forEach((url) => {
      assert.throws(() => C.evaluateClosure(SYN_PROJECT, fullSet((set) => {
        set[0].sourceReference = { kind: 'public_primary', url: url };
      })), (e) => e instanceof Error, 'must reject: ' + url);
    });
  });
  assert.equal(/new URL\(/.test(CLOSURE_SRC), false, 'URL解析をClosureに複製しない');
});

// ============================================================
// §14 trust spoof（Wave 2の一覧に candidate側のfieldを追加）
// ============================================================

test('P2J-S07: Observation は candidate側のtrust fieldも名乗れない', () => {
  const spoofs = ['candidateStatus', 'notApplied', 'currentConfigMutated', 'gateSummary',
    'proposedFacts', 'closureStatus', 'evidenceGateStatus', 'reconciliationStatus',
    'blockerKinds', 'readinessStatus'];
  spoofs.forEach((key) => {
    const attack = obsOf('pane_width_mm', null, 987, 'mm');
    attack[key] = true;
    assert.throws(() => Closure.normalizeObservation(attack, 'miyoshi'),
      new RegExp('unexpected field: "' + key + '"'), key);
  });
});

// ============================================================
// §18 他機能の入力が Evidence にならない（core側のsource contract）
// ============================================================

test('P2J-S08: closure core は他機能の状態を一切読まない', () => {
  ['scenario', 'Scenario', 'activeProfile', 'batchWorkspace', 'ReviewPackage',
    'WorkspaceCore', 'ProjectProfile', 'buildingHeight', 'eavesHeight', 'windTrace']
    .forEach((token) => {
      assert.equal(CLOSURE_SRC.includes(token), false,
        'closure core が ' + token + ' を参照しない');
    });
  // 依存は3つだけ
  assert.match(CLOSURE_SRC, /resolveDependency\(\s*\n?\s*'ProjectEvidence'/);
  assert.match(CLOSURE_SRC, /resolveDependency\(\s*\n?\s*'EvidenceLedger'/);
  assert.match(CLOSURE_SRC, /resolveDependency\(\s*\n?\s*'PresetRegistry'/);
});

// ============================================================
// §20 / §21 prototype boundary と laundering
// ============================================================

test('P2J-S09: Phase 2J の全入口で custom prototype / own __proto__ を拒否する', () => {
  const ordinary = obsOf('pane_width_mm', null, 987, 'mm');
  // positive control: 素のobjectは通る
  assert.equal(Closure.normalizeObservation(ordinary, 'miyoshi').factKey, 'pane_width_mm');

  const cases = [
    ['observation (custom proto)', () => Closure.normalizeObservation(
      Object.create(obsOf('pane_width_mm', null, 987, 'mm')), 'miyoshi')],
    ['observation (literal __proto__)', () => Closure.normalizeObservation(
      { __proto__: obsOf('pane_width_mm', null, 987, 'mm') }, 'miyoshi')],
    ['scope (custom proto)', () => Closure.normalizeObservation(
      obsOf('positive_pressure', Object.create({ floor: '1' }), 987, P), 'miyoshi')],
    ['evidence (custom proto)', () => Closure.normalizeObservation(
      obsOf('pane_width_mm', null, 987, 'mm', { evidence: Object.create(ev()) }), 'miyoshi')],
    ['sourceReference (custom proto)', () => Closure.normalizeObservation(
      obsOf('pane_width_mm', null, 987, 'mm', {
        sourceReference: Object.create({ kind: 'public_primary', url: 'https://www.example.jp/a' })
      }), 'miyoshi')],
    ['observation set (custom proto items)', () => Closure.normalizeObservationSet(
      [Object.create(obsOf('pane_width_mm', null, 987, 'mm'))], 'miyoshi')],
    ['class instance', () => {
      function Fake() {} Fake.prototype = obsOf('pane_width_mm', null, 987, 'mm');
      return Closure.normalizeObservation(new Fake(), 'miyoshi');
    }]
  ];
  cases.forEach(([label, fn]) => {
    assert.throws(fn, /no inherited properties|own "__proto__"/, label);
  });

  // §20: Object.prototype は一切変更されていない（＝prototype pollutionではない）
  assert.deepEqual(Object.keys(Object.prototype), []);
  assert.equal({}.factKey, undefined);
  assert.equal({}.proposedVerificationStatus, undefined);
});

test('P2J-S10: laundering は両方向とも入口で止まる', () => {
  // A: custom prototype → field単位のsnapshotで素のliteralへ漂白される経路。
  //    snapshotを取る**前**に落ちなければならない。
  const A = obsOf('pane_width_mm', null, 987, 'mm', { evidence: Object.create(ev()) });
  assert.throws(() => Closure.normalizeObservation(A, 'miyoshi'), /no inherited properties/);

  // B: own "__proto__" → 下流の [[Set]] copy で custom prototype として再生する経路。
  //    値自体は無害でも、運搬体として入口で落とす。
  const rawB = JSON.parse('{"__proto__":{"privateReferenceAvailable":true},' +
    '"level":"primary","checkedAt":"2026-09-20","publicDescription":"合成fixture",' +
    '"privateReferenceAvailable":false}');
  assert.equal(Object.prototype.hasOwnProperty.call(rawB, '__proto__'), true, '前提: own key');
  assert.equal(Object.getPrototypeOf(rawB), Object.prototype, '前提: prototypeは未変更');
  assert.notEqual(Object.getPrototypeOf(Object.assign({}, rawB)), Object.prototype,
    '前提: copyでprototypeが差し替わる（これが塞ぐ理由）');
  assert.throws(
    () => Closure.normalizeObservation(obsOf('pane_width_mm', null, 987, 'mm', { evidence: rawB }),
      'miyoshi'),
    /own "__proto__"/);
});

// ============================================================
// §22 Candidate authenticity
// ============================================================

test('P2J-S11: exporter は builder が作った candidate 以外を全て拒否する', () => {
  withSyntheticRegistry((C) => {
    const r = C.evaluateClosure(SYN_PROJECT, fullSet());
    const real = r.promotionCandidate;
    // positive control: 本物は通る
    assert.equal(typeof C.serializePromotionCandidate(real), 'string');

    const forgeries = {
      'handwritten lookalike': {
        schemaVersion: 1, candidateType: 'project_evidence_promotion_candidate',
        projectId: SYN_PROJECT, candidateStatus: 'READY_CANDIDATE', proposedFacts: [],
        gateSummary: {}, notApplied: true, currentConfigMutated: false, warning: 'x'
      },
      'Object.assign clone': Object.assign({}, real),
      'structuredClone equivalent': JSON.parse(JSON.stringify(real)),
      'JSON.parse(serialized)': JSON.parse(C.serializePromotionCandidate(real)),
      'custom prototype wrapper': Object.create(real)
    };
    Object.keys(forgeries).forEach((label) => {
      assert.throws(() => C.serializePromotionCandidate(forgeries[label]),
        /requires a candidate created by evaluateClosure/, label);
    });
  });
});

// ============================================================
// §23 Candidate one-way boundary（実行コードを見る）
// ============================================================

test('P2J-S12: Phase 2J の実行コードに import / apply 経路が存在しない', () => {
  const forbidden = ['deserializePromotionCandidate', 'parsePromotionCandidate',
    'importPromotionCandidate', 'applyPromotionCandidate', 'promoteConfig',
    'setVerified', 'updateVerifiedCases', 'candidateToPreset', 'candidateToConfig',
    'candidateToWorkspace'];
  // 実行コードのみを見る（コメント・テストでの言及は許される）
  const executable = CLOSURE_SRC
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  forbidden.forEach((name) => {
    assert.equal(executable.includes(name), false, name + ' は実行コードに存在しない');
    assert.equal(typeof Closure[name], 'undefined', name + ' は export されない');
  });
  assert.equal(/JSON\.parse/.test(executable), false, 'candidate JSON を読み戻さない');
});

// ============================================================
// §24 Candidate JSON を既存importerへ通す
// ============================================================

test('P2J-S13: Candidate JSON は既存のimport経路で trust にならない', () => {
  const json = withSyntheticRegistry((C) => {
    const r = C.evaluateClosure(SYN_PROJECT, fullSet());
    return C.serializePromotionCandidate(r.promotionCandidate);
  });

  const importers = [
    ['ProjectInput.deserialize', () => ProjectInput.deserialize(json)],
    ['WorkspaceCore.deserializeWorkspace', () => WorkspaceCore.deserializeWorkspace(json)],
    ['ProjectProfile.deserializeProfile', () => ProjectProfile.deserializeProfile(json)]
  ];
  importers.forEach(([label, fn]) => {
    let result = null, threw = false;
    try { result = fn(); } catch (e) { threw = true; }
    if (!threw) {
      // 受理された場合でも、既存のdowngrade契約により trust は上がらない
      const s = JSON.stringify(result);
      assert.equal(/"verificationStatus"\s*:\s*"verified"/.test(s), false,
        label + ': verified にならない');
      assert.equal(/"sourceKind"\s*:\s*"registered_preset"/.test(s), false,
        label + ': registered preset にならない');
    }
    // どちらでもよい（拒否 or 非trust）。trust になることだけが許されない。
    assert.equal(true, true, label + ': ' + (threw ? 'rejected' : 'accepted as untrusted'));
  });

  // 現案件の状態は何も変わらない
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
});

// ============================================================
// §25 / §26 Candidate export inventory
// ============================================================

test('P2J-S14: Candidate JSON の top-level key は許可集合に一致する', () => {
  withSyntheticRegistry((C) => {
    const r = C.evaluateClosure(SYN_PROJECT, fullSet());
    const json = C.serializePromotionCandidate(r.promotionCandidate);
    const parsed = JSON.parse(json);
    assert.deepEqual(Object.keys(parsed).sort(), [
      'candidateStatus', 'candidateType', 'currentConfigMutated', 'gateSummary',
      'notApplied', 'projectId', 'proposedFacts', 'schemaVersion', 'warning'
    ]);
    ['currentConfig', 'verifiedCases', 'privateReference', 'rawObservation',
      'registry', 'preset', 'profile', 'workspace', 'review', 'dimensions', 'wind',
      'generatedAt', 'timestamp']
      .forEach((k) => {
        assert.equal(json.includes('"' + k + '"'), false, k + ' を出力しない');
      });

    parsed.proposedFacts.forEach((f) => {
      assert.deepEqual(Object.keys(f).sort(), [
        'evidence', 'factKey', 'observedValue', 'proposedVerificationStatus',
        'reconciliationApplicable', 'reconciliationStatus', 'scope', 'slotKey',
        'sourceReference', 'unit'
      ]);
      if (f.scope !== null) {
        assert.equal(Object.keys(f.scope).length, 1, 'scopeは1 fieldのみ');
      }
    });
  });
});

test('P2J-S15: 呼び出し側の余計なfieldはcandidateへ運ばれない', () => {
  // Observation段階で弾かれるので、そもそもcandidateまで到達しない。
  withSyntheticRegistry((C) => {
    assert.throws(() => C.evaluateClosure(SYN_PROJECT, fullSet((set) => {
      set[0].internalNote = 'PRIVATENOTEMARKER997';
    })), /unexpected field: "internalNote"/);
    // 正常系にmarkerが無いこと（上の拒否が効いている裏取り）
    const r = C.evaluateClosure(SYN_PROJECT, fullSet());
    assert.equal(C.serializePromotionCandidate(r.promotionCandidate)
      .includes('PRIVATENOTEMARKER997'), false);
  });
});

// ============================================================
// §28 現案件の empty-set Hard Gate
// ============================================================

test('P2J-S16: 実案件の空集合closureは BLOCKED のまま動かない', () => {
  const r = Closure.evaluateClosure('miyoshi', []);
  assert.equal(r.status, 'BLOCKED');
  assert.equal(r.readySlotCount, 0);
  assert.equal(r.requiredSlotCount, 12);
  assert.equal(r.readyCategoryCount, 0);
  assert.equal(r.categoryCount, 4);
  assert.equal(r.readyCaseScopeCount, 0);
  assert.equal(r.caseScopeCount, 8);
  assert.equal(r.promotionCandidate, null);
  assert.deepEqual(MiyoshiProjectConfig.verifiedCases, []);
  // candidate が無いので serialize もできない（空candidateを作らない）
  assert.throws(() => Closure.serializePromotionCandidate(r.promotionCandidate),
    /requires a candidate created by evaluateClosure/);
});

// ============================================================
// Wave 6: 独立検証の指摘 A1 に対する回帰
// ============================================================

test('P2J-S17: 比較の散文は「空白を置く」書き方で通る（誤検知の受け入れ方）', () => {
  // ここは3度間違えた箇所である。経緯:
  //   (1) 一律拒否 → `W<H かつ P>Q である。` を巻き込む（A1指摘）
  //   (2) 属性の形だけ拒否 → 崩れたタグが素通り（F1指摘）
  //   (3) 本体に日本語が無い場合だけ拒否 → 1文字混ぜると全タグ素通り（実測114/114）
  //
  // `A<B C>D`（散文）と `<td nowrap>`（タグ）は文字構成が同一であり、
  // `<…>` の中だけを見る規則では**原理的に分離できない**。
  // そこで誤検知(fail closed)を選び、素通りを無くした。
  // 誤検知は書き方で回避できる。ここではその回避方法が
  // 実際に機能することを固定する（「書けなくなる」のではない）。
  const spacedFormsAccepted = [
    'W < H かつ P > Q',
    '5 < Z < 40',
    'P < Q かつ R > S のとき',
    '評価高さは 5 < Z < 40 の範囲で確認した',
    '条件 W < H and P > Q を確認した'
  ];
  spacedFormsAccepted.forEach((s) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(s, 'prose'), true, s);
  });

  // `>` で閉じない形、および `<` の直後が非英字の形は、空白無しでも通る
  const alsoAccepted = [
    '5<Z<40', 'A<B<C<D', 'x>y', '1<2',
    '見付幅W<見付高さH となる場合>注意',
    'index.html の初期値として導入された値',
    'A --> B の順で確認した', 'P -> Q と表記する'
  ];
  alsoAccepted.forEach((s) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(s, 'prose'), true, s);
  });

  // 受け入れたコスト: 空白の無い比較は拒否される。隠さず固定する。
  assert.throws(() => Evidence.assertPublicSafeEvidenceText('W<H かつ P>Q である。', 'prose'),
    /matched known-unsafe pattern: html-like-tag/,
    '空白無しの比較は拒否される（既知・文書化済みのコスト）');
});

/**
 * 網羅corpus は**実装からではなくHTML側の語彙から**組み立てる。
 *
 * 独立検証4 Finding 4 の指摘: 旧corpus（未commit・508形）は正規表現と
 * 同じ思考から作られていたため 508/508 「拒否」と報告しながら、
 * 独立に組んだcorpusでは 710/710 が素通りしていた。
 * corpus が実装の盲点を相続していた。
 *
 * そこで (a) corpus を commit して反証可能にし、
 * (b) 本体形に「`<` を含む形」を必ず入れる。
 *
 * 独立検証5 Finding 6 の指摘: その (b) のうち「`[\s/]` で始まらない形」は
 * **書いただけで実装されていなかった**（24形中 0 形）。
 * そして 5 度目の欠陥（tag name 継続文字）はまさにその軸にあった。
 * 同時に「本体長」の軸が corpus に存在せず、6 度目の欠陥（`{0,300}`）も
 * 検出できなかった。よって軸を 3 つにし、いずれも
 * **実装ではなく HTML5 仕様の語彙から**導出する:
 *   軸1 本体形（TAG_BODY_FORMS）
 *   軸2 名前継続文字（TAG_NAME_CONTINUATIONS）← Finding 2 の軸
 *   軸3 本体長（LONG_BODY_LENGTHS）← Finding 1 の軸
 *
 * さらに「拒否しすぎない」側（P2J-S27）も固定する。
 * 片側だけ固定すると「`<` を含むなら全拒否」への行き過ぎを
 * 検出できず、不等式の日本語散文が書けなくなる。
 */
const HTML_TAG_NAMES = (
  'a abbr address area article aside audio b base bdi bdo blockquote body br ' +
  'button canvas caption cite code col colgroup data datalist dd del details ' +
  'dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 ' +
  'h3 h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label ' +
  'legend li link main map mark menu meta meter nav noscript object ol optgroup ' +
  'option output p param picture pre progress q rp rt ruby s samp script section ' +
  'select slot small source span strong style sub summary sup table tbody td ' +
  'template textarea tfoot th thead time title tr track u ul var video wbr ' +
  'marquee applet frame frameset basefont big blink center font strike tt ' +
  'acronym dir isindex keygen listing plaintext spacer xmp noframes nobr'
).split(' ');

/** 本体形。`<` を含む形と `[\s/]` で始まらない形を必ず含める。 */
const TAG_BODY_FORMS = [
  '',                               // 裸タグ
  ' src=x onerror=alert(1)',        // 通常の属性
  ' onerror=alert(1<2)',            // ← 本体に `<`（Finding 1 の本体）
  ' onerror="a<b"',                 // ← 引用値の中に `<`
  ' x="<"',                         // ← 属性値が `<` のみ
  ' a<b<c',                         // ← `<` 複数
  ' onload=alert(1<2) あ',          // `<` + CJK（過去2欠陥の合わせ技）
  ' alt="図面" onerror=1',          // 属性値にCJK（自然な日本語HTML）
  ' src=x onerror=alert(1) Ａ',     // 全角Latin
  ' src=x onerror=alert(1)\u3000',  // 全角スペース
  ' src=x onerror=alert`1`',        // バッククォート値
  ' "q"', ' =v', ' 1=2', ' -x=1', ' .x=1', " x=a'b", ' x=a"b',
  ' disabled', ' 日本語',
  '/', '/onload=1',                 // `/` 区切り
  ' \n href=x', ' \t id=y', '  ',   // 空白類
  ' \r href=x'                      // CR（HTMLの入力前処理で LF になる）
];

/**
 * HTML5 の tag name state を**終わらせる**文字はこの 5 つだけ
 * （tab / LF / FF / space / `/`）。`>` はタグ自体を閉じる。
 * つまり**それ以外のすべての文字は名前の一部**であり、
 * `<img:` は「壊れた img」ではなく `img:` という名の要素になる。
 * 実装の文字クラスを見ず、この**定義の裏側**から作る。
 */
const TAG_NAME_TERMINATORS = ['\t', '\n', '\f', ' ', '/'];

const TAG_NAME_CONTINUATIONS = [
  ':', '_', '.', '!', '=', '+', '$', '%', '&', '*', ',', ';', '?', '@',
  '^', '`', '|', '~', '(', ')', '[', ']', '{', '}', "'", '"', '\\', '#',
  '0', '9', '-',
  '\u200b',   // ZWSP（人間には見えない）
  '\u00a0',   // NBSP（space ではない）
  '\u3000',   // 全角スペース
  '\u0130',   // 非ASCII英字
  'あ', 'Ａ'    // CJK / 全角Latin
];

/** 名前継続文字は `[\s/]` で始まらない——header の約束の実装。 */
const NAME_CONTINUATION_FORMS = [];
TAG_NAME_CONTINUATIONS.forEach((ch) => {
  NAME_CONTINUATION_FORMS.push(ch);
  NAME_CONTINUATION_FORMS.push(ch + ' onclick=alert(1)');
});

/**
 * 本体長の軸。実装内のどんな定数よりも十分長い値を含める。
 * 埋め文字に長い英数字連続を使わない（opaque-long-token が
 * 先にマッチしてしまい、何を試したのかがぶれる）。
 */
const LONG_BODY_LENGTHS = [32, 128, 299, 300, 301, 512, 2048, 8192];

test('P2J-S18: タグ形は本体の書式・言語・`<`の有無によらず拒否される', () => {
  // 4回の独立検証で見つかった回帰をまとめて固定する:
  //   F1   崩れた属性（バッククォート値・数字始まりの属性名 等）
  //   3rd  本体に日本語/全角を1文字 → 素通り（114/114）
  //   4th  本体に `<` を1つ → 素通り（710/710）
  //        `<img onerror=alert(1)>` は拒否、`<img onerror=alert(1<2)>` は素通り、
  //        という逆転が**元の規則から**存在していた
  let checked = 0;
  HTML_TAG_NAMES.forEach((tag) => {
    TAG_BODY_FORMS.forEach((body) => {
      [`<${tag}${body}>`, `</${tag}${body}>`].forEach((s) => {
        checked++;
        assert.throws(() => Evidence.assertPublicSafeEvidenceText(s, 'prose'),
          /matched known-unsafe pattern: html-like-tag/, s);
      });
    });
  });
  // 実数で固定する。以前は `>= 3000` と書き、artifact には
  // 別の概算値（3458）を書いていたが、どちらも実数ではなかった
  // （独立検証5 Finding 6）。検証できない数字は書かない。
  assert.equal(checked, HTML_TAG_NAMES.length * TAG_BODY_FORMS.length * 2);
});

test('P2J-S23: 本体に `<` を入れてもタグ判定は回避できない', () => {
  // 4度目の欠陥の核心を単体で読めるよう独立させる。
  // 「拒否される形」と「1文字だけ違う形」を並べて固定する。
  const pairs = [
    ['<img src=x onerror=alert(1)>', '<img onerror=alert(1<2)>'],
    ['<img src=x onerror="alert(1)">', '<img src=x onerror="alert(1);a<b">'],
    ['<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1) alt="<">'],
    ['<svg onload=alert(1)>', '<svg onload=alert(1<2)>']
  ];
  pairs.forEach(([control, bypass]) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(control, 'prose'),
      /html-like-tag/, 'control: ' + control);
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(bypass, 'prose'),
      /html-like-tag/, 'bypass: ' + bypass);
  });
});

test('P2J-S24: 私的文書のファイル名判定は幹がASCIIであることを前提にしない', () => {
  // 独立検証4 Finding 2。本案件のEvidence散文は日本語であり、
  // 私的文書の名前も日本語である。旧実装は幹を `[A-Za-z0-9_-]+` に限っており、
  // **現実にありそうな日本語ファイル名だけが素通り**していた
  // （`plan.pdf` は落ちるのに `構造計算書.pdf` は通る）。
  // publicDescription は公開repositoryにもCandidate JSONにも出る。
  const STEMS = ['構造計算書', '図面', '意匠図一式', '伏図', '詳細図', '計算書',
    '案件資料', '外装材検討', '施工図', '仕様書', '見積書', '議事録',
    '検討書', '平面図', '立面図'];
  // 独立検証5 Finding 3: 旧 EXTS は**実装の一覧を写しただけ**だったので、
  // 実装が欧米ソフトの形式しか知らないことを検出できなかった。
  // ここでは実装を見ず、**日本の外装・ガラス案件が実際に生む形式**から列挙する:
  //   JW_CAD(.jww/.jwc) / DocuWorks(.xdw) / SXF(.sfc/.p21) / IFC / DWF /
  //   ArchiCAD(.pln) / Revit / SketchUp / Office / LibreOffice /
  //   現地写真(iPhone は .heic) / メール控え(.msg/.eml) /
  //   納品一式の圧縮(.zip/.rar/.7z/.lzh)
  // 実装がこのうち 1 つでも落とせなければこのテストが失敗する。
  const EXTS = ['pdf', 'dwg', 'dxf', 'xls', 'xlsx', 'xlsm', 'doc', 'docx', 'docm',
    'ppt', 'pptx', 'pptm', 'jpg', 'jpeg', 'png', 'zip', 'rvt', 'skp',
    'jww', 'jwc', 'xdw', 'sfc', 'p21', 'ifc', 'dwf', 'pln',
    'odt', 'ods', 'odp', 'gif', 'bmp', 'tif', 'tiff', 'heic', 'heif', 'webp',
    'rar', '7z', 'lzh', 'tar', 'gz', 'msg', 'eml', 'txt', 'csv', 'bak'];
  let checked = 0;
  STEMS.forEach((stem) => {
    EXTS.forEach((ext) => {
      checked++;
      const text = '社内の ' + stem + '.' + ext + ' により確認';
      assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
        /matched known-unsafe pattern: private-document-filename/, text);
    });
  });
  assert.equal(checked, STEMS.length * EXTS.length);

  // ASCII の幹も引き続き落ちる（片方だけ直していないこと）
  ['plan.pdf', 'plan_A.pdf', 'A-102.dwg'].forEach((s) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(s, 'prose'),
      /private-document-filename/, s);
  });
  // 全角句読点・括弧を含む幹（独立検証6 F1）。
  // 全角対応の最初の実装は U+FF01..U+FF5E を一括で畳んでおり、
  // `（ ） ＂ ＇ ， ；` が幹の区切り文字に化けて**拒否が壊れていた**。
  // 全角括弧は日本語ファイル名で最もよく使われる装飾であり、
  // 旧 corpus は 15 幹のすべてが装飾無しだったため 1 件も検出できなかった。
  const DECORATED_STEMS = ['構造計算書（最新）', '図面（改訂版）', '見積書（税込）',
    '意匠図（A棟）', '計算書（第2版）', '仕様書（案）', '伏図（確定）',
    '見積書＂', '図面，', '資料；', '図面＇', '計算書＜旧＞'];
  let decorated = 0;
  DECORATED_STEMS.forEach((stem) => {
    ['pdf', 'xlsx', 'dwg', 'png'].forEach((ext) => {
      decorated++;
      const text = '社内の ' + stem + '.' + ext + ' による';
      assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
        /private-document-filename/, text);
    });
  });
  assert.equal(decorated, DECORATED_STEMS.length * 4);

  // 全角形（独立検証5 Finding 4）。日本語 IME は `．` や `ｐｄｆ` を
  // 容易に生むが、旧規則は半角しか見ていなかった。
  // 畳みは 4 つの範囲を列挙する（． / 全角小文字 / 全角大文字 / 全角数字）。
  // 独立検証7 F7-01: 旧 corpus は小文字と ． しか含まず、
  // 大文字範囲と数字範囲を**削除する変異が 629/0 で生き残っていた**。
  // ＰＤＦ も ｐ２１ も普通の IME 出力である（ｐ２１ は SXF）。
  ['構造計算書．ｐｄｆ', '構造計算書.ｐｄｆ', '構造計算書．pdf',
   'ｐｌａｎ．ｐｄｆ', '図面．ｊｗｗ', '見積書．ｘｌｓｘ',
   '構造計算書．ＰＤＦ', '図面．ＤＷＧ', '見積書．ＸＬＳＸ',
   '構造計算書.ＰＤＦ', '図面．ｐ２１', '納品．７ｚ',
   '納品.７ｚ', '図面.ｐ２１'].forEach((text) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
      /private-document-filename/, text);
  });

  // 拡張子が対象外のリポジトリ内ファイルは通る（過剰拒否していない）。
  // これらは本ツール自身の公開ファイル名であり、既存の
  // publicDescription に実際に現れるので意図的に対象外とする。
  // 幹を捨てたコスト（独立検証10 / D-043）: 文中の裸の `.zip` も落ちるようになった。
  // 以前は幹が空なので通っていた。回避は「ZIP形式」のように dot を置かないこと。
  // 出荷済みの publicDescription 9 件は 1 件も影響を受けない（実測）。
  assert.throws(() => Evidence.assertPublicSafeEvidenceText('形式は .zip とする', 'prose'),
    /private-document-filename/, '幹を捨てたコストを固定する');

  ['index.html の初期値として導入された値', 'calc.js を参照', 'README.md に記載',
   'data.json 形式']
    .forEach((s) => {
      assert.equal(Evidence.assertPublicSafeEvidenceText(s, 'prose'), true, s);
    });
});

test('P2J-S33: `.ext` を含む文字列は**前が何であれ**拒否される', () => {
  // 独立検証10 F10-02。旧版は「幹 + 装飾」の直積を列挙していたが、
  // 装飾集合は**前回の欠陥の軸**（畳むと区切りになる文字）だけでできており、
  // **もともと区切りだった ASCII 文字**（space / `(` / `)` / `"` / `,`）を含んでいなかった。
  // 結果 `plan (1).pdf`——Explorer が重複ファイルに自分で付ける名前——が
  // 10304/10304 素通りしていた。
  //
  // corpus を増やすのをやめ、**不変式**として書く:
  //   dot 形 + 拡張子 を含み、直後が ASCII 英字でなければ、前が何であれ拒否。
  // 幹を捨てたのでこれが言えるようになった（D-043）。
  function expandExt(alt) {
    let out = ['']; let i = 0;
    while (i < alt.length) {
      let tok;
      if (alt.charAt(i) === '[') { const j = alt.indexOf(']', i); tok = alt.slice(i + 1, j).split(''); i = j + 1; }
      else { tok = [alt.charAt(i)]; i += 1; }
      const opt = alt.charAt(i) === '?'; if (opt) i += 1;
      const nx = []; out.forEach((p) => { if (opt) nx.push(p); tok.forEach((c) => nx.push(p + c)); });
      out = nx;
    }
    return Array.from(new Set(out));
  }
  const toFull = (t) => t.replace(/[!-~]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
  const exts = Evidence.PRIVATE_DOCUMENT_EXTENSION_SOURCE.split('|')
    .reduce((a, alt) => a.concat(expandExt(alt)), []);

  // 拡張子の大文字形も回す。旧版は `toFull(ext)` を小文字定数から作っており、
  // 全角**大文字**拡張子を一度も生成していなかった（検証10 F10-05）。
  const extForms = [];
  exts.forEach((e) => { extForms.push(e, e.toUpperCase(), toFull(e), toFull(e.toUpperCase())); });

  // 前置きは「何であれ」を代表する: 旧幹の区切り文字をすべて含める。
  const PREFIXES = ['', '図面', 'plan', '構造計算書 (1)', '図面(最新)', '見積書（最新）',
    '図面「最新」', 'a b', 'x,y', 'p;q', 'r:s', "t'u", 'v"w', '図面、', '図面。', '図面　', ' '];
  const DOTS = ['.', '．', '。', '｡'];

  const leaked = [];
  let checked = 0;
  PREFIXES.forEach((pre) => {
    extForms.forEach((ef) => {
      DOTS.forEach((dot) => {
        checked++;
        const text = pre + dot + ef;
        try { Evidence.assertPublicSafeEvidenceText(text, 'prose'); leaked.push(text); }
        catch (e) { if (!/private-document-filename/.test(e.message)) leaked.push(text + ' (wrong rule)'); }
      });
    });
  });
  assert.deepEqual(leaked.slice(0, 8), [], '素通り (全' + leaked.length + '件 / ' + checked + '中)');
  assert.equal(checked, PREFIXES.length * extForms.length * DOTS.length);
  assert.equal(checked > 10000, true, '検査数: ' + checked);
});

test('P2J-S36: control-character 規則は宣言した範囲を全数覆う', () => {
  // 独立検証10 F10-05。`\\u007F-\\u009F` の上端を 1 つずらす変異が生き残っていた。
  // 本Phase で何度も出た通り、**範囲を持つ実装は代表文字では押さえられない**。
  // （この規則は本Phase で触っていないが、同じ形の未固定であることに変わりは無い。）
  const CONTROL_RANGES = [[0x00, 0x08], [0x0b, 0x0c], [0x0e, 0x1f], [0x7f, 0x9f]];
  let checked = 0;
  CONTROL_RANGES.forEach(([lo, hi]) => {
    for (let c = lo; c <= hi; c++) {
      checked++;
      const text = '検討' + String.fromCharCode(c) + '結果';
      assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
        /control-character/, 'U+' + c.toString(16).toUpperCase().padStart(4, '0'));
    }
  });
  assert.equal(checked, 9 + 2 + 18 + 33);

  // 範囲外は通る（改行・タブは意図的に許容）。
  ['検討\n結果', '検討\t結果', '検討\r結果', '検討\u00a0結果'].forEach((text) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(text, 'prose'), true, JSON.stringify(text));
  });
});

test('P2J-S34: 正規化は集合であり、各要素が固有の形を持つ', () => {
  // 独立検証10 F10-04: 旧版の「wide 専用」証人 `ｗｗｗ．…` は専用ではなかった
  // （U+FF57 は narrow でも畳まる）。つまり何も固定していなかった。
  // 現在の 2 つは、他方だけでは届かない形を**実測で**持っている。
  assert.equal(Evidence.TEXT_NORMALIZER_COUNT, 2);

  // wide だけが畳める: 英数字以外の全角記号（＠ ： ＼）
  ['ａｂｃ＠ｅｘａｍｐｌｅ．ｃｏｍ', 'Ｃ：＼Ｕｓｅｒｓ＼ｘ'].forEach((text) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
      /must not contain private URLs/, 'wide fold だけが捕まえられる形: ' + text);
  });

  // dot 写像だけが届く: U+3002 は全角 ASCII 範囲の外なので wide では畳まない
  ['構造計算書。pdf', '図面｡dwg'].forEach((text) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
      /private-document-filename/, 'dot 写像だけが捕まえられる形: ' + text);
  });

  // 合成が必要な形（閉包を取っていること）
  ['構造計算書。ｐｄｆ', '図面｡ｄｗｇ'].forEach((text) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
      /private-document-filename/, '合成が必要な形: ' + text);
  });

  assert.equal(Evidence.foldFullwidthAscii('。'), '。', 'wide fold は U+3002 を触らない');
  assert.equal(Evidence.foldDotEquivalents('。'), '.', 'dot 写像は U+3002 を写す');
  assert.equal(Evidence.foldDotEquivalents('・'), '・', '中黒は写さない（散文の並列区切り）');
});

test('P2J-S35: 語境界を見るのは raw 側だけ（過剰拒否のコストを固定）', () => {
  // 独立検証9 F9-03。`(?![A-Za-z])` を外すと `.doc` が `document` の中でマッチし、
  // **この repository に実在する識別子**（`Workspace.csvEscape`）が落ちる。
  // 一度外してしまったので、こちら側もテストで押さえる。
  ['window.document を直接触らない', 'e.target.value を読む', 'event.target を参照する',
   'node.documentElement を見る', 'config.documentation を参照', 'obj.docs を参照',
   'Workspace.csvEscape を使う', 'x.gzip で圧縮', 'y.tarball を展開'].forEach((text) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(text, 'prose'), true, text);
  });
  // しかし数字や全角が続く形は単語の続きでは無いので拒否する。
  ['構造計算書.pdf2', '図面.dwg1', '図面．ｄｗｇ１', '構造計算書。ｐｄｆ'].forEach((text) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
      /private-document-filename/, text);
  });

  // 語境界は raw と正規化形で**同じ**になった（独立検証10 F10-01/F10-03）。
  // 以前は正規化形だけ境界無しにしており、
  //   (a) 全角が**どこかに**あるだけで無関係な ASCII 識別子まで巻き込み
  //   (b) `構造計算書.pdfA` は通るのに `構造計算書．ｐｄｆＡ` は落ちる、という不整合
  // を同時に生んでいた。現在はどちらも受理で一貫する。
  ['構造計算書.pdfA', '構造計算書．ｐｄｆＡ', '図面.dwgZ'].forEach((text) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(text, 'prose'), true, text);
  });
});

test('P2J-S29: 全角畳みは拒否を**増やすだけ**であり減らさない', () => {
  // 独立検証7 F7-03 で導入し、検証8 F8-01 で**このテスト自体が
  // 不変式ではなく標本を押さえていた**ことが分かった。
  // 旧版の REJECTED_BASES はすべて半角拡張子だった——つまり
  // 不変式が成立する側の半分だけを手で選んでいた。
  // 全角拡張子（`図面．ｄｗｇ`）を入れると落ちていた。
  //
  // よって base を**手で選ばずに生成する**。拡張子は実装が持つ
  // 唯一の定義から引き、半角・全角の両方の dot と拡張子形を網羅する。
  function expandExt(alt) {
    let out = [''];
    let i = 0;
    while (i < alt.length) {
      let tok;
      if (alt.charAt(i) === '[') {
        const j = alt.indexOf(']', i);
        tok = alt.slice(i + 1, j).split('');
        i = j + 1;
      } else { tok = [alt.charAt(i)]; i += 1; }
      const opt = alt.charAt(i) === '?';
      if (opt) i += 1;
      const nx = [];
      out.forEach((p) => { if (opt) nx.push(p); tok.forEach((c) => nx.push(p + c)); });
      out = nx;
    }
    return Array.from(new Set(out));
  }
  const toFullwidth = (t) => t.replace(/[!-~]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0xfee0));

  const exts = Evidence.PRIVATE_DOCUMENT_EXTENSION_SOURCE.split('|')
    .reduce((a, alt) => a.concat(expandExt(alt)), []);
  const bases = [];
  ['図面', '構造計算書', 'plan'].forEach((stem) => {
    exts.forEach((ext) => {
      ['.', '．'].forEach((dot) => {
        bases.push(stem + dot + ext);
        bases.push(stem + dot + toFullwidth(ext));
      });
    });
  });

  const rejects = (t) => {
    try { Evidence.assertPublicSafeEvidenceText(t, 'prose'); return false; }
    catch (e) { return /private-document-filename/.test(e.message); }
  };

  // positive control: 生成した base が実際に拒否されていなければ
  // 下の不変式は空を回すだけになる。全部拒否されることを先に要求する。
  const notRejected = bases.filter((b) => !rejects(b));
  assert.deepEqual(notRejected, [],
    '拡張子を持つファイル名が拒否されていない: ' + notRejected.slice(0, 8).join(' / '));
  assert.equal(bases.length > 500, true, 'base 数: ' + bases.length);

  // 不変式本体: 末尾に全角英数字を 1 文字足しても受理に転じてはならない。
  // 末尾に足すのは**ASCII 英字に写らない**文字に限る。
  // 全角英字（Ａ ａ）は畳むと ASCII 英字になり、語境界 `(?![A-Za-z])` にかかる——
  // つまり `構造計算書．ｐｄｆＡ` は `構造計算書.pdfA` と**同じ扱いになる**。
  // 以前は正規化形専用の境界無し変種で前者だけ拒否していたが、
  // それが普通の散文を巻き込んでいた（検証10 F10-01）ので取りやめた。
  // 両者の扱いが揃ったことは P2J-S35 で固定する。
  const TRAILING = ['０', '９', '１', '５', '。', '）', '、'];
  const leaked = [];
  bases.forEach((b) => {
    TRAILING.forEach((ch) => { if (!rejects(b + ch)) leaked.push(b + ch); });
  });
  assert.deepEqual(leaked, [],
    '末尾に全角英数字を足すと通った: ' + leaked.slice(0, 8).join(' / '));
});

test('P2J-S25: tag name の継続文字は `[A-Za-z0-9-]` に限られない', () => {
  // 独立検証5 Finding 2。HTML5 の tag name state は
  // tab/LF/FF/space/`/`/`>` 以外では終わらないので、`<img:` は
  // 「壊れた img」ではなく `img:` という名の**実在する要素**になり、
  // onclick は live handler として発火する（Chromium実測）。
  // この欠陥は元の規則から存在し、5度の修復と4度の独立検証を通り抜けた。
  let checked = 0;
  HTML_TAG_NAMES.forEach((tag) => {
    NAME_CONTINUATION_FORMS.forEach((form) => {
      [`<${tag}${form}>`, `</${tag}${form}>`].forEach((text) => {
        checked++;
        assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
          /matched known-unsafe pattern: html-like-tag/, text);
      });
    });
  });
  assert.equal(checked, HTML_TAG_NAMES.length * NAME_CONTINUATION_FORMS.length * 2);

  // corpus の前提そのものを固定する: 終端文字を継続文字に
  // 混ぜていたら、このテストは何も証明していない。
  assert.equal(TAG_NAME_TERMINATORS.length, 5);
  TAG_NAME_CONTINUATIONS.forEach((ch) => {
    assert.equal(TAG_NAME_TERMINATORS.indexOf(ch), -1,
      '終端文字を継続文字に混ぜている: ' + JSON.stringify(ch));
  });
  assert.equal(NAME_CONTINUATION_FORMS.every((f) => TAG_NAME_TERMINATORS.indexOf(f.charAt(0)) === -1), true,
    'header の約束（HTML5終端文字で始まらない形）を再び破っている');
  // なお NBSP と U+3000 は JS の `\\s` には含まれるが HTML5 の終端文字ではない。
  // この非対称こそが誘因だったので、両方を corpus に残す。
  assert.equal(NAME_CONTINUATION_FORMS.filter((f) => !/^[\s\/]/.test(f)).length, 70);
  assert.equal(NAME_CONTINUATION_FORMS.length, 74);
});

test('P2J-S28: 名前の前に `<` や他の文字があってもタグ判定は回避できない', () => {
  // 独立検証6 F2。旧 corpus は 26680 形ありながら、**名前を始める `<` より
  // 前に `<` を置いた形を 1 つも含んでいなかった**。検証4 Finding 1 は名前の
  // **後ろ**の `<` を扱ったが、**前**は誰も扱っていなかった。
  // その結果「最初の `<` だけ見る」変異が suite を無傷で通過していた。
  // Chromium 実測: '<1<img src=x onerror=alert(1)>' は img 要素を生む。
  const PREFIXES = ['<1', '<<', '<@', '<あ', '< ', '</ ', '</1', '3 < 5 なので ', '<!x ', '<'];
  const TAGS = ['img src=x onerror=alert(1)', 'svg onload=alert(1)', 'a href=x', 'script'];
  let checked = 0;
  PREFIXES.forEach((prefix) => {
    TAGS.forEach((tag) => {
      [`${prefix}<${tag}>`, `${prefix}</${tag}>`].forEach((text) => {
        checked++;
        assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
          /matched known-unsafe pattern: html-like-tag/, text);
      });
    });
  });
  assert.equal(checked, PREFIXES.length * TAGS.length * 2);
  // 前置きを実際に持っていること自体を固定する（再び欠けたら落ちる）。
  assert.equal(PREFIXES.filter((p) => p.indexOf('<') !== -1).length >= 7, true);
});

test('P2J-S32: 全角畳みは U+FF01..U+FF5E の**全数**を写像する', () => {
  // 独立検証8 F8-03。範囲を持つ実装を「代表的な文字」で押さえると、
  // 端点を 1 つずらす変異が必ず生き残る。実際 `FF5E→FF5D` は
  // `～/Users/x`（全角チルダ + unix home path）を漏らすまま生き残っていた。
  //
  // 文字を選んでは同じことが繰り返されるので、**範囲全体を写像として**検査する。
  const fold = Evidence.foldFullwidthAscii;
  assert.equal(typeof fold, 'function');
  let checked = 0;
  for (let code = 0xff01; code <= 0xff5e; code++) {
    const full = String.fromCharCode(code);
    const half = String.fromCharCode(code - 0xfee0);
    assert.equal(fold(full), half, 'U+' + code.toString(16) + ' が畳まれていない');
    checked++;
  }
  assert.equal(checked, 0xff5e - 0xff01 + 1);
  assert.equal(fold('\u3000'), ' ', '全角スペース');
  // 範囲外は触らない（半角カナ・漢字・既存 ASCII）
  ['ｱ', 'ﾟ', '図面', 'plan.pdf', 'あ'].forEach((t) => assert.equal(fold(t), t, t));
  assert.equal(fold('\uff00'), '\uff00');
  assert.equal(fold('\uff5f'), '\uff5f');

  // 畳みが実際に全規則へ効いていること（端点を含む証人）
  ['～/Users/x', '～／Ｕｓｅｒｓ／ｘ', '＜！－－x－－＞',
   'ｗｗｗ．ｅｘａｍｐｌｅ．ｃｏｍ', 'ａｂｃ＠ｅｘａｍｐｌｅ．ｃｏｍ'].forEach((text) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
      /must not contain private URLs/, text);
  });
});

test('P2J-S30: tag name の頭文字は ASCII 英字 52 文字全部が対象', () => {
  // 独立検証8 F8-03。scanner は `a-z` / `A-Z` の 2 範囲で判定するが、
  // corpus は `a` しか押さえていなかった——範囲の端点を 1 つずらす変異
  // （`z→y` / `A→B` / `Z→Y`）が 630/0 で生き残り、Chromium 実測で
  // `<zz onclick=alert(1)>` が実要素になる素通りを作っていた。
  // 範囲を持つ実装は**両端を押さえる**こと。
  let checked = 0;
  for (let c = 0; c < 26; c++) {
    [String.fromCharCode(97 + c), String.fromCharCode(65 + c)].forEach((letter) => {
      [letter, letter + letter, letter + '1'].forEach((name) => {
        [`<${name} onclick=alert(1)>`, `</${name}>`].forEach((text) => {
          checked++;
          assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
            /matched known-unsafe pattern: html-like-tag/, text);
        });
      });
    });
  }
  assert.equal(checked, 26 * 2 * 3 * 2);
});

test('P2J-S31: `>` は**名前の後ろ**に無ければタグではない', () => {
  // 独立検証8 F8-03。scanner は `indexOf('>', j)`（名前開始以降）を見る。
  // これを `indexOf('>', 0)` にする変異が生き残っていた。
  // Chromium 実測: `a>b <img src=x` は要素を生まない（`>` が前にしか無い）。
  ['a>b <img src=x', '結果>基準 なので <img src=x', '> <a href=x'].forEach((text) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(text, 'prose'), true, text);
  });
  // 対照: 名前の後ろに `>` があればタグ。
  ['a>b <img src=x>', '> <a href=x>'].forEach((text) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
      /html-like-tag/, text);
  });
});

test('P2J-S26: 本体が長くてもタグ判定は回避できない', () => {
  // 独立検証5 Finding 1。Review 4 の修復で本体に `{0,300}` の上限を
  // 置いたため、301文字以上の本体が**丸ごと素通り**していた。
  // 長さの軸が corpus に無かったので 624 件の suite は無反応だった。
  const NAMES = ['img', 'svg', 'iframe', 'script', 'a'];
  let checked = 0;
  NAMES.forEach((tag) => {
    LONG_BODY_LENGTHS.forEach((n) => {
      // 埋め方を2通り（空白のみ / 属性の反復）用意する。
      [' '.repeat(n), ' data-a=1'.repeat(Math.ceil(n / 9)).slice(0, n)].forEach((pad) => {
        const text = `<${tag}${pad} onerror=alert(1)>`;
        checked++;
        assert.throws(() => Evidence.assertPublicSafeEvidenceText(text, 'prose'),
          /matched known-unsafe pattern: html-like-tag/, `${tag} len=${n}`);
      });
    });
  });
  assert.equal(checked, NAMES.length * LONG_BODY_LENGTHS.length * 2);
  // 境界が corpus に入っていること自体を固定する。
  [299, 300, 301].forEach((n) => assert.equal(LONG_BODY_LENGTHS.includes(n), true, String(n)));
  assert.equal(Math.max(...LONG_BODY_LENGTHS) >= 8192, true);
});

test('P2J-S27: パーサが要素を作らない形は拒否しない（行き過ぎの検出）', () => {
  // 5度の修復はすべて「もっと拒否する」方向だった。片側だけ固定すると
  // 「`<` を含むなら全拒否」へ行き過ぎても suite が気づかない。
  // Chromium実測で**生成要素 0 個**だった形を受理側として固定する。
  [
    '<img src=x onerror=alert(1)',   // `>` が無い＝閉じられない
    '< img src=x>',                  // `<` の直後が space
    '</ img>',                       // bogus comment
    '</1img>',                       // bogus comment
    '＜img onerror=alert(1)＞',      // 全角・テキストになる
    '<//a>', '</ >', '<!>',          // bogus comment系（検証6 F2: 行き過ぎ検出用）
    '<@foo>', 'P<@Q>R', '<1abc>',    // `<` + 非英字（検証9 F9-06: 頭文字クラスの広げすぎ検出）
    '<', '<<<', '>>>'
  ].forEach((text) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(text, 'prose'), true, text);
  });

  // 本規則の目的は散文の制約ではない。不等式を含む技術文は書ける。
  [
    '3 < 5 である', '5<Z<40 の範囲', 'A<B<C<D の順',
    '見付幅W<見付高さH となる場合>注意',
    'x >= 3 かつ y <= 9', 'A --> B の順で確認した'
  ].forEach((text) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(text, 'prose'), true, text);
  });
});

test('P2J-S22: 1文字混ぜてもタグ判定は回避できない', () => {
  // 3度目の欠陥の核心を、単体で読めるように独立して固定する。
  const base = '<img src=x onerror=alert(1)';
  ['あ', 'ア', '図', '中', '「', '\u3000', 'Ａ', '｡', '\uD842\uDFB7', '…']
    .forEach((ch) => {
      assert.throws(() => Evidence.assertPublicSafeEvidenceText(base + ' ' + ch + '>', 'prose'),
        /matched known-unsafe pattern: html-like-tag/, 'char: ' + JSON.stringify(ch));
    });
  // 属性値の中に入れても同じ
  assert.throws(() => Evidence.assertPublicSafeEvidenceText('<img alt="図面" onerror=1>', 'prose'),
    /matched known-unsafe pattern: html-like-tag/);
});

test('P2J-S20: タグ以外のmarkup構文も拒否される', () => {
  ['<!--comment-->', '<!DOCTYPE html>', '<?xml version="1" ?>', '<![CDATA[x]]>']
    .forEach((s) => {
      assert.throws(() => Evidence.assertPublicSafeEvidenceText(s, 'prose'),
        /matched known-unsafe pattern: markup-construct/, s);
    });
  // `-->` 単体は技術散文の矢印と衝突するため対象にしない
  assert.equal(Evidence.assertPublicSafeEvidenceText('A --> B の順で確認した', 'prose'), true);
  assert.equal(Evidence.assertPublicSafeEvidenceText('P -> Q と表記する', 'prose'), true);
});

test('P2J-S21: タグ判定は病的入力でも線形時間で走る', () => {
  // 現在の形は入れ子の量指定子を持たない（否定文字クラス1つ）。
  // 他パターン（email-like / url-scheme / private-document-filename）には
  // 二次的なコストが測定されている（QD-J04）。ここで固定するのはタグ判定のみ。
  const shapes = [
    '<a ' + 'b='.repeat(20000) + '!',
    '<a' + ' b=c'.repeat(20000) + '!',
    '<a' + ' '.repeat(50000),
    '<a b=c '.repeat(20000)
  ];
  shapes.forEach((s) => {
    const t0 = Date.now();
    try { Evidence.assertPublicSafeEvidenceText(s, 'prose'); } catch (e) { /* どちらでもよい */ }
    const ms = Date.now() - t0;
    assert.equal(ms < 1000, true, 'len=' + s.length + ' took ' + ms + 'ms');
  });
});

test('P2J-S19: A1修正後も現行configとObservation経路は通る', () => {
  // 修正がEvidence側へ波及していないことの確認。
  const seen = [];
  (function walk(o) {
    if (!o || typeof o !== 'object') return;
    if (typeof o.publicDescription === 'string') seen.push(o.publicDescription);
    Object.keys(o).forEach((k) => { try { walk(o[k]); } catch (e) { /* getter */ } });
  })(MiyoshiProjectConfig);
  assert.equal(seen.length, 11, '前提: 現行configのpublicDescriptionは11件');
  seen.forEach((d) => assert.equal(Evidence.assertPublicSafeEvidenceText(d, 'c'), true));

  // 不等式を含む説明でもObservationは成立する
  const o = Closure.normalizeObservation(
    obsOf('pane_width_mm', null, 987, 'mm', {
      evidence: ev({ publicDescription: '合成fixture: W < H かつ P > Q の条件で確認' })
    }), 'miyoshi');
  assert.match(o.evidence.publicDescription, /W < H/);
});
