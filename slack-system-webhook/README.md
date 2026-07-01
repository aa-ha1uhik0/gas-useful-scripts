# はじめに
社内のGoogleフォームの回答、スプレッドシートの更新、あるいはシステムの定期実行エラーなどをトリガーにして、Slackへ通知を送る仕組みは業務自動化の鉄板です。

しかし、通知機能を作るたびに毎回 `UrlFetchApp.fetch` の長い設定を書くのは非効率ですし、コードが見づらくなってしまいます。また、単純な文字だけの通知で始まったシステムも、運用していくうちに「見やすいように色付きの線をつけたい」「最新のBlock Kitを使ってボタンやリンクを綺麗に配置したい」と要望が進化していくものです。

そこで、シンプルなテキスト通知から高度なリッチレイアウト（Block Kit）まで、引数を変えるだけで柔軟に送り分けられる共通のSlack通知スクリプトを作成しました！

ご自身のGASプロジェクトにコピペするだけですぐに使え、Webhook URLなどの機密情報を外部化して安全に使い回せる設計にしています。

---

# 1. 設計のこだわり（シンプルさと安全性の両立）

このスクリプトは、Slackの「Incoming Webhook」の仕様をラップしたものです。以下の2つのこだわりを持って設計しています。

### 💡 こだわりポイント1：引数の柔軟性（最新仕様と後方互換性）
最低限必要な「Webhook URL」と「本文（`text`）」を渡すだけでサクッと動きます。
同時に、第3引数に `options` オブジェクトを渡すことで、現在Slack公式が推奨している最新レイアウトの **`blocks`（Block Kit）** を簡単に適用できます。
また、現在はレガシー（非推奨）扱いとなっている旧式の **`attachments`** についても、過去の古い通知スクリプトからの移行（後方互換性）を考慮して、そのまま渡せる設計に残してあります。

### 💡 こだわりポイント2：呼び出し元を巻き込まない安全設計
`UrlFetchApp.fetch` を実行する際、`'muteHttpExceptions': true` を指定しています。
万が一、Slack側で一時的な障害が発生していたり、Webhook URLが間違っていたりして送信に失敗した場合でも、**呼び出し元のGAS（メイン処理）を強制終了（例外エラー）させない**仕組みになっています。これにより、Slack通知の成否に関わらず、メインの業務ロジック（台帳への書き込みなど）は最後まで安全に実行されます。

---

# 2. 事前準備（Slackアプリの設定）

Slackに通知を送るための「Webhook URL」を発行する必要があります。

