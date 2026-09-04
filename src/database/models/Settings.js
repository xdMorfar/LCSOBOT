import mongoose from 'mongoose';

import {
  DEFAULT_RANK_REQUIREMENTS,
} from '../../config/constants.js';

const rankRequirementSchema =
  new mongoose.Schema(
    {
      rank: {
        type: String,
        required: true,
      },

      minActivityMinutes: {
        type: Number,
        default: 0,
        min: 0,
      },

      maxInfractionPoints: {
        type: Number,
        default: 999,
        min: 0,
      },

      minDaysInDepartment: {
        type: Number,
        default: 0,
        min: 0,
      },
    },

    {
      _id: false,
    },
  );

const settingsSchema =
  new mongoose.Schema(
    {
      guildId: {
        type: String,
        required: true,
        unique: true,
      },

      /*
       * Legacy rank mapping.
       */
      rankRoles: {
        type: Map,
        of: String,
        default: {},
      },

      /*
       * NEW dynamic Discord ranks.
       */
      rankRoleIds: {
        type: [String],
        default: [],
      },

      logChannels: {
        type: Map,
        of: String,
        default: {},
      },

      loaRoleId: {
        type: String,
        default: null,
      },

      staffRoleId: {
        type: String,
        default: null,
      },

      internalAffairsRoleId: {
        type: String,
        default: null,
      },

      dashboardAccessRoleIds: {
        type: [String],
        default: [],
      },

      dashboardAdminRoleIds: {
        type: [String],
        default: [],
      },

      applicationCategoryId: {
        type: String,
        default: null,
      },

      ticketCategoryId: {
        type: String,
        default: null,
      },

      internalAffairsCategoryId: {
        type: String,
        default: null,
      },

      guidelineChannelId: {
        type: String,
        default: null,
      },

      trainingRequestChannelId: {
        type: String,
        default: null,
      },

      trainingLogChannelId: {
        type: String,
        default: null,
      },

      promotionChannelId: {
        type: String,
        default: null,
      },

      loaRequestChannelId: {
        type: String,
        default: null,
      },

      loaLogChannelId: {
        type: String,
        default: null,
      },

      rankRequirements: {
        type: [
          rankRequirementSchema,
        ],

        default: () =>
          DEFAULT_RANK_REQUIREMENTS.map(
            (item) => ({
              ...item,
            }),
          ),
      },
    },

    {
      timestamps: true,
    },
  );

export const Settings =
  mongoose.model(
    'Settings',
    settingsSchema,
  );
