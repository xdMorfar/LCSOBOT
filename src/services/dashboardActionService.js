import {
  EmbedBuilder,
} from 'discord.js';

import {
  DashboardAction,
} from '../database/models/DashboardAction.js';

import {
  Deputy,
} from '../database/models/Deputy.js';

import {
  Promotion,
} from '../database/models/Promotion.js';

import {
  LOA,
} from '../database/models/LOA.js';

import {
  Training,
} from '../database/models/Training.js';

import {
  Infraction,
} from '../database/models/Infraction.js';

import {
  Application,
} from '../database/models/Application.js';

import {
  Ticket,
} from '../database/models/Ticket.js';

import {
  Guideline,
} from '../database/models/Guideline.js';

import {
  getSettings,
} from './settingsService.js';

import {
  sendLog,
} from './logService.js';

import {
  postTrainingRequest,
  updateTrainingMessage,
} from './trainingService.js';

import {
  infoEmbed,
  successEmbed,
  warningEmbed,
} from '../utils/embeds.js';

import {
  logger,
} from '../utils/logger.js';

import {
  reviewApplication,
} from './applicationService.js';

import {
  createTicket,
  closeTicket,
} from './ticketService.js';


/* =========================================================
   HELPERS
   ========================================================= */

function actorLabel(
  action,
) {
  if (
    action.payload?.actorName
  ) {
    return String(
      action.payload.actorName,
    );
  }

  if (
    /^\d{15,22}$/.test(
      String(
        action.actorId ?? '',
      ),
    )
  ) {
    return `<@${action.actorId}>`;
  }

  return String(
    action.actorId ??
      'Unknown',
  );
}


function splitText(
  value,
  limit = 3900,
) {
  let remaining =
    String(
      value ?? '',
    );

  if (
    remaining.length <=
    limit
  ) {
    return [
      remaining ||
        'No content provided.',
    ];
  }

  const parts = [];

  while (
    remaining.length >
    limit
  ) {
    let cut =
      remaining.lastIndexOf(
        '\n',
        limit,
      );

    if (
      cut <
      Math.floor(
        limit * 0.5,
      )
    ) {
      cut =
        limit;
    }

    parts.push(
      remaining.slice(
        0,
        cut,
      ),
    );

    remaining =
      remaining
        .slice(
          cut,
        )
        .trimStart();
  }

  if (remaining) {
    parts.push(
      remaining,
    );
  }

  return parts;
}


function configuredRankIds(
  settings,
) {
  if (
    Array.isArray(
      settings.rankRoleIds,
    ) &&
    settings.rankRoleIds.length
  ) {
    return [
      ...settings.rankRoleIds,
    ];
  }

  if (
    settings.rankRoles
  ) {
    if (
      typeof settings.rankRoles.values ===
      'function'
    ) {
      return [
        ...settings.rankRoles.values(),
      ].filter(Boolean);
    }

    return Object.values(
      settings.rankRoles,
    ).filter(Boolean);
  }

  return [];
}


/* =========================================================
   GUIDELINE EMBED
   ========================================================= */

