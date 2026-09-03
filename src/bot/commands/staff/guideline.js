import { SlashCommandBuilder } from 'discord.js';
import { Guideline } from '../../../database/models/Guideline.js';
import { requireRank } from '../../../services/permissionService.js';
import { getSettings } from '../../../services/settingsService.js';
import { sendLog } from '../../../services/logService.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../../utils/embeds.js';
import { escapeRegex, truncate } from '../../../utils/format.js';
import { validObjectId } from '../../../utils/ids.js';

async function postGuideline(guild, guideline, explicitChannel = null) {
  const settings = await getSettings(guild.id);
  const channelId = explicitChannel?.id || guideline.postedChannelId || settings.guidelineChannelId;
  if (!channelId) return;
  const channel = explicitChannel || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const e = infoEmbed(guideline.title, guideline.content).addFields({ name: 'Category', value: guideline.category });
  if (guideline.postedMessageId && guideline.postedChannelId === channel.id) {
    const msg = await channel.messages.fetch(guideline.postedMessageId).catch(() => null);
    if (msg) { await msg.edit({ embeds: [e] }); return; }
  }
  const msg = await channel.send({ embeds: [e] });
  guideline.postedChannelId = channel.id;
  guideline.postedMessageId = msg.id;
  await guideline.save();
}

export default {
  data: new SlashCommandBuilder()
    .setName('guideline')
    .setDescription('Manage department guidelines.')
    .addSubcommand((s) => s.setName('create').setDescription('Create a guideline.')
      .addStringOption((o) => o.setName('title').setDescription('Title').setRequired(true).setMaxLength(150))
      .addStringOption((o) => o.setName('category').setDescription('Category').setRequired(true).setMaxLength(100))
      .addStringOption((o) => o.setName('content').setDescription('Guideline content').setRequired(true).setMaxLength(4000))
      .addChannelOption((o) => o.setName('channel').setDescription('Override auto-post channel')))
    .addSubcommand((s) => s.setName('edit').setDescription('Edit a guideline.')
      .addStringOption((o) => o.setName('id').setDescription('Guideline ID').setRequired(true))
      .addStringOption((o) => o.setName('title').setDescription('New title').setMaxLength(150))
      .addStringOption((o) => o.setName('category').setDescription('New category').setMaxLength(100))
      .addStringOption((o) => o.setName('content').setDescription('New content').setMaxLength(4000)))
    .addSubcommand((s) => s.setName('remove').setDescription('Delete a guideline.')
      .addStringOption((o) => o.setName('id').setDescription('Guideline ID').setRequired(true)))
    .addSubcommand((s) => s.setName('view').setDescription('View a guideline.')
      .addStringOption((o) => o.setName('id').setDescription('Guideline ID').setRequired(true)))
    .addSubcommand((s) => s.setName('search').setDescription('Search guideline titles and content.')
      .addStringOption((o) => o.setName('query').setDescription('Search text').setRequired(true).setMaxLength(100))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') {
      if (!await requireRank(interaction, 'Lieutenant')) return;
      try {
        const guideline = await Guideline.create({ guildId: interaction.guildId, title: interaction.options.getString('title', true), category: interaction.options.getString('category', true), content: interaction.options.getString('content', true), createdBy: interaction.user.id });
        await postGuideline(interaction.guild, guideline, interaction.options.getChannel('channel'));
        const e = successEmbed('Guideline Created', `**${guideline.title}** was saved${guideline.postedChannelId ? ` and posted in <#${guideline.postedChannelId}>` : ''}.`).addFields({ name: 'ID', value: `\`${guideline._id}\`` });
        await interaction.reply({ embeds: [e] });
        await sendLog(interaction.guild, 'guideline', e);
      } catch (error) {
        return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Could Not Create Guideline', error.code === 11000 ? 'A guideline with that title already exists.' : error.message)] });
      }
      return;
    }

    const id = interaction.options.getString('id');
    if (['edit', 'remove', 'view'].includes(sub) && !validObjectId(id)) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Invalid ID', 'Guideline ID is invalid.')] });

    if (sub === 'edit') {
      if (!await requireRank(interaction, 'Lieutenant')) return;
      const guideline = await Guideline.findOne({ _id: id, guildId: interaction.guildId });
      if (!guideline) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Guideline not found.')] });
      guideline.title = interaction.options.getString('title') || guideline.title;
      guideline.category = interaction.options.getString('category') || guideline.category;
      guideline.content = interaction.options.getString('content') || guideline.content;
      guideline.updatedBy = interaction.user.id;
      await guideline.save();
      await postGuideline(interaction.guild, guideline);
      const e = successEmbed('Guideline Updated', `**${guideline.title}** was updated.`);
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'guideline', e);
      return;
    }

    if (sub === 'remove') {
      if (!await requireRank(interaction, 'Captain')) return;
      const guideline = await Guideline.findOneAndDelete({ _id: id, guildId: interaction.guildId });
      if (!guideline) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Guideline not found.')] });
      if (guideline.postedChannelId && guideline.postedMessageId) {
        const channel = await interaction.guild.channels.fetch(guideline.postedChannelId).catch(() => null);
        if (channel?.isTextBased()) await channel.messages.delete(guideline.postedMessageId).catch(() => null);
      }
      const e = successEmbed('Guideline Removed', `**${guideline.title}** was deleted.`);
      await interaction.reply({ embeds: [e] });
      await sendLog(interaction.guild, 'guideline', e);
      return;
    }

    if (sub === 'view') {
      const guideline = await Guideline.findOne({ _id: id, guildId: interaction.guildId });
      if (!guideline) return interaction.reply({ ephemeral: true, embeds: [errorEmbed('Not Found', 'Guideline not found.')] });
      return interaction.reply({ embeds: [infoEmbed(guideline.title, guideline.content).addFields({ name: 'Category', value: guideline.category }, { name: 'ID', value: `\`${guideline._id}\`` })] });
    }

    if (sub === 'search') {
      const q = interaction.options.getString('query', true);
      const regex = new RegExp(escapeRegex(q), 'i');
      const rows = await Guideline.find({ guildId: interaction.guildId, $or: [{ title: regex }, { category: regex }, { content: regex }] }).sort({ updatedAt: -1 }).limit(10);
      const body = rows.length ? rows.map((g) => `• \`${g._id}\` **${g.title}** — ${g.category}\n  ${truncate(g.content, 180)}`).join('\n') : 'No matching guidelines found.';
      return interaction.reply({ embeds: [infoEmbed(`Guideline Search • ${q}`, truncate(body, 3900))] });
    }
  },
};
