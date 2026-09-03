import { SlashCommandBuilder } from 'discord.js';
import { requireRank, canModerateTarget } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('kick').setDescription('Kick a member from the server.')
    .addUserOption((o) => o.setName('member').setDescription('Member to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000)),
  async execute(interaction) {
    if (!await requireRank(interaction, 'Sergeant')) return;
    const member = await interaction.guild.members.fetch(interaction.options.getUser('member', true).id).catch(() => null);
    const check = canModerateTarget(interaction.member, member);
    if (!check.ok) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Cannot Kick Member', check.reason)] });
    if (!member.kickable) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Cannot Kick Member', 'Discord does not allow me to kick this member. Check my role position and permissions.')] });
    const reason = interaction.options.getString('reason', true);
    await member.kick(`${reason} | By ${interaction.user.tag}`);
    const e = successEmbed('Member Kicked', `**${member.user.tag}** (${member.id}) was kicked.`).addFields({ name: 'Reason', value: reason }, { name: 'Moderator', value: `${interaction.user}` });
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, 'moderation', e);
  },
};
