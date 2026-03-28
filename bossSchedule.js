const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const fs = require("fs");

const FILE = "./schedule.json";

function load() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// 日付生成（今日から7日）
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function getNext7Days(startDate = new Date()) {
  const days = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);

    const weekday = WEEKDAYS[d.getDay()];

    days.push({
      key: d.toLocaleDateString("sv-SE"),
      label: `${d.getMonth() + 1}/${d.getDate()}（${weekday}）`,
    });
  }

  return days;
}

// メッセージ生成
function buildMessage(data) {
  let text = "📅 ボス参加可能日\n\n";

  for (const d of data.dates) {
    const count = d.participants.length;
    const status = count >= data.max ? "✅" : "❌";

    const names = d.participants.map((id) => `<@${id}>`).join(", ");

    text += `${d.label} ${status}（${count}/${data.max}）\n`;
    if (names) {
      text += `　👥 ${names}\n`;
    }
  }

  // 次回開催日表示
  if (data.confirmedDates.length > 0) {
    const sortedConfirmed = [...data.confirmedDates].sort(
      (a, b) => new Date(a) - new Date(b),
    );

    const next = sortedConfirmed[data.currentIndex];
    const nextObj = data.dates.find((d) => d.key === next);

    if (nextObj) {
      text += `🎯 次回開催日：${nextObj.label}\n\n`;
    }
  }

  // 予備日表示
  if (data.confirmedDates.length > data.currentIndex + 1) {
    const reserve = data.confirmedDates
      .slice(data.currentIndex + 1)
      .sort((a, b) => new Date(a) - new Date(b))
      .map((d) => {
        const obj = data.dates.find((x) => x.key === d);
        return obj ? obj.label : null;
      })
      .filter(Boolean)
      .join(", ");

    text += `🛟 予備日：${reserve}\n\n`;
  }

  return text;
}

// ボタン生成
function buildButtons(days) {
  const rows = [];
  let row = new ActionRowBuilder();

  days.forEach((d, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(d.key)
        .setLabel(d.label)
        .setStyle(ButtonStyle.Primary),
    );

    if ((i + 1) % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
  });

  if (row.components.length > 0) rows.push(row);

  return rows;
}

// 開始日を決める
function getStartDate(option) {
  const now = new Date();

  if (option === "today") {
    return now;
  }

  if (option === "next_thursday") {
    const day = now.getDay();
    const target = 4;

    let diff = target - day;
    if (diff <= 0) diff += 7;

    const nextThu = new Date(now);
    nextThu.setDate(now.getDate() + diff);

    return nextThu;
  }

  return now;
}

function setupBossSchedule(client) {
  // Slashコマンド処理
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "boss") {
        const sub = interaction.options.getSubcommand();

        if (sub === "schedule") {
          const max = interaction.options.getInteger("人数");
          const startOption = interaction.options.getString("開始");

          const startDate = getStartDate(startOption);
          const days = getNext7Days(startDate);

          const schedule = {
            channelId: interaction.channel.id,
            max,
            dates: days.map((d) => ({
              key: d.key,
              label: d.label,
              participants: [],
            })),
            confirmedDates: [],
            currentIndex: 0,
            notified: false,
          };

          const message = await interaction.reply({
            content: buildMessage(schedule),
            components: buildButtons(days),
          });

          const fetched = await interaction.fetchReply();
          schedule.messageId = fetched.id;

          const data = load();
          const key = `${interaction.guild.id}_${interaction.channel.id}`;
          data[key] = schedule;
          save(data);
        }
      }
    }

    // ボタン処理
    if (interaction.isButton()) {
      const data = load();
      const key = `${interaction.guild.id}_${interaction.channel.id}`;
      const schedule = data[key];
      if (!schedule) return;

      const date = schedule.dates.find((d) => d.key === interaction.customId);
      if (!date) return;

      const userId = interaction.user.id;

      // トグル
      if (date.participants.includes(userId)) {
        date.participants = date.participants.filter((id) => id !== userId);
      } else {
        if (!date.participants.includes(userId)) {
          date.participants.push(userId);
        }
      }

      // 全日付を再チェック
      schedule.confirmedDates = schedule.dates
        .filter((d) => d.participants.length >= schedule.max)
        .map((d) => d.key);

      // currentIndex補正
      if (schedule.currentIndex >= schedule.confirmedDates.length) {
        schedule.currentIndex = 0;
      }

      save(data);

      await interaction.update({
        content: buildMessage(schedule),
        components: buildButtons(schedule.dates),
      });
    }
  });
}

module.exports = { setupBossSchedule };
