import { Events, ActivityType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { startLoaScheduler } from '../../services/loaService.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info(`Discord bot ready as ${client.user.tag}`);
    client.user.setActivity('Liberty County Sheriff’s Office', { type: ActivityType.Watching });
    startLoaScheduler(client);
  },
};
