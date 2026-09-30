// Server-rendered HTML for the dashboard. Plain template strings, no view engine.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { warn: '⚠️', timeout: '🔇', untimeout: '🔊', kick: '👢', ban: '🔨', tempban: '⏳', softban: '🧹', unban: '🔓', purge: '🗑️', note: '📝' };
const NAV = [['overview', '📊 Overview'], ['logs', '📜 Logs'], ['automod', '🤖 Automod'], ['welcome', '👋 Welcome'], ['config', '⚙️ Staff'], ['cases', '📁 Cases']];

const CSS = `
:root{--bg:#1e1f22;--bg2:#2b2d31;--bg3:#313338;--line:#3f4147;--fg:#f2f3f5;--muted:#949ba4;--accent:#5865f2;--green:#23a559;--red:#f23f43;--yellow:#f0b232}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:#00a8fc;text-decoration:none}a:hover{text-decoration:underline}
.top{display:flex;align-items:center;gap:12px;padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.top .brand{font-weight:700;font-size:17px;color:var(--fg)}.top .sp{flex:1}.top img{width:28px;height:28px;border-radius:50%}
.top .user{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:14px}
.wrap{display:flex;min-height:calc(100vh - 49px)}
.side{width:220px;background:var(--bg2);border-right:1px solid var(--line);padding:12px;flex-shrink:0}
.side a{display:block;padding:9px 12px;border-radius:6px;color:var(--muted);margin-bottom:2px}.side a.on,.side a:hover{background:var(--bg3);color:var(--fg);text-decoration:none}
.side .g{display:flex;align-items:center;gap:8px;padding:8px 12px 14px;font-weight:600;border-bottom:1px solid var(--line);margin-bottom:8px}.side .g img{width:32px;height:32px;border-radius:50%}
main{flex:1;padding:24px;max-width:960px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px}.sub{color:var(--muted);margin:0 0 20px}
.card{background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:18px;margin-bottom:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
.stat{background:var(--bg3);border-radius:8px;padding:14px}.stat b{display:block;font-size:26px}.stat span{color:var(--muted);font-size:13px}
label{display:block;margin:12px 0 4px;color:var(--muted);font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.3px}
input[type=text],input[type=number],select,textarea{width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:9px 10px;font:inherit}
textarea{min-height:90px;resize:vertical}select[multiple]{min-height:130px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}@media(max-width:700px){.row{grid-template-columns:1fr}.side{display:none}main{padding:16px}.mnav{display:flex!important}}
.mnav{display:none;gap:6px;overflow-x:auto;padding:8px 12px;background:var(--bg2);border-bottom:1px solid var(--line)}.mnav a{white-space:nowrap;padding:6px 10px;border-radius:6px;color:var(--muted);background:var(--bg3)}.mnav a.on{color:var(--fg);background:var(--accent)}
.tog{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}.tog:last-child{border:0}.tog input{width:18px;height:18px}.tog small{color:var(--muted);display:block}
button,.btn{background:var(--accent);color:#fff;border:0;border-radius:6px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer;display:inline-block}
button.sec,.btn.sec{background:var(--bg3)}button.danger{background:var(--red)}
.ok{background:rgba(35,165,89,.15);border:1px solid var(--green);color:#9be0b0;padding:10px 14px;border-radius:8px;margin-bottom:16px}
.err{background:rgba(242,63,67,.15);border:1px solid var(--red);padding:10px 14px;border-radius:8px}
table{width:100%;border-collapse:collapse}th,td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:14px;vertical-align:top}th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:var(--bg3)}.tag.warn{background:#4a3a10;color:#f0b232}.tag.ban,.tag.tempban,.tag.softban{background:#4a1a1c;color:#f5a2a4}.tag.kick{background:#4a2a10;color:#f7b07a}.tag.timeout{background:#3a2a4a;color:#c9a4f5}.tag.unban,.tag.untimeout{background:#123a22;color:#8fe0ad}
.esc{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:center;margin-bottom:8px}
.gl{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}.gl a{display:flex;align-items:center;gap:12px;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:14px;color:var(--fg)}.gl a:hover{border-color:var(--accent);text-decoration:none}.gl img,.gl .ph{width:44px;height:44px;border-radius:50%;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-weight:700}
.center{max-width:480px;margin:80px auto;text-align:center;padding:0 16px}.center img{width:96px;height:96px;border-radius:50%;margin-bottom:12px}
.pag{display:flex;gap:8px;align-items:center;margin-top:12px;color:var(--muted)}
code{background:var(--bg);padding:2px 6px;border-radius:4px}
`;

