import { SlashCommandBuilder } from 'discord.js';
import { Deputy } from '../../../database/models/Deputy.js';
import { LOA } from '../../../database/models/LOA.js';
import { Infraction } from '../../../database/models/Infraction.js';
import { Promotion } from '../../../database/models/Promotion.js';
import { RANKS } from '../../../config/constants.js';
import { requireRank } from '../../../services/permissionService.js';
import { syncRankRole, getActiveInfractionPoints } from '../../../services/rankService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../../utils/embeds.js';
import { discordDate, minutesToHours, truncate } from '../../../utils/format.js';

const rankChoices = RANKS.map((rank) => ({ name: rank, value: rank }));

export default {
  data: new SlashCommandBuilder()
    .setName('deputy')
    .setDescription('Manage LCSO deputy profiles.')
    .addSubcommand((s) => s.setName('add').setDescription('Add a deputy profile.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy to add').setRequired(true))
      .addStringOption((o) => o.setName('rank').setDescription('Starting rank').setRequired(true).addChoices(...rankChoices))
      .addStringOption((o) => o.setName('badge').setDescription('Badge/callsign number').setMaxLength(30)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a deputy profile.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy to remove').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('view').setDescription('View a deputy profile.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy (defaults to you)')))
    .addSubcommand((s) => s.setName('list').setDescription('List active deputies.')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      if (!await requireRank(interaction, 'Sergeant')) return;
      const user = interaction.options.getUser('member', true);
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Member Not Found', 'That user is not in this server.')] });
      const existing = await Deputy.findOne({ guildId: interaction.guildId, discordId: user.id });
      if (existing) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Profile Exists', `${user} already has a deputy profile.`)] });
      const rank = interaction.options.getString('rank', true);
      const badgeNumber = interaction.options.getString('badge');
      const deputy = await Deputy.create({ guildId: interaction.guildId, discordId: user.id, displayName: member.displayName, rank, badgeNumber, createdBy: interaction.user.id });
      await syncRankRole(interaction.guild, deputy);
      const e = successEmbed('Deputy Added', `${user} was added to the LCSO roster.`).addFields(
        { name: 'Rank', value: rank, inline: true },
        { name: 'Badge', value: badgeNumber || 'Not set', inline: true },
        { name: 'Profile ID', value: `\`${deputy._id}\`` },
      );
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'member', e);
      return;
    }

    if (sub === 'remove') {
      if (!await requireRank(interaction, 'Lieutenant')) return;
      const user = interaction.options.getUser('member', true);
      const reason = interaction.options.getString('reason', true);
      const deputy = await Deputy.findOne({ guildId: interaction.guildId, discordId: user.id });
      if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'That user does not have a deputy profile.')] });
      await Deputy.deleteOne({ _id: deputy._id });
      const settingsRoleIds = [];
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member) {
        const { getSettings } = await import('../../../services/settingsService.js');
        const settings = await getSettings(interaction.guildId);
        settingsRoleIds.push(...settings.rankRoles.values());
        if (settings.loaRoleId) settingsRoleIds.push(settings.loaRoleId);
        await member.roles.remove(settingsRoleIds.filter(Boolean), `Removed from LCSO: ${reason}`).catch(() => null);
      }
      const e = successEmbed('Deputy Removed', `${user} was removed from the active LCSO roster.`).addFields({ name: 'Reason', value: reason }, { name: 'Removed By', value: `${interaction.user}` });
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'member', e);
      return;
    }

    if (sub === 'view') {
      const user = interaction.options.getUser('member') || interaction.user;
      const deputy = await Deputy.findOne({ guildId: interaction.guildId, discordId: user.id });
      if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'No deputy profile exists for that user.')] });
      const [points, loa, infractions, promotions] = await Promise.all([
        getActiveInfractionPoints(interaction.guildId, user.id),
        LOA.findOne({ guildId: interaction.guildId, discordId: user.id, status: { $in: ['Pending', 'Approved', 'Active'] } }).sort({ createdAt: -1 }),
        Infraction.countDocuments({ guildId: interaction.guildId, discordId: user.id, active: true }),
        Promotion.countDocuments({ guildId: interaction.guildId, discordId: user.id, status: 'Completed' }),
      ]);
      const e = infoEmbed('Deputy Profile', `${user}`).addFields(
        { name: 'Rank', value: deputy.rank, inline: true },
        { name: 'Badge', value: deputy.badgeNumber || 'Not set', inline: true },
        { name: 'Status', value: deputy.status, inline: true },
        { name: 'Joined', value: discordDate(deputy.joinDate), inline: true },
        { name: 'Activity', value: minutesToHours(deputy.totalActivityMinutes), inline: true },
        { name: 'Infraction Points', value: `${points} (${infractions} active)`, inline: true },
        { name: 'Promotion Records', value: String(promotions), inline: true },
        { name: 'Current LOA', value: loa ? `${loa.status} • ${discordDate(loa.startDate)} → ${discordDate(loa.endDate)}` : 'None', inline: false },
      );
      if (deputy.notes) e.addFields({ name: 'Notes', value: truncate(deputy.notes, 1000) });
      return interaction.reply({ embeds: [e] });
    }

    if (sub === 'list') {
      const deputies = await Deputy.find({ guildId: interaction.guildId }).sort({ rank: 1, displayName: 1 }).limit(100);
      if (!deputies.length) return interaction.reply({ embeds: [infoEmbed('LCSO Roster', 'No deputy profiles have been created yet.')] });
      const text = deputies.map((d) => `• <@${d.discordId}> — **${d.rank}**${d.badgeNumber ? ` • ${d.badgeNumber}` : ''} • ${d.status}`).join('\n');
      return interaction.reply({ embeds: [infoEmbed(`LCSO Roster • ${deputies.length}`, truncate(text, 3900))] });
    }
  },
};
