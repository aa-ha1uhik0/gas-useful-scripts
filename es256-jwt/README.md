# Es256Jwt — Google Apps Script用 ES256(ECDSA P-256)JWT署名ライブラリ

Google Apps Script (GAS) の標準機能(`Utilities`クラス)には、RSA署名(RS256)やHMAC署名は用意されていますが、
**ES256(楕円曲線ECDSA P-256によるJWT署名)をネイティブに生成する機能がありません。**

このライブラリは、外部サーバーやNode.js等を一切使わず、GAS単体でES256署名付きJWTを生成できるようにするための、
純粋なGASコード(BigIntベースの自前ECDSA実装)です。

Apple Business API(旧Apple Business Manager)のように、クライアント認証にES256 JWTを要求するAPIと連携する際に利用できます。

## できること

- EC秘密鍵(PEM形式、SEC1 / PKCS8 いずれも対応)を読み込み、ES256署名付きのJWT(JWS コンパクト形式)を生成
- 秘密鍵の読み込み・署名・検証が正しく動作するかの自己診断
- 秘密鍵PEMのDER構造の診断(値そのものはログに出さない)

## できないこと / 注意点

- ECDSA(ES256)以外の署名方式(RSAのRS256、対称鍵のHMACなど)には対応していません。GAS標準の`Utilities`クラスで十分な場合はそちらを使ってください。
- P-256(secp256r1 / prime256v1)曲線専用です。P-384やP-521など他の曲線には対応していません。
- パスフレーズで暗号化された秘密鍵には対応していません(平文のPEMのみ)。

## 導入方法

1. GASプロジェクトのエディタで、ファイル一覧の「+」→「スクリプト」から新規ファイルを作成
2. ファイル名を `es256-jwt-library` などにする
3. `es256-jwt-library.gs` の中身をそのまま貼り付けて保存

これだけで、同じプロジェクト内から `signEs256Jwt(...)` / `selfTest(...)` / `debugPemStructure(...)` を直接呼び出せます。

## API

### `signEs256Jwt(header, payload, privateKeyPem)`

ES256署名付きのコンパクトJWS文字列(JWT)を生成します。

```javascript
const header = { alg: 'ES256', kid: 'YOUR_KEY_ID', typ: 'JWT' };
const payload = {
  sub: 'YOUR_CLIENT_ID',
  aud: 'https://example.com/token',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300,
  jti: Utilities.getUuid(),
  iss: 'YOUR_CLIENT_ID'
};
const pem = PropertiesService.getScriptProperties().getProperty('PRIVATE_KEY_PEM');

const jwt = signEs256Jwt(header, payload, pem);
```

| 引数 | 型 | 説明 |
|---|---|---|
| `header` | Object | JWTヘッダーのクレーム(`alg`/`typ`含め呼び出し側で指定) |
| `payload` | Object | JWTペイロードのクレーム |
| `privateKeyPem` | string | EC秘密鍵のPEM文字列 |

戻り値: `header.payload.signature` 形式のコンパクトJWS文字列

### `selfTest(privateKeyPem)`

秘密鍵の読み込み・署名・検証が正しく動作するかを確認します。成功時は`true`を返し、失敗時は例外を投げます。

```javascript
function testMyKey() {
  const pem = PropertiesService.getScriptProperties().getProperty('PRIVATE_KEY_PEM');
  selfTest(pem);
  Logger.log('OK');
}
```

### `debugPemStructure(privateKeyPem)`

秘密鍵PEMのDER構造を診断用に返します(鍵の値そのものは含みません)。PEMのパースに失敗する場合の切り分けに使えます。
```javascript
const info = debugPemStructure(pem);
Logger.log(info.derByteLength); // DERバイト長
Logger.log(info.root.tag);      // ルートのASN.1タグ
```
## 動作検証について

GAS単体では実行結果を信頼できる別実装と突き合わせる手段がないため、同じロジックをPythonでプロトタイピングし、
OpenSSLで生成した鍵ペアを使って「Python実装で署名 → OpenSSLで検証」というクロスチェックを行った上でGASへ移植しています。
SEC1 / PKCS8 いずれの秘密鍵形式でも同じ秘密鍵値が復元できることも確認済みです。

## 利用上の注意・セキュリティ（重要）

### 🔑 1. 秘密鍵(.pem)の厳重な管理

Apple Business APIの秘密鍵(.pem)は、「それ自体が強力な認証情報」です。この秘密鍵さえあれば、誰でもそのAPIアカウントになりすましてJWTを署名し、Apple Business APIへアクセスできてしまいます。ソースコード内に秘密鍵を直書きしたままGitHub等の公開リポジトリへコミットしないことが重要です。必ずGASの「スクリプトプロパティ」を利用して隠蔽し、コードと認証情報を完全に分離させてください。

### ⚠️ 免責事項

本コードは無償で提供されており、完全な自己責任においてご利用いただけます。本コードの利用、または利用不能によって生じた損害(秘密鍵の漏洩、署名の不正な受理・拒否、Apple Business APIへの認証エラーやアクセス不能、その他の一切の不利益)について、作成者は直接的・間接的を問わずいかなる責任も負いません。導入前に必ずコードの内容をご自身でご確認のうえ、検証用環境等での動作確認を行ってください。

