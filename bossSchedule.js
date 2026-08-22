const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
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

// 時間帯パース・重なり判定
const CLOCK_RE = /^([01]?\d|2[0-3]):(00|30)$/;
const RANGE_SPLIT_RE = /^([^-]*)-([^-]*)$/;

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// 全角数字・全角コロン・波ダッシュ等を半角に補正
function normalizeTimeText(text) {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[：]/g, ":")
    .replace(/[〜～ー－―‐−]/g, "-")
    .replace(/　/g, " ")
    .trim();
}

// "17:00" のような単発の時刻をパース。不正なら null
function parseClockTime(text) {
  const m = text.match(CLOCK_RE);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

// 「24:00」「0:00」はその日の終わりまでを意味するので、終了なし（null）扱いにする
function isEndOfDayMarker(text, start) {
  return (
    text === "24:00" ||
    ((text === "0:00" || text === "00:00") && start !== "00:00")
  );
}

// "17:00-21:00" / "16:30-" / "-22:00" / 空欄（終日） をパース。不正なら null
function parseTimeRange(rawText) {
  const text = normalizeTimeText(rawText);

  if (text === "") {
    return { start: "00:00", end: null };
  }

  const m = text.match(RANGE_SPLIT_RE);
  if (!m) return null;

  const startText = m[1].trim();
  const endText = m[2].trim();

  // 開始省略（"-22:00"）はその日の始まりから、と同じ扱い
  const start = startText === "" ? "00:00" : parseClockTime(startText);
  if (start === null) return null;

  if (endText === "") return { start, end: null };

  if (isEndOfDayMarker(endText, start)) return { start, end: null };

  const end = parseClockTime(endText);
  if (end === null) return null;
  if (timeToMinutes(start) >= timeToMinutes(end)) return null;

  return { start, end };
}

// participants の時間帯の共通部分を返す。重ならなければ null
function computeOverlap(participants) {
  if (participants.length === 0) return null;

  const starts = participants.map((p) => timeToMinutes(p.start));
  const ends = participants.map((p) =>
    p.end === null ? Infinity : timeToMinutes(p.end),
  );

  const latestStart = Math.max(...starts);
  const earliestEnd = Math.min(...ends);

  if (latestStart >= earliestEnd) return null;

  return {
    start: minutesToTime(latestStart),
    end: earliestEnd === Infinity ? null : minutesToTime(earliestEnd),
  };
}

// schedule全体のconfirmedStart/End・confirmedDates・currentIndexを再計算
function recomputeConfirmed(schedule) {
  for (const d of schedule.dates) {
    const enough = d.participants.length >= schedule.max;
    const overlap = enough ? computeOverlap(d.participants) : null;

    d.confirmedStart = overlap ? overlap.start : null;
    d.confirmedEnd = overlap ? overlap.end : null;
  }

  schedule.confirmedDates = schedule.dates
    .filter((d) => d.confirmedStart !== null)
    .map((d) => d.key);

  if (schedule.currentIndex >= schedule.confirmedDates.length) {
    schedule.currentIndex = 0;
  }
}

function isAllDay(start, end) {
  return start === "00:00" && end === null;
}

function formatParticipant(p) {
  if (isAllDay(p.start, p.end)) return `<@${p.userId}>（終日）`;
  const range = p.end ? `${p.start}-${p.end}` : `${p.start}-`;
  return `<@${p.userId}>（${range}）`;
}

function formatRange(start, end) {
  if (isAllDay(start, end)) return "終日";
  return end ? `${start}〜${end}` : `${start}〜`;
}

function buildTimeModal(dateKey) {
  return new ModalBuilder()
    .setCustomId(`time_modal_${dateKey}`)
    .setTitle("参加時間を入力")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("time_range_input")
          .setLabel("時間 (空欄なら終日)")
          .setPlaceholder("17:00-21:00 / 16:30- / -22:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(20),
      ),
    );
}

