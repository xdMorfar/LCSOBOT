import { SlashCommandBuilder } from 'discord.js';
import { Deputy } from '../../../database/models/Deputy.js';
import { Promotion } from '../../../database/models/Promotion.js';
import { RANKS, RANK_LEVEL } from '../../../config/constants.js';
import { requireRank } from '../../../services/permissionService.js';
import { changeRank, syncRankRole } from '../../../services/rankService.js';
import { sendLog } from '../../../services/logService.js';
import { createTicket } from '../../../services/ticketService.js';
import { errorEmbed, infoEmbed, successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { discordDate, truncate } from '../../../utils/format.js';
import { validObjectId } from '../../../utils/ids.js';

const rankChoices = RANKS.map((rank) => ({ name: rank, value: rank }));

async function findDeputy(guildId, userId) {
  return Deputy.findOne({ guildId, discordId: userId });
}

export default {
  data: new SlashCommandBuilder()
    .setName('promotion')
    .setDescription('Manage rank changes and promotion requests.')
    .addSubcommand((s) => s.setName('promote').setDescription('Promote a deputy.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy').setRequired(true))
      .addStringOption((o) => o.setName('rank').setDescription('New rank').setRequired(true).addChoices(...rankChoices))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000))
      .addBooleanOption((o) => o.setName('override').setDescription('Override configured rank requirements')))
    .addSubcommand((s) => s.setName('demote').setDescription('Demote a deputy.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy').setRequired(true))
      .addStringOption((o) => o.setName('rank').setDescription('New rank').setRequired(true).addChoices(...rankChoices))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('request').setDescription('Submit a promotion request.')
      .addStringOption((o) => o.setName('rank').setDescription('Requested rank').setRequired(true).addChoices(...rankChoices))
      .addStringOption((o) => o.setName('reason').setDescription('Why you are ready').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('review').setDescription('Approve or deny a promotion request.')
      .addStringOption((o) => o.setName('id').setDescription('Promotion request ID').setRequired(true))
      .addStringOption((o) => o.setName('decision').setDescription('Decision').setRequired(true).addChoices({ name: 'Approve', value: 'approve' }, { name: 'Deny', value: 'deny' }))
      .addStringOption((o) => o.setName('reason').setDescription('Review reason').setRequired(true).setMaxLength(1000))
      .addBooleanOption((o) => o.setName('override').setDescription('Override rank requirements when approving')))
    .addSubcommand((s) => s.setName('history').setDescription('View promotion/demotion history.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy').setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'promote' || sub === 'demote') {
      if (!await requireRank(interaction, sub === 'promote' ? 'Sergeant' : 'Lieutenant')) return;
      const user = interaction.options.getUser('member', true);
      const targetRank = interaction.options.getString('rank', true);
      const reason = interaction.options.getString('reason', true);
      const deputy = await findDeputy(interaction.guildId, user.id);
      if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Deputy Not Found', 'Create a deputy profile first.')] });
      try {
        const record = await changeRank({
          guild: interaction.guild,
          deputy,
          targetRank,
          actorId: interaction.user.id,
          reason,
          type: sub === 'promote' ? 'Promotion' : 'Demotion',
          overrideRequirements: interaction.options.getBoolean('override') ?? false,
        });
        const e = successEmbed(sub === 'promote' ? 'Deputy Promoted' : 'Deputy Demoted', `${user} is now **${targetRank}**.`).addFields(
          { name: 'Previous Rank', value: record.fromRank, inline: true },
          { name: 'New Rank', value: targetRank, inline: true },
          { name: 'Reason', value: reason },
          { name: 'Actioned By', value: `${interaction.user}` },
        );
        await interaction.reply({ embeds: [e] });
        await sendLog(interaction.guild, 'promotion', e);
      } catch (error) {
        return interaction.reply({ ephemeral: true, embeds: [errorEmbed(error.code === 'RANK_REQUIREMENTS' ? 'Requirements Not Met' : 'Rank Change Failed', error.message)] });
      }
      return;
    }

    if (sub === 'request') {
      const deputy = await findDeputy(interaction.guildId, interaction.user.id);
      if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Deputy Profile Required', 'You must be an active deputy to request a promotion.')] });
      const toRank = interaction.options.getString('rank', true);
      if (RANK_LEVEL[toRank] <= RANK_LEVEL[deputy.rank]) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid Rank', 'The requested rank must be above your current rank.')] });
      const existing = await Promotion.findOne({ guildId: interaction.guildId, discordId: interaction.user.id, type: 'Request', status: 'Pending' });
      if (existing) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Request Already Pending', `You already have a pending request: \`${existing._id}\`.`)] });
      const request = await Promotion.create({ guildId: interaction.guildId, deputyId: deputy._id, discordId: deputy.discordId, type: 'Request', fromRank: deputy.rank, toRank, reason: interaction.options.getString('reason', true), status: 'Pending', requestedBy: interaction.user.id });
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const created = await createTicket({ guild: interaction.guild, owner: member, type: 'promotion', subject: `Promotion request: ${deputy.rank} → ${toRank}` });
      request.ticketId = created.ticket._id;
      await request.save();
      await created.channel.send({ embeds: [infoEmbed('Promotion Request Details', `${interaction.user} requested promotion from **${deputy.rank}** to **${toRank}**.`).addFields({ name: 'Request ID', value: `\`${request._id}\`` }, { name: 'Reason', value: request.reason })] });
      const e = infoEmbed('Promotion Request Submitted', `${interaction.user} requested promotion from **${deputy.rank}** to **${toRank}**.`).addFields({ name: 'Request ID', value: `\`${request._id}\`` }, { name: 'Ticket', value: `<#${created.channel.id}>` }, { name: 'Reason', value: request.reason });
      await interaction.reply({ embeds: [e], ephemeral: true });
      await sendLog(interaction.guild, 'promotion', e);
      return;
    }

    if (sub === 'review') {
      if (!await requireRank(interaction, 'Lieutenant')) return;
      const id = interaction.options.getString('id', true);
      if (!validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid ID', 'That request ID is invalid.')] });
      const request = await Promotion.findOne({ _id: id, guildId: interaction.guildId, type: 'Request', status: 'Pending' });
      if (!request) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Pending promotion request not found.')] });
      const decision = interaction.options.getString('decision', true);
      const reviewReason = interaction.options.getString('reason', true);
      request.reviewedBy = interaction.user.id;
      request.reviewedAt = new Date();
      if (decision === 'deny') {
        request.status = 'Denied';
        await request.save();
        const e = warningEmbed('Promotion Request Denied', `<@${request.discordId}>'s request for **${request.toRank}** was denied.`).addFields({ name: 'Reason', value: reviewReason });
        await interaction.reply({ embeds: [e] });
        await sendLog(interaction.guild, 'promotion', e);
        return;
      }
      const deputy = await Deputy.findById(request.deputyId);
      if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Deputy Missing', 'The linked deputy profile no longer exists.')] });
      try {
        await changeRank({ guild: interaction.guild, deputy, targetRank: request.toRank, actorId: interaction.user.id, reason: `Approved promotion request: ${reviewReason}`, type: 'Promotion', overrideRequirements: interaction.options.getBoolean('override') ?? false });
        request.status = 'Approved';
        await request.save();
        const e = successEmbed('Promotion Request Approved', `<@${request.discordId}> was promoted to **${request.toRank}**.`).addFields({ name: 'Review Reason', value: reviewReason });
        await interaction.reply({ embeds: [e] });
        await sendLog(interaction.guild, 'promotion', e);
      } catch (error) {
        return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Could Not Approve', error.message)] });
      }
      return;
    }

    if (sub === 'history') {
      const user = interaction.options.getUser('member', true);
      const rows = await Promotion.find({ guildId: interaction.guildId, discordId: user.id }).sort({ createdAt: -1 }).limit(15);
      const body = rows.length ? rows.map((p) => `• ${discordDate(p.createdAt, 'd')} — **${p.type}** ${p.fromRank} → ${p.toRank} (${p.status})\n  ${truncate(p.reason, 180)}`).join('\n') : 'No promotion records found.';
      return interaction.reply({ embeds: [infoEmbed(`Rank History • ${user.username}`, truncate(body, 3900))] });
    }
  },
};