async function postGuidelineEmbed(
  client,
  action,
) {
  const guidelineId =
    action.payload
      ?.guidelineId;

  const channelId =
    action.payload
      ?.channelId;

  if (!guidelineId) {
    throw new Error(
      'Guideline ID is missing from dashboard action.',
    );
  }

  if (!channelId) {
    throw new Error(
      'Discord channel ID is missing from dashboard action.',
    );
  }

  const guideline =
    await Guideline.findOne({
      _id:
        guidelineId,

      guildId:
        action.guildId,
    });

  if (!guideline) {
    throw new Error(
      'Guideline not found in MongoDB.',
    );
  }

  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  const channel =
    await guild.channels
      .fetch(
        channelId,
      )
      .catch(
        () => null,
      );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      'Selected Discord channel does not exist or is not a text channel.',
    );
  }

  const parts =
    splitText(
      guideline.content,
    );

  let firstMessage =
    null;

  for (
    let index = 0;
    index <
    parts.length;
    index++
  ) {
    const embed =
      new EmbedBuilder()
        .setColor(
          0xc7a66a,
        )
        .setTitle(
          index === 0
            ? String(
                guideline.title ??
                  'LCSO Guideline',
              ).slice(
                0,
                256,
              )
            : `${String(
                guideline.title ??
                  'LCSO Guideline',
              ).slice(
                0,
                230,
              )} • Continued`,
        )
        .setDescription(
          parts[index],
        )
        .setFooter({
          text:
            "Liberty County Sheriff's Office • Springfield Roleplay",
        })
        .setTimestamp();

    if (
      index === 0 &&
      guideline.category
    ) {
      embed.addFields({
        name:
          'Category',

        value:
          String(
            guideline.category,
          ).slice(
            0,
            1024,
          ),

        inline:
          true,
      });
    }

    if (
      index === 0 &&
      guideline.summary
    ) {
      embed.addFields({
        name:
          'Summary',

        value:
          String(
            guideline.summary,
          ).slice(
            0,
            1024,
          ),
      });
    }

    const message =
      await channel.send({
        embeds: [
          embed,
        ],

        allowedMentions: {
          parse: [],
        },
      });

    if (!firstMessage) {
      firstMessage =
        message;
    }
  }

  try {
    guideline.postedChannelId =
      channel.id;

    guideline.postedMessageId =
      firstMessage?.id ??
      null;

    await guideline.save();
  } catch (error) {
    logger.warn(
      'Guideline sent but Discord message metadata could not be saved',
      {
        error:
          error?.message ??
          String(error),
      },
    );
  }

  try {
    await sendLog(
      guild,
      'guideline',

      infoEmbed(
        'Guideline Published',

        `**${guideline.title}** was published in <#${channel.id}> by **${actorLabel(
          action,
        )}**.`,
      ),
    );
  } catch (error) {
    logger.warn(
      'Guideline was sent but guideline log could not be sent',
      {
        error:
          error?.message ??
          String(error),
      },
    );
  }

  return {
    guidelineId:
      String(
        guideline._id,
      ),

    channelId:
      channel.id,

    messageId:
      firstMessage?.id ??
      null,

    messagesSent:
      parts.length,
  };
}


/* =========================================================
   DYNAMIC DISCORD RANK CHANGE
   ========================================================= */

