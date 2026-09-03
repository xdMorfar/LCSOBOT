import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './config/env.js';
import { connectDatabase } from './database/connect.js';
import { createClient } from './bot/createClient.js';
import { loadCommands } from './bot/loadCommands.js';
import { loadEvents } from './bot/loadEvents.js';
import { createApp } from './web/createApp.js';
import { logger } from './utils/logger.js';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = createClient();
const commands = await loadCommands(path.join(__dirname, 'bot', 'commands'));
const context = { commands };
await loadEvents(client, path.join(__dirname, 'bot', 'events'), context);

const app = createApp(client);
const server = app.listen(env.PORT, '0.0.0.0', () => {
  logger.info(`Web dashboard listening on 0.0.0.0:${env.PORT}`);
});

async function start() {
  await connectDatabase();
  await client.login(env.DISCORD_TOKEN);
}

async function shutdown(signal) {
  logger.info(`Received ${signal}; shutting down`);
  server.close(() => logger.info('HTTP server closed'));
  client.destroy();
  await mongoose.disconnect().catch(() => null);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (error) => logger.error('Unhandled rejection', { error: error?.stack || String(error) }));
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.stack || error.message });
  process.exit(1);
});

start().catch((error) => {
  logger.error('Startup failed', { error: error.stack || error.message });
  process.exit(1);
});
