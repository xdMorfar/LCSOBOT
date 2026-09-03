import { SlashCommandBuilder } from 'discord.js';
import { Deputy } from '../../../database/models/Deputy.js';
import { LOA } from '../../../database/models/LOA.js';
import { requireRank } from '../../../services/permissionService.js';
import { getSettings } from '../../../services/settingsService.js';
import { sendLog } from '../../../services/logService.js';
import { createTicket } from '../../../services/ticketService.js';
import { errorEmbed, infoEmbed, successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { discordDate, parseDate, truncate } from '../../../utils/format.js';
import { validObjectId } from '../../../utils/ids.js';

export default {
  data: new SlashCommandBuilder()
    .setName('loa')
    .setDescription('Leave of Absence management.')
    .addSubcommand((s) => s.setName('request').setDescription('Request a leave of absence.')
      .addStringOption((o) => o.setName('start').setDescription('Start date YYYY-MM-DD').setRequired(true))
      .addStringOption((o) => o.setName('end').setDescription('End date YYYY-MM-DD').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('approve').setDescription('Approve an LOA request.')
      .addStringOption((o) => o.setName('id').setDescription('LOA ID').setRequired(true))
      .addStringOption((o) => o.setName('note').setDescription('Review note').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('deny').setDescription('Deny an LOA request.')
      .addStringOption((o) => o.setName('id').setDescription('LOA ID').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Denial reason').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('list').setDescription('List LOA requests.')
      .addStringOption((o) => o.setName('status').setDescription('Status').addChoices(
        { name: 'Pending', value: 'Pending' }, { name: 'Approved', value: 'Approved' }, { name: 'Active', value: 'Active' }, { name: 'Completed', value: 'Completed' }, { name: 'Denied', value: 'Denied' },
      ))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'request') {
      const deputy = await Deputy.findOne({ guildId: interaction.guildId, discordId: interaction.user.id });
      if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Deputy Profile Required', 'You need a deputy profile before requesting LOA.')] });
      const startDate = parseDate(interaction.options.getString('start', true));
      const endDate = parseDate(interaction.options.getString('end', true));
      if (!startDate || !endDate) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid Date', 'Use the format **YYYY-MM-DD**.')] });
      if (endDate < startDate) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid Dates', 'End date cannot be before the start date.')] });
      if ((endDate - startDate) / 86400000 > 365) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('LOA Too Long', 'An LOA cannot exceed 365 days.')] });
      const existing = await LOA.findOne({ guildId: interaction.guildId, discordId: interaction.user.id, status: { $in: ['Pending', 'Approved', 'Active'] } });
      if (existing) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('LOA Already Exists', `You already have an open LOA: \`${existing._id}\`.`)] });
      const loa = await LOA.create({ guildId: interaction.guildId, deputyId: deputy._id, discordId: deputy.discordId, startDate, endDate, reason: interaction.options.getString('reason', true) });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const created = await createTicket({ guild: interaction.guild, owner: member, type: 'loa', subject: `LOA ${startDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}` });
      loa.ticketId = created.ticket._id;
      await loa.save();
      await created.channel.send({ embeds: [infoEmbed('LOA Request Details', `${interaction.user} submitted a leave of absence request.`).addFields({ name: 'Start', value: discordDate(startDate), inline: true }, { name: 'End', value: discordDate(endDate), inline: true }, { name: 'Reason', value: loa.reason }, { name: 'LOA ID', value: `\`${loa._id}\`` })] });
      const e = infoEmbed('LOA Request Submitted', `${interaction.user} submitted a leave of absence request.`).addFields(
        { name: 'Start', value: discordDate(startDate), inline: true }, { name: 'End', value: discordDate(endDate), inline: true },
        { name: 'Reason', value: loa.reason }, { name: 'LOA ID', value: `\`${loa._id}\`` }, { name: 'Ticket', value: `<#${created.channel.id}>` },
      );
      await interaction.reply({ ephemeral: true, embeds: [e] });
      await sendLog(interaction.guild, 'loa', e);
      return;
    }

    if (sub === 'approve' || sub === 'deny') {
      if (!await requireRank(interaction, 'Sergeant')) return;
      const id = interaction.options.getString('id', true);
      if (!validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid ID', 'The LOA ID is invalid.')] });
      const loa = await LOA.findOne({ _id: id, guildId: interaction.guildId, status: 'Pending' });
      if (!loa) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Pending LOA not found.')] });
      loa.status = sub === 'approve' ? 'Approved' : 'Denied';
      loa.reviewedBy = interaction.user.id;
      loa.reviewedAt = new Date();
      loa.reviewReason = sub === 'approve' ? interaction.options.getString('note') : interaction.options.getString('reason', true);
      await loa.save();
      if (sub === 'approve' && loa.startDate <= new Date() && loa.endDate >= new Date()) {
        loa.status = 'Active';
        await loa.save();
        const deputy = await Deputy.findById(loa.deputyId);
        if (deputy) { deputy.status = 'LOA'; await deputy.save(); }
        const settings = await getSettings(interaction.guildId);
        const member = await interaction.guild.members.fetch(loa.discordId).catch(() => null);
        if (member && settings.loaRoleId) await member.roles.add(settings.loaRoleId, 'LCSO LOA approved').catch(() => null);
      }
      const e = (sub === 'approve' ? successEmbed : warningEmbed)(`LOA ${sub === 'approve' ? 'Approved' : 'Denied'}`, `<@${loa.discordId}>'s LOA was ${sub === 'approve' ? 'approved' : 'denied'} by ${interaction.user}.`).addFields(
        { name: 'Dates', value: `${discordDate(loa.startDate)} → ${discordDate(loa.endDate)}` },
        { name: 'Review Note', value: loa.reviewReason || 'None' },
      );
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'loa', e);
      return;
    }

    if (sub === 'list') {
      if (!await requireRank(interaction, 'Corporal')) return;
      const status = interaction.options.getString('status');
      const query = { guildId: interaction.guildId };
      if (status) query.status = status;
      const rows = await LOA.find(query).sort({ createdAt: -1 }).limit(20);
      const body = rows.length ? rows.map((x) => `• \`${x._id}\` <@${x.discordId}> — **${x.status}** • ${discordDate(x.startDate, 'd')} → ${discordDate(x.endDate, 'd')}\n  ${truncate(x.reason, 160)}`).join('\n') : 'No LOAs found.';
      return interaction.reply({ embeds: [infoEmbed(`LOA List${status ? ` • ${status}` : ''}`, truncate(body, 3900))] });
    }
  },
};
