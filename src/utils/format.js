export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function discordDate(date, style = 'D') {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;
}

export function hoursToMinutes(hours) {
  return Math.round(hours * 60);
}

export function minutesToHours(minutes) {
  return `${(minutes / 60).toFixed(1)}h`;
}

export function monthBounds(month) {
  const value = month || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, m] = value.split('-').map(Number);
  if (m < 1 || m > 12) return null;
  return {
    label: value,
    start: new Date(Date.UTC(year, m - 1, 1)),
    end: new Date(Date.UTC(year, m, 1)),
  };
}

export function safeChannelName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'ticket';
}

export function truncate(value, max = 1000) {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function htmlEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
