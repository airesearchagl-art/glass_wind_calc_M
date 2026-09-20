'use strict';

/**
 * Phase 2F: 案件非依存のEvidence contract と Promotion Gate のテスト。
 *
 * 重点は「gateが実際の構築経路に接続されているか」であって、
 * gate関数が単体で正しく動くかだけではない。
 * gateが呼ばれていなければ、どれほど厳密な関数でも実質advisoryになる。
 *
 * 実行: node --test tests/  （または npm test）
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Evidence = require('../project-config/evidence.js');
const MiyoshiProjectConfig = require('../project-config/miyoshi.js');

const EVIDENCE_SRC = path.join(__dirname, '..', 'project-config', 'evidence.js');
const MIYOSHI_SRC = path.join(__dirname, '..', 'project-config', 'miyoshi.js');

/** primary + 妥当なcheckedAt を持つが、privateReferenceを持たないevidence */
function primaryNoReference() {
  return Evidence.makeEvidence('primary', '2026-09-20', '一次資料で直接確認', false);
}
/** primary + 妥当なcheckedAt + privateReference あり */
function primaryWithPrivateReference() {
  return Evidence.makeEvidence('primary', '2026-09-20', '一次資料で直接確認', true);
}

const PUBLIC_OK = 'https://www.mlit.go.jp/jutakukentiku/build/content/H12-1454.pdf';

/* ============================================================
   §6-1 / §6-12  Promotion Gate の基本契約
============================================================ */

test('§6-1: verified + primary + checkedAt でも、referenceが無ければ拒否される', () => {
  assert.throws(
    () => Evidence.assertPromotionGate('verified', primaryNoReference(), 'fact'),
    /requires either .*privateReferenceAvailable .* or a validated public primary source reference/
  );
  // privateReferenceがあれば通る
  assert.doesNotThrow(
    () => Evidence.assertPromotionGate('verified', primaryWithPrivateReference(), 'fact')
  );
});

test('§6-12: partially_verified / unverified はreferenceを要求されない', () => {
  const indirect = Evidence.makeEvidence('indirect', '2026-09-20', '間接的に整合を確認', false);
  const none = Evidence.makeEvidence('none', null, '未確認', false);
  assert.doesNotThrow(() => Evidence.assertPromotionGate('partially_verified', indirect, 'x'));
  assert.doesNotThrow(() => Evidence.assertPromotionGate('unverified', none, 'x'));
  // 既存guardの挙動も変わらない
  assert.doesNotThrow(() => Evidence.assertEvidenceConsistency('partially_verified', indirect, 'x'));
  assert.doesNotThrow(() => Evidence.assertEvidenceConsistency('unverified', none, 'x'));
});

/* ============================================================
   §6-2 〜 §6-6  public source reference の構造検証
============================================================ */

test('§6-2: publicSourceReferenceは任意の非空文字列では通らない', () => {
  for (const bad of ['x', 'probably-primary', 'primary source', '一次資料', 'TRUE', '1']) {
    assert.throws(
      () => Evidence.assertPublicPrimarySourceReference(bad),
      /syntactically valid absolute URL/,
      JSON.stringify(bad) + ' はrejectされるはず'
    );
  }
});

test('§6-3: 既知のprivate providerのURLは拒否される', () => {
  const providers = [
    'https://drive.google.com/file/d/abc123/view',
    'https://docs.google.com/document/d/abc',
    'https://notion.so/workspace/page',
    'https://www.notion.com/private',
    'https://contoso.sharepoint.com/sites/x',
    'https://www.dropbox.com/s/abc/file.pdf'
  ];
  for (const url of providers) {
    assert.throws(
      () => Evidence.assertPublicPrimarySourceReference(url),
      /private-document provider/,
      url + ' はrejectされるはず'
    );
  }
});

