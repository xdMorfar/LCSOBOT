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

function getDb() {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error(
      'MongoDB is not connected.',
    );
  }

  return db;
}

function objectId(value) {
  if (
    !mongoose.Types.ObjectId.isValid(
      String(value),
    )
  ) {
    return null;
  }

  return new mongoose.Types.ObjectId(
    String(value),
  );
}

function truncate(
  value,
  length,
) {
  const text = String(
    value ?? '',
  );

  if (
    text.length <= length
  ) {
    return text;
  }

  return `${text.slice(
    0,
    Math.max(
      0,
      length - 3,
    ),
  )}...`;
}

function safeName(value) {
  return String(
    value || 'user',
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
      /^-+|-+$/g,
      '',
    )
    .slice(0, 40);
}

function choiceKey(
  choice,
  index,
) {
  return String(
    choice?.key ||
      choice?.value ||
      choice?.id ||
      choice?.label ||
      `option-${index + 1}`,
  );
}

function findChoice(
  choices,
  selected,
) {
  return choices.find(
    (choice, index) =>
      choiceKey(
        choice,
        index,
      ) === selected,
  );
}

function getApplicationChoices(
  panel,
) {
  if (
    Array.isArray(
      panel?.applications,
    )
  ) {
    return panel.applications;
  }

  if (
    Array.isArray(
      panel?.types,
    )
  ) {
    return panel.types;
  }

  if (
    Array.isArray(
      panel?.options,
    )
  ) {
    return panel.options;
  }

  return [];
}

function getTicketChoices(
  panel,
) {
  if (
    Array.isArray(
      panel?.ticketTypes,
    )
  ) {
    return panel.ticketTypes;
  }

  if (
    Array.isArray(
      panel?.types,
    )
  ) {
    return panel.types;
  }

  if (
    Array.isArray(
      panel?.options,
    )
  ) {
    return panel.options;
  }

  return [];
}

function buildApplicationModal(
  draft,
  page,
) {
  const questions =
    Array.isArray(
      draft.questions,
    )
      ? draft.questions
      : [];

  const start =
    page * 5;

  const currentQuestions =
    questions.slice(
      start,
      start + 5,
    );

  const modal =
    new ModalBuilder()
      .setCustomId(
        `lcso:application-modal:${draft._id}:${page}`,
      )
      .setTitle(
        truncate(
          `${draft.typeLabel || 'Application'} ${page + 1}`,
          45,
        ),
      );

  for (
    let localIndex = 0;
    localIndex <
    currentQuestions.length;
    localIndex += 1
  ) {
    const absoluteIndex =
      start + localIndex;

    const question =
      String(
        currentQuestions[
          localIndex
        ] || '',
      );

    const input =
      new TextInputBuilder()
        .setCustomId(
          `q${absoluteIndex}`,
        )
        .setLabel(
          truncate(
            question ||
              `Question ${absoluteIndex + 1}`,
            45,
          ),
        )
        .setStyle(
          TextInputStyle.Paragraph,
        )
        .setRequired(true)
        .setMaxLength(2000);

    if (
      question.length > 45
    ) {
      input.setPlaceholder(
        truncate(
          question,
          100,
        ),
      );
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        input,
      ),
    );
  }

  return modal;
}

async function isStaff(
  interaction,
) {
  if (!interaction.guild) {
    return false;
  }

  const member =
    await interaction.guild.members
      .fetch(
        interaction.user.id,
      )
      .catch(() => null);

  if (!member) {
    return false;
  }

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
    await getDb()
      .collection('settings')
      .findOne({
        guildId:
          interaction.guild.id,
      });

  const roleIds =
    Array.isArray(
      settings?.dashboardAdminRoleIds,
    )
      ? settings.dashboardAdminRoleIds
      : [];

  return roleIds.some(
    (roleId) =>
      member.roles.cache.has(
        roleId,
      ),
  );
}

/* =========================================================
   APPLICATIONS
   ========================================================= */

