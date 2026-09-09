import {
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';

import mongoose from 'mongoose';

import { logger } from '../utils/logger.js';

let processorStarted = false;
let processorBusy = false;

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
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error(
      'MongoDB is not connected.',
    );
  }

  return db;
}

function truncate(
  value,
  maxLength = 1000,
) {
  const text = String(
    value ?? '',
  ).trim();

  if (!text) {
    return 'N/A';
  }

  if (
    text.length <= maxLength
  ) {
    return text;
  }

  return `${text.slice(
    0,
    Math.max(
      0,
      maxLength - 3,
    ),
  )}...`;
}

function validImageUrl(
  value,
) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(
      String(value),
    );

    return (
      url.protocol ===
        'https:' ||
      url.protocol ===
        'http:'
    );
  } catch {
    return false;
  }
}

function normalizeName(
  value,
) {
  return String(
    value ?? '',
  )
    .trim()
    .toLowerCase();
}

function actorLabel(
  input,
) {
  if (
    input.actorDiscordId
  ) {
    return `<@${input.actorDiscordId}>`;
  }

  return (
    input.actorName ||
    'LCSO Command Staff'
  );
}

async function getGuild(
  client,
  guildId,
) {
  const cached =
    client.guilds.cache.get(
      guildId,
    );

  if (cached) {
    return cached;
  }

  return client.guilds.fetch(
    guildId,
  );
}

