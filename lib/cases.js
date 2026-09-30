// Case system: every moderation action gets a numbered case, is DM'd to the
// user (if enabled), posted to the mod log, and stored for /modlogs & /case.
const { EmbedBuilder } = require('discord.js');
const store = require('./store');
const logger = require('./logger');
const { COLORS, formatDuration, full } = require('./util');

const TITLE = {
  warn: '⚠️ Warning',
  timeout: '🔇 Timeout',
  untimeout: '🔊 Timeout removed',
  kick: '👢 Kick',
  ban: '🔨 Ban',
  tempban: '⏳ Temporary ban',
  softban: '🧹 Softban',
  unban: '🔓 Unban',
  purge: '🗑️ Purge',
  note: '📝 Note',
  automod: '🤖 Automod',
};

/**
 * create({ guild, type, user, moderator, reason, durationMs?, extra? })
 * user: User or GuildMember or { id, tag }
 */
async function create({ guild, type, user, moderator, reason, durationMs = null, extra = null, silent = false }) {
  const g = store.guild(guild.id);
  const u = user.user ?? user; // GuildMember -> User
  const id = ++g.caseCounter;
  const c = {
    id,
    type,
    userId: u.id,
    userTag: u.tag ?? u.username ?? u.id,
    modId: moderator.id,
    modTag: moderator.tag ?? moderator.username ?? moderator.id,
    reason: reason || 'No reason provided',
    createdAt: new Date().toISOString(),
    expiresAt: durationMs ? new Date(Date.now() + durationMs).toISOString() : null,
    active: ['warn', 'ban', 'tempban', 'timeout'].includes(type),
    extra,
  };
  g.cases.push(c);
  store.save();

  const e = buildEmbed(c, u, moderator);
  if (!silent) await logger.log(guild, 'mod', e);
  return c;
}

function buildEmbed(c, u, moderator) {
  const e = new EmbedBuilder()
    .setColor(COLORS[c.type === 'tempban' ? 'ban' : c.type] ?? COLORS.info)
    .setAuthor({ name: `${TITLE[c.type] ?? c.type} • Case #${c.id}` })
    .addFields(
      { name: 'User', value: `<@${c.userId}>\n\`${c.userTag}\` · ${c.userId}`, inline: true },
      { name: 'Moderator', value: `<@${c.modId}>\n\`${c.modTag}\``, inline: true },
      { name: 'Reason', value: c.reason.slice(0, 1024) }
    )
    .setTimestamp(new Date(c.createdAt))
    .setFooter({ text: `Case #${c.id}` });
  if (c.expiresAt) e.addFields({ name: 'Duration', value: `${formatDuration(new Date(c.expiresAt) - new Date(c.createdAt))} — expires ${full(c.expiresAt)}`, inline: true });
  if (c.extra?.count) e.addFields({ name: 'Messages', value: String(c.extra.count), inline: true });
  if (c.extra?.channelId) e.addFields({ name: 'Channel', value: `<#${c.extra.channelId}>`, inline: true });
  if (c.extra?.warnings != null) e.addFields({ name: 'Active warnings', value: String(c.extra.warnings), inline: true });
  const avatar = u?.displayAvatarURL?.();
  if (avatar) e.setThumbnail(avatar);
  return e;
}

/** DM the punished user. Returns true if delivered. */
async function notify(guild, user, c) {
  if (!store.guild(guild.id).dmOnPunish) return false;
  const u = user.user ?? user;
  if (!u.send) return false;
  const verb = { warn: 'warned in', timeout: 'timed out in', kick: 'kicked from', ban: 'banned from', tempban: 'temporarily banned from', softban: 'softbanned from' }[c.type];
  if (!verb) return false;
  const e = new EmbedBuilder()
    .setColor(COLORS[c.type === 'tempban' ? 'ban' : c.type] ?? COLORS.info)
    .setTitle(`You have been ${verb} ${guild.name}`)
    .addFields({ name: 'Reason', value: c.reason.slice(0, 1024) })
    .setFooter({ text: `Case #${c.id}` })
    .setTimestamp();
  if (c.expiresAt) e.addFields({ name: 'Duration', value: formatDuration(new Date(c.expiresAt) - Date.now()) });
  try {
    await u.send({ embeds: [e] });
    return true;
  } catch {
    return false;
  }
}

function forUser(guildId, userId) {
  return store.guild(guildId).cases.filter((c) => c.userId === userId);
}
function get(guildId, id) {
  return store.guild(guildId).cases.find((c) => c.id === id) || null;
}
function activeWarnings(guildId, userId) {
  return forUser(guildId, userId).filter((c) => c.type === 'warn' && c.active).length;
}

// ---- temp-ban expiry ------------------------------------------------------
async function tick(client) {
  const now = Date.now();
  for (const [guildId, g] of Object.entries(store.data.guilds)) {
    for (const c of g.cases) {
      if (c.type !== 'tempban' || !c.active || !c.expiresAt || new Date(c.expiresAt) > now) continue;
      c.active = false;
      const guild = client.guilds.cache.get(guildId);
      if (!guild) continue;
      await guild.members.unban(c.userId, `Temporary ban expired (case #${c.id})`).catch(() => null);
      await create({ guild, type: 'unban', user: { id: c.userId, tag: c.userTag }, moderator: client.user, reason: `Temporary ban from case #${c.id} expired` });
    }
  }
  store.save();
}

module.exports = { create, notify, forUser, get, activeWarnings, tick, buildEmbed, TITLE };
