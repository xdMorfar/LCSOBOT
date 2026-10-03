import {
  ApplicationCommandOptionType,
  Events,
  MessageFlags,
} from 'discord.js';

import {
  handleButton,
  handleModal,
} from '../handlers/componentHandler.js';

import {
  errorEmbed,
  infoEmbed,
} from '../../utils/embeds.js';

import {
  sendLog,
} from '../../services/logService.js';

import {
  logger,
} from '../../utils/logger.js';

import {
  canManageStaffActions,
  issueInfraction,
  promoteMember,
} from '../../services/staffActionService.js';


/* =========================================================
   OPTION HELPERS
   ========================================================= */

function flattenOptions(
  options,
  output = [],
) {
  if (!Array.isArray(options)) {
    return output;
  }

  for (const option of options) {
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


function allOptions(
  interaction,
) {
  return flattenOptions(
    interaction.options?.data || [],
  );
}


function findUserId(
  interaction,
) {
  const options =
    allOptions(interaction);

  const names = [
    'member',
    'user',
    'target',
    'staff',
    'deputy',
  ];

  for (const name of names) {
    const option =
      options.find(
        (item) =>
          item.name === name &&
          item.type ===
            ApplicationCommandOptionType.User,
      );

    if (option) {
      return (
        option.user?.id ||
        String(
          option.value || '',
        ) ||
        null
      );
    }
  }

  const fallback =
    options.find(
      (item) =>
        item.type ===
        ApplicationCommandOptionType.User,
    );

  if (!fallback) {
    return null;
  }

  return (
    fallback.user?.id ||
    String(
      fallback.value || '',
    ) ||
    null
  );
}


function findRole(
  interaction,
  names = [
    'rank',
    'role',
  ],
) {
  const options =
    allOptions(interaction);

  for (const name of names) {
    const option =
      options.find(
        (item) =>
          item.name === name &&
          item.type ===
            ApplicationCommandOptionType.Role,
      );

    if (option) {
      return (
        option.role ||
        interaction.guild?.roles
          ?.cache
          ?.get(
            String(
              option.value,
            ),
          ) ||
        null
      );
    }
  }

  const fallback =
    options.find(
      (item) =>
        item.type ===
        ApplicationCommandOptionType.Role,
    );

  if (!fallback) {
    return null;
  }

  return (
    fallback.role ||
    interaction.guild?.roles
      ?.cache
      ?.get(
        String(
          fallback.value,
        ),
      ) ||
    null
  );
}


function findString(
  interaction,
  names,
) {
  const options =
    allOptions(interaction);

  for (const name of names) {
    const option =
      options.find(
        (item) =>
          item.name === name &&
          item.type ===
            ApplicationCommandOptionType.String,
      );

    if (
      option?.value !==
      undefined &&
      option?.value !== null
    ) {
      return String(
        option.value,
      ).trim();
    }
  }

  return '';
}


function getSubcommand(
  interaction,
) {
  try {
    return (
      interaction.options.getSubcommand(
        false,
      ) || null
    );
  } catch {
    return null;
  }
}


/* =========================================================
   PROMOTION
   ========================================================= */

async function handlePromotion(
  interaction,
) {
  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral,
  });

  const allowed =
    await canManageStaffActions(
      interaction.guild,
      interaction.user.id,
    );

  if (!allowed) {
    return interaction.editReply({
      content:
        '❌ You do not have permission to promote LCSO personnel.',
    });
  }

  const memberId =
    findUserId(
      interaction,
    );

  const rank =
    findRole(
      interaction,
      [
        'rank',
        'role',
      ],
    );

  const reason =
    findString(
      interaction,
      [
        'reason',
      ],
    );

  const notes =
    findString(
      interaction,
      [
        'notes',
        'note',
      ],
    );

  if (!memberId) {
    return interaction.editReply({
      content:
        '❌ Select the staff member you want to promote.',
    });
  }

  if (!rank) {
    return interaction.editReply({
      content:
        '❌ Select the Discord rank role they should be promoted to.',
    });
  }

  if (!reason) {
    return interaction.editReply({
      content:
        '❌ A promotion reason is required.',
    });
  }

  try {
    const result =
      await promoteMember(
        interaction.client,
        {
          guildId:
            interaction.guildId,

          memberId,

          targetRoleId:
            rank.id,

          targetRoleName:
            rank.name,

          reason,

          notes,

          actorDiscordId:
            interaction.user.id,

          actorName:
            interaction.member
              ?.displayName ||
            interaction.user
              .username,

          source:
            'Discord Slash Command',
        },
      );

    await interaction.editReply({
      content:
        `✅ **Promotion completed.** <@${memberId}> now has <@&${result.roleId}> and the promotion was posted in <#${result.channelId}>.`,
    });

  } catch (error) {
    console.error(
      '[LCSO PROMOTION ERROR]',
      error,
    );

    logger.error(
      'Promotion command failed',
      {
        userId:
          interaction.user.id,

        memberId,

        roleId:
          rank?.id || null,

        error:
          error?.stack ||
          error?.message ||
          String(error),
      },
    );

    await interaction.editReply({
      content:
        `❌ **Promotion failed:** ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
    });
  }
}


/* =========================================================
   INFRACTION
   ========================================================= */

async function handleInfraction(
  interaction,
) {
  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral,
  });

  const allowed =
    await canManageStaffActions(
      interaction.guild,
      interaction.user.id,
    );

  if (!allowed) {
    return interaction.editReply({
      content:
        '❌ You do not have permission to issue LCSO staff actions.',
    });
  }

  const memberId =
    findUserId(
      interaction,
    );

  const type =
    findString(
      interaction,
      [
        'type',
        'infraction',
      ],
    );

  const reason =
    findString(
      interaction,
      [
        'reason',
      ],
    );

  const notes =
    findString(
      interaction,
      [
        'notes',
        'note',
      ],
    );

  /*
   * Used only for Demotion.
   */
  const rank =
    findRole(
      interaction,
      [
        'rank',
      ],
    );

  if (!memberId) {
    return interaction.editReply({
      content:
        '❌ Select a staff member.',
    });
  }

  const normalizedType =
    type.toLowerCase();

  /*
   * IMPORTANT:
   * All four types are supported.
   */
  const validTypes = [
    'warning',
    'strike',
    'demotion',
    'termination',
  ];

  if (
    !validTypes.includes(
      normalizedType,
    )
  ) {
    return interaction.editReply({
      content:
        '❌ The infraction must be **Warning**, **Strike**, **Demotion** or **Termination**.',
    });
  }

  if (!reason) {
    return interaction.editReply({
      content:
        '❌ An infraction reason is required.',
    });
  }

  /*
   * Demotion requires a target
   * Discord role.
   */
  if (
    normalizedType ===
      'demotion' &&
    !rank
  ) {
    return interaction.editReply({
      content:
        '❌ When using **Demotion**, select the lower Discord rank in the **rank** field.',
    });
  }

  try {
    const result =
      await issueInfraction(
        interaction.client,
        {
          guildId:
            interaction.guildId,

          memberId,

          infractionType:
            normalizedType ===
              'warning'
              ? 'Warning'
              : normalizedType ===
                  'strike'
                ? 'Strike'
                : normalizedType ===
                    'demotion'
                  ? 'Demotion'
                  : 'Termination',

          /*
           * Null for Warning,
           * Strike and Termination.
           *
           * Real Discord role for
           * Demotion.
           */
          targetRoleId:
            rank?.id || null,

          targetRoleName:
            rank?.name || null,

          reason,

          notes,

          actorDiscordId:
            interaction.user.id,

          actorName:
            interaction.member
              ?.displayName ||
            interaction.user
              .username,

          source:
            'Discord Slash Command',
        },
      );

    let response =
      `✅ **${result.type} issued.**`;

    if (
      result.type ===
        'Demotion' &&
      result.roleId
    ) {
      response +=
        ` <@${memberId}> was demoted to <@&${result.roleId}>.`;
    }

    if (
      result.type ===
      'Termination'
    ) {
      response +=
        ` LCSO rank roles were removed from <@${memberId}>.`;
    }

    response +=
      ` Posted in <#${result.channelId}>.`;

    await interaction.editReply({
      content:
        response,
    });

  } catch (error) {
    console.error(
      '[LCSO INFRACTION ERROR]',
      error,
    );

    logger.error(
      'Infraction command failed',
      {
        userId:
          interaction.user.id,

        memberId,

        type,

        rankId:
          rank?.id || null,

        error:
          error?.stack ||
          error?.message ||
          String(error),
      },
    );

    await interaction.editReply({
      content:
        `❌ **Infraction failed:** ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
    });
  }
}


/* =========================================================
   STAFF COMMAND ROUTING
   ========================================================= */

async function handleStaffCommand(
  interaction,
) {
  const subcommand =
    getSubcommand(
      interaction,
    );

  if (
    interaction.commandName ===
      'promotion' &&
    subcommand ===
      'promote'
  ) {
    await handlePromotion(
      interaction,
    );

    return true;
  }

  if (
    interaction.commandName ===
      'infraction' &&
    subcommand ===
      'add'
  ) {
    await handleInfraction(
      interaction,
    );

    return true;
  }

  return false;
}


/* =========================================================
   MAIN INTERACTION EVENT
   ========================================================= */

export default {
  name:
    Events.InteractionCreate,

  async execute(
    interaction,
    context,
  ) {
    try {
      if (
        interaction.isChatInputCommand()
      ) {
        if (
          !interaction.inGuild()
        ) {
          return interaction.reply({
            flags:
              MessageFlags.Ephemeral,

            embeds: [
              errorEmbed(
                'Server Only',
                'This command can only be used in the LCSO Discord server.',
              ),
            ],
          });
        }

        /*
         * Handle our new staff
         * commands FIRST.
         */
        const handled =
          await handleStaffCommand(
            interaction,
          );

        if (handled) {
          return;
        }

        /*
         * Everything else uses
         * the normal command loader.
         */
        const command =
          context.commands.get(
            interaction.commandName,
          );

        if (!command) {
          return;
        }

        await command.execute(
          interaction,
          context,
        );

        await sendLog(
          interaction.guild,
          'command',
          infoEmbed(
            'Command Used',
            `<@${interaction.user.id}> used \`/${interaction.commandName}\` in <#${interaction.channelId}>.`,
          ),
        ).catch(
          () => null,
        );

        return;
      }

      if (
        interaction.isButton()
      ) {
        await handleButton(
          interaction,
          context,
        );

        return;
      }

      if (
        interaction.isModalSubmit()
      ) {
        await handleModal(
          interaction,
          context,
        );

        return;
      }

    } catch (error) {
      console.error(
        '\n================================',
      );

      console.error(
        '[LCSO INTERACTION ERROR]',
      );

      console.error(
        'Command:',
        interaction.commandName,
      );

      console.error(
        'Custom ID:',
        interaction.customId,
      );

      console.error(
        'User:',
        interaction.user?.id,
      );

      console.error(
        error,
      );

      console.error(
        '================================\n',
      );

      logger.error(
        'Interaction error',
        {
          command:
            interaction.commandName,

          customId:
            interaction.customId,

          userId:
            interaction.user?.id,

          error:
            error?.stack ||
            error?.message ||
            String(error),
        },
      );

      const payload = {
        flags:
          MessageFlags.Ephemeral,

        embeds: [
          errorEmbed(
            'Something Went Wrong',
            'The action could not be completed. The error has been logged.',
          ),
        ],
      };

      if (
        interaction.deferred
      ) {
        await interaction
          .editReply(
            payload,
          )
          .catch(
            () => null,
          );

      } else if (
        interaction.replied
      ) {
        await interaction
          .followUp(
            payload,
          )
          .catch(
            () => null,
          );

      } else {
        await interaction
          .reply(
            payload,
          )
          .catch(
            () => null,
          );
      }
    }
  },
};