async function startApplication(
  interaction,
) {
  const prefix =
    'lcso:application:';

  const panelId =
    interaction.customId.slice(
      prefix.length,
    );

  const oid =
    objectId(panelId);

  if (!oid) {
    await interaction.reply({
      content:
        '❌ Application panel could not be found.',
      ephemeral: true,
    });

    return;
  }

  const panel =
    await getDb()
      .collection(
        'applicationpanels',
      )
      .findOne({
        _id: oid,
        guildId:
          interaction.guild.id,
      });

  if (!panel) {
    await interaction.reply({
      content:
        '❌ This application panel no longer exists.',
      ephemeral: true,
    });

    return;
  }

  const choices =
    getApplicationChoices(
      panel,
    );

  const selected =
    interaction.values[0];

  const choice =
    findChoice(
      choices,
      selected,
    );

  if (!choice) {
    await interaction.reply({
      content:
        '❌ That application type could not be found.',
      ephemeral: true,
    });

    return;
  }

  const questions =
    Array.isArray(
      choice.questions,
    )
      ? choice.questions
          .map((question) =>
            String(
              question || '',
            ).trim(),
          )
          .filter(Boolean)
          .slice(0, 15)
      : [];

  if (
    questions.length === 0
  ) {
    await interaction.reply({
      content:
        '❌ This application has no questions configured.',
      ephemeral: true,
    });

    return;
  }

  const now =
    new Date();

  const draftResult =
    await getDb()
      .collection(
        'applicationdrafts',
      )
      .insertOne({
        guildId:
          interaction.guild.id,

        panelId:
          panel._id,

        typeKey:
          selected,

        typeLabel:
          choice.label ||
          selected,

        applicantId:
          interaction.user.id,

        applicantTag:
          interaction.user.tag,

        questions,

        answerMap: {},

        createdAt:
          now,

        updatedAt:
          now,

        expiresAt:
          new Date(
            now.getTime() +
              60 * 60 * 1000,
          ),
      });

  const draft =
    await getDb()
      .collection(
        'applicationdrafts',
      )
      .findOne({
        _id:
          draftResult.insertedId,
      });

  if (!draft) {
    await interaction.reply({
      content:
        '❌ Could not create the application.',
      ephemeral: true,
    });

    return;
  }

  await interaction.showModal(
    buildApplicationModal(
      draft,
      0,
    ),
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
    parts[2];

  const page =
    Number(parts[3]);

  const oid =
    objectId(draftId);

  if (
    !oid ||
    !Number.isInteger(page)
  ) {
    await interaction.reply({
      content:
        '❌ Application session is invalid.',
      ephemeral: true,
    });

    return;
  }

  const draft =
    await getDb()
      .collection(
        'applicationdrafts',
      )
      .findOne({
        _id: oid,
        applicantId:
          interaction.user.id,
      });

  if (!draft) {
    await interaction.reply({
      content:
        '❌ This application session has expired.',
      ephemeral: true,
    });

    return;
  }

  await interaction.showModal(
    buildApplicationModal(
      draft,
      page,
    ),
  );
}

async function submitApplicationPage(
  interaction,
) {
  const parts =
    interaction.customId.split(
      ':',
    );

  const draftId =
    parts[2];

  const page =
    Number(parts[3]);

  const oid =
    objectId(draftId);

  if (
    !oid ||
    !Number.isInteger(page)
  ) {
    await interaction.reply({
      content:
        '❌ Application session is invalid.',
      ephemeral: true,
    });

    return;
  }

  const drafts =
    getDb().collection(
      'applicationdrafts',
    );

  const draft =
    await drafts.findOne({
      _id: oid,
      applicantId:
        interaction.user.id,
    });

  if (!draft) {
    await interaction.reply({
      content:
        '❌ This application session has expired.',
      ephemeral: true,
    });

    return;
  }

  const questions =
    Array.isArray(
      draft.questions,
    )
      ? draft.questions
      : [];

  const answerMap = {
    ...(draft.answerMap ||
      {}),
  };

  const start =
    page * 5;

  const currentQuestions =
    questions.slice(
      start,
      start + 5,
    );

  for (
    let localIndex = 0;
    localIndex <
    currentQuestions.length;
    localIndex += 1
  ) {
    const absoluteIndex =
      start +
      localIndex;

    answerMap[
      String(absoluteIndex)
    ] =
      interaction.fields.getTextInputValue(
        `q${absoluteIndex}`,
      );
  }

  await drafts.updateOne(
    {
      _id: draft._id,
    },
    {
      $set: {
        answerMap,
        updatedAt:
          new Date(),
      },
    },
  );

  const nextStart =
    start + 5;

  if (
    nextStart <
    questions.length
  ) {
    const nextPage =
      page + 1;

    const button =
      new ButtonBuilder()
        .setCustomId(
          `lcso:application-next:${draft._id}:${nextPage}`,
        )
        .setLabel(
          `Continue to Part ${nextPage + 1}`,
        )
        .setStyle(
          ButtonStyle.Primary,
        );

    await interaction.reply({
      content:
        `✅ Part ${page + 1} completed. Continue to the next part of the application.`,
      components: [
        new ActionRowBuilder().addComponents(
          button,
        ),
      ],
      ephemeral: true,
    });

    return;
  }

  await finishApplication(
    interaction,
    {
      ...draft,
      answerMap,
    },
  );
}

async function finishApplication(
  interaction,
  draft,
) {
  const panel =
    await getDb()
      .collection(
        'applicationpanels',
      )
      .findOne({
        _id:
          draft.panelId,
        guildId:
          interaction.guild.id,
      });

  if (!panel) {
    await interaction.reply({
      content:
        '❌ Application panel no longer exists.',
      ephemeral: true,
    });

    return;
  }

  const choices =
    getApplicationChoices(
      panel,
    );

  const choice =
    findChoice(
      choices,
      draft.typeKey,
    );

  const reviewChannelId =
    panel.reviewChannelId ||
    panel.applicationReviewChannelId;

  if (!reviewChannelId) {
    await interaction.reply({
      content:
        '❌ Application review channel has not been configured.',
      ephemeral: true,
    });

    return;
  }

  const reviewChannel =
    interaction.guild.channels.cache.get(
      reviewChannelId,
    ) ||
    (await interaction.guild.channels
      .fetch(
        reviewChannelId,
      )
      .catch(() => null));

  if (
    !reviewChannel ||
    !reviewChannel.isTextBased() ||
    typeof reviewChannel.send !==
      'function'
  ) {
    await interaction.reply({
      content:
        '❌ The configured application review channel is invalid.',
      ephemeral: true,
    });

    return;
  }

  const questions =
    Array.isArray(
      draft.questions,
    )
      ? draft.questions
      : [];

  const answers =
    questions.map(
      (
        question,
        index,
      ) => ({
        question,
        answer:
          String(
            draft.answerMap?.[
              String(index)
            ] || '',
          ).trim(),
      }),
    );

  const now =
    new Date();

  const result =
    await getDb()
      .collection(
        'applications',
      )
      .insertOne({
        guildId:
          interaction.guild.id,

        panelId:
          panel._id,

        typeKey:
          draft.typeKey,

        typeLabel:
          draft.typeLabel,

        applicantId:
          interaction.user.id,

        applicantTag:
          interaction.user.tag,

        questions,

        answers,

        status:
          'Pending',

        reviewChannelId,

        createdAt:
          now,

        updatedAt:
          now,
      });

  const embed =
    new EmbedBuilder()
      .setColor(0xc9a15b)
      .setTitle(
        `📋 New Application — ${draft.typeLabel}`,
      )
      .setDescription(
        `**Applicant:** <@${interaction.user.id}>\n**Application:** ${draft.typeLabel}`,
      )
      .setFooter({
        text:
          'Liberty County Sheriff’s Office • Springfield Roleplay',
      })
      .setTimestamp(now);

  for (
    let index = 0;
    index <
    answers.length;
    index += 1
  ) {
    const item =
      answers[index];

    embed.addFields({
      name:
        `${index + 1}. ${truncate(
          item.question,
          240,
        )}`,

      value:
        truncate(
          item.answer ||
            'No response',
          1000,
        ),

      inline: false,
    });
  }

  const accept =
    new ButtonBuilder()
      .setCustomId(
        `lcso:application-review:${result.insertedId}:accept`,
      )
      .setLabel('Accept')
      .setStyle(
        ButtonStyle.Success,
      );

  const deny =
    new ButtonBuilder()
      .setCustomId(
        `lcso:application-review:${result.insertedId}:deny`,
      )
      .setLabel('Deny')
      .setStyle(
        ButtonStyle.Danger,
      );

  const reviewMessage =
    await reviewChannel.send({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(
          accept,
          deny,
        ),
      ],
      allowedMentions: {
        users: [
          interaction.user.id,
        ],
      },
    });

  await getDb()
    .collection(
      'applications',
    )
    .updateOne(
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

  await getDb()
    .collection(
      'applicationdrafts',
    )
    .deleteOne({
      _id:
        draft._id,
    });

  await interaction.reply({
    content:
      `✅ Your **${draft.typeLabel}** application has been submitted successfully.`,
    ephemeral: true,
  });
}

async function openApplicationReview(
  interaction,
) {
  if (
    !(await isStaff(
      interaction,
    ))
  ) {
    await interaction.reply({
      content:
        '❌ You do not have permission to review applications.',
      ephemeral: true,
    });

    return;
  }

  const parts =
    interaction.customId.split(
      ':',
    );

  const applicationId =
    parts[2];

  const decision =
    parts[3];

  const oid =
    objectId(
      applicationId,
    );

  if (!oid) {
    await interaction.reply({
      content:
        '❌ Application could not be found.',
      ephemeral: true,
    });

    return;
  }

  const application =
    await getDb()
      .collection(
        'applications',
      )
      .findOne({
        _id: oid,
        guildId:
          interaction.guild.id,
      });

  if (!application) {
    await interaction.reply({
      content:
        '❌ Application could not be found.',
      ephemeral: true,
    });

    return;
  }

  if (
    String(
      application.status,
    ).toLowerCase() !==
    'pending'
  ) {
    await interaction.reply({
      content:
        '❌ This application has already been reviewed.',
      ephemeral: true,
    });

    return;
  }

  const modal =
    new ModalBuilder()
      .setCustomId(
        `lcso:application-review-modal:${applicationId}:${decision}`,
      )
      .setTitle(
        decision === 'accept'
          ? 'Accept Application'
          : 'Deny Application',
      );

  const reason =
    new TextInputBuilder()
      .setCustomId('reason')
      .setLabel(
        'Reason / Notes',
      )
      .setStyle(
        TextInputStyle.Paragraph,
      )
      .setRequired(false)
      .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      reason,
    ),
  );

  await interaction.showModal(
    modal,
  );
}

