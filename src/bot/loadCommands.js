import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Collection } from 'discord.js';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
  return files;
}

export async function loadCommands(commandsDir) {
  const commands = new Collection();
  for (const file of await walk(commandsDir)) {
    const mod = await import(pathToFileURL(file).href);
    const command = mod.default;
    if (!command?.data?.name || typeof command.execute !== 'function') {
      throw new Error(`Invalid command module: ${file}`);
    }
    commands.set(command.data.name, command);
  }
  return commands;
}
