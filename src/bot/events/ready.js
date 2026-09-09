import {
  Events,
  ActivityType,
} from 'discord.js';

import {
  logger,
} from '../../utils/logger.js';

import {
  startLoaScheduler,
} from '../../services/loaService.js';

import {
  startStaffActionProcessor,
} from '../../services/staffActionService.js';

import {
  installStaffCommandOverrides,
  patchStaffCommandSchemas,
} from '../../services/staffCommandOverrideService.js';

export default {
  name:
    Events.ClientReady,

  once:
    true,

  async execute(client) {
    logger.info(
      `Discord bot ready as ${client.user.tag}`,
    );

    client.user.setActivity(
      'Liberty County Sheriff’s Office',
      {
        type:
          ActivityType.Watching,
      },
    );

    /*
     * Existing LOA scheduler.
     */
    startLoaScheduler(
      client,
    );

    /*
     * Processes Promotion / Infraction
     * requests coming from the website.
     */
    startStaffActionProcessor(
      client,
    );

    /*
     * Replaces ONLY:
     *
     * /promotion promote
     * /infraction add
     *
     * Other old subcommands remain intact.
     */
    installStaffCommandOverrides(
      client,
    );

    /*
     * Updates the actual Discord slash
     * command forms.
     *
     * Promotion -> real Discord Role picker
     * Infraction -> Warning / Strike only
     */
    try {
      await patchStaffCommandSchemas(
        client,
      );
    } catch (error) {
      logger.error(
        `Could not update staff slash command forms: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  },
};
