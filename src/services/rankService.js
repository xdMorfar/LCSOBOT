import { Infraction } from '../database/models/Infraction.js';
import { Promotion } from '../database/models/Promotion.js';
import { RANK_LEVEL } from '../config/constants.js';
import { getSettings } from './settingsService.js';

export async function getActiveInfractionPoints(guildId, discordId) {
  const result = await Infraction.aggregate([
    { $match: { guildId, discordId, active: true } },
    { $group: { _id: null, points: { $sum: '$points' } } },
  ]);
  return result[0]?.points ?? 0;
}

export async function checkPromotionRequirements(deputy, targetRank) {
  const settings = await getSettings(deputy.guildId);
  const requirement = settings.rankRequirements.find((item) => item.rank === targetRank);
  if (!requirement) return { ok: true, reasons: [] };

  const points = await getActiveInfractionPoints(deputy.guildId, deputy.discordId);
  const days = Math.floor((Date.now() - deputy.joinDate.getTime()) / 86400000);
  const reasons = [];
  if (deputy.totalActivityMinutes < requirement.minActivityMinutes) {
    reasons.push(`Needs ${requirement.minActivityMinutes / 60} activity hours (has ${(deputy.totalActivityMinutes / 60).toFixed(1)}).`);
  }
  if (points > requirement.maxInfractionPoints) {
    reasons.push(`Has ${points} active infraction points; maximum is ${requirement.maxInfractionPoints}.`);
  }
  if (days < requirement.minDaysInDepartment) {
    reasons.push(`Needs ${requirement.minDaysInDepartment} days in department (has ${days}).`);
  }
  return { ok: reasons.length === 0, reasons };
}

export async function syncRankRole(guild, deputy) {
  const settings = await getSettings(guild.id);
  const member = await guild.members.fetch(deputy.discordId).catch(() => null);
  if (!member) return;
  const configuredRoleIds = [...settings.rankRoles.values()].filter(Boolean);
  const targetRoleId = settings.rankRoles.get(deputy.rank);
  const removable = configuredRoleIds.filter((id) => id !== targetRoleId && member.roles.cache.has(id));
  if (removable.length) await member.roles.remove(removable, 'LCSO rank synchronization').catch(() => null);
  if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId, `LCSO rank: ${deputy.rank}`).catch(() => null);
  }
}

export async function changeRank({ guild, deputy, targetRank, actorId, reason, type, overrideRequirements = false }) {
  if (!(targetRank in RANK_LEVEL)) throw new Error('Invalid target rank.');
  if (type === 'Promotion' && RANK_LEVEL[targetRank] <= RANK_LEVEL[deputy.rank]) throw new Error('Target rank must be above the current rank.');
  if (type === 'Demotion' && RANK_LEVEL[targetRank] >= RANK_LEVEL[deputy.rank]) throw new Error('Target rank must be below the current rank.');

  if (type === 'Promotion' && !overrideRequirements) {
    const requirement = await checkPromotionRequirements(deputy, targetRank);
    if (!requirement.ok) {
      const error = new Error(requirement.reasons.join('\n'));
      error.code = 'RANK_REQUIREMENTS';
      throw error;
    }
  }

  const fromRank = deputy.rank;
  deputy.rank = targetRank;
  await deputy.save();
  const record = await Promotion.create({
    guildId: deputy.guildId,
    deputyId: deputy._id,
    discordId: deputy.discordId,
    type,
    fromRank,
    toRank: targetRank,
    reason,
    status: 'Completed',
    actionedBy: actorId,
    reviewedBy: actorId,
    reviewedAt: new Date(),
  });
  await syncRankRole(guild, deputy);
  return record;
}
