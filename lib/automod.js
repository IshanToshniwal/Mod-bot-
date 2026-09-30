// Automod: invites, links, banned words, mass mentions, spam. Violations delete
// the message, create an automod warning case, and escalate at thresholds.
const { PermissionFlagsBits } = require('discord.js');
const store = require('./store');
const cases = require('./cases');
const { isMod } = require('./util');

const INVITE_RE = /(discord\.gg|discord(?:app)?\.com\/invite|dsc\.gg)\/[\w-]+/i;
const LINK_RE = /https?:\/\/\S+/i;

const recent = new Map(); // guildId:userId -> [timestamps]

function violation(message, cfg) {
  const content = message.content || '';
  if (cfg.antiInvite && INVITE_RE.test(content)) return 'Posted an invite link';
  if (cfg.antiLink && LINK_RE.test(content)) return 'Posted a link';
  if (cfg.maxMentions > 0 && message.mentions.users.size + message.mentions.roles.size >= cfg.maxMentions) return `Mass mention (${message.mentions.users.size + message.mentions.roles.size})`;
  if (cfg.bannedWords.length) {
    const lower = content.toLowerCase();
    const hit = cfg.bannedWords.find((w) => new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower));
    if (hit) return `Used a banned word (||${hit}||)`;
  }
  if (cfg.antiSpam) {
    const key = `${message.guildId}:${message.author.id}`;
    const now = Date.now();
    const arr = (recent.get(key) || []).filter((t) => now - t < cfg.spamSeconds * 1000);
    arr.push(now);
    recent.set(key, arr);
    if (arr.length >= cfg.spamMessages) {
      recent.set(key, []);
      return `Spam (${arr.length} messages in ${cfg.spamSeconds}s)`;
    }
  }
  return null;
}

async function handle(message) {
  if (!message.inGuild() || message.author.bot) return;
  const cfg = store.guild(message.guildId).automod;
  if (!cfg.enabled) return;
  if (cfg.ignoredChannels.includes(message.channelId)) return;
  const member = message.member;
  if (!member || isMod(member) || member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  if (cfg.ignoredRoles.some((r) => member.roles.cache.has(r))) return;

  const why = violation(message, cfg);
  if (!why) return;

  await message.delete().catch(() => null);
  const c = await cases.create({ guild: message.guild, type: 'warn', user: message.author, moderator: message.client.user, reason: `[Automod] ${why}` });
  const warnings = cases.activeWarnings(message.guildId, message.author.id);
  const note = await message.channel.send({ content: `⚠️ ${message.author}, ${why.toLowerCase()} is not allowed here. (warning ${warnings})`, allowedMentions: { users: [message.author.id] } }).catch(() => null);
  if (note) setTimeout(() => note.delete().catch(() => null), 8000);
  await cases.notify(message.guild, message.author, c);
  await escalate(message.guild, member, warnings, message.client.user);
}

/** Applies the highest escalation step reached at exactly this warning count. */
async function escalate(guild, member, warnings, moderator) {
  const steps = store.guild(guild.id).automod.escalation || [];
  const step = steps.find((s) => s.warnings === warnings);
  if (!step) return null;
  const reason = `Reached ${warnings} warnings`;
  try {
    if (step.action === 'timeout') {
      const ms = (step.minutes || 60) * 60_000;
      await member.timeout(ms, reason);
      const c = await cases.create({ guild, type: 'timeout', user: member, moderator, reason, durationMs: ms, extra: { warnings } });
      await cases.notify(guild, member, c);
    } else if (step.action === 'kick') {
      const c = await cases.create({ guild, type: 'kick', user: member, moderator, reason, extra: { warnings } });
      await cases.notify(guild, member, c);
      await member.kick(reason);
    } else if (step.action === 'ban') {
      const c = await cases.create({ guild, type: 'ban', user: member, moderator, reason, extra: { warnings } });
      await cases.notify(guild, member, c);
      await member.ban({ reason });
    }
    return step;
  } catch (err) {
    console.error('Escalation failed:', err.message);
    return null;
  }
}

module.exports = { handle, escalate, violation };
