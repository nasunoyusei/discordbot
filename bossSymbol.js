const { Events, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "bossSymbolData.json");

function loadBossData() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

// アーケインフォース：保有率ごとの与ダメ倍率（要求値に対する割合）
const ARCANE_THRESHOLDS = [
  { label: "100%（基準）", ratio: 1.0 },
  { label: "110%", ratio: 1.1 },
  { label: "130%", ratio: 1.3 },
  { label: "150%（上限）", ratio: 1.5 },
];

// オーセンティックフォース：要求値との差分ごとの与ダメ倍率
const AUTHENTIC_THRESHOLDS = [
  { label: "±0（基準）", diff: 0 },
  { label: "+10", diff: 10 },
  { label: "+20", diff: 20 },
  { label: "+30", diff: 30 },
  { label: "+40", diff: 40 },
  { label: "+50（上限）", diff: 50 },
];

function buildArcaneField(required) {
  const lines = ARCANE_THRESHOLDS.map(
    (t) => `${t.label}: ${Math.ceil(required * t.ratio)}`,
  );
  return lines.join("\n");
}

function buildAuthenticField(required) {
  const lines = AUTHENTIC_THRESHOLDS.map(
    (t) => `${t.label}: ${required + t.diff}`,
  );
  return lines.join("\n");
}

function buildBossEmbed(boss) {
  const isArcane = boss.type === "arcane";
  const forceLabel = isArcane ? "ARC" : "AUT";
  const capLabel = isArcane ? "150%で最終ダメ1.5倍（上限）" : "+50で最終ダメ1.25倍（上限）";

  const embed = new EmbedBuilder()
    .setTitle(`🔯 ${boss.name} - 必要${forceLabel}シンボル`)
    .setDescription(`要求値を超えると最終ダメージが増加し、${capLabel}になります。`)
    .setColor(isArcane ? 0x8e44ad : 0xe67e22);

  for (const req of boss.requirements) {
    const fieldValue = isArcane
      ? buildArcaneField(req.required)
      : buildAuthenticField(req.required);

    embed.addFields({
      name: `${req.difficulty}（必要${forceLabel}: ${req.required}）`,
      value: fieldValue,
      inline: true,
    });
  }

  if (!boss.verified) {
    embed.addFields({
      name: "⚠️ 未検証データ",
      value: boss.note || "この数値は未検証です。実際のゲーム内表示と異なる可能性があります。",
      inline: false,
    });
  }

  return embed;
}

function setupBossSymbol(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "boss") return;
    if (interaction.options.getSubcommand() !== "symbol") return;

    const bossId = interaction.options.getString("ボス");

    let bossData;
    try {
      bossData = loadBossData();
    } catch (e) {
      return interaction.reply({
        content: "シンボルデータの読み込みに失敗しました。",
        ephemeral: true,
      });
    }

    const boss = bossData.find((b) => b.id === bossId);

    if (!boss) {
      return interaction.reply({
        content: "該当するボスが見つかりません。",
        ephemeral: true,
      });
    }

    const embed = buildBossEmbed(boss);

    await interaction.reply({ embeds: [embed] });
  });
}

module.exports = { setupBossSymbol };
