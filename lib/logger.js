// Sends embeds to the configured log channel for a category.
// Categories: mod | messages | members | server | voice
const store = require('./store');

const cache = new Map(); // guildId:type -> channel

async function getChannel(guild, type) {
  const id = store.guild(guild.id).logs[type];
  if (!id) return null;
  const key = `${guild.id}:${type}`;
  const cached = cache.get(key);
  if (cached?.id === id) return cached;
  const ch = await guild.channels.fetch(id).catch(() => null);
  if (!ch || !ch.isTextBased()) {
    // channel gone -> unset
    delete store.guild(guild.id).logs[type];
    store.save();
    return null;
  }
  cache.set(key, ch);
  return ch;
}

async function log(guild, type, payload) {
  try {
    const ch = await getChannel(guild, type);
    if (!ch) return null;
    const body = Array.isArray(payload.embeds) ? payload : { embeds: [payload] };
    return await ch.send({ ...body, allowedMentions: { parse: [] } });
  } catch (err) {
    console.error(`Log send failed (${type}):`, err.message);
    return null;
  }
}

/**
 * Looks up the most recent audit-log entry of a type for a target within the last
 * few seconds, so we can say *who* deleted a message / kicked a member, etc.
 */
async function findExecutor(guild, actionType, targetId, maxAgeMs = 8000) {
  try {
    const logs = await guild.fetchAuditLogs({ type: actionType, limit: 6 });
    const entry = logs.entries.find((e) => (!targetId || e.targetId === targetId) && Date.now() - e.createdTimestamp < maxAgeMs);
    return entry ? { executor: entry.executor, reason: entry.reason } : null;
  } catch {
    return null; // missing View Audit Log permission
  }
}

module.exports = { log, findExecutor };
