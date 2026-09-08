import {
  Events,
  PermissionFlagsBits,
} from 'discord.js';

import mongoose from 'mongoose';

import {
  issueInfraction,
  promoteMember,
} from '../../services/staffActionService.js';

function getDb() {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error(
      'MongoDB is not connected.',
    );
  }

  return db;
}

function splitReasonAndNotes(
  input,
) {
  const parts =
    String(input || '').split('|');

  const reason =
    String(
      parts.shift() || '',
    ).trim();

  const notes =
    parts
      .join('|')
      .trim();

  return {
    reason,
    notes,
  };
}

async function sendTemporary(
  channel,
  content,
) {
  const message =
    await channel
      .send({
        content,
        allowedMentions: {
          parse: [],
        },
      })
      .catch(() => null);

  if (!message) return;

  setTimeout(() => {
    message
      .delete()
      .catch(() => {});
  }, 10000);
}

async function hasStaffPermission(
  message,
) {
  if (!message.member) {
    return false;
  }

  if (
    message.member.permissions.has(
      PermissionFlagsBits.Administrator,
    ) ||
    message.member.permissions.has(
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
          message.guild.id,
      });

  const adminRoleIds =
    Array.isArray(
      settings?.dashboardAdminRoleIds,
    )
      ? settings.dashboardAdminRoleIds
      : [];

  return adminRoleIds.some(
    (roleId) =>
      message.member.roles.cache.has(
        roleId,
      ),
  );
}

export default {
  name: Events.MessageCreate,

  async execute(message) {
    if (
      message.author.bot ||
      !message.guild ||
      !message.channel?.isTextBased()
    ) {
      return;
    }

    const content =
      message.content.trim();

    const lower =
      content.toLowerCase();

    if (
      !lower.startsWith(
        '!infraction',
      ) &&
      !lower.startsWith(
        '!promote',
      )
    ) {
      return;
    }

    const channelName =
      String(
        message.channel.name ||
        '',
      ).toLowerCase();

    /*
     * Commands are accepted in any
     * channel whose name contains
     * "command".
     *
     * Examples:
     * #commands
     * #staff-commands
     * #bot-commands
     */
    if (
      !channelName.includes(
        'command',
      )
    ) {
      return;
    }

    /*
     * Delete what the staff member
     * typed, exactly as requested.
     */
    await message
      .delete()
      .catch(() => {});

    const allowed =
      await hasStaffPermission(
        message,
      );

    if (!allowed) {
      await sendTemporary(
        message.channel,
        '❌ You do not have permission to use LCSO staff commands.',
      );

      return;
    }

    if (
      lower.startsWith(
        '!infraction',
      )
    ) {
      const match =
        content.match(
          /^!infraction\s+<@!?(\d{15,22})>\s+(warning|strike)\s+(.+)$/i,
        );

      if (!match) {
        await sendTemporary(
          message.channel,
          '❌ Usage: `!infraction @member warning Reason | Optional notes`',
        );

        return;
      }

      const [
        ,
        memberId,
        rawType,
        rawReason,
      ] = match;

      const {
        reason,
        notes,
      } =
        splitReasonAndNotes(
          rawReason,
        );

      if (!reason) {
        await sendTemporary(
          message.channel,
          '❌ A reason is required.',
        );

        return;
      }

      try {
        await issueInfraction(
          message.client,
          {
            guildId:
              message.guild.id,

            memberId,

            infractionType:
              rawType.toLowerCase() ===
              'strike'
                ? 'Strike'
                : 'Warning',

            reason,
            notes,

            actorName:
              message.member
                ?.displayName ||
              message.author.username,

            actorDiscordId:
              message.author.id,

            source:
              'Discord Command',
          },
        );
      } catch (error) {
        await sendTemporary(
          message.channel,
          `❌ ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }

      return;
    }

    if (
      lower.startsWith(
        '!promote',
      )
    ) {
      const match =
        content.match(
          /^!promote\s+<@!?(\d{15,22})>\s+<@&(\d{15,22})>\s+(.+)$/i,
        );

      if (!match) {
        await sendTemporary(
          message.channel,
          '❌ Usage: `!promote @member @role Reason | Optional notes`',
        );

        return;
      }

      const [
        ,
        memberId,
        targetRoleId,
        rawReason,
      ] = match;

      const {
        reason,
        notes,
      } =
        splitReasonAndNotes(
          rawReason,
        );

      if (!reason) {
        await sendTemporary(
          message.channel,
          '❌ A reason is required.',
        );

        return;
      }

      const role =
        message.guild.roles.cache.get(
          targetRoleId,
        );

      if (!role) {
        await sendTemporary(
          message.channel,
          '❌ That Discord role could not be found.',
        );

        return;
      }

      try {
        await promoteMember(
          message.client,
          {
            guildId:
              message.guild.id,

            memberId,

            targetRoleId:
              role.id,

            targetRoleName:
              role.name,

            reason,
            notes,

            actorName:
              message.member
                ?.displayName ||
              message.author.username,

            actorDiscordId:
              message.author.id,

            source:
              'Discord Command',
          },
        );
      } catch (error) {
        await sendTemporary(
          message.channel,
          `❌ ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }
    }
  },
};
