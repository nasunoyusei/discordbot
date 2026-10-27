const {
  Events,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
} = require("discord.js");

// このロール以上（ロール一覧でこれと同じか上の位置）を持つ人だけ実行できる。管理者は常に可。
const MIN_ROLE_NAME = "副マス";

const DEFAULT_SECONDS = 10;

// 集合対象から外すVC（寝落ち用など）。サーバー設定のAFKチャンネルも自動で除外される。
// 名前の比較では引用符（" “ ” ＂）と空白を無視する。
const EXCLUDED_CHANNEL_NAMES = ['おやすみな"さい"'];

const normalizeName = (name) => name.replace(/["“”＂\s]/g, "");
const EXCLUDED_NORMALIZED = EXCLUDED_CHANNEL_NAMES.map(normalizeName);

function isExcludedChannel(channel) {
  if (!channel) return false;
  if (channel.id === channel.guild.afkChannelId) return true;
  return EXCLUDED_NORMALIZED.includes(normalizeName(channel.name));
}

// 同じサーバーで集合処理が二重に走らないようにするフラグ
let running = false;

function canExecute(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const minRole = member.guild.roles.cache.find((r) => r.name === MIN_ROLE_NAME);
  if (!minRole) return false;
  return member.roles.highest.position >= minRole.position;
}

// 移動対象：ターゲット以外のVCにいる人（Bot・AFK/除外チャンネルは除外）
function collectTargets(guild, target) {
  return guild.voiceStates.cache.filter(
    (vs) =>
      vs.channelId &&
      vs.channelId !== target.id &&
      !isExcludedChannel(vs.channel) &&
      vs.member &&
      !vs.member.user.bot,
  );
}

function setupGather(client) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "gather") return;

    const { guild, member } = interaction;

    if (!canExecute(member)) {
      return interaction.reply({
        content: `このコマンドは「${MIN_ROLE_NAME}」以上のロールを持つ人だけが使えます。`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // 移動先：VCのチャット欄で実行したらそのVC、それ以外は実行者が今いるVC
    const target = interaction.channel?.isVoiceBased()
      ? interaction.channel
      : member.voice.channel;

    if (!target) {
      return interaction.reply({
        content: "移動先のVCがわかりません。VCに入るか、VCのチャット欄で実行してください。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const me = guild.members.me;
    const perms = target.permissionsFor(me);
    if (!perms?.has([PermissionFlagsBits.MoveMembers, PermissionFlagsBits.Connect])) {
      return interaction.reply({
        content: `Botに 🔊${target.name} への「メンバーを移動」「接続」権限がありません。`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (running) {
      return interaction.reply({
        content: "別の集合処理が実行中です。終わってから再実行してください。",
        flags: MessageFlags.Ephemeral,
      });
    }

    const initialTargets = collectTargets(guild, target);
    if (initialTargets.size === 0) {
      return interaction.reply({
        content: `🔊${target.name} 以外のVCに誰もいません。`,
        flags: MessageFlags.Ephemeral,
      });
    }

    running = true;
    try {
      const seconds = interaction.options.getInteger("秒数") ?? DEFAULT_SECONDS;
      const moveAt = Math.floor(Date.now() / 1000) + seconds;

      const cancelId = `gather_cancel_${interaction.id}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(cancelId)
          .setLabel("キャンセル")
          .setStyle(ButtonStyle.Danger),
      );

      const response = await interaction.reply({
        content:
          `📢 ${initialTargets.size}人を 🔊**${target.name}** に集めます（<t:${moveAt}:R>）\n` +
          "キャンセルする場合は下のボタンを押してください。",
        components: [row],
        withResponse: true,
      });

      // 移動元の各VCのチャット欄にカウントダウンを投稿
      const byChannel = new Map();
      for (const vs of initialTargets.values()) {
        if (!byChannel.has(vs.channelId)) byChannel.set(vs.channelId, []);
        byChannel.get(vs.channelId).push(vs.member);
      }

      const notices = [];
      for (const [channelId, members] of byChannel) {
        const ch = guild.channels.cache.get(channelId);
        if (!ch?.isTextBased()) continue;
        try {
          const msg = await ch.send({
            content:
              `${members.map((m) => `<@${m.id}>`).join(" ")}\n` +
              `⏳ <t:${moveAt}:R> に 🔊**${target.name}** へ移動します（実行: <@${member.id}>）`,
            allowedMentions: { users: members.map((m) => m.id) },
          });
          notices.push(msg);
        } catch (e) {
          // Botがそのチャット欄に書き込めない場合は通知だけスキップ
          console.error(`カウントダウン通知失敗 (${ch.name}):`, e.message);
        }
      }

      // カウントダウン中のキャンセル待ち（実行可能な人なら誰でも押せる）
      let cancelledBy = null;
      try {
        const btn = await response.resource.message.awaitMessageComponent({
          componentType: ComponentType.Button,
          time: seconds * 1000,
          filter: async (i) => {
            if (i.customId !== cancelId) return false;
            if (canExecute(i.member)) return true;
            await i.reply({ content: "キャンセル権限がありません。", flags: MessageFlags.Ephemeral });
            return false;
          },
        });
        cancelledBy = btn.user;
        await btn.deferUpdate();
      } catch {
        // タイムアウト = カウントダウン終了
      }

      if (cancelledBy) {
        await interaction.editReply({
          content: `🚫 集合はキャンセルされました（<@${cancelledBy.id}>）`,
          components: [],
        });
        await Promise.allSettled(
          notices.map((m) => m.edit({ content: "🚫 移動はキャンセルされました。" })),
        );
        return;
      }

      // カウントダウン中の出入りを反映するため、移動直前に対象を取り直す
      const finalTargets = [...collectTargets(guild, target).values()];
      const results = await Promise.allSettled(
        finalTargets.map((vs) => vs.member.voice.setChannel(target, "gatherコマンド")),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const ng = results.length - ok;

      results.forEach((r, i) => {
        if (r.status === "rejected") {
          console.error(`移動失敗 (${finalTargets[i].member.user.tag}):`, r.reason?.message);
        }
      });

      await interaction.editReply({
        content:
          `✅ 🔊**${target.name}** に ${ok}人を移動しました` +
          (ng > 0 ? `（${ng}人は失敗：権限不足や直前の退出など）` : ""),
        components: [],
      });
      await Promise.allSettled(
        notices.map((m) => m.edit({ content: `✅ 🔊**${target.name}** へ移動しました。` })),
      );
    } finally {
      running = false;
    }
  });
}

module.exports = { setupGather };
