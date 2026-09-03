import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } from 'discord.js';
import { Application } from '../../../database/models/Application.js';
import { requireRank } from '../../../services/permissionService.js';
import { reviewApplication } from '../../../services/applicationService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../../utils/embeds.js';
import { discordDate, truncate } from '../../../utils/format.js';
import { validObjectId } from '../../../utils/ids.js';

export default {
  data: new SlashCommandBuilder()
    .setName('application')
    .setDescription('Deputy application system.')
    .addSubcommand((s) => s.setName('panel').setDescription('Post the deputy application panel.'))
    .addSubcommand((s) => s.setName('review').setDescription('Review an application by ID.')
      .addStringOption((o) => o.setName('id').setDescription('Application ID').setRequired(true))
      .addStringOption((o) => o.setName('decision').setDescription('Decision').setRequired(true).addChoices({ name: 'Accept', value: 'accept' }, { name: 'Deny', value: 'deny' }))
      .addStringOption((o) => o.setName('reason').setDescription('Review reason').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('list').setDescription('List recent applications.')
      .addStringOption((o) => o.setName('status').setDescription('Status').addChoices({ name: 'Pending', value: 'Pending' }, { name: 'Accepted', value: 'Accepted' }, { name: 'Denied', value: 'Denied' }))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') {
      if (!await requireRank(interaction, 'Lieutenant')) return;
      const button = new ButtonBuilder().setCustomId('application:open').setLabel('Apply to LCSO').setStyle(ButtonStyle.Primary);
      await interaction.reply({ embeds: [infoEmbed('LCSO Deputy Applications', 'Interested in joining the Liberty County Sheriff’s Office? Click below to open the application form.\n\nPlease answer each question truthfully and in sufficient detail.')], components: [new ActionRowBuilder().addComponents(button)] });
      return;
    }
    if (!await requireRank(interaction, 'Sergeant')) return;
    if (sub === 'review') {
      const id = interaction.options.getString('id', true);
      if (!validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid ID', 'Application ID is invalid.')] });
      const application = await Application.findOne({ _id: id, guildId: interaction.guildId });
      if (!application) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Application not found.')] });
      const accepted = interaction.options.getString('decision', true) === 'accept';
      await reviewApplication({ guild: interaction.guild, application, reviewerId: interaction.user.id, accepted, reason: interaction.options.getString('reason', true) });
      const e = successEmbed(`Application ${accepted ? 'Accepted' : 'Denied'}`, `<@${application.applicantId}> was **${accepted ? 'accepted' : 'denied'}**.`).addFields({ name: 'Reason', value: application.reviewReason });
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'application', e);
      return;
    }
    const query = { guildId: interaction.guildId };
    const status = interaction.options.getString('status');
    if (status) query.status = status;
    const rows = await Application.find(query).sort({ createdAt: -1 }).limit(20);
    const body = rows.length ? rows.map((a) => `• \`${a._id}\` <@${a.applicantId}> — **${a.status}** • ${discordDate(a.createdAt, 'd')}\n  ${truncate(a.answers.motivation, 150)}`).join('\n') : 'No applications found.';
    return interaction.reply({ embeds: [infoEmbed(`Applications${status ? ` • ${status}` : ''}`, truncate(body, 3900))] });
  },
};