async function submitApplicationReview(
  interaction,
) {
  if (
    !(await isStaff(
      interaction,
    ))
  ) {
    await interaction.reply({
      content:
        '❌ You do not have permission to review applications.',
      ephemeral: true,
    });

    return;
  }

  const parts =
    interaction.customId.split(
      ':',
    );

  const applicationId =
    parts[3];

  const decision =
    parts[4];

  const oid =
    objectId(
      applicationId,
    );

  if (!oid) {
    await interaction.reply({
      content:
        '❌ Application could not be found.',
      ephemeral: true,
    });

    return;
  }

  const applications =
    getDb().collection(
      'applications',
    );

  const application =
    await applications.findOne({
      _id: oid,
      guildId:
        interaction.guild.id,
    });

  if (!application) {
    await interaction.reply({
      content:
        '❌ Application could not be found.',
      ephemeral: true,
    });

    return;
  }

  const reason =
    interaction.fields
      .getTextInputValue(
        'reason',
      )
      .trim();

  const accepted =
    decision === 'accept';

  const status =
    accepted
      ? 'Accepted'
      : 'Denied';

  const now =
    new Date();

  await applications.updateOne(
    {
      _id: application._id,
    },
    {
      $set: {
        status,
        reviewedBy:
          interaction.user.id,
        reviewedByTag:
          interaction.user.tag,
        reviewReason:
          reason || null,
        reviewedAt: now,
        updatedAt: now,
      },
    },
  );

  /*
   * Optional accepted role support.
   * If an application type later has
   * acceptedRoleId configured, it will
   * automatically be assigned.
   */
  if (accepted) {
    const panel =
      await getDb()
        .collection(
          'applicationpanels',
        )
        .findOne({
          _id:
            application.panelId,
        });

    const choice =
      findChoice(
        getApplicationChoices(
          panel,
        ),
        application.typeKey,
      );

    const acceptedRoleId =
      choice?.acceptedRoleId ||
      panel?.acceptedRoleId;

    if (acceptedRoleId) {
      const member =
        await interaction.guild.members
          .fetch(
            application.applicantId,
          )
          .catch(() => null);

      const role =
        interaction.guild.roles.cache.get(
          acceptedRoleId,
        );

      if (
        member &&
        role &&
        role.editable
      ) {
        await member.roles
          .add(role)
          .catch(() => {});
      }
    }
  }

  const applicant =
    await interaction.client.users
      .fetch(
        application.applicantId,
      )
      .catch(() => null);

  if (applicant) {
    const resultEmbed =
      new EmbedBuilder()
        .setColor(
          accepted
            ? 0x57f287
            : 0xed4245,
        )
        .setTitle(
          accepted
            ? '✅ Application Accepted'
            : '❌ Application Denied',
        )
        .setDescription(
          [
            `Your **${application.typeLabel || 'LCSO'}** application has been **${status.toLowerCase()}**.`,
            '',
            `**Reviewed by:** ${interaction.user.tag}`,
            `**Reason:** ${reason || 'No reason provided.'}`,
          ].join('\n'),
        )
        .setFooter({
          text:
            'Liberty County Sheriff’s Office • Springfield Roleplay',
        })
        .setTimestamp();

    await applicant
      .send({
        embeds: [
          resultEmbed,
        ],
      })
      .catch(() => {});
  }

  if (
    application.reviewChannelId &&
    application.reviewMessageId
  ) {
    const reviewChannel =
      interaction.guild.channels.cache.get(
        application.reviewChannelId,
      ) ||
      (await interaction.guild.channels
        .fetch(
          application.reviewChannelId,
        )
        .catch(() => null));

    if (
      reviewChannel &&
      reviewChannel.isTextBased() &&
      reviewChannel.messages
    ) {
      const reviewMessage =
        await reviewChannel.messages
          .fetch(
            application.reviewMessageId,
          )
          .catch(() => null);

      if (reviewMessage) {
        const oldEmbed =
          reviewMessage.embeds[0];

        const updatedEmbed =
          oldEmbed
            ? EmbedBuilder.from(
                oldEmbed,
              )
            : new EmbedBuilder()
                .setTitle(
                  application.typeLabel ||
                    'Application',
                );

        updatedEmbed
          .setColor(
            accepted
              ? 0x57f287
              : 0xed4245,
          )
          .addFields({
            name: 'Decision',
            value: [
              `**Status:** ${status}`,
              `**Reviewed By:** <@${interaction.user.id}>`,
              `**Reason:** ${reason || 'No reason provided.'}`,
            ].join('\n'),
          });

        await reviewMessage
          .edit({
            embeds: [
              updatedEmbed,
            ],
            components: [],
          })
          .catch(() => {});
      }
    }
  }

  await interaction.reply({
    content:
      `✅ Application ${status.toLowerCase()}.`,
    ephemeral: true,
  });
}

