import { LOA } from '../database/models/LOA.js';
import { Deputy } from '../database/models/Deputy.js';
import { getSettings } from './settingsService.js';
import { logger } from '../utils/logger.js';

async function syncOne(client, loa) {
  const guild = await client.guilds.fetch(loa.guildId).catch(() => null);
  if (!guild) return;
  const deputy = await Deputy.findById(loa.deputyId);
  if (!deputy) return;
  const member = await guild.members.fetch(loa.discordId).catch(() => null);
  const settings = await getSettings(loa.guildId);
  const now = new Date();

  if (loa.status === 'Approved' && loa.startDate <= now && loa.endDate >= now) {
    loa.status = 'Active';
    deputy.status = 'LOA';
    if (member && settings.loaRoleId) await member.roles.add(settings.loaRoleId, 'Approved LCSO LOA').catch(() => null);
    await Promise.all([loa.save(), deputy.save()]);
  } else if ((loa.status === 'Approved' || loa.status === 'Active') && loa.endDate < now) {
    loa.status = 'Completed';
    if (deputy.status === 'LOA') deputy.status = 'Active';
    if (member && settings.loaRoleId) await member.roles.remove(settings.loaRoleId, 'LCSO LOA completed').catch(() => null);
    await Promise.all([loa.save(), deputy.save()]);
  }
}

export async function syncLOAs(client) {
  const now = new Date();
  const relevant = await LOA.find({ status: { $in: ['Approved', 'Active'] }, startDate: { $lte: new Date(now.getTime() + 86400000) } });
  for (const loa of relevant) {
    try { await syncOne(client, loa); } catch (error) { logger.error('LOA sync failed', { loaId: String(loa._id), error: error.message }); }
  }
}

export function startLoaScheduler(client) {
  const timer = setInterval(() => syncLOAs(client).catch((e) => logger.error('LOA scheduler failed', { error: e.message })), 5 * 60 * 1000);
  timer.unref();
  setTimeout(() => syncLOAs(client).catch(() => null), 5000).unref();
}