// メッセージ生成
function buildMessage(data) {
  let text = "📅 ボス参加可能日\n\n";

  if (data.allowedUserIds && data.allowedUserIds.length > 0) {
    const allowedNames = data.allowedUserIds.map((id) => `<@${id}>`).join(", ");
    text += `🔒 参加対象：${allowedNames}\n`;
    text += "※参加対象の人のみボタン操作できます。\n\n";
  }

  const sortedConfirmed = [...data.confirmedDates].sort(
    (a, b) => new Date(a) - new Date(b),
  );

  for (const d of data.dates) {
    const count = d.participants.length;
    let status;
    if (count < data.max) {
      status = "❌";
    } else if (d.confirmedStart === null) {
      status = "⚠️";
    } else {
      status = "✅";
    }

    const names = d.participants.map(formatParticipant).join(", ");

    // その日が確定リストの何番目か
    const confirmedIndex = sortedConfirmed.indexOf(d.key);

    // currentIndexより前なら「過去（リスケ済み）」
    const isPast = confirmedIndex !== -1 && confirmedIndex < data.currentIndex;

    let line = `${d.label} ${status}（${count}/${data.max}）`;
    if (status === "✅") {
      line += `　${formatRange(d.confirmedStart, d.confirmedEnd)}`;
    }
    if (isPast) {
      line = `~~${line}~~`;
    }

    text += line + "\n";

    if (names) {
      let memberLine = `　👥 ${names}`;
      if (isPast) {
        memberLine = `~~${memberLine}~~`;
      }
      text += memberLine + "\n";
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
      text += `🎯 次回開催日：${nextObj.label}　${formatRange(nextObj.confirmedStart, nextObj.confirmedEnd)}\n\n`;
    }
  }

  // 予備日表示
  if (data.confirmedDates.length > data.currentIndex + 1) {
    const reserve = data.confirmedDates
      .slice(data.currentIndex + 1)
      .sort((a, b) => new Date(a) - new Date(b))
      .map((d) => {
        const obj = data.dates.find((x) => x.key === d);
        return obj
          ? `${obj.label}（${formatRange(obj.confirmedStart, obj.confirmedEnd)}）`
          : null;
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

function collectAllowedUserIds(interaction) {
  const ids = new Set();

  for (let i = 1; i <= 5; i++) {
    const user = interaction.options.getUser(`user${i}`);
    if (user) {
      ids.add(user.id);
    }
  }

  return [...ids];
}

function setupBossSchedule(client) {
  // Slashコマンド処理
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "boss") {
        const sub = interaction.options.getSubcommand();

        // scheduleのコマンド
        if (sub === "schedule") {
          const max = interaction.options.getInteger("人数");
          const startOption = interaction.options.getString("開始");
          const allowedUserIds = [
            ...new Set([
              ...collectAllowedUserIds(interaction),
              interaction.user.id,
            ]),
          ];

          const startDate = getStartDate(startOption);
          const days = getNext7Days(startDate);

          const schedule = {
            channelId: interaction.channel.id,
            max,
            dates: days.map((d) => ({
              key: d.key,
              label: d.label,
              participants: [],
              confirmedStart: null,
              confirmedEnd: null,
            })),
            confirmedDates: [],
            currentIndex: 0,
            notified: false,
            allowedUserIds,
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

        // rescheduleのコマンド
        if (sub === "reschedule") {
          const data = load();
          const key = `${interaction.guild.id}_${interaction.channel.id}`;
          const schedule = data[key];

          if (!schedule) {
            return interaction.reply({
              content: "スケジュールが存在しません",
              ephemeral: true,
            });
          }

          // ソート
          const sorted = [...schedule.confirmedDates].sort(
            (a, b) => new Date(a) - new Date(b),
          );

          // 次の開催日に進む
          if (schedule.currentIndex + 1 < sorted.length) {
            schedule.currentIndex++;
            schedule.confirmedDates = sorted;
            schedule.notified = false;

            save(data);

            let message;
            try {
              const channel = await client.channels.fetch(schedule.channelId);
              message = await channel.messages.fetch(schedule.messageId);
            } catch (e) {
              return interaction.reply({
                content: "元メッセージが見つかりません",
                ephemeral: true,
              });
            }

            await message.edit({
              content: buildMessage(schedule),
              components: buildButtons(schedule.dates),
            });

            const next = sorted[schedule.currentIndex];
            const nextObj = schedule.dates.find((d) => d.key === next);

            if (!nextObj) {
              return interaction.reply({
                content: "開催日データが見つかりません",
                ephemeral: true,
              });
            }

            return interaction.reply({
              content: `🐌📢 開催日を変更しました！\n👉 ${nextObj.label}`,
            });
          } else {
            return interaction.reply({
              content: "これ以上先の候補日がありません",
              ephemeral: true,
            });
          }
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
      const isAllowed =
        !schedule.allowedUserIds ||
        schedule.allowedUserIds.length === 0 ||
        schedule.allowedUserIds.includes(userId);

      if (!isAllowed) {
        await interaction.reply({
          content: "参加対象のメンバーのみ操作できます。",
          ephemeral: true,
        });
        return;
      }

      const already = date.participants.some((p) => p.userId === userId);

      if (already) {
        // トグルオフ：モーダルなしで即時解除
        date.participants = date.participants.filter(
          (p) => p.userId !== userId,
        );

        recomputeConfirmed(schedule);
        save(data);

        await interaction.update({
          content: buildMessage(schedule),
          components: buildButtons(schedule.dates),
        });
      } else {
        // 未登録：時間帯入力モーダルを表示（schedule.jsonはまだ変更しない）
        await interaction.showModal(buildTimeModal(date.key));
      }
    }

    // モーダル送信処理（時間帯登録）
    if (interaction.isModalSubmit()) {
      if (!interaction.customId.startsWith("time_modal_")) return;

      const dateKey = interaction.customId.slice("time_modal_".length);

      const data = load();
      const key = `${interaction.guild.id}_${interaction.channel.id}`;
      const schedule = data[key];

      if (!schedule) {
        return interaction.reply({
          content: "スケジュールが存在しません",
          ephemeral: true,
        });
      }

      const date = schedule.dates.find((d) => d.key === dateKey);
      if (!date) {
        return interaction.reply({
          content: "開催日データが見つかりません",
          ephemeral: true,
        });
      }

      const userId = interaction.user.id;
      const isAllowed =
        !schedule.allowedUserIds ||
        schedule.allowedUserIds.length === 0 ||
        schedule.allowedUserIds.includes(userId);

      if (!isAllowed) {
        return interaction.reply({
          content: "参加対象のメンバーのみ操作できます。",
          ephemeral: true,
        });
      }

      const raw = interaction.fields.getTextInputValue("time_range_input");
      const parsed = parseTimeRange(raw);

      if (!parsed) {
        return interaction.reply({
          content:
            "形式が正しくありません。例: 17:00-21:00 / 16:30- / -22:00 / 空欄=終日（30分単位で入力してください）",
          ephemeral: true,
        });
      }

      if (!date.participants.some((p) => p.userId === userId)) {
        date.participants.push({
          userId,
          start: parsed.start,
          end: parsed.end,
        });
      }

      recomputeConfirmed(schedule);
      save(data);

      if (interaction.isFromMessage()) {
        await interaction.update({
          content: buildMessage(schedule),
          components: buildButtons(schedule.dates),
        });
      } else {
        await interaction.reply({ content: "登録しました", ephemeral: true });
      }
    }
  });
}

module.exports = { setupBossSchedule };
