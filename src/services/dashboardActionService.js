import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';

import mongoose from 'mongoose';

import {
  logger,
} from '../utils/logger.js';


/* =========================================================
   DATABASE
   ========================================================= */

function db() {
  if (
    !mongoose.connection
      .db
  ) {
    throw new Error(
      'MongoDB is not connected.',
    );
  }

  return mongoose
    .connection
    .db;
}


function collection(
  name,
) {
  return db().collection(
    name,
  );
}


function objectId(
  value,
) {
  if (
    !mongoose.Types
      .ObjectId
      .isValid(
        value,
      )
  ) {
    throw new Error(
      `Invalid MongoDB ID: ${value}`,
    );
  }

  return new mongoose.Types.ObjectId(
    value,
  );
}


function splitText(
  value,
  max = 3900,
) {
  let text =
    String(
      value ?? '',
    ).trim();


  if (!text) {
    return [
      'No content provided.',
    ];
  }


  const parts =
    [];


  while (
    text.length >
    max
  ) {
    let position =
      text.lastIndexOf(
        '\n',
        max,
      );


    if (
      position <
      max * 0.5
    ) {
      position =
        max;
    }


    parts.push(
      text.slice(
        0,
        position,
      ),
    );


    text =
      text
        .slice(
          position,
        )
        .trimStart();
  }


  if (text) {
    parts.push(
      text,
    );
  }


  return parts;
}


/* =========================================================
   GUIDELINE
   ========================================================= */

function buildGuidelineButtons(
  guideline,
) {
  if (
    !Array.isArray(
      guideline.links,
    ) ||
    !guideline
      .links
      .length
  ) {
    return [];
  }


  const row =
    new ActionRowBuilder();


  for (
    const link of
      guideline.links.slice(
        0,
        5,
      )
  ) {
    if (
      !link?.label ||
      !link?.url
    ) {
      continue;
    }


    try {
      const url =
        new URL(
          String(
            link.url,
          ),
        );


      if (
        ![
          'http:',
          'https:',
        ].includes(
          url.protocol,
        )
      ) {
        continue;
      }


      row.addComponents(
        new ButtonBuilder()
          .setStyle(
            ButtonStyle.Link,
          )
          .setLabel(
            String(
              link.label,
            ).slice(
              0,
              80,
            ),
          )
          .setURL(
            url.toString(),
          ),
      );
    } catch {
      // Ignore broken old URL.
    }
  }


  if (
    !row.components.length
  ) {
    return [];
  }


  return [
    row,
  ];
}


function buildUploadedImage(
  action,
) {
  const data =
    action.payload
      ?.imageDataUrl;


  if (
    typeof data !==
    'string'
  ) {
    return null;
  }


  const match =
    data.match(
      /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/i,
    );


  if (!match) {
    return null;
  }


  const mime =
    match[1]
      .toLowerCase();


  const extension =
    mime ===
    'jpeg'
      ? 'jpg'
      : mime;


  const buffer =
    Buffer.from(
      match[2],
      'base64',
    );


  if (
    !buffer.length ||
    buffer.length >
      8 *
        1024 *
        1024
  ) {
    throw new Error(
      'Uploaded guideline image is invalid or too large.',
    );
  }


  const filename =
    `lcso-guideline.${extension}`;


  return {
    filename,

    attachment:
      new AttachmentBuilder(
        buffer,
        {
          name:
            filename,
        },
      ),
  };
}


