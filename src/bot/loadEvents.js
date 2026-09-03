import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadEvents(client, eventsDir, context) {
  const files = (await readdir(eventsDir)).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const event = (await import(pathToFileURL(path.join(eventsDir, file)).href)).default;
    if (!event?.name || typeof event.execute !== 'function') throw new Error(`Invalid event: ${file}`);
    const fn = (...args) => event.execute(...args, context);
    if (event.once) client.once(event.name, fn);
    else client.on(event.name, fn);
  }
}
