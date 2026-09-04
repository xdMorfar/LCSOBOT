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
  RANK_LEVEL,
} from '../config/constants.js';

import {
  changeRank,
} from './rankService.js';

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
      action.actorId,
    )
  ) {
    return `<@${action.actorId}>`;
  }

  return String(
    action.actorId,
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
      remaining,
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


/* =========================================================
   GUIDELINE DISCORD EMBED
   ========================================================= */

async function postGuidelineEmbed(
  client,
  action,
) {
  const guideline =
    await Guideline.findOne({
      _id:
        action.payload
          .guidelineId,

      guildId:
        action.guildId,
    });

  if (!guideline) {
    throw new Error(
      'Guideline not found.',
    );
  }

  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  const channel =
    await guild.channels
      .fetch(
        action.payload
          .channelId,
      )
      .catch(
        () => null,
      );

  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      'Discord channel not found or is not a text channel.',
    );
  }

  const contentParts =
    splitText(
      guideline.content,
    );

  let firstMessage =
    null;

  for (
    let index = 0;
    index <
    contentParts.length;
    index++
  ) {
    const embed =
      new EmbedBuilder()
        .setColor(
          0xc7a66a,
        )
        .setTitle(
          index === 0
            ? guideline.title
            : `${guideline.title} • Continued`,
        )
        .setDescription(
          contentParts[index],
        )
        .setFooter({
          text:
            "Liberty County Sheriff's Office • ERLC",
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

  guideline.postedChannelId =
    channel.id;

  guideline.postedMessageId =
    firstMessage?.id ??
    null;

  await guideline.save();

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
  };
}


/* =========================================================
   RANK CHANGE
   ========================================================= */

async function rankChange(
  client,
  action,
) {
  const deputy =
    await Deputy.findOne({
      _id:
        action.payload
          .deputyId,

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

  const target =
    action.payload
      .targetRank;

  const type =
    RANK_LEVEL[target] >
    RANK_LEVEL[
      deputy.rank
    ]
      ? 'Promotion'
      : 'Demotion';

  if (
    RANK_LEVEL[target] ===
    RANK_LEVEL[
      deputy.rank
    ]
  ) {
    throw new Error(
      'Target rank equals current rank.',
    );
  }

  const from =
    deputy.rank;

  const record =
    await changeRank({
      guild,

      deputy,

      targetRank:
        target,

      actorId:
        action.actorId,

      reason:
        action.payload
          .reason ||
        'Dashboard rank change',

      type,

      overrideRequirements:
        Boolean(
          action.payload
            .overrideRequirements,
        ),
    });

  const embed =
    successEmbed(
      `${type} • ${target}`,

      `<@${deputy.discordId}> has been ${
        type ===
        'Promotion'
          ? 'promoted'
          : 'demoted'
      } from **${from}** to **${target}**.`,
    ).addFields(
      {
        name:
          'Reason',

        value:
          action.payload
            .reason ||
          'No reason provided',
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

  const settings =
    await getSettings(
      guild.id,
    );

  if (
    settings.promotionChannelId
  ) {
    const channel =
      await guild.channels
        .fetch(
          settings
            .promotionChannelId,
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

  await sendLog(
    guild,
    'promotion',
    embed,
  );

  return {
    promotionId:
      String(
        record._id,
      ),
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
        action.payload.loaId,

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
      deputy?.save(),
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
          loa.reason,
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

  await sendLog(
    guild,
    'loa',
    embed,
  );

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
          .trainingId,

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
    await sendLog(
      guild,
      'training',

      infoEmbed(
        'Training Updated',

        `<@${training.traineeDiscordId}> • **${training.type}** • ${training.status}`,
      ),
    );
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
          .infractionId,

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
            infraction.points,
          ),

        inline:
          true,
      },

      {
        name:
          'Reason',

        value:
          infraction.reason,
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
          .applicationId,

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
          .accepted,
      ),

    reason:
      action.payload
        .reason ||
      'Reviewed from Command Center',
  });

  const embed =
    (
      action.payload
        .accepted
        ? successEmbed
        : warningEmbed
    )(
      action.payload
        .accepted
        ? 'Application Accepted'
        : 'Application Denied',

      `<@${application.applicantId}>'s application was **${
        action.payload
          .accepted
          ? 'accepted'
          : 'denied'
      }** by **${actorLabel(
        action,
      )}**.`,
    );

  await sendLog(
    guild,
    'application',
    embed,
  );

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
   TICKETS
   ========================================================= */

async function createTicketAction(
  client,
  action,
) {
  const guild =
    await client.guilds.fetch(
      action.guildId,
    );

  const member =
    await guild.members
      .fetch(
        action.payload
          .ownerId,
      )
      .catch(
        () => null,
      );

  if (!member) {
    throw new Error(
      'Ticket owner is not in the server.',
    );
  }

  const created =
    await createTicket({
      guild,

      owner:
        member,

      type:
        action.payload.type,

      subject:
        action.payload
          .subject ||
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


async function closeTicketAction(
  client,
  action,
) {
  const ticket =
    await Ticket.findOne({
      _id:
        action.payload
          .ticketId,

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
    !channel?.isTextBased()
  ) {
    throw new Error(
      'Ticket channel not found.',
    );
  }

  ticket.closeReason =
    action.payload
      .reason ||
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
          .reason ||
        'Closed from Command Center',
    });

  setTimeout(
    () =>
      channel
        .delete(
          'LCSO ticket closed from dashboard',
        )
        .catch(
          () => null,
        ),

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

    case 'RANK_CHANGE':
      return rankChange(
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
   PROCESS QUEUE
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

    await action.save();
  } catch (error) {
    action.error =
      error.message;

    action.status =
      action.attempts >= 3
        ? 'Failed'
        : 'Pending';

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

        error:
          error.stack ||
          error.message,
      },
    );
  }

  return true;
}


/* =========================================================
   ACTION LOOP
   ========================================================= */

export function startDashboardActionProcessor(
  client,
) {
  let busy =
    false;

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
          i < 5;
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
      } finally {
        busy =
          false;
      }
    };

  tick();

  const timer =
    setInterval(
      () =>
        tick().catch(
          (error) =>
            logger.error(
              'Action queue loop failed',
              {
                error:
                  error.message,
              },
            ),
        ),

      3000,
    );

  timer.unref();

  return timer;
}
