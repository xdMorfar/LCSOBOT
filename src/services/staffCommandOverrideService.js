import {
  ApplicationCommandOptionType,
} from 'discord.js';

import {
  canManageStaffActions,
  issueInfraction,
  promoteMember,
} from './staffActionService.js';

import {
  logger,
} from '../utils/logger.js';

function flattenOptions(
  options,
  output = [],
) {
  if (!Array.isArray(options)) {
    return output;
  }

  for (
    const option of options
  ) {
    output.push(option);

    if (
      Array.isArray(
        option.options,
      )
    ) {
      flattenOptions(
        option.options,
        output,
      );
    }
  }

  return output;
}

function getInteractionOptions(
  interaction,
) {
  return flattenOptions(
    interaction.options?.data ||
      [],
  );
}

function getUserId(
  interaction,
) {
  const options =
    getInteractionOptions(
      interaction,
    );

  const userOption =
    options.find(
      (option) =>
        option.type ===
        ApplicationCommandOptionType.User,
    );

  if (
    userOption?.user?.id
  ) {
    return userOption.user.id;
  }

  if (
    userOption?.value
  ) {
    return String(
      userOption.value,
    );
  }

  return null;
}

function getRole(
  interaction,
) {
  const options =
    getInteractionOptions(
      interaction,
    );

  const roleOption =
    options.find(
      (option) =>
        option.type ===
        ApplicationCommandOptionType.Role,
    );

  if (!roleOption) {
    return null;
  }

  return (
    roleOption.role ||
    interaction.guild?.roles
      ?.cache
      ?.get(
        String(
          roleOption.value,
        ),
      ) ||
    null
  );
}

function getStringOption(
  interaction,
  names,
) {
  const options =
    getInteractionOptions(
      interaction,
    );

  for (
    const name of names
  ) {
    const option =
      options.find(
        (item) =>
          item.type ===
            ApplicationCommandOptionType.String &&
          item.name ===
            name,
      );

    if (
      option?.value !==
      undefined
    ) {
      return String(
        option.value,
      ).trim();
    }
  }

  return '';
}

function findRankString(
  interaction,
) {
  const options =
    getInteractionOptions(
      interaction,
    );

  const explicit =
    getStringOption(
      interaction,
      [
        'rank',
        'newrank',
        'new_rank',
        'new-role',
        'new_role',
        'role',
      ],
    );

  if (explicit) {
    return explicit;
  }

  const ignoredNames =
    new Set([
      'reason',
      'notes',
      'note',
    ]);

  const possible =
    options.find(
      (item) =>
        item.type ===
          ApplicationCommandOptionType.String &&
        !ignoredNames.has(
          item.name,
        ),
    );

  return possible?.value
    ? String(
        possible.value,
      ).trim()
    : '';
}

async function ephemeralError(
  interaction,
  message,
) {
  if (
    interaction.deferred ||
    interaction.replied
  ) {
    await interaction
      .editReply({
        content:
          `❌ ${message}`,
      })
      .catch(
        () => {},
      );

    return;
  }

  await interaction
    .reply({
      content:
        `❌ ${message}`,

      ephemeral:
        true,
    })
    .catch(
      () => {},
    );
}

