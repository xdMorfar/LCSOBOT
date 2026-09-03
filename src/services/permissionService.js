import { PermissionFlagsBits } from 'discord.js';
import { Deputy } from '../database/models/Deputy.js';
import { RANK_LEVEL } from '../config/constants.js';
import { errorEmbed } from '../utils/embeds.js';

export async function getActorDeputy(guildId, userId) {
  return Deputy.findOne({ guildId, discordId: userId });
}

export async function hasMinimumRank(member, minimumRank) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const deputy = await getActorDeputy(member.guild.id, member.id);
  if (!deputy) return false;
  return RANK_LEVEL[deputy.rank] >= RANK_LEVEL[minimumRank];
}

export async function requireRank(interaction, minimumRank) {
  const allowed = await hasMinimumRank(interaction.member, minimumRank);
  if (allowed) return true;
  await interaction.reply({
    ephemeral: true,
    embeds: [errorEmbed('Access Denied', `You must be **${minimumRank}** or higher to use this command.`)],
  });
  return false;
}

export function canModerateTarget(actor, target) {
  if (!target) return { ok: false, reason: 'That member could not be found.' };
  if (target.id === actor.id) return { ok: false, reason: 'You cannot moderate yourself.' };
  if (target.id === actor.guild.ownerId) return { ok: false, reason: 'The server owner cannot be moderated.' };
  if (actor.id !== actor.guild.ownerId && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return { ok: false, reason: 'Your highest Discord role must be above the target member.' };
  }
  const me = actor.guild.members.me;
  if (me && me.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return { ok: false, reason: 'My highest Discord role must be above the target member.' };
  }
  return { ok: true };
}