test('§6-4: localhost / loopback / 私設ネットワークは拒否される', () => {
  for (const url of ['https://localhost/doc', 'https://localhost:8443/doc',
                     'https://127.0.0.1/doc', 'https://0.0.0.0/doc', 'https://[::1]/doc']) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference(url),
      /localhost\/loopback/, url + ' はrejectされるはず');
  }
  for (const url of ['https://10.0.0.5/doc', 'https://192.168.1.5/doc',
                     'https://172.16.0.1/doc', 'https://172.31.255.1/doc', 'https://169.254.1.1/doc']) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference(url),
      /private-network address/, url + ' はrejectされるはず');
  }
  // 私設でないIP/ホストは構造上は通る（真正性の判断はHuman）
  assert.doesNotThrow(() => Evidence.assertPublicPrimarySourceReference('https://172.32.0.1/doc'));
});

test('§6-5: 資格情報を埋め込んだURL・tokenを提供元とするURLは拒否される', () => {
  assert.throws(() => Evidence.assertPublicPrimarySourceReference('https://user:pass@www.mlit.go.jp/x'),
    /must not embed credentials/);
  assert.throws(() => Evidence.assertPublicPrimarySourceReference('https://user@www.mlit.go.jp/x'),
    /must not embed credentials/);
  for (const url of ['https://www.mlit.go.jp/x?token=abc',
                     'https://www.mlit.go.jp/x?api_key=abc',
                     'https://www.mlit.go.jp/x#access_token=abc']) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference(url),
      /credential\/token/, url + ' はrejectされるはず');
  }
});

test('§6-5b: httpや非URL・ローカルパス・単一ラベルホストは拒否される', () => {
  assert.throws(() => Evidence.assertPublicPrimarySourceReference('http://www.mlit.go.jp/x'), /must use https/);
  assert.throws(() => Evidence.assertPublicPrimarySourceReference('/home/user/doc.pdf'), /valid absolute URL/);
  // 注: WHATWG URLは 'C:\\docs\\a.pdf' をscheme 'c:' として解釈するため、
  // 構文エラーではなく **https要件** で落ちる。落ちること自体が重要。
  assert.throws(() => Evidence.assertPublicPrimarySourceReference('C:\\docs\\a.pdf'), /must use https/);
  assert.throws(() => Evidence.assertPublicPrimarySourceReference('file:///home/user/a.pdf'), /must use https/);
  assert.throws(() => Evidence.assertPublicPrimarySourceReference('https://intranet/doc'), /fully-qualified hostname/);
});

test('§6-6: 妥当な公的HTTPS URLはreference要件を満たせる', () => {
  assert.doesNotThrow(() => Evidence.assertPublicPrimarySourceReference(PUBLIC_OK));
  const ref = Evidence.makePublicPrimarySourceReference(PUBLIC_OK, 'fact');
  assert.equal(ref.kind, 'public_primary');
  assert.equal(ref.url, PUBLIC_OK);

  // privateReferenceが無くても、検証済みpublic referenceがあればgateを通る
  assert.doesNotThrow(
    () => Evidence.assertPromotionGate('verified', primaryNoReference(), 'fact', { sourceReference: ref })
  );
  // 不正なreferenceは「参照がある」として数えない
  assert.throws(
    () => Evidence.assertPromotionGate('verified', primaryNoReference(), 'fact',
      { sourceReference: { kind: 'public_primary', url: 'x' } }),
    /valid absolute URL/
  );
  assert.throws(
    () => Evidence.assertPromotionGate('verified', primaryNoReference(), 'fact',
      { sourceReference: { kind: 'private_primary', url: PUBLIC_OK } }),
    /sourceReference.kind must be "public_primary"/
  );
});

test('§5: sourceReferenceの正規形は kind/url のみで、余計なfieldを持てない', () => {
  assert.doesNotThrow(() => Evidence.assertSourceReference(null));
  assert.doesNotThrow(() => Evidence.assertSourceReference(undefined));
  assert.throws(
    () => Evidence.assertSourceReference({ kind: 'public_primary', url: PUBLIC_OK, filename: 'secret.pdf' }),
    /unexpected field/
  );
  assert.throws(() => Evidence.assertSourceReference('https://example.gov/x'), /must be null or an object/);
  assert.throws(() => Evidence.assertSourceReference([]), /must be null or an object/);
});

