import {
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

let processorStarted = false;
let processorBusy = false;
let indexesCleaned = false;

const DEFAULT_RANK_NAMES = [
  'Cadet',
  'Deputy Sheriff',
  'Senior Deputy',
  'Corporal',
  'Sergeant',
  'Lieutenant',
  'Captain',
  'Assistant Sheriff',
  'Undersheriff',
  'Sheriff',
];

const STAFF_RANKS = [
  'Corporal',
  'Sergeant',
  'Lieutenant',
  'Captain',
  'Assistant Sheriff',
  'Undersheriff',
  'Sheriff',
];

function getDb() {
  const database =
    mongoose.connection.db;

  if (!database) {
    throw new Error(
      'MongoDB is not connected.',
    );
  }

  return database;
}

function normalizeName(value) {
  return String(
    value ?? '',
  )
    .trim()
    .toLowerCase();
}

function truncate(
  value,
  max = 1000,
) {
  const text =
    String(
      value ?? '',
    ).trim();

  if (!text) {
    return 'N/A';
  }

  return text.length > max
    ? `${text.slice(
        0,
        max - 3,
      )}...`
    : text;
}

function validImageUrl(value) {
  if (!value) {
    return false;
  }

  try {
    const url =
      new URL(
        String(value),
      );

    return (
      url.protocol === 'https:' ||
      url.protocol === 'http:'
    );
  } catch {
    return false;
  }
}

async function cleanupDeputyIndexes() {
  if (indexesCleaned) {
    return;
  }

  const collection =
    getDb().collection(
      'deputies',
    );

  try {
    const indexes =
      await collection.indexes();

    if (
      indexes.some(
        (index) =>
          index.name ===
          'guildId_1_badgeNumber_1',
      )
    ) {
      await collection.dropIndex(
        'guildId_1_badgeNumber_1',
      );

      logger.info(
        'Removed obsolete deputy badgeNumber index',
      );
    }

    indexesCleaned =
      true;
  } catch (error) {
    logger.warn(
      `Deputy index cleanup: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }
}

async function getGuild(
  client,
  guildId,
) {
  return (
    client.guilds.cache.get(
      guildId,
    ) ||
    await client.guilds.fetch(
      guildId,
    )
  );
}

async function getGeneralSettings(
  guildId,
) {
  return (
    await getDb()
      .collection(
        'settings',
      )
      .findOne({
        guildId,
      })
  ) || {};
}

async function getStaffSettings(
  guildId,
) {
  const [
    staff,
    general,
  ] =
    await Promise.all([
      getDb()
        .collection(
          'staffactionsettings',
        )
        .findOne({
          guildId,
        }),

      getGeneralSettings(
        guildId,
      ),
    ]);

  const logs =
    general.logChannels ||
    {};

  return {
    ...general,
    ...(staff || {}),

    promotionChannelId:
      staff?.promotionChannelId ||
      general.promotionChannelId ||
      logs.Promotions ||
      logs.promotions ||
      null,

    infractionChannelId:
      staff?.infractionChannelId ||
      general.infractionChannelId ||
      logs.Infractions ||
      logs.infractions ||
      null,

    warningRoleId:
      staff?.warningRoleId ||
      general.warningRoleId ||
      null,

    strikeRoleId:
      staff?.strikeRoleId ||
      general.strikeRoleId ||
      null,

    terminationRoleId:
      staff?.terminationRoleId ||
      general.terminationRoleId ||
      null,

    promotionBannerUrl:
      staff?.promotionBannerUrl ||
      general.promotionBannerUrl ||
      null,

    infractionBannerUrl:
      staff?.infractionBannerUrl ||
      general.infractionBannerUrl ||
      null,
  };
}

async function findTextChannel(
  guild,
  configuredId,
  fallbackNames,
) {
  if (configuredId) {
    const channel =
      guild.channels.cache.get(
        configuredId,
      ) ||
      await guild.channels
        .fetch(
          configuredId,
        )
        .catch(
          () => null,
        );

    if (
      channel?.isTextBased() &&
      typeof channel.send ===
        'function'
    ) {
      return channel;
    }
  }

  const channel =
    guild.channels.cache.find(
      (entry) => {
        if (
          !entry.isTextBased() ||
          typeof entry.send !==
            'function'
        ) {
          return false;
        }

        const name =
          normalizeName(
            entry.name,
          );

        return fallbackNames.some(
          (wanted) =>
            name.includes(
              normalizeName(
                wanted,
              ),
            ),
        );
      },
    );

  if (!channel) {
    throw new Error(
      `Could not find #${fallbackNames[0]}.`,
    );
  }

  return channel;
}

async function findRole(
  guild,
  roleId,
  roleName,
) {
  if (roleId) {
    const role =
      guild.roles.cache.get(
        roleId,
      ) ||
      await guild.roles
        .fetch(
          roleId,
        )
        .catch(
          () => null,
        );

    if (role) {
      return role;
    }
  }

  if (roleName) {
    return (
      guild.roles.cache.find(
        (role) =>
          normalizeName(
            role.name,
          ) ===
          normalizeName(
            roleName,
          ),
      ) ||
      null
    );
  }

  return null;
}

function configuredRankIds(
  settings,
) {
  return Array.isArray(
    settings.rankRoleIds,
  )
    ? settings.rankRoleIds
    : [];
}

function isDepartmentRank(
  role,
  settings,
) {
  const configured =
    configuredRankIds(
      settings,
    );

  if (
    configured.length > 0
  ) {
    return configured.includes(
      role.id,
    );
  }

  return DEFAULT_RANK_NAMES.some(
    (rank) =>
      normalizeName(
        rank,
      ) ===
      normalizeName(
        role.name,
      ),
  );
}

function getCurrentRankRoles(
  member,
  settings,
) {
  return [
    ...member.roles.cache.values(),
  ]
    .filter(
      (role) =>
        role.id !==
          member.guild.roles
            .everyone.id &&
        isDepartmentRank(
          role,
          settings,
        ),
    )
    .sort(
      (a, b) =>
        b.position -
        a.position,
    );
}

async function removeOtherRankRoles(
  member,
  settings,
  exceptRoleId = null,
  reason = 'LCSO staff action',
) {
  const roles =
    getCurrentRankRoles(
      member,
      settings,
    ).filter(
      (role) =>
        role.id !==
        exceptRoleId,
    );

  for (
    const role of roles
  ) {
    if (!role.editable) {
      throw new Error(
        `I cannot remove ${role.name}. Move the LCSO Bot role above it.`,
      );
    }
  }

  if (roles.length) {
    await member.roles.remove(
      roles.map(
        (role) =>
          role.id,
      ),
      reason,
    );
  }

  return roles;
}

async function getDeputy(
  guildId,
  discordId,
) {
  return getDb()
    .collection(
      'deputies',
    )
    .findOne({
      guildId,
      discordId,
    });
}

async function ensurePersonnel(
  guild,
  member,
  rankRole,
  status = 'Active',
) {
  await cleanupDeputyIndexes();

  const now =
    new Date();

  await getDb()
    .collection(
      'deputies',
    )
    .updateOne(
      {
        guildId:
          guild.id,

        discordId:
          member.id,
      },

      {
        $setOnInsert: {
          guildId:
            guild.id,

          discordId:
            member.id,

          joinDate:
            member.joinedAt ||
            now,

          createdAt:
            now,

          createdBy:
            'Discord Auto Sync',

          totalActivityMinutes:
            0,
        },

        $set: {
          displayName:
            member.displayName,

          rankRoleId:
            rankRole?.id ||
            null,

          rankName:
            rankRole?.name ||
            null,

          rank:
            rankRole?.name ||
            null,

          status,

          updatedAt:
            now,
        },

        $unset: {
          badgeNumber:
            '',
        },
      },

      {
        upsert:
          true,
      },
    );

  return getDeputy(
    guild.id,
    member.id,
  );
}

function actorLabel(input) {
  return input.actorDiscordId
    ? `<@${input.actorDiscordId}>`
    : input.actorName ||
        'LCSO Command Staff';
}

/* =========================================================
   PERMISSIONS
   ========================================================= */

export async function canManageStaffActions(
  guild,
  discordId,
) {
  const member =
    guild.members.cache.get(
      discordId,
    ) ||
    await guild.members
      .fetch(
        discordId,
      )
      .catch(
        () => null,
      );

  if (!member) {
    return false;
  }

  if (
    member.permissions.has(
      PermissionFlagsBits.Administrator,
    ) ||
    member.permissions.has(
      PermissionFlagsBits.ManageRoles,
    )
  ) {
    return true;
  }

  const settings =
    await getGeneralSettings(
      guild.id,
    );

  const adminRoles =
    Array.isArray(
      settings.dashboardAdminRoleIds,
    )
      ? settings.dashboardAdminRoleIds
      : [];

  if (
    adminRoles.some(
      (id) =>
        member.roles.cache.has(
          id,
        ),
    )
  ) {
    return true;
  }

  return member.roles.cache.some(
    (role) =>
      STAFF_RANKS.some(
        (rank) =>
          normalizeName(
            role.name,
          ) ===
          normalizeName(
            rank,
          ),
      ),
  );
}

/* =========================================================
   PROMOTION POST
   ========================================================= */

async function sendPromotionPost(
  guild,
  input,
  targetRole,
  settings,
) {
  const channel =
    await findTextChannel(
      guild,
      settings.promotionChannelId,
      [
        'promotions',
        'promotion',
      ],
    );

  const actor =
    actorLabel(
      input,
    );

  const timestamp =
    Math.floor(
      Date.now() /
        1000,
    );

  const embed =
    new EmbedBuilder()
      .setColor(
        0x57f287,
      )
      .setTitle(
        '🎉 Liberty County Sheriff’s Office | Staff Promotion',
      )
      .setDescription(
        [
          '> The **Liberty County Sheriff’s Office Command Staff** is pleased to recognize your hard work and professionalism with a staff promotion.',
          '>',
          '> Continue setting a strong example for the department.',
          '',
          '### ━━━ Promotion Information ━━━',
          '',
          `↳ **Staff Member:** <@${input.memberId}>`,
          `↳ **Promoted By:** ${actor}`,
          `↳ **New Rank:** <@&${targetRole.id}>`,
          `↳ **Reason:** ${truncate(
            input.reason,
            700,
          )}`,
          `↳ **Notes:** ${truncate(
            input.notes,
            700,
          )}`,
          '',
          `> 🕒 **Promoted:** <t:${timestamp}:F>`,
        ].join('\n'),
      )
      .setFooter({
        text:
          'Liberty County Sheriff’s Office • Springfield Roleplay',
      })
      .setTimestamp();

  const icon =
    guild.iconURL({
      size: 256,
    });

  if (icon) {
    embed.setThumbnail(
      icon,
    );
  }

  if (
    validImageUrl(
      settings.promotionBannerUrl,
    )
  ) {
    embed.setImage(
      settings.promotionBannerUrl,
    );
  }

  await channel.send({
    content:
      `📝 **Signed by,** ${actor}`,

    embeds: [
      embed,
    ],

    allowedMentions: {
      parse: [],
    },
  });

  return channel;
}

/* =========================================================
   INFRACTION POST
   ========================================================= */

async function sendInfractionPost(
  guild,
  input,
  type,
  settings,
  targetRole = null,
) {
  const channel =
    await findTextChannel(
      guild,
      settings.infractionChannelId,
      [
        'infractions',
        'infraction',
      ],
    );

  const actor =
    actorLabel(
      input,
    );

  const timestamp =
    Math.floor(
      Date.now() /
        1000,
    );

  let color =
    0xf0b232;

  if (
    type === 'Strike'
  ) {
    color =
      0xed4245;
  }

  if (
    type === 'Demotion'
  ) {
    color =
      0xe67e22;
  }

  if (
    type === 'Termination'
  ) {
    color =
      0x992d22;
  }

  const information = [
    `↳ **Staff Member:** <@${input.memberId}>`,
    `↳ **Handler:** ${actor}`,
    `↳ **Infraction:** ${type}`,
  ];

  if (
    type ===
      'Demotion' &&
    targetRole
  ) {
    information.push(
      `↳ **New Rank:** <@&${targetRole.id}>`,
    );
  }

  information.push(
    `↳ **Reason:** ${truncate(
      input.reason,
      700,
    )}`,
  );

  information.push(
    `↳ **Notes:** ${truncate(
      input.notes,
      700,
    )}`,
  );

  const embed =
    new EmbedBuilder()
      .setColor(
        color,
      )
      .setTitle(
        `🛠️ Liberty County Sheriff’s Office | Staff Infraction - ${type}`,
      )
      .setDescription(
        [
          '> The **Liberty County Sheriff’s Office Command Staff** has issued the following staff action.',
          '>',
          '> Please review department rules and expectations to avoid further consequences.',
          '',
          '### ━━━ Infraction Information ━━━',
          '',
          ...information,
          '',
          `> 🕒 **Issued:** <t:${timestamp}:F>`,
        ].join('\n'),
      )
      .setFooter({
        text:
          'Liberty County Sheriff’s Office • Springfield Roleplay',
      })
      .setTimestamp();

  const icon =
    guild.iconURL({
      size: 256,
    });

  if (icon) {
    embed.setThumbnail(
      icon,
    );
  }

  if (
    validImageUrl(
      settings.infractionBannerUrl,
    )
  ) {
    embed.setImage(
      settings.infractionBannerUrl,
    );
  }

  await channel.send({
    content:
      `📝 **Signed by,** ${actor}`,

    embeds: [
      embed,
    ],

    allowedMentions: {
      parse: [],
    },
  });

  return channel;
}

/* =========================================================
   PROMOTION
   ========================================================= */

export async function promoteMember(
  client,
  input,
) {
  const guildId =
    input.guildId ||
    process.env
      .DISCORD_GUILD_ID;

  if (!guildId) {
    throw new Error(
      'DISCORD_GUILD_ID is missing.',
    );
  }

  if (
    !input.memberId
  ) {
    throw new Error(
      'A member is required.',
    );
  }

  if (!input.reason) {
    throw new Error(
      'A reason is required.',
    );
  }

  const guild =
    await getGuild(
      client,
      guildId,
    );

  const settings =
    await getStaffSettings(
      guildId,
    );

  const member =
    guild.members.cache.get(
      input.memberId,
    ) ||
    await guild.members.fetch(
      input.memberId,
    );

  const targetRole =
    await findRole(
      guild,
      input.targetRoleId,
      input.targetRoleName,
    );

  if (
    !targetRole ||
    !isDepartmentRank(
      targetRole,
      settings,
    )
  ) {
    throw new Error(
      'The selected role is not an LCSO rank.',
    );
  }

  if (
    !targetRole.editable
  ) {
    throw new Error(
      `I cannot assign ${targetRole.name}. Move the bot role above it.`,
    );
  }

  const oldRanks =
    getCurrentRankRoles(
      member,
      settings,
    );

  const previousRole =
    oldRanks[0] ||
    null;

  await removeOtherRankRoles(
    member,
    settings,
    targetRole.id,
    `Promotion to ${targetRole.name}`,
  );

  if (
    !member.roles.cache.has(
      targetRole.id,
    )
  ) {
    await member.roles.add(
      targetRole,
      `Promotion: ${input.reason}`,
    );
  }

  const deputy =
    await ensurePersonnel(
      guild,
      member,
      targetRole,
      'Active',
    );

  const now =
    new Date();

  const result =
    await getDb()
      .collection(
        'promotions',
      )
      .insertOne({
        guildId,

        deputyId:
          deputy?._id ||
          null,

        discordId:
          member.id,

        memberName:
          member.displayName,

        previousRoleId:
          previousRole?.id ||
          null,

        previousRoleName:
          previousRole?.name ||
          null,

        newRoleId:
          targetRole.id,

        newRoleName:
          targetRole.name,

        reason:
          truncate(
            input.reason,
            1000,
          ),

        notes:
          input.notes ||
          null,

        promotedByDiscordId:
          input.actorDiscordId ||
          null,

        promotedByName:
          input.actorName ||
          null,

        source:
          input.source ||
          'Discord',

        createdAt:
          now,

        updatedAt:
          now,
      });

  const channel =
    await sendPromotionPost(
      guild,
      input,
      targetRole,
      settings,
    );

  return {
    promotionId:
      String(
        result.insertedId,
      ),

    channelId:
      channel.id,

    roleId:
      targetRole.id,

    roleName:
      targetRole.name,
  };
}

/* =========================================================
   INFRACTION
   ========================================================= */

export async function issueInfraction(
  client,
  input,
) {
  const guildId =
    input.guildId ||
    process.env
      .DISCORD_GUILD_ID;

  if (!guildId) {
    throw new Error(
      'DISCORD_GUILD_ID is missing.',
    );
  }

  const typeMap = {
    warning:
      'Warning',

    strike:
      'Strike',

    demotion:
      'Demotion',

    termination:
      'Termination',
  };

  const type =
    typeMap[
      normalizeName(
        input.infractionType ||
        input.type,
      )
    ];

  if (!type) {
    throw new Error(
      'Infraction must be Warning, Strike, Demotion or Termination.',
    );
  }

  if (!input.reason) {
    throw new Error(
      'A reason is required.',
    );
  }

  const guild =
    await getGuild(
      client,
      guildId,
    );

  const settings =
    await getStaffSettings(
      guildId,
    );

  const member =
    guild.members.cache.get(
      input.memberId,
    ) ||
    await guild.members.fetch(
      input.memberId,
    );

  const currentRanks =
    getCurrentRankRoles(
      member,
      settings,
    );

  const currentRank =
    currentRanks[0] ||
    null;

  let targetRole =
    null;

  let actionRole =
    null;

  if (
    type === 'Warning' ||
    type === 'Strike'
  ) {
    const configuredId =
      type === 'Warning'
        ? settings.warningRoleId
        : settings.strikeRoleId;

    actionRole =
      await findRole(
        guild,
        configuredId,
        type,
      );

    if (!actionRole) {
      throw new Error(
        `The ${type} Discord role could not be found.`,
      );
    }

    if (
      !actionRole.editable
    ) {
      throw new Error(
        `I cannot assign ${actionRole.name}. Move the bot role above it.`,
      );
    }

    if (
      !member.roles.cache.has(
        actionRole.id,
      )
    ) {
      await member.roles.add(
        actionRole,
        `LCSO ${type}: ${input.reason}`,
      );
    }
  }

  if (
    type ===
    'Demotion'
  ) {
    if (
      !input.targetRoleId &&
      !input.targetRoleName
    ) {
      throw new Error(
        'Select the new rank when issuing a Demotion.',
      );
    }

    targetRole =
      await findRole(
        guild,
        input.targetRoleId,
        input.targetRoleName,
      );

    if (
      !targetRole ||
      !isDepartmentRank(
        targetRole,
        settings,
      )
    ) {
      throw new Error(
        'The selected demotion rank is not an LCSO rank.',
      );
    }

    if (
      !targetRole.editable
    ) {
      throw new Error(
        `I cannot assign ${targetRole.name}. Move the bot role above it.`,
      );
    }

    if (
      currentRank &&
      targetRole.position >=
        currentRank.position
    ) {
      throw new Error(
        `${targetRole.name} is not below the member's current rank.`,
      );
    }

    await removeOtherRankRoles(
      member,
      settings,
      targetRole.id,
      `LCSO demotion to ${targetRole.name}`,
    );

    if (
      !member.roles.cache.has(
        targetRole.id,
      )
    ) {
      await member.roles.add(
        targetRole,
        `LCSO Demotion: ${input.reason}`,
      );
    }

    await ensurePersonnel(
      guild,
      member,
      targetRole,
      'Active',
    );
  }

  if (
    type ===
    'Termination'
  ) {
    await removeOtherRankRoles(
      member,
      settings,
      null,
      `LCSO Termination: ${input.reason}`,
    );

    const terminationRole =
      await findRole(
        guild,
        settings.terminationRoleId,
        'Terminated',
      );

    if (
      terminationRole &&
      terminationRole.editable &&
      !member.roles.cache.has(
        terminationRole.id,
      )
    ) {
      await member.roles.add(
        terminationRole,
        `LCSO Termination: ${input.reason}`,
      );
    }

    await ensurePersonnel(
      guild,
      member,
      null,
      'Terminated',
    );
  }

  let deputy =
    await getDeputy(
      guildId,
      member.id,
    );

  if (
    !deputy &&
    currentRank &&
    type !==
      'Termination'
  ) {
    deputy =
      await ensurePersonnel(
        guild,
        member,
        type ===
          'Demotion'
          ? targetRole
          : currentRank,
        'Active',
      );
  }

  const now =
    new Date();

  const result =
    await getDb()
      .collection(
        'infractions',
      )
      .insertOne({
        guildId,

        deputyId:
          deputy?._id ||
          null,

        discordId:
          member.id,

        memberName:
          member.displayName,

        type,

        reason:
          truncate(
            input.reason,
            1000,
          ),

        notes:
          input.notes ||
          null,

        roleId:
          actionRole?.id ||
          null,

        roleName:
          actionRole?.name ||
          null,

        previousRankRoleId:
          currentRank?.id ||
          null,

        previousRankName:
          currentRank?.name ||
          null,

        targetRankRoleId:
          targetRole?.id ||
          null,

        targetRankName:
          targetRole?.name ||
          null,

        issuedByDiscordId:
          input.actorDiscordId ||
          null,

        issuedByName:
          input.actorName ||
          null,

        source:
          input.source ||
          'Discord',

        active:
          true,

        createdAt:
          now,

        updatedAt:
          now,
      });

  const channel =
    await sendInfractionPost(
      guild,
      input,
      type,
      settings,
      targetRole,
    );

  return {
    infractionId:
      String(
        result.insertedId,
      ),

    channelId:
      channel.id,

    type,

    roleId:
      actionRole?.id ||
      targetRole?.id ||
      null,

    roleName:
      actionRole?.name ||
      targetRole?.name ||
      null,
  };
}

/* =========================================================
   STAFF ACTION QUEUE
   ========================================================= */

async function processStaffAction(
  client,
  action,
) {
  const payload =
    action.payload ||
    {};

  if (
    action.type ===
    'PROMOTE_MEMBER'
  ) {
    return promoteMember(
      client,
      {
        ...payload,

        guildId:
          action.guildId,

        source:
          payload.source ||
          'Dashboard',
      },
    );
  }

  if (
    action.type ===
    'ISSUE_INFRACTION'
  ) {
    return issueInfraction(
      client,
      {
        ...payload,

        guildId:
          action.guildId,

        source:
          payload.source ||
          'Dashboard',
      },
    );
  }

  throw new Error(
    `Unsupported staff action: ${action.type}`,
  );
}

async function processNextAction(
  client,
) {
  if (processorBusy) {
    return;
  }

  processorBusy =
    true;

  try {
    const actions =
      getDb().collection(
        'staffactions',
      );

    const claimed =
      await actions.findOneAndUpdate(
        {
          status:
            'Pending',
        },

        {
          $set: {
            status:
              'Processing',

            startedAt:
              new Date(),

            updatedAt:
              new Date(),
          },
        },

        {
          sort: {
            createdAt: 1,
          },

          returnDocument:
            'after',
        },
      );

    const action =
      claimed?.value ||
      claimed;

    if (
      !action?._id
    ) {
      return;
    }

    try {
      const result =
        await processStaffAction(
          client,
          action,
        );

      await actions.updateOne(
        {
          _id:
            action._id,
        },

        {
          $set: {
            status:
              'Completed',

            result,

            completedAt:
              new Date(),

            updatedAt:
              new Date(),

            error:
              null,
          },
        },
      );
    } catch (error) {
      await actions.updateOne(
        {
          _id:
            action._id,
        },

        {
          $set: {
            status:
              'Failed',

            error:
              error instanceof Error
                ? error.message
                : String(
                    error,
                  ),

            completedAt:
              new Date(),

            updatedAt:
              new Date(),
          },
        },
      );

      throw error;
    }
  } catch (error) {
    logger.error(
      `Staff action processor error: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  } finally {
    processorBusy =
      false;
  }
}

export function startStaffActionProcessor(
  client,
) {
  if (processorStarted) {
    return;
  }

  processorStarted =
    true;

  logger.info(
    'LCSO staff action processor started',
  );

  void processNextAction(
    client,
  );

  setInterval(
    () => {
      void processNextAction(
        client,
      );
    },
    1500,
  );
}
