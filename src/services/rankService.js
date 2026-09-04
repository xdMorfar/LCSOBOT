import {
  Infraction,
} from '../database/models/Infraction.js';

import {
  Promotion,
} from '../database/models/Promotion.js';

import {
  getSettings,
} from './settingsService.js';

export async function getActiveInfractionPoints(
  guildId,
  discordId,
) {
  const result =
    await Infraction.aggregate([
      {
        $match: {
          guildId,
          discordId,
          active: true,
        },
      },

      {
        $group: {
          _id: null,

          points: {
            $sum: '$points',
          },
        },
      },
    ]);

  return result[0]?.points ??
    0;
}

export async function checkPromotionRequirements(
  deputy,
  targetRank,
) {
  const settings =
    await getSettings(
      deputy.guildId,
    );

  const requirement =
    settings.rankRequirements.find(
      (item) =>
        item.rank ===
        targetRank,
    );

  if (!requirement) {
    return {
      ok: true,
      reasons: [],
    };
  }

  const points =
    await getActiveInfractionPoints(
      deputy.guildId,
      deputy.discordId,
    );

  const days =
    Math.floor(
      (
        Date.now() -
        deputy.joinDate.getTime()
      ) /
        86400000,
    );

  const reasons = [];

  if (
    deputy.totalActivityMinutes <
    requirement.minActivityMinutes
  ) {
    reasons.push(
      `Needs ${
        requirement.minActivityMinutes /
        60
      } activity hours.`,
    );
  }

  if (
    points >
    requirement.maxInfractionPoints
  ) {
    reasons.push(
      `Has ${points} active infraction points.`,
    );
  }

  if (
    days <
    requirement.minDaysInDepartment
  ) {
    reasons.push(
      `Needs ${requirement.minDaysInDepartment} days in department.`,
    );
  }

  return {
    ok:
      reasons.length === 0,

    reasons,
  };
}

async function getConfiguredRoleIds(
  settings,
) {
  if (
    settings.rankRoleIds?.length
  ) {
    return [
      ...settings.rankRoleIds,
    ];
  }

  if (
    settings.rankRoles
  ) {
    return [
      ...settings.rankRoles.values(),
    ].filter(Boolean);
  }

  return [];
}

export async function syncRankRole(
  guild,
  deputy,
) {
  const settings =
    await getSettings(
      guild.id,
    );

  const member =
    await guild.members
      .fetch(
        deputy.discordId,
      )
      .catch(
        () => null,
      );

  if (!member) {
    throw new Error(
      'Deputy is not in the Discord server.',
    );
  }

  const configuredIds =
    await getConfiguredRoleIds(
      settings,
    );

  let targetRoleId =
    deputy.rankRoleId;

  if (
    !targetRoleId &&
    settings.rankRoles?.get(
      deputy.rank,
    )
  ) {
    targetRoleId =
      settings.rankRoles.get(
        deputy.rank,
      );
  }

  /*
   * Try matching by role name.
   */
  if (
    !targetRoleId &&
    deputy.rank
  ) {
    const matching =
      guild.roles.cache.find(
        (role) =>
          configuredIds.includes(
            role.id,
          ) &&
          role.name.toLowerCase() ===
            deputy.rank.toLowerCase(),
      );

    targetRoleId =
      matching?.id ??
      null;
  }

  /*
   * If nothing matches, use the
   * lowest configured LCSO rank.
   */
  if (
    !targetRoleId &&
    configuredIds.length
  ) {
    const roles =
      configuredIds
        .map(
          (id) =>
            guild.roles.cache.get(
              id,
            ),
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            a.position -
            b.position,
        );

    targetRoleId =
      roles[0]?.id ??
      null;
  }

  if (!targetRoleId) {
    return;
  }

  const targetRole =
    await guild.roles
      .fetch(
        targetRoleId,
      )
      .catch(
        () => null,
      );

  if (!targetRole) {
    throw new Error(
      'Configured Discord rank role does not exist.',
    );
  }

  const removable =
    configuredIds.filter(
      (id) =>
        id !==
          targetRoleId &&
        member.roles.cache.has(
          id,
        ),
    );

  if (removable.length) {
    await member.roles.remove(
      removable,
      'LCSO rank synchronization',
    );
  }

  if (
    !member.roles.cache.has(
      targetRoleId,
    )
  ) {
    await member.roles.add(
      targetRoleId,
      `LCSO rank: ${targetRole.name}`,
    );
  }

  deputy.rankRoleId =
    targetRole.id;

  deputy.rankName =
    targetRole.name;

  deputy.rank =
    targetRole.name;

  await deputy.save();
}