/* ============================================================
   §6-7 〜 §6-9  gateが「実際の構築経路」に接続されていること
============================================================ */

test('§6-7: verifiedValue() は promotion gate を迂回できない', () => {
  // privateReferenceなし・public referenceなしの verified 値は構築できない
  assert.throws(
    () => Evidence.verifiedValue(34, 'm/s', 'verified', primaryNoReference(), 'V0'),
    /promotion gate/
  );
  // privateReferenceがあれば従来どおり構築できる
  assert.doesNotThrow(
    () => Evidence.verifiedValue(34, 'm/s', 'verified', primaryWithPrivateReference(), 'V0')
  );
  // public referenceでも構築できる
  assert.doesNotThrow(
    () => Evidence.verifiedValue(34, 'm/s', 'verified', primaryNoReference(), 'V0',
      { sourceReference: Evidence.makePublicPrimarySourceReference(PUBLIC_OK) })
  );
  // partially_verified / unverified は従来どおり
  assert.doesNotThrow(
    () => Evidence.verifiedValue(1, 'x', 'partially_verified',
      Evidence.makeEvidence('indirect', '2026-09-20', '間接確認', false), 'y')
  );

  // ソース上も verifiedValue が gate を呼んでいること
  const src = fs.readFileSync(EVIDENCE_SRC, 'utf8');
  const fn = src.slice(src.indexOf('function verifiedValue'), src.indexOf('\n  }', src.indexOf('function verifiedValue')));
  assert.match(fn, /assertPromotionGate\(/, 'verifiedValue は assertPromotionGate を呼ぶこと');
  assert.doesNotMatch(fn, /assertEvidenceConsistency\(/, 'verifiedValue は弱いguardを直接呼ばないこと');
});

test('§6-8: identity構築が promotion gate を迂回できない', () => {
  const src = fs.readFileSync(MIYOSHI_SRC, 'utf8');
  assert.match(src, /assertPromotionGate\('verified', identityEvidence, 'identity'\)/,
    'identity構築は強化後のgateを通ること');
  assert.doesNotMatch(src, /assertEvidenceConsistency\('verified', identityEvidence/,
    'identity構築が弱いguardのままになっていないこと');
});

test('§6-9: validateVerifiedCase が promotion gate を迂回できない', () => {
  const src = fs.readFileSync(MIYOSHI_SRC, 'utf8');
  const fn = src.slice(src.indexOf('function validateVerifiedCase'));
  assert.match(fn, /assertPromotionGate\(/, 'case検証は強化後のgateを通ること');
  assert.doesNotMatch(fn, /assertEvidenceConsistency\('verified'/,
    'case検証が弱いguardのままになっていないこと');

  // 実挙動: primary + 妥当checkedAt でも reference が無ければ case は拒否される
  const weak = primaryNoReference();
  const strong = primaryWithPrivateReference();
  const baseCase = {
    caseId: 'case-test', floor: '2', zone: 'general',
    widthMm: 1000, heightMm: 2000, glassType: 'fl_single', designPressure: 1500,
    publicEvidenceDescription: 'テスト用',
    evidence: { widthEvidence: strong, heightEvidence: strong, pressureEvidence: strong }
  };
  assert.doesNotThrow(() => MiyoshiProjectConfig.validateVerifiedCase(baseCase));

  for (const key of ['widthEvidence', 'heightEvidence', 'pressureEvidence']) {
    const broken = JSON.parse(JSON.stringify(baseCase));
    broken.evidence[key] = weak;
    assert.throws(
      () => MiyoshiProjectConfig.validateVerifiedCase(broken),
      /promotion gate/,
      key + ' に reference が無い case は拒否されるはず'
    );
  }
});

/* ============================================================
   §6-11  既存factが壊れていないこと
============================================================ */

test('§6-11: 既存の identity / V0 / roughness は強化後も有効なまま', () => {
  assert.equal(MiyoshiProjectConfig.identity.verificationStatus, 'verified');
  assert.equal(MiyoshiProjectConfig.wind.V0.value, 34);
  assert.equal(MiyoshiProjectConfig.wind.V0.verificationStatus, 'verified');
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.value, 'III');
  assert.equal(MiyoshiProjectConfig.wind.roughnessCategory.verificationStatus, 'verified');

  for (const [label, ev] of [
    ['identity', MiyoshiProjectConfig.identity.evidence],
    ['wind.V0', MiyoshiProjectConfig.wind.V0.evidence],
    ['wind.roughnessCategory', MiyoshiProjectConfig.wind.roughnessCategory.evidence]
  ]) {
    assert.equal(ev.level, 'primary', label);
    assert.equal(ev.privateReferenceAvailable, true, label);
    assert.doesNotThrow(() => Evidence.assertPromotionGate('verified', ev, label));
  }

  // 未検証のものは未検証のまま
  assert.equal(MiyoshiProjectConfig.dimensions.status, 'unverified');
  assert.equal(MiyoshiProjectConfig.dimensions.mode, 'sample_default');
  assert.equal(MiyoshiProjectConfig.wind.status, 'partially_verified');
});

/* ============================================================
   privacy: reference validator は publicDescription 用ガードと別物
============================================================ */

test('公開URLはreferenceとして可、publicDescriptionには不可（役割が逆であることの固定）', () => {
  // reference としては通る
  assert.doesNotThrow(() => Evidence.assertPublicPrimarySourceReference(PUBLIC_OK));
  // 同じURLを publicDescription へ入れることは拒否される
  assert.throws(
    () => Evidence.assertPublicSafeEvidenceText('参照: ' + PUBLIC_OK, 'publicDescription'),
    /must not contain private URLs\/paths\/identifiers/
  );
  // makeEvidence 経由でも拒否される
  assert.throws(
    () => Evidence.makeEvidence('primary', '2026-09-20', '参照: ' + PUBLIC_OK, true),
    /must not contain/
  );
});

/* ============================================================
   独立検証(Phase 2F)の指摘に対する回帰テスト
   F1 / F3 / F4 / F8 — public source reference と contract の不変性
============================================================ */

test('F1: ルート末尾ドットでprivate provider denylistと完全修飾判定を迂回できない', () => {
  // `drive.google.com.` はDNS上まったく同じホストを指すが、正規化前は
  // `$`アンカーのdenylistにも「ドットを含むか」判定にも一致しなかった。
  // その結果、実在のDrive URLとイントラネット名の**両方**が
  // 「検証済みpublic primary source reference」として保存されていた。
  const dotted = [
    'https://drive.google.com./file/d/FILE-ID/view',
    'https://docs.google.com./document/d/ID',
    'https://notion.so./page',
    'https://www.dropbox.com./s/x',
    'https://contoso.sharepoint.com./x',
    'https://DRIVE.GOOGLE.COM./a',
    'https://drive.google.com../a'
  ];
  for (const url of dotted) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference(url, 'F1'),
      /known private-document provider/, url + ' はprivate providerとして拒否されるべき');
  }
  // 末尾ドット付き単一ラベル（`intranet.`）も完全修飾ホスト名ではない
  for (const url of ['https://intranet./docs/x.pdf', 'https://fileserver./a']) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference(url, 'F1'),
      /public fully-qualified hostname/, url + ' は単一ラベルとして拒否されるべき');
  }
  // Ledger / verifiedValue の入口からも到達できないこと（gate経由の確認）
  assert.throws(() => Evidence.makePublicPrimarySourceReference(
    'https://drive.google.com./file/d/FILE-ID/view', 'F1'), /private-document provider/);

  // 正規表記の公的資料は通り、保存形は末尾ドットを落とした正規形になる
  const canonical = Evidence.assertPublicPrimarySourceReference(
    'https://www.mlit.go.jp./jutakukentiku/build/content/H12-1454.pdf', 'F1');
  assert.equal(canonical, 'https://www.mlit.go.jp/jutakukentiku/build/content/H12-1454.pdf');
});

