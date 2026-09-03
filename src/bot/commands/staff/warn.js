import { SlashCommandBuilder } from 'discord.js';
import { Deputy } from '../../../database/models/Deputy.js';
import { Infraction } from '../../../database/models/Infraction.js';
import { requireRank } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, warningEmbed } from '../../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a verbal or written warning to a deputy.')
    .addUserOption((o) => o.setName('member').setDescription('Deputy').setRequired(true))
    .addStringOption((o) => o.setName('type').setDescription('Warning type').setRequired(true).addChoices(
      { name: 'Verbal Warning', value: 'Verbal Warning' },
      { name: 'Written Warning', value: 'Written Warning' },
    ))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000)),
  async execute(interaction) {
    if (!await requireRank(interaction, 'Sergeant')) return;
    const user = interaction.options.getUser('member', true);
    const deputy = await Deputy.findOne({ guildId: interaction.guildId, discordId: user.id });
    if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Deputy Not Found', 'That member does not have a deputy profile.')] });
    const type = interaction.options.getString('type', true);
    const points = type === 'Written Warning' ? 1 : 0;
    const reason = interaction.options.getString('reason', true);
    const record = await Infraction.create({ guildId: interaction.guildId, deputyId: deputy._id, discordId: user.id, type, points, reason, issuedBy: interaction.user.id });
    const e = warningEmbed('Warning Issued', `${user} received a **${type}**.`).addFields({ name: 'Reason', value: reason }, { name: 'Points', value: String(points), inline: true }, { name: 'ID', value: `\`${record._id}\``, inline: true });
    await interaction.reply({ embeds: [e] });
    await sendLog(interaction.guild, 'infraction', e);
  },
};
