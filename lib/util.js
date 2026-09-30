const { PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const store = require('./store');

const COLORS = {
  warn: 0xfbbf24,
  timeout: 0xf97316,
  kick: 0xf4536a,
  ban: 0xdc2626,
  unban: 0x4ade80,
  untimeout: 0x4ade80,
  softban: 0xef4444,
  purge: 0x6d7cff,
  info: 0x6d7cff,
  success: 0x4ade80,
  error: 0xf4536a,
  neutral: 0x9aa0b4,
};

// ---- durations -----------------------------------------------------------
const UNITS = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3, w: 604800e3 };
/** "1h30m", "2d", "45m" -> milliseconds, or null if invalid */
function parseDuration(str) {
  if (!str) return null;
  const re = /(\d+)\s*(s|m|h|d|w)/gi;
  let total = 0;
  let matched = false;
  for (const m of str.toLowerCase().matchAll(re)) {
    total += Number(m[1]) * UNITS[m[2]];
    matched = true;
  }
  return matched ? total : null;
}
function formatDuration(ms) {
  const parts = [];
  for (const [u, v] of [['w', UNITS.w], ['d', UNITS.d], ['h', UNITS.h], ['m', UNITS.m], ['s', UNITS.s]]) {
    const n = Math.floor(ms / v);
    if (n) {
      parts.push(`${n}${u}`);
      ms -= n * v;
    }
  }
  return parts.join(' ') || '0s';
}

// ---- permissions ----------------------------------------------------------
function isMod(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const g = store.guild(member.guild.id);
  return g.modRoles.some((r) => member.roles.cache.has(r));
}

/** Returns an error string if the moderator can't act on the target, else null. */
function checkHierarchy(interaction, target) {
  const me = interaction.guild.members.me;
  if (!target) return null;
  if (target.id === interaction.user.id) return "You can't do that to yourself.";
  if (target.id === interaction.client.user.id) return "I can't do that to myself.";
  if (target.id === interaction.guild.ownerId) return "You can't do that to the server owner.";
  if (interaction.user.id !== interaction.guild.ownerId && target.roles.highest.position >= interaction.member.roles.highest.position) {
    return 'That user has a role equal to or higher than yours.';
  }
  if (target.roles.highest.position >= me.roles.highest.position) return 'That user has a role equal to or higher than mine — move my role up.';
  return null;
}

// ---- embeds ---------------------------------------------------------------
function embed(color, title, description) {
  const e = new EmbedBuilder().setColor(COLORS[color] ?? color).setTimestamp();
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  return e;
}
const ok = (text) => ({ embeds: [embed('success', null, `✅ ${text}`)] });
const fail = (text) => ({ embeds: [embed('error', null, `❌ ${text}`)], flags: MessageFlags.Ephemeral });

const userLine = (u) => `${u} (\`${u.tag ?? u.user?.tag ?? u.id}\` · ${u.id})`;
const rel = (date) => `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;
const full = (date) => `<t:${Math.floor(new Date(date).getTime() / 1000)}:f>`;

function truncate(s, n = 1000) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

module.exports = { COLORS, parseDuration, formatDuration, isMod, checkHierarchy, embed, ok, fail, userLine, rel, full, truncate };
