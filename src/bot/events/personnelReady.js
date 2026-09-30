import {
  Events,
} from 'discord.js';

import {
  removeDeputyAddCommand,
  startPersonnelSync,
} from '../../services/personnelSyncService.js';

import {
  logger,
} from '../../utils/logger.js';

export default {
  name:
    Events.ClientReady,

  once:
    true,

  async execute(
    client,
  ) {
    startPersonnelSync(
      client,
    );

    try {
      await removeDeputyAddCommand(
        client,
      );
    } catch (error) {
      logger.error(
        `Could not remove /deputy add: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  },
};
