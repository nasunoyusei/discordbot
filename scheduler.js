const cron = require('node-cron');
const fs = require('fs');

const FILE = './schedule.json';

function loadData() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE));
}

function saveData(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function startScheduler(client) {
  cron.schedule('0 12 * * *', async () => {
    console.log("12時チェック開始");

    const data = loadData();
    const today = new Date().toLocaleDateString('sv-SE');

    for (const key in data) {
      const schedule = data[key];

      // 現在の対象日
      const targetDate = schedule.confirmedDates[schedule.currentIndex];
      if (!targetDate) continue;

      // 今日じゃないならスキップ
      if (today !== targetDate) continue;

      // すでに通知済みならスキップ
      if (schedule.notified) continue;

      try {
        const channel = await client.channels.fetch(schedule.channelId);
        if (!channel) continue;

        await channel.send("📢 今日はボスの日です！忘れずに参加してね！");

        schedule.notified = true;
        console.log(`通知完了: ${schedule.channelId}`);
      } catch (err) {
        console.error("通知失敗:", err);
      }
    }

    saveData(data);
  }, {
    timezone: "Asia/Tokyo"
  });
}

module.exports = { startScheduler };