async function getGeneralSettings(
  guildId,
) {
  return (
    await getDb()
      .collection('settings')
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
  ] = await Promise.all([
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

  const logChannels =
    general.logChannels || {};

  return {
    ...general,
    ...(staff || {}),

    promotionChannelId:
      staff?.promotionChannelId ||
      general.promotionChannelId ||
      logChannels.Promotions ||
      logChannels.promotions ||
      logChannels.Promotion ||
      logChannels.promotion ||
      null,

    infractionChannelId:
      staff?.infractionChannelId ||
      general.infractionChannelId ||
      logChannels.Infractions ||
      logChannels.infractions ||
      logChannels.Infraction ||
      logChannels.infraction ||
      null,

    warningRoleId:
      staff?.warningRoleId ||
      general.warningRoleId ||
      null,

    strikeRoleId:
      staff?.strikeRoleId ||
      general.strikeRoleId ||
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
    const configured =
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
      configured &&
      configured.isTextBased() &&
      typeof configured.send ===
        'function'
    ) {
      return configured;
    }
  }

  const wanted =
    fallbackNames.map(
      normalizeName,
    );

  const fallback =
    guild.channels.cache.find(
      (channel) => {
        if (
          !channel.isTextBased() ||
          typeof channel.send !==
            'function'
        ) {
          return false;
        }

        const name =
          normalizeName(
            channel.name,
          );

        return wanted.some(
          (wantedName) =>
            name ===
              wantedName ||
            name.includes(
              wantedName,
            ),
        );
      },
    );

  if (!fallback) {
    throw new Error(
      `Could not find the configured #${fallbackNames[0]} channel.`,
    );
  }

  return fallback;
}

async function findRole(
  guild,
  {
    roleId = null,
    roleName = null,
  } = {},
) {
  if (roleId) {
    const byId =
      guild.roles.cache.get(
        roleId,
      ) ||
      await guild.roles
        .fetch(roleId)
        .catch(
          () => null,
        );

    if (byId) {
      return byId;
    }
  }

  if (roleName) {
    const wanted =
      normalizeName(
        roleName,
      );

    const byName =
      guild.roles.cache.find(
        (role) =>
          normalizeName(
            role.name,
          ) === wanted,
      );

    if (byName) {
      return byName;
    }
  }

  return null;
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

export async function canManageStaffActions(
  guild,
  discordId,
) {
  const member =
    guild.members.cache.get(
      discordId,
    ) ||
    await guild.members
      .fetch(discordId)
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

  const dashboardAdminRoleIds =
    Array.isArray(
      settings.dashboardAdminRoleIds,
    )
      ? settings.dashboardAdminRoleIds
      : [];

  if (
    dashboardAdminRoleIds.some(
      (roleId) =>
        member.roles.cache.has(
          roleId,
        ),
    )
  ) {
    return true;
  }

  const deputy =
    await getDeputy(
      guild.id,
      discordId,
    );

  if (!deputy) {
    return false;
  }

  const rankName =
    deputy.rankName ||
    deputy.rank ||
    '';

  return STAFF_RANKS.some(
    (rank) =>
      normalizeName(rank) ===
      normalizeName(
        rankName,
      ),
  );
}

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

  const now =
    new Date();

  const timestamp =
    Math.floor(
      now.getTime() /
        1000,
    );

  const actor =
    actorLabel(input);

  const mainEmbed =
    new EmbedBuilder()
      .setColor(
        0x57f287,
      )
      .setTitle(
        '🎉 Liberty County Sheriff’s Office | Staff Promotion',
      )
      .setDescription(
        'The **Liberty County Sheriff’s Office Command Staff** is pleased to recognize your hard work and professionalism with a staff promotion. Continue setting a strong example for the department.',
      )
      .addFields(
        {
          name:
            '━━━ Promotion Information ━━━',

          value: [
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
          ].join('\n'),
        },

        {
          name:
            '🕒 Promoted',

          value:
            `<t:${timestamp}:F>`,

          inline:
            false,
        },
      )
      .setFooter({
        text:
          'Liberty County Sheriff’s Office • Springfield Roleplay',
      })
      .setTimestamp(now);

  const guildIcon =
    guild.iconURL({
      size: 256,
    });

  if (guildIcon) {
    mainEmbed.setThumbnail(
      guildIcon,
    );
  }

  const embeds = [];

  if (
    validImageUrl(
      settings.promotionBannerUrl,
    )
  ) {
    embeds.push(
      new EmbedBuilder()
        .setColor(
          0x57f287,
        )
        .setImage(
          settings.promotionBannerUrl,
        ),
    );
  }

  embeds.push(
    mainEmbed,
  );

  await channel.send({
    content:
      `📝 **Signed by,** ${actor}`,

    embeds,

    allowedMentions: {
      parse: [],
    },
  });

  return channel;
}

async function sendInfractionPost(
  guild,
  input,
  type,
  settings,
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

  const now =
    new Date();

  const timestamp =
    Math.floor(
      now.getTime() /
        1000,
    );

  const actor =
    actorLabel(input);

  const mainEmbed =
    new EmbedBuilder()
      .setColor(
        type === 'Strike'
          ? 0xed4245
          : 0xf0b232,
      )
      .setTitle(
        `🛠️ Liberty County Sheriff’s Office | Staff Infraction - ${type}`,
      )
      .setDescription(
        'The **Liberty County Sheriff’s Office Command Staff** has deemed it necessary to issue an infraction upon you for failing to follow department or community regulations. Please review the Rules & Regulations to avoid further consequences.',
      )
      .addFields(
        {
          name:
            '━━━ Infraction Information ━━━',

          value: [
            `↳ **Staff Member:** <@${input.memberId}>`,
            `↳ **Handler:** ${actor}`,
            `↳ **Infraction:** ${type}`,
            `↳ **Reason:** ${truncate(
              input.reason,
              700,
            )}`,
            `↳ **Notes:** ${truncate(
              input.notes,
              700,
            )}`,
          ].join('\n'),
        },

        {
          name:
            '🕒 Issued',

          value:
            `<t:${timestamp}:F>`,

          inline:
            false,
        },
      )
      .setFooter({
        text:
          'Liberty County Sheriff’s Office • Springfield Roleplay',
      })
      .setTimestamp(now);

  const guildIcon =
    guild.iconURL({
      size: 256,
    });

  if (guildIcon) {
    mainEmbed.setThumbnail(
      guildIcon,
    );
  }

  const embeds = [];

  if (
    validImageUrl(
      settings.infractionBannerUrl,
    )
  ) {
    embeds.push(
      new EmbedBuilder()
        .setColor(
          type === 'Strike'
            ? 0xed4245
            : 0xf0b232,
        )
        .setImage(
          settings.infractionBannerUrl,
        ),
    );
  }

  embeds.push(
    mainEmbed,
  );

  await channel.send({
    content:
      `📝 **Signed by,** ${actor}`,

    embeds,

    allowedMentions: {
      parse: [],
    },
  });

  return channel;
}

export async function promoteMember(
  client,
  input,
) {
  const guildId =
    input.guildId ||
    process.env.DISCORD_GUILD_ID;

  if (!guildId) {
    throw new Error(
      'DISCORD_GUILD_ID is missing.',
    );
  }

  if (!input.memberId) {
    throw new Error(
      'A Discord member is required.',
    );
  }

  if (!input.reason) {
    throw new Error(
      'A promotion reason is required.',
    );
  }

  const guild =
    await getGuild(
      client,
      guildId,
    );

  const [
    settings,
    deputy,
  ] = await Promise.all([
    getStaffSettings(
      guildId,
    ),

    getDeputy(
      guildId,
      input.memberId,
    ),
  ]);

  if (!deputy) {
    throw new Error(
      'That member is not registered as LCSO personnel.',
    );
  }

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
      {
        roleId:
          input.targetRoleId,

        roleName:
          input.targetRoleName,
      },
    );

  if (!targetRole) {
    throw new Error(
      'The selected Discord rank role could not be found.',
    );
  }

  if (
    targetRole.id ===
    guild.roles.everyone.id
  ) {
    throw new Error(
      '@everyone cannot be used as a department rank.',
    );
  }

  const configuredRankRoleIds =
    Array.isArray(
      settings.rankRoleIds,
    )
      ? settings.rankRoleIds
      : [];

  /*
   * If ranks have been configured in
   * Server Setup, ONLY those roles
   * are accepted as department ranks.
   */
  if (
    configuredRankRoleIds.length >
      0 &&
    !configuredRankRoleIds.includes(
      targetRole.id,
    )
  ) {
    throw new Error(
      `${targetRole.name} is not configured as an LCSO rank in Server Setup.`,
    );
  }

  /*
   * If the old setup does not contain
   * rank IDs yet, only allow the known
   * LCSO rank names.
   */
  if (
    configuredRankRoleIds.length ===
      0 &&
    !DEFAULT_RANK_NAMES.some(
      (rankName) =>
        normalizeName(
          rankName,
        ) ===
        normalizeName(
          targetRole.name,
        ),
    )
  ) {
    throw new Error(
      `${targetRole.name} is not recognized as an LCSO rank.`,
    );
  }

  if (!targetRole.editable) {
    throw new Error(
      `I cannot assign the ${targetRole.name} role. Move the LCSO Bot role above it.`,
    );
  }

  const removableRoleIds =
    new Set();

  if (
    configuredRankRoleIds.length >
    0
  ) {
    for (
      const roleId of
      configuredRankRoleIds
    ) {
      if (
        roleId !==
          targetRole.id &&
        member.roles.cache.has(
          roleId,
        )
      ) {
        removableRoleIds.add(
          roleId,
        );
      }
    }
  } else {
    for (
      const role of
      member.roles.cache.values()
    ) {
      if (
        role.id ===
        targetRole.id
      ) {
        continue;
      }

      const isRank =
        DEFAULT_RANK_NAMES.some(
          (rankName) =>
            normalizeName(
              rankName,
            ) ===
            normalizeName(
              role.name,
            ),
        );

      if (isRank) {
        removableRoleIds.add(
          role.id,
        );
      }
    }
  }

  if (
    deputy.rankRoleId &&
    deputy.rankRoleId !==
      targetRole.id &&
    member.roles.cache.has(
      deputy.rankRoleId,
    )
  ) {
    removableRoleIds.add(
      deputy.rankRoleId,
    );
  }

  for (
    const roleId of
    removableRoleIds
  ) {
    const role =
      guild.roles.cache.get(
        roleId,
      );

    if (
      role &&
      !role.editable
    ) {
      throw new Error(
        `I cannot remove the old rank ${role.name}. Move the LCSO Bot role above it.`,
      );
    }
  }

  const previousRoleId =
    deputy.rankRoleId ||
    null;

  const previousRoleName =
    deputy.rankName ||
    deputy.rank ||
    null;

  if (
    removableRoleIds.size >
    0
  ) {
    await member.roles.remove(
      [
        ...removableRoleIds,
      ],

      `LCSO promotion to ${targetRole.name}`,
    );
  }

  if (
    !member.roles.cache.has(
      targetRole.id,
    )
  ) {
    await member.roles.add(
      targetRole,

      `LCSO promotion: ${truncate(
        input.reason,
        400,
      )}`,
    );
  }

  const now =
    new Date();

  await getDb()
    .collection('deputies')
    .updateOne(
      {
        _id:
          deputy._id,
      },

      {
        $set: {
          rankRoleId:
            targetRole.id,

          rankName:
            targetRole.name,

          rank:
            targetRole.name,

          updatedAt:
            now,
        },
      },
    );

  const promotionResult =
    await getDb()
      .collection(
        'promotions',
      )
      .insertOne({
        guildId,

        deputyId:
          deputy._id,

        discordId:
          member.id,

        memberName:
          member.displayName,

        previousRoleId,

        previousRoleName,

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
          input.notes
            ? truncate(
                input.notes,
                1000,
              )
            : null,

        promotedByDiscordId:
          input.actorDiscordId ||
          null,

        promotedByName:
          input.actorName ||
          null,

        source:
          input.source ||
          'Unknown',

        createdAt:
          now,

        updatedAt:
          now,
      });

  const outputChannel =
    await sendPromotionPost(
      guild,
      {
        ...input,

        memberId:
          member.id,
      },
      targetRole,
      settings,
    );

  logger.info(
    `LCSO promotion completed: ${member.user.tag} -> ${targetRole.name}`,
  );

  return {
    promotionId:
      String(
        promotionResult.insertedId,
      ),

    channelId:
      outputChannel.id,

    roleId:
      targetRole.id,

    roleName:
      targetRole.name,
  };
}

