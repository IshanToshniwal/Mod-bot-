// JSON database with optional backup to a private Discord channel (Render's free
// disk is wiped on deploy; the backup survives).
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

const DEFAULT_GUILD = () => ({
  logs: {}, // { mod, messages, members, server, voice } -> channelId
  modRoles: [], // role IDs allowed to use mod commands in addition to permission checks
  dmOnPunish: true,
  caseCounter: 0,
  cases: [], // { id, type, userId, userTag, modId, modTag, reason, createdAt, expiresAt?, active? }
  automod: {
    enabled: false,
    antiInvite: true,
    antiLink: false,
    antiSpam: true,
    spamMessages: 6,
    spamSeconds: 5,
    maxMentions: 6,
    bannedWords: [],
    ignoredChannels: [],
    ignoredRoles: [],
    escalation: [
      // when a user reaches N active warnings -> action
      { warnings: 3, action: 'timeout', minutes: 60 },
      { warnings: 5, action: 'kick' },
      { warnings: 7, action: 'ban' },
    ],
  },
  welcome: { channelId: null, message: 'Welcome {user} to **{server}**! You are member #{count}.', enabled: false },
  leave: { channelId: null, message: '**{username}** has left the server.', enabled: false },
  autoRole: null,
});

const data = { guilds: {} };
let client = null;
let saveTimer = null;

function guild(guildId) {
  if (!data.guilds[guildId]) data.guilds[guildId] = DEFAULT_GUILD();
  const g = data.guilds[guildId];
  // fill in any keys added in later versions
  const def = DEFAULT_GUILD();
  for (const k of Object.keys(def)) if (g[k] === undefined) g[k] = def[k];
  for (const k of Object.keys(def.automod)) if (g.automod[k] === undefined) g.automod[k] = def.automod[k];
  return g;
}

function load() {
  try {
    if (fs.existsSync(DATA_FILE)) Object.assign(data, JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (err) {
    console.error('Could not read data.json, starting fresh:', err.message);
  }
}

function writeFile() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Could not write data.json:', err.message);
  }
}

async function backupToDiscord() {
  const channelId = process.env.DATA_CHANNEL_ID;
  if (!channelId || !client?.isReady()) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;
    const file = new AttachmentBuilder(Buffer.from(JSON.stringify(data)), { name: 'data.json' });
    await channel.send({ content: `📦 Backup ${new Date().toISOString()}`, files: [file] });
    const msgs = await channel.messages.fetch({ limit: 20 });
    const mine = [...msgs.values()].filter((m) => m.author.id === client.user.id && m.attachments.size).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const old of mine.slice(3)) await old.delete().catch(() => null);
  } catch (err) {
    console.error('Backup to Discord failed:', err.message);
  }
}

async function restoreFromDiscord() {
  const channelId = process.env.DATA_CHANNEL_ID;
  if (!channelId || !client?.isReady()) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;
    const msgs = await channel.messages.fetch({ limit: 20 });
    const latest = [...msgs.values()].filter((m) => m.author.id === client.user.id && m.attachments.size).sort((a, b) => b.createdTimestamp - a.createdTimestamp)[0];
    if (!latest) return;
    const res = await fetch(latest.attachments.first().url);
    Object.assign(data, await res.json());
    writeFile();
    console.log('Restored database from Discord backup.');
  } catch (err) {
    console.error('Restore from Discord failed:', err.message);
  }
}

function save() {
  writeFile();
  if (!process.env.DATA_CHANNEL_ID) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(backupToDiscord, 20_000);
}

load();

module.exports = { data, guild, save, attachClient: (c) => (client = c), backupToDiscord, restoreFromDiscord };
