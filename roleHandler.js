// ロール付与のトリガーとなるチャンネルID
const TARGET_CHANNEL_ID = "1075660949714907166";
// 付与したいロール名
const ROLE_NAME = "マイマイ";

// ※Botに「ロール管理」権限があり、かつ対象ロールがBotのロールより下にある必要あり
function setupRoleHandler(client) {
  client.on('messageCreate', async (message) => {
    // Botは無視
    if (message.author.bot) return;
    // 指定チャンネル以外は無視
    if (message.channel.id !== TARGET_CHANNEL_ID) return;
    console.log("対象チャンネル一致");

    const member = message.member;
    if (!member) return;

    // 指定したロール名からロールを取得
    const role = message.guild.roles.cache.find(r => r.name === ROLE_NAME);
    if (!role) return;

    // すでに持ってたら何もしない
    if (member.roles.cache.has(role.id)) return;

    // ロールをユーザーに付与
    try {
      await member.roles.add(role);
      console.log(`${member.user.tag} にロール付与`);
      } catch (err) {
      console.error("ロール付与失敗:", err);
    }
  });
}

module.exports = { setupRoleHandler };