async function sendGuidelineEmbed(
  client,
  action,
) {
  const guidelineId =
    String(
      action.payload
        ?.guidelineId ??
        '',
    );


  const channelId =
    String(
      action.payload
        ?.channelId ??
        '',
    );


  if (
    !guidelineId
  ) {
    throw new Error(
      'Guideline ID is missing.',
    );
  }


  if (
    !channelId
  ) {
    throw new Error(
      'Discord channel ID is missing.',
    );
  }


  const guideline =
    await collection(
      'guidelines',
    ).findOne({
      _id:
        objectId(
          guidelineId,
        ),

      guildId:
        action.guildId,
    });


  if (
    !guideline
  ) {
    throw new Error(
      'Guideline was not found.',
    );
  }


  const guild =
    client.guilds.cache.get(
      action.guildId,
    );


  if (!guild) {
    throw new Error(
      'Discord server is unavailable.',
    );
  }


  let channel =
    guild.channels.cache.get(
      channelId,
    );


  if (!channel) {
    channel =
      await guild.channels
        .fetch(
          channelId,
        )
        .catch(
          () =>
            null,
        );
  }


  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      'Selected Discord channel is unavailable.',
    );
  }


  const parts =
    splitText(
      guideline.content,
    );


  const components =
    buildGuidelineButtons(
      guideline,
    );


  const upload =
    buildUploadedImage(
      action,
    );


  let firstMessageId =
    null;


  for (
    let index = 0;
    index <
    parts.length;
    index++
  ) {
    const title =
      index ===
      0
        ? String(
            guideline.title ??
              'LCSO Guideline',
          )
        : `${String(
            guideline.title ??
              'LCSO Guideline',
          )} • Continued`;


    const embed =
      new EmbedBuilder()
        .setColor(
          0xc7a66a,
        )
        .setTitle(
          title.slice(
            0,
            256,
          ),
        )
        .setDescription(
          parts[
            index
          ],
        )
        .setFooter({
          text:
            "Liberty County Sheriff's Office • Springfield Roleplay",
        })
        .setTimestamp();


    if (
      index ===
        0 &&
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
      index ===
        0 &&
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


    const files =
      [];


    if (
      index ===
        0 &&
      upload
    ) {
      files.push(
        upload
          .attachment,
      );


      embed.setImage(
        `attachment://${upload.filename}`,
      );
    } else if (
      index ===
        0 &&
      guideline.imageUrl
    ) {
      try {
        const url =
          new URL(
            String(
              guideline.imageUrl,
            ),
          );


        if (
          [
            'http:',
            'https:',
          ].includes(
            url.protocol,
          )
        ) {
          embed.setImage(
            url.toString(),
          );
        }
      } catch {
        // Ignore invalid old image.
      }
    }


    const message =
      await channel.send({
        embeds: [
          embed,
        ],

        components:
          index ===
          0
            ? components
            : [],

        files:
          index ===
          0
            ? files
            : [],

        allowedMentions: {
          parse:
            [],
        },
      });


    if (
      !firstMessageId
    ) {
      firstMessageId =
        message.id;
    }
  }


  await collection(
    'guidelines',
  ).updateOne(
    {
      _id:
        guideline._id,
    },

    {
      $set: {
        postedChannelId:
          channel.id,

        postedMessageId:
          firstMessageId,

        lastPublishedAt:
          new Date(),

        updatedAt:
          new Date(),
      },
    },
  );


  logger.info(
    'Guideline embed sent',
    {
      guideline:
        guideline.title,

      channelId:
        channel.id,

      messages:
        parts.length,
    },
  );


  return {
    guidelineId,

    channelId:
      channel.id,

    messageId:
      firstMessageId,

    messagesSent:
      parts.length,
  };
}


/* =========================================================
   RANK ROLE
   ========================================================= */

