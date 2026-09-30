// Server-rendered HTML for the dashboard. Plain template strings, no view engine.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { warn: '⚠️', timeout: '🔇', untimeout: '🔊', kick: '👢', ban: '🔨', tempban: '⏳', softban: '🧹', unban: '🔓', purge: '🗑️', note: '📝' };
const NAV = [['overview', '📊 Overview'], ['moderate', '🔨 Moderate'], ['cases', '📁 Cases'], ['channels', '#️⃣ Channels'], ['logs', '📜 Logs'], ['automod', '🤖 Automod'], ['protection', '🛡️ Protection'], ['welcome', '👋 Welcome'], ['config', '⚙️ Staff'], ['tools', '🧰 Tools'], ['stats', '📈 Stats']];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
:root{--bg:#0d0e14;--bg2:#13141c;--panel:rgba(255,255,255,.035);--panel2:rgba(255,255,255,.06);--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--fg:#eef0f6;--muted:#8b91a7;--accent:#7c6cff;--accent2:#b06bff;--green:#3ddc84;--red:#ff5c6c;--yellow:#ffc857;--cyan:#38d6f5;--r:14px;--shadow:0 10px 30px rgba(0,0,0,.35)}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-font-smoothing:antialiased;min-height:100vh;background-image:radial-gradient(900px 500px at -10% -10%,rgba(124,108,255,.18),transparent 60%),radial-gradient(700px 400px at 110% 10%,rgba(176,107,255,.14),transparent 60%),radial-gradient(600px 400px at 50% 120%,rgba(56,214,245,.08),transparent 60%);background-attachment:fixed}
a{color:#9db4ff;text-decoration:none}a:hover{text-decoration:underline}
::selection{background:rgba(124,108,255,.4)}
.top{display:flex;align-items:center;gap:14px;padding:12px 20px;background:rgba(13,14,20,.7);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
.top .brand{font-weight:800;font-size:17px;color:var(--fg);letter-spacing:-.2px;display:flex;align-items:center;gap:8px}.top .brand:hover{text-decoration:none}
.top .sp{flex:1}.top img{width:30px;height:30px;border-radius:50%;border:2px solid var(--line2)}
.top .user{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:14px;background:var(--panel);border:1px solid var(--line);padding:4px 12px 4px 4px;border-radius:999px}.top .user a{color:var(--muted)}.top .user a:hover{color:var(--fg)}
.wrap{display:flex;min-height:calc(100vh - 57px)}
.side{width:236px;padding:16px 12px;flex-shrink:0;position:sticky;top:57px;height:calc(100vh - 57px);overflow:auto}
.side a{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:var(--muted);margin-bottom:3px;font-weight:500;font-size:14.5px;transition:background .15s,color .15s,transform .15s}
.side a:hover{background:var(--panel2);color:var(--fg);text-decoration:none;transform:translateX(2px)}
.side a.on{background:linear-gradient(135deg,rgba(124,108,255,.28),rgba(176,107,255,.18));color:#fff;box-shadow:inset 0 0 0 1px rgba(124,108,255,.45)}
.side .g{display:flex;align-items:center;gap:10px;padding:10px 12px 16px;font-weight:700;border-bottom:1px solid var(--line);margin-bottom:10px;font-size:15px}.side .g img{width:36px;height:36px;border-radius:12px}
main{flex:1;padding:28px 32px 60px;max-width:1080px;min-width:0}
h1{font-size:26px;margin:0 0 4px;font-weight:800;letter-spacing:-.4px}h2{font-size:15px;margin:26px 0 10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}.sub{color:var(--muted);margin:0 0 22px;font-size:14.5px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:20px;margin-bottom:16px;backdrop-filter:blur(6px);box-shadow:var(--shadow);transition:border-color .15s}.card:hover{border-color:var(--line2)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:18px 18px 14px;position:relative;overflow:hidden}.stat:before{content:'';position:absolute;inset:0 0 auto 0;height:3px;background:linear-gradient(90deg,var(--accent),var(--accent2),var(--cyan))}
.stat b{display:block;font-size:30px;font-weight:800;letter-spacing:-.6px;background:linear-gradient(135deg,#fff,#c9c3ff);-webkit-background-clip:text;background-clip:text;color:transparent}.stat span{color:var(--muted);font-size:12.5px;font-weight:500;text-transform:uppercase;letter-spacing:.5px}
label{display:block;margin:14px 0 6px;color:var(--muted);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
input[type=text],input[type=number],select,textarea{width:100%;background:rgba(0,0,0,.35);color:var(--fg);border:1px solid var(--line2);border-radius:10px;padding:10px 12px;font:inherit;transition:border-color .15s,box-shadow .15s;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,108,255,.25)}
select{appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238b91a7' stroke-width='2' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:32px}
select[multiple]{background-image:none;min-height:140px;padding:6px}select[multiple] option{padding:6px 8px;border-radius:6px}select[multiple] option:checked{background:linear-gradient(0deg,var(--accent),var(--accent)) ;color:#fff}
textarea{min-height:96px;resize:vertical}
.row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.tog{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--line)}.tog:last-child{border:0}.tog small{color:var(--muted);display:block;font-size:13px;font-weight:400}
.tog input[type=checkbox]{appearance:none;-webkit-appearance:none;width:44px;height:26px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid var(--line2);position:relative;cursor:pointer;flex-shrink:0;transition:background .2s,border-color .2s;margin:0}
.tog input[type=checkbox]:before{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.4)}
.tog input[type=checkbox]:checked{background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent}.tog input[type=checkbox]:checked:before{transform:translateX(18px)}
.tog input[type=checkbox]:focus-visible{box-shadow:0 0 0 3px rgba(124,108,255,.35)}
button,.btn{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;border:0;border-radius:10px;padding:10px 18px;font:inherit;font-weight:600;cursor:pointer;display:inline-block;transition:transform .12s,box-shadow .15s,filter .15s;box-shadow:0 6px 18px rgba(124,108,255,.28)}
button:hover,.btn:hover{transform:translateY(-1px);filter:brightness(1.08);text-decoration:none}button:active{transform:translateY(0)}
button.sec,.btn.sec{background:var(--panel2);border:1px solid var(--line2);box-shadow:none}button.danger{background:linear-gradient(135deg,#ff5c6c,#ff3d7f);box-shadow:0 6px 18px rgba(255,92,108,.25)}
.ok{background:rgba(61,220,132,.1);border:1px solid rgba(61,220,132,.4);color:#9be0b0;padding:12px 16px;border-radius:12px;margin-bottom:16px;font-weight:500}
.err{background:rgba(255,92,108,.1);border:1px solid rgba(255,92,108,.45);padding:12px 16px;border-radius:12px;margin-bottom:16px;font-weight:500}
table{width:100%;border-collapse:separate;border-spacing:0}th,td{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left;font-size:14px;vertical-align:top}th{color:var(--muted);font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.5px}
tr:last-child td{border-bottom:0}tbody tr:hover td,tr:hover td{background:rgba(255,255,255,.025)}
.tag{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;background:var(--panel2);border:1px solid var(--line)}
.tag.warn{background:rgba(255,200,87,.15);color:#ffd27a;border-color:rgba(255,200,87,.35)}.tag.ban,.tag.tempban,.tag.softban{background:rgba(255,92,108,.15);color:#ff9aa5;border-color:rgba(255,92,108,.35)}.tag.kick{background:rgba(255,140,80,.15);color:#ffb58a;border-color:rgba(255,140,80,.35)}.tag.timeout{background:rgba(176,107,255,.15);color:#d2b3ff;border-color:rgba(176,107,255,.35)}.tag.unban,.tag.untimeout{background:rgba(61,220,132,.15);color:#8fe0ad;border-color:rgba(61,220,132,.35)}.tag.purge,.tag.note{background:rgba(56,214,245,.12);color:#9de6f7;border-color:rgba(56,214,245,.3)}
.esc{display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:center;margin-bottom:8px}
.gl{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}.gl a{display:flex;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:16px;color:var(--fg);transition:transform .15s,border-color .15s,box-shadow .15s}.gl a:hover{border-color:var(--accent);text-decoration:none;transform:translateY(-2px);box-shadow:var(--shadow)}.gl img,.gl .ph{width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px}
.center{max-width:520px;margin:80px auto;text-align:center;padding:0 16px}.center img{width:104px;height:104px;border-radius:28px;margin-bottom:16px;box-shadow:0 20px 50px rgba(124,108,255,.35)}
.hero{display:flex;flex-direction:column;align-items:center;gap:10px}.hero h1{font-size:34px}.hero .btn{padding:14px 28px;font-size:16px;border-radius:12px;margin-top:8px}
.feat{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:34px;text-align:left}.feat div{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;font-size:13.5px;color:var(--muted)}.feat b{display:block;color:var(--fg);font-size:14px;margin-bottom:2px}
.pag{display:flex;gap:8px;align-items:center;margin-top:14px;color:var(--muted)}
code{background:rgba(0,0,0,.35);border:1px solid var(--line);padding:2px 7px;border-radius:6px;font-size:13px}
.mnav{display:none;gap:6px;overflow-x:auto;padding:10px 14px;background:rgba(13,14,20,.7);backdrop-filter:blur(12px);border-bottom:1px solid var(--line);position:sticky;top:57px;z-index:15;scrollbar-width:none}.mnav::-webkit-scrollbar{display:none}.mnav a{white-space:nowrap;padding:7px 12px;border-radius:999px;color:var(--muted);background:var(--panel2);border:1px solid var(--line);font-size:13.5px;font-weight:500}.mnav a.on{color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent}
@media(max-width:820px){.row{grid-template-columns:1fr}.side{display:none}main{padding:18px 16px 60px}.mnav{display:flex!important}.esc{grid-template-columns:1fr 1fr}.top .user span.name{display:none}h1{font-size:22px}}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
`;

function layout({ title, session, guild, page, body }) {
  const nav = guild
    ? NAV.map(([k, l]) => `<a class="${page === k ? 'on' : ''}" href="/dashboard/${guild.id}${k === 'overview' ? '' : '/' + k}">${l}</a>`).join('')
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} — Sentinel</title><style>${CSS}</style></head><body>
<div class="top"><a class="brand" href="/dashboard">🛡️ Sentinel</a><span class="sp"></span>${session ? `<span class="user">${session.user.avatar ? `<img src="${esc(session.user.avatar)}" alt="">` : ''}<span class="name">${esc(session.user.username)}</span><a href="/auth/logout" title="Log out">⏻</a></span>` : ''}</div>
${guild ? `<div class="mnav">${nav}</div>` : ''}
<div class="wrap">${guild ? `<nav class="side"><div class="g">${guild.iconURL?.() ? `<img src="${esc(guild.iconURL({ size: 64 }))}" alt="">` : ''}<span>${esc(guild.name)}</span></div>${nav}<a href="/dashboard" style="margin-top:12px">← All servers</a></nav>` : ''}<main>${body}</main></div></body></html>`;
}

const saved = (q) => (q ? '<div class="ok">✅ Settings saved.</div>' : '');
const result = (r) => (r ? `<div class="${r.ok ? 'ok' : 'err'}" style="margin-bottom:16px">${r.ok ? '✅' : '❌'} ${esc(r.text)}</div>` : '');
const csrf = (s) => `<input type="hidden" name="_csrf" value="${esc(s.csrf)}">`;
const chanSelect = (name, channels, current, allowNone = true) =>
  `<select name="${name}">${allowNone ? '<option value="">— disabled —</option>' : ''}${channels.map((c) => `<option value="${c.id}" ${c.id === current ? 'selected' : ''}># ${esc(c.name)}</option>`).join('')}</select>`;
const multi = (name, items, current, label = (i) => i.name) =>
  `<select name="${name}" multiple>${items.map((i) => `<option value="${i.id}" ${current.includes(i.id) ? 'selected' : ''}>${esc(label(i))}</option>`).join('')}</select><small style="color:var(--muted)">Ctrl/Cmd-click to select several</small>`;
const check = (name, on, label, hint) => `<div class="tog"><input type="checkbox" id="${name}" name="${name}" ${on ? 'checked' : ''}><label for="${name}" style="margin:0;text-transform:none;font-size:15px;color:var(--fg);font-weight:500">${label}${hint ? `<small>${hint}</small>` : ''}</label></div>`;
const when = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC';

const ACTIONS = ['kick', 'timeout', 'none'];
const actSel = (name, cur, labels = { kick: 'Kick', timeout: 'Timeout', none: 'Log only' }) => `<select name="${name}">${ACTIONS.map((a) => `<option value="${a}" ${cur === a ? 'selected' : ''}>${labels[a]}</option>`).join('')}</select>`;

module.exports = {
  status: ({ session, ready, guilds, members, uptime, ping, memoryMb, storage, errors, cases }) => layout({ title: 'Status', session, body: `<h1>Bot status</h1><p class="sub">Public page — no login needed.</p>
<div class="grid">
<div class="stat"><b style="color:${ready ? 'var(--green)' : 'var(--red)'}">${ready ? 'Online' : 'Offline'}</b><span>Discord connection</span></div>
<div class="stat"><b>${guilds}</b><span>Servers</span></div>
<div class="stat"><b>${members.toLocaleString()}</b><span>Members (total)</span></div>
<div class="stat"><b>${cases.toLocaleString()}</b><span>Cases stored</span></div>
<div class="stat"><b>${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m</b><span>Uptime</span></div>
<div class="stat"><b>${ping ?? '–'} ms</b><span>Gateway ping</span></div>
<div class="stat"><b>${memoryMb} MB</b><span>Memory</span></div>
<div class="stat"><b style="font-size:16px">${esc(storage)}</b><span>Storage</span></div>
</div>
<h2>Recent errors (${errors.length})</h2><div class="card">${errors.length ? errors.slice(0, 20).map((e) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><small style="color:var(--muted)">${esc(e.at)}</small><br><code style="white-space:pre-wrap">${esc(e.text)}</code></div>`).join('') : '<p class="sub" style="margin:0">No errors since the last restart. 🎉</p>'}</div>` }),

  protection: ({ session, guild, settings, page, channels, categories, savedFlag }) => {
    const a = settings.antiraid;
    const raidOn = a.raidActive && new Date(a.raidActive) > Date.now();
    return layout({ title: 'Protection', session, guild, page, body: `<h1>Protection</h1><p class="sub">Anti-raid, reports, tickets, appeals and warning expiry.</p>${saved(savedFlag)}
${raidOn ? '<div class="err">🚨 Raid mode is currently <b>active</b>. Tick "End raid mode now" and save to stop it.</div>' : ''}${settings.lockdown ? `<div class="err">🔒 A lockdown is active (${settings.lockdown.channels.length} channels). Use <code>/lockdown end</code> in Discord to lift it.</div>` : ''}
<form method="post">${csrf(session)}
<h2>Anti-raid</h2><div class="card">
${check('arEnabled', a.enabled, 'Anti-raid enabled')}
<div class="row"><div><label>Raid = this many joins within 60 s (0 = off)</label><input type="number" name="joinsPerMinute" min="0" max="200" value="${a.joinsPerMinute}"></div><div><label>Raid mode lasts (minutes)</label><input type="number" name="raidMinutes" min="1" max="120" value="${a.raidMinutes}"></div></div>
<label>What happens to accounts that join during a raid</label>${actSel('raidAction', a.raidAction)}
<div class="row"><div><label>Minimum account age in days (0 = off)</label><input type="number" name="minAccountAgeDays" min="0" max="365" value="${a.minAccountAgeDays}"></div><div><label>Action for younger accounts</label>${actSel('youngAction', a.youngAction, { kick: 'Kick', timeout: 'Timeout 24h', none: 'Log only' })}</div></div>
${raidOn ? check('endRaid', false, 'End raid mode now') : ''}
</div>
<h2>Reports &amp; appeals</h2><div class="card">
<label>Report channel (where /report and right-click reports land)</label>${chanSelect('reportChannel', channels, settings.reportChannel).replace('— disabled —', '— use the mod log —')}
<label>Appeal link (shown in ban/kick DMs)</label><input type="text" name="appealUrl" placeholder="https://forms.gle/… or a Discord invite" value="${esc(settings.appealUrl || '')}">
<label>Warnings expire after (days, 0 = never)</label><input type="number" name="warnExpiryDays" min="0" max="365" value="${settings.warnExpiryDays}">
</div>
<h2>Tickets</h2><div class="card">
${check('ticketsEnabled', settings.tickets.enabled, 'Tickets enabled', 'Post the panel with /ticket panel in Discord')}
<label>Category for ticket channels</label><select name="ticketCategory"><option value="">— none —</option>${categories.map((c) => `<option value="${c.id}" ${settings.tickets.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
<p class="sub" style="margin:10px 0 0">Open tickets: ${Object.keys(settings.tickets.open).length}</p>
</div>
<p><button>Save</button></p></form>` });
  },

  stats: ({ session, guild, page, days, mods, byType, byDay, topUsers, total }) => {
    const max = Math.max(1, ...Object.values(byDay));
    const bars = Object.entries(byDay).map(([d, n]) => `<div title="${d}: ${n}" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:120px"><div style="height:${Math.round((n / max) * 100)}%;background:var(--accent);border-radius:3px 3px 0 0;min-height:${n ? 3 : 0}px"></div></div>`).join('');
    return layout({ title: 'Stats', session, guild, page, body: `<h1>Moderation stats</h1><p class="sub">${total} case(s) in the last ${days} days · <a href="?days=7">7d</a> · <a href="?days=30">30d</a> · <a href="?days=90">90d</a></p>
<div class="card"><div style="display:flex;gap:2px;align-items:flex-end">${bars}</div><small style="color:var(--muted)">Cases per day</small></div>
<div class="row"><div class="card"><h2 style="margin-top:0">By type</h2>${Object.entries(byType).sort((x, y) => y[1] - x[1]).map(([t, n]) => `<div class="tog"><span class="tag ${t}">${ICON[t] || ''} ${t}</span><span class="sp" style="flex:1"></span><b>${n}</b></div>`).join('') || '<p class="sub">Nothing yet.</p>'}</div>
<div class="card"><h2 style="margin-top:0">Most cases (users)</h2>${topUsers.map((u) => `<div class="tog"><span>${esc(u.tag)} <small style="color:var(--muted)">${u.id}</small></span><span style="flex:1"></span><b>${u.n}</b></div>`).join('') || '<p class="sub">Nothing yet.</p>'}</div></div>
<h2>Moderators</h2><div class="card">${mods.length ? `<table><tr><th>Moderator</th><th>Total</th><th>Breakdown</th></tr>${mods.map((m) => `<tr><td>${esc(m.tag)}<br><small style="color:var(--muted)">${m.id}</small></td><td><b>${m.total}</b></td><td>${Object.entries(m.types).map(([t, n]) => `<span class="tag ${t}">${t} ${n}</span>`).join(' ')}</td></tr>`).join('')}</table>` : '<p class="sub" style="margin:0">No cases in this period.</p>'}</div>` });
  },

  moderate: ({ session, guild, page, q, target, notFound, bans, timedOut, result: r }) => {
    const t = target;
    const act = (action, label, cls = 'sec', extra = '') => `<form method="post" style="display:inline-block;margin:4px 6px 4px 0">${csrf(session)}<input type="hidden" name="action" value="${action}"><input type="hidden" name="userId" value="${t.id}"><input type="hidden" name="reason" value="" class="rsn">${extra}<button class="${cls}">${label}</button></form>`;
    return layout({ title: 'Moderate', session, guild, page, body: `<h1>Moderate</h1><p class="sub">Look up a member and act on them. Everything creates a case and DMs the user, exactly like the slash commands.</p>${result(r)}
<form method="get" class="card" style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><div style="flex:1;min-width:220px"><label>User ID or exact username</label><input type="text" name="user" value="${esc(q)}" placeholder="123456789012345678"></div><button>Look up</button></form>
${notFound ? '<div class="err">No user found. Use the numeric ID (Developer Mode → right-click → Copy User ID).</div>' : ''}
${t ? `<div class="row"><div class="card"><div style="display:flex;gap:12px;align-items:center"><img src="${esc(t.avatar)}" style="width:56px;height:56px;border-radius:50%"><div><b style="font-size:18px">${esc(t.tag)}</b><br><small style="color:var(--muted)">${t.id}</small></div></div>
<label>Status</label>${t.banned ? '<span class="tag ban">banned</span> ' : ''}${t.inGuild ? '<span class="tag unban">in server</span>' : '<span class="tag">not in server</span>'} ${t.timedOut ? `<span class="tag timeout">timed out until ${when(t.timedOut)}</span>` : ''}
<label>Account created</label>${when(t.createdAt)}${t.joinedAt ? `<label>Joined</label>${when(t.joinedAt)}` : ''}
<label>Roles</label>${t.roles.map((n) => `<span class="tag">${esc(n)}</span>`).join(' ') || '—'}
<label>Active warnings</label>${t.warnings}
</div>
<div class="card"><h2 style="margin-top:0">Actions</h2>
<label>Reason (applied to whichever button you press)</label><input type="text" id="reason" placeholder="Reason shown to the user and in the log" oninput="document.querySelectorAll('.rsn').forEach(i=>i.value=this.value)">
<label>Timeout duration</label><input type="text" id="dur" value="1h" oninput="document.querySelectorAll('.dur').forEach(i=>i.value=this.value)" style="max-width:120px">
<div style="margin-top:12px">
${t.inGuild ? act('warn', '⚠️ Warn') : ''}${t.inGuild && !t.timedOut ? act('timeout', '🔇 Timeout', 'sec', '<input type="hidden" name="duration" value="1h" class="dur">') : ''}${t.timedOut ? act('untimeout', '🔊 Remove timeout') : ''}
${t.inGuild ? act('kick', '👢 Kick', 'danger') : ''}${!t.banned ? act('ban', '🔨 Ban', 'danger') : act('unban', '🔓 Unban')}
</div></div></div>
<h2>History (${t.cases.length})</h2><div class="card">${t.cases.length ? `<table><tr><th>#</th><th>Type</th><th>Reason</th><th>Moderator</th><th>When</th></tr>${t.cases.slice(0, 25).map((c) => `<tr><td><a href="/dashboard/${guild.id}/cases/${c.id}">#${c.id}</a></td><td><span class="tag ${c.type}">${c.type}${c.type === 'warn' && !c.active ? ' (cleared)' : ''}</span></td><td>${esc(c.reason.slice(0, 80))}</td><td>${esc(c.modTag)}</td><td>${when(c.createdAt)}</td></tr>`).join('')}</table>` : '<p class="sub" style="margin:0">No cases.</p>'}</div>` : ''}
<div class="row"><div class="card"><h2 style="margin-top:0">Active bans (${bans.length})</h2>${bans.length ? bans.map((b) => `<div class="tog"><span>${esc(b.tag)}<br><small style="color:var(--muted)">${esc(b.reason || 'no reason')}</small></span><span style="flex:1"></span><form method="post">${csrf(session)}<input type="hidden" name="action" value="unban"><input type="hidden" name="userId" value="${b.id}"><input type="hidden" name="reason" value="Unbanned via dashboard"><button class="sec">Unban</button></form></div>`).join('') : '<p class="sub" style="margin:0">None.</p>'}</div>
<div class="card"><h2 style="margin-top:0">Timed out (${timedOut.length})</h2>${timedOut.length ? timedOut.map((m) => `<div class="tog"><span>${esc(m.tag)}<br><small style="color:var(--muted)">until ${when(m.until)}</small></span><span style="flex:1"></span><form method="post">${csrf(session)}<input type="hidden" name="action" value="untimeout"><input type="hidden" name="userId" value="${m.id}"><input type="hidden" name="reason" value="Removed via dashboard"><button class="sec">Remove</button></form></div>`).join('') : '<p class="sub" style="margin:0">None (only cached members are listed).</p>'}</div></div>` });
  },

  channels: ({ session, guild, settings, page, list, result: r }) => layout({ title: 'Channels', session, guild, page, body: `<h1>Channels</h1><p class="sub">Slowmode, lock/unlock and purge per channel, plus server-wide lockdown.</p>${result(r)}
<div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>Server lockdown:</b> ${settings.lockdown ? `<span class="tag ban">active — ${settings.lockdown.channels.length} channels</span><form method="post">${csrf(session)}<input type="hidden" name="action" value="lockdown_end"><button class="sec">🔓 End lockdown</button></form>` : `<span class="tag unban">off</span><form method="post" style="display:flex;gap:8px">${csrf(session)}<input type="hidden" name="action" value="lockdown_start"><input type="text" name="reason" placeholder="reason" style="max-width:220px"><button class="danger" onclick="return confirm('Lock every text channel?')">🔒 Lock all channels</button></form>`}</div>
<div class="card"><table><tr><th>Channel</th><th>Slowmode</th><th>Lock</th><th>Purge</th></tr>${list.map((c) => `<tr><td><b>#${esc(c.name)}</b>${c.parent ? `<br><small style="color:var(--muted)">${esc(c.parent)}</small>` : ''}</td>
<td><form method="post" style="display:flex;gap:6px">${csrf(session)}<input type="hidden" name="action" value="slowmode"><input type="hidden" name="channelId" value="${c.id}"><input type="text" name="slowmode" value="${c.slowmode ? c.slowmode + 's' : '0'}" style="max-width:80px"><button class="sec">Set</button></form></td>
<td><form method="post">${csrf(session)}<input type="hidden" name="action" value="${c.locked ? 'unlock' : 'lock'}"><input type="hidden" name="channelId" value="${c.id}"><button class="${c.locked ? 'sec' : 'sec'}">${c.locked ? '🔓 Unlock' : '🔒 Lock'}</button></form></td>
<td><form method="post" style="display:flex;gap:6px">${csrf(session)}<input type="hidden" name="action" value="purge"><input type="hidden" name="channelId" value="${c.id}"><input type="number" name="amount" min="1" max="100" value="10" style="max-width:70px"><button class="danger" onclick="return confirm('Delete the last messages in #${esc(c.name)}?')">Purge</button></form></td></tr>`).join('')}</table></div>` }),

  tools: ({ session, guild, settings, page, channels, roles, categories, openTickets, result: r }) => layout({ title: 'Tools', session, guild, page, body: `<h1>Tools</h1><p class="sub">Post panels and messages as the bot, manage open tickets.</p>${result(r)}
<div class="row">
<form method="post" class="card">${csrf(session)}<input type="hidden" name="action" value="selfroles"><h2 style="margin-top:0">Self-roles panel</h2><label>Channel</label>${chanSelect('channelId', channels, null, false)}<label>Title</label><input type="text" name="title" value="Pick your roles"><label>Description</label><input type="text" name="description" value="Click a button to add or remove the role."><label>Roles (up to 5)</label>${multi('roles', roles, [])}<p><button>Post panel</button></p></form>
<form method="post" class="card">${csrf(session)}<input type="hidden" name="action" value="ticketpanel"><h2 style="margin-top:0">Ticket panel</h2><label>Channel</label>${chanSelect('channelId', channels, null, false)}<label>Category for ticket channels</label><select name="categoryId"><option value="">— none —</option>${categories.map((c) => `<option value="${c.id}" ${settings.tickets.categoryId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select><p><button>Post panel</button></p>
<h2>Open tickets (${openTickets.length})</h2>${openTickets.length ? openTickets.map((t) => `<div class="tog"><span>#${esc(t.name)}<br><small style="color:var(--muted)">user ${t.userId}</small></span><span style="flex:1"></span></div><form method="post" style="margin:-8px 0 8px">${csrf(session)}<input type="hidden" name="action" value="closeticket"><input type="hidden" name="ticketChannel" value="${t.channelId}"><button class="sec">Close</button></form>`).join('') : '<p class="sub" style="margin:0">None.</p>'}</form>
</div>
<div class="row">
<form method="post" class="card">${csrf(session)}<input type="hidden" name="action" value="say"><h2 style="margin-top:0">Send a message as the bot</h2><label>Channel</label>${chanSelect('channelId', channels, null, false)}<label>Message</label><textarea name="text" placeholder="Announcement text…"></textarea>${check('asEmbed', false, 'Send as an embed')}<p><button>Send</button></p></form>
<form method="post" class="card">${csrf(session)}<input type="hidden" name="action" value="testwelcome"><h2 style="margin-top:0">Test welcome message</h2><p class="sub">Sends the welcome message to ${settings.welcome.channelId ? '#' + esc(channels.find((c) => c.id === settings.welcome.channelId)?.name || settings.welcome.channelId) : 'the welcome channel (not set)'} using you as the new member.</p><p><button class="sec">Send test</button></p></form>
</div>` }),

  landing: ({ botName, avatar }) => layout({ title: 'Login', body: `<div class="center hero">${avatar ? `<img src="${esc(avatar)}" alt="">` : '<div class="gl"><div class="ph" style="width:104px;height:104px;border-radius:28px;font-size:44px;margin-bottom:16px">🛡️</div></div>'}<h1>${esc(botName)}</h1><p class="sub" style="margin:0 0 6px">Moderation, logging, automod and anti-raid — all configurable from one place.</p><a class="btn" href="/auth/login">Login with Discord</a><p class="sub" style="margin-top:14px;font-size:13px">You need <b>Manage Server</b> in a server the bot is in.</p>
<div class="feat"><div><b>🔨 Moderate</b>Warn, timeout, kick, ban with numbered cases</div><div><b>📜 Logs</b>Messages, members, server, voice</div><div><b>🤖 Automod</b>Filters with escalating punishments</div><div><b>🛡️ Anti-raid</b>Join floods and young accounts</div><div><b>🎫 Tickets</b>Private support channels</div><div><b>📈 Stats</b>Per-moderator activity</div></div></div>` }),

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

  cases: ({ session, guild, page, list, total, page: pg, pages, q, type, deleted }) => layout({ title: 'Cases', session, guild, page, body: `<h1>Cases</h1><p class="sub">${total} case(s) · <a href="/dashboard/${guild.id}/cases/export.csv">Export CSV</a> · <a href="/dashboard/${guild.id}/cases/export.json">Export JSON</a></p>${deleted ? `<div class="ok">🗑️ Case #${esc(deleted)} deleted.</div>` : ''}
<form method="get" class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><div style="flex:2;min-width:200px"><label>Search (user, ID, reason, case #)</label><input type="text" name="q" value="${esc(q)}"></div><div style="flex:1;min-width:140px"><label>Type</label><select name="type"><option value="">All</option>${Object.keys(ICON).map((t) => `<option ${type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><button class="sec">Filter</button></form>
<div class="card">${list.length ? `<table><tr><th>#</th><th>Type</th><th>User</th><th>Moderator</th><th>Reason</th><th>When</th></tr>${list.map((c) => `<tr><td><a href="/dashboard/${guild.id}/cases/${c.id}">#${c.id}</a></td><td><span class="tag ${c.type}">${ICON[c.type] || ''} ${c.type}${c.type === 'warn' && !c.active ? ' (cleared)' : ''}</span></td><td>${esc(c.userTag)}<br><small style="color:var(--muted)">${c.userId}</small></td><td>${esc(c.modTag)}</td><td>${esc(c.reason.slice(0, 90))}</td><td>${when(c.createdAt)}</td></tr>`).join('')}</table>` : '<p class="sub" style="margin:0">Nothing matches.</p>'}
<div class="pag">${pg > 1 ? `<a class="btn sec" href="?q=${encodeURIComponent(q)}&type=${type}&page=${pg - 1}">← Prev</a>` : ''}<span>Page ${pg} / ${pages}</span>${pg < pages ? `<a class="btn sec" href="?q=${encodeURIComponent(q)}&type=${type}&page=${pg + 1}">Next →</a>` : ''}</div></div>` }),

  caseDetail: ({ session, guild, page, c, history, savedFlag }) => layout({ title: `Case #${c.id}`, session, guild, page, body: `<p><a href="/dashboard/${guild.id}/cases">← All cases</a></p>${saved(savedFlag)}<h1>${ICON[c.type] || ''} Case #${c.id} <span class="tag ${c.type}">${c.type}${c.active === false && c.type === 'warn' ? ' (cleared)' : ''}</span></h1>
<div class="row"><div class="card"><label>User</label>${esc(c.userTag)} <small style="color:var(--muted)">${c.userId}</small><label>Moderator</label>${esc(c.modTag)}<label>When</label>${when(c.createdAt)}${c.expiresAt ? `<label>Expires</label>${when(c.expiresAt)}` : ''}
<form method="post">${csrf(session)}<input type="hidden" name="action" value="reason"><label>Reason</label><textarea name="reason">${esc(c.reason)}</textarea><p><button>Update reason</button> ${c.type === 'warn' && c.active ? `<button name="action" value="clear" class="danger" formnovalidate>Clear warning</button>` : ''} <button name="action" value="delete" class="sec" formnovalidate onclick="return confirm('Delete case #${c.id} permanently?')">Delete case</button></p></form></div>
<div class="card"><h2 style="margin-top:0">User history (${history.length})</h2>${history.map((h) => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><a href="/dashboard/${guild.id}/cases/${h.id}">#${h.id}</a> <span class="tag ${h.type}">${h.type}</span> ${esc(h.reason.slice(0, 60))}<br><small style="color:var(--muted)">${when(h.createdAt)}</small></div>`).join('')}</div></div>` }),
};
