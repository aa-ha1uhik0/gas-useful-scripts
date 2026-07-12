/**
 * ES256 (P-256 ECDSA) JWT署名ライブラリ
 *
 * Google Apps Script の Utilities には ES256(楕円曲線)署名の標準機能がないため、
 * BigInt を用いて曲線演算・RFC6979決定論的nonce生成・署名を自前実装している。
 * OpenSSLとの相互検証で正しく動作することを確認済み。
 *
 * 公開関数(他プロジェクトからライブラリ経由で呼び出せるもの):
 *   - signEs256Jwt(header, payload, privateKeyPem)
 *   - selfTest(privateKeyPem)
 *   - debugPemStructure(privateKeyPem)
 *
 * それ以外の関数(末尾が _ のもの)は内部実装であり、ライブラリの外からは呼べない。
 */

/** ===================== 公開API ===================== **/

/**
 * ES256署名付きのコンパクトJWS文字列(JWT)を生成する。
 * @param {Object} header - JWTヘッダーのクレーム(alg/typ含め呼び出し側で指定すること)
 * @param {Object} payload - JWTペイロードのクレーム
 * @param {string} privateKeyPem - EC秘密鍵のPEM文字列(SEC1 / PKCS8 いずれも対応)
 * @return {string} header.payload.signature 形式のコンパクトJWS文字列
 */
function signEs256Jwt(header, payload, privateKeyPem) {
  const signingInput =
    base64UrlEncodeString_(JSON.stringify(header)) + '.' +
    base64UrlEncodeString_(JSON.stringify(payload));

  const d = extractEcPrivateScalarFromPem_(privateKeyPem);
  const { r, s } = ecdsaSignP256_(signingInput, d);
  const sigBytes = bigIntTo32Bytes_(r).concat(bigIntTo32Bytes_(s));
  const signature = base64UrlEncodeBytes_(sigBytes);

  return signingInput + '.' + signature;
}

/**
 * 秘密鍵の読み込み・署名・検証が正しく動作するかを確認する自己診断。
 * 成功時はtrueを返し、失敗時は例外を投げる。
 * @param {string} privateKeyPem - EC秘密鍵のPEM文字列
 * @return {boolean} true(成功時のみ返る。失敗時は例外)
 */
function selfTest(privateKeyPem) {
  const d = extractEcPrivateScalarFromPem_(privateKeyPem);
  const Q = scalarMult_(d, [G_X, G_Y]);
  if (!isOnCurve_(Q)) {
    throw new Error('自己診断失敗: 導出した公開鍵が曲線上にありません(秘密鍵の読み込みに問題がある可能性)');
  }

  const testMessage = 'es256-jwt-lib-selftest-' + Utilities.getUuid();
  const { r, s } = ecdsaSignP256_(testMessage, d);
  if (!ecdsaVerifyP256_(testMessage, r, s, Q)) {
    throw new Error('自己診断失敗: 署名の自己検証に失敗しました');
  }
  return true;
}

/**
 * 秘密鍵PEMのDER構造を診断用に返す(鍵の値そのものは含まない)。
 * @param {string} privateKeyPem - EC秘密鍵のPEM文字列
 * @return {Object} { derByteLength, root, first, second, third(該当時のみ) } のtag/length情報
 */
function debugPemStructure(privateKeyPem) {
  const der = pemToDer_(privateKeyPem);
  const root = readTlv_(der, 0);
  const first = readTlv_(root.value, 0);
  const second = readTlv_(root.value, first.next);

  const result = {
    derByteLength: der.length,
    root: { tag: root.tag, length: root.length },
    first: { tag: first.tag, length: first.length },
    second: { tag: second.tag, length: second.length }
  };

  if (second.tag === 0x30) {
    const third = readTlv_(root.value, second.next);
    result.third = { tag: third.tag, length: third.length };
  }

  return result;
}

/** ===================== ECDSA P-256 内部実装 ===================== **/

