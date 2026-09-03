import mongoose from 'mongoose';
import { INFRACTION_TYPES } from '../../config/constants.js';

const infractionSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  deputyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deputy', required: true, index: true },
  discordId: { type: String, required: true, index: true },
  type: { type: String, enum: INFRACTION_TYPES, required: true },
  points: { type: Number, required: true, min: 0, max: 100 },
  reason: { type: String, required: true, maxlength: 1000 },
  issuedBy: { type: String, required: true },
  active: { type: Boolean, default: true, index: true },
  removedBy: { type: String, default: null },
  removedAt: { type: Date, default: null },
  removalReason: { type: String, maxlength: 1000, default: null },
}, { timestamps: true });

export const Infraction = mongoose.model('Infraction', infractionSchema);
