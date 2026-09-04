import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import mongoose from 'mongoose';


function db() {
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
  return new mongoose.Types.ObjectId(
    value,
  );
}


function cleanName(
  value,
) {
  return String(
    value,
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9-]/g,
      '-',
    )
    .replace(
      /-+/g,
      '-',
    )
    .replace(
      /^-|-$/g,
      '',
    )
    .slice(
      0,
      80,
    );
}


function applyImages(
  embed,
  panel,
) {
  try {
    if (
      panel.thumbnailUrl
    ) {
      embed.setThumbnail(
        panel.thumbnailUrl,
      );
    }
  } catch {}


  try {
    if (
      panel.bannerUrl
    ) {
      embed.setImage(
        panel.bannerUrl,
      );
    }
  } catch {}


  return embed;
}


async function canReview(
  interaction,
) {
  if (
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageGuild,
    )
  ) {
    return true;
  }


  const settings =
    await collection(
      'settings',
    ).findOne({
      guildId:
        interaction.guildId,
    });


  const allowed =
    [
      settings?.staffRoleId,
      ...(settings?.dashboardAdminRoleIds ??
        []),
    ].filter(
      Boolean,
    );


  return allowed.some(
    (roleId) =>
      interaction.member.roles.cache.has(
        roleId,
      ),
  );
}


/* =========================================================
   TICKET SELECT
   ========================================================= */

async function ticketSelect(
  interaction,
) {
  const panelId =
    interaction.customId.split(
      ':',
    )[2];


  const optionKey =
    interaction.values[0];


  const panel =
    await collection(
      'ticketpanels',
    ).findOne({
      _id:
        objectId(
          panelId,
        ),

      guildId:
        interaction.guildId,
    });


  if (!panel) {
    return interaction.reply({
      content:
        'This ticket panel no longer exists.',

      ephemeral:
        true,
    });
  }


  const option =
    panel.options.find(
      (item) =>
        item.key ===
        optionKey,
    );


  if (!option) {
    return interaction.reply({
      content:
        'That ticket type is unavailable.',

      ephemeral:
        true,
    });
  }


  const modal =
    new ModalBuilder()
      .setCustomId(
        `lcso:ticketform:${panelId}:${option.key}`,
      )
      .setTitle(
        option.label.slice(
          0,
          45,
        ),
      );


  const subject =
    new TextInputBuilder()
      .setCustomId(
        'subject',
      )
      .setLabel(
        'Subject',
      )
      .setStyle(
        TextInputStyle.Short,
      )
      .setRequired(
        true,
      )
      .setMaxLength(
        100,
      )
      .setPlaceholder(
        'Briefly describe the issue',
      );


  const details =
    new TextInputBuilder()
      .setCustomId(
        'details',
      )
      .setLabel(
        'Details',
      )
      .setStyle(
        TextInputStyle.Paragraph,
      )
      .setRequired(
        true,
      )
      .setMaxLength(
        1000,
      )
      .setPlaceholder(
        'Explain what you need help with...',
      );


  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        subject,
      ),

    new ActionRowBuilder()
      .addComponents(
        details,
      ),
  );


  await interaction.showModal(
    modal,
  );
}


/* =========================================================
   CREATE TICKET
   ========================================================= */