async function setMemberRankRole(
  client,
  action,
) {
  const deputyId =
    action.payload
      ?.deputyId;

  const targetRoleId =
    action.payload
      ?.targetRoleId;

  if (!deputyId) {
    throw new Error(
      'Deputy ID is missing.',
    );
  }

  if (!targetRoleId) {
    throw new Error(
      'Target Discord role ID is missing.',
    );
  }

  const deputy =
    await Deputy.findOne({
      _id:
        deputyId,

      guildId:
        action.guildId,
    });

  if (!deputy) {
    throw new Error(
      'Deputy not found.',
    );
  }

  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  const settings =
    await getSettings(
      guild.id,
    );

  const rankIds =
    configuredRankIds(
      settings,
    );

  if (
    !rankIds.includes(
      targetRoleId,
    )
  ) {
    throw new Error(
      'Target Discord role is not configured as an LCSO rank.',
    );
  }

  const targetRole =
    await guild.roles
      .fetch(
        targetRoleId,
      )
      .catch(
        () => null,
      );

  if (!targetRole) {
    throw new Error(
      'Target Discord rank role no longer exists.',
    );
  }

  const member =
    await guild.members
      .fetch(
        deputy.discordId,
      )
      .catch(
        () => null,
      );

  if (!member) {
    throw new Error(
      'Deputy is not currently in the Discord server.',
    );
  }

  const oldRoleId =
    deputy.rankRoleId ??
    action.payload
      ?.previousRoleId ??
    null;

  const oldRole =
    oldRoleId
      ? await guild.roles
          .fetch(
            oldRoleId,
          )
          .catch(
            () => null,
          )
      : null;

  const fromRank =
    deputy.rankName ??
    deputy.rank ??
    oldRole?.name ??
    'Unassigned';

  let changeType =
    'Rank Change';

  if (oldRole) {
    if (
      targetRole.position >
      oldRole.position
    ) {
      changeType =
        'Promotion';
    } else if (
      targetRole.position <
      oldRole.position
    ) {
      changeType =
        'Demotion';
    }
  }

  const rolesToRemove =
    rankIds.filter(
      (id) =>
        id !==
          targetRoleId &&
        member.roles.cache.has(
          id,
        ),
    );

  if (
    rolesToRemove.length
  ) {
    await member.roles.remove(
      rolesToRemove,
      `LCSO ${changeType}`,
    );
  }

  if (
    !member.roles.cache.has(
      targetRoleId,
    )
  ) {
    await member.roles.add(
      targetRoleId,
      `LCSO ${changeType}`,
    );
  }

  deputy.rankRoleId =
    targetRole.id;

  deputy.rankName =
    targetRole.name;

  deputy.rank =
    targetRole.name;

  await deputy.save();

  const promotion =
    await Promotion.create({
      guildId:
        guild.id,

      deputyId:
        deputy._id,

      discordId:
        deputy.discordId,

      type:
        changeType,

      fromRank,

      toRank:
        targetRole.name,

      fromRoleId:
        oldRole?.id ??
        oldRoleId ??
        null,

      toRoleId:
        targetRole.id,

      reason:
        action.payload
          ?.reason ||
        'Rank changed from Command Center',

      status:
        'Completed',

      requestedBy:
        action.actorId,

      reviewedBy:
        action.actorId,

      reviewedAt:
        new Date(),

      actionedBy:
        action.actorId,
    });

  const embed =
    successEmbed(
      `${changeType} • ${targetRole.name}`,

      `<@${deputy.discordId}> changed from **${fromRank}** to **${targetRole.name}**.`,
    ).addFields(
      {
        name:
          'Reason',

        value:
          String(
            action.payload
              ?.reason ||
              'No reason provided',
          ).slice(
            0,
            1024,
          ),
      },

      {
        name:
          'Authorized by',

        value:
          actorLabel(
            action,
          ),
      },
    );

  if (
    settings.promotionChannelId
  ) {
    const promotionChannel =
      await guild.channels
        .fetch(
          settings
            .promotionChannelId,
        )
        .catch(
          () => null,
        );

    if (
      promotionChannel?.isTextBased()
    ) {
      await promotionChannel.send({
        embeds: [
          embed,
        ],
      });
    }
  }

  try {
    await sendLog(
      guild,
      'promotion',
      embed,
    );
  } catch (error) {
    logger.warn(
      'Rank changed but promotion log could not be sent',
      {
        error:
          error?.message ??
          String(error),
      },
    );
  }

  return {
    promotionId:
      String(
        promotion._id,
      ),

    type:
      changeType,

    fromRank,

    toRank:
      targetRole.name,

    roleId:
      targetRole.id,
  };
}


/* =========================================================
   LOA
   ========================================================= */

