import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

import mongoose from 'mongoose';
import { logger } from '../../utils/logger.js';

const QUESTIONS_PER_PAGE = 5;

function db() {
  const database = mongoose.connection.db;

  if (!database) {
    throw new Error('MongoDB is not connected.');
  }

  return database;
}

function col(name) {
  return db().collection(name);
}

function objectId(value) {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
    return null;
  }

  return new mongoose.Types.ObjectId(String(value));
}

function truncate(value, max = 1000) {
  const text = String(value ?? '').trim();

  if (!text) {
    return 'N/A';
  }

  return text.length > max
    ? `${text.slice(0, max - 3)}...`
    : text;
}

function cleanName(value) {
  return String(value || 'ticket')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 70);
}

function getQuestionText(question, index) {
  if (typeof question === 'string') {
    return question.trim();
  }

  return String(
    question?.question ||
    question?.text ||
    question?.label ||
    `Question ${index + 1}`,
  ).trim();
}

function applicationModalTitle(panel, page, pages) {
  const base =
    String(panel.title || 'LCSO Entry Application')
      .replace(/\s+/g, ' ')
      .trim();

  const suffix =
    pages > 1
      ? ` ${page + 1}/${pages}`
      : '';

  return `${base}${suffix}`.slice(0, 45);
}

function questionPlaceholder(question) {
  return truncate(
    question,
    100,
  );
}

async function canReview(interaction) {
  if (!interaction.inGuild()) {
    return false;
  }

  const member =
    interaction.member;

  if (
    member.permissions.has(
      PermissionFlagsBits.Administrator,
    ) ||
    member.permissions.has(
      PermissionFlagsBits.ManageGuild,
    ) ||
    member.permissions.has(
      PermissionFlagsBits.ManageRoles,
    )
  ) {
    return true;
  }

  const settings =
    await col('settings').findOne({
      guildId:
        interaction.guildId,
    });

  const adminRoleIds =
    Array.isArray(
      settings?.dashboardAdminRoleIds,
    )
      ? settings.dashboardAdminRoleIds
      : [];

  if (
    adminRoleIds.some(
      (roleId) =>
        member.roles.cache.has(
          roleId,
        ),
    )
  ) {
    return true;
  }

  const staffRanks = [
    'Corporal',
    'Sergeant',
    'Lieutenant',
    'Captain',
    'Assistant Sheriff',
    'Undersheriff',
    'Sheriff',
  ];

  return member.roles.cache.some(
    (role) =>
      staffRanks.some(
        (rank) =>
          role.name.toLowerCase() ===
          rank.toLowerCase(),
      ),
  );
}

async function getApplicationPanel(panelId) {
  const id =
    objectId(panelId);

  if (!id) {
    return null;
  }

  return col(
    'applicationpanels',
  ).findOne({
    _id: id,
  });
}

function getPanelOption(
  panel,
  optionKey,
) {
  const options =
    Array.isArray(panel?.options)
      ? panel.options
      : [];

  return options.find(
    (option) =>
      String(option.key) ===
      String(optionKey),
  );
}

/* =========================================================
   APPLICATION DRAFT / MULTI-PAGE MODAL
   ========================================================= */

async function createApplicationDraft(
  interaction,
  panel,
  option,
) {
  const result =
    await col(
      'applicationdrafts',
    ).insertOne({
      guildId:
        interaction.guildId,

      panelId:
        panel._id,

      optionKey:
        String(option.key),

      applicantId:
        interaction.user.id,

      applicantTag:
        interaction.user.tag ||
        interaction.user.username,

      answers: [],

      createdAt:
        new Date(),

      updatedAt:
        new Date(),
    });

  return result.insertedId;
}

