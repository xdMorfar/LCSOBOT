import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Application } from '../../database/models/Application.js';
import { Appeal } from '../../database/models/Appeal.js';
import { Ticket } from '../../database/models/Ticket.js';
import { createTicket, closeTicket } from '../../services/ticketService.js';
import { reviewApplication } from '../../services/applicationService.js';
import { requireRank } from '../../services/permissionService.js';
import { sendLog } from '../../services/logService.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { validObjectId } from '../../utils/ids.js';

function textInput(id, label, style, maxLength, required = true) {
  return new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setMaxLength(maxLength).setRequired(required);
}

async function openApplicationModal(interaction) {
  const existing = await Application.findOne({ guildId: interaction.guildId, applicantId: interaction.user.id, status: 'Pending' });
  if (existing) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Application Already Open', `You already have a pending application: \`${existing._id}\`.`)] });
  const modal = new ModalBuilder().setCustomId('application:submit').setTitle('LCSO Deputy Application');
  modal.addComponents(
    new ActionRowBuilder().addComponents(textInput('age', 'Age', TextInputStyle.Short, 50)),
    new ActionRowBuilder().addComponents(textInput('timezone', 'Timezone', TextInputStyle.Short, 100)),
    new ActionRowBuilder().addComponents(textInput('experience', 'Previous roleplay / law enforcement experience', TextInputStyle.Paragraph, 1000)),
    new ActionRowBuilder().addComponents(textInput('motivation', 'Why do you want to join LCSO?', TextInputStyle.Paragraph, 1500)),
  );
  return interaction.showModal(modal);
}

async function submitApplication(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const { ticket, channel } = await createTicket({ guild: interaction.guild, owner: member, type: 'application', subject: 'Deputy application review' });
  const application = await Application.create({
    guildId: interaction.guildId,
    applicantId: interaction.user.id,
    answers: {
      age: interaction.fields.getTextInputValue('age'),
      timezone: interaction.fields.getTextInputValue('timezone'),
      experience: interaction.fields.getTextInputValue('experience'),
      motivation: interaction.fields.getTextInputValue('motivation'),
    },
    ticketId: ticket._id,
  });
  const accept = new ButtonBuilder().setCustomId(`application:accept:${application._id}`).setLabel('Accept').setStyle(ButtonStyle.Success);
  const deny = new ButtonBuilder().setCustomId(`application:deny:${application._id}`).setLabel('Deny').setStyle(ButtonStyle.Danger);
  await channel.send({ embeds: [infoEmbed('Deputy Application', `Application from <@${interaction.user.id}>`).addFields(
    { name: 'Age', value: application.answers.age },
    { name: 'Timezone', value: application.answers.timezone },
    { name: 'Experience', value: application.answers.experience },
    { name: 'Motivation', value: application.answers.motivation },
    { name: 'Application ID', value: `\`${application._id}\`` },
  )], components: [new ActionRowBuilder().addComponents(accept, deny)] });
  await sendLog(interaction.guild, 'application', infoEmbed('Application Submitted', `<@${interaction.user.id}> submitted a deputy application.`).addFields({ name: 'ID', value: `\`${application._id}\`` }));
  return interaction.editReply({ embeds: [successEmbed('Application Submitted', `Your application has been created in <#${channel.id}>.`)] });
}

async function reviewApplicationButton(interaction, accepted, id) {
  if (!await requireRank(interaction, 'Sergeant')) return;
  if (!validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid Application', 'The application ID is invalid.')] });
  const application = await Application.findOne({ _id: id, guildId: interaction.guildId });
  if (!application) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Application not found.')] });
  await reviewApplication({ guild: interaction.guild, application, reviewerId: interaction.user.id, accepted, reason: 'Reviewed from application ticket' });
  await interaction.update({ components: [] });
  await interaction.followUp({ embeds: [successEmbed(accepted ? 'Application Accepted' : 'Application Denied', `<@${application.applicantId}>'s application was ${accepted ? 'accepted' : 'denied'} by <@${interaction.user.id}>.`)] });
  await sendLog(interaction.guild, 'application', successEmbed('Application Reviewed', `<@${application.applicantId}> was **${accepted ? 'accepted' : 'denied'}** by <@${interaction.user.id}>.`));
}

async function createTicketButton(interaction, type) {
  await interaction.deferReply({ ephemeral: true });
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const { channel, existing } = await createTicket({ guild: interaction.guild, owner: member, type });
  return interaction.editReply({ embeds: [successEmbed(existing ? 'Ticket Already Open' : 'Ticket Created', `${existing ? 'Your existing ticket is' : 'Your ticket was created at'} <#${channel.id}>.`)] });
}

async function closeTicketButton(interaction, id) {
  const ticket = validObjectId(id) ? await Ticket.findOne({ _id: id, guildId: interaction.guildId, status: 'Open' }) : null;
  if (!ticket || ticket.channelId !== interaction.channelId) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Ticket Not Found', 'This ticket could not be found.')] });
  const isOwner = ticket.ownerId === interaction.user.id;
  if (!isOwner && !await requireRank(interaction, 'Corporal')) return;
  await interaction.reply({ embeds: [infoEmbed('Closing Ticket', 'Generating the transcript and closing this ticket…')] });
  await closeTicket({ guild: interaction.guild, channel: interaction.channel, actorId: interaction.user.id });
  setTimeout(() => interaction.channel.delete('LCSO ticket closed').catch(() => null), 4000).unref();
}

export async function handleButton(interaction) {
  const parts = interaction.customId.split(':');
  if (interaction.customId === 'application:open') return openApplicationModal(interaction);
  if (parts[0] === 'application' && ['accept', 'deny'].includes(parts[1])) return reviewApplicationButton(interaction, parts[1] === 'accept', parts[2]);
  if (parts[0] === 'ticket' && parts[1] === 'create') return createTicketButton(interaction, parts[2]);
  if (parts[0] === 'ticket' && parts[1] === 'close') return closeTicketButton(interaction, parts[2]);
}

export async function handleModal(interaction) {
  if (interaction.customId === 'application:submit') return submitApplication(interaction);
}