export async function issueInfraction(
  client,
  input,
) {
  const guildId =
    input.guildId ||
    process.env.DISCORD_GUILD_ID;

  if (!guildId) {
    throw new Error(
      'DISCORD_GUILD_ID is missing.',
    );
  }

  if (!input.memberId) {
    throw new Error(
      'A Discord member is required.',
    );
  }

  if (!input.reason) {
    throw new Error(
      'An infraction reason is required.',
    );
  }

  const rawType =
    normalizeName(
      input.infractionType ||
      input.type,
    );

  let type;

  if (
    rawType === 'warning'
  ) {
    type = 'Warning';
  } else if (
    rawType === 'strike'
  ) {
    type = 'Strike';
  } else {
    throw new Error(
      'Infractions can only be Warning or Strike.',
    );
  }

  const guild =
    await getGuild(
      client,
      guildId,
    );

  const [
    settings,
    deputy,
  ] = await Promise.all([
    getStaffSettings(
      guildId,
    ),

    getDeputy(
      guildId,
      input.memberId,
    ),
  ]);

  if (!deputy) {
    throw new Error(
      'That member is not registered as LCSO personnel.',
    );
  }

  const member =
    guild.members.cache.get(
      input.memberId,
    ) ||
    await guild.members.fetch(
      input.memberId,
    );

  const configuredRoleId =
    type === 'Warning'
      ? settings.warningRoleId
      : settings.strikeRoleId;

  /*
   * If it has not been configured on
   * the dashboard yet, fall back to a
   * server role named Warning/Strike.
   */
  const role =
    await findRole(
      guild,
      {
        roleId:
          configuredRoleId,

        roleName:
          type,
      },
    );

  if (!role) {
    throw new Error(
      `The ${type} Discord role could not be found. Configure it on the Infractions dashboard page.`,
    );
  }

  if (!role.editable) {
    throw new Error(
      `I cannot assign the ${role.name} role. Move the LCSO Bot role above it.`,
    );
  }

  if (
    !member.roles.cache.has(
      role.id,
    )
  ) {
    await member.roles.add(
      role,

      `LCSO ${type}: ${truncate(
        input.reason,
        400,
      )}`,
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
          deputy._id,

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
          input.notes
            ? truncate(
                input.notes,
                1000,
              )
            : null,

        roleId:
          role.id,

        roleName:
          role.name,

        issuedByDiscordId:
          input.actorDiscordId ||
          null,

        issuedByName:
          input.actorName ||
          null,

        source:
          input.source ||
          'Unknown',

        active:
          true,

        removedBy:
          null,

        removedAt:
          null,

        removalReason:
          null,

        createdAt:
          now,

        updatedAt:
          now,
      });

  const outputChannel =
    await sendInfractionPost(
      guild,
      {
        ...input,

        memberId:
          member.id,
      },
      type,
      settings,
    );

  logger.info(
    `LCSO ${type} issued to ${member.user.tag}`,
  );

  return {
    infractionId:
      String(
        result.insertedId,
      ),

    channelId:
      outputChannel.id,

    roleId:
      role.id,

    roleName:
      role.name,

    type,
  };
}