async function ticketModal(
  interaction,
) {
  const [
    ,
    ,
    panelId,
    optionKey,
  ] =
    interaction.customId.split(
      ':',
    );


  const panel =
    await collection(
      'ticketpanels',
    ).findOne({
      _id:
        objectId(
          panelId,
        ),

      guildId:
        interaction.guildId,
    });


  if (!panel) {
    return interaction.reply({
      content:
        'Ticket panel no longer exists.',

      ephemeral:
        true,
    });
  }


  const option =
    panel.options.find(
      (item) =>
        item.key ===
        optionKey,
    );


  if (!option) {
    return interaction.reply({
      content:
        'Ticket type unavailable.',

      ephemeral:
        true,
    });
  }


  const existing =
    await collection(
      'tickets',
    ).findOne({
      guildId:
        interaction.guildId,

      ownerId:
        interaction.user.id,

      status:
        'Open',
    });


  if (existing) {
    return interaction.reply({
      content:
        `You already have an open ticket: <#${existing.channelId}>`,

      ephemeral:
        true,
    });
  }


  await interaction.deferReply({
    ephemeral:
      true,
  });


  const subject =
    interaction.fields
      .getTextInputValue(
        'subject',
      );


  const details =
    interaction.fields
      .getTextInputValue(
        'details',
      );


  const permissionOverwrites =
    [
      {
        id:
          interaction.guild.roles.everyone.id,

        deny: [
          PermissionFlagsBits.ViewChannel,
        ],
      },

      {
        id:
          interaction.user.id,

        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
        ],
      },
    ];


  for (
    const roleId of
      panel.supportRoleIds ??
      []
  ) {
    permissionOverwrites.push({
      id:
        roleId,

      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }


  const channel =
    await interaction.guild.channels.create({
      name:
        cleanName(
          `${option.prefix}-${interaction.user.username}`,
        ),

      type:
        ChannelType.GuildText,

      parent:
        panel.categoryId,

      permissionOverwrites,

      reason:
        `Ticket opened by ${interaction.user.tag}`,
    });


  const ticketResult =
    await collection(
      'tickets',
    ).insertOne({
      guildId:
        interaction.guildId,

      panelId:
        panel._id,

      ownerId:
        interaction.user.id,

      type:
        option.key,

      typeLabel:
        option.label,

      subject,

      details,

      channelId:
        channel.id,

      status:
        'Open',

      createdAt:
        new Date(),

      updatedAt:
        new Date(),

      closedAt:
        null,
    });


  const welcome =
    new EmbedBuilder()
      .setColor(
        0xc9a15b,
      )
      .setTitle(
        `${option.emoji ?? '📩'} ${option.label}`,
      )
      .setDescription(
        `Welcome <@${interaction.user.id}>.\n\nA member of the appropriate LCSO staff team will respond as soon as possible.`,
      )
      .addFields(
        {
          name:
            'Subject',

          value:
            subject,
        },

        {
          name:
            'Details',

          value:
            details,
        },
      )
      .setFooter({
        text:
          panel.footer ??
          "Liberty County Sheriff's Office",
      })
      .setTimestamp();


  applyImages(
    welcome,
    panel,
  );


  const closeButton =
    new ButtonBuilder()
      .setCustomId(
        `lcso:ticketclose:${ticketResult.insertedId}`,
      )
      .setLabel(
        'Close Ticket',
      )
      .setStyle(
        ButtonStyle.Danger,
      );


  await channel.send({
    content:
      `<@${interaction.user.id}>`,

    embeds: [
      welcome,
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          closeButton,
        ),
    ],
  });


  await interaction.editReply({
    content:
      `Your ticket has been created: ${channel}`,
  });
}


/* =========================================================
   APPLICATION SELECT
   ========================================================= */

async function applicationSelect(
  interaction,
) {
  const panelId =
    interaction.customId.split(
      ':',
    )[2];


  const optionKey =
    interaction.values[0];


  const panel =
    await collection(
      'applicationpanels',
    ).findOne({
      _id:
        objectId(
          panelId,
        ),

      guildId:
        interaction.guildId,
    });


  if (!panel) {
    return interaction.reply({
      content:
        'This application panel no longer exists.',

      ephemeral:
        true,
    });
  }


  const option =
    panel.options.find(
      (item) =>
        item.key ===
        optionKey,
    );


  if (!option) {
    return interaction.reply({
      content:
        'That application is unavailable.',

      ephemeral:
        true,
    });
  }


  const existing =
    await collection(
      'applications',
    ).findOne({
      guildId:
        interaction.guildId,

      applicantId:
        interaction.user.id,

      panelId:
        panel._id,

      typeKey:
        option.key,

      status:
        'Pending',
    });


  if (existing) {
    return interaction.reply({
      content:
        'You already have a pending application of this type.',

      ephemeral:
        true,
    });
  }


  const modal =
    new ModalBuilder()
      .setCustomId(
        `lcso:applicationform:${panelId}:${option.key}`,
      )
      .setTitle(
        option.label.slice(
          0,
          45,
        ),
      );


  option.questions
    .slice(
      0,
      5,
    )
    .forEach(
      (
        question,
        index,
      ) => {
        const input =
          new TextInputBuilder()
            .setCustomId(
              `q${index}`,
            )
            .setLabel(
              String(
                question,
              ).slice(
                0,
                45,
              ),
            )
            .setStyle(
              TextInputStyle.Paragraph,
            )
            .setRequired(
              true,
            )
            .setMaxLength(
              1000,
            );


        modal.addComponents(
          new ActionRowBuilder()
            .addComponents(
              input,
            ),
        );
      },
    );


  await interaction.showModal(
    modal,
  );
}


