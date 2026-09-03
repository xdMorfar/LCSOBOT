import { EmbedBuilder } from 'discord.js';
import { BRAND } from '../config/constants.js';

export function embed(type, title, description = null) {
  const color = BRAND.colors[type] ?? BRAND.colors.primary;
  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp()
    .setFooter({ text: BRAND.footer });
  if (description) e.setDescription(description);
  return e;
}

export const successEmbed = (title, description) => embed('success', title, description);
export const errorEmbed = (title, description) => embed('error', title, description);
export const warningEmbed = (title, description) => embed('warning', title, description);
export const infoEmbed = (title, description) => embed('primary', title, description);
