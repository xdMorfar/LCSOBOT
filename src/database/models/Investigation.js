import mongoose from 'mongoose';

const investigationSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  caseNumber: { type: String, required: true },
  subjectId: { type: String, required: true, index: true },
  openedBy: { type: String, required: true },
  investigators: [{ type: String }],
  summary: { type: String, required: true, maxlength: 2000 },
  status: { type: String, enum: ['Open', 'Closed'], default: 'Open', index: true },
  outcome: { type: String, maxlength: 3000, default: null },
  closedBy: { type: String, default: null },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

investigationSchema.index({ guildId: 1, caseNumber: 1 }, { unique: true });
export const Investigation = mongoose.model('Investigation', investigationSchema);
