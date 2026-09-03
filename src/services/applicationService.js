import { Deputy } from '../database/models/Deputy.js';
import { Application } from '../database/models/Application.js';
import { syncRankRole } from './rankService.js';

export async function reviewApplication({ guild, application, reviewerId, accepted, reason }) {
  if (application.status !== 'Pending') throw new Error('This application has already been reviewed.');
  application.status = accepted ? 'Accepted' : 'Denied';
  application.reviewedBy = reviewerId;
  application.reviewedAt = new Date();
  application.reviewReason = reason;
  await application.save();

  if (accepted) {
    const member = await guild.members.fetch(application.applicantId).catch(() => null);
    if (member) {
      const deputy = await Deputy.findOneAndUpdate(
        { guildId: guild.id, discordId: member.id },
        { $setOnInsert: { guildId: guild.id, discordId: member.id, displayName: member.displayName, rank: 'Cadet', joinDate: new Date(), createdBy: reviewerId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      await syncRankRole(guild, deputy);
    }
  }
  return application;
}