export async function changeRankRole({
  guild,
  deputy,
  targetRoleId,
  actorId,
  reason,
}) {
  const settings =
    await getSettings(
      guild.id,
    );

  const configuredIds =
    await getConfiguredRoleIds(
      settings,
    );

  if (
    !configuredIds.includes(
      targetRoleId,
    )
  ) {
    throw new Error(
      'Target role is not configured as an LCSO rank.',
    );
  }

  const targetRole =
    await guild.roles
      .fetch(
        targetRoleId,
      )
      .catch(
        () => null,
      );

  if (!targetRole) {
    throw new Error(
      'Target Discord role no longer exists.',
    );
  }

  const oldRole =
    deputy.rankRoleId
      ? await guild.roles
          .fetch(
            deputy.rankRoleId,
          )
          .catch(
            () => null,
          )
      : null;

  const fromRank =
    deputy.rankName ||
    deputy.rank ||
    oldRole?.name ||
    'Unassigned';

  let type =
    'Rank Change';

  if (oldRole) {
    if (
      targetRole.position >
      oldRole.position
    ) {
      type =
        'Promotion';
    } else if (
      targetRole.position <
      oldRole.position
    ) {
      type =
        'Demotion';
    }
  }

  deputy.rankRoleId =
    targetRole.id;

  deputy.rankName =
    targetRole.name;

  deputy.rank =
    targetRole.name;

  await syncRankRole(
    guild,
    deputy,
  );

  const record =
    await Promotion.create({
      guildId:
        deputy.guildId,

      deputyId:
        deputy._id,

      discordId:
        deputy.discordId,

      type,

      fromRank,

      toRank:
        targetRole.name,

      fromRoleId:
        oldRole?.id ??
        null,

      toRoleId:
        targetRole.id,

      reason,

      status:
        'Completed',

      actionedBy:
        actorId,

      reviewedBy:
        actorId,

      reviewedAt:
        new Date(),
    });

  return record;
}

/*
 * Legacy command support.
 */
export async function changeRank({
  guild,
  deputy,
  targetRank,
  actorId,
  reason,
  type,
  overrideRequirements = false,
}) {
  const settings =
    await getSettings(
      guild.id,
    );

  let targetRoleId =
    settings.rankRoles?.get(
      targetRank,
    );

  if (
    !targetRoleId &&
    settings.rankRoleIds?.length
  ) {
    const role =
      guild.roles.cache.find(
        (item) =>
          settings.rankRoleIds.includes(
            item.id,
          ) &&
          item.name.toLowerCase() ===
            String(
              targetRank,
            ).toLowerCase(),
      );

    targetRoleId =
      role?.id;
  }

  if (!targetRoleId) {
    throw new Error(
      `No Discord role is configured for ${targetRank}.`,
    );
  }

  if (
    type === 'Promotion' &&
    !overrideRequirements
  ) {
    const requirement =
      await checkPromotionRequirements(
        deputy,
        targetRank,
      );

    if (!requirement.ok) {
      throw new Error(
        requirement.reasons.join(
          '\n',
        ),
      );
    }
  }

  return changeRankRole({
    guild,
    deputy,
    targetRoleId,
    actorId,
    reason,
  });
}
