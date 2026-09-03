import { Settings } from '../database/models/Settings.js';

export async function getSettings(guildId) {
  return Settings.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}
