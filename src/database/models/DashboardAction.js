import mongoose from 'mongoose';

const dashboardActionSchema =
  new mongoose.Schema(
    {
      guildId: {
        type: String,
        required: true,
        index: true,
      },

      type: {
        type: String,
        required: true,
        index: true,
      },

      payload: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },

      actorId: {
        type: String,
        required: true,
      },

      status: {
        type: String,

        enum: [
          'Pending',
          'Processing',
          'Completed',
          'Failed',
        ],

        default: 'Pending',
        index: true,
      },

      attempts: {
        type: Number,
        default: 0,
      },

      error: {
        type: String,
        default: null,
      },

      result: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
      },

      processedAt: {
        type: Date,
        default: null,
      },
    },

    {
      timestamps: true,
    },
  );

dashboardActionSchema.index({
  guildId: 1,
  status: 1,
  createdAt: 1,
});

/*
 * Forces it to use the EXACT same MongoDB collection
 * that the dashboard writes to:
 *
 * dashboardactions
 */
export const DashboardAction =
  mongoose.models.DashboardAction ||
  mongoose.model(
    'DashboardAction',
    dashboardActionSchema,
    'dashboardactions',
  );