async function processStaffAction(
  client,
  action,
) {
  const payload =
    action.payload || {};

  if (
    action.type ===
    'PROMOTE_MEMBER'
  ) {
    await promoteMember(
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

    return;
  }

  if (
    action.type ===
    'ISSUE_INFRACTION'
  ) {
    await issueInfraction(
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

    return;
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

  processorBusy = true;

  try {
    const collection =
      getDb().collection(
        'staffactions',
      );

    const claimed =
      await collection
        .findOneAndUpdate(
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
              createdAt:
                1,
            },

            returnDocument:
              'after',
          },
        );

    const action =
      claimed?.value ||
      claimed;

    if (
      !action ||
      !action._id
    ) {
      return;
    }

    try {
      const result =
        await processStaffAction(
          client,
          action,
        );

      await collection.updateOne(
        {
          _id:
            action._id,
        },

        {
          $set: {
            status:
              'Completed',

            result:
              result ||
              null,

            error:
              null,

            completedAt:
              new Date(),

            updatedAt:
              new Date(),
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await collection.updateOne(
        {
          _id:
            action._id,
        },

        {
          $set: {
            status:
              'Failed',

            error:
              message,

            completedAt:
              new Date(),

            updatedAt:
              new Date(),
          },
        },
      );

      logger.error(
        `Staff action failed: ${message}`,
      );
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
    processorBusy = false;
  }
}

export function startStaffActionProcessor(
  client,
) {
  if (processorStarted) {
    return;
  }

  processorStarted = true;

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
