import { SlashCommandBuilder } from 'discord.js';
import { requireRank, canModerateTarget } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('ban').setDescription('Ban a member from the server.')
    .addUserOption((o) => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000))
    .addIntegerOption((o) => o.setName('delete_days').setDescription('Delete recent messages (0-7 days)').setMinValue(0).setMaxValue(7)),
  async execute(interaction) {
    if (!await requireRank(interaction, 'Lieutenant')) return;
    const user = interaction.options.getUser('user', true);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const check = canModerateTarget(interaction.member, member);
      if (!check.ok) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Cannot Ban User', check.reason)] });
      if (!member.bannable) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Cannot Ban User', 'Discord does not allow me to ban this member. Check my role position and permissions.')] });
    }
    if (user.id === interaction.user.id) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Cannot Ban User', 'You cannot ban yourself.')] });
    const reason = interaction.options.getString('reason', true);
    const deleteDays = interaction.options.getInteger('delete_days') ?? 0;
    await interaction.guild.members.ban(user.id, { reason: `${reason} | By ${interaction.user.tag}`, deleteMessageSeconds: deleteDays * 86400 });
    const e = successEmbed('User Banned', `**${user.tag}** (${user.id}) was banned.`).addFields({ name: 'Reason', value: reason }, { name: 'Moderator', value: `${interaction.user}` });
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, 'moderation', e);
  },
};
