import mongoose from 'mongoose';

const guidelineSchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  title: { type: String, required: true, maxlength: 150 },
  category: { type: String, required: true, maxlength: 100, index: true },
  content: { type: String, required: true, maxlength: 4000 },
  createdBy: { type: String, required: true },
  updatedBy: { type: String, default: null },
  postedChannelId: { type: String, default: null },
  postedMessageId: { type: String, default: null },
}, { timestamps: true });

guidelineSchema.index({ guildId: 1, title: 1 }, { unique: true });
export const Guideline = mongoose.model('Guideline', guidelineSchema);
