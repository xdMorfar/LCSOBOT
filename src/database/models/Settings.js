import mongoose from 'mongoose';
import { DEFAULT_RANK_REQUIREMENTS, RANKS } from '../../config/constants.js';

const rankRequirementSchema = new mongoose.Schema({
  rank: { type: String, enum: RANKS, required: true },
  minActivityMinutes: { type: Number, default: 0, min: 0 },
  maxInfractionPoints: { type: Number, default: 999, min: 0 },
  minDaysInDepartment: { type: Number, default: 0, min: 0 },
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  rankRoles: { type: Map, of: String, default: {} },
  logChannels: { type: Map, of: String, default: {} },
  loaRoleId: { type: String, default: null },
  staffRoleId: { type: String, default: null },
  internalAffairsRoleId: { type: String, default: null },
  applicationCategoryId: { type: String, default: null },
  ticketCategoryId: { type: String, default: null },
  internalAffairsCategoryId: { type: String, default: null },
  guidelineChannelId: { type: String, default: null },
  rankRequirements: { type: [rankRequirementSchema], default: () => DEFAULT_RANK_REQUIREMENTS.map((x) => ({ ...x })) },
}, { timestamps: true });

export const Settings = mongoose.model('Settings', settingsSchema);