async function showApplicationPage(
  interaction,
  draft,
  panel,
  option,
  page,
) {
  const questions =
    Array.isArray(option.questions)
      ? option.questions
      : [];

  if (!questions.length) {
    throw new Error(
      'This application has no questions configured.',
    );
  }

  const pages =
    Math.ceil(
      questions.length /
      QUESTIONS_PER_PAGE,
    );

  if (
    page < 0 ||
    page >= pages
  ) {
    throw new Error(
      'Invalid application page.',
    );
  }

  const start =
    page *
    QUESTIONS_PER_PAGE;

  const pageQuestions =
    questions.slice(
      start,
      start +
        QUESTIONS_PER_PAGE,
    );

  const modal =
    new ModalBuilder()
      .setCustomId(
        `lcso:applicationform:${draft._id}:${page}`,
      )
      .setTitle(
        applicationModalTitle(
          panel,
          page,
          pages,
        ),
      );

  pageQuestions.forEach(
    (questionData, localIndex) => {
      const absoluteIndex =
        start +
        localIndex;

      const question =
        getQuestionText(
          questionData,
          absoluteIndex,
        );

      const input =
        new TextInputBuilder()
          .setCustomId(
            `q_${absoluteIndex}`,
          )

          /*
           * DO NOT put the entire
           * question in the label.
           * Discord crops long labels
           * especially badly on mobile.
           */
          .setLabel(
            `Question ${absoluteIndex + 1}`,
          )

          .setPlaceholder(
            questionPlaceholder(
              question,
            ),
          )
          .setStyle(
            TextInputStyle.Paragraph,
          )
          .setRequired(true)
          .setMaxLength(1500);

      const oldAnswer =
        Array.isArray(
          draft.answers,
        )
          ? draft.answers.find(
              (answer) =>
                Number(
                  answer.index,
                ) ===
                absoluteIndex,
            )
          : null;

      if (
        oldAnswer?.answer
      ) {
        input.setValue(
          String(
            oldAnswer.answer,
          ).slice(
            0,
            1500,
          ),
        );
      }

      modal.addComponents(
        new ActionRowBuilder()
          .addComponents(input),
      );
    },
  );

  await interaction.showModal(
    modal,
  );
}

async function beginApplication(
  interaction,
) {
  const panelId =
    interaction.customId.split(
      ':',
    )[2];

  const optionKey =
    interaction.values?.[0];

  const panel =
    await getApplicationPanel(
      panelId,
    );

  if (
    !panel ||
    panel.active === false
  ) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ This application panel is no longer available.',
    });
  }

  const option =
    getPanelOption(
      panel,
      optionKey,
    );

  if (!option) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ That application option could not be found.',
    });
  }

  const existing =
    await col(
      'applications',
    ).findOne({
      guildId:
        interaction.guildId,

      panelId:
        panel._id,

      applicantId:
        interaction.user.id,

      status: 'Pending',
    });

  if (existing) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ You already have a pending application.',
    });
  }

  await col(
    'applicationdrafts',
  ).deleteMany({
    guildId:
      interaction.guildId,

    panelId:
      panel._id,

    applicantId:
      interaction.user.id,
  });

  const draftId =
    await createApplicationDraft(
      interaction,
      panel,
      option,
    );

  const draft =
    await col(
      'applicationdrafts',
    ).findOne({
      _id:
        draftId,
    });

  await showApplicationPage(
    interaction,
    draft,
    panel,
    option,
    0,
  );
}

async function continueApplication(
  interaction,
) {
  const parts =
    interaction.customId.split(
      ':',
    );

  const draftId =
    objectId(
      parts[2],
    );

  const page =
    Number(
      parts[3],
    );

  if (
    !draftId ||
    !Number.isInteger(page)
  ) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Invalid application session.',
    });
  }

  const draft =
    await col(
      'applicationdrafts',
    ).findOne({
      _id:
        draftId,

      applicantId:
        interaction.user.id,
    });

  if (!draft) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ This application session has expired.',
    });
  }

  const panel =
    await col(
      'applicationpanels',
    ).findOne({
      _id:
        draft.panelId,
    });

  if (!panel) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Application panel could not be found.',
    });
  }

  const option =
    getPanelOption(
      panel,
      draft.optionKey,
    );

  if (!option) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Application type could not be found.',
    });
  }

  await showApplicationPage(
    interaction,
    draft,
    panel,
    option,
    page,
  );
}

