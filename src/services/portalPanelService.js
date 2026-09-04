import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';

import mongoose from 'mongoose';

import {
  logger,
} from '../utils/logger.js';


function db() {
  if (!mongoose.connection.db) {
    throw new Error(
      'MongoDB is not connected.',
    );
  }

  return mongoose.connection.db;
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
    !mongoose.Types.ObjectId.isValid(
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


function imageUrl(
  value,
) {
  if (!value) {
    return null;
  }

  try {
    const url =
      new URL(
        value,
      );

    if (
      ![
        'http:',
        'https:',
      ].includes(
        url.protocol,
      )
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}


function parseEmoji(
  value,
) {
  const raw =
    String(
      value ?? '',
    ).trim();

  if (!raw) {
    return undefined;
  }

  const custom =
    raw.match(
      /^<(a?):([A-Za-z0-9_]+):(\d+)>$/,
    );

  if (custom) {
    return {
      animated:
        custom[1] ===
        'a',

      name:
        custom[2],

      id:
        custom[3],
    };
  }

  return raw;
}


function buildOptions(
  options,
) {
  return options.map(
    (option) => {
      const result = {
        label:
          String(
            option.label,
          ).slice(
            0,
            100,
          ),

        value:
          option.key,

        description:
          String(
            option.description ||
              option.label,
          ).slice(
            0,
            100,
          ),
      };

      const emoji =
        parseEmoji(
          option.emoji,
        );

      if (emoji) {
        result.emoji =
          emoji;
      }

      return result;
    },
  );
}


function applyImages(
  embed,
  panel,
) {
  const banner =
    imageUrl(
      panel.bannerUrl,
    );

  const thumbnail =
    imageUrl(
      panel.thumbnailUrl,
    );

  if (banner) {
    embed.setImage(
      banner,
    );
  }

  if (thumbnail) {
    embed.setThumbnail(
      thumbnail,
    );
  }

  return embed;
}


async function publishTicketPanel(
  client,
  action,
) {
  const panel =
    await collection(
      'ticketpanels',
    ).findOne({
      _id:
        objectId(
          action.payload.panelId,
        ),

      guildId:
        action.guildId,
    });


  if (!panel) {
    throw new Error(
      'Ticket panel not found.',
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


  const channel =
    guild.channels.cache.get(
      panel.channelId,
    ) ??
    await guild.channels
      .fetch(
        panel.channelId,
      )
      .catch(
        () => null,
      );


  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      'Ticket publish channel is unavailable.',
    );
  }


  const embed =
    new EmbedBuilder()
      .setColor(
        0xc9a15b,
      )
      .setTitle(
        panel.title,
      )
      .setDescription(
        panel.description,
      );


  for (
    const option of
      panel.options
  ) {
    embed.addFields({
      name:
        `${option.emoji ?? '▸'} ${option.label}`,

      value:
        option.description ||
        'Open a ticket with this department.',

      inline:
        false,
    });
  }


  applyImages(
    embed,
    panel,
  );


  embed.setFooter({
    text:
      panel.footer ??
      "Liberty County Sheriff's Office",
  });


  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `lcso:ticket:${panel._id}`,
      )
      .setPlaceholder(
        panel.placeholder ??
        'Select a topic...',
      )
      .addOptions(
        buildOptions(
          panel.options,
        ),
      );


  const row =
    new ActionRowBuilder()
      .addComponents(
        menu,
      );


  const message =
    await channel.send({
      embeds: [
        embed,
      ],

      components: [
        row,
      ],
    });


  await collection(
    'ticketpanels',
  ).updateOne(
    {
      _id:
        panel._id,
    },

    {
      $set: {
        postedChannelId:
          channel.id,

        postedMessageId:
          message.id,

        updatedAt:
          new Date(),
      },
    },
  );


  return {
    channelId:
      channel.id,

    messageId:
      message.id,
  };
}


async function publishApplicationPanel(
  client,
  action,
) {
  const panel =
    await collection(
      'applicationpanels',
    ).findOne({
      _id:
        objectId(
          action.payload.panelId,
        ),

      guildId:
        action.guildId,
    });


  if (!panel) {
    throw new Error(
      'Application panel not found.',
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


  const channel =
    guild.channels.cache.get(
      panel.channelId,
    ) ??
    await guild.channels
      .fetch(
        panel.channelId,
      )
      .catch(
        () => null,
      );


  if (
    !channel ||
    !channel.isTextBased()
  ) {
    throw new Error(
      'Application publish channel is unavailable.',
    );
  }


  const embed =
    new EmbedBuilder()
      .setColor(
        0xc9a15b,
      )
      .setTitle(
        panel.title,
      )
      .setDescription(
        panel.description,
      );


  for (
    const option of
      panel.options
  ) {
    embed.addFields({
      name:
        `${option.emoji ?? '▸'} ${option.label}`,

      value:
        option.description ||
        'Select below to apply.',

      inline:
        false,
    });
  }


  applyImages(
    embed,
    panel,
  );


  embed.setFooter({
    text:
      panel.footer ??
      "Liberty County Sheriff's Office",
  });


  const menu =
    new StringSelectMenuBuilder()
      .setCustomId(
        `lcso:application:${panel._id}`,
      )
      .setPlaceholder(
        panel.placeholder ??
        'Applications',
      )
      .addOptions(
        buildOptions(
          panel.options,
        ),
      );


  const row =
    new ActionRowBuilder()
      .addComponents(
        menu,
      );


  const message =
    await channel.send({
      embeds: [
        embed,
      ],

      components: [
        row,
      ],
    });


  await collection(
    'applicationpanels',
  ).updateOne(
    {
      _id:
        panel._id,
    },

    {
      $set: {
        postedChannelId:
          channel.id,

        postedMessageId:
          message.id,

        updatedAt:
          new Date(),
      },
    },
  );


  return {
    channelId:
      channel.id,

    messageId:
      message.id,
  };
}


async function applicationResult(
  client,
  action,
) {
  const application =
    await collection(
      'applications',
    ).findOne({
      _id:
        objectId(
          action.payload.applicationId,
        ),

      guildId:
        action.guildId,
    });


  if (!application) {
    throw new Error(
      'Application not found.',
    );
  }


  const guild =
    client.guilds.cache.get(
      action.guildId,
    );


  if (!guild) {
    throw new Error(
      'Discord guild unavailable.',
    );
  }


  if (
    application.reviewChannelId &&
    application.reviewMessageId
  ) {
    const channel =
      guild.channels.cache.get(
        application.reviewChannelId,
      ) ??
      await guild.channels
        .fetch(
          application.reviewChannelId,
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
            application.reviewMessageId,
          )
          .catch(
            () => null,
          );


      if (message) {
        const embed =
          EmbedBuilder.from(
            message.embeds[0],
          );


        embed.setColor(
          application.status ===
          'Accepted'
            ? 0x4fa46b
            : 0xc55656,
        );


        embed.addFields({
          name:
            'Decision',

          value:
            `**${application.status}**\n${application.reviewReason ?? ''}`,
        });


        await message.edit({
          embeds: [
            embed,
          ],

          components:
            [],
        });
      }
    }
  }


  const member =
    await guild.members
      .fetch(
        application.applicantId,
      )
      .catch(
        () => null,
      );


  if (member) {
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setColor(
            application.status ===
            'Accepted'
              ? 0x4fa46b
              : 0xc55656,
          )
          .setTitle(
            `Application ${application.status}`,
          )
          .setDescription(
            application.reviewReason ??
            'Your application has been reviewed.',
          )
          .setFooter({
            text:
              "Liberty County Sheriff's Office",
          }),
      ],
    }).catch(
      () => null,
    );
  }


  return {
    status:
      application.status,
  };
}


async function closeTicket(
  client,
  action,
) {
  const ticket =
    await collection(
      'tickets',
    ).findOne({
      _id:
        objectId(
          action.payload.ticketId,
        ),

      guildId:
        action.guildId,
    });


  if (!ticket) {
    throw new Error(
      'Ticket not found.',
    );
  }


  await collection(
    'tickets',
  ).updateOne(
    {
      _id:
        ticket._id,
    },

    {
      $set: {
        status:
          'Closed',

        closeReason:
          action.payload.reason ??
          'Closed',

        closedAt:
          new Date(),

        updatedAt:
          new Date(),
      },
    },
  );


  const guild =
    client.guilds.cache.get(
      action.guildId,
    );


  const channel =
    guild?.channels.cache.get(
      ticket.channelId,
    );


  if (
    channel?.isTextBased()
  ) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(
            0xc55656,
          )
          .setTitle(
            'Ticket Closed',
          )
          .setDescription(
            action.payload.reason ??
            'This ticket has been closed.',
          ),
      ],
    }).catch(
      () => null,
    );


    setTimeout(
      () =>
        channel.delete(
          'LCSO ticket closed',
        ).catch(
          () => null,
        ),

      5000,
    ).unref();
  }


  return {
    ticketId:
      String(
        ticket._id,
      ),
  };
}


