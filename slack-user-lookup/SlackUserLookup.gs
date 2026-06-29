/**
 * メールアドレスからSlackのユーザー情報を検索し、レスポンスを丸ごと返す関数
 * @param {string} token - 呼び出し元から渡されるSlackのBotトークン(xoxb-...)
 * @param {string} email - 検索したいメールアドレス
 * @return {Object|null} Slack APIからのレスポンスオブジェクト（エラー時はnull）
 */
function getUserByEmail(token, email) {
  if (!token || !email) {
    console.error('エラー: トークンまたはメールアドレスが指定されていません。');
    return null;
  }

  const url = `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`;
  
  const options = {
    'method': 'get',
    'headers': {
      'Authorization': 'Bearer ' + token
    },
    'muteHttpExceptions': true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    // レスポンスのJSONテキストをオブジェクトに変換して、そのまま丸ごと呼び出し元に返す
    return JSON.parse(response.getContentText());
  } catch (error) {
    console.error('通信エラー:', error.toString());
    return null;
  }
}
