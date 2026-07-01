/**
 * Slack Webhookを使用してシステム通知を送信する共通関数
 * @param {string} webhookUrl - 送信先のWebhook URL
 * @param {string} text - 送信したいメッセージ本文（通知のポップアップ用としても表示されます）
 * @param {Object} [options] - カスタマイズ用の追加オプション（attachments, blocks）
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
