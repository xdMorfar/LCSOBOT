import {
  EmbedBuilder,
} from 'discord.js';

import mongoose from 'mongoose';

import { logger } from '../utils/logger.js';

let processorStarted = false;
let processorRunning = false;

function getDb() {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error(
      'MongoDB is not connected.',
    );
  }

  return db;
}

function truncate(value, length = 1000) {
  const text = String(
    value ?? '',
  ).trim();

  if (!text) return 'N/A';

  if (text.length <= length) {
    return text;
  }

  return `${text.slice(
    0,
    Math.max(0, length - 3),
  )}...`;
}

function validImageUrl(value) {
  if (!value) return false;

  try {
    const url = new URL(value);

    return [
      'http:',
      'https:',
    ].includes(url.protocol);
  } catch {
    return false;
  }
}

function actorDisplay(input) {
  if (input.actorDiscordId) {
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
    client.guilds.cache.get(guildId);

  if (cached) return cached;

  return client.guilds.fetch(guildId);
}

async function getTextChannel(
  guild,
  channelId,
) {
  if (!channelId) {
    throw new Error(
      'Discord output channel has not been configured.',
    );
  }

  const channel =
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(
      channelId,
    ));

  if (
    !channel ||
    !channel.isTextBased() ||
    typeof channel.send !== 'function'
  ) {
    throw new Error(
      'Configured output channel is not a valid text channel.',
    );
  }

  return channel;
}

