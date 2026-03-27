const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const TARGET_CHANNEL_ID = "1487034879005954179";
const ROLE_NAME = "マイマイ";

client.once('ready', () => {
  console.log(`ログイン完了: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Botは無視
  if (message.author.bot) return;

  // チャンネルチェック
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  const member = message.member;
  if (!member) return;

  // ロール取得
  const role = message.guild.roles.cache.find(r => r.name === ROLE_NAME);
  if (!role) {
    console.log("ロールが見つからない");
    return;
  }

  // すでに持ってたら何もしない
  if (member.roles.cache.has(role.id)) return;

  // ロール付与
  await member.roles.add(role);

  console.log(`${member.user.tag} にロール付与`);
});

client.login(process.env.TOKEN);