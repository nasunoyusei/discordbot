const { Events, EmbedBuilder } = require("discord.js");

function parsePrice(input) {
  const value = input.toLowerCase().trim();

  if (value.endsWith("g")) {
    return parseFloat(value.slice(0, -1)) * 1_000_000_000;
  }

  if (value.endsWith("m")) {
    return parseFloat(value.slice(0, -1)) * 1_000_000;
  }

  return parseInt(value.replace(/,/g, ""));
}

function formatG(num) {
  return (num / 1_000_000_000).toFixed(2);
}

function setupDistribution(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "分配") return;

    const item = interaction.options.getString("商品名");
    const rawPrice = interaction.options.getString("出品金額");
    const members = interaction.options.getInteger("人数");

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
        { name: "商品名", value: item, inline: true },
        { name: "売却額", value: `${formatG(price)} g`, inline: true },
        { name: "PT人数", value: `${members} 人`, inline: true },

        {
          name: "各メンバー出品額",
          value: `**${formatG(sellPrice)} g**\n\`${sellPrice}\``,
          inline: false,
        },

        {
          name: "各メンバー受取額",
          value: `${formatG(finalShare)} g`,
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
