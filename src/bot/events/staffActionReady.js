import {
  Events,
} from 'discord.js';

import {
  startStaffActionProcessor,
} from '../../services/staffActionService.js';

export default {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    startStaffActionProcessor(
      client,
    );
  },
};
