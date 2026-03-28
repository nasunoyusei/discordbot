const cron = require("node-cron");
const fs = require("fs");

const FILE = "./schedule.json";

function loadData() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE));
}

function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function startScheduler(client) {
  cron.schedule(
    "0 12 * * *",
    async () => {
      console.log("12時チェック開始");

      const data = loadData();
      const today = new Date().toLocaleDateString("sv-SE");

      for (const key in data) {
        const schedule = data[key];

        // 現在の対象日
        const sorted = [...schedule.confirmedDates].sort(
          (a, b) => new Date(a) - new Date(b),
        );

        const targetDate = sorted[schedule.currentIndex];
        if (!targetDate) continue;

        // 今日じゃないならスキップ
        if (today !== targetDate) continue;

        // すでに通知済みならスキップ
        if (schedule.notified) continue;

        const dateObj = schedule.dates.find((d) => d.key === targetDate);
        if (!dateObj || dateObj.participants.length === 0) continue;

        const mentions = dateObj.participants.map((id) => `<@${id}>`).join(" ");

        try {
          const channel = await client.channels.fetch(schedule.channelId);
          if (!channel) continue;

          await channel.send(`🐌📢 今日はボスの日です！\n${mentions}`);

          schedule.notified = true;

          console.log(`通知完了: ${schedule.channelId} / ${targetDate}`);
        } catch (err) {
          console.error("通知失敗:", err);
        }
      }

      saveData(data);
    },
    {
      timezone: "Asia/Tokyo",
    },
  );
}

module.exports = { startScheduler };
