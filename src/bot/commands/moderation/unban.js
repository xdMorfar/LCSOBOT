import { SlashCommandBuilder } from 'discord.js';
import { requireRank } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('unban').setDescription('Unban a user by Discord user ID.')
    .addStringOption((o) => o.setName('user_id').setDescription('Discord user ID').setRequired(true).setMinLength(15).setMaxLength(25))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000)),
  async execute(interaction) {
    if (!await requireRank(interaction, 'Lieutenant')) return;
    const userId = interaction.options.getString('user_id', true);
    if (!/^\d{15,25}$/.test(userId)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid User ID', 'Enter a valid numeric Discord user ID.')] });
    const ban = await interaction.guild.bans.fetch(userId).catch(() => null);
    if (!ban) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('User Not Banned', 'That user is not currently banned from this server.')] });
    const reason = interaction.options.getString('reason', true);
    await interaction.guild.members.unban(userId, `${reason} | By ${interaction.user.tag}`);
    const e = successEmbed('User Unbanned', `**${ban.user.tag}** (${userId}) was unbanned.`).addFields({ name: 'Reason', value: reason }, { name: 'Moderator', value: `${interaction.user}` });
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, 'moderation', e);
  },
};
