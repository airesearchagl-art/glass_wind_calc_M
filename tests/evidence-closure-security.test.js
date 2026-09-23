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

test('P2J-S17: タグ判定はドメイン変数を使った不等式散文を巻き込まない', () => {
  // 独立検証の指摘（A1）。旧パターンは「`<`+英字 … `>`」なら何でも拒否しており、
  // `W<H かつ P>Q である。` を html-like-tag として落としていた。
  // W / H / P / Q / Z は本ドメインの変数名そのものなので、この形の散文は
  // 現実に書かれうる。fail closed 側の誤りではあるが、
  // 将来のEvidence散文が理由の分からないまま書けなくなる。
  const mustAccept = [
    'W<H かつ P>Q である。',
    'P<Q かつ R>S のとき',
    '見付幅W<見付高さH となる場合>注意',
    '5<Z<40',
    '5<Z<40 かつ W>1000',
    'W < H かつ P > Q',
    'a<b'
  ];
  mustAccept.forEach((s) => {
    assert.equal(Evidence.assertPublicSafeEvidenceText(s, 'prose'), true, s);
  });
});

test('P2J-S18: タグ形の内容は、本体の書式が崩れていても拒否される', () => {
  // 独立再検証 F1 の回帰。最初の修理は「本体が**属性の形**のものだけ拒否」
  // という書き方で、意図を裏返していた。属性文法に合わない本体は素通りし、
  // **崩れたタグほど通る**という逆転が起きていた:
  //   <img src=x onerror=alert(1)>  拒否
  //   <img src=x onerror=alert`1`>  素通り  ← バッククォートだけの差
  // 現在は「本体に日本語が無いタグ形」を書式を問わず拒否する。
  const wellFormed = [
    '<b>x</b>', '</b>', '<script>x</script>', '</script>', '<script src="x">',
    '<img src=x onerror=1>', '<img src="x" onerror="alert(1)">',
    '<svg onload=1>', '<iframe src="javascript:1">', '<iframe srcdoc="x">',
    '<a href="#">y</a>', '<div class="a b">', '<input disabled>', '<BR/>', '<br />',
    '<META charset=utf8>', '<a\nhref=x>', '<b\tid=y>'
  ];
  // F1 が素通りさせていた「崩れた」形。ここが空だと穴が再発しても気付けない。
  const malformed = [
    '<img src=x onerror=alert`1`>', '<script "q">', '<script =v>',
    '<img 1=2>', '<iframe 0x=1>', '<img -x=1>', '<img .x=1>',
    '<img x=1 2>', '<img x=`v`>', "<img x=a'b>", '<img x=a"b>'
  ];
  // 区切りが空白ではなく `/` の形（旧パターンも取りこぼしていた）
  const slashForms = ['<svg/onload=1>', '<img/src=x onerror=alert(1)>'];

  [].concat(wellFormed, malformed, slashForms).forEach((s) => {
    assert.throws(() => Evidence.assertPublicSafeEvidenceText(s, 'prose'),
      /matched known-unsafe pattern: html-like-tag/, s);
  });
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

test('P2J-S21: タグ判定に入れ子の量指定子が無い（backtracking懸念の構造的解消）', () => {
  // 再検証は旧パターンの入れ子量指定子を計測し「線形・実害なし」と結論したが、
  // 現在の形はそもそも入れ子量指定子を持たない（否定文字クラス1つ）。
  // 病的入力でも線形であることを実測で固定する。
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
      evidence: ev({ publicDescription: '合成fixture: W<H かつ P>Q の条件で確認' })
    }), 'miyoshi');
  assert.match(o.evidence.publicDescription, /W<H/);
});
