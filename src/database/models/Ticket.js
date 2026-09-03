import mongoose from 'mongoose';
import { TICKET_TYPES } from '../../config/constants.js';

const ticketSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  ownerId: { type: String, required: true, index: true },
  type: { type: String, enum: TICKET_TYPES, required: true, index: true },
  channelId: { type: String, required: true, unique: true },
  status: { type: String, enum: ['Open', 'Closed'], default: 'Open', index: true },
  subject: { type: String, maxlength: 200, default: '' },
  assignedTo: [{ type: String }],
  closedBy: { type: String, default: null },
  closedAt: { type: Date, default: null },
  closeReason: { type: String, maxlength: 1000, default: null },
  transcriptText: { type: String, default: null },
  transcriptMessageCount: { type: Number, default: 0 },
}, { timestamps: true });

ticketSchema.index({ guildId: 1, ownerId: 1, type: 1, status: 1 });
export const Ticket = mongoose.model('Ticket', ticketSchema);