// Apps Script のパーサーは BigInt リテラル構文(123n)を受け付けないため、
// 全て BigInt() 関数呼び出し形式で記述する。巨大な16進定数は精度保持のため文字列で渡す。
const P_MOD = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
const A_COEF = BigInt("0xffffffff00000001000000000000000000000000fffffffffffffffffffffffc");
const B_COEF = BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b");
const G_X = BigInt("0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296");
const G_Y = BigInt("0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5");
const N_ORDER = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

function mod_(a, m) {
  return ((a % m) + m) % m;
}

function invMod_(a, m) {
  a = mod_(a, m);
  let oldR = a, r = m;
  let oldS = BigInt(1), s = BigInt(0);
  while (r !== BigInt(0)) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return mod_(oldS, m);
}

function pointAdd_(p1, p2) {
  if (p1 === null) return p2;
  if (p2 === null) return p1;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  if (x1 === x2 && mod_(y1 + y2, P_MOD) === BigInt(0)) return null;
  let lam;
  if (x1 === x2 && y1 === y2) {
    lam = mod_((BigInt(3) * x1 * x1 + A_COEF) * invMod_(mod_(BigInt(2) * y1, P_MOD), P_MOD), P_MOD);
  } else {
    lam = mod_((y2 - y1) * invMod_(mod_(x2 - x1, P_MOD), P_MOD), P_MOD);
  }
  const x3 = mod_(lam * lam - x1 - x2, P_MOD);
  const y3 = mod_(lam * (x1 - x3) - y1, P_MOD);
  return [x3, y3];
}

function scalarMult_(k, point) {
  let result = null;
  let addend = point;
  let kk = k;
  while (kk > BigInt(0)) {
    if (kk & BigInt(1)) result = pointAdd_(result, addend);
    addend = pointAdd_(addend, addend);
    kk >>= BigInt(1);
  }
  return result;
}

function isOnCurve_(pt) {
  const [x, y] = pt;
  return mod_(y * y - (x * x * x + A_COEF * x + B_COEF), P_MOD) === BigInt(0);
}

function ecdsaSignP256_(message, d) {
  const hashBytes = sha256Bytes_(message);
  const z = bytesToBigInt_(hashBytes);
  while (true) {
    const k = rfc6979K_(hashBytes, d, N_ORDER);
    const R = scalarMult_(k, [G_X, G_Y]);
    const r = mod_(R[0], N_ORDER);
    if (r === BigInt(0)) continue;
    const kInv = invMod_(k, N_ORDER);
    const s = mod_(kInv * (z + r * d), N_ORDER);
    if (s === BigInt(0)) continue;
    return { r, s };
  }
}

function ecdsaVerifyP256_(message, r, s, Q) {
  const hashBytes = sha256Bytes_(message);
  const z = bytesToBigInt_(hashBytes);
  const w = invMod_(s, N_ORDER);
  const u1 = mod_(z * w, N_ORDER);
  const u2 = mod_(r * w, N_ORDER);
  const X = pointAdd_(scalarMult_(u1, [G_X, G_Y]), scalarMult_(u2, Q));
  if (X === null) return false;
  return mod_(X[0], N_ORDER) === r;
}

/** ---- RFC 6979 決定論的nonce生成(HMAC-SHA256) ---- **/

function bits2int_(bytes, qlenBits) {
  let v = bytesToBigInt_(bytes);
  const vlen = bytes.length * 8;
  if (vlen > qlenBits) v >>= BigInt(vlen - qlenBits);
  return v;
}

function rfc6979K_(hashBytes, d, n) {
  const qlen = n.toString(2).length;
  const x = bigIntTo32Bytes_(d);
  const h1 = hashBytes;
  let v = new Array(32).fill(1);
  let k = new Array(32).fill(0);
  k = hmacSha256Bytes_(v.concat([0], x, h1), k);
  v = hmacSha256Bytes_(v, k);
  k = hmacSha256Bytes_(v.concat([1], x, h1), k);
  v = hmacSha256Bytes_(v, k);
  while (true) {
    let t = [];
    while (t.length < 32) {
      v = hmacSha256Bytes_(v, k);
      t = t.concat(v);
    }
    const cand = bits2int_(t, qlen);
    if (cand > BigInt(0) && cand < n) return cand;
    k = hmacSha256Bytes_(v.concat([0]), k);
    v = hmacSha256Bytes_(v, k);
  }
}

