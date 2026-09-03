import { SlashCommandBuilder } from 'discord.js';
import { requireRank } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('purge').setDescription('Bulk-delete recent messages in this channel.')
    .addIntegerOption((o) => o.setName('amount').setDescription('Number of recent messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((o) => o.setName('member').setDescription('Only delete messages from this member')),
  async execute(interaction) {
    if (!await requireRank(interaction, 'Corporal')) return;
    if (!interaction.channel?.isTextBased() || typeof interaction.channel.bulkDelete !== 'function') return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Unsupported Channel', 'Messages cannot be purged in this channel.')] });
    await interaction.deferReply({ ephemeral: true });
    const amount = interaction.options.getInteger('amount', true);
    const user = interaction.options.getUser('member');
    let deleted;
    if (!user) {
      deleted = await interaction.channel.bulkDelete(amount, true);
    } else {
      const fetched = await interaction.channel.messages.fetch({ limit: 100 });
      const matching = fetched.filter((m) => m.author.id === user.id).first(amount);
      deleted = await interaction.channel.bulkDelete(matching, true);
    }
    const e = successEmbed('Messages Purged', `Deleted **${deleted.size}** recent message(s)${user ? ` from ${user}` : ''}. Messages older than Discord's bulk-delete limit are skipped.`);
    await interaction.editReply({ embeds: [e] });
    await sendLog(interaction.guild, 'moderation', e.addFields({ name: 'Moderator', value: `${interaction.user}` }, { name: 'Channel', value: `<#${interaction.channelId}>` }));
  },
};
