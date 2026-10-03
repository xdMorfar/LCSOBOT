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
    output.push(
      option,
    );

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
    interaction.options?.data ||
    [],
  );
}


function findUserId(
  interaction,
) {
  const options =
    allOptions(
      interaction,
    );

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
          option.value ||
          '',
        ) ||
        null
      );
    }
  }

  return null;
}


function findRole(
  interaction,
  names = [
    'rank',
    'role',
  ],
) {
  const options =
    allOptions(
      interaction,
    );

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
        interaction.guild
          ?.roles.cache.get(
            String(
              option.value,
            ),
          ) ||
        null
      );
    }
  }

  return null;
}


function findString(
  interaction,
  names,
) {
  const options =
    allOptions(
      interaction,
    );

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
      option?.value !==
      null
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
      interaction.options
        .getSubcommand(
          false,
        ) ||
      null
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
        '❌ Select a staff member.',
    });
  }


  if (!rank) {
    return interaction.editReply({
      content:
        '❌ Select the Discord role they should be promoted to.',
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

          /*
           * Actual Discord role.
           */
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
        `✅ <@${memberId}> was promoted to <@&${result.roleId}>. The Discord role has been applied and the promotion was posted in <#${result.channelId}>.`,
    });

  } catch (error) {
    console.error(
      '[LCSO PROMOTION ERROR]',
      error,
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
   DEMOTION
   ========================================================= */

async function handleDemotion(
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
        '❌ You do not have permission to demote LCSO personnel.',
    });
  }


  const memberId =
    findUserId(
      interaction,
    );


  /*
   * THIS IS NOW A REAL
   * DISCORD ROLE OBJECT.
   */
  const rank =
    findRole(
      interaction,
      [
        'rank',
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
        '❌ Select a staff member.',
    });
  }


  if (!rank) {
    return interaction.editReply({
      content:
        '❌ Select the Discord rank they should be demoted to.',
    });
  }


  if (!reason) {
    return interaction.editReply({
      content:
        '❌ A demotion reason is required.',
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
            'Demotion',

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
            '/promotion demote',
        },
      );


    await interaction.editReply({
      content:
        `✅ <@${memberId}> was demoted to <@&${rank.id}>. Their old LCSO rank was removed and the new Discord rank was applied.`,
    });

  } catch (error) {
    console.error(
      '[LCSO DEMOTION ERROR]',
      error,
    );


    await interaction.editReply({
      content:
        `❌ **Demotion failed:** ${
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
        '❌ Select **Warning**, **Strike**, **Demotion** or **Termination**.',
    });
  }


  if (!reason) {
    return interaction.editReply({
      content:
        '❌ A reason is required.',
    });
  }


  if (
    normalizedType ===
      'demotion' &&
    !rank
  ) {
    return interaction.editReply({
      content:
        '❌ Select the Discord rank they should be demoted to.',
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

          targetRoleId:
            rank?.id ||
            null,

          targetRoleName:
            rank?.name ||
            null,

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


    let message =
      `✅ **${result.type} issued.**`;


    if (
      result.type ===
        'Demotion' &&
      result.roleId
    ) {
      message +=
        ` <@${memberId}> was demoted to <@&${result.roleId}>.`;
    }


    if (
      result.type ===
      'Termination'
    ) {
      message +=
        ` LCSO rank roles were removed from <@${memberId}>.`;
    }


    message +=
      ` Posted in <#${result.channelId}>.`;


    await interaction.editReply({
      content:
        message,
    });

  } catch (error) {
    console.error(
      '[LCSO INFRACTION ERROR]',
      error,
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
   STAFF ROUTING
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
      'promotion' &&
    subcommand ===
      'demote'
  ) {
    await handleDemotion(
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


        const handled =
          await handleStaffCommand(
            interaction,
          );


        if (handled) {
          return;
        }


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
        '[LCSO INTERACTION ERROR]',
        error,
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