/** ---- DER (SEC1 / PKCS8) 秘密鍵パース ---- **/

function readTlv_(buf, offset) {
  const tag = buf[offset];
  const lengthByte = buf[offset + 1];
  let length, valueStart;
  if ((lengthByte & 0x80) === 0) {
    length = lengthByte;
    valueStart = offset + 2;
  } else {
    const numLenBytes = lengthByte & 0x7f;
    length = 0;
    for (let i = 0; i < numLenBytes; i++) {
      length = (length << 8) | buf[offset + 2 + i];
    }
    valueStart = offset + 2 + numLenBytes;
  }
  const valueEnd = valueStart + length;
  return { tag, length, value: buf.slice(valueStart, valueEnd), next: valueEnd };
}

function findEcPrivateScalar_(der) {
  const root = readTlv_(der, 0); // 外側の SEQUENCE
  const content = root.value;
  const first = readTlv_(content, 0); // INTEGER version
  const second = readTlv_(content, first.next); // SEC1: OCTET STRING(32) / PKCS8: SEQUENCE(algorithm)
  if (second.tag === 0x04 && second.length === 32) {
    return bytesToBigInt_(second.value);
  }
  if (second.tag === 0x30) {
    const third = readTlv_(content, second.next); // OCTET STRING (中に SEC1 構造が入れ子)
    if (third.tag === 0x04) return findEcPrivateScalar_(third.value);
  }
  throw new Error('未対応の秘密鍵DER構造です(PEMの内容を確認してください)');
}

function pemToDer_(pemText) {
  // Script Properties の入力欄によっては改行がスペースに置き換わって
  // 1行で保存されることがあるため、行単位ではなく正規表現でヘッダーを除去し、
  // 残りから非Base64文字(スペース・改行・タブ等)を全て取り除く方式にする。
  const withoutHeaders = pemText
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '');
  const b64 = withoutHeaders.replace(/[^A-Za-z0-9+/=]/g, '');
  return toUnsignedBytes_(Utilities.base64Decode(b64));
}

function extractEcPrivateScalarFromPem_(pemText) {
  return findEcPrivateScalar_(pemToDer_(pemText));
}

/** ---- バイト列 / Base64 / BigInt ヘルパー ---- **/

function toUnsignedBytes_(signedBytes) {
  return signedBytes.map(b => (b + 256) % 256);
}

function toSignedBytes_(unsignedBytes) {
  return unsignedBytes.map(b => (b > 127 ? b - 256 : b));
}

function bytesToBigInt_(bytes) {
  let result = BigInt(0);
  for (const b of bytes) result = (result << BigInt(8)) | BigInt(b);
  return result;
}

function bigIntTo32Bytes_(value) {
  const bytes = [];
  let v = value;
  for (let i = 0; i < 32; i++) {
    bytes.unshift(Number(v & BigInt(0xff)));
    v >>= BigInt(8);
  }
  return bytes;
}

function base64UrlEncodeBytes_(unsignedBytes) {
  return Utilities.base64EncodeWebSafe(toSignedBytes_(unsignedBytes)).replace(/=+$/, '');
}

function base64UrlEncodeString_(str) {
  return Utilities.base64EncodeWebSafe(Utilities.newBlob(str).getBytes()).replace(/=+$/, '');
}

function sha256Bytes_(str) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return toUnsignedBytes_(digest);
}

function hmacSha256Bytes_(messageBytesUnsigned, keyBytesUnsigned) {
  const mac = Utilities.computeHmacSha256Signature(
    toSignedBytes_(messageBytesUnsigned),
    toSignedBytes_(keyBytesUnsigned)
  );
  return toUnsignedBytes_(mac);
}