async function loaReview(
  client,
  action,
) {
  const loa =
    await LOA.findOne({
      _id:
        action.payload
          ?.loaId,

      guildId:
        action.guildId,
    });

  if (!loa) {
    throw new Error(
      'LOA not found.',
    );
  }

  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  const settings =
    await getSettings(
      guild.id,
    );

  const deputy =
    await Deputy.findById(
      loa.deputyId,
    );

  const member =
    await guild.members
      .fetch(
        loa.discordId,
      )
      .catch(
        () => null,
      );

  const now =
    new Date();

  if (
    loa.status ===
      'Approved' &&
    loa.startDate <=
      now &&
    loa.endDate >=
      now
  ) {
    loa.status =
      'Active';

    if (deputy) {
      deputy.status =
        'LOA';
    }

    if (
      member &&
      settings.loaRoleId
    ) {
      await member.roles
        .add(
          settings.loaRoleId,
          'LCSO LOA approved',
        )
        .catch(
          () => null,
        );
    }

    await Promise.all([
      loa.save(),
      deputy
        ? deputy.save()
        : Promise.resolve(),
    ]);
  }

  const embed =
    (
      loa.status ===
      'Denied'
        ? warningEmbed
        : successEmbed
    )(
      `LOA ${loa.status}`,

      `<@${loa.discordId}>'s leave request is **${loa.status}**.`,
    ).addFields(
      {
        name:
          'Reason',

        value:
          String(
            loa.reason ??
              'No reason provided',
          ).slice(
            0,
            1024,
          ),
      },

      {
        name:
          'Reviewed by',

        value:
          actorLabel(
            action,
          ),
      },
    );

  let edited =
    false;

  if (
    loa.discordChannelId &&
    loa.discordMessageId
  ) {
    const channel =
      await guild.channels
        .fetch(
          loa.discordChannelId,
        )
        .catch(
          () => null,
        );

    if (
      channel?.isTextBased()
    ) {
      const message =
        await channel.messages
          .fetch(
            loa.discordMessageId,
          )
          .catch(
            () => null,
          );

      if (message) {
        await message.edit({
          embeds: [
            embed,
          ],

          components: [],
        });

        edited =
          true;
      }
    }
  }

  if (
    !edited &&
    settings
      .loaRequestChannelId
  ) {
    const channel =
      await guild.channels
        .fetch(
          settings
            .loaRequestChannelId,
        )
        .catch(
          () => null,
        );

    if (
      channel?.isTextBased()
    ) {
      await channel.send({
        embeds: [
          embed,
        ],
      });
    }
  }

  try {
    await sendLog(
      guild,
      'loa',
      embed,
    );
  } catch (error) {
    logger.warn(
      'LOA processed but LOA log failed',
      {
        error:
          error?.message ??
          String(error),
      },
    );
  }

  return {
    loaId:
      String(
        loa._id,
      ),

    status:
      loa.status,
  };
}


/* =========================================================
   TRAINING
   ========================================================= */

async function trainingAction(
  client,
  action,
) {
  const training =
    await Training.findOne({
      _id:
        action.payload
          ?.trainingId,

      guildId:
        action.guildId,
    });

  if (!training) {
    throw new Error(
      'Training not found.',
    );
  }

  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  if (
    action.type ===
    'POST_TRAINING_REQUEST'
  ) {
    await postTrainingRequest(
      guild,
      training,
    );
  } else {
    await updateTrainingMessage(
      guild,
      training,
    );
  }

  if (
    action.type !==
    'POST_TRAINING_REQUEST'
  ) {
    try {
      await sendLog(
        guild,
        'training',

        infoEmbed(
          'Training Updated',

          `<@${training.traineeDiscordId}> • **${training.type}** • ${training.status}`,
        ),
      );
    } catch (error) {
      logger.warn(
        'Training updated but training log failed',
        {
          error:
            error?.message ??
            String(error),
        },
      );
    }
  }

  return {
    trainingId:
      String(
        training._id,
      ),

    status:
      training.status,
  };
}


/* =========================================================
   INFRACTIONS
   ========================================================= */

