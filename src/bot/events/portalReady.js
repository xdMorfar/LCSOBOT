import {
  Events,
} from 'discord.js';

import {
  startPortalPanelProcessor,
} from '../../services/portalPanelService.js';


export default {
  name:
    Events.ClientReady,

  once:
    true,

  async execute(
    client,
  ) {
    startPortalPanelProcessor(
      client,
    );
  },
};
