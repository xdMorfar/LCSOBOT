import {
  ApplicationCommandOptionType,
  Events,
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
    interaction.options?.data ||
      [],
  );
}


function findUserId(
  interaction,
) {
  const options =
    allOptions(interaction);

  const preferredNames = [
    'member',
    'deputy',
    'user',
    'target',
    'staff',
  ];

  for (
    const name of
    preferredNames
  ) {
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
      fallback.value ||
      '',
    ) ||
    null
  );
}


function findRole(
  interaction,
) {
  const options =
    allOptions(interaction);

  const preferredNames = [
    'rank',
    'role',
    'newrank',
    'new_rank',
    'new-role',
    'new_role',
  ];

  for (
    const name of
    preferredNames
  ) {
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


function findOldRankString(
  interaction,
) {
  const options =
    allOptions(interaction);

  const names = [
    'rank',
    'newrank',
    'new_rank',
    'new-role',
    'new_role',
    'role',
  ];

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
      undefined
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
    ephemeral: true,
  });

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
    findUserId(
      interaction,
    );

  const role =
    findRole(
      interaction,
    );

  /*
   * Fallback for the older slash
   * command version where rank was
   * stored as a string instead of a
   * real Discord Role option.
   */
  const oldRankName =
    findOldRankString(
      interaction,
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
    await interaction.editReply({
      content:
        '❌ I could not find the member you selected.',
    });

    return;
  }

  if (
    !role &&
    !oldRankName
  ) {
    await interaction.editReply({
      content:
        '❌ I could not find the rank you selected.',
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
            role?.id ||
            null,

          targetRoleName:
            role?.name ||
            oldRankName ||
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

    await interaction.editReply({
      content:
        `✅ **Promotion confirmed.** The promotion has been posted in <#${result.channelId}>.`,
    });

    await sendLog(
      interaction.guild,
      'command',
      infoEmbed(
        'Promotion Command Used',
        `<@${interaction.user.id}> promoted <@${memberId}> to <@&${result.roleId}>.`,
      ),
    ).catch(
      () => null,
    );
  } catch (error) {
    /*
     * IMPORTANT:
     * This prints the REAL error
     * directly to bot-hosting.net.
     */
    console.error(
      '\n================================',
    );

    console.error(
      '[LCSO PROMOTION ERROR]',
    );

    console.error(error);

    console.error(
      '================================\n',
    );

    logger.error(
      'Promotion command failed',
      {
        userId:
          interaction.user.id,

        memberId,

        roleId:
          role?.id ||
          null,

        roleName:
          role?.name ||
          oldRankName ||
          null,

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
   INFRACTIONS
   ========================================================= */

async function handleInfraction(
  interaction,
) {
  await interaction.deferReply({
    ephemeral: true,
  });

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
    findUserId(
      interaction,
    );

  const type =
    findString(
      interaction,
      [
        'type',
        'infraction',
        'level',
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
    await interaction.editReply({
      content:
        '❌ I could not find the member you selected.',
    });

    return;
  }

  const normalizedType =
    type.toLowerCase();

  if (
    normalizedType !==
      'warning' &&
    normalizedType !==
      'strike'
  ) {
    await interaction.editReply({
      content:
        '❌ The infraction must be either **Warning** or **Strike**.',
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
            normalizedType ===
            'strike'
              ? 'Strike'
              : 'Warning',

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
        `✅ **${result.type} confirmed.** The infraction has been posted in <#${result.channelId}>.`,
    });

    await sendLog(
      interaction.guild,
      'command',
      infoEmbed(
        'Infraction Command Used',
        `<@${interaction.user.id}> issued a **${result.type}** to <@${memberId}>.`,
      ),
    ).catch(
      () => null,
    );
  } catch (error) {
    /*
     * REAL console error.
     */
    console.error(
      '\n================================',
    );

    console.error(
      '[LCSO INFRACTION ERROR]',
    );

    console.error(error);

    console.error(
      '================================\n',
    );

    logger.error(
      'Infraction command failed',
      {
        userId:
          interaction.user.id,

        memberId,

        infractionType:
          type,

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
   STAFF COMMAND OVERRIDE
   ========================================================= */

async function handleStaffCommand(
  interaction,
) {
  const subcommand =
    getSubcommand(
      interaction,
    );

  /*
   * ONLY replace:
   *
   * /promotion promote
   *
   * Everything else inside
   * /promotion still uses the
   * original command file.
   */
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

  /*
   * ONLY replace:
   *
   * /infraction add
   *
   * /infraction remove/list/etc.
   * still use the original system.
   */
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
            ephemeral:
              true,

            embeds: [
              errorEmbed(
                'Server Only',
                'This command can only be used in the LCSO Discord server.',
              ),
            ],
          });
        }

        /*
         * IMPORTANT:
         *
         * Promotion + Infraction are
         * checked BEFORE context.commands.
         *
         * This is the part that fixes
         * the problem.
         */
        const handled =
          await handleStaffCommand(
            interaction,
          );

        if (handled) {
          return;
        }

        /*
         * All other commands continue
         * through the original bot
         * command system exactly as
         * before.
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
        );
      } else if (
        interaction.isButton()
      ) {
        await handleButton(
          interaction,
          context,
        );
      } else if (
        interaction.isModalSubmit()
      ) {
        await handleModal(
          interaction,
          context,
        );
      }
    } catch (error) {
      /*
       * Your previous version only
       * passed the error into logger.
       *
       * We ALSO print it directly so
       * bot-hosting.net cannot hide
       * the useful error.
       */
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

      console.error(error);

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
        ephemeral:
          true,

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
