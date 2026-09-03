import mongoose from 'mongoose';
import { RANKS } from '../../config/constants.js';

const deputySchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  discordId: { type: String, required: true },
  displayName: { type: String, required: true, trim: true, maxlength: 100 },
  badgeNumber: { type: String, trim: true, maxlength: 30, default: null },
  rank: { type: String, enum: RANKS, default: 'Cadet', index: true },
  joinDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['Active', 'LOA', 'Suspended', 'Terminated'], default: 'Active', index: true },
  totalActivityMinutes: { type: Number, default: 0, min: 0 },
  notes: { type: String, maxlength: 3000, default: '' },
  createdBy: { type: String, required: true },
}, { timestamps: true });

deputySchema.index({ guildId: 1, discordId: 1 }, { unique: true });
deputySchema.index({ guildId: 1, badgeNumber: 1 }, { unique: true, sparse: true });

export const Deputy = mongoose.model('Deputy', deputySchema);
