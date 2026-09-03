import { SlashCommandBuilder } from 'discord.js';
import { Training } from '../../../database/models/Training.js';
import { Deputy } from '../../../database/models/Deputy.js';
import { Activity } from '../../../database/models/Activity.js';
import { requireRank } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, infoEmbed, successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { discordDate, hoursToMinutes, minutesToHours, parseDate, truncate } from '../../../utils/format.js';
import { validObjectId } from '../../../utils/ids.js';

export default {
  data: new SlashCommandBuilder()
    .setName('training')
    .setDescription('Request and manage LCSO training.')
    .addSubcommand((s) => s.setName('request').setDescription('Request a training session.')
      .addStringOption((o) => o.setName('type').setDescription('Training type').setRequired(true).setMaxLength(100))
      .addUserOption((o) => o.setName('instructor').setDescription('Preferred instructor'))
      .addStringOption((o) => o.setName('notes').setDescription('Notes').setMaxLength(1500)))
    .addSubcommand((s) => s.setName('approve').setDescription('Approve or deny a training request.')
      .addStringOption((o) => o.setName('id').setDescription('Training ID').setRequired(true))
      .addStringOption((o) => o.setName('decision').setDescription('Decision').setRequired(true).addChoices({ name: 'Approve', value: 'approve' }, { name: 'Deny', value: 'deny' }))
      .addUserOption((o) => o.setName('instructor').setDescription('Assigned instructor'))
      .addStringOption((o) => o.setName('date').setDescription('Scheduled date YYYY-MM-DD')))
    .addSubcommand((s) => s.setName('complete').setDescription('Mark a training as completed.')
      .addStringOption((o) => o.setName('id').setDescription('Training ID').setRequired(true))
      .addNumberOption((o) => o.setName('hours').setDescription('Training duration in hours').setRequired(true).setMinValue(0.1).setMaxValue(24))
      .addStringOption((o) => o.setName('notes').setDescription('Completion notes').setMaxLength(1500)))
    .addSubcommand((s) => s.setName('list').setDescription('List training records.')
      .addStringOption((o) => o.setName('status').setDescription('Status').addChoices(
        { name: 'Pending', value: 'Pending' }, { name: 'Approved', value: 'Approved' }, { name: 'Completed', value: 'Completed' }, { name: 'Denied', value: 'Denied' },
      ))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'request') {
      const deputy = await Deputy.findOne({ guildId: interaction.guildId, discordId: interaction.user.id });
      if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Deputy Profile Required', 'You need a deputy profile to request training.')] });
      const training = await Training.create({ guildId: interaction.guildId, traineeId: deputy._id, traineeDiscordId: interaction.user.id, type: interaction.options.getString('type', true), requestedInstructorId: interaction.options.getUser('instructor')?.id || null, requestedBy: interaction.user.id, notes: interaction.options.getString('notes') || '' });
      const e = infoEmbed('Training Requested', `${interaction.user} requested **${training.type}** training.`).addFields({ name: 'Training ID', value: `\`${training._id}\`` }, { name: 'Preferred Instructor', value: training.requestedInstructorId ? `<@${training.requestedInstructorId}>` : 'Any' });
      await interaction.reply({ ephemeral: true, embeds: [e] });
      await sendLog(interaction.guild, 'training', e);
      return;
    }

    if (sub === 'approve') {
      if (!await requireRank(interaction, 'Sergeant')) return;
      const id = interaction.options.getString('id', true);
      if (!validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid ID', 'Training ID is invalid.')] });
      const training = await Training.findOne({ _id: id, guildId: interaction.guildId, status: 'Pending' });
      if (!training) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Pending training request not found.')] });
      const approved = interaction.options.getString('decision', true) === 'approve';
      training.status = approved ? 'Approved' : 'Denied';
      training.reviewedBy = interaction.user.id;
      training.reviewedAt = new Date();
      training.instructorId = interaction.options.getUser('instructor')?.id || training.requestedInstructorId || interaction.user.id;
      const date = interaction.options.getString('date');
      if (date) {
        training.scheduledFor = parseDate(date);
        if (!training.scheduledFor) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid Date', 'Use **YYYY-MM-DD**.')] });
      }
      await training.save();
      const e = (approved ? successEmbed : warningEmbed)(approved ? 'Training Approved' : 'Training Denied', `<@${training.traineeDiscordId}>'s **${training.type}** request was ${approved ? 'approved' : 'denied'}.`).addFields({ name: 'Instructor', value: approved ? `<@${training.instructorId}>` : 'N/A' }, { name: 'Scheduled', value: training.scheduledFor ? discordDate(training.scheduledFor) : 'To be arranged' });
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'training', e);
      return;
    }

    if (sub === 'complete') {
      if (!await requireRank(interaction, 'Sergeant')) return;
      const id = interaction.options.getString('id', true);
      if (!validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid ID', 'Training ID is invalid.')] });
      const training = await Training.findOne({ _id: id, guildId: interaction.guildId, status: 'Approved' });
      if (!training) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Approved training record not found.')] });
      const minutes = hoursToMinutes(interaction.options.getNumber('hours', true));
      training.status = 'Completed';
      training.completedAt = new Date();
      training.durationMinutes = minutes;
      training.notes = interaction.options.getString('notes') || training.notes;
      await training.save();
      const deputy = await Deputy.findById(training.traineeId);
      if (deputy) {
        deputy.totalActivityMinutes += minutes;
        await deputy.save();
        await Activity.create({ guildId: interaction.guildId, deputyId: deputy._id, discordId: deputy.discordId, type: 'Training', durationMinutes: minutes, occurredAt: training.completedAt, notes: `Training completion: ${training.type}`, loggedBy: interaction.user.id });
      }
      const e = successEmbed('Training Completed', `<@${training.traineeDiscordId}> completed **${training.type}** training.`).addFields({ name: 'Duration', value: minutesToHours(minutes), inline: true }, { name: 'Instructor', value: training.instructorId ? `<@${training.instructorId}>` : `${interaction.user}`, inline: true });
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'training', e);
      return;
    }

    if (sub === 'list') {
      if (!await requireRank(interaction, 'Corporal')) return;
      const query = { guildId: interaction.guildId };
      const status = interaction.options.getString('status');
      if (status) query.status = status;
      const rows = await Training.find(query).sort({ createdAt: -1 }).limit(20);
      const body = rows.length ? rows.map((t) => `• \`${t._id}\` <@${t.traineeDiscordId}> — **${t.type}** • ${t.status}${t.durationMinutes ? ` • ${minutesToHours(t.durationMinutes)}` : ''}\n  ${truncate(t.notes, 150)}`).join('\n') : 'No training records found.';
      return interaction.reply({ embeds: [infoEmbed(`Training Records${status ? ` • ${status}` : ''}`, truncate(body, 3900))] });
    }
  },
};
