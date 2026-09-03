import { getSettings } from './settingsService.js';
import { logger } from '../utils/logger.js';

export async function sendLog(guild, type, embed, options = {}) {
  try {
    const settings = await getSettings(guild.id);
    const channelId = settings.logChannels?.get(type);
    if (!channelId) return false;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased()) return false;
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] }, ...options });
    return true;
  } catch (error) {
    logger.error('Failed to send Discord log', { type, error: error.message });
    return false;
  }
}
