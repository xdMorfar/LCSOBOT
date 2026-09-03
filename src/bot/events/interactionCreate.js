import { Events } from 'discord.js';
import { handleButton, handleModal } from '../handlers/componentHandler.js';
import { errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { sendLog } from '../../services/logService.js';
import { logger } from '../../utils/logger.js';

export default {
  name: Events.InteractionCreate,
  async execute(interaction, context) {
    try {
      if (interaction.isChatInputCommand()) {
        const command = context.commands.get(interaction.commandName);
        if (!command) return;
        if (!interaction.inGuild()) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Server Only', 'This command can only be used in the LCSO Discord server.')] });
        await command.execute(interaction, context);
        await sendLog(interaction.guild, 'command', infoEmbed('Command Used', `<@${interaction.user.id}> used \`/${interaction.commandName}\` in <#${interaction.channelId}>.`));
      } else if (interaction.isButton()) {
        await handleButton(interaction, context);
      } else if (interaction.isModalSubmit()) {
        await handleModal(interaction, context);
      }
    } catch (error) {
      logger.error('Interaction error', { command: interaction.commandName, customId: interaction.customId, userId: interaction.user?.id, error: error.stack || error.message });
      const payload = { ephemeral: true, embeds: [errorEmbed('Something Went Wrong', 'The action could not be completed. The error has been logged.')] };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
    }
  },
};
