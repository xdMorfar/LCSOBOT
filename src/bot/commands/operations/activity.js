import { SlashCommandBuilder } from 'discord.js';
import { Activity } from '../../../database/models/Activity.js';
import { Deputy } from '../../../database/models/Deputy.js';
import { ACTIVITY_TYPES } from '../../../config/constants.js';
import { requireRank } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../../utils/embeds.js';
import { hoursToMinutes, minutesToHours, monthBounds, parseDate, truncate } from '../../../utils/format.js';

const activityChoices = ACTIVITY_TYPES.map((type) => ({ name: type, value: type }));

export default {
  data: new SlashCommandBuilder()
    .setName('activity')
    .setDescription('Track department activity.')
    .addSubcommand((s) => s.setName('add').setDescription('Log patrol, training, ride-along or event activity.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy').setRequired(true))
      .addStringOption((o) => o.setName('type').setDescription('Activity type').setRequired(true).addChoices(...activityChoices))
      .addNumberOption((o) => o.setName('hours').setDescription('Duration in hours').setRequired(true).setMinValue(0.1).setMaxValue(24))
      .addStringOption((o) => o.setName('date').setDescription('Date YYYY-MM-DD (defaults to today)'))
      .addStringOption((o) => o.setName('notes').setDescription('Notes').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('stats').setDescription('View a deputy’s activity statistics.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy (defaults to you)'))
      .addStringOption((o) => o.setName('month').setDescription('Month YYYY-MM (defaults to current month)')))
    .addSubcommand((s) => s.setName('leaderboard').setDescription('View monthly activity leaderboard.')
      .addStringOption((o) => o.setName('month').setDescription('Month YYYY-MM'))
      .addStringOption((o) => o.setName('type').setDescription('Filter by activity type').addChoices(...activityChoices))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      if (!await requireRank(interaction, 'Corporal')) return;
      const user = interaction.options.getUser('member', true);
      const deputy = await Deputy.findOne({ guildId: interaction.guildId, discordId: user.id });
      if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Deputy Not Found', 'That member does not have a deputy profile.')] });
      const dateInput = interaction.options.getString('date');
      const occurredAt = dateInput ? parseDate(dateInput) : new Date();
      if (!occurredAt) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid Date', 'Use **YYYY-MM-DD**.')] });
      const durationMinutes = hoursToMinutes(interaction.options.getNumber('hours', true));
      const record = await Activity.create({ guildId: interaction.guildId, deputyId: deputy._id, discordId: user.id, type: interaction.options.getString('type', true), durationMinutes, occurredAt, notes: interaction.options.getString('notes') || '', loggedBy: interaction.user.id });
      deputy.totalActivityMinutes += durationMinutes;
      await deputy.save();
      const e = successEmbed('Activity Logged', `${minutesToHours(durationMinutes)} of **${record.type}** activity was logged for ${user}.`).addFields({ name: 'Total Activity', value: minutesToHours(deputy.totalActivityMinutes), inline: true }, { name: 'Logged By', value: `${interaction.user}`, inline: true }, { name: 'Activity ID', value: `\`${record._id}\`` });
      if (record.notes) e.addFields({ name: 'Notes', value: record.notes });
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'activity', e);
      return;
    }

    const bounds = monthBounds(interaction.options.getString('month'));
    if (!bounds) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid Month', 'Use **YYYY-MM**.')] });

    if (sub === 'stats') {
      const user = interaction.options.getUser('member') || interaction.user;
      const deputy = await Deputy.findOne({ guildId: interaction.guildId, discordId: user.id });
      if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Deputy Not Found', 'No deputy profile exists for that user.')] });
      const rows = await Activity.aggregate([
        { $match: { guildId: interaction.guildId, discordId: user.id, occurredAt: { $gte: bounds.start, $lt: bounds.end } } },
        { $group: { _id: '$type', minutes: { $sum: '$durationMinutes' }, entries: { $sum: 1 } } },
        { $sort: { minutes: -1 } },
      ]);
      const monthTotal = rows.reduce((sum, row) => sum + row.minutes, 0);
      const e = infoEmbed(`Activity Statistics • ${bounds.label}`, `${user}`).addFields(
        { name: 'Monthly Total', value: minutesToHours(monthTotal), inline: true },
        { name: 'All-Time Total', value: minutesToHours(deputy.totalActivityMinutes), inline: true },
      );
      if (rows.length) e.addFields({ name: 'Breakdown', value: rows.map((r) => `**${r._id}:** ${minutesToHours(r.minutes)} (${r.entries} entries)`).join('\n') });
      return interaction.reply({ embeds: [e] });
    }

    if (sub === 'leaderboard') {
      const type = interaction.options.getString('type');
      const match = { guildId: interaction.guildId, occurredAt: { $gte: bounds.start, $lt: bounds.end } };
      if (type) match.type = type;
      const rows = await Activity.aggregate([
        { $match: match },
        { $group: { _id: '$discordId', minutes: { $sum: '$durationMinutes' } } },
        { $sort: { minutes: -1 } },
        { $limit: 15 },
      ]);
      const body = rows.length ? rows.map((r, i) => `**${i + 1}.** <@${r._id}> — ${minutesToHours(r.minutes)}`).join('\n') : 'No activity was logged for this period.';
      return interaction.reply({ embeds: [infoEmbed(`Activity Leaderboard • ${bounds.label}${type ? ` • ${type}` : ''}`, truncate(body, 3900))] });
    }
  },
};
