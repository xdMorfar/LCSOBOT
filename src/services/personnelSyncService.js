import {
  ApplicationCommandOptionType,
} from 'discord.js';

import mongoose from 'mongoose';

import {
  logger,
} from '../utils/logger.js';

let syncStarted = false;
let syncRunning = false;

const FALLBACK_RANK_NAMES = [
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

function getDb() {
  const db =
    mongoose.connection.db;

  if (!db) {
    throw new Error(
      'MongoDB is not connected.',
    );
  }

  return db;
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

async function getSettings(
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

function findMemberRank(
  member,
  configuredRoleIds = [],
) {
  const memberRoles =
    [
      ...member.roles.cache.values(),
    ]
      .filter(
        (role) =>
          role.id !==
          member.guild.roles.everyone.id,
      )
      .sort(
        (a, b) =>
          b.position -
          a.position,
      );

  /*
   * Preferred:
   * Roles configured as LCSO ranks.
   */
  if (
    configuredRoleIds.length >
    0
  ) {
    for (
      const role of
      memberRoles
    ) {
      if (
        configuredRoleIds.includes(
          role.id,
        )
      ) {
        return role;
      }
    }
  }

  /*
   * Fallback:
   * Standard rank names.
   */
  for (
    const role of
    memberRoles
  ) {
    const matches =
      FALLBACK_RANK_NAMES.some(
        (rankName) =>
          normalizeName(
            rankName,
          ) ===
          normalizeName(
            role.name,
          ),
      );

    if (matches) {
      return role;
    }
  }

  return null;
}

export async function ensureDeputyForMember(
  guild,
  member,
  forcedRankRole = null,
) {
  if (
    !member ||
    member.user?.bot
  ) {
    return null;
  }

  const settings =
    await getSettings(
      guild.id,
    );

  const configuredRoleIds =
    Array.isArray(
      settings.rankRoleIds,
    )
      ? settings.rankRoleIds
      : [];

  const rankRole =
    forcedRankRole ||
    findMemberRank(
      member,
      configuredRoleIds,
    );

  if (!rankRole) {
    return null;
  }

  const deputies =
    getDb().collection(
      'deputies',
    );

  const now =
    new Date();

  await deputies.updateOne(
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

        status:
          'Active',
      },

      $set: {
        displayName:
          member.displayName,

        rankRoleId:
          rankRole.id,

        rankName:
          rankRole.name,

        rank:
          rankRole.name,

        updatedAt:
          now,
      },
    },

    {
      upsert:
        true,
    },
  );

  return deputies.findOne({
    guildId:
      guild.id,

    discordId:
      member.id,
  });
}

export async function syncPersonnelForGuild(
  guild,
) {
  const settings =
    await getSettings(
      guild.id,
    );

  const configuredRoleIds =
    Array.isArray(
      settings.rankRoleIds,
    )
      ? settings.rankRoleIds
      : [];

  /*
   * Fetch current Discord members.
   */
  await guild.members
    .fetch()
    .catch(
      () => null,
    );

  let synced = 0;

  for (
    const member of
    guild.members.cache.values()
  ) {
    if (
      member.user.bot
    ) {
      continue;
    }

    const rankRole =
      findMemberRank(
        member,
        configuredRoleIds,
      );

    if (!rankRole) {
      continue;
    }

    await ensureDeputyForMember(
      guild,
      member,
      rankRole,
    );

    synced += 1;
  }

  logger.info(
    `Personnel sync completed: ${synced} LCSO members`,
  );

  return synced;
}

async function runSync(
  client,
) {
  if (syncRunning) {
    return;
  }

  syncRunning = true;

  try {
    const guildId =
      process.env.DISCORD_GUILD_ID;

    if (!guildId) {
      throw new Error(
        'DISCORD_GUILD_ID is missing.',
      );
    }

    const guild =
      client.guilds.cache.get(
        guildId,
      ) ||
      await client.guilds.fetch(
        guildId,
      );

    await syncPersonnelForGuild(
      guild,
    );
  } catch (error) {
    logger.error(
      `Personnel sync failed: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  } finally {
    syncRunning = false;
  }
}

export function startPersonnelSync(
  client,
) {
  if (syncStarted) {
    return;
  }

  syncStarted = true;

  logger.info(
    'LCSO personnel auto sync started',
  );

  /*
   * Sync immediately.
   */
  void runSync(client);

  /*
   * Keep the roster synced every minute.
   */
  setInterval(
    () => {
      void runSync(client);
    },
    60 * 1000,
  );
}


/* =========================================================
   REMOVE /DEPUTY ADD
   ========================================================= */

async function findDiscordCommand(
  client,
  guild,
  name,
) {
  /*
   * Your bot normally uses guild
   * commands, so check those first.
   */
  const guildCommands =
    await guild.commands.fetch();

  const guildCommand =
    guildCommands.find(
      (command) =>
        command.name === name,
    );

  if (guildCommand) {
    return guildCommand;
  }

  /*
   * Fallback in case the command was
   * registered globally.
   */
  if (
    client.application
  ) {
    const globalCommands =
      await client.application
        .commands
        .fetch();

    return (
      globalCommands.find(
        (command) =>
          command.name ===
          name,
      ) ||
      null
    );
  }

  return null;
}

export async function removeDeputyAddCommand(
  client,
) {
  const guildId =
    process.env.DISCORD_GUILD_ID;

  if (!guildId) {
    return;
  }

  const guild =
    client.guilds.cache.get(
      guildId,
    ) ||
    await client.guilds.fetch(
      guildId,
    );

  const command =
    await findDiscordCommand(
      client,
      guild,
      'deputy',
    );

  if (!command) {
    logger.warn(
      '/deputy command could not be found.',
    );

    return;
  }

  const json =
    command.toJSON();

  const currentOptions =
    Array.isArray(
      json.options,
    )
      ? json.options
      : [];

  const optionsWithoutAdd =
    currentOptions.filter(
      (option) =>
        !(
          option.type ===
            ApplicationCommandOptionType.Subcommand &&
          option.name ===
            'add'
        ),
    );

  if (
    optionsWithoutAdd.length ===
    currentOptions.length
  ) {
    logger.info(
      '/deputy add is already removed',
    );

    return;
  }

  await command.edit({
    description:
      json.description,

    options:
      optionsWithoutAdd,
  });

  logger.info(
    'Removed /deputy add from Discord',
  );
}
