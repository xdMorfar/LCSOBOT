import mongoose from 'mongoose';

const promotionSchema =
  new mongoose.Schema(
    {
      guildId: {
        type: String,
        required: true,
        index: true,
      },

      deputyId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: 'Deputy',

        required: true,
        index: true,
      },

      discordId: {
        type: String,
        required: true,
        index: true,
      },

      type: {
        type: String,

        enum: [
          'Promotion',
          'Demotion',
          'Request',
          'Rank Change',
        ],

        required: true,
      },

      fromRank: {
        type: String,
        required: true,
      },

      toRank: {
        type: String,
        required: true,
      },

      fromRoleId: {
        type: String,
        default: null,
      },

      toRoleId: {
        type: String,
        default: null,
      },

      reason: {
        type: String,
        required: true,
        maxlength: 1000,
      },

      status: {
        type: String,

        enum: [
          'Pending',
          'Approved',
          'Denied',
          'Completed',
        ],

        default:
          'Completed',

        index: true,
      },

      requestedBy: {
        type: String,
        default: null,
      },

      reviewedBy: {
        type: String,
        default: null,
      },

      reviewedAt: {
        type: Date,
        default: null,
      },

      actionedBy: {
        type: String,
        default: null,
      },

      ticketId: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref:
          'Ticket',

        default:
          null,
      },
    },

    {
      timestamps: true,
    },
  );

export const Promotion =
  mongoose.model(
    'Promotion',
    promotionSchema,
  );
