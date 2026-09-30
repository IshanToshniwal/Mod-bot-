require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { Client, GatewayIntentBits, Partials, Collection, MessageFlags } = require('discord.js');
const store = require('./lib/store');
const cases = require('./lib/cases');
const dashboard = require('./lib/dashboard');

// ---------------------------------------------------------------------------
// Keep-alive web server (Render + UptimeRobot)
// ---------------------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', uptime: process.uptime(), ready: client?.isReady() ?? false, guilds: client?.guilds.cache.size ?? 0 }));
app.listen(PORT, () => console.log(`Web server (keep-alive + dashboard) listening on port ${PORT}`));

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // privileged: member join/leave/update
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: automod + deleted/edited message content
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.GuildMember],
});
client.commands = new Collection();
store.attachClient(client);
dashboard.mount(app, client); // web dashboard at / (Login with Discord)

// ---- load commands (each file exports one command or an array of them) ----
function loadDir(dir) {
  const full = path.join(__dirname, dir);
  const out = [];
  for (const file of fs.readdirSync(full).filter((f) => f.endsWith('.js'))) {
    const mod = require(path.join(full, file));
    out.push(...(Array.isArray(mod) ? mod : [mod]));
  }
  return out;
}
for (const cmd of loadDir('commands')) if (cmd?.data && cmd?.execute) client.commands.set(cmd.data.name, cmd);
console.log(`Loaded ${client.commands.size} commands: ${[...client.commands.keys()].join(', ')}`);

// ---- load events ----
for (const ev of loadDir('events')) {
  if (!ev?.name || !ev?.execute) continue;
  client.on(ev.name, (...args) => Promise.resolve(ev.execute(client, ...args)).catch((err) => console.error(`Event ${ev.name} failed:`, err)));
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag} — ${client.guilds.cache.size} server(s)`);
  client.user.setActivity('over the server 👁️', { type: 3 });
  await store.restoreFromDiscord();
  setInterval(() => cases.tick(client).catch((e) => console.error('tick failed:', e)), 60_000);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) return interaction.reply({ content: 'Use this in a server.', flags: MessageFlags.Ephemeral });
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    console.error(`Error in /${interaction.commandName}:`, err);
    const msg = err?.code === 50013 ? '❌ I am missing permissions to do that. Check my role position and permissions.' : `❌ Something went wrong: ${err.message ?? err}`;
    const payload = { content: msg, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
  }
});

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('SIGTERM', async () => {
  await store.backupToDiscord();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
