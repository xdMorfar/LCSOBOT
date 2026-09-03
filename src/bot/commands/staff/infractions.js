import { SlashCommandBuilder } from 'discord.js';
import { Infraction } from '../../../database/models/Infraction.js';
import { infoEmbed } from '../../../utils/embeds.js';
import { discordDate, truncate } from '../../../utils/format.js';

export default {
  data: new SlashCommandBuilder()
    .setName('infractions')
    .setDescription('View a deputy’s disciplinary history.')
    .addUserOption((o) => o.setName('member').setDescription('Deputy').setRequired(true))
    .addBooleanOption((o) => o.setName('active_only').setDescription('Show only active infractions')),
  async execute(interaction) {
    const user = interaction.options.getUser('member', true);
    const query = { guildId: interaction.guildId, discordId: user.id };
    if (interaction.options.getBoolean('active_only')) query.active = true;
    const rows = await Infraction.find(query).sort({ createdAt: -1 }).limit(20);
    const body = rows.length
      ? rows.map((x) => `• \`${x._id}\` ${discordDate(x.createdAt, 'd')} — **${x.type}** • ${x.points} pts • ${x.active ? 'Active' : 'Removed'}\n  ${truncate(x.reason, 180)}`).join('\n')
      : 'No infractions found.';
    return interaction.reply({ embeds: [infoEmbed(`Disciplinary History • ${user.username}`, truncate(body, 3900))] });
  },
};
