import { SlashCommandBuilder } from 'discord.js';
import { Deputy } from '../../../database/models/Deputy.js';
import { Infraction } from '../../../database/models/Infraction.js';
import { DEFAULT_INFRACTION_POINTS, INFRACTION_TYPES } from '../../../config/constants.js';
import { requireRank } from '../../../services/permissionService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, infoEmbed, successEmbed, warningEmbed } from '../../../utils/embeds.js';
import { discordDate, truncate } from '../../../utils/format.js';
import { validObjectId } from '../../../utils/ids.js';

const typeChoices = INFRACTION_TYPES.map((type) => ({ name: type, value: type }));

async function addInfraction(interaction, type, user, reason, points) {
  const deputy = await Deputy.findOne({ guildId: interaction.guildId, discordId: user.id });
  if (!deputy) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Deputy Not Found', 'That member does not have a deputy profile.')] });
  const record = await Infraction.create({
    guildId: interaction.guildId,
    deputyId: deputy._id,
    discordId: user.id,
    type,
    points,
    reason,
    issuedBy: interaction.user.id,
  });
  if (type === 'Suspension') { deputy.status = 'Suspended'; await deputy.save(); }
  if (type === 'Termination') { deputy.status = 'Terminated'; await deputy.save(); }
  const e = warningEmbed('Infraction Issued', `${user} received a **${type}**.`).addFields(
    { name: 'Points', value: String(points), inline: true },
    { name: 'Issued By', value: `${interaction.user}`, inline: true },
    { name: 'Reason', value: reason },
    { name: 'Infraction ID', value: `\`${record._id}\`` },
  );
  await interaction.reply({ embeds: [e] });
  await sendLog(interaction.guild, 'infraction', e);
}

export default {
  data: new SlashCommandBuilder()
    .setName('infraction')
    .setDescription('Manage deputy disciplinary records.')
    .addSubcommand((s) => s.setName('add').setDescription('Issue an infraction.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy').setRequired(true))
      .addStringOption((o) => o.setName('type').setDescription('Infraction type').setRequired(true).addChoices(...typeChoices))
      .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(1000))
      .addIntegerOption((o) => o.setName('points').setDescription('Override point value').setMinValue(0).setMaxValue(100)))
    .addSubcommand((s) => s.setName('remove').setDescription('Deactivate an infraction without deleting history.')
      .addStringOption((o) => o.setName('id').setDescription('Infraction ID').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('Removal reason').setRequired(true).setMaxLength(1000)))
    .addSubcommand((s) => s.setName('list').setDescription('View disciplinary history.')
      .addUserOption((o) => o.setName('member').setDescription('Deputy').setRequired(true))
      .addBooleanOption((o) => o.setName('active_only').setDescription('Show only active infractions'))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'add') {
      if (!await requireRank(interaction, 'Sergeant')) return;
      const type = interaction.options.getString('type', true);
      const points = interaction.options.getInteger('points') ?? DEFAULT_INFRACTION_POINTS[type];
      return addInfraction(interaction, type, interaction.options.getUser('member', true), interaction.options.getString('reason', true), points);
    }
    if (sub === 'remove') {
      if (!await requireRank(interaction, 'Lieutenant')) return;
      const id = interaction.options.getString('id', true);
      if (!validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid ID', 'That infraction ID is invalid.')] });
      const infraction = await Infraction.findOne({ _id: id, guildId: interaction.guildId, active: true });
      if (!infraction) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Active infraction not found.')] });
      infraction.active = false;
      infraction.removedBy = interaction.user.id;
      infraction.removedAt = new Date();
      infraction.removalReason = interaction.options.getString('reason', true);
      await infraction.save();
      const e = successEmbed('Infraction Removed', `Infraction \`${infraction._id}\` for <@${infraction.discordId}> is no longer active.`).addFields({ name: 'Reason', value: infraction.removalReason });
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'infraction', e);
      return;
    }
    if (sub === 'list') {
      const user = interaction.options.getUser('member', true);
      const query = { guildId: interaction.guildId, discordId: user.id };
      if (interaction.options.getBoolean('active_only')) query.active = true;
      const rows = await Infraction.find(query).sort({ createdAt: -1 }).limit(20);
      const body = rows.length ? rows.map((x) => `• \`${x._id}\` ${discordDate(x.createdAt, 'd')} — **${x.type}** • ${x.points} pts • ${x.active ? 'Active' : 'Removed'}\n  ${truncate(x.reason, 180)}`).join('\n') : 'No infractions found.';
      return interaction.reply({ embeds: [infoEmbed(`Disciplinary History • ${user.username}`, truncate(body, 3900))] });
    }
  },
};
