import http from 'node:http';
import path from 'node:path';

import {
  fileURLToPath,
} from 'node:url';

import {
  Events,
} from 'discord.js';

import mongoose from 'mongoose';

import {
  env,
} from './config/env.js';

import {
  connectDatabase,
} from './database/connect.js';

import {
  createClient,
} from './bot/createClient.js';

import {
  loadCommands,
} from './bot/loadCommands.js';

import {
  loadEvents,
} from './bot/loadEvents.js';

import {
  logger,
} from './utils/logger.js';

import {
  startDashboardActionProcessor,
} from './services/dashboardActionService.js';


const __dirname =
  path.dirname(
    fileURLToPath(
      import.meta.url,
    ),
  );


const client =
  createClient();


const commands =
  await loadCommands(
    path.join(
      __dirname,
      'bot',
      'commands',
    ),
  );


const context = {
  commands,
};


await loadEvents(
  client,
  path.join(
    __dirname,
    'bot',
    'events',
  ),
  context,
);


/* =========================================================
   DISCORD SNAPSHOT
   ========================================================= */

async function syncDashboardSnapshot() {
  if (
    !mongoose.connection.db
  ) {
    throw new Error(
      'MongoDB database is not ready.',
    );
  }

  const guild =
    client.guilds.cache.get(
      env.DISCORD_GUILD_ID,
    );

  if (!guild) {
    throw new Error(
      `Discord guild ${env.DISCORD_GUILD_ID} is not available.`,
    );
  }


  const roles =
    guild.roles.cache;


  const channels =
    guild.channels.cache;


  const roleRows =
    [...roles.values()]
      .map(
        (role) => ({
          id:
            role.id,

          name:
            role.name,

          position:
            role.position,

          color:
            role.hexColor,

          managed:
            role.managed,
        }),
      )
      .sort(
        (a, b) =>
          b.position -
          a.position,
      );


  const channelRows =
    [...channels.values()]
      .filter(Boolean)
      .map(
        (channel) => ({
          id:
            channel.id,

          name:
            channel.name,

          type:
            channel.type,

          parentId:
            channel.parentId ??
            null,

          position:
            channel.rawPosition ??
            0,
        }),
      )
      .sort(
        (a, b) =>
          a.position -
          b.position,
      );


  const now =
    new Date();


  const collection =
    mongoose.connection.db.collection(
      'guildsnapshots',
    );


  await collection.updateOne(
    {
      guildId:
        guild.id,
    },

    {
      $set: {
        guildId:
          guild.id,

        name:
          guild.name,

        icon:
          guild.iconURL() ??
          null,

        roles:
          roleRows,

        channels:
          channelRows,

        syncedAt:
          now,

        updatedAt:
          now,
      },

      $setOnInsert: {
        createdAt:
          now,
      },
    },

    {
      upsert:
        true,
    },
  );


  logger.info(
    'DASHBOARD SNAPSHOT SYNCED',
    {
      database:
        mongoose.connection.name,

      collection:
        'guildsnapshots',

      guild:
        guild.name,

      guildId:
        guild.id,

      roles:
        roleRows.length,

      channels:
        channelRows.length,
    },
  );
}


/* =========================================================
   HEALTH SERVER
   ========================================================= */

const server =
  http.createServer(
    async (
      req,
      res,
    ) => {
      if (
        req.url ===
          '/health' ||
        req.url ===
          '/'
      ) {
        res.writeHead(
          200,
          {
            'content-type':
              'application/json',
          },
        );

        res.end(
          JSON.stringify({
            ok:
              true,

            bot:
              client.user?.tag ??
              null,

            discordReady:
              client.isReady(),

            mongoConnected:
              mongoose.connection
                .readyState ===
              1,

            database:
              mongoose.connection
                .name ??
              null,
          }),
        );

        return;
      }


      res.writeHead(
        404,
      );

      res.end(
        'Not found',
      );
    },
  );


server.listen(
  env.PORT,
  '0.0.0.0',
  () => {
    logger.info(
      `Health server listening on 0.0.0.0:${env.PORT}`,
    );
  },
);


/* =========================================================
   START
   ========================================================= */

async function start() {
  /*
   * Connect MongoDB first.
   */
  await connectDatabase();


  /*
   * Wait until Discord is actually ready.
   */
  const readyPromise =
    client.isReady()
      ? Promise.resolve()
      : new Promise(
          (resolve) => {
            client.once(
              Events.ClientReady,
              resolve,
            );
          },
        );


  await client.login(
    env.DISCORD_TOKEN,
  );


  await readyPromise;


  logger.info(
    'Discord connection ready - starting dashboard services',
  );


  /*
   * IMPORTANT:
   *
   * Start the dashboard action processor DIRECTLY.
   *
   * This is what was missing.
   */
  startDashboardActionProcessor(
    client,
  );


  /*
   * Initial Discord -> dashboard snapshot.
   */
  try {
    await syncDashboardSnapshot();
  } catch (error) {
    logger.error(
      'INITIAL DASHBOARD SNAPSHOT FAILED',
      {
        error:
          error?.stack ??
          error?.message ??
          String(error),
      },
    );
  }


  /*
   * Keep roles/channels updated.
   */
  const snapshotTimer =
    setInterval(
      async () => {
        try {
          await syncDashboardSnapshot();
        } catch (error) {
          logger.error(
            'DASHBOARD SNAPSHOT REFRESH FAILED',
            {
              error:
                error?.stack ??
                error?.message ??
                String(error),
            },
          );
        }
      },

      60000,
    );


  snapshotTimer.unref();
}


/* =========================================================
   SHUTDOWN
   ========================================================= */

async function shutdown(
  signal,
) {
  logger.info(
    `Received ${signal}; shutting down`,
  );


  server.close();


  client.destroy();


  await mongoose
    .disconnect()
    .catch(
      () => null,
    );


  process.exit(
    0,
  );
}


process.on(
  'SIGTERM',
  () =>
    shutdown(
      'SIGTERM',
    ),
);


process.on(
  'SIGINT',
  () =>
    shutdown(
      'SIGINT',
    ),
);


process.on(
  'unhandledRejection',
  (error) => {
    logger.error(
      'Unhandled rejection',
      {
        error:
          error?.stack ??
          String(error),
      },
    );
  },
);


process.on(
  'uncaughtException',
  (error) => {
    logger.error(
      'Uncaught exception',
      {
        error:
          error.stack ??
          error.message,
      },
    );


    process.exit(
      1,
    );
  },
);


start().catch(
  (error) => {
    logger.error(
      'Startup failed',
      {
        error:
          error.stack ??
          error.message,
      },
    );


    process.exit(
      1,
    );
  },
);
