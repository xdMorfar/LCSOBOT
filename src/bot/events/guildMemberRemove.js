import { Events } from 'discord.js';
import { warningEmbed } from '../../utils/embeds.js';
import { sendLog } from '../../services/logService.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    await sendLog(member.guild, 'member', warningEmbed('Member Left', `**${member.user.tag}** (${member.id}) left the server.`));
  },
};