1. **Slack Appの作成・選択**
   [Slack API (My Apps)](https://api.slack.com/apps) にアクセスし、新しくアプリを作成するか、既存のアプリを選択します。
2. **Incoming Webhooks の有効化**
   左メニューの **`Incoming Webhooks`** を開き、画面右上のスイッチを **`On`** にして機能を有効化（Activate）します。
3. **Webhook URLの生成**
   画面最下部にある `Add New Webhook to Workspace` ボタンをクリックし、通知を飛ばしたいチャンネルを選択して許可します。
4. **URLのコピー**
   生成された `https://hooks.slack.com/services/...` から始まる **`Webhook URL`** をコピーして控えておきます。

---

# 3. 導入手順（コピペ用ソースコード）

利用したいGASプロジェクトのエディタを開き、新しいスクリプトファイル（例: `SlackWebhookUtil.gs`）を作成して、以下のコードをそのまま貼り付けてください。

💡 **本スクリプトはGitHubでも公開しています。他のGAS便利スクリプトやアップデート情報は、ぜひリポジトリをチェックしてください！**
👉 [GitHub: gas-useful-scripts / slack-system-webhook](https://github.com/あなたのユーザー名/gas-useful-scripts/tree/main/slack-system-webhook)
*(※実際のご自身のGitHubリポジトリURLに置き換えてください)*

```javascript
/**
 * Slack Webhookを使用してシステム通知を送信する共通関数
 * @param {string} webhookUrl - 送信先のWebhook URL
 * @param {string} text - 送信したいメッセージ本文（通知のポップアップ用としても表示されます）
 * @param {Object} [options] - カスタマイズ用の追加オプション（blocks, attachments等）
 */
function sendAlert(webhookUrl, text, options = {}) {
  if (!webhookUrl) {
    console.error('エラー: Webhook URLが指定されていません。');
    return;
  }

  // 基本となる送信データ
  const payload = {
    'text': text
  };

  // オプションで装飾（現在推奨のBlock Kit、または後方互換用のattachments）が指定されていれば追加
if (options.attachments) {
  payload.attachments = options.attachments; // ※Slack公式では現在レガシー扱い
}
if (options.blocks) {
  payload.blocks = options.blocks; // ※新規開発はこちら（Block Kit）が推奨
}

  const fetchOptions = {
    'method': 'post',
    'contentType': 'application/json; charset=utf-8',
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true // エラー発生時も呼び出し元のGASを強制終了させないための安全策
  };

  try {
    const response = UrlFetchApp.fetch(webhookUrl, fetchOptions);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 200) {
      console.error('Webhook送信エラー:', response.getContentText());
    } else {
      console.log('システム通知を正常に送信しました。');
    }
  } catch (error) {
    console.error('通信エラーが発生しました:', error.toString());
  }
}
```
# 4. 実装コード例（使い方）

セキュリティの観点から、Webhook URLはコード内に直接書かず、GASの **「スクリプトプロパティ」** に保存して利用することを強く推奨します。

### 1. スクリプトプロパティの設定
GASエディタの左メニュー「プロジェクトの設定（歯車マーク）」＞「スクリプトプロパティ」に以下を追加します。
* プロパティ名: `SLACK_WEBHOOK_URL`
* 値: （先ほど控えた `https://hooks.slack.com/...` から始まるURL）

### 2. 呼び出し側のサンプルスクリプト
以下は、用途に合わせて「シンプル通知」と「推奨レイアウト（Block Kit）通知」を使い分ける実装例です。

```javascript
/**
 * Slack通知のテスト実行用関数
 */
function testSlackNotification() {
  // 1. スクリプトプロパティから安全にWebhook URLを取得
  const webhookUrl = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK_URL');
  
  if (!webhookUrl) {
    console.error('エラー: スクリプトプロパティに SLACK_WEBHOOK_URL が設定されていません。');
    return;
  }

  // -----------------------------------------------------------------
  // パターンA: 最もシンプルなテキスト通知（これだけで動きます）
  // -----------------------------------------------------------------
  const simpleText = '⚠️ 【警告】システムエラーが発生しました。ログを確認してください。';
  sendAlert(webhookUrl, simpleText);


  // -----------------------------------------------------------------
  // パターンB: Block Kitを使った高度で綺麗な通知
  // -----------------------------------------------------------------
  const fallbackText = 'お客さまよりメッセージが送信されました。'; // 通知ポップアップ用の文言
  
  const blockOptions = {
    blocks: [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "<@U1A2B3C4D> お疲れ様です！新しいメッセージが届きました。🙇‍♂️"
        }
      },
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "⚠️ 【通知】問い合わせフォームを受け付けました",
          "emoji": true
        }
      },
      {
        "type": "divider"
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*【問い合わせ元】*：<@U12345678>\n*【】*：利用方法について"
        }
      }
    ]
  };

  // 第3引数にオブジェクトを渡すだけで自動的にBlock Kitに切り替わります
  sendAlert(webhookUrl, fallbackText, blockOptions);
}
```
# 5. 主なペイロード構造（参考）
`sendAlert` 関数を実行した際、Slack側へ最終的に送信されるJSONデータの構造は以下のようになります。第3引数に渡した中身がそのまま統合されます。詳細なデザイン設計は [Slack公式のBlock Kit Builder](https://api.slack.com/block-kit-builder) を利用すると直感的に組み立てられます。

```json
{
  "text": "【通知】問い合わせフォームを受け付けました",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "<@U1A2B3C4D> お疲れ様です！新しいメッセージが届きました。"
      }
    }
  ]
}
```
# 6. よくあるトラブルシューティング

### ① ログに `Webhook送信エラー: invalid_payload` と表示される
* **原因:** 第3引数の `options` 内（`blocks` や `attachments`）のJSON構造が、Slackの指定するフォーマットに従っていません。カッコの閉じ忘れや、存在しないプロパティ名がないか確認してください。
* **対策:** 組み立てたBlock構造を一度 [Block Kit Builder](https://api.slack.com/block-kit-builder) に貼り付けて、エラーが出ないかチェックしてください。

### ② ログに `Webhook送信エラー: no_service` または `404 Not Found` と表示される
* **原因:** 渡している Webhook URL が間違っているか、すでにそのURL（または生成したSlack App自体）が削除されています。
* **対策:** スクリプトプロパティのURLの末尾に余計なスペースが入っていないか、最新のURLになっているか再確認してください。

### ③ 通知は届くが、スマホのプッシュ通知の文字が「Block Kitのテキスト」になってしまう
* **原因:** 第2引数で指定した `text` の文字列がそのままプッシュ通知のポップアップ（fallbackテキスト）として使われます。
* **対策:** 第2引数には、スマホの通知画面だけを見て「何の通知か」がパッと1秒でわかる要約した文章をセットしてください。

---

# 7. 利用上の注意・セキュリティ（重要）

外部へ通知を送信する共有スクリプトをプロジェクトに導入する際は、セキュリティリスクを正しく理解しておく必要があります。本コードを利用するにあたり、以下の点にご注意ください。

### 🔑 1. Webhook URLの厳重な隠蔽
Slackの「Incoming Webhook URL」は、 **それ自体が強力な認証情報（パスワード）** です。このURLさえ知っていれば、世界中の誰からでも、あなたの社内のSlackチャンネルへ自由に文字や偽のリンクを投稿できてしまいます。
絶対にソースコード内にURLを直書きしたままGitHub等の公開リポジトリへコミットしないでください。必ずGASの「スクリプトプロパティ」を利用して隠蔽し、コードと認証情報を完全に分離させてください。

### ⚠️ 免責事項
本コードスニペットは無償で提供されており、完全な自己責任においてご利用いただけます。本コードの利用、または利用不能によって生じた損害（Webhook URLの漏洩、誤通知による社内情報の混乱、システム停止、その他の一切の不利益）について、作成者は直接的・間接的を問わずいかなる責任も負いません。導入前に必ずコードの内容をご自身でご確認のうえ、検証用環境等での動作確認を行ってください。

---

# おわりに
今回は、プレーンテキストからリッチなBlock Kitまで1つの関数で柔軟に送り分ける、汎用的なSlackシステム通知スクリプトの紹介でした。

一度この共通関数をプロジェクト内に設置しておけば、次回からはわずか1〜2行で安全にSlackへ通知を飛ばせるようになります。障害検知の自動アラートや社内フォームの受付通知など、あらゆる場面の「最後の出口」として非常に重宝します。ぜひお手元の自動化プロジェクトに組み込んでみてください！
