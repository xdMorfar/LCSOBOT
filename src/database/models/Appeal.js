import mongoose from 'mongoose';

const appealSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  appellantId: { type: String, required: true, index: true },
  caseReference: { type: String, required: true, maxlength: 100 },
  reason: { type: String, required: true, maxlength: 1500 },
  status: { type: String, enum: ['Pending', 'Accepted', 'Denied'], default: 'Pending', index: true },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  reviewReason: { type: String, maxlength: 1000, default: null },
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
}, { timestamps: true });

export const Appeal = mongoose.model('Appeal', appealSchema);
