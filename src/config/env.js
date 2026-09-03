import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  DISCORD_TOKEN: z.string().min(20),
  DISCORD_CLIENT_ID: z.string().min(10),
  DISCORD_CLIENT_SECRET: z.string().min(10),
  DISCORD_GUILD_ID: z.string().min(10),
  DISCORD_CALLBACK_URL: z.string().url(),
  MONGO_URI: z.string().min(10),
  SESSION_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
});

const normalized = {
  ...process.env,
  DISCORD_TOKEN: process.env.DISCORD_TOKEN || process.env.TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID || process.env.GUILD_ID,
  MONGO_URI: process.env.MONGO_URI || process.env.MONGODB_URI,
};

const result = schema.safeParse(normalized);
if (!result.success) {
  const lines = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
}

export const env = result.data;