/* =========================================================
   TICKETS
   ========================================================= */

async function startTicket(
  interaction,
) {
  const panelId =
    interaction.customId.slice(
      'lcso:ticket:'.length,
    );

  const oid =
    objectId(panelId);

  if (!oid) {
    await interaction.reply({
      content:
        '❌ Ticket panel could not be found.',
      ephemeral: true,
    });

    return;
  }

  const panel =
    await getDb()
      .collection(
        'ticketpanels',
      )
      .findOne({
        _id: oid,
        guildId:
          interaction.guild.id,
      });

  if (!panel) {
    await interaction.reply({
      content:
        '❌ This ticket panel no longer exists.',
      ephemeral: true,
    });

    return;
  }

  const choices =
    getTicketChoices(
      panel,
    );

  const selected =
    interaction.values[0];

  const choice =
    findChoice(
      choices,
      selected,
    );

  if (!choice) {
    await interaction.reply({
      content:
        '❌ Ticket type could not be found.',
      ephemeral: true,
    });

    return;
  }

  const modal =
    new ModalBuilder()
      .setCustomId(
        `lcso:ticket-modal:${panel._id}:${encodeURIComponent(
          selected,
        )}`,
      )
      .setTitle(
        truncate(
          choice.label ||
            'Open Ticket',
          45,
        ),
      );

  const subject =
    new TextInputBuilder()
      .setCustomId('subject')
      .setLabel('Subject')
      .setStyle(
        TextInputStyle.Short,
      )
      .setRequired(true)
      .setMaxLength(100);

  const details =
    new TextInputBuilder()
      .setCustomId('details')
      .setLabel(
        'Explain what you need help with',
      )
      .setStyle(
        TextInputStyle.Paragraph,
      )
      .setRequired(true)
      .setMaxLength(2000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      subject,
    ),
    new ActionRowBuilder().addComponents(
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
    parts[2];

  const selected =
    decodeURIComponent(
      parts.slice(3).join(
        ':',
      ),
    );

  const oid =
    objectId(panelId);

  if (!oid) {
    await interaction.reply({
      content:
        '❌ Ticket panel could not be found.',
      ephemeral: true,
    });

    return;
  }

  const panel =
    await getDb()
      .collection(
        'ticketpanels',
      )
      .findOne({
        _id: oid,
        guildId:
          interaction.guild.id,
      });

  if (!panel) {
    await interaction.reply({
      content:
        '❌ Ticket panel no longer exists.',
      ephemeral: true,
    });

    return;
  }

  const choices =
    getTicketChoices(
      panel,
    );

  const choice =
    findChoice(
      choices,
      selected,
    );

  if (!choice) {
    await interaction.reply({
      content:
        '❌ Ticket type could not be found.',
      ephemeral: true,
    });

    return;
  }

  const categoryId =
    choice.categoryId ||
    panel.categoryId ||
    panel.ticketCategoryId;

  const supportRoleIds =
    Array.isArray(
      choice.supportRoleIds,
    )
      ? choice.supportRoleIds
      : Array.isArray(
          panel.supportRoleIds,
        )
        ? panel.supportRoleIds
        : [];

  const prefix =
    safeName(
      choice.prefix ||
        choice.label ||
        'ticket',
    ) || 'ticket';

  const username =
    safeName(
      interaction.user.username,
    ) || 'user';

  const permissions = [
    {
      id:
        interaction.guild
          .roles.everyone.id,
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
    const roleId of supportRoleIds
  ) {
    if (
      interaction.guild.roles.cache.has(
        roleId,
      )
    ) {
      permissions.push({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      });
    }
  }

  const channel =
    await interaction.guild.channels.create({
      name:
        `${prefix}-${username}`.slice(
          0,
          90,
        ),

      type:
        ChannelType.GuildText,

      parent:
        categoryId ||
        undefined,

      permissionOverwrites:
        permissions,

      reason:
        `LCSO ticket opened by ${interaction.user.tag}`,
    });

  const subject =
    interaction.fields
      .getTextInputValue(
        'subject',
      )
      .trim();

  const details =
    interaction.fields
      .getTextInputValue(
        'details',
      )
      .trim();

  const now =
    new Date();

  const result =
    await getDb()
      .collection('tickets')
      .insertOne({
        guildId:
          interaction.guild.id,

        ownerId:
          interaction.user.id,

        ownerTag:
          interaction.user.tag,

        panelId:
          panel._id,

        typeKey:
          selected,

        type:
          choice.label ||
          selected,

        subject,
        details,

        channelId:
          channel.id,

        status:
          'Open',

        supportRoleIds,

        createdAt:
          now,

        updatedAt:
          now,
      });

  const welcome =
    new EmbedBuilder()
      .setColor(0xc9a15b)
      .setTitle(
        `📩 ${choice.label || 'LCSO Support'}`,
      )
      .setDescription(
        [
          `Welcome <@${interaction.user.id}>.`,
          '',
          'A member of the Liberty County Sheriff’s Office will assist you as soon as possible.',
          '',
          `**Subject:** ${subject}`,
          `**Details:** ${details}`,
        ].join('\n'),
      )
      .setFooter({
        text:
          'Liberty County Sheriff’s Office • Springfield Roleplay',
      })
      .setTimestamp(now);

  const close =
    new ButtonBuilder()
      .setCustomId(
        `lcso:ticket-close:${result.insertedId}`,
      )
      .setLabel(
        'Close Ticket',
      )
      .setStyle(
        ButtonStyle.Danger,
      );

  await channel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [welcome],
    components: [
      new ActionRowBuilder().addComponents(
        close,
      ),
    ],
    allowedMentions: {
      users: [
        interaction.user.id,
      ],
      roles:
        supportRoleIds,
    },
  });

  await interaction.reply({
    content:
      `✅ Your ticket has been created: ${channel}`,
    ephemeral: true,
  });
}