test('F8: 私設TLD・CGNAT・ワイルドカードDNS・追加provider・percent-encoded credentialを拒否する', () => {
  const rejected = [
    ['https://printer.local/', /private-use\/reserved TLD/],
    ['https://wiki.internal/', /private-use\/reserved TLD/],
    ['https://fileserver.corp/', /private-use\/reserved TLD/],
    ['https://nas.home/', /private-use\/reserved TLD/],
    ['https://100.64.1.1/', /private-network address/],
    ['https://0.1.2.3/', /private-network address/],
    ['https://10.0.0.5.nip.io/', /wildcard-DNS host/],
    ['https://drive.usercontent.google.com/download?id=x', /private-document provider/],
    ['https://storage.cloud.google.com/b/o', /private-document provider/],
    ['https://onedrive.live.com/x', /private-document provider/],
    ['https://box.com/s/x', /private-document provider/],
    ['https://example.co.jp/a?password=abc', /credential\/token/],
    ['https://example.co.jp/a?auth=abc', /credential\/token/],
    ['https://example.co.jp/a?sessionToken=abc', /credential\/token/],
    // percent-encodeされたparam名（生URLのregexだけでは取りこぼす）
    ['https://example.co.jp/a?%74oken=abc', /credential\/token/],
    ['https://example.co.jp/a?%61pi_key=abc', /credential\/token/]
  ];
  for (const [url, re] of rejected) {
    assert.throws(() => Evidence.assertPublicPrimarySourceReference(url, 'F8'), re, url);
  }
  // 公開資料側を巻き込んでいないこと（false positiveの確認）
  for (const url of [
    'https://www.mlit.go.jp/jutakukentiku/build/content/H12-1454.pdf',
    'https://elaws.e-gov.go.jp/document?lawid=412M50000800001',
    'https://172.32.0.1/x'   // 172.32 は私設レンジ外＝公開アドレス
  ]) {
    assert.doesNotThrow(() => Evidence.assertPublicPrimarySourceReference(url, 'F8'), url);
  }
});

