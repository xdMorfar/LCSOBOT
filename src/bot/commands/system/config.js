import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { LOG_TYPES, RANKS } from '../../../config/constants.js';
import { getSettings } from '../../../services/settingsService.js';
import { infoEmbed, successEmbed, errorEmbed } from '../../../utils/embeds.js';
import { truncate } from '../../../utils/format.js';

const logChoices = LOG_TYPES.map((x) => ({ name: `${x} log`, value: `log:${x}` }));
const rankChoices = RANKS.map((rank) => ({ name: rank, value: rank }));

export default {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the LCSO bot for this server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('channel').setDescription('Set a channel or category.')
      .addStringOption((o) => o.setName('kind').setDescription('Configuration field').setRequired(true).addChoices(
        { name: 'Ticket category', value: 'ticketCategoryId' },
        { name: 'Application category', value: 'applicationCategoryId' },
        { name: 'Internal Affairs category', value: 'internalAffairsCategoryId' },
        { name: 'Guideline channel', value: 'guidelineChannelId' },
        ...logChoices,
      ))
      .addChannelOption((o) => o.setName('channel').setDescription('Channel/category').setRequired(true)))
    .addSubcommand((s) => s.setName('role').setDescription('Set a department role.')
      .addStringOption((o) => o.setName('kind').setDescription('Role type').setRequired(true).addChoices(
        { name: 'LOA role', value: 'loaRoleId' },
        { name: 'Staff ticket role', value: 'staffRoleId' },
        { name: 'Internal Affairs role', value: 'internalAffairsRoleId' },
        { name: 'Rank role', value: 'rankRole' },
      ))
      .addRoleOption((o) => o.setName('role').setDescription('Discord role').setRequired(true))
      .addStringOption((o) => o.setName('rank').setDescription('Required when kind = Rank role').addChoices(...rankChoices)))
    .addSubcommand((s) => s.setName('requirement').setDescription('Configure promotion requirements for a rank.')
      .addStringOption((o) => o.setName('rank').setDescription('Target rank').setRequired(true).addChoices(...rankChoices))
      .addNumberOption((o) => o.setName('activity_hours').setDescription('Minimum all-time activity hours').setRequired(true).setMinValue(0).setMaxValue(10000))
      .addIntegerOption((o) => o.setName('max_points').setDescription('Maximum active infraction points').setRequired(true).setMinValue(0).setMaxValue(999))
      .addIntegerOption((o) => o.setName('min_days').setDescription('Minimum days in department').setRequired(true).setMinValue(0).setMaxValue(3650)))
    .addSubcommand((s) => s.setName('view').setDescription('View current bot configuration.')),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Administrator Required', 'Only Discord administrators can change bot configuration.')] });
    }
    const sub = interaction.options.getSubcommand();
    const settings = await getSettings(interaction.guildId);

    if (sub === 'channel') {
      const kind = interaction.options.getString('kind', true);
      const channel = interaction.options.getChannel('channel', true);
      if (kind.startsWith('log:')) settings.logChannels.set(kind.slice(4), channel.id);
      else settings[kind] = channel.id;
      await settings.save();
      return interaction.reply({ embeds: [successEmbed('Configuration Updated', `**${kind}** is now set to ${channel}.`)] });
    }

    if (sub === 'role') {
      const kind = interaction.options.getString('kind', true);
      const role = interaction.options.getRole('role', true);
      if (kind === 'rankRole') {
        const rank = interaction.options.getString('rank');
        if (!rank) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Rank Required', 'Select a rank when configuring a rank role.')] });
        settings.rankRoles.set(rank, role.id);
      } else settings[kind] = role.id;
      await settings.save();
      return interaction.reply({ embeds: [successEmbed('Configuration Updated', kind === 'rankRole' ? `**${interaction.options.getString('rank')}** is mapped to ${role}.` : `**${kind}** is now set to ${role}.`)] });
    }

    if (sub === 'requirement') {
      const rank = interaction.options.getString('rank', true);
      const item = settings.rankRequirements.find((x) => x.rank === rank);
      const values = {
        minActivityMinutes: Math.round(interaction.options.getNumber('activity_hours', true) * 60),
        maxInfractionPoints: interaction.options.getInteger('max_points', true),
        minDaysInDepartment: interaction.options.getInteger('min_days', true),
      };
      if (item) Object.assign(item, values);
      else settings.rankRequirements.push({ rank, ...values });
      await settings.save();
      return interaction.reply({ embeds: [successEmbed('Rank Requirements Updated', `**${rank}** now requires **${(values.minActivityMinutes / 60).toFixed(1)}h** activity, at most **${values.maxInfractionPoints}** active infraction points, and **${values.minDaysInDepartment}** days in the department.`)] });
    }

    const logs = [...settings.logChannels.entries()].map(([k, v]) => `${k}: <#${v}>`).join('\n') || 'None configured';
    const rankRoles = [...settings.rankRoles.entries()].map(([k, v]) => `${k}: <@&${v}>`).join('\n') || 'None configured';
    const e = infoEmbed('LCSO Bot Configuration', 'Use `/config channel`, `/config role`, and `/config requirement` to change these values.').addFields(
      { name: 'Ticket Category', value: settings.ticketCategoryId ? `<#${settings.ticketCategoryId}>` : 'Not set', inline: true },
      { name: 'Application Category', value: settings.applicationCategoryId ? `<#${settings.applicationCategoryId}>` : 'Not set', inline: true },
      { name: 'IA Category', value: settings.internalAffairsCategoryId ? `<#${settings.internalAffairsCategoryId}>` : 'Not set', inline: true },
      { name: 'Guideline Channel', value: settings.guidelineChannelId ? `<#${settings.guidelineChannelId}>` : 'Not set', inline: true },
      { name: 'LOA Role', value: settings.loaRoleId ? `<@&${settings.loaRoleId}>` : 'Not set', inline: true },
      { name: 'Staff Role', value: settings.staffRoleId ? `<@&${settings.staffRoleId}>` : 'Not set', inline: true },
      { name: 'Internal Affairs Role', value: settings.internalAffairsRoleId ? `<@&${settings.internalAffairsRoleId}>` : 'Not set', inline: true },
      { name: 'Log Channels', value: truncate(logs, 1000) },
      { name: 'Rank Roles', value: truncate(rankRoles, 1000) },
    );
    return interaction.reply({ ephemeral: true, embeds: [e] });
  },
};
