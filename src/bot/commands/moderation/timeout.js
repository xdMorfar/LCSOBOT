import { SlashCommandBuilder } from 'discord.js';
import { requireRank, canModerateTarget } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, successEmbed } from '../../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('timeout').setDescription('Timeout or remove timeout from a member.')
    .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes (0 removes timeout)').setRequired(true).setMinValue(0).setMaxValue(40320))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000)),
  async execute(interaction) {
    if (!await requireRank(interaction, 'Sergeant')) return;
    const member = await interaction.guild.members.fetch(interaction.options.getUser('member', true).id).catch(() => null);
    const check = canModerateTarget(interaction.member, member);
    if (!check.ok) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Cannot Timeout Member', check.reason)] });
    if (!member.moderatable) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Cannot Timeout Member', 'Discord does not allow me to moderate this member.')] });
    const minutes = interaction.options.getInteger('minutes', true);
    const reason = interaction.options.getString('reason', true);
    await member.timeout(minutes === 0 ? null : minutes * 60000, `${reason} | By ${interaction.user.tag}`);
    const e = successEmbed(minutes === 0 ? 'Timeout Removed' : 'Member Timed Out', minutes === 0 ? `${member} is no longer timed out.` : `${member} was timed out for **${minutes} minute(s)**.`).addFields({ name: 'Reason', value: reason }, { name: 'Moderator', value: `${interaction.user}` });
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, 'moderation', e);
  },
};