test('F3: verifiedValue() の戻り値はgate通過後に改変できない', () => {
  const v = Evidence.verifiedValue(34, 'm/s', 'verified',
    Evidence.makeEvidence('primary', '2026-09-20', '一次資料で直接確認', true), 'F3');
  assert.equal(Object.isFrozen(v), true);
  assert.equal(Object.isFrozen(v.evidence), true);
  assert.throws(() => { v.value = 99; }, TypeError);
  assert.throws(() => { v.verificationStatus = 'unverified'; }, TypeError);
  assert.throws(() => { v.evidence.level = 'none'; }, TypeError);
  assert.throws(() => { v.evidence.privateReferenceAvailable = false; }, TypeError);
  assert.equal(v.value, 34);
  assert.equal(v.evidence.level, 'primary');
});

test('F4: contract定義はlive mutableで公開されない', () => {
  assert.equal(Object.isFrozen(Evidence.EVIDENCE_LEVELS), true);
  assert.equal(Object.isFrozen(Evidence.VERIFICATION_STATUSES), true);
  assert.equal(Object.isFrozen(Evidence.PUBLIC_UNSAFE_TEXT_PATTERNS), true);
  // 緩めようとしても契約は変わらない
  assert.throws(() => Evidence.EVIDENCE_LEVELS.push('assumed'), TypeError);
  assert.equal(Evidence.EVIDENCE_LEVELS.includes('assumed'), false);
  assert.throws(() => Evidence.PUBLIC_UNSAFE_TEXT_PATTERNS.length = 0, TypeError);
  assert.equal(Evidence.PUBLIC_UNSAFE_TEXT_PATTERNS.length > 0, true);
  // 契約が実際に効いていること
  assert.throws(() => Evidence.makeEvidence('assumed', '2026-09-20', 'x', true));
});
