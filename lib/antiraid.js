// Anti-raid: join-rate detection + young-account filtering.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('./store');
const logger = require('./logger');
const actions = require('./actions');
const { COLORS } = require('./util');

const joins = new Map(); // guildId -> [{ id, at }]

function recent(guildId, windowMs) {
  const now = Date.now();
  const arr = (joins.get(guildId) || []).filter((j) => now - j.at < windowMs);
  joins.set(guildId, arr);
  return arr;
}

/** Called on every member join. Returns a short note for the join log, or null. */
async function onJoin(member) {
  const g = store.guild(member.guild.id);
  const cfg = g.antiraid;
  if (!cfg.enabled) return null;
  const guild = member.guild;
  const notes = [];

  // track joins
  const arr = recent(guild.id, 10 * 60_000);
  arr.push({ id: member.id, at: Date.now() });
  const lastMinute = arr.filter((j) => Date.now() - j.at < 60_000).length;

  // raid detection
  const raidOn = cfg.raidActive && new Date(cfg.raidActive) > Date.now();
  if (!raidOn && cfg.joinsPerMinute > 0 && lastMinute >= cfg.joinsPerMinute) {
    cfg.raidActive = new Date(Date.now() + cfg.raidMinutes * 60_000).toISOString();
    store.save();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('raid:lockdown').setLabel('Lock all channels').setEmoji('🔒').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('raid:kickrecent').setLabel('Kick recent joiners').setEmoji('👢').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('raid:end').setLabel('End raid mode').setEmoji('✅').setStyle(ButtonStyle.Secondary)
    );
    await logger.log(guild, 'mod', {
      content: '@here', // wake the mods
      embeds: [new EmbedBuilder().setColor(COLORS.red).setTitle('🚨 Possible raid detected').setDescription(`**${lastMinute}** accounts joined in the last minute.\nRaid mode is on for **${cfg.raidMinutes} min**: new joins will be **${cfg.raidAction === 'none' ? 'logged only' : cfg.raidAction + 'ed'}**.`).setTimestamp()],
      components: [row],
    });
    notes.push('🚨 triggered raid mode');
  }

  // action during raid
  if ((cfg.raidActive && new Date(cfg.raidActive) > Date.now()) && cfg.raidAction !== 'none') {
    const res = await actions.apply({ guild, targetId: member.id, action: cfg.raidAction, moderator: guild.client.user, reason: '[Anti-raid] Joined during a raid', minutes: cfg.raidMinutes });
    notes.push(res.ok ? `🚨 raid mode → ${cfg.raidAction}` : `⚠️ raid action failed: ${res.text}`);
    return notes.join(' · ');
  }

  // young account
  const ageDays = (Date.now() - member.user.createdTimestamp) / 86400e3;
  if (cfg.minAccountAgeDays > 0 && ageDays < cfg.minAccountAgeDays && cfg.youngAction !== 'none') {
    const res = await actions.apply({ guild, targetId: member.id, action: cfg.youngAction, moderator: guild.client.user, reason: `[Anti-raid] Account younger than ${cfg.minAccountAgeDays} days (${ageDays.toFixed(1)}d)`, minutes: 1440 });
    notes.push(res.ok ? `🍼 young account → ${cfg.youngAction}` : `⚠️ young-account action failed: ${res.text}`);
  }
  return notes.length ? notes.join(' · ') : null;
}

/** Kick everyone who joined in the last 10 minutes (raid clean-up button). */
async function kickRecent(guild, moderator) {
  let n = 0;
  for (const j of recent(guild.id, 10 * 60_000)) {
    const res = await actions.apply({ guild, targetId: j.id, action: 'kick', moderator, reason: '[Anti-raid] Raid clean-up' });
    if (res.ok) n++;
  }
  return n;
}

module.exports = { onJoin, kickRecent };
