import { SlashCommandBuilder } from 'discord.js';
import { Appeal } from '../../../database/models/Appeal.js';
import { requireRank } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { createTicket } from '../../../services/ticketService.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../../utils/embeds.js';
import { discordDate, truncate } from '../../../utils/format.js';
import { validObjectId } from '../../../utils/ids.js';

export default {
  data: new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Track moderation appeals.')
    .addSubcommand((s) => s.setName('submit').setDescription('Submit an appeal.')
      .addStringOption((o) => o.setName('case').setDescription('Ban/moderation case reference').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('reason').setDescription('Why should the action be reconsidered?').setRequired(true).setMaxLength(1500)))
    .addSubcommand((s) => s.setName('review').setDescription('Review an appeal.')
      .addStringOption((o) => o.setName('id').setDescription('Appeal ID').setRequired(true))
      .addStringOption((o) => o.setName('decision').setDescription('Decision').setRequired(true).addChoices({ name: 'Accept', value: 'Accepted' }, { name: 'Deny', value: 'Denied' }))
      .addStringOption((o) => o.setName('reason').setDescription('Review reason').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('list').setDescription('List appeals.')
      .addStringOption((o) => o.setName('status').setDescription('Status').addChoices({ name: 'Pending', value: 'Pending' }, { name: 'Accepted', value: 'Accepted' }, { name: 'Denied', value: 'Denied' }))),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'submit') {
      const appeal = await Appeal.create({ guildId: interaction.guildId, appellantId: interaction.user.id, caseReference: interaction.options.getString('case', true), reason: interaction.options.getString('reason', true) });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const created = await createTicket({ guild: interaction.guild, owner: member, type: 'appeal', subject: `Appeal: ${appeal.caseReference}` });
      appeal.ticketId = created.ticket._id;
      await appeal.save();
      await created.channel.send({ embeds: [infoEmbed('Appeal Details', `Appeal from <@${appeal.appellantId}>.`).addFields({ name: 'Appeal ID', value: `\`${appeal._id}\`` }, { name: 'Case Reference', value: appeal.caseReference }, { name: 'Reason', value: appeal.reason })] });
      const e = infoEmbed('Appeal Submitted', `Your appeal was recorded as \`${appeal._id}\`.`).addFields({ name: 'Case Reference', value: appeal.caseReference }, { name: 'Ticket', value: `<#${created.channel.id}>` }, { name: 'Reason', value: appeal.reason });
      await interaction.reply({ ephemeral: true, embeds: [e] });
      await sendLog(interaction.guild, 'moderation', infoEmbed('Appeal Submitted', `<@${interaction.user.id}> submitted an appeal.`).addFields({ name: 'Appeal ID', value: `\`${appeal._id}\`` }, { name: 'Case', value: appeal.caseReference }));
      return;
    }
    if (!await requireRank(interaction, 'Lieutenant')) return;
    if (sub === 'review') {
      const id = interaction.options.getString('id', true);
      if (!validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid ID', 'Appeal ID is invalid.')] });
      const appeal = await Appeal.findOne({ _id: id, guildId: interaction.guildId, status: 'Pending' });
      if (!appeal) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Pending appeal not found.')] });
      appeal.status = interaction.options.getString('decision', true);
      appeal.reviewedBy = interaction.user.id;
      appeal.reviewedAt = new Date();
      appeal.reviewReason = interaction.options.getString('reason', true);
      await appeal.save();
      const e = successEmbed(`Appeal ${appeal.status}`, `<@${appeal.appellantId}>'s appeal was **${appeal.status.toLowerCase()}**.`).addFields({ name: 'Reason', value: appeal.reviewReason });
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'moderation', e);
      return;
    }
    const query = { guildId: interaction.guildId };
    const status = interaction.options.getString('status');
    if (status) query.status = status;
    const rows = await Appeal.find(query).sort({ createdAt: -1 }).limit(20);
    const body = rows.length ? rows.map((a) => `• \`${a._id}\` <@${a.appellantId}> — **${a.status}** • ${a.caseReference} • ${discordDate(a.createdAt, 'd')}\n  ${truncate(a.reason, 150)}`).join('\n') : 'No appeals found.';
    return interaction.reply({ embeds: [infoEmbed(`Appeals${status ? ` • ${status}` : ''}`, truncate(body, 3900))] });
  },
};