function buildReviewEmbed(
  interaction,
  panel,
  option,
  answers,
) {
  const embed =
    new EmbedBuilder()
      .setColor(0xc8a34d)
      .setTitle(
        '📋 Liberty County Sheriff’s Office | Application',
      )
      .setDescription(
        [
          `**Applicant:** <@${interaction.user.id}>`,
          `**Application:** ${truncate(
            option.label ||
            panel.title ||
            'LCSO Application',
            200,
          )}`,
          '',
          '**Application Answers**',
        ].join('\n'),
      )
      .setFooter({
        text:
          'Liberty County Sheriff’s Office • Springfield Roleplay',
      })
      .setTimestamp();

  for (
    const answer of
    answers
  ) {
    embed.addFields({
      name:
        `${Number(answer.index) + 1}. ${truncate(
          answer.question,
          240,
        )}`,

      value:
        truncate(
          answer.answer,
          1000,
        ),

      inline:
        false,
    });
  }

  const icon =
    interaction.guild.iconURL({
      size: 256,
    });

  if (icon) {
    embed.setThumbnail(
      icon,
    );
  }

  return embed;
}

async function finishApplication(
  interaction,
  draft,
  panel,
  option,
  answers,
) {
  const now =
    new Date();

  /*
   * Save FIRST.
   *
   * The Accept/Deny buttons receive
   * the exact MongoDB _id from this
   * insert. This prevents the old
   * "Application could not be found"
   * problem.
   */
  const insert =
    await col(
      'applications',
    ).insertOne({
      guildId:
        interaction.guildId,

      panelId:
        panel._id,

      applicantId:
        interaction.user.id,

      applicantTag:
        interaction.user.tag ||
        interaction.user.username,

      typeKey:
        String(
          option.key,
        ),

      typeLabel:
        option.label ||
        panel.title ||
        'LCSO Application',

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
        panel.reviewChannelId ||
        null,

      reviewMessageId:
        null,

      createdAt:
        now,

      updatedAt:
        now,
    });

  const applicationId =
    String(
      insert.insertedId,
    );

  const reviewChannelId =
    panel.reviewChannelId ||
    panel.channelId;

  const reviewChannel =
    interaction.guild.channels.cache.get(
      reviewChannelId,
    ) ||
    await interaction.guild.channels
      .fetch(
        reviewChannelId,
      )
      .catch(
        () => null,
      );

  if (
    !reviewChannel ||
    !reviewChannel.isTextBased()
  ) {
    await col(
      'applications',
    ).deleteOne({
      _id:
        insert.insertedId,
    });

    throw new Error(
      'The application review channel could not be found.',
    );
  }

  const reviewEmbed =
    buildReviewEmbed(
      interaction,
      panel,
      option,
      answers,
    );

  const buttons =
    new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(
            `lcso:appreview:${applicationId}:accept`,
          )
          .setLabel(
            'Accept',
          )
          .setStyle(
            ButtonStyle.Success,
          ),

        new ButtonBuilder()
          .setCustomId(
            `lcso:appreview:${applicationId}:deny`,
          )
          .setLabel(
            'Deny',
          )
          .setStyle(
            ButtonStyle.Danger,
          ),
      );

  const message =
    await reviewChannel.send({
      embeds: [
        reviewEmbed,
      ],

      components: [
        buttons,
      ],
    });

  await col(
    'applications',
  ).updateOne(
    {
      _id:
        insert.insertedId,
    },

    {
      $set: {
        reviewChannelId:
          reviewChannel.id,

        reviewMessageId:
          message.id,

        updatedAt:
          new Date(),
      },
    },
  );

  await col(
    'applicationdrafts',
  ).deleteOne({
    _id:
      draft._id,
  });

  return applicationId;
}

