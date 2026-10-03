import {
  ApplicationCommandOptionType,
} from 'discord.js';

import {
  logger,
} from '../utils/logger.js';


export function installStaffCommandOverrides() {
  logger.info(
    'Staff slash command handler ready',
  );
}


function upsertSubcommand(
  options,
  subcommandName,
  replacement,
) {
  const current =
    Array.isArray(options)
      ? [...options]
      : [];

  const index =
    current.findIndex(
      (option) =>
        option.type ===
          ApplicationCommandOptionType.Subcommand &&
        option.name ===
          subcommandName,
    );

  if (index === -1) {
    current.push(
      replacement,
    );

    return current;
  }

  current[index] =
    replacement;

  return current;
}


async function getGuildCommand(
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


  /* =========================================================
     /PROMOTION
     ========================================================= */

  const promotionCommand =
    await getGuildCommand(
      guild,
      'promotion',
    );

  if (promotionCommand) {
    const data =
      promotionCommand.toJSON();

    let options =
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
            'Staff member to promote',

          required:
            true,
        },

        /*
         * REAL DISCORD ROLE PICKER
         */
        {
          type:
            ApplicationCommandOptionType.Role,

          name:
            'rank',

          description:
            'New Discord rank',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'reason',

          description:
            'Reason for promotion',

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


    const demoteSubcommand = {
      type:
        ApplicationCommandOptionType.Subcommand,

      name:
        'demote',

      description:
        'Demote an LCSO staff member',

      options: [
        {
          type:
            ApplicationCommandOptionType.User,

          name:
            'member',

          description:
            'Staff member to demote',

          required:
            true,
        },

        /*
         * REAL DISCORD ROLE PICKER.
         *
         * No Cadet / Sergeant /
         * Lieutenant hardcoded list.
         */
        {
          type:
            ApplicationCommandOptionType.Role,

          name:
            'rank',

          description:
            'Discord rank to demote them to',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'reason',

          description:
            'Reason for demotion',

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


    options =
      upsertSubcommand(
        options,
        'promote',
        promoteSubcommand,
      );

    options =
      upsertSubcommand(
        options,
        'demote',
        demoteSubcommand,
      );


    await promotionCommand.edit({
      description:
        data.description,

      options,
    });


    logger.info(
      'Updated Discord forms for /promotion promote and /promotion demote',
    );
  }


  /* =========================================================
     /INFRACTION ADD
     ========================================================= */

  const infractionCommand =
    await getGuildCommand(
      guild,
      'infraction',
    );

  if (infractionCommand) {
    const data =
      infractionCommand.toJSON();

    let options =
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
            'Staff member',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'type',

          description:
            'Staff action type',

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
            'Reason for the staff action',

          required:
            true,
        },

        /*
         * Used for Demotion.
         *
         * This is also a REAL
         * Discord role picker.
         */
        {
          type:
            ApplicationCommandOptionType.Role,

          name:
            'rank',

          description:
            'New rank if type is Demotion',

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


    options =
      upsertSubcommand(
        options,
        'add',
        addSubcommand,
      );


    await infractionCommand.edit({
      description:
        data.description,

      options,
    });


    logger.info(
      'Updated Discord form for /infraction add',
    );
  }
}
