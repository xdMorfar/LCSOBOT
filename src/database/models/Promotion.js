import mongoose from 'mongoose';
import { RANKS } from '../../config/constants.js';

const promotionSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  deputyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deputy', required: true, index: true },
  discordId: { type: String, required: true, index: true },
  type: { type: String, enum: ['Promotion', 'Demotion', 'Request'], required: true },
  fromRank: { type: String, enum: RANKS, required: true },
  toRank: { type: String, enum: RANKS, required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['Pending', 'Approved', 'Denied', 'Completed'], default: 'Completed', index: true },
  requestedBy: { type: String, default: null },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  actionedBy: { type: String, default: null },
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
}, { timestamps: true });

export const Promotion = mongoose.model('Promotion', promotionSchema);
