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
  appealUrl: null, // included in ban/kick DMs
  warnExpiryDays: 0, // 0 = warnings never expire
  reportChannel: null, // where /report lands (falls back to mod log)
  antiraid: {
    enabled: false,
    joinsPerMinute: 10, // raid = this many joins within 60s
    raidAction: 'kick', // kick | timeout | none  (applied to joins during a raid)
    raidMinutes: 10, // how long raid mode stays on
    minAccountAgeDays: 0, // 0 = off; younger accounts get youngAction
    youngAction: 'kick', // kick | timeout | none
    raidActive: null, // ISO timestamp until which raid mode is on
  },
  tickets: { enabled: false, categoryId: null, counter: 0, open: {} }, // open: channelId -> userId
  lockdown: null, // { channels: [ids], at } while a lockdown is active
});

const data = { guilds: {} };
let client = null;
let saveTimer = null;

// Optional Postgres (Render free Postgres): set DATABASE_URL. The whole store is
// kept as one JSON document — simple, and plenty for thousands of cases.
let pg = null;
if (process.env.DATABASE_URL) {
  try {
    const { Pool } = require('pg');
    pg = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
  } catch (err) {
    console.error('pg module not available, falling back to file/Discord backup:', err.message);
  }
}
async function pgInit() {
  if (!pg) return false;
  try {
    await pg.query('CREATE TABLE IF NOT EXISTS sentinel_store (id INT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())');
    const r = await pg.query('SELECT data FROM sentinel_store WHERE id = 1');
    if (r.rows[0]) {
      Object.assign(data, r.rows[0].data);
      console.log('Loaded database from Postgres.');
    }
    return true;
  } catch (err) {
    console.error('Postgres init failed:', err.message);
    pg = null;
    return false;
  }
}
async function pgSave() {
  if (!pg) return;
  try {
    await pg.query('INSERT INTO sentinel_store (id, data, updated_at) VALUES (1, $1, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()', [JSON.stringify(data)]);
  } catch (err) {
    console.error('Postgres save failed:', err.message);
  }
}

function guild(guildId) {
  if (!data.guilds[guildId]) data.guilds[guildId] = DEFAULT_GUILD();
  const g = data.guilds[guildId];
  // fill in any keys added in later versions
  const def = DEFAULT_GUILD();
  for (const k of Object.keys(def)) if (g[k] === undefined) g[k] = def[k];
  for (const k of Object.keys(def.automod)) if (g.automod[k] === undefined) g.automod[k] = def.automod[k];
  for (const k of Object.keys(def.antiraid)) if (g.antiraid[k] === undefined) g.antiraid[k] = def.antiraid[k];
  for (const k of Object.keys(def.tickets)) if (g.tickets[k] === undefined) g.tickets[k] = def.tickets[k];
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
  if (!process.env.DATA_CHANNEL_ID && !pg) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    pgSave();
    backupToDiscord();
  }, pg ? 3_000 : 20_000);
}

// Called once on ready: Postgres wins, else Discord backup, else local file.
async function restore() {
  if (await pgInit()) return;
  await restoreFromDiscord();
}

load();

module.exports = { data, guild, save, attachClient: (c) => (client = c), backupToDiscord, restoreFromDiscord, restore, flush: async () => { await pgSave(); await backupToDiscord(); }, hasPostgres: () => Boolean(pg) };
