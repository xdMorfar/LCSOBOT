import { Events } from 'discord.js';
import { infoEmbed } from '../../utils/embeds.js';
import { sendLog } from '../../services/logService.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await sendLog(member.guild, 'member', infoEmbed('Member Joined', `<@${member.id}> joined the server.`).addFields({ name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>` }));
  },
};
