import mongoose from 'mongoose';
import { ACTIVITY_TYPES } from '../../config/constants.js';

const activitySchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  deputyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deputy', required: true, index: true },
  discordId: { type: String, required: true, index: true },
  type: { type: String, enum: ACTIVITY_TYPES, required: true, index: true },
  durationMinutes: { type: Number, required: true, min: 1, max: 1440 },
  occurredAt: { type: Date, default: Date.now, index: true },
  notes: { type: String, maxlength: 1000, default: '' },
  loggedBy: { type: String, required: true },
}, { timestamps: true });

activitySchema.index({ guildId: 1, occurredAt: -1 });
export const Activity = mongoose.model('Activity', activitySchema);
