import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REST, Routes } from 'discord.js';
import { env } from '../src/config/env.js';
import { loadCommands } from '../src/bot/loadCommands.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commands = await loadCommands(path.join(__dirname, '..', 'src', 'bot', 'commands'));
const body = commands.map((command) => command.data.toJSON());
const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);
const global = process.argv.includes('--global');
const route = global
  ? Routes.applicationCommands(env.DISCORD_CLIENT_ID)
  : Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, env.DISCORD_GUILD_ID);

console.log(`Deploying ${body.length} slash commands ${global ? 'globally' : `to guild ${env.DISCORD_GUILD_ID}`}...`);
await rest.put(route, { body });
console.log('Slash commands deployed successfully.');
