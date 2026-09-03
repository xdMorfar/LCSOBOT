import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { TICKET_TYPES } from '../../../config/constants.js';
import { Ticket } from '../../../database/models/Ticket.js';
import { requireRank } from '../../../services/permissionService.js';
import { closeTicket } from '../../../services/ticketService.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../../utils/embeds.js';
import { truncate } from '../../../utils/format.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('LCSO support and department tickets.')
    .addSubcommand((s) => s.setName('panel').setDescription('Post the ticket panel.'))
    .addSubcommand((s) => s.setName('close').setDescription('Close the current ticket.')
      .addStringOption((o) => o.setName('reason').setDescription('Close reason').setMaxLength(1000)))
    .addSubcommand((s) => s.setName('list').setDescription('List open tickets.')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') {
      if (!await requireRank(interaction, 'Lieutenant')) return;
      const buttons = [
        ['support', 'Support', ButtonStyle.Primary],
        ['internal_affairs', 'Internal Affairs', ButtonStyle.Danger],
        ['promotion', 'Promotion Request', ButtonStyle.Secondary],
        ['loa', 'LOA', ButtonStyle.Secondary],
        ['appeal', 'Appeal', ButtonStyle.Secondary],
      ].map(([type, label, style]) => new ButtonBuilder().setCustomId(`ticket:create:${type}`).setLabel(label).setStyle(style));
      return interaction.reply({
        embeds: [infoEmbed('LCSO Ticket Center', 'Choose the ticket type that best matches your request. Tickets are private and visible only to you and authorized LCSO staff.')],
        components: [new ActionRowBuilder().addComponents(...buttons)],
      });
    }

    if (sub === 'close') {
      const ticket = await Ticket.findOne({ guildId: interaction.guildId, channelId: interaction.channelId, status: 'Open' });
      if (!ticket) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not a Ticket', 'This channel is not an open LCSO ticket.')] });
      if (ticket.ownerId !== interaction.user.id && !await requireRank(interaction, 'Corporal')) return;
      await interaction.reply({ embeds: [infoEmbed('Closing Ticket', 'Generating the transcript and closing this channel…')] });
      await closeTicket({ guild: interaction.guild, channel: interaction.channel, actorId: interaction.user.id, reason: interaction.options.getString('reason') || 'Closed by command' });
      setTimeout(() => interaction.channel.delete('LCSO ticket closed').catch(() => null), 4000).unref();
      return;
    }

    if (!await requireRank(interaction, 'Corporal')) return;
    const rows = await Ticket.find({ guildId: interaction.guildId, status: 'Open' }).sort({ createdAt: -1 }).limit(30);
    const body = rows.length ? rows.map((t) => `• \`${t._id}\` <@${t.ownerId}> — **${t.type}** • <#${t.channelId}>`).join('\n') : 'No open tickets.';
    return interaction.reply({ embeds: [infoEmbed('Open Tickets', truncate(body, 3900))] });
  },
};