function layout({ title, session, guild, page, body }) {
  const nav = guild
    ? NAV.map(([k, l]) => `<a class="${page === k ? 'on' : ''}" href="/dashboard/${guild.id}${k === 'overview' ? '' : '/' + k}">${l}</a>`).join('')
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Sentinel</title><style>${CSS}</style></head><body>
<div class="top"><a class="brand" href="/dashboard">🛡️ Sentinel</a><span class="sp"></span>${session ? `<span class="user">${session.user.avatar ? `<img src="${esc(session.user.avatar)}" alt="">` : ''}${esc(session.user.username)} · <a href="/auth/logout">Log out</a></span>` : ''}</div>
${guild ? `<div class="mnav">${nav}</div>` : ''}
<div class="wrap">${guild ? `<nav class="side"><div class="g">${guild.iconURL?.() ? `<img src="${esc(guild.iconURL({ size: 64 }))}" alt="">` : ''}<span>${esc(guild.name)}</span></div>${nav}<a href="/dashboard" style="margin-top:12px">← All servers</a></nav>` : ''}<main>${body}</main></div></body></html>`;
}

const saved = (q) => (q ? '<div class="ok">✅ Settings saved.</div>' : '');
const csrf = (s) => `<input type="hidden" name="_csrf" value="${esc(s.csrf)}">`;
const chanSelect = (name, channels, current, allowNone = true) =>
  `<select name="${name}">${allowNone ? '<option value="">— disabled —</option>' : ''}${channels.map((c) => `<option value="${c.id}" ${c.id === current ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}</select>`;
const multi = (name, items, current, label = (i) => i.name) =>
  `<select name="${name}" multiple>${items.map((i) => `<option value="${i.id}" ${current.includes(i.id) ? 'selected' : ''}>${esc(label(i))}</option>`).join('')}</select><small style="color:var(--muted)">Ctrl/Cmd-click to select several</small>`;
const check = (name, on, label, hint) => `<div class="tog"><input type="checkbox" id="${name}" name="${name}" ${on ? 'checked' : ''}><label for="${name}" style="margin:0;text-transform:none;font-size:15px;color:var(--fg);font-weight:500">${label}${hint ? `<small>${hint}</small>` : ''}</label></div>`;
const when = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';

module.exports = {
  landing: ({ botName, avatar }) => layout({ title: 'Login', body: `<div class="center">${avatar ? `<img src="${esc(avatar)}" alt="">` : ''}<h1>${esc(botName)} dashboard</h1><p class="sub">Configure logging, automod, welcome messages and browse moderation cases from your browser.</p><a class="btn" href="/auth/login">Login with Discord</a><p class="sub" style="margin-top:20px;font-size:13px">You need <b>Manage Server</b> in a server the bot is in.</p></div>` }),

  error: (msg, session) => layout({ title: 'Error', session, body: `<div class="center"><h1>Something went wrong</h1><div class="err">${esc(msg)}</div><p><a href="/dashboard">← Back</a></p></div>` }),

  guildList: ({ session, guilds, inviteUrl }) => layout({ title: 'Servers', session, body: `<h1>Your servers</h1><p class="sub">Servers where you have Manage Server.</p>
<div class="gl">${guilds.map((g) => g.botIn
    ? `<a href="/dashboard/${g.id}">${g.icon ? `<img src="${esc(g.icon)}" alt="">` : `<div class="ph">${esc(g.name[0])}</div>`}<div><b>${esc(g.name)}</b><br><small style="color:var(--green)">● Bot active</small></div></a>`
    : `<a href="${esc(inviteUrl)}&guild_id=${g.id}" target="_blank" rel="noopener">${g.icon ? `<img src="${esc(g.icon)}" alt="">` : `<div class="ph">${esc(g.name[0])}</div>`}<div><b>${esc(g.name)}</b><br><small style="color:var(--muted)">Invite bot →</small></div></a>`).join('') || '<p>No servers found.</p>'}</div>` }),

  overview: ({ session, guild, page, stats, recent }) => layout({ title: guild.name, session, guild, page, body: `<h1>${esc(guild.name)}</h1><p class="sub">Overview</p>
<div class="grid">
<div class="stat"><b>${stats.members}</b><span>Members</span></div>
<div class="stat"><b>${stats.cases}</b><span>Total cases</span></div>
<div class="stat"><b>${stats.warningsWeek}</b><span>Warnings · 7 days</span></div>
<div class="stat"><b>${stats.automodWeek}</b><span>Automod hits · 7 days</span></div>
<div class="stat"><b>${stats.bansActive}</b><span>Active bans</span></div>
<div class="stat"><b>${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m</b><span>Bot uptime</span></div>
</div>
<h2>Recent cases</h2><div class="card">${recent.length ? `<table><tr><th>#</th><th>Type</th><th>User</th><th>Reason</th><th>When</th></tr>${recent.map((c) => `<tr><td><a href="/dashboard/${guild.id}/cases/${c.id}">#${c.id}</a></td><td><span class="tag ${c.type}">${ICON[c.type] || ''} ${c.type}</span></td><td>${esc(c.userTag)}</td><td>${esc(c.reason.slice(0, 80))}</td><td>${when(c.createdAt)}</td></tr>`).join('')}</table>` : '<p class="sub" style="margin:0">No cases yet.</p>'}</div>` }),

  logs: ({ session, guild, settings, page, channels, logTypes, ...r }) => layout({ title: 'Logs', session, guild, page, body: `<h1>Log channels</h1><p class="sub">Pick where each kind of event is posted. Leave as disabled to turn a category off.</p>${saved(r.savedFlag)}
<form method="post"><div class="card">${csrf(session)}${logTypes.map((t) => `<label>${t}</label>${chanSelect(t, channels, settings.logs[t])}`).join('')}<p style="margin-top:18px"><button>Save</button></p></div></form>` }),

  automod: ({ session, guild, settings, page, channels, roles, savedFlag }) => {
    const a = settings.automod;
    const escRow = (s = {}) => `<div class="esc"><input type="number" name="esc_warnings" min="1" max="50" placeholder="warnings" value="${s.warnings ?? ''}"><select name="esc_action"><option value="">— none —</option>${['timeout', 'kick', 'ban'].map((x) => `<option ${s.action === x ? 'selected' : ''}>${x}</option>`).join('')}</select><input type="number" name="esc_minutes" min="1" placeholder="minutes (timeout)" value="${s.minutes ?? ''}"><span style="color:var(--muted);font-size:12px">step</span></div>`;
    return layout({ title: 'Automod', session, guild, page, body: `<h1>Automod</h1><p class="sub">Messages that break a rule are deleted and the user gets an automatic warning. Staff roles are always ignored.</p>${saved(savedFlag)}
<form method="post">${csrf(session)}<div class="card">
${check('enabled', a.enabled, 'Automod enabled', 'Master switch')}
${check('antiInvite', a.antiInvite, 'Block Discord invites', 'discord.gg links')}
${check('antiLink', a.antiLink, 'Block all links', 'Any http(s) URL')}
${check('antiSpam', a.antiSpam, 'Block spam', 'Too many messages in a short time')}
<div class="row"><div><label>Spam: messages</label><input type="number" name="spamMessages" min="3" max="30" value="${a.spamMessages}"></div><div><label>…within seconds</label><input type="number" name="spamSeconds" min="2" max="60" value="${a.spamSeconds}"></div></div>
<label>Max mentions per message (0 = off)</label><input type="number" name="maxMentions" min="0" max="50" value="${a.maxMentions}">
<label>Banned words / phrases (one per line)</label><textarea name="bannedWords">${esc(a.bannedWords.join('\n'))}</textarea>
<div class="row"><div><label>Ignored channels</label>${multi('ignoredChannels', channels, a.ignoredChannels, (c) => '# ' + c.name)}</div><div><label>Ignored roles</label>${multi('ignoredRoles', roles, a.ignoredRoles)}</div></div>
</div>
<h2>Escalation</h2><div class="card"><p class="sub">When a user's active warnings reach a number, apply an action automatically. Leave a row empty to remove it.</p>
${[...a.escalation, {}, {}].map(escRow).join('')}
</div><p><button>Save</button></p></form>` });
  },

  welcome: ({ session, guild, settings, page, channels, roles, savedFlag }) => layout({ title: 'Welcome', session, guild, page, body: `<h1>Welcome &amp; leave</h1>${saved(savedFlag)}<p class="sub">Placeholders: <code>{user}</code> mention · <code>{username}</code> · <code>{tag}</code> · <code>{server}</code> · <code>{count}</code> member number</p>
<form method="post">${csrf(session)}<div class="row">
<div class="card">${check('welcomeEnabled', settings.welcome.enabled, 'Welcome messages')}<label>Channel</label>${chanSelect('welcomeChannel', channels, settings.welcome.channelId)}<label>Message</label><textarea name="welcomeMessage">${esc(settings.welcome.message)}</textarea></div>
<div class="card">${check('leaveEnabled', settings.leave.enabled, 'Leave messages')}<label>Channel</label>${chanSelect('leaveChannel', channels, settings.leave.channelId)}<label>Message</label><textarea name="leaveMessage">${esc(settings.leave.message)}</textarea></div>
</div><div class="card"><label>Auto-role for new members</label><select name="autoRole"><option value="">— none —</option>${roles.map((r) => `<option value="${r.id}" ${settings.autoRole === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
<p><button>Save</button></p></form>` }),

  config: ({ session, guild, settings, page, roles, savedFlag }) => layout({ title: 'Staff', session, guild, page, body: `<h1>Staff &amp; behaviour</h1>${saved(savedFlag)}<p class="sub">Mod roles bypass automod. Slash-command access itself is controlled by Discord's own permissions (Server Settings → Integrations).</p>
<form method="post">${csrf(session)}<div class="card"><label>Mod roles</label>${multi('modRoles', roles, settings.modRoles)}
${check('dmOnPunish', settings.dmOnPunish, 'DM users when punished', 'Sends the reason and case number')}
</div><p><button>Save</button></p></form>` }),

  cases: ({ session, guild, page, list, total, page: pg, pages, q, type }) => layout({ title: 'Cases', session, guild, page, body: `<h1>Cases</h1><p class="sub">${total} case(s)</p>
<form method="get" class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><div style="flex:2;min-width:200px"><label>Search (user, ID, reason, case #)</label><input type="text" name="q" value="${esc(q)}"></div><div style="flex:1;min-width:140px"><label>Type</label><select name="type"><option value="">All</option>${Object.keys(ICON).map((t) => `<option ${type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><button class="sec">Filter</button></form>
<div class="card">${list.length ? `<table><tr><th>#</th><th>Type</th><th>User</th><th>Moderator</th><th>Reason</th><th>When</th></tr>${list.map((c) => `<tr><td><a href="/dashboard/${guild.id}/cases/${c.id}">#${c.id}</a></td><td><span class="tag ${c.type}">${ICON[c.type] || ''} ${c.type}${c.type === 'warn' && !c.active ? ' (cleared)' : ''}</span></td><td>${esc(c.userTag)}<br><small style="color:var(--muted)">${c.userId}</small></td><td>${esc(c.modTag)}</td><td>${esc(c.reason.slice(0, 90))}</td><td>${when(c.createdAt)}</td></tr>`).join('')}</table>` : '<p class="sub" style="margin:0">Nothing matches.</p>'}
<div class="pag">${pg > 1 ? `<a class="btn sec" href="?q=${encodeURIComponent(q)}&type=${type}&page=${pg - 1}">← Prev</a>` : ''}<span>Page ${pg} / ${pages}</span>${pg < pages ? `<a class="btn sec" href="?q=${encodeURIComponent(q)}&type=${type}&page=${pg + 1}">Next →</a>` : ''}</div></div>` }),

  caseDetail: ({ session, guild, page, c, history, savedFlag }) => layout({ title: `Case #${c.id}`, session, guild, page, body: `<p><a href="/dashboard/${guild.id}/cases">← All cases</a></p>${saved(savedFlag)}<h1>${ICON[c.type] || ''} Case #${c.id} <span class="tag ${c.type}">${c.type}${c.active === false && c.type === 'warn' ? ' (cleared)' : ''}</span></h1>
<div class="row"><div class="card"><label>User</label>${esc(c.userTag)} <small style="color:var(--muted)">${c.userId}</small><label>Moderator</label>${esc(c.modTag)}<label>When</label>${when(c.createdAt)}${c.expiresAt ? `<label>Expires</label>${when(c.expiresAt)}` : ''}
<form method="post">${csrf(session)}<input type="hidden" name="action" value="reason"><label>Reason</label><textarea name="reason">${esc(c.reason)}</textarea><p><button>Update reason</button> ${c.type === 'warn' && c.active ? `<button name="action" value="clear" class="danger" formnovalidate>Clear warning</button>` : ''}</p></form></div>
<div class="card"><h2 style="margin-top:0">User history (${history.length})</h2>${history.map((h) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><a href="/dashboard/${guild.id}/cases/${h.id}">#${h.id}</a> <span class="tag ${h.type}">${h.type}</span> ${esc(h.reason.slice(0, 60))}<br><small style="color:var(--muted)">${when(h.createdAt)}</small></div>`).join('')}</div></div>` }),
};
