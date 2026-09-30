// Server-wide lockdown: deny SendMessages for @everyone in every text channel.
const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const store = require('./store');
const logger = require('./logger');
const { COLORS } = require('./util');

async function start(guild, moderator, reason = 'No reason') {
  const g = store.guild(guild.id);
  if (g.lockdown) return 0;
  const changed = [];
  for (const ch of guild.channels.cache.values()) {
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(ch.type)) continue;
    const ow = ch.permissionOverwrites.cache.get(guild.id);
    if (ow?.deny.has(PermissionFlagsBits.SendMessages)) continue; // already locked
    try {
      await ch.permissionOverwrites.edit(guild.id, { SendMessages: false }, { reason: `Lockdown: ${reason}` });
      changed.push(ch.id);
    } catch {}
  }
  g.lockdown = { channels: changed, at: new Date().toISOString(), by: moderator.id, reason };
  store.save();
  await logger.log(guild, 'mod', new EmbedBuilder().setColor(COLORS.red).setTitle('🔒 Server lockdown started').setDescription(`${changed.length} channel(s) locked by <@${moderator.id}>\n**Reason:** ${reason}`).setTimestamp());
  return changed.length;
}

async function end(guild, moderator) {
  const g = store.guild(guild.id);
  if (!g.lockdown) return 0;
  let n = 0;
  for (const id of g.lockdown.channels) {
    const ch = guild.channels.cache.get(id);
    if (!ch) continue;
    try {
      await ch.permissionOverwrites.edit(guild.id, { SendMessages: null }, { reason: 'Lockdown ended' });
      n++;
    } catch {}
  }
  g.lockdown = null;
  store.save();
  await logger.log(guild, 'mod', new EmbedBuilder().setColor(COLORS.success).setTitle('🔓 Server lockdown ended').setDescription(`${n} channel(s) unlocked by <@${moderator.id}>`).setTimestamp());
  return n;
}

module.exports = { start, end };
