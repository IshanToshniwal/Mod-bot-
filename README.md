# Sentinel — Discord moderation bot

Moderation with a **case system**, full **server logging**, **automod** with escalating
punishments, and **welcome/leave** messages. Runs on Render's free tier.

## Commands

### Moderation
| Command | Permission | Notes |
|---|---|---|
| `/warn @user reason` | Moderate Members | Creates a case, DMs the user, triggers escalation |
| `/timeout @user duration [reason]` | Moderate Members | `10m`, `2h`, `1d` … up to 28d |
| `/untimeout @user` | Moderate Members | |
| `/kick @user [reason]` | Kick Members | |
| `/ban @user [reason] [duration] [delete_days]` | Ban Members | Works on users who already left. `duration` makes it a temp ban (auto-unban) |
| `/softban @user` | Ban Members | Ban + unban to wipe recent messages |
| `/unban user_id [reason]` | Ban Members | |
| `/purge amount [user] [contains] [bots]` | Manage Messages | Bulk delete with filters; logs a transcript |
| `/slowmode interval` | Manage Channels | `5s`, `2m`, `off` |
| `/lock` / `/unlock` | Manage Channels | |
| `/nick @user [nickname]` | Manage Nicknames | |

### Cases
| Command | What it does |
|---|---|
| `/modlogs @user` | Full history: warns, timeouts, kicks, bans, notes |
| `/warnings @user` | Active warnings only |
| `/clearwarnings @user [case]` | Clear all or one warning |
| `/case number` | View one case |
| `/reason number text` | Edit a case's reason |
| `/note @user text` | Private staff note (no DM, no punishment) |

Every action — including manual kicks/bans/timeouts done through Discord's UI — becomes a
numbered case in the mod log, with the moderator taken from the audit log.

### Info: `/userinfo`, `/serverinfo`, `/help`

### Setup (Manage Server)
| Command | What it does |
|---|---|
| `/logs all #channel` | Send every log type to one channel |
| `/logs set type #channel` | Route one type: **mod**, **messages**, **members**, **server**, **voice** |
| `/logs disable type` / `/logs view` | |
| `/config modrole @role` | Toggle a staff role (bypasses automod) |
| `/config dm true/false` | DM users when punished |
| `/config autorole @role` | Role given on join |
| `/config view` | Everything at a glance |
| `/automod toggle enabled:true` | Turn automod on |
| `/automod filters …` | invites / links / spam / max mentions / spam thresholds |
| `/automod words word` | Add or remove a banned word |
| `/automod ignore #channel / @role` | Automod ignores these |
| `/automod escalation warnings action [minutes]` | e.g. 3 → timeout 60m, 5 → kick, 7 → ban (defaults) |
| `/welcome set #channel [message]` | Placeholders: `{user}` `{username}` `{tag}` `{server}` `{count}` |
| `/welcome leave #channel [message]` / `/welcome disable` / `/welcome test` | |

### What gets logged
- **messages** — deletes (with who deleted it), edits (before/after), bulk purges (transcript file)
- **members** — joins (flags accounts < 7 days old, shows prior cases), leaves, kicks, bans, unbans, nickname & role changes, timeouts
- **server** — channel/role/emoji create/delete/update, server settings, slowmode, lock/unlock
- **voice** — join, leave, move, server mute/deafen
- **mod** — every case

## 1. Discord application

1. <https://discord.com/developers/applications> → **New Application** → **Bot** → **Reset Token** (`DISCORD_TOKEN`).
2. Under **Privileged Gateway Intents** enable **Server Members Intent** and **Message Content Intent** (required for automod and message logs).
3. **General Information** → copy **Application ID** (`CLIENT_ID`).
4. **OAuth2 → URL Generator**: scopes `bot` + `applications.commands`; permissions
   **Administrator** is simplest, otherwise: View Channels, Send Messages, Embed Links, Attach Files,
   Read Message History, Manage Messages, Manage Channels, Manage Roles, Manage Nicknames,
   Kick Members, Ban Members, Moderate Members, **View Audit Log**.
5. Invite the bot and **move its role above** the roles it should moderate.

## 2. Deploy on Render

1. Push this folder to GitHub (or paste the files with the `/` trick).
2. <https://render.com> → **New → Web Service** → connect the repo. `render.yaml` sets the build
   (`npm install && npm run deploy`) and start (`npm start`) commands.
3. Environment variables: `DISCORD_TOKEN`, `CLIENT_ID`, optional `GUILD_ID` (instant commands in one
   server), and `DATA_CHANNEL_ID` (**recommended**, see below).
4. Keep it awake: UptimeRobot HTTP monitor on `https://<service>.onrender.com/health` every 5 min.

### Keeping cases after redeploys (`DATA_CHANNEL_ID`)
Render's free disk is wiped on deploy. Make a private `#bot-data` channel only the bot and admins
can see, copy its ID, set it as `DATA_CHANNEL_ID`. The bot uploads its database there on every
change and restores it on startup.

## 3. First-time setup in Discord
```
/logs all #mod-logs
/config modrole @Moderator
/automod toggle enabled:true
/welcome set #general
```

## Run locally
```bash
npm install
cp .env.example .env   # fill in
npm run deploy && npm start
```
