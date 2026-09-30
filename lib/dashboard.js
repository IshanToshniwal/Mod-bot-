// Web dashboard: Login with Discord (OAuth2) + settings pages.
// Mounted on the same Express app that serves /health. No extra dependencies.
const crypto = require('crypto');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const store = require('./store');
const cases = require('./cases');
const views = require('./views');
const actions = require('./actions');
const lockdown = require('./lockdown');
const tickets = require('./tickets');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { parseDuration, COLORS } = require('./util');

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET not set — dashboard logins will reset on every restart.');

const sessions = new Map(); // sid -> { user, guilds, csrf, createdAt }
const SESSION_TTL = 7 * 86400e3;
const LOG_TYPES = ['mod', 'messages', 'members', 'server', 'voice'];

// ---------------------------------------------------------------- helpers
function sign(v) {
  return `${v}.${crypto.createHmac('sha256', SESSION_SECRET).update(v).digest('base64url')}`;
}
function unsign(s) {
  if (!s) return null;
  const i = s.lastIndexOf('.');
  if (i === -1) return null;
  const v = s.slice(0, i);
  const expected = sign(v);
  if (expected.length !== s.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s))) return null;
  return v;
}
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k) out[k] = decodeURIComponent(v.join('='));
  }
  return out;
}
function baseUrl(req) {
  return process.env.BASE_URL?.replace(/\/$/, '') || `${req.headers['x-forwarded-proto'] || req.protocol || 'https'}://${req.headers.host}`;
}
function getSession(req) {
  const sid = unsign(parseCookies(req).sid);
  const s = sid && sessions.get(sid);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL) {
    sessions.delete(sid);
    return null;
  }
  return s;
}
const MANAGE = Number(PermissionFlagsBits.ManageGuild);
const ADMIN = Number(PermissionFlagsBits.Administrator);
function canManage(perms) {
  const p = Number(BigInt(perms));
  return Boolean(p & MANAGE) || Boolean(p & ADMIN);
}