/* =========================================================
   APPLICATION SUBMIT
   ========================================================= */

async function applicationModal(
  interaction,
) {
  const [
    ,
    ,
    panelId,
    optionKey,
  ] =
    interaction.customId.split(
      ':',
    );


  const panel =
    await collection(
      'applicationpanels',
    ).findOne({
      _id:
        objectId(
          panelId,
        ),

      guildId:
        interaction.guildId,
    });


  if (!panel) {
    return interaction.reply({
      content:
        'Application panel no longer exists.',

      ephemeral:
        true,
    });
  }


  const option =
    panel.options.find(
      (item) =>
        item.key ===
        optionKey,
    );


  if (!option) {
    return interaction.reply({
      content:
        'Application unavailable.',

      ephemeral:
        true,
    });
  }


  const answers =
    option.questions
      .slice(
        0,
        5,
      )
      .map(
        (
          question,
          index,
        ) => ({
          question,

          answer:
            interaction.fields
              .getTextInputValue(
                `q${index}`,
              ),
        }),
      );


  const result =
    await collection(
      'applications',
    ).insertOne({
      guildId:
        interaction.guildId,

      panelId:
        panel._id,

      applicantId:
        interaction.user.id,

      applicantTag:
        interaction.user.tag,

      typeKey:
        option.key,

      typeLabel:
        option.label,

      answers,

      status:
        'Pending',

      reviewReason:
        null,

      reviewedBy:
        null,

      reviewedAt:
        null,

      reviewChannelId:
        panel.reviewChannelId,

      reviewMessageId:
        null,

      createdAt:
        new Date(),

      updatedAt:
        new Date(),
    });


  const reviewChannel =
    interaction.guild.channels.cache.get(
      panel.reviewChannelId,
    ) ??
    await interaction.guild.channels
      .fetch(
        panel.reviewChannelId,
      )
      .catch(
        () => null,
      );


  if (
    !reviewChannel ||
    !reviewChannel.isTextBased()
  ) {
    throw new Error(
      'Application review channel is unavailable.',
    );
  }


  const embed =
    new EmbedBuilder()
      .setColor(
        0xc9a15b,
      )
      .setTitle(
        `${option.emoji ?? '📋'} ${option.label}`,
      )
      .setDescription(
        `New application from <@${interaction.user.id}>`,
      )
      .setThumbnail(
        interaction.user.displayAvatarURL(),
      )
      .setFooter({
        text:
          panel.footer ??
          "Liberty County Sheriff's Office",
      })
      .setTimestamp();


  for (
    const answer of
      answers
  ) {
    embed.addFields({
      name:
        String(
          answer.question,
        ).slice(
          0,
          256,
        ),

      value:
        String(
          answer.answer ||
          'No response',
        ).slice(
          0,
          1024,
        ),

      inline:
        false,
    });
  }


  const accept =
    new ButtonBuilder()
      .setCustomId(
        `lcso:appreview:${result.insertedId}:Accepted`,
      )
      .setLabel(
        'Accept',
      )
      .setStyle(
        ButtonStyle.Success,
      );


  const deny =
    new ButtonBuilder()
      .setCustomId(
        `lcso:appreview:${result.insertedId}:Denied`,
      )
      .setLabel(
        'Deny',
      )
      .setStyle(
        ButtonStyle.Danger,
      );


  const reviewMessage =
    await reviewChannel.send({
      embeds: [
        embed,
      ],

      components: [
        new ActionRowBuilder()
          .addComponents(
            accept,
            deny,
          ),
      ],
    });


  await collection(
    'applications',
  ).updateOne(
    {
      _id:
        result.insertedId,
    },

    {
      $set: {
        reviewMessageId:
          reviewMessage.id,
      },
    },
  );


  await interaction.reply({
    content:
      'Your application has been submitted successfully.',

    ephemeral:
      true,
  });
}