async function setMemberRankRole(
  client,
  action,
) {
  const deputyId =
    String(
      action.payload
        ?.deputyId ??
        '',
    );


  const targetRoleId =
    String(
      action.payload
        ?.targetRoleId ??
        '',
    );


  if (
    !deputyId ||
    !targetRoleId
  ) {
    throw new Error(
      'Deputy ID or target role ID is missing.',
    );
  }


  const deputy =
    await collection(
      'deputies',
    ).findOne({
      _id:
        objectId(
          deputyId,
        ),

      guildId:
        action.guildId,
    });


  if (!deputy) {
    throw new Error(
      'Deputy not found.',
    );
  }


  const settings =
    await collection(
      'settings',
    ).findOne({
      guildId:
        action.guildId,
    });


  const rankRoleIds =
    Array.isArray(
      settings
        ?.rankRoleIds,
    )
      ? settings
          .rankRoleIds
      : [];


  if (
    !rankRoleIds.includes(
      targetRoleId,
    )
  ) {
    throw new Error(
      'Target role is not configured as an LCSO rank.',
    );
  }


  const guild =
    client.guilds.cache.get(
      action.guildId,
    );


  if (!guild) {
    throw new Error(
      'Discord guild is unavailable.',
    );
  }


  const member =
    await guild.members
      .fetch(
        deputy.discordId,
      )
      .catch(
        () =>
          null,
      );


  if (!member) {
    throw new Error(
      'Deputy is not in the Discord server.',
    );
  }


  const targetRole =
    guild.roles.cache.get(
      targetRoleId,
    );


  if (!targetRole) {
    throw new Error(
      'Target Discord role does not exist.',
    );
  }


  const currentRole =
    deputy.rankRoleId
      ? guild.roles.cache.get(
          deputy.rankRoleId,
        )
      : null;


  const oldRank =
    deputy.rankName ??
    deputy.rank ??
    currentRole?.name ??
    'Unassigned';


  let type =
    'Rank Change';


  if (
    currentRole
  ) {
    if (
      targetRole.position >
      currentRole.position
    ) {
      type =
        'Promotion';
    } else if (
      targetRole.position <
      currentRole.position
    ) {
      type =
        'Demotion';
    }
  }


  const remove =
    rankRoleIds.filter(
      (
        roleId,
      ) =>
        roleId !==
          targetRoleId &&
        member.roles.cache.has(
          roleId,
        ),
    );


  if (
    remove.length
  ) {
    await member.roles.remove(
      remove,
      `LCSO ${type}`,
    );
  }


  if (
    !member.roles.cache.has(
      targetRoleId,
    )
  ) {
    await member.roles.add(
      targetRoleId,
      `LCSO ${type}`,
    );
  }


  await collection(
    'deputies',
  ).updateOne(
    {
      _id:
        deputy._id,
    },

    {
      $set: {
        rankRoleId:
          targetRole.id,

        rankName:
          targetRole.name,

        rank:
          targetRole.name,

        updatedAt:
          new Date(),
      },
    },
  );


  await collection(
    'promotions',
  ).insertOne({
    guildId:
      action.guildId,

    deputyId:
      deputy._id,

    discordId:
      deputy.discordId,

    type,

    fromRank:
      oldRank,

    toRank:
      targetRole.name,

    fromRoleId:
      deputy.rankRoleId ??
      null,

    toRoleId:
      targetRole.id,

    reason:
      String(
        action.payload
          ?.reason ??
          'Rank changed from Command Center',
      ),

    status:
      'Completed',

    actionedBy:
      action.actorId,

    createdAt:
      new Date(),

    updatedAt:
      new Date(),
  });


  logger.info(
    'Discord rank changed',
    {
      member:
        deputy.discordId,

      from:
        oldRank,

      to:
        targetRole.name,
    },
  );


  return {
    type,

    fromRank:
      oldRank,

    toRank:
      targetRole.name,

    roleId:
      targetRole.id,
  };
}


/* =========================================================
   OPTIONAL LEGACY ACTIONS
   ========================================================= */