async function infractionNotify(
  client,
  action,
) {
  const infraction =
    await Infraction.findOne({
      _id:
        action.payload
          ?.infractionId,

      guildId:
        action.guildId,
    });

  if (!infraction) {
    throw new Error(
      'Infraction not found.',
    );
  }

  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  const embed =
    warningEmbed(
      `Infraction • ${infraction.type}`,

      `<@${infraction.discordId}> received **${infraction.type}**.`,
    ).addFields(
      {
        name:
          'Points',

        value:
          String(
            infraction.points ??
              0,
          ),

        inline:
          true,
      },

      {
        name:
          'Reason',

        value:
          String(
            infraction.reason ??
              'No reason provided',
          ).slice(
            0,
            1024,
          ),
      },

      {
        name:
          'Issued by',

        value:
          actorLabel(
            action,
          ),
      },
    );

  await sendLog(
    guild,
    'infraction',
    embed,
  );

  return {
    infractionId:
      String(
        infraction._id,
      ),
  };
}


/* =========================================================
   APPLICATIONS
   ========================================================= */

async function applicationReview(
  client,
  action,
) {
  const application =
    await Application.findOne({
      _id:
        action.payload
          ?.applicationId,

      guildId:
        action.guildId,
    });

  if (!application) {
    throw new Error(
      'Application not found.',
    );
  }

  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  await reviewApplication({
    guild,

    application,

    reviewerId:
      action.actorId,

    accepted:
      Boolean(
        action.payload
          ?.accepted,
      ),

    reason:
      action.payload
        ?.reason ||
      'Reviewed from Command Center',
  });

  return {
    applicationId:
      String(
        application._id,
      ),

    status:
      application.status,
  };
}


/* =========================================================
   CREATE TICKET
   ========================================================= */

async function createTicketAction(
  client,
  action,
) {
  const ownerId =
    action.payload
      ?.ownerId;

  if (!ownerId) {
    throw new Error(
      'Ticket owner ID is missing.',
    );
  }

  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  const member =
    await guild.members
      .fetch(
        ownerId,
      )
      .catch(
        () => null,
      );

  if (!member) {
    throw new Error(
      'Ticket owner is not in the Discord server.',
    );
  }

  const created =
    await createTicket({
      guild,

      owner:
        member,

      type:
        action.payload
          ?.type,

      subject:
        action.payload
          ?.subject ||
        '',
    });

  return {
    ticketId:
      String(
        created.ticket._id,
      ),

    channelId:
      created.channel.id,

    existing:
      Boolean(
        created.existing,
      ),
  };
}


/* =========================================================
   CLOSE TICKET
   ========================================================= */

async function closeTicketAction(
  client,
  action,
) {
  const ticket =
    await Ticket.findOne({
      _id:
        action.payload
          ?.ticketId,

      guildId:
        action.guildId,

      status:
        'Open',
    });

  if (!ticket) {
    throw new Error(
      'Open ticket not found.',
    );
  }

  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  const channel =
    await guild.channels
      .fetch(
        ticket.channelId,
      )
      .catch(
        () => null,
      );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      'Ticket channel not found.',
    );
  }

  ticket.closeReason =
    action.payload
      ?.reason ||
    'Closed from Command Center';

  await ticket.save();

  const closed =
    await closeTicket({
      guild,

      channel,

      actorId:
        action.actorId,

      reason:
        action.payload
          ?.reason ||
        'Closed from Command Center',
    });

  setTimeout(
    () => {
      channel
        .delete(
          'LCSO ticket closed from dashboard',
        )
        .catch(
          () => null,
        );
    },

    4000,
  ).unref();

  return {
    ticketId:
      String(
        closed?._id ??
        ticket._id,
      ),
  };
}


/* =========================================================
   ACTION ROUTER
   ========================================================= */

async function execute(
  client,
  action,
) {
  switch (
    action.type
  ) {
    case 'POST_GUIDELINE_EMBED':
      return postGuidelineEmbed(
        client,
        action,
      );

    case 'SET_MEMBER_RANK_ROLE':
      return setMemberRankRole(
        client,
        action,
      );

    case 'LOA_REVIEW':
      return loaReview(
        client,
        action,
      );

    case 'POST_TRAINING_REQUEST':
    case 'TRAINING_REVIEW':
    case 'TRAINING_UPDATE':
      return trainingAction(
        client,
        action,
      );

    case 'INFRACTION_NOTIFY':
      return infractionNotify(
        client,
        action,
      );

    case 'APPLICATION_REVIEW':
      return applicationReview(
        client,
        action,
      );

    case 'CREATE_TICKET':
      return createTicketAction(
        client,
        action,
      );

    case 'CLOSE_TICKET':
      return closeTicketAction(
        client,
        action,
      );

    default:
      throw new Error(
        `Unsupported dashboard action: ${action.type}`,
      );
  }
}