async function submitApplicationPage(
  interaction,
) {
  const parts =
    interaction.customId.split(
      ':',
    );

  const draftId =
    objectId(
      parts[2],
    );

  const page =
    Number(
      parts[3],
    );

  if (
    !draftId ||
    !Number.isInteger(page)
  ) {
    throw new Error(
      'Invalid application session.',
    );
  }

  const draft =
    await col(
      'applicationdrafts',
    ).findOne({
      _id:
        draftId,

      applicantId:
        interaction.user.id,
    });

  if (!draft) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ This application session has expired.',
    });
  }

  const panel =
    await col(
      'applicationpanels',
    ).findOne({
      _id:
        draft.panelId,
    });

  if (!panel) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Application panel could not be found.',
    });
  }

  const option =
    getPanelOption(
      panel,
      draft.optionKey,
    );

  if (!option) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Application type could not be found.',
    });
  }

  const questions =
    Array.isArray(
      option.questions,
    )
      ? option.questions
      : [];

  const start =
    page *
    QUESTIONS_PER_PAGE;

  const end =
    Math.min(
      start +
        QUESTIONS_PER_PAGE,
      questions.length,
    );

  const answerMap =
    new Map();

  for (
    const oldAnswer of
    Array.isArray(
      draft.answers,
    )
      ? draft.answers
      : []
  ) {
    answerMap.set(
      Number(
        oldAnswer.index,
      ),
      oldAnswer,
    );
  }

  for (
    let index = start;
    index < end;
    index += 1
  ) {
    const answer =
      interaction.fields.getTextInputValue(
        `q_${index}`,
      );

    answerMap.set(
      index,
      {
        index,

        question:
          getQuestionText(
            questions[index],
            index,
          ),

        answer:
          String(answer).trim(),
      },
    );
  }

  const answers =
    [
      ...answerMap.values(),
    ].sort(
      (a, b) =>
        Number(a.index) -
        Number(b.index),
    );

  await col(
    'applicationdrafts',
  ).updateOne(
    {
      _id:
        draft._id,
    },

    {
      $set: {
        answers,

        updatedAt:
          new Date(),
      },
    },
  );

  const pages =
    Math.ceil(
      questions.length /
      QUESTIONS_PER_PAGE,
    );

  if (
    page + 1 <
    pages
  ) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        `✅ Part ${page + 1} of ${pages} saved. Continue to the next section.`,

      components: [
        new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(
                `lcso:applicationcontinue:${draft._id}:${page + 1}`,
              )
              .setLabel(
                `Continue to Part ${page + 2}`,
              )
              .setStyle(
                ButtonStyle.Primary,
              ),
          ),
      ],
    });
  }

  await finishApplication(
    interaction,
    draft,
    panel,
    option,
    answers,
  );

  return interaction.reply({
    flags:
      MessageFlags.Ephemeral,

    content:
      '✅ Your application has been submitted to LCSO Command Staff.',
  });
}

/* =========================================================
   ACCEPT / DENY
   ========================================================= */

async function reviewApplication(
  interaction,
) {
  if (
    !await canReview(
      interaction,
    )
  ) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ You do not have permission to review applications.',
    });
  }

  const parts =
    interaction.customId.split(
      ':',
    );

  const applicationId =
    objectId(
      parts[2],
    );

  const decision =
    String(
      parts[3] ||
      '',
    ).toLowerCase();

  if (
    ![
      'accept',
      'deny',
    ].includes(
      decision,
    )
  ) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Invalid application decision.',
    });
  }

  /*
   * Primary lookup:
   * exact MongoDB ID stored in button.
   */
  let application =
    applicationId
      ? await col(
          'applications',
        ).findOne({
          _id:
            applicationId,

          guildId:
            interaction.guildId,
        })
      : null;

  /*
   * Safety fallback:
   * if an older message has a broken
   * button ID, locate the application
   * using the Discord review message.
   */
  if (!application) {
    application =
      await col(
        'applications',
      ).findOne({
        guildId:
          interaction.guildId,

        reviewMessageId:
          interaction.message.id,
      });
  }

  if (!application) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Application could not be found in the database.',
    });
  }

  if (
    application.status !==
    'Pending'
  ) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        `ℹ️ This application has already been **${application.status}**.`,
    });
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral,
  });

  const accepted =
    decision ===
    'accept';

  const status =
    accepted
      ? 'Accepted'
      : 'Denied';

  await col(
    'applications',
  ).updateOne(
    {
      _id:
        application._id,
    },

    {
      $set: {
        status,

        reviewedBy:
          interaction.user.id,

        reviewedAt:
          new Date(),

        updatedAt:
          new Date(),
      },
    },
  );

  const oldEmbed =
    interaction.message.embeds?.[0];

  if (oldEmbed) {
    const updated =
      EmbedBuilder.from(
        oldEmbed,
      )
        .setColor(
          accepted
            ? 0x57f287
            : 0xed4245,
        )
        .addFields({
          name:
            'Application Status',

          value:
            `${accepted ? '✅' : '❌'} **${status}** by <@${interaction.user.id}>`,

          inline:
            false,
        });

    await interaction.message.edit({
      embeds: [
        updated,
      ],

      components: [],
    });
  } else {
    await interaction.message.edit({
      components: [],
    });
  }

  const applicant =
    await interaction.client.users
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
            accepted
              ? 0x57f287
              : 0xed4245,
          )
          .setTitle(
            accepted
              ? '✅ LCSO Application Accepted'
              : '❌ LCSO Application Denied',
          )
          .setDescription(
            accepted
              ? 'Your application to the **Liberty County Sheriff’s Office** has been accepted.'
              : 'Your application to the **Liberty County Sheriff’s Office** has been denied.',
          )
          .setFooter({
            text:
              'Liberty County Sheriff’s Office • Springfield Roleplay',
          })
          .setTimestamp(),
      ],
    }).catch(
      () => null,
    );
  }

  await interaction.editReply({
    content:
      `✅ Application **${status.toLowerCase()}** successfully.`,
  });
}

