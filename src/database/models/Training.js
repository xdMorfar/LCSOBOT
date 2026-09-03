import mongoose from 'mongoose';

const trainingSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  traineeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deputy', required: true, index: true },
  traineeDiscordId: { type: String, required: true, index: true },
  type: { type: String, required: true, maxlength: 100 },
  status: { type: String, enum: ['Pending', 'Approved', 'Denied', 'Completed', 'Cancelled'], default: 'Pending', index: true },
  requestedInstructorId: { type: String, default: null },
  instructorId: { type: String, default: null },
  requestedBy: { type: String, required: true },
  reviewedBy: { type: String, default: null },
  reviewedAt: { type: Date, default: null },
  scheduledFor: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  durationMinutes: { type: Number, default: 0, min: 0 },
  notes: { type: String, maxlength: 1500, default: '' },
}, { timestamps: true });

export const Training = mongoose.model('Training', trainingSchema);