/* =========================================================
   APPLICATION REVIEW BUTTON
   ========================================================= */

async function applicationReviewButton(
  interaction,
) {
  if (
    !await canReview(
      interaction,
    )
  ) {
    return interaction.reply({
      content:
        'You are not authorized to review applications.',

      ephemeral:
        true,
    });
  }


  const [
    ,
    ,
    applicationId,
    decision,
  ] =
    interaction.customId.split(
      ':',
    );


  const modal =
    new ModalBuilder()
      .setCustomId(
        `lcso:appreviewform:${applicationId}:${decision}`,
      )
      .setTitle(
        `${decision} Application`,
      );


  const reason =
    new TextInputBuilder()
      .setCustomId(
        'reason',
      )
      .setLabel(
        'Reason / Staff Note',
      )
      .setStyle(
        TextInputStyle.Paragraph,
      )
      .setRequired(
        false,
      )
      .setMaxLength(
        500,
      );


  modal.addComponents(
    new ActionRowBuilder()
      .addComponents(
        reason,
      ),
  );


  await interaction.showModal(
    modal,
  );
}


/* =========================================================
   APPLICATION REVIEW MODAL
   ========================================================= */

async function applicationReviewModal(
  interaction,
) {
  if (
    !await canReview(
      interaction,
    )
  ) {
    return interaction.reply({
      content:
        'You are not authorized.',

      ephemeral:
        true,
    });
  }


  const [
    ,
    ,
    applicationId,
    decision,
  ] =
    interaction.customId.split(
      ':',
    );


  const reason =
    interaction.fields
      .getTextInputValue(
        'reason',
      ) ||
    'No reason provided.';


  const applications =
    collection(
      'applications',
    );


  const application =
    await applications.findOne({
      _id:
        objectId(
          applicationId,
        ),

      guildId:
        interaction.guildId,
    });


  if (!application) {
    return interaction.reply({
      content:
        'Application not found.',

      ephemeral:
        true,
    });
  }


  if (
    application.status !==
    'Pending'
  ) {
    return interaction.reply({
      content:
        `This application is already ${application.status}.`,

      ephemeral:
        true,
    });
  }


  await applications.updateOne(
    {
      _id:
        application._id,
    },

    {
      $set: {
        status:
          decision,

        reviewReason:
          reason,

        reviewedBy:
          interaction.user.id,

        reviewedAt:
          new Date(),

        updatedAt:
          new Date(),
      },
    },
  );


  const current =
    interaction.message;


  if (current) {
    const embed =
      EmbedBuilder.from(
        current.embeds[0],
      );


    embed
      .setColor(
        decision ===
        'Accepted'
          ? 0x4fa46b
          : 0xc55656,
      )
      .addFields({
        name:
          'Decision',

        value:
          `**${decision}**\n${reason}\n\nReviewed by <@${interaction.user.id}>`,
      });


    await current.edit({
      embeds: [
        embed,
      ],

      components:
        [],
    });
  }


  const applicant =
    await interaction.guild.members
      .fetch(
        application.applicantId,
      )
      .catch(
        () => null,
      );


  if (applicant) {
    await applicant.send({
      embeds: [
        new EmbedBuilder()
          .setColor(
            decision ===
            'Accepted'
              ? 0x4fa46b
              : 0xc55656,
          )
          .setTitle(
            `Application ${decision}`,
          )
          .setDescription(
            reason,
          )
          .setFooter({
            text:
              "Liberty County Sheriff's Office • Springfield Roleplay",
          }),
      ],
    }).catch(
      () => null,
    );
  }


  await interaction.reply({
    content:
      `Application ${decision.toLowerCase()}.`,

    ephemeral:
      true,
  });
}