/* =========================================================
   PROCESS ONE ACTION
   ========================================================= */

export async function processNextDashboardAction(
  client,
) {
  const action =
    await DashboardAction.findOneAndUpdate(
      {
        status:
          'Pending',
      },

      {
        $set: {
          status:
            'Processing',

          updatedAt:
            new Date(),
        },

        $inc: {
          attempts:
            1,
        },
      },

      {
        sort: {
          createdAt:
            1,
        },

        new:
          true,
      },
    );

  if (!action) {
    return false;
  }

  logger.info(
    'Processing dashboard action',
    {
      actionId:
        String(
          action._id,
        ),

      type:
        action.type,

      guildId:
        action.guildId,
    },
  );

  try {
    const result =
      await execute(
        client,
        action,
      );

    action.status =
      'Completed';

    action.error =
      null;

    action.result =
      result ?? {};

    action.processedAt =
      new Date();

    action.updatedAt =
      new Date();

    await action.save();

    logger.info(
      'Dashboard action completed',
      {
        actionId:
          String(
            action._id,
          ),

        type:
          action.type,
      },
    );
  } catch (error) {
    const message =
      error?.message ??
      String(error);

    action.error =
      message;

    action.status =
      action.attempts >= 3
        ? 'Failed'
        : 'Pending';

    action.updatedAt =
      new Date();

    await action.save();

    logger.error(
      'Dashboard action failed',
      {
        actionId:
          String(
            action._id,
          ),

        type:
          action.type,

        attempts:
          action.attempts,

        status:
          action.status,

        error:
          error?.stack ??
          message,
      },
    );
  }

  return true;
}


/* =========================================================
   RECOVER ACTIONS AFTER A BOT CRASH
   ========================================================= */

async function recoverStaleActions() {
  const cutoff =
    new Date(
      Date.now() -
        5 *
          60 *
          1000,
    );

  const result =
    await DashboardAction.updateMany(
      {
        status:
          'Processing',

        updatedAt: {
          $lt:
            cutoff,
        },
      },

      {
        $set: {
          status:
            'Pending',

          error:
            'Recovered after bot restart.',

          updatedAt:
            new Date(),
        },
      },
    );

  if (
    result.modifiedCount >
    0
  ) {
    logger.info(
      'Recovered stale dashboard actions',
      {
        count:
          result.modifiedCount,
      },
    );
  }
}


/* =========================================================
   ACTION PROCESSOR
   ========================================================= */

export function startDashboardActionProcessor(
  client,
) {
  logger.info(
    'Dashboard action processor started',
  );

  let busy =
    false;

  recoverStaleActions().catch(
    (error) => {
      logger.error(
        'Failed to recover stale dashboard actions',
        {
          error:
            error?.stack ??
            error?.message ??
            String(error),
        },
      );
    },
  );

  const tick =
    async () => {
      if (busy) {
        return;
      }

      busy =
        true;

      try {
        for (
          let i = 0;
          i < 10;
          i++
        ) {
          const processed =
            await processNextDashboardAction(
              client,
            );

          if (!processed) {
            break;
          }
        }
      } catch (error) {
        logger.error(
          'Dashboard action queue tick failed',
          {
            error:
              error?.stack ??
              error?.message ??
              String(error),
          },
        );
      } finally {
        busy =
          false;
      }
    };

  tick();

  const timer =
    setInterval(
      tick,
      3000,
    );

  timer.unref();

  return timer;
}