/* =========================================================
   QUEUE
   ========================================================= */

async function execute(
  client,
  action,
) {
  switch (
    action.type
  ) {
    case 'PUBLISH_TICKET_PANEL':
      return publishTicketPanel(
        client,
        action,
      );


    case 'PUBLISH_APPLICATION_PANEL':
      return publishApplicationPanel(
        client,
        action,
      );


    case 'APPLICATION_RESULT':
      return applicationResult(
        client,
        action,
      );


    case 'PORTAL_CLOSE_TICKET':
      return closeTicket(
        client,
        action,
      );


    default:
      throw new Error(
        `Unknown portal action: ${action.type}`,
      );
  }
}


async function processOne(
  client,
) {
  const action =
    await collection(
      'portalactions',
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
      'portalactions',
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


  try {
    const result =
      await execute(
        client,
        action,
      );


    await collection(
      'portalactions',
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
      'Portal action completed',
      {
        type:
          action.type,
      },
    );
  } catch (error) {
    const attempts =
      Number(
        action.attempts ??
        0,
      ) + 1;


    await collection(
      'portalactions',
    ).updateOne(
      {
        _id:
          action._id,
      },

      {
        $set: {
          status:
            attempts >=
            3
              ? 'Failed'
              : 'Pending',

          error:
            error?.message ??
            String(
              error,
            ),

          updatedAt:
            new Date(),
        },
      },
    );


    logger.error(
      'Portal action failed',
      {
        type:
          action.type,

        error:
          error?.stack ??
          error?.message ??
          String(
            error,
          ),
      },
    );
  }


  return true;
}


export function startPortalPanelProcessor(
  client,
) {
  logger.info(
    'Portal panel processor started',
  );


  let running =
    false;


  const tick =
    async () => {
      if (running) {
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
          const result =
            await processOne(
              client,
            );


          if (!result) {
            break;
          }
        }
      } finally {
        running =
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
              'Portal processor tick failed',
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