/* =========================================================
   TICKET SUPPORT
   ========================================================= */

async function beginTicket(
  interaction,
) {
  const panelId =
    interaction.customId.split(
      ':',
    )[2];

  const id =
    objectId(
      panelId,
    );

  if (!id) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Invalid ticket panel.',
    });
  }

  const panel =
    await col(
      'ticketpanels',
    ).findOne({
      _id: id,
    });

  if (!panel) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Ticket panel could not be found.',
    });
  }

  const optionKey =
    interaction.values?.[0];

  const option =
    (
      Array.isArray(
        panel.options,
      )
        ? panel.options
        : []
    ).find(
      (entry) =>
        String(entry.key) ===
        String(optionKey),
    );

  if (!option) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Ticket type could not be found.',
    });
  }

  const modal =
    new ModalBuilder()
      .setCustomId(
        `lcso:ticketform:${panel._id}:${option.key}`,
      )
      .setTitle(
        'Open LCSO Ticket',
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
      .setRequired(true)
      .setMaxLength(100);

  const details =
    new TextInputBuilder()
      .setCustomId(
        'details',
      )
      .setLabel(
        'Details',
      )
      .setPlaceholder(
        'Describe what you need assistance with.',
      )
      .setStyle(
        TextInputStyle.Paragraph,
      )
      .setRequired(true)
      .setMaxLength(1500);

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

async function submitTicket(
  interaction,
) {
  const parts =
    interaction.customId.split(
      ':',
    );

  const panelId =
    objectId(
      parts[2],
    );

  const optionKey =
    parts[3];

  const panel =
    panelId
      ? await col(
          'ticketpanels',
        ).findOne({
          _id:
            panelId,
        })
      : null;

  if (!panel) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Ticket panel could not be found.',
    });
  }

  const option =
    (
      Array.isArray(
        panel.options,
      )
        ? panel.options
        : []
    ).find(
      (entry) =>
        String(entry.key) ===
        String(optionKey),
    );

  if (!option) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Ticket type could not be found.',
    });
  }

  await interaction.deferReply({
    flags:
      MessageFlags.Ephemeral,
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

  const supportRoleIds =
    Array.isArray(
      panel.supportRoleIds,
    )
      ? panel.supportRoleIds
      : [];

  const overwrites = [
    {
      id:
        interaction.guild.roles
          .everyone.id,

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
      ],
    },

    {
      id:
        interaction.client.user.id,

      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  for (
    const roleId of
    supportRoleIds
  ) {
    overwrites.push({
      id:
        roleId,

      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const prefix =
    cleanName(
      option.prefix ||
      option.key ||
      'ticket',
    );

  const channel =
    await interaction.guild.channels.create({
      name:
        `${prefix}-${cleanName(
          interaction.user.username,
        )}`.slice(
          0,
          95,
        ),

      type:
        ChannelType.GuildText,

      parent:
        panel.categoryId ||
        null,

      permissionOverwrites:
        overwrites,
    });

  const result =
    await col(
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
        option.label ||
        option.key,

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
    });

  await channel.send({
    content:
      `<@${interaction.user.id}>`,

    embeds: [
      new EmbedBuilder()
        .setColor(
          0xc8a34d,
        )
        .setTitle(
          `🎫 ${option.label || 'LCSO Ticket'}`,
        )
        .setDescription(
          [
            `**Opened By:** <@${interaction.user.id}>`,
            `**Subject:** ${truncate(
              subject,
              200,
            )}`,
            '',
            truncate(
              details,
              3500,
            ),
          ].join('\n'),
        )
        .setFooter({
          text:
            'Liberty County Sheriff’s Office • Springfield Roleplay',
        })
        .setTimestamp(),
    ],

    components: [
      new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(
              `lcso:ticketclose:${result.insertedId}`,
            )
            .setLabel(
              'Close Ticket',
            )
            .setStyle(
              ButtonStyle.Danger,
            ),
        ),
    ],
  });

  await interaction.editReply({
    content:
      `✅ Ticket created: <#${channel.id}>`,
  });
}

async function closeTicket(
  interaction,
) {
  const ticketId =
    objectId(
      interaction.customId.split(
        ':',
      )[2],
    );

  if (!ticketId) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Invalid ticket.',
    });
  }

  const ticket =
    await col(
      'tickets',
    ).findOne({
      _id:
        ticketId,

      guildId:
        interaction.guildId,
    });

  if (!ticket) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ Ticket could not be found.',
    });
  }

  const panel =
    await col(
      'ticketpanels',
    ).findOne({
      _id:
        ticket.panelId,
    });

  const supportRoleIds =
    Array.isArray(
      panel?.supportRoleIds,
    )
      ? panel.supportRoleIds
      : [];

  const member =
    interaction.member;

  const allowed =
    interaction.user.id ===
      ticket.ownerId ||
    member.permissions.has(
      PermissionFlagsBits.Administrator,
    ) ||
    member.permissions.has(
      PermissionFlagsBits.ManageChannels,
    ) ||
    supportRoleIds.some(
      (roleId) =>
        member.roles.cache.has(
          roleId,
        ),
    );

  if (!allowed) {
    return interaction.reply({
      flags:
        MessageFlags.Ephemeral,

      content:
        '❌ You cannot close this ticket.',
    });
  }

  await interaction.reply({
    content:
      '🔒 Ticket closing...',
  });

  await col(
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

  setTimeout(
    () => {
      interaction.channel
        ?.delete(
          `Ticket closed by ${interaction.user.tag}`,
        )
        .catch(
          () => null,
        );
    },
    3000,
  );
}