async function getDeputy(
  guildId,
  memberId,
) {
  return getDb()
    .collection('deputies')
    .findOne({
      guildId,
      discordId: memberId,
    });
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

  const guild = await getGuild(
    client,
    guildId,
  );

  const settings =
    await getDb()
      .collection(
        'staffactionsettings',
      )
      .findOne({
        guildId,
      });

  if (!settings) {
    throw new Error(
      'Staff action settings have not been configured.',
    );
  }

  const type =
    String(
      input.infractionType || '',
    ).toLowerCase() === 'strike'
      ? 'Strike'
      : 'Warning';

  const roleId =
    type === 'Strike'
      ? settings.strikeRoleId
      : settings.warningRoleId;

  if (!roleId) {
    throw new Error(
      `${type} role is not configured.`,
    );
  }

  const member =
    guild.members.cache.get(
      input.memberId,
    ) ||
    (await guild.members.fetch(
      input.memberId,
    ));

  if (!member) {
    throw new Error(
      'Discord member could not be found.',
    );
  }

  const deputy = await getDeputy(
    guildId,
    member.id,
  );

  if (!deputy) {
    throw new Error(
      'That member is not registered as LCSO personnel.',
    );
  }

  const role =
    guild.roles.cache.get(roleId) ||
    (await guild.roles.fetch(roleId));

  if (!role) {
    throw new Error(
      `${type} role no longer exists.`,
    );
  }

  if (!role.editable) {
    throw new Error(
      `The bot cannot assign the ${role.name} role. Move the bot role above it.`,
    );
  }

  await member.roles.add(
    role,
    `${type}: ${truncate(
      input.reason,
      400,
    )}`,
  );

  const now = new Date();

  const inserted =
    await getDb()
      .collection('infractions')
      .insertOne({
        guildId,
        deputyId:
          deputy._id ?? null,
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
          truncate(
            input.notes,
            1000,
          ) === 'N/A'
            ? null
            : truncate(
                input.notes,
                1000,
              ),
        roleId:
          role.id,
        issuedByDiscordId:
          input.actorDiscordId ??
          null,
        issuedByName:
          input.actorName ??
          null,
        source:
          input.source ??
          'Discord',
        active:
          true,
        createdAt:
          now,
        updatedAt:
          now,
      });

  const channel =
    await getTextChannel(
      guild,
      settings.infractionChannelId,
    );

  const actor =
    actorDisplay(input);

  const unix =
    Math.floor(
      now.getTime() / 1000,
    );

  const embed =
    new EmbedBuilder()
      .setColor(
        type === 'Strike'
          ? 0xed4245
          : 0xf0b232,
      )
      .setTitle(
        `🛠️ Liberty County Sheriff's Office | Staff Infraction - ${type}`,
      )
      .setDescription(
        'The **Liberty County Sheriff’s Office Command Staff** has deemed it necessary to issue an infraction. Please review department rules and regulations to avoid further consequences.',
      )
      .addFields(
        {
          name:
            '━━━ Infraction Information ━━━',
          value: [
            `↳ **Staff Member:** <@${member.id}>`,
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
          name: 'Issued',
          value: `<t:${unix}:F>`,
          inline: false,
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
    embed.setThumbnail(guildIcon);
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
    embeds: [embed],
    allowedMentions: {
      users: [
        member.id,
        input.actorDiscordId,
      ].filter(Boolean),
      roles: [],
    },
  });

  logger.info(
    `Issued ${type} to ${member.user.tag} (${inserted.insertedId})`,
  );

  return {
    infractionId:
      String(
        inserted.insertedId,
      ),
  };
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

  const guild = await getGuild(
    client,
    guildId,
  );

  const staffSettings =
    await getDb()
      .collection(
        'staffactionsettings',
      )
      .findOne({
        guildId,
      });

  if (
    !staffSettings?.promotionChannelId
  ) {
    throw new Error(
      'Promotion channel has not been configured.',
    );
  }

  const member =
    guild.members.cache.get(
      input.memberId,
    ) ||
    (await guild.members.fetch(
      input.memberId,
    ));

  if (!member) {
    throw new Error(
      'Discord member could not be found.',
    );
  }

  const deputy = await getDeputy(
    guildId,
    member.id,
  );

  if (!deputy) {
    throw new Error(
      'That member is not registered as LCSO personnel.',
    );
  }

  const targetRole =
    guild.roles.cache.get(
      input.targetRoleId,
    ) ||
    (await guild.roles.fetch(
      input.targetRoleId,
    ));

  if (!targetRole) {
    throw new Error(
      'The selected Discord role no longer exists.',
    );
  }

  if (!targetRole.editable) {
    throw new Error(
      `The bot cannot assign ${targetRole.name}. Move the bot role above it.`,
    );
  }

  const mainSettings =
    await getDb()
      .collection('settings')
      .findOne({
        guildId,
      });

  const configuredRankRoleIds =
    Array.isArray(
      mainSettings?.rankRoleIds,
    )
      ? mainSettings.rankRoleIds
      : [];

  const removableRoleIds =
    new Set(
      configuredRankRoleIds.filter(
        (roleId) =>
          roleId !==
            targetRole.id &&
          member.roles.cache.has(
            roleId,
          ),
      ),
    );

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
    const roleId of removableRoleIds
  ) {
    const role =
      guild.roles.cache.get(
        roleId,
      ) ||
      (await guild.roles
        .fetch(roleId)
        .catch(() => null));

    if (
      role &&
      !role.editable
    ) {
      throw new Error(
        `The bot cannot remove the old role ${role.name}. Move the bot role above it.`,
      );
    }
  }

  const previousRoleName =
    deputy.rankName ||
    deputy.rank ||
    'Unknown';

  if (
    removableRoleIds.size > 0
  ) {
    await member.roles.remove(
      [...removableRoleIds],
      `LCSO promotion to ${targetRole.name}`,
    );
  }

  await member.roles.add(
    targetRole,
    `LCSO promotion: ${truncate(
      input.reason,
      400,
    )}`,
  );

  const now = new Date();

  await getDb()
    .collection('deputies')
    .updateOne(
      {
        _id: deputy._id,
      },
      {
        $set: {
          rankRoleId:
            targetRole.id,
          rankName:
            targetRole.name,
          rank:
            targetRole.name,
          updatedAt: now,
        },
      },
    );

  const inserted =
    await getDb()
      .collection('promotions')
      .insertOne({
        guildId,
        deputyId:
          deputy._id,
        discordId:
          member.id,
        memberName:
          member.displayName,
        previousRoleId:
          deputy.rankRoleId ??
          null,
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
          truncate(
            input.notes,
            1000,
          ) === 'N/A'
            ? null
            : truncate(
                input.notes,
                1000,
              ),
        promotedByDiscordId:
          input.actorDiscordId ??
          null,
        promotedByName:
          input.actorName ??
          null,
        source:
          input.source ??
          'Discord',
        createdAt: now,
        updatedAt: now,
      });

  const channel =
    await getTextChannel(
      guild,
      staffSettings.promotionChannelId,
    );

  const actor =
    actorDisplay(input);

  const unix =
    Math.floor(
      now.getTime() / 1000,
    );

  const embed =
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(
        '🎉 Liberty County Sheriff’s Office | Staff Promotion',
      )
      .setDescription(
        'The **Liberty County Sheriff’s Office Command Staff** is pleased to recognize your hard work and professionalism with a promotion. Continue setting a strong example for the department.',
      )
      .addFields(
        {
          name:
            '━━━ Promotion Information ━━━',
          value: [
            `↳ **Staff Member:** <@${member.id}>`,
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
          name: 'Promoted',
          value: `<t:${unix}:F>`,
          inline: false,
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
    embed.setThumbnail(guildIcon);
  }

  if (
    validImageUrl(
      staffSettings.promotionBannerUrl,
    )
  ) {
    embed.setImage(
      staffSettings.promotionBannerUrl,
    );
  }

  await channel.send({
    content:
      `📝 **Signed by,** ${actor}`,
    embeds: [embed],
    allowedMentions: {
      users: [
        member.id,
        input.actorDiscordId,
      ].filter(Boolean),
      roles: [],
    },
  });

  logger.info(
    `Promoted ${member.user.tag} to ${targetRole.name} (${inserted.insertedId})`,
  );

  return {
    promotionId:
      String(
        inserted.insertedId,
      ),
  };
}

async function processAction(
  client,
  action,
) {
  const payload =
    action.payload || {};

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
      },
    );

    return;
  }

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
      },
    );

    return;
  }

  throw new Error(
    `Unsupported staff action type: ${action.type}`,
  );
}

async function processNext(
  client,
) {
  if (processorRunning) {
    return;
  }

  processorRunning = true;

  try {
    const actions =
      getDb().collection(
        'staffactions',
      );

    const claimed =
      await actions.findOneAndUpdate(
        {
          status: 'Pending',
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
      claimed?.value ??
      claimed;

    if (
      !action ||
      !action._id
    ) {
      return;
    }

    try {
      await processAction(
        client,
        action,
      );

      await actions.updateOne(
        {
          _id: action._id,
        },
        {
          $set: {
            status:
              'Completed',
            completedAt:
              new Date(),
            updatedAt:
              new Date(),
            error: null,
          },
        },
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      await actions.updateOne(
        {
          _id: action._id,
        },
        {
          $set: {
            status: 'Failed',
            error: message,
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
  } finally {
    processorRunning = false;
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
    'Staff action processor started',
  );

  void processNext(client);

  setInterval(() => {
    void processNext(client);
  }, 2000);
}
