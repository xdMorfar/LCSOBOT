import mongoose from 'mongoose';

const loaSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  deputyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deputy', required: true, index: true },
  discordId: { type: String, required: true, index: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['Pending', 'Approved', 'Denied', 'Active', 'Completed', 'Cancelled'], default: 'Pending', index: true },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  reviewReason: { type: String, maxlength: 1000, default: null },
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
}, { timestamps: true });

loaSchema.index({ guildId: 1, discordId: 1, status: 1 });
export const LOA = mongoose.model('LOA', loaSchema);
