const { Events, EmbedBuilder } = require("discord.js");

function parsePrice(input) {
  if (!input) return NaN;
  const value = input.toLowerCase().trim();

  if (value.endsWith("g")) {
    return parseFloat(value.slice(0, -1)) * 1_000_000_000;
  }

  if (value.endsWith("m")) {
    return parseFloat(value.slice(0, -1)) * 1_000_000;
  }

  return parseInt(value.replace(/,/g, ""));
}

function formatReadable(num) {
  const g = num / 1_000_000_000;

  if (g >= 1) {
    return `約${g.toFixed(2)}g`;
  }

  const m = num / 1_000_000;
  return `約${m.toFixed(0)}m`;
}

function setupDistribution(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "distribution") return;

    const item = interaction.options.getString("item");
    const rawPrice = interaction.options.getString("price");
    const members = interaction.options.getInteger("members");

    if (members < 2 || members > 10) {
      return interaction.reply({
        content: "PT人数は2～10人で入力してください。",
        ephemeral: true,
      });
    }

    const price = parsePrice(rawPrice);

    if (isNaN(price) || price <= 0) {
      return interaction.reply({
        content: "金額の形式が正しくありません。",
        ephemeral: true,
      });
    }

    // メンション収集
    const users = [];
    for (let i = 1; i <= 9; i++) {
      const user = interaction.options.getUser(`user${i}`);
      if (user) users.push(user);
    }

    const required = members - 1;

    // ❌ チェック
    if (users.length < required) {
      return interaction.reply({
        content: `❌ メンション人数が足りません。\n必要: ${required}人\n現在: ${users.length}人`,
        ephemeral: true,
      });
    }

    const mentions = users
      .slice(0, required)
      .map((u) => `<@${u.id}>`)
      .join(" ");

    // 計算
    const sellPrice = Math.floor((0.97 * price) / (members - 0.03));
    const finalShare = Math.floor(sellPrice * 0.97);

    const embed = new EmbedBuilder()
      .setTitle("💰 メル分配計算")
      .addFields(
        { name: "出品した商品名", value: item, inline: true },
        { name: "出品した額", value: `${formatG(price)} g`, inline: true },
        {
          name: "分配する人数（2~10人）",
          value: `${members} 人`,
          inline: true,
        },

        {
          name: "各メンバー出品額",
          value: `**${formatReadable(sellPrice)}**\n\`${sellPrice}\``,
          inline: false,
        },

        {
          name: "各メンバー受取額",
          value: `**${formatReadable(finalShare)}**\n\`${finalShare}\``,
          inline: false,
        },
      )
      .setColor(0x00ae86);

    await interaction.reply({
      content: mentions,
      embeds: [embed],
    });
  });
}

module.exports = { setupDistribution };
