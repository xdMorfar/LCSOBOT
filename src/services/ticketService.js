import { AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, ActionRowBuilder, PermissionFlagsBits } from 'discord.js';
import { Ticket } from '../database/models/Ticket.js';
import { getSettings } from './settingsService.js';
import { infoEmbed, successEmbed } from '../utils/embeds.js';
import { htmlEscape, safeChannelName } from '../utils/format.js';
import { sendLog } from './logService.js';

const labels = {
  support: 'Support',
  internal_affairs: 'Internal Affairs',
  promotion: 'Promotion Request',
  loa: 'Leave of Absence',
  appeal: 'Appeal',
  application: 'Deputy Application',
};

export async function createTicket({ guild, owner, type, subject = '' }) {
  const existing = await Ticket.findOne({ guildId: guild.id, ownerId: owner.id, type, status: 'Open' });
  if (existing) {
    const channel = await guild.channels.fetch(existing.channelId).catch(() => null);
    if (channel) return { ticket: existing, channel, existing: true };
    existing.status = 'Closed';
    existing.closeReason = 'Channel missing';
    existing.closedAt = new Date();
    await existing.save();
  }

  const settings = await getSettings(guild.id);
  const categoryId = type === 'internal_affairs'
    ? settings.internalAffairsCategoryId || settings.ticketCategoryId
    : type === 'application'
      ? settings.applicationCategoryId || settings.ticketCategoryId
      : settings.ticketCategoryId;
  const staffRoleId = type === 'internal_affairs' ? settings.internalAffairsRoleId || settings.staffRoleId : settings.staffRoleId;
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: owner.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
  ];
  if (staffRoleId) overwrites.push({ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const channel = await guild.channels.create({
    name: safeChannelName(`${type}-${owner.user.username}`),
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    permissionOverwrites: overwrites,
    topic: `LCSO ${labels[type]} ticket for ${owner.user.tag} (${owner.id})`,
  });

  const ticket = await Ticket.create({ guildId: guild.id, ownerId: owner.id, type, channelId: channel.id, subject });
  const close = new ButtonBuilder().setCustomId(`ticket:close:${ticket._id}`).setLabel('Close Ticket').setStyle(ButtonStyle.Danger);
  await channel.send({
    content: `<@${owner.id}>${staffRoleId ? ` <@&${staffRoleId}>` : ''}`,
    embeds: [infoEmbed(`${labels[type]} Ticket`, subject || 'A staff member will assist you as soon as possible.').addFields({ name: 'Ticket ID', value: `\`${ticket._id}\`` })],
    components: [new ActionRowBuilder().addComponents(close)],
    allowedMentions: { users: [owner.id], roles: staffRoleId ? [staffRoleId] : [] },
  });
  await sendLog(guild, 'ticket', infoEmbed('Ticket Opened', `<@${owner.id}> opened a **${labels[type]}** ticket.`).addFields({ name: 'Channel', value: `<#${channel.id}>` }));
  return { ticket, channel, existing: false };
}

async function fetchMessages(channel, limit = 1000) {
  const all = [];
  let before;
  while (all.length < limit) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, limit - all.length), before });
    if (!batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function transcriptHtml(channel, messages) {
  const rows = messages.map((m) => {
    const attachments = [...m.attachments.values()].map((a) => `<a href="${htmlEscape(a.url)}">attachment</a>`).join(' ');
    return `<div class="msg"><div class="meta">${htmlEscape(m.author.tag)} • ${new Date(m.createdTimestamp).toISOString()}</div><div>${htmlEscape(m.cleanContent)} ${attachments}</div></div>`;
  }).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEscape(channel.name)} transcript</title><style>body{font-family:Arial,sans-serif;background:#111827;color:#e5e7eb;padding:24px}.msg{padding:10px 0;border-bottom:1px solid #374151}.meta{font-size:12px;color:#9ca3af;margin-bottom:4px}a{color:#60a5fa}</style></head><body><h1>#${htmlEscape(channel.name)}</h1>${rows}</body></html>`;
}

export async function closeTicket({ guild, channel, actorId, reason = 'Closed by staff' }) {
  const ticket = await Ticket.findOne({ guildId: guild.id, channelId: channel.id, status: 'Open' });
  if (!ticket) throw new Error('This channel is not an open ticket.');
  const messages = await fetchMessages(channel);
  const transcript = transcriptHtml(channel, messages);
  ticket.status = 'Closed';
  ticket.closedBy = actorId;
  ticket.closedAt = new Date();
  ticket.closeReason = reason;
  ticket.transcriptText = transcript.slice(0, 2_000_000);
  ticket.transcriptMessageCount = messages.length;
  await ticket.save();

  const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), { name: `transcript-${channel.name}.html` });
  await sendLog(guild, 'ticket', successEmbed('Ticket Closed', `Ticket \`${ticket._id}\` was closed by <@${actorId}>.`).addFields(
    { name: 'Type', value: labels[ticket.type] || ticket.type, inline: true },
    { name: 'Messages', value: String(messages.length), inline: true },
    { name: 'Reason', value: reason },
  ), { files: [file] });
  return ticket;
}
