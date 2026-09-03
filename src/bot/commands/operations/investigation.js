import { SlashCommandBuilder } from 'discord.js';
import { Investigation } from '../../../database/models/Investigation.js';
import { requireRank } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../../utils/embeds.js';
import { discordDate, truncate } from '../../../utils/format.js';
import { validObjectId } from '../../../utils/ids.js';

function caseNumber() {
  const year = new Date().getUTCFullYear();
  return `IA-${year}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName('investigation')
    .setDescription('Confidential Internal Affairs investigation management.')
    .addSubcommand((s) => s.setName('open').setDescription('Open an IA investigation.')
      .addUserOption((o) => o.setName('subject').setDescription('Investigation subject').setRequired(true))
      .addStringOption((o) => o.setName('summary').setDescription('Case summary').setRequired(true).setMaxLength(2000))
      .addUserOption((o) => o.setName('investigator').setDescription('Initial investigator')))
    .addSubcommand((s) => s.setName('assign').setDescription('Assign an investigator.')
      .addStringOption((o) => o.setName('id').setDescription('Investigation ID').setRequired(true))
      .addUserOption((o) => o.setName('investigator').setDescription('Investigator').setRequired(true)))
    .addSubcommand((s) => s.setName('close').setDescription('Close an investigation.')
      .addStringOption((o) => o.setName('id').setDescription('Investigation ID').setRequired(true))
      .addStringOption((o) => o.setName('outcome').setDescription('Investigation outcome').setRequired(true).setMaxLength(3000)))
    .addSubcommand((s) => s.setName('view').setDescription('View an investigation.')
      .addStringOption((o) => o.setName('id').setDescription('Investigation ID').setRequired(true)))
    .addSubcommand((s) => s.setName('list').setDescription('List investigations.')
      .addStringOption((o) => o.setName('status').setDescription('Status').addChoices({ name: 'Open', value: 'Open' }, { name: 'Closed', value: 'Closed' }))),

  async execute(interaction) {
    if (!await requireRank(interaction, 'Lieutenant')) return;
    const sub = interaction.options.getSubcommand();
    if (sub === 'open') {
      const subject = interaction.options.getUser('subject', true);
      const investigator = interaction.options.getUser('investigator');
      const record = await Investigation.create({ guildId: interaction.guildId, caseNumber: caseNumber(), subjectId: subject.id, openedBy: interaction.user.id, investigators: [investigator?.id || interaction.user.id], summary: interaction.options.getString('summary', true) });
      const e = infoEmbed('Internal Affairs Investigation Opened', `Case **${record.caseNumber}** was opened regarding ${subject}.`).addFields(
        { name: 'Investigator(s)', value: record.investigators.map((id) => `<@${id}>`).join(', ') },
        { name: 'Summary', value: record.summary },
        { name: 'Investigation ID', value: `\`${record._id}\`` },
      );
      await interaction.reply({ ephemeral: true, embeds: [e] });
      await sendLog(interaction.guild, 'investigation', e);
      return;
    }

    const id = interaction.options.getString('id');
    if (['assign', 'close', 'view'].includes(sub) && !validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid ID', 'Investigation ID is invalid.')] });
    const record = ['assign', 'close', 'view'].includes(sub) ? await Investigation.findOne({ _id: id, guildId: interaction.guildId }) : null;
    if (['assign', 'close', 'view'].includes(sub) && !record) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Investigation not found.')] });

    if (sub === 'assign') {
      const investigator = interaction.options.getUser('investigator', true);
      if (!record.investigators.includes(investigator.id)) record.investigators.push(investigator.id);
      await record.save();
      const e = successEmbed('Investigator Assigned', `${investigator} was assigned to **${record.caseNumber}**.`);
      await interaction.reply({ ephemeral: true, embeds: [e] });
      await sendLog(interaction.guild, 'investigation', e);
      return;
    }
    if (sub === 'close') {
      if (!await requireRank(interaction, 'Captain')) return;
      record.status = 'Closed';
      record.outcome = interaction.options.getString('outcome', true);
      record.closedBy = interaction.user.id;
      record.closedAt = new Date();
      await record.save();
      const e = successEmbed('Investigation Closed', `**${record.caseNumber}** was closed by ${interaction.user}.`).addFields({ name: 'Outcome', value: truncate(record.outcome, 1000) });
      await interaction.reply({ ephemeral: true, embeds: [e] });
      await sendLog(interaction.guild, 'investigation', e);
      return;
    }
    if (sub === 'view') {
      const e = infoEmbed(`IA Case • ${record.caseNumber}`, record.summary).addFields(
        { name: 'Subject', value: `<@${record.subjectId}>`, inline: true },
        { name: 'Status', value: record.status, inline: true },
        { name: 'Opened', value: discordDate(record.createdAt), inline: true },
        { name: 'Investigators', value: record.investigators.map((x) => `<@${x}>`).join(', ') || 'Unassigned' },
      );
      if (record.outcome) e.addFields({ name: 'Outcome', value: truncate(record.outcome, 1000) });
      return interaction.reply({ ephemeral: true, embeds: [e] });
    }

    const query = { guildId: interaction.guildId };
    const status = interaction.options.getString('status');
    if (status) query.status = status;
    const rows = await Investigation.find(query).sort({ createdAt: -1 }).limit(20);
    const body = rows.length ? rows.map((r) => `• \`${r._id}\` **${r.caseNumber}** • <@${r.subjectId}> • ${r.status}\n  ${truncate(r.summary, 150)}`).join('\n') : 'No investigations found.';
    return interaction.reply({ ephemeral: true, embeds: [infoEmbed(`IA Investigations${status ? ` • ${status}` : ''}`, truncate(body, 3900))] });
  },
};