/* =========================================================
   CLOSE TICKET BUTTON
   ========================================================= */

async function ticketClose(
  interaction,
) {
  const ticketId =
    interaction.customId.split(
      ':',
    )[2];


  const ticket =
    await collection(
      'tickets',
    ).findOne({
      _id:
        objectId(
          ticketId,
        ),

      guildId:
        interaction.guildId,
    });


  if (!ticket) {
    return interaction.reply({
      content:
        'Ticket not found.',

      ephemeral:
        true,
    });
  }


  const panel =
    await collection(
      'ticketpanels',
    ).findOne({
      _id:
        ticket.panelId,
    });


  const isOwner =
    ticket.ownerId ===
    interaction.user.id;


  const isStaff =
    interaction.memberPermissions?.has(
      PermissionFlagsBits.ManageChannels,
    ) ||
    (
      panel?.supportRoleIds ??
      []
    ).some(
      (roleId) =>
        interaction.member.roles.cache.has(
          roleId,
        ),
    );


  if (
    !isOwner &&
    !isStaff
  ) {
    return interaction.reply({
      content:
        'You cannot close this ticket.',

      ephemeral:
        true,
    });
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

        closedBy:
          interaction.user.id,

        closedAt:
          new Date(),

        updatedAt:
          new Date(),
      },
    },
  );


  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(
          0xc55656,
        )
        .setTitle(
          'Ticket Closed',
        )
        .setDescription(
          `Closed by <@${interaction.user.id}>.\n\nThis channel will be deleted shortly.`,
        ),
    ],
  });


  setTimeout(
    () =>
      interaction.channel
        ?.delete(
          'LCSO ticket closed',
        )
        .catch(
          () => null,
        ),

    5000,
  ).unref();
}


/* =========================================================
   ROUTER
   ========================================================= */

export default {
  name:
    Events.InteractionCreate,

  once:
    false,

  async execute(
    interaction,
  ) {
    if (
      !interaction.guildId ||
      !interaction.customId?.startsWith(
        'lcso:',
      )
    ) {
      return;
    }


    try {
      if (
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId.startsWith(
            'lcso:ticket:',
          )
        ) {
          return ticketSelect(
            interaction,
          );
        }


        if (
          interaction.customId.startsWith(
            'lcso:application:',
          )
        ) {
          return applicationSelect(
            interaction,
          );
        }
      }


      if (
        interaction.isModalSubmit()
      ) {
        if (
          interaction.customId.startsWith(
            'lcso:ticketform:',
          )
        ) {
          return ticketModal(
            interaction,
          );
        }


        if (
          interaction.customId.startsWith(
            'lcso:applicationform:',
          )
        ) {
          return applicationModal(
            interaction,
          );
        }


        if (
          interaction.customId.startsWith(
            'lcso:appreviewform:',
          )
        ) {
          return applicationReviewModal(
            interaction,
          );
        }
      }


      if (
        interaction.isButton()
      ) {
        if (
          interaction.customId.startsWith(
            'lcso:appreview:',
          )
        ) {
          return applicationReviewButton(
            interaction,
          );
        }


        if (
          interaction.customId.startsWith(
            'lcso:ticketclose:',
          )
        ) {
          return ticketClose(
            interaction,
          );
        }
      }
    } catch (
      error
    ) {
      console.error(
        'Portal interaction error:',
        error,
      );


      if (
        interaction.deferred ||
        interaction.replied
      ) {
        await interaction
          .followUp({
            content:
              `Something went wrong: ${error.message}`,

            ephemeral:
              true,
          })
          .catch(
            () => null,
          );
      } else {
        await interaction
          .reply({
            content:
              `Something went wrong: ${error.message}`,

            ephemeral:
              true,
          })
          .catch(
            () => null,
          );
      }
    }
  },
};