async function runLegacyAction(
  client,
  action,
) {
  switch (
    action.type
  ) {
    case 'POST_TRAINING_REQUEST':

    case 'TRAINING_REVIEW':

    case 'TRAINING_UPDATE': {
      const module =
        await import(
          './trainingService.js'
        );


      const training =
        await collection(
          'trainings',
        ).findOne({
          _id:
            objectId(
              action
                .payload
                .trainingId,
            ),

          guildId:
            action.guildId,
        });


      if (
        !training
      ) {
        throw new Error(
          'Training not found.',
        );
      }


      const guild =
        client.guilds.cache.get(
          action.guildId,
        );


      if (!guild) {
        throw new Error(
          'Discord guild not found.',
        );
      }


      if (
        action.type ===
        'POST_TRAINING_REQUEST'
      ) {
        await module
          .postTrainingRequest(
            guild,
            training,
          );
      } else {
        await module
          .updateTrainingMessage(
            guild,
            training,
          );
      }


      return {
        trainingId:
          String(
            training._id,
          ),
      };
    }


    case 'APPLICATION_REVIEW': {
      const module =
        await import(
          './applicationService.js'
        );


      const Model =
        await import(
          '../database/models/Application.js'
        );


      const application =
        await Model.Application.findOne({
          _id:
            action
              .payload
              .applicationId,

          guildId:
            action.guildId,
        });


      if (
        !application
      ) {
        throw new Error(
          'Application not found.',
        );
      }


      const guild =
        client.guilds.cache.get(
          action.guildId,
        );


      await module
        .reviewApplication({
          guild,

          application,

          reviewerId:
            action.actorId,

          accepted:
            Boolean(
              action
                .payload
                .accepted,
            ),

          reason:
            action
              .payload
              .reason ??
            'Reviewed from dashboard',
        });


      return {
        applicationId:
          String(
            application._id,
          ),
      };
    }


    case 'CREATE_TICKET': {
      const module =
        await import(
          './ticketService.js'
        );


      const guild =
        client.guilds.cache.get(
          action.guildId,
        );


      if (!guild) {
        throw new Error(
          'Discord guild not found.',
        );
      }


      const member =
        await guild.members
          .fetch(
            action
              .payload
              .ownerId,
          )
          .catch(
            () =>
              null,
          );


      if (!member) {
        throw new Error(
          'Ticket owner not found.',
        );
      }


      const result =
        await module.createTicket({
          guild,

          owner:
            member,

          type:
            action
              .payload
              .type,

          subject:
            action
              .payload
              .subject ??
            '',
        });


      return {
        ticketId:
          String(
            result
              .ticket
              ._id,
          ),

        channelId:
          result
            .channel
            .id,
      };
    }


    default:
      throw new Error(
        `Unsupported dashboard action: ${action.type}`,
      );
  }
}


/* =========================================================
   ROUTER
   ========================================================= */

async function execute(
  client,
  action,
) {
  switch (
    action.type
  ) {
    case 'POST_GUIDELINE_EMBED':
      return sendGuidelineEmbed(
        client,
        action,
      );


    case 'SET_MEMBER_RANK_ROLE':
      return setMemberRankRole(
        client,
        action,
      );


    default:
      return runLegacyAction(
        client,
        action,
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
    await collection(
      'dashboardactions',
    ).findOne(
      {
        status:
          'Pending',
      },

      {
        sort: {
          createdAt:
            1,
        },
      },
    );


  if (!action) {
    return false;
  }


  const claimed =
    await collection(
      'dashboardactions',
    ).updateOne(
      {
        _id:
          action._id,

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
    );


  if (
    claimed.modifiedCount !==
    1
  ) {
    return true;
  }


  action.attempts =
    Number(
      action.attempts ??
        0,
    ) + 1;


  logger.info(
    'Processing dashboard action',
    {
      actionId:
        String(
          action._id,
        ),

      type:
        action.type,
    },
  );


  try {
    const result =
      await execute(
        client,
        action,
      );


    await collection(
      'dashboardactions',
    ).updateOne(
      {
        _id:
          action._id,
      },

      {
        $set: {
          status:
            'Completed',

          result:
            result ?? {},

          error:
            null,

          processedAt:
            new Date(),

          updatedAt:
            new Date(),
        },
      },
    );


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
  } catch (
    error
  ) {
    const message =
      error?.message ??
      String(error);


    const nextStatus =
      action.attempts >=
      3
        ? 'Failed'
        : 'Pending';


    await collection(
      'dashboardactions',
    ).updateOne(
      {
        _id:
          action._id,
      },

      {
        $set: {
          status:
            nextStatus,

          error:
            message,

          updatedAt:
            new Date(),
        },
      },
    );


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

        nextStatus,

        error:
          error?.stack ??
          message,
      },
    );
  }


  return true;
}


/* =========================================================
   PROCESSOR
   ========================================================= */

export function startDashboardActionProcessor(
  client,
) {
  logger.info(
    'Dashboard action processor started',
  );


  let running =
    false;


  const tick =
    async () => {
      if (
        running
      ) {
        return;
      }


      running =
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


          if (
            !processed
          ) {
            break;
          }
        }
      } catch (
        error
      ) {
        logger.error(
          'Dashboard action processor tick failed',
          {
            error:
              error?.stack ??
              error?.message ??
              String(
                error,
              ),
          },
        );
      } finally {
        running =
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