/* =========================================================
   MAIN EVENT
   ========================================================= */

export default {
  name:
    Events.InteractionCreate,

  async execute(
    interaction,
  ) {
    try {
      if (
        interaction.isStringSelectMenu()
      ) {
        if (
          interaction.customId.startsWith(
            'lcso:application:',
          )
        ) {
          return beginApplication(
            interaction,
          );
        }

        if (
          interaction.customId.startsWith(
            'lcso:ticket:',
          )
        ) {
          return beginTicket(
            interaction,
          );
        }

        return;
      }

      if (
        interaction.isButton()
      ) {
        if (
          interaction.customId.startsWith(
            'lcso:applicationcontinue:',
          )
        ) {
          return continueApplication(
            interaction,
          );
        }

        if (
          interaction.customId.startsWith(
            'lcso:appreview:',
          )
        ) {
          return reviewApplication(
            interaction,
          );
        }

        if (
          interaction.customId.startsWith(
            'lcso:ticketclose:',
          )
        ) {
          return closeTicket(
            interaction,
          );
        }

        return;
      }

      if (
        interaction.isModalSubmit()
      ) {
        if (
          interaction.customId.startsWith(
            'lcso:applicationform:',
          )
        ) {
          return submitApplicationPage(
            interaction,
          );
        }

        if (
          interaction.customId.startsWith(
            'lcso:ticketform:',
          )
        ) {
          return submitTicket(
            interaction,
          );
        }
      }
    } catch (error) {
      console.error(
        '[PORTAL INTERACTION ERROR]',
        error,
      );

      logger.error(
        `Portal interaction failed: ${
          error instanceof Error
            ? error.stack ||
              error.message
            : String(error)
        }`,
      );

      const payload = {
        flags:
          MessageFlags.Ephemeral,

        content:
          `❌ ${
            error instanceof Error
              ? error.message
              : 'The action could not be completed.'
          }`,
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