async function closeTicket(
  interaction,
) {
  let ticketId;

  if (
    interaction.customId.startsWith(
      'lcso:ticket-close:',
    )
  ) {
    ticketId =
      interaction.customId.slice(
        'lcso:ticket-close:'
          .length,
      );
  } else {
    ticketId =
      interaction.customId.slice(
        'lcso:ticket:close:'
          .length,
      );
  }

  const oid =
    objectId(ticketId);

  if (!oid) {
    await interaction.reply({
      content:
        '❌ Ticket could not be found.',
      ephemeral: true,
    });

    return;
  }

  const tickets =
    getDb().collection(
      'tickets',
    );

  const ticket =
    await tickets.findOne({
      _id: oid,
      guildId:
        interaction.guild.id,
    });

  if (!ticket) {
    await interaction.reply({
      content:
        '❌ Ticket could not be found.',
      ephemeral: true,
    });

    return;
  }

  const member =
    await interaction.guild.members
      .fetch(
        interaction.user.id,
      )
      .catch(() => null);

  const supportRoleIds =
    Array.isArray(
      ticket.supportRoleIds,
    )
      ? ticket.supportRoleIds
      : [];

  const supportMember =
    member &&
    supportRoleIds.some(
      (roleId) =>
        member.roles.cache.has(
          roleId,
        ),
    );

  const permitted =
    interaction.user.id ===
      ticket.ownerId ||
    supportMember ||
    member?.permissions.has(
      PermissionFlagsBits.ManageChannels,
    ) ||
    member?.permissions.has(
      PermissionFlagsBits.Administrator,
    );

  if (!permitted) {
    await interaction.reply({
      content:
        '❌ You cannot close this ticket.',
      ephemeral: true,
    });

    return;
  }

  await tickets.updateOne(
    {
      _id: ticket._id,
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
    content:
      '🔒 Ticket closed. This channel will be deleted shortly.',
  });

  setTimeout(() => {
    interaction.channel
      ?.delete(
        `Ticket closed by ${interaction.user.tag}`,
      )
      .catch(() => {});
  }, 3000);
}

