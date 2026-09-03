import { Client, GatewayIntentBits, Partials } from 'discord.js';

export function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildModeration,
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.User],
    allowedMentions: { parse: [] },
  });
}
