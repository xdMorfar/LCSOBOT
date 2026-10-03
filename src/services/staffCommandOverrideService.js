import {
  ApplicationCommandOptionType,
} from 'discord.js';

import {
  logger,
} from '../utils/logger.js';

/*
 * We no longer override client.commands here.
 *
 * interactionCreate.js handles the actual
 * promotion / infraction execution.
 *
 * This function stays because ready.js
 * already imports it.
 */
export function installStaffCommandOverrides() {
  logger.info(
    'Staff slash command handler ready',
  );
}

function replaceSubcommand(
  options,
  subcommandName,
  replacement,
) {
  return options.map(
    (option) => {
      if (
        option.type ===
          ApplicationCommandOptionType.Subcommand &&
        option.name ===
          subcommandName
      ) {
        return replacement;
      }

      return option;
    },
  );
}

async function getGuildCommand(
  client,
  guild,
  commandName,
) {
  const commands =
    await guild.commands.fetch();

  return (
    commands.find(
      (command) =>
        command.name ===
        commandName,
    ) ||
    null
  );
}

export async function patchStaffCommandSchemas(
  client,
) {
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

  /* =======================================================
     /promotion promote
     ======================================================= */

  const promotionCommand =
    await getGuildCommand(
      client,
      guild,
      'promotion',
    );

  if (promotionCommand) {
    const data =
      promotionCommand.toJSON();

    const options =
      Array.isArray(
        data.options,
      )
        ? data.options
        : [];

    const promoteSubcommand = {
      type:
        ApplicationCommandOptionType.Subcommand,

      name:
        'promote',

      description:
        'Promote an LCSO staff member',

      options: [
        {
          type:
            ApplicationCommandOptionType.User,

          name:
            'member',

          description:
            'The staff member to promote',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.Role,

          name:
            'rank',

          description:
            'The new LCSO rank',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'reason',

          description:
            'Reason for the promotion',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'notes',

          description:
            'Optional notes',

          required:
            false,
        },
      ],
    };

    await promotionCommand.edit({
      description:
        data.description,

      options:
        replaceSubcommand(
          options,
          'promote',
          promoteSubcommand,
        ),
    });

    logger.info(
      'Updated Discord form for /promotion promote',
    );
  }

  /* =======================================================
     /infraction add
     ======================================================= */

  const infractionCommand =
    await getGuildCommand(
      client,
      guild,
      'infraction',
    );

  if (infractionCommand) {
    const data =
      infractionCommand.toJSON();

    const options =
      Array.isArray(
        data.options,
      )
        ? data.options
        : [];

    const addSubcommand = {
      type:
        ApplicationCommandOptionType.Subcommand,

      name:
        'add',

      description:
        'Issue an LCSO staff infraction',

      options: [
        {
          type:
            ApplicationCommandOptionType.User,

          name:
            'member',

          description:
            'The staff member',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'type',

          description:
            'Infraction type',

          required:
            true,

          choices: [
            {
              name:
                'Warning',

              value:
                'Warning',
            },

            {
              name:
                'Strike',

              value:
                'Strike',
            },

            {
              name:
                'Demotion',

              value:
                'Demotion',
            },

            {
              name:
                'Termination',

              value:
                'Termination',
            },
          ],
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'reason',

          description:
            'Reason for the infraction',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.Role,

          name:
            'rank',

          description:
            'New rank — only required for Demotion',

          required:
            false,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'notes',

          description:
            'Optional notes',

          required:
            false,
        },
      ],
    };

    await infractionCommand.edit({
      description:
        data.description,

      options:
        replaceSubcommand(
          options,
          'add',
          addSubcommand,
        ),
    });

    logger.info(
      'Updated Discord form for /infraction add',
    );
  }
}