function mount(app, client) {
  const express = require('express');
  app.set('trust proxy', 1);
  app.use(express.urlencoded({ extended: false }));

  // attach session
  app.use((req, _res, next) => {
    req.session = getSession(req);
    next();
  });

  // ---------------------------------------------------------------- public status
  app.get('/status', (req, res) => {
    const mem = process.memoryUsage();
    res.send(views.status({
      session: req.session,
      ready: client.isReady?.() ?? false,
      guilds: client.guilds.cache.size,
      members: [...client.guilds.cache.values()].reduce((n, g) => n + (g.memberCount || 0), 0),
      uptime: process.uptime(),
      ping: client.ws?.ping ?? null,
      memoryMb: Math.round(mem.rss / 1048576),
      storage: store.hasPostgres?.() ? 'Postgres' : process.env.DATA_CHANNEL_ID ? 'Discord channel backup' : 'Local file only (not persistent on Render!)',
      errors: client.recentErrors || [],
      cases: Object.values(store.data.guilds).reduce((n, g) => n + g.cases.length, 0),
    }));
  });

  // ---------------------------------------------------------------- auth
  app.get('/', (req, res) => {
    if (req.session) return res.redirect('/dashboard');
    res.send(views.landing({ botName: client.user?.username || 'Sentinel', avatar: client.user?.displayAvatarURL?.({ size: 128 }) }));
  });

  app.get('/auth/login', (req, res) => {
    if (!process.env.CLIENT_SECRET) return res.status(500).send(views.error('CLIENT_SECRET is not set on the server.'));
    const state = crypto.randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', `oauth_state=${sign(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600; Secure`);
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', process.env.CLIENT_ID);
    url.searchParams.set('redirect_uri', `${baseUrl(req)}/auth/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'identify guilds');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'none');
    res.redirect(url.toString());
  });

  app.get('/auth/callback', async (req, res) => {
    try {
      const { code, state, error } = req.query;
      if (error) return res.status(400).send(views.error(`Discord login was cancelled (${error}).`));
      const expected = unsign(parseCookies(req).oauth_state);
      if (!code || !state || state !== expected) return res.status(400).send(views.error('Invalid login state. Please try again.'));

      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.CLIENT_ID,
          client_secret: process.env.CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: `${baseUrl(req)}/auth/callback`,
        }),
      });
      if (!tokenRes.ok) return res.status(400).send(views.error(`Token exchange failed (${tokenRes.status}). Check CLIENT_SECRET and that the redirect URL is added in the Developer Portal.`));
      const token = await tokenRes.json();
      const h = { Authorization: `Bearer ${token.access_token}` };
      const [user, guilds] = await Promise.all([
        fetch('https://discord.com/api/users/@me', { headers: h }).then((r) => r.json()),
        fetch('https://discord.com/api/users/@me/guilds', { headers: h }).then((r) => r.json()),
      ]);
      if (!user?.id || !Array.isArray(guilds)) return res.status(400).send(views.error('Could not load your Discord profile.'));

      const sid = crypto.randomBytes(24).toString('hex');
      sessions.set(sid, {
        user: { id: user.id, username: user.global_name || user.username, avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` : null },
        guilds: guilds.filter((g) => canManage(g.permissions)).map((g) => ({ id: g.id, name: g.name, icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64` : null })),
        csrf: crypto.randomBytes(16).toString('hex'),
        createdAt: Date.now(),
      });
      res.setHeader('Set-Cookie', [`sid=${sign(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}; Secure`, 'oauth_state=; Path=/; Max-Age=0']);
      res.redirect('/dashboard');
    } catch (err) {
      console.error('OAuth callback failed:', err);
      res.status(500).send(views.error('Login failed. Check the server logs.'));
    }
  });

  app.get('/auth/logout', (req, res) => {
    const sid = unsign(parseCookies(req).sid);
    if (sid) sessions.delete(sid);
    res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
    res.redirect('/');
  });

  // ---------------------------------------------------------------- guards
  const requireLogin = (req, res, next) => (req.session ? next() : res.redirect('/'));
  const requireGuild = (req, res, next) => {
    const g = req.session.guilds.find((x) => x.id === req.params.guildId);
    const live = client.guilds.cache.get(req.params.guildId);
    if (!g) return res.status(403).send(views.error("You don't have Manage Server in that server.", req.session));
    if (!live) return res.status(404).send(views.error('The bot is not in that server. Invite it first.', req.session));
    req.guild = live;
    req.settings = store.guild(live.id);
    next();
  };
  const csrf = (req, res, next) => (req.body?._csrf === req.session.csrf ? next() : res.status(403).send(views.error('Form expired — go back and try again.', req.session)));

  const ctx = (req, page, extra = {}) => ({
    session: req.session,
    guild: req.guild,
    settings: req.settings,
    page,
    savedFlag: Boolean(req.query.saved),
    channels: [...req.guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).values()].sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name })),
    roles: [...req.guild.roles.cache.filter((r) => r.id !== req.guild.id && !r.managed).values()].sort((a, b) => b.position - a.position).map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
    ...extra,
  });

  // ---------------------------------------------------------------- pages
  app.get('/dashboard', requireLogin, (req, res) => {
    const list = req.session.guilds.map((g) => ({ ...g, botIn: client.guilds.cache.has(g.id) }));
    res.send(views.guildList({ session: req.session, guilds: list, inviteUrl: `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&scope=bot%20applications.commands&permissions=8` }));
  });

  app.get('/dashboard/:guildId', requireLogin, requireGuild, (req, res) => {
    const all = req.settings.cases;
    const week = Date.now() - 7 * 86400e3;
    const recent = all.filter((c) => new Date(c.createdAt) > week);
    res.send(views.overview(ctx(req, 'overview', {
      stats: {
        members: req.guild.memberCount,
        cases: all.length,
        warningsWeek: recent.filter((c) => c.type === 'warn').length,
        automodWeek: recent.filter((c) => c.reason.startsWith('[Automod]')).length,
        bansActive: all.filter((c) => (c.type === 'ban' || c.type === 'tempban') && c.active).length,
        uptime: process.uptime(),
      },
      recent: all.slice(-8).reverse(),
    })));
  });

  app.get('/dashboard/:guildId/logs', requireLogin, requireGuild, (req, res) => res.send(views.logs(ctx(req, 'logs', { logTypes: LOG_TYPES }))));
  app.post('/dashboard/:guildId/logs', requireLogin, requireGuild, csrf, (req, res) => {
    for (const t of LOG_TYPES) {
      const v = req.body[t];
      if (v && req.guild.channels.cache.has(v)) req.settings.logs[t] = v;
      else delete req.settings.logs[t];
    }
    store.save();
    res.redirect(`/dashboard/${req.guild.id}/logs?saved=1`);
  });

  app.get('/dashboard/:guildId/automod', requireLogin, requireGuild, (req, res) => res.send(views.automod(ctx(req, 'automod'))));
  app.post('/dashboard/:guildId/automod', requireLogin, requireGuild, csrf, (req, res) => {
    const a = req.settings.automod;
    const b = req.body;
    const on = (k) => b[k] === 'on';
    a.enabled = on('enabled');
    a.antiInvite = on('antiInvite');
    a.antiLink = on('antiLink');
    a.antiSpam = on('antiSpam');
    a.maxMentions = Math.max(0, Math.min(50, parseInt(b.maxMentions, 10) || 0));
    a.spamMessages = Math.max(3, Math.min(30, parseInt(b.spamMessages, 10) || 6));
    a.spamSeconds = Math.max(2, Math.min(60, parseInt(b.spamSeconds, 10) || 5));
    a.bannedWords = String(b.bannedWords || '').split(/[\n,]/).map((w) => w.trim().toLowerCase()).filter(Boolean).slice(0, 200);
    a.ignoredChannels = [].concat(b.ignoredChannels || []).filter((id) => req.guild.channels.cache.has(id));
    a.ignoredRoles = [].concat(b.ignoredRoles || []).filter((id) => req.guild.roles.cache.has(id));
    // escalation rows: esc_warnings[], esc_action[], esc_minutes[]
    const w = [].concat(b.esc_warnings || []);
    const act = [].concat(b.esc_action || []);
    const min = [].concat(b.esc_minutes || []);
    const steps = [];
    for (let i = 0; i < w.length; i++) {
      const n = parseInt(w[i], 10);
      if (!n || !['timeout', 'kick', 'ban'].includes(act[i])) continue;
      steps.push(act[i] === 'timeout' ? { warnings: n, action: 'timeout', minutes: Math.max(1, parseInt(min[i], 10) || 60) } : { warnings: n, action: act[i] });
    }
    a.escalation = steps.filter((s, i) => steps.findIndex((x) => x.warnings === s.warnings) === i).sort((x, y) => x.warnings - y.warnings);
    store.save();
    res.redirect(`/dashboard/${req.guild.id}/automod?saved=1`);
  });

  app.get('/dashboard/:guildId/welcome', requireLogin, requireGuild, (req, res) => res.send(views.welcome(ctx(req, 'welcome'))));
  app.post('/dashboard/:guildId/welcome', requireLogin, requireGuild, csrf, (req, res) => {
    const b = req.body;
    const s = req.settings;
    s.welcome.enabled = b.welcomeEnabled === 'on' && req.guild.channels.cache.has(b.welcomeChannel);
    if (req.guild.channels.cache.has(b.welcomeChannel)) s.welcome.channelId = b.welcomeChannel;
    if (b.welcomeMessage?.trim()) s.welcome.message = b.welcomeMessage.trim().slice(0, 500);
    s.leave.enabled = b.leaveEnabled === 'on' && req.guild.channels.cache.has(b.leaveChannel);
    if (req.guild.channels.cache.has(b.leaveChannel)) s.leave.channelId = b.leaveChannel;
    if (b.leaveMessage?.trim()) s.leave.message = b.leaveMessage.trim().slice(0, 500);
    s.autoRole = req.guild.roles.cache.has(b.autoRole) ? b.autoRole : null;
    store.save();
    res.redirect(`/dashboard/${req.guild.id}/welcome?saved=1`);
  });

  app.get('/dashboard/:guildId/config', requireLogin, requireGuild, (req, res) => res.send(views.config(ctx(req, 'config'))));
  app.post('/dashboard/:guildId/config', requireLogin, requireGuild, csrf, (req, res) => {
    req.settings.modRoles = [].concat(req.body.modRoles || []).filter((id) => req.guild.roles.cache.has(id));
    req.settings.dmOnPunish = req.body.dmOnPunish === 'on';
    store.save();
    res.redirect(`/dashboard/${req.guild.id}/config?saved=1`);
  });

  app.get('/dashboard/:guildId/protection', requireLogin, requireGuild, (req, res) => res.send(views.protection(ctx(req, 'protection', { categories: [...req.guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).values()].map((c) => ({ id: c.id, name: c.name })) }))));
  app.post('/dashboard/:guildId/protection', requireLogin, requireGuild, csrf, (req, res) => {
    const s = req.settings;
    const b = req.body;
    const a = s.antiraid;
    a.enabled = b.arEnabled === 'on';
    a.joinsPerMinute = Math.max(0, Math.min(200, parseInt(b.joinsPerMinute, 10) || 0));
    a.raidAction = ['kick', 'timeout', 'none'].includes(b.raidAction) ? b.raidAction : 'kick';
    a.raidMinutes = Math.max(1, Math.min(120, parseInt(b.raidMinutes, 10) || 10));
    a.minAccountAgeDays = Math.max(0, Math.min(365, parseInt(b.minAccountAgeDays, 10) || 0));
    a.youngAction = ['kick', 'timeout', 'none'].includes(b.youngAction) ? b.youngAction : 'kick';
    if (b.endRaid === 'on') a.raidActive = null;
    s.appealUrl = /^https?:\/\//i.test(b.appealUrl || '') ? b.appealUrl.trim().slice(0, 200) : null;
    s.warnExpiryDays = Math.max(0, Math.min(365, parseInt(b.warnExpiryDays, 10) || 0));
    s.reportChannel = req.guild.channels.cache.has(b.reportChannel) ? b.reportChannel : null;
    s.tickets.enabled = b.ticketsEnabled === 'on';
    s.tickets.categoryId = req.guild.channels.cache.has(b.ticketCategory) ? b.ticketCategory : null;
    store.save();
    res.redirect(`/dashboard/${req.guild.id}/protection?saved=1`);
  });

  app.get('/dashboard/:guildId/stats', requireLogin, requireGuild, (req, res) => {
    const all = req.settings.cases;
    const days = Math.max(1, Math.min(365, parseInt(req.query.days, 10) || 30));
    const since = Date.now() - days * 86400e3;
    const list = all.filter((c) => new Date(c.createdAt) > since);
    const byMod = {};
    for (const c of list) {
      const k = c.modId;
      byMod[k] ??= { id: k, tag: c.modTag, total: 0, types: {} };
      byMod[k].total++;
      byMod[k].types[c.type] = (byMod[k].types[c.type] || 0) + 1;
    }
    const byType = {};
    for (const c of list) byType[c.type] = (byType[c.type] || 0) + 1;
    const byDay = {};
    for (let i = days - 1; i >= 0; i--) byDay[new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10)] = 0;
    for (const c of list) { const k = c.createdAt.slice(0, 10); if (k in byDay) byDay[k]++; }
    const topUsers = {};
    for (const c of list) { topUsers[c.userId] ??= { tag: c.userTag, n: 0 }; topUsers[c.userId].n++; }
    res.send(views.stats(ctx(req, 'stats', {
      days,
      mods: Object.values(byMod).sort((x, y) => y.total - x.total),
      byType,
      byDay,
      topUsers: Object.entries(topUsers).map(([id, v]) => ({ id, ...v })).sort((x, y) => y.n - x.n).slice(0, 10),
      total: list.length,
    })));
  });

  // ---------------------------------------------------------------- moderate
  const modUser = (req) => ({ id: req.session.user.id, tag: req.session.user.username, username: req.session.user.username });
  app.get('/dashboard/:guildId/moderate', requireLogin, requireGuild, async (req, res) => {
    const q = String(req.query.user || '').trim();
    let target = null;
    if (q) {
      const id = q.match(/\d{15,22}/)?.[0];
      const member = id ? await req.guild.members.fetch(id).catch(() => null) : [...req.guild.members.cache.values()].find((m) => m.user.username.toLowerCase() === q.toLowerCase() || m.displayName.toLowerCase() === q.toLowerCase()) || null;
      const user = member?.user || (id ? await client.users.fetch(id).catch(() => null) : null);
      if (user) {
        const banned = await req.guild.bans.fetch(user.id).then(() => true).catch(() => false);
        target = {
          id: user.id, tag: user.tag, avatar: user.displayAvatarURL({ size: 128 }), inGuild: Boolean(member), banned,
          joinedAt: member?.joinedAt, createdAt: user.createdAt, roles: member ? member.roles.cache.filter((r) => r.id !== req.guild.id).map((r) => r.name) : [],
          timedOut: member?.communicationDisabledUntilTimestamp > Date.now() ? member.communicationDisabledUntilTimestamp : null,
          cases: cases.forUser(req.guild.id, user.id).slice().reverse(), warnings: cases.activeWarnings(req.guild.id, user.id),
        };
      }
    }
    const bans = await req.guild.bans.fetch().then((b) => [...b.values()].slice(0, 100).map((b) => ({ id: b.user.id, tag: b.user.tag, reason: b.reason }))).catch(() => []);
    const timedOut = [...req.guild.members.cache.values()].filter((m) => m.communicationDisabledUntilTimestamp > Date.now()).map((m) => ({ id: m.id, tag: m.user.tag, until: m.communicationDisabledUntilTimestamp }));
    res.send(views.moderate(ctx(req, 'moderate', { q, target, notFound: Boolean(q && !target), bans, timedOut, result: req.query.r ? { ok: req.query.ok === '1', text: req.query.r } : null })));
  });
  app.post('/dashboard/:guildId/moderate', requireLogin, requireGuild, csrf, async (req, res) => {
    const { action, userId, reason, duration } = req.body;
    let minutes = 60;
    if (action === 'timeout') {
      const ms = parseDuration(duration || '');
      if (!ms || ms < 60_000 || ms > 28 * 86400e3) return res.redirect(`/dashboard/${req.guild.id}/moderate?user=${encodeURIComponent(userId)}&ok=0&r=${encodeURIComponent('Duration must be between 1m and 28d (e.g. 10m, 2h, 1d).')}`);
      minutes = Math.round(ms / 60_000);
    }
    if (!['warn', 'timeout', 'kick', 'ban', 'unban', 'untimeout'].includes(action) || !/^\d{15,22}$/.test(userId || '')) return res.status(400).send(views.error('Bad request.', req.session));
    if (userId === req.session.user.id) return res.redirect(`/dashboard/${req.guild.id}/moderate?user=${userId}&ok=0&r=${encodeURIComponent("You can't do that to yourself.")}`);
    const r = await actions.apply({ guild: req.guild, targetId: userId, action, moderator: modUser(req), reason: `${(reason || 'No reason provided').trim()} (via dashboard)`, minutes });
    res.redirect(`/dashboard/${req.guild.id}/moderate?user=${userId}&ok=${r.ok ? 1 : 0}&r=${encodeURIComponent(r.text)}`);
  });

  // ---------------------------------------------------------------- channels
  app.get('/dashboard/:guildId/channels', requireLogin, requireGuild, (req, res) => {
    const list = [...req.guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).values()].sort((a, b) => a.rawPosition - b.rawPosition).map((c) => {
      const ow = c.permissionOverwrites?.cache?.get(req.guild.id);
      return { id: c.id, name: c.name, slowmode: c.rateLimitPerUser || 0, locked: Boolean(ow?.deny?.has?.(PermissionFlagsBits.SendMessages)), parent: c.parent?.name || '' };
    });
    res.send(views.channels(ctx(req, 'channels', { list, result: req.query.r ? { ok: req.query.ok === '1', text: req.query.r } : null })));
  });
  app.post('/dashboard/:guildId/channels', requireLogin, requireGuild, csrf, async (req, res) => {
    const { action, channelId } = req.body;
    const back = (ok, text) => res.redirect(`/dashboard/${req.guild.id}/channels?ok=${ok ? 1 : 0}&r=${encodeURIComponent(text)}`);
    try {
      if (action === 'lockdown_start') return back(true, `Locked ${await lockdown.start(req.guild, modUser(req), (req.body.reason || 'Via dashboard').trim())} channel(s).`);
      if (action === 'lockdown_end') return back(true, `Unlocked ${await lockdown.end(req.guild, modUser(req))} channel(s).`);
      const ch = req.guild.channels.cache.get(channelId);
      if (!ch) return back(false, 'Channel not found.');
      if (action === 'slowmode') {
        const raw = String(req.body.slowmode || '0').trim().toLowerCase();
        const ms = raw === '0' || raw === 'off' ? 0 : parseDuration(raw);
        if (ms === null || ms > 6 * 3600e3) return back(false, 'Slowmode must be 0 / off or up to 6h, e.g. 5s, 2m.');
        await ch.setRateLimitPerUser(Math.round(ms / 1000), `Via dashboard by ${req.session.user.username}`);
        return back(true, `Slowmode for #${ch.name} set to ${ms ? raw : 'off'}.`);
      }
      if (action === 'lock' || action === 'unlock') {
        await ch.permissionOverwrites.edit(req.guild.id, { SendMessages: action === 'lock' ? false : null }, { reason: `Via dashboard by ${req.session.user.username}` });
        await require('./logger').log(req.guild, 'server', new EmbedBuilder().setColor(action === 'lock' ? COLORS.warn : COLORS.success).setAuthor({ name: action === 'lock' ? '🔒 Channel locked' : '🔓 Channel unlocked' }).setDescription(`${ch} via dashboard by <@${req.session.user.id}>`).setTimestamp());
        return back(true, `#${ch.name} ${action}ed.`);
      }
      if (action === 'purge') {
        const n = Math.max(1, Math.min(100, parseInt(req.body.amount, 10) || 0));
        const fetched = await ch.messages.fetch({ limit: n });
        const deleted = await ch.bulkDelete(fetched.filter((m) => Date.now() - m.createdTimestamp < 14 * 86400e3), true);
        await cases.create({ guild: req.guild, type: 'purge', user: modUser(req), moderator: modUser(req), reason: `Purged ${deleted.size} message(s) via dashboard`, extra: { count: deleted.size, channelId: ch.id } });
        return back(true, `Deleted ${deleted.size} message(s) in #${ch.name}.`);
      }
      return back(false, 'Unknown action.');
    } catch (err) {
      return back(false, err.message);
    }
  });

  // ---------------------------------------------------------------- tools
  app.get('/dashboard/:guildId/tools', requireLogin, requireGuild, (req, res) => {
    const open = Object.entries(req.settings.tickets.open).map(([chId, uid]) => ({ channelId: chId, userId: uid, name: req.guild.channels.cache.get(chId)?.name || chId, exists: req.guild.channels.cache.has(chId) }));
    res.send(views.tools(ctx(req, 'tools', { openTickets: open, categories: [...req.guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).values()].map((c) => ({ id: c.id, name: c.name })), result: req.query.r ? { ok: req.query.ok === '1', text: req.query.r } : null })));
  });
  app.post('/dashboard/:guildId/tools', requireLogin, requireGuild, csrf, async (req, res) => {
    const b = req.body;
    const back = (ok, text) => res.redirect(`/dashboard/${req.guild.id}/tools?ok=${ok ? 1 : 0}&r=${encodeURIComponent(text)}`);
    const ch = req.guild.channels.cache.get(b.channelId);
    try {
      if (b.action === 'selfroles') {
        if (!ch) return back(false, 'Pick a channel.');
        const roles = [].concat(b.roles || []).map((id) => req.guild.roles.cache.get(id)).filter(Boolean).slice(0, 5);
        if (!roles.length) return back(false, 'Pick 1–5 roles.');
        const bad = roles.find((r) => r.position >= req.guild.members.me.roles.highest.position || r.managed);
        if (bad) return back(false, `I can't manage "${bad.name}" — it is above my role or managed by an integration.`);
        const row = new ActionRowBuilder().addComponents(roles.map((r) => new ButtonBuilder().setCustomId(`role:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary)));
        await ch.send({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle((b.title || 'Pick your roles').slice(0, 100)).setDescription((b.description || 'Click a button to add or remove the role.').slice(0, 500))], components: [row] });
        return back(true, `Self-roles panel posted in #${ch.name}.`);
      }
      if (b.action === 'ticketpanel') {
        if (!ch) return back(false, 'Pick a channel.');
        req.settings.tickets.enabled = true;
        if (req.guild.channels.cache.has(b.categoryId)) req.settings.tickets.categoryId = b.categoryId;
        store.save();
        await ch.send(tickets.panel());
        return back(true, `Ticket panel posted in #${ch.name}.`);
      }
      if (b.action === 'closeticket') {
        const okk = await tickets.closeChannel(req.guild, b.ticketChannel, req.session.user.id, 2000);
        return back(okk, okk ? 'Ticket closed; transcript sent to the mod log.' : 'That ticket no longer exists.');
      }
      if (b.action === 'say') {
        if (!ch) return back(false, 'Pick a channel.');
        const text = String(b.text || '').trim().slice(0, 2000);
        if (!text) return back(false, 'Message is empty.');
        if (b.asEmbed === 'on') await ch.send({ embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription(text).setFooter({ text: `Sent by ${req.session.user.username}` })] });
        else await ch.send({ content: text, allowedMentions: { parse: ['users', 'roles'] } });
        return back(true, `Message sent to #${ch.name}.`);
      }
      if (b.action === 'testwelcome') {
        const wch = req.guild.channels.cache.get(req.settings.welcome.channelId);
        if (!wch) return back(false, 'Set a welcome channel first.');
        const me = await req.guild.members.fetch(req.session.user.id).catch(() => null);
        if (!me) return back(false, 'Could not find you in the server.');
        await wch.send({ content: require('../commands/config').fmtWelcome(req.settings.welcome.message, me), allowedMentions: { parse: [] } });
        return back(true, `Test welcome sent to #${wch.name}.`);
      }
      return back(false, 'Unknown action.');
    } catch (err) {
      return back(false, err.message);
    }
  });

  // ---------------------------------------------------------------- cases export / delete
  app.get('/dashboard/:guildId/cases/export.:fmt', requireLogin, requireGuild, (req, res) => {
    const list = req.settings.cases;
    if (req.params.fmt === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="cases-${req.guild.id}.json"`);
      return res.send(JSON.stringify(list, null, 2));
    }
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['id,type,userId,userTag,modId,modTag,reason,createdAt,expiresAt,active', ...list.map((c) => [c.id, c.type, c.userId, c.userTag, c.modId, c.modTag, c.reason, c.createdAt, c.expiresAt || '', c.active ? 1 : 0].map(cell).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cases-${req.guild.id}.csv"`);
    res.send(csv);
  });

  app.get('/dashboard/:guildId/cases', requireLogin, requireGuild, (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const type = String(req.query.type || '');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    let list = [...req.settings.cases].reverse();
    if (type) list = list.filter((c) => c.type === type);
    if (q) list = list.filter((c) => c.userId === q || c.userTag.toLowerCase().includes(q) || c.modTag.toLowerCase().includes(q) || c.reason.toLowerCase().includes(q) || String(c.id) === q);
    const per = 25;
    res.send(views.cases(ctx(req, 'cases', { list: list.slice((page - 1) * per, page * per), total: list.length, page, pages: Math.max(1, Math.ceil(list.length / per)), q, type, deleted: req.query.deleted })));
  });
  app.get('/dashboard/:guildId/cases/:id', requireLogin, requireGuild, (req, res) => {
    const c = cases.get(req.guild.id, parseInt(req.params.id, 10));
    if (!c) return res.status(404).send(views.error('No such case.', req.session));
    res.send(views.caseDetail(ctx(req, 'cases', { c, history: cases.forUser(req.guild.id, c.userId).slice().reverse() })));
  });
  app.post('/dashboard/:guildId/cases/:id', requireLogin, requireGuild, csrf, (req, res) => {
    const c = cases.get(req.guild.id, parseInt(req.params.id, 10));
    if (!c) return res.status(404).send(views.error('No such case.', req.session));
    if (req.body.action === 'reason' && req.body.reason?.trim()) c.reason = req.body.reason.trim().slice(0, 500);
    if (req.body.action === 'clear' && c.type === 'warn') c.active = false;
    if (req.body.action === 'delete') {
      req.settings.cases = req.settings.cases.filter((x) => x.id !== c.id);
      store.save();
      return res.redirect(`/dashboard/${req.guild.id}/cases?deleted=${c.id}`);
    }
    store.save();
    res.redirect(`/dashboard/${req.guild.id}/cases/${c.id}?saved=1`);
  });
}

module.exports = { mount };
