import {
  ApplicationCommandOptionType,
} from 'discord.js';

import mongoose from 'mongoose';

import {
  logger,
} from '../utils/logger.js';

let syncStarted = false;
let syncRunning = false;
let indexesCleaned = false;

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


/* =========================================================
   CLEAN OLD DEPUTY DATABASE INDEXES
   ========================================================= */

async function cleanOldDeputyIndexes() {
  if (indexesCleaned) {
    return;
  }

  const db =
    getDb();

  const collection =
    db.collection(
      'deputies',
    );

  try {
    const indexes =
      await collection
        .indexes()
        .catch(
          () => [],
        );

    const oldBadgeIndex =
      indexes.find(
        (index) =>
          index.name ===
          'guildId_1_badgeNumber_1',
      );

    if (oldBadgeIndex) {
      await collection.dropIndex(
        'guildId_1_badgeNumber_1',
      );

      logger.info(
        'Removed obsolete deputy badgeNumber index',
      );
    }

    /*
     * Discord ID is now the thing
     * that uniquely identifies
     * personnel inside a server.
     */
    const refreshedIndexes =
      await collection
        .indexes()
        .catch(
          () => [],
        );

    const discordIndexExists =
      refreshedIndexes.some(
        (index) =>
          index.name ===
          'guildId_1_discordId_1',
      );

    if (!discordIndexExists) {
      await collection.createIndex(
        {
          guildId:
            1,

          discordId:
            1,
        },

        {
          unique:
            true,

          name:
            'guildId_1_discordId_1',
        },
      );

      logger.info(
        'Created deputy Discord ID index',
      );
    }

    indexesCleaned =
      true;
  } catch (error) {
    logger.error(
      `Could not clean deputy indexes: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }
}


/* =========================================================
   SETTINGS
   ========================================================= */

async function getSettings(
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


/* =========================================================
   FIND MEMBER RANK
   ========================================================= */

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
          member.guild.roles
            .everyone.id,
      )
      .sort(
        (a, b) =>
          b.position -
          a.position,
      );

  /*
   * First use configured LCSO
   * rank roles.
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
   * Fallback to rank names.
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


/* =========================================================
   CREATE / UPDATE PERSONNEL AUTOMATICALLY
   ========================================================= */

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

  await cleanOldDeputyIndexes();

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

        status:
          'Active',

        updatedAt:
          now,
      },

      /*
       * Remove old badge-number field
       * completely if it exists.
       */
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

  return deputies.findOne({
    guildId:
      guild.id,

    discordId:
      member.id,
  });
}


/* =========================================================
   FULL SERVER PERSONNEL SYNC
   ========================================================= */

export async function syncPersonnelForGuild(
  guild,
) {
  await cleanOldDeputyIndexes();

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


/* =========================================================
   SYNC RUNNER
   ========================================================= */

async function runSync(
  client,
) {
  if (syncRunning) {
    return;
  }

  syncRunning =
    true;

  try {
    await cleanOldDeputyIndexes();

    const guildId =
      process.env
        .DISCORD_GUILD_ID;

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
    syncRunning =
      false;
  }
}


/* =========================================================
   START AUTO SYNC
   ========================================================= */

export function startPersonnelSync(
  client,
) {
  if (syncStarted) {
    return;
  }

  syncStarted =
    true;

  logger.info(
    'LCSO personnel auto sync started',
  );

  void runSync(
    client,
  );

  setInterval(
    () => {
      void runSync(
        client,
      );
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
  const guildCommands =
    await guild.commands.fetch();

  const guildCommand =
    guildCommands.find(
      (command) =>
        command.name ===
        name,
    );

  if (guildCommand) {
    return guildCommand;
  }

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


/* =========================================================
   REMOVE OLD /DEPUTY ADD COMMAND
   ========================================================= */

export async function removeDeputyAddCommand(
  client,
) {
  const guildId =
    process.env
      .DISCORD_GUILD_ID;

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
