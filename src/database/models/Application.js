import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  applicantId: { type: String, required: true, index: true },
  status: { type: String, enum: ['Pending', 'Accepted', 'Denied', 'Withdrawn'], default: 'Pending', index: true },
  answers: {
    age: { type: String, maxlength: 50, default: '' },
    timezone: { type: String, maxlength: 100, default: '' },
    experience: { type: String, maxlength: 1000, default: '' },
    motivation: { type: String, maxlength: 1500, default: '' },
  },
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  reviewReason: { type: String, maxlength: 1000, default: null },
}, { timestamps: true });

export const Application = mongoose.model('Application', applicationSchema);
