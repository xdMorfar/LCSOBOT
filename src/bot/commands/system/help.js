import { SlashCommandBuilder } from 'discord.js';
import { infoEmbed } from '../../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('help').setDescription('Show the LCSO bot command guide.'),
  async execute(interaction) {
    const e = infoEmbed('LCSO Bot Command Guide', 'All bot actions use slash commands. Permissions are based on LCSO deputy rank, with Discord administrators able to perform setup.').addFields(
      { name: 'Staff', value: '`/deputy` • `/promotion` • `/loa` • `/warn` • `/infraction` • `/guideline`' },
      { name: 'Operations', value: '`/activity` • `/training` • `/application` • `/ticket` • `/investigation` • `/appeal`' },
      { name: 'Moderation', value: '`/kick` • `/ban` • `/unban` • `/timeout` • `/purge`' },
      { name: 'Configuration', value: '`/config channel` • `/config role` • `/config requirement` • `/config view`' },
      { name: 'Dashboard', value: 'Use the Render web-service URL and sign in with Discord OAuth2.' },
    );
    return interaction.reply({ ephemeral: true, embeds: [e] });
  },
};