async function handlePromotion(
  interaction,
) {
  await interaction.deferReply({
    ephemeral:
      true,
  });

  if (!interaction.guild) {
    await interaction.editReply({
      content:
        '❌ This command can only be used inside the LCSO Discord server.',
    });

    return;
  }

  const allowed =
    await canManageStaffActions(
      interaction.guild,
      interaction.user.id,
    );

  if (!allowed) {
    await interaction.editReply({
      content:
        '❌ You do not have permission to promote LCSO personnel.',
    });

    return;
  }

  const memberId =
    getUserId(
      interaction,
    );

  const selectedRole =
    getRole(
      interaction,
    );

  const oldRankString =
    findRankString(
      interaction,
    );

  const reason =
    getStringOption(
      interaction,
      [
        'reason',
      ],
    );

  const notes =
    getStringOption(
      interaction,
      [
        'notes',
        'note',
      ],
    );

  if (!memberId) {
    await interaction.editReply({
      content:
        '❌ Select the member you want to promote.',
    });

    return;
  }

  if (
    !selectedRole &&
    !oldRankString
  ) {
    await interaction.editReply({
      content:
        '❌ Select the new Discord rank.',
    });

    return;
  }

  if (!reason) {
    await interaction.editReply({
      content:
        '❌ A promotion reason is required.',
    });

    return;
  }

  try {
    const result =
      await promoteMember(
        interaction.client,
        {
          guildId:
            interaction.guild.id,

          memberId,

          targetRoleId:
            selectedRole?.id ||
            null,

          targetRoleName:
            selectedRole?.name ||
            oldRankString ||
            null,

          reason,

          notes,

          actorDiscordId:
            interaction.user.id,

          actorName:
            interaction.member
              ?.displayName ||
            interaction.user.username,

          source:
            'Discord Slash Command',
        },
      );

    await interaction.editReply({
      content:
        `✅ **Promotion confirmed.** The promotion has been posted in <#${result.channelId}>.`,
    });
  } catch (error) {
    await ephemeralError(
      interaction,
      error instanceof Error
        ? error.message
        : String(error),
    );
  }
}

async function handleInfraction(
  interaction,
) {
  await interaction.deferReply({
    ephemeral:
      true,
  });

  if (!interaction.guild) {
    await interaction.editReply({
      content:
        '❌ This command can only be used inside the LCSO Discord server.',
    });

    return;
  }

  const allowed =
    await canManageStaffActions(
      interaction.guild,
      interaction.user.id,
    );

  if (!allowed) {
    await interaction.editReply({
      content:
        '❌ You do not have permission to issue LCSO infractions.',
    });

    return;
  }

  const memberId =
    getUserId(
      interaction,
    );

  const type =
    getStringOption(
      interaction,
      [
        'type',
        'infraction',
        'level',
      ],
    );

  const reason =
    getStringOption(
      interaction,
      [
        'reason',
      ],
    );

  const notes =
    getStringOption(
      interaction,
      [
        'notes',
        'note',
      ],
    );

  if (!memberId) {
    await interaction.editReply({
      content:
        '❌ Select the member receiving the infraction.',
    });

    return;
  }

  if (
    ![
      'warning',
      'strike',
    ].includes(
      type.toLowerCase(),
    )
  ) {
    await interaction.editReply({
      content:
        '❌ The infraction must be either Warning or Strike.',
    });

    return;
  }

  if (!reason) {
    await interaction.editReply({
      content:
        '❌ An infraction reason is required.',
    });

    return;
  }

  try {
    const result =
      await issueInfraction(
        interaction.client,
        {
          guildId:
            interaction.guild.id,

          memberId,

          infractionType:
            type,

          reason,

          notes,

          actorDiscordId:
            interaction.user.id,

          actorName:
            interaction.member
              ?.displayName ||
            interaction.user.username,

          source:
            'Discord Slash Command',
        },
      );

    await interaction.editReply({
      content:
        `✅ **${result.type} confirmed.** The infraction has been posted in <#${result.channelId}>.`,
    });
  } catch (error) {
    await ephemeralError(
      interaction,
      error instanceof Error
        ? error.message
        : String(error),
    );
  }
}

function overrideCommand(
  client,
  commandName,
  subcommandName,
  handler,
) {
  const command =
    client.commands?.get(
      commandName,
    );

  if (!command) {
    logger.warn(
      `Could not override /${commandName}: command is not loaded in client.commands`,
    );

    return;
  }

  if (
    command.__lcsoStaffOverride
  ) {
    return;
  }

  const oldExecute =
    command.execute;

  if (
    typeof oldExecute !==
    'function'
  ) {
    logger.warn(
      `Could not override /${commandName}: command has no execute function`,
    );

    return;
  }

  command.execute =
    async function (
      ...args
    ) {
      const interaction =
        args[0];

      let subcommand =
        null;

      try {
        subcommand =
          interaction.options
            ?.getSubcommand(
              false,
            );
      } catch {
        subcommand =
          null;
      }

      if (
        subcommand ===
        subcommandName
      ) {
        return handler(
          interaction,
        );
      }

      return oldExecute.apply(
        this,
        args,
      );
    };

  command.__lcsoStaffOverride =
    true;

  logger.info(
    `Overrode /${commandName} ${subcommandName}`,
  );
}

