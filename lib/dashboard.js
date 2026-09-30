// Web dashboard: Login with Discord (OAuth2) + settings pages.
// Mounted on the same Express app that serves /health. No extra dependencies.
const crypto = require('crypto');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const store = require('./store');
const cases = require('./cases');
const views = require('./views');

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

  app.get('/dashboard/:guildId/cases', requireLogin, requireGuild, (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const type = String(req.query.type || '');
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    let list = [...req.settings.cases].reverse();
    if (type) list = list.filter((c) => c.type === type);
    if (q) list = list.filter((c) => c.userId === q || c.userTag.toLowerCase().includes(q) || c.modTag.toLowerCase().includes(q) || c.reason.toLowerCase().includes(q) || String(c.id) === q);
    const per = 25;
    res.send(views.cases(ctx(req, 'cases', { list: list.slice((page - 1) * per, page * per), total: list.length, page, pages: Math.max(1, Math.ceil(list.length / per)), q, type })));
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
    store.save();
    res.redirect(`/dashboard/${req.guild.id}/cases/${c.id}?saved=1`);
  });
}

module.exports = { mount };
