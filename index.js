const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

console.log("TOKEN exists:", !!process.env.TOKEN);
console.log("TOKEN length:", process.env.TOKEN?.length);

const { startScheduler } = require("./scheduler");
const { setupRoleHandler } = require("./roleHandler");
const { setupBossSchedule } = require("./bossSchedule");
const { setupDistribution } = require("./distribution");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("ready", () => {
  console.log(`ログイン完了: ${client.user.tag}`);

  startScheduler(client);
  setupRoleHandler(client);
  setupBossSchedule(client);
  setupDistribution(client);
});

client.login(process.env.TOKEN);

// UptimeRobotから定期的にアクセスさせてスリープ防止するためのWebサーバー
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is alive!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Web server is running");
});