export function installStaffCommandOverrides(
  client,
) {
  overrideCommand(
    client,
    'promotion',
    'promote',
    handlePromotion,
  );

  overrideCommand(
    client,
    'infraction',
    'add',
    handleInfraction,
  );
}

async function getDiscordCommand(
  client,
  guild,
  name,
) {
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

  if (
    !client.application
  ) {
    return null;
  }

  const globalCommands =
    await client.application.commands.fetch();

  return (
    globalCommands.find(
      (command) =>
        command.name ===
        name,
    ) ||
    null
  );
}

async function patchSubcommand(
  command,
  subcommandName,
  description,
  replacementOptions,
) {
  const json =
    command.toJSON();

  const options =
    Array.isArray(
      json.options,
    )
      ? [
          ...json.options,
        ]
      : [];

  const index =
    options.findIndex(
      (option) =>
        option.type ===
          ApplicationCommandOptionType.Subcommand &&
        option.name ===
          subcommandName,
    );

  if (index === -1) {
    logger.warn(
      `/${command.name} ${subcommandName} was not found, so its form could not be patched.`,
    );

    return;
  }

  options[index] = {
    type:
      ApplicationCommandOptionType.Subcommand,

    name:
      subcommandName,

    description,

    options:
      replacementOptions,
  };

  await command.edit({
    description:
      json.description,

    options,
  });

  logger.info(
    `Updated Discord form for /${command.name} ${subcommandName}`,
  );
}

export async function patchStaffCommandSchemas(
  client,
) {
  const guildId =
    process.env.DISCORD_GUILD_ID;

  if (!guildId) {
    logger.warn(
      'DISCORD_GUILD_ID is missing; slash command forms were not patched.',
    );

    return;
  }

  const guild =
    client.guilds.cache.get(
      guildId,
    ) ||
    await client.guilds.fetch(
      guildId,
    );

  /*
   * /promotion promote
   *
   * IMPORTANT:
   * rank is now a REAL Discord Role
   * option instead of old fixed text.
   */
  const promotionCommand =
    await getDiscordCommand(
      client,
      guild,
      'promotion',
    );

  if (promotionCommand) {
    await patchSubcommand(
      promotionCommand,
      'promote',
      'Promote an LCSO member',
      [
        {
          type:
            ApplicationCommandOptionType.User,

          name:
            'member',

          description:
            'The LCSO member to promote',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.Role,

          name:
            'rank',

          description:
            'The new Discord rank role',

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

          max_length:
            500,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'notes',

          description:
            'Optional additional notes',

          required:
            false,

          max_length:
            1000,
        },
      ],
    );
  } else {
    logger.warn(
      '/promotion command was not found on Discord.',
    );
  }

  /*
   * /infraction add
   *
   * Only Warning and Strike.
   */
  const infractionCommand =
    await getDiscordCommand(
      client,
      guild,
      'infraction',
    );

  if (infractionCommand) {
    await patchSubcommand(
      infractionCommand,
      'add',
      'Issue an LCSO warning or strike',
      [
        {
          type:
            ApplicationCommandOptionType.User,

          name:
            'member',

          description:
            'The LCSO member receiving the infraction',

          required:
            true,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'type',

          description:
            'Warning or Strike',

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

          max_length:
            500,
        },

        {
          type:
            ApplicationCommandOptionType.String,

          name:
            'notes',

          description:
            'Optional additional notes',

          required:
            false,

          max_length:
            1000,
        },
      ],
    );
  } else {
    logger.warn(
      '/infraction command was not found on Discord.',
    );
  }
}