/* =========================================================
   EVENT
   ========================================================= */

export default {
  name: Events.InteractionCreate,

  async execute(interaction) {
    try {
      /*
       * APPLICATION DROPDOWN
       */
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith(
          'lcso:application:',
        )
      ) {
        await startApplication(
          interaction,
        );

        return;
      }

      /*
       * TICKET DROPDOWN
       */
      if (
        interaction.isStringSelectMenu() &&
        interaction.customId.startsWith(
          'lcso:ticket:',
        )
      ) {
        await startTicket(
          interaction,
        );

        return;
      }

      /*
       * APPLICATION CONTINUE
       */
      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          'lcso:application-next:',
        )
      ) {
        await continueApplication(
          interaction,
        );

        return;
      }

      /*
       * APPLICATION REVIEW
       */
      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          'lcso:application-review:',
        )
      ) {
        await openApplicationReview(
          interaction,
        );

        return;
      }

      /*
       * TICKET CLOSE
       */
      if (
        interaction.isButton() &&
        (
          interaction.customId.startsWith(
            'lcso:ticket-close:',
          ) ||
          interaction.customId.startsWith(
            'lcso:ticket:close:',
          )
        )
      ) {
        await closeTicket(
          interaction,
        );

        return;
      }

      /*
       * APPLICATION QUESTION PAGE
       */
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          'lcso:application-modal:',
        )
      ) {
        await submitApplicationPage(
          interaction,
        );

        return;
      }

      /*
       * APPLICATION REVIEW MODAL
       */
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          'lcso:application-review-modal:',
        )
      ) {
        await submitApplicationReview(
          interaction,
        );

        return;
      }

      /*
       * TICKET MODAL
       */
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(
          'lcso:ticket-modal:',
        )
      ) {
        await submitTicket(
          interaction,
        );
      }
    } catch (error) {
      console.error(
        'Portal interaction error:',
        error,
      );

      const content =
        `❌ ${
          error instanceof Error
            ? error.message
            : 'Something went wrong.'
        }`;

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp({
            content,
            ephemeral: true,
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            content,
            ephemeral: true,
          })
          .catch(() => {});
      }
    }
  },
};
