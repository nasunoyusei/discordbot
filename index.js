const { Client, GatewayIntentBits } = require("discord.js");
require("dotenv").config();

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

setupRoleHandler(client);
setupBossSchedule(client);
setupDistribution(client);

client.once("ready", () => {
  console.log(`ログイン完了: ${client.user.tag}`);
  startScheduler(client);
});

client
  .login(process.env.TOKEN)
  .then(() => console.log("Discord login success"))
  .catch(console.error);

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
