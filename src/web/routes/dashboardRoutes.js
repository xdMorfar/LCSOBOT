import { Router } from 'express';
import { Deputy } from '../../database/models/Deputy.js';
import { Infraction } from '../../database/models/Infraction.js';
import { Promotion } from '../../database/models/Promotion.js';
import { LOA } from '../../database/models/LOA.js';
import { Activity } from '../../database/models/Activity.js';
import { Training } from '../../database/models/Training.js';
import { Ticket } from '../../database/models/Ticket.js';
import { Application } from '../../database/models/Application.js';
import { Settings } from '../../database/models/Settings.js';
import { DEFAULT_INFRACTION_POINTS, INFRACTION_TYPES, LOG_TYPES, RANKS } from '../../config/constants.js';
import { ensureAuthenticated, ensureGuildAccess, ensureWebAdmin, ensureWebRank, verifyCsrf } from '../middleware/security.js';
import { getSettings } from '../../services/settingsService.js';
import { changeRank, syncRankRole } from '../../services/rankService.js';
import { parseDate, monthBounds } from '../../utils/format.js';

export function dashboardRoutes(client) {
  const router = Router();
  router.use(ensureAuthenticated, ensureGuildAccess(client, 'Corporal'));

  router.get('/', async (req, res) => {
    const guildId = req.discordGuild.id;
    const [deputies, pendingLoas, pendingPromotions, openTickets, pendingApplications, monthlyActivity] = await Promise.all([
      Deputy.countDocuments({ guildId }),
      LOA.countDocuments({ guildId, status: 'Pending' }),
      Promotion.countDocuments({ guildId, type: 'Request', status: 'Pending' }),
      Ticket.countDocuments({ guildId, status: 'Open' }),
      Application.countDocuments({ guildId, status: 'Pending' }),
      Activity.aggregate([{ $match: { guildId, occurredAt: { $gte: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)) } } }, { $group: { _id: null, minutes: { $sum: '$durationMinutes' } } }]),
    ]);
    res.render('dashboard/index', { title: 'Dashboard', stats: { deputies, pendingLoas, pendingPromotions, openTickets, pendingApplications, activityHours: ((monthlyActivity[0]?.minutes || 0) / 60).toFixed(1) } });
  });

  router.get('/deputies', async (req, res) => {
    const deputies = await Deputy.find({ guildId: req.discordGuild.id }).sort({ rank: 1, displayName: 1 });
    res.render('dashboard/deputies', { title: 'Deputies', deputies, ranks: RANKS });
  });
  router.post('/deputies/add', verifyCsrf, ensureWebRank('Sergeant'), async (req, res) => {
    const discordId = String(req.body.discordId || '').trim();
    const rank = RANKS.includes(req.body.rank) ? req.body.rank : 'Cadet';
    const member = await req.discordGuild.members.fetch(discordId).catch(() => null);
    if (!member) return res.redirect('/dashboard/deputies?error=member');
    const deputy = await Deputy.findOneAndUpdate(
      { guildId: req.discordGuild.id, discordId },
      { $setOnInsert: { guildId: req.discordGuild.id, discordId, displayName: member.displayName, rank, badgeNumber: String(req.body.badgeNumber || '').trim() || null, createdBy: req.user.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    await syncRankRole(req.discordGuild, deputy);
    res.redirect('/dashboard/deputies?ok=added');
  });
  router.post('/deputies/:id/rank', verifyCsrf, ensureWebRank('Sergeant'), async (req, res) => {
    const deputy = await Deputy.findOne({ _id: req.params.id, guildId: req.discordGuild.id });
    if (!deputy || !RANKS.includes(req.body.rank)) return res.redirect('/dashboard/deputies?error=rank');
    const targetRank = req.body.rank;
    const type = RANKS.indexOf(targetRank) > RANKS.indexOf(deputy.rank) ? 'Promotion' : 'Demotion';
    if (targetRank !== deputy.rank) await changeRank({ guild: req.discordGuild, deputy, targetRank, actorId: req.user.id, reason: String(req.body.reason || 'Dashboard rank change').slice(0, 1000), type, overrideRequirements: req.body.override === 'on' });
    res.redirect('/dashboard/deputies?ok=rank');
  });
  router.post('/deputies/:id/remove', verifyCsrf, ensureWebRank('Lieutenant'), async (req, res) => {
    await Deputy.deleteOne({ _id: req.params.id, guildId: req.discordGuild.id });
    res.redirect('/dashboard/deputies?ok=removed');
  });

  router.get('/infractions', async (req, res) => {
    const [infractions, deputies] = await Promise.all([
      Infraction.find({ guildId: req.discordGuild.id }).sort({ createdAt: -1 }).limit(100),
      Deputy.find({ guildId: req.discordGuild.id }).sort({ displayName: 1 }),
    ]);
    res.render('dashboard/infractions', { title: 'Infractions', infractions, deputies, types: INFRACTION_TYPES, defaultPoints: DEFAULT_INFRACTION_POINTS });
  });
  router.post('/infractions/add', verifyCsrf, ensureWebRank('Sergeant'), async (req, res) => {
    const deputy = await Deputy.findOne({ _id: req.body.deputyId, guildId: req.discordGuild.id });
    if (!deputy || !INFRACTION_TYPES.includes(req.body.type)) return res.redirect('/dashboard/infractions?error=input');
    await Infraction.create({ guildId: req.discordGuild.id, deputyId: deputy._id, discordId: deputy.discordId, type: req.body.type, points: Number(req.body.points ?? DEFAULT_INFRACTION_POINTS[req.body.type]), reason: String(req.body.reason || '').slice(0, 1000), issuedBy: req.user.id });
    if (req.body.type === 'Suspension') { deputy.status = 'Suspended'; await deputy.save(); }
    if (req.body.type === 'Termination') { deputy.status = 'Terminated'; await deputy.save(); }
    res.redirect('/dashboard/infractions?ok=added');
  });
  router.post('/infractions/:id/remove', verifyCsrf, ensureWebRank('Lieutenant'), async (req, res) => {
    await Infraction.updateOne({ _id: req.params.id, guildId: req.discordGuild.id, active: true }, { $set: { active: false, removedBy: req.user.id, removedAt: new Date(), removalReason: String(req.body.reason || 'Removed from dashboard').slice(0, 1000) } });
    res.redirect('/dashboard/infractions?ok=removed');
  });

  router.get('/promotions', async (req, res) => {
    const promotions = await Promotion.find({ guildId: req.discordGuild.id }).sort({ createdAt: -1 }).limit(100);
    res.render('dashboard/promotions', { title: 'Promotions', promotions });
  });
  router.post('/promotions/:id/review', verifyCsrf, ensureWebRank('Lieutenant'), async (req, res) => {
    const request = await Promotion.findOne({ _id: req.params.id, guildId: req.discordGuild.id, type: 'Request', status: 'Pending' });
    if (!request) return res.redirect('/dashboard/promotions?error=missing');
    request.reviewedBy = req.user.id;
    request.reviewedAt = new Date();
    if (req.body.decision === 'deny') {
      request.status = 'Denied';
      await request.save();
    } else {
      const deputy = await Deputy.findById(request.deputyId);
      if (!deputy) return res.redirect('/dashboard/promotions?error=deputy');
      await changeRank({ guild: req.discordGuild, deputy, targetRank: request.toRank, actorId: req.user.id, reason: String(req.body.reason || 'Dashboard approval').slice(0, 1000), type: 'Promotion', overrideRequirements: req.body.override === 'on' });
      request.status = 'Approved';
      await request.save();
    }
    res.redirect('/dashboard/promotions?ok=reviewed');
  });

  router.get('/loas', async (req, res) => {
    const loas = await LOA.find({ guildId: req.discordGuild.id }).sort({ createdAt: -1 }).limit(100);
    res.render('dashboard/loas', { title: 'LOAs', loas });
  });
  router.post('/loas/:id/review', verifyCsrf, ensureWebRank('Sergeant'), async (req, res) => {
    const loa = await LOA.findOne({ _id: req.params.id, guildId: req.discordGuild.id, status: 'Pending' });
    if (!loa) return res.redirect('/dashboard/loas?error=missing');
    loa.status = req.body.decision === 'approve' ? 'Approved' : 'Denied';
    loa.reviewedBy = req.user.id;
    loa.reviewedAt = new Date();
    loa.reviewReason = String(req.body.reason || '').slice(0, 1000) || null;
    await loa.save();
    res.redirect('/dashboard/loas?ok=reviewed');
  });

  router.get('/activity', async (req, res) => {
    const bounds = monthBounds(req.query.month) || monthBounds();
    const rows = await Activity.aggregate([
      { $match: { guildId: req.discordGuild.id, occurredAt: { $gte: bounds.start, $lt: bounds.end } } },
      { $group: { _id: '$discordId', minutes: { $sum: '$durationMinutes' }, entries: { $sum: 1 } } },
      { $sort: { minutes: -1 } },
      { $limit: 50 },
    ]);
    const typeRows = await Activity.aggregate([
      { $match: { guildId: req.discordGuild.id, occurredAt: { $gte: bounds.start, $lt: bounds.end } } },
      { $group: { _id: '$type', minutes: { $sum: '$durationMinutes' } } },
      { $sort: { minutes: -1 } },
    ]);
    res.render('dashboard/activity', { title: 'Activity', rows, typeRows, month: bounds.label });
  });

  router.get('/settings', ensureWebAdmin, async (req, res) => {
    const settings = await getSettings(req.discordGuild.id);
    res.render('dashboard/settings', { title: 'Settings', settings, ranks: RANKS, logTypes: LOG_TYPES });
  });
  router.post('/settings', verifyCsrf, ensureWebAdmin, async (req, res) => {
    const settings = await getSettings(req.discordGuild.id);
    for (const key of ['loaRoleId', 'staffRoleId', 'internalAffairsRoleId', 'applicationCategoryId', 'ticketCategoryId', 'internalAffairsCategoryId', 'guidelineChannelId']) {
      settings[key] = String(req.body[key] || '').trim() || null;
    }
    for (const type of LOG_TYPES) {
      const value = String(req.body[`log_${type}`] || '').trim();
      if (value) settings.logChannels.set(type, value); else settings.logChannels.delete(type);
    }
    for (const rank of RANKS) {
      const value = String(req.body[`rank_${rank}`] || '').trim();
      if (value) settings.rankRoles.set(rank, value); else settings.rankRoles.delete(rank);
    }
    await settings.save();
    res.redirect('/dashboard/settings?ok=saved');
  });

  return router;
}
