const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('boss')
    .setDescription('ボス管理')
    .addSubcommand(sub =>
      sub
        .setName('schedule')
        .setDescription('スケジュール作成')
        .addIntegerOption(opt =>
          opt.setName('人数')
            .setDescription('必要人数')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('reschedule')
        .setDescription('リスケジュール')
    )
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('コマンド登録中...');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID,process.env.GUILD_ID),
      { body: commands }
    );

    console.log('コマンド登録完了');
  } catch (error) {
    console.error(error);
  }
})();