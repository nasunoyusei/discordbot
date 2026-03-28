const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const fs = require('fs');

const FILE = './schedule.json';

function load() {
  if (!fs.existsSync(FILE)) return {};
  return JSON.parse(fs.readFileSync(FILE));
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// 日付生成（今日から7日）
function getNext7Days() {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      key: d.toLocaleDateString('sv-SE'),
      label: `${d.getMonth()+1}/${d.getDate()}`
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
    text += `${d.label} ${status}（${count}/${data.max}）\n`;
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
        .setStyle(ButtonStyle.Primary)
    );

    if ((i + 1) % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
  });

  if (row.components.length > 0) rows.push(row);

  return rows;
}

function setupBossSchedule(client) {

  // Slashコマンド処理
  client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {

      if (interaction.commandName === 'boss') {
        const sub = interaction.options.getSubcommand();

        if (sub === 'schedule') {
          const max = interaction.options.getInteger('人数');

          const days = getNext7Days();

          const schedule = {
            channelId: interaction.channel.id,
            max,
            dates: days.map(d => ({
              key: d.key,
              label: d.label,
              participants: [],
              confirmed: false
            })),
            confirmedDates: [],
            currentIndex: 0,
            notified: false
          };

          const message = await interaction.reply({
            content: buildMessage(schedule),
            components: buildButtons(days),
            fetchReply: true
          });

          schedule.messageId = message.id;

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

      const date = schedule.dates.find(d => d.key === interaction.customId);
      if (!date) return;

      const userId = interaction.user.id;

      // トグル
      if (date.participants.includes(userId)) {
        date.participants = date.participants.filter(id => id !== userId);
      } else {
        date.participants.push(userId);
      }

      // 判定
      if (date.participants.length >= schedule.max && !date.confirmed) {
        date.confirmed = true;
        schedule.confirmedDates.push(date.key);
      }

      save(data);

      await interaction.update({
        content: buildMessage(schedule)
      });
    }
  });
}

module.exports = { setupBossSchedule };