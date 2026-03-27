const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

//ロールを自動付与するやつ
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

//書き込みを検知するチャンネル
const TARGET_CHANNEL_ID = "1075660949714907166";
const ROLE_NAME = "マイマイ";

client.once('clientReady', () => {
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


// 簡易Webサーバーのやつ
// Botログイン
client.login(process.env.TOKEN);

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is alive!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Web server is running');
});