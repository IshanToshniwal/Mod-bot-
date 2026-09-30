const { EmbedBuilder, AuditLogEvent, Events } = require('discord.js');
const store = require('../lib/store');
const logger = require('../lib/logger');
const cases = require('../lib/cases');
const { COLORS, full, rel, formatDuration } = require('../lib/util');
const { fmtWelcome } = require('../commands/config');

module.exports = [
  {
    name: Events.GuildMemberAdd,
    async execute(client, member) {
      const g = store.guild(member.guild.id);
      // welcome
      if (g.welcome.enabled && g.welcome.channelId) {
        const ch = member.guild.channels.cache.get(g.welcome.channelId);
        if (ch) await ch.send({ content: fmtWelcome(g.welcome.message, member), allowedMentions: { users: [member.id] } }).catch(() => null);
      }
      // auto-role
      if (g.autoRole) await member.roles.add(g.autoRole, 'Auto-role').catch(() => null);
      // log
      const ageDays = (Date.now() - member.user.createdTimestamp) / 86400e3;
      const e = new EmbedBuilder()
        .setColor(COLORS.success)
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setTitle('📥 Member joined')
        .setDescription(`${member} · ${member.id}`)
        .addFields(
          { name: 'Account created', value: `${full(member.user.createdAt)} (${rel(member.user.createdAt)})`, inline: true },
          { name: 'Member count', value: String(member.guild.memberCount), inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setTimestamp();
      if (ageDays < 7) e.addFields({ name: '⚠️ New account', value: `Created ${Math.floor(ageDays)} day(s) ago` });
      const history = cases.forUser(member.guild.id, member.id);
      if (history.length) e.addFields({ name: '📋 Prior history', value: `${history.length} case(s) on record` });
      await logger.log(member.guild, 'members', e);
    },
  },
  {
    name: Events.GuildMemberRemove,
    async execute(client, member) {
      const g = store.guild(member.guild.id);
      if (g.leave.enabled && g.leave.channelId) {
        const ch = member.guild.channels.cache.get(g.leave.channelId);
        if (ch) await ch.send({ content: fmtWelcome(g.leave.message, member), allowedMentions: { parse: [] } }).catch(() => null);
      }
      // Was it a kick? (audit log)
      const kick = await logger.findExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
      if (kick?.executor && kick.executor.id !== client.user.id) {
        await cases.create({ guild: member.guild, type: 'kick', user: member.user, moderator: kick.executor, reason: kick.reason || 'No reason provided (kicked manually)' });
      }
      const e = new EmbedBuilder()
        .setColor(COLORS.error)
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setTitle(kick?.executor ? '👢 Member kicked' : '📤 Member left')
        .setDescription(`${member.user} · ${member.id}`)
        .addFields(
          { name: 'Joined', value: member.joinedAt ? `${full(member.joinedAt)} (${rel(member.joinedAt)})` : 'Unknown', inline: true },
          { name: 'Roles', value: member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => `${r}`).join(' ').slice(0, 1024) || 'None' }
        )
        .setTimestamp();
      if (kick?.executor) e.addFields({ name: 'Kicked by', value: `${kick.executor}`, inline: true }, { name: 'Reason', value: kick.reason || 'None', inline: true });
      await logger.log(member.guild, 'members', e);
    },
  },
  {
    name: Events.GuildMemberUpdate,
    async execute(client, oldM, newM) {
      const fields = [];
      if (oldM.nickname !== newM.nickname) fields.push({ name: '📛 Nickname', value: `${oldM.nickname ?? '*none*'} → ${newM.nickname ?? '*none*'}` });
      const added = newM.roles.cache.filter((r) => !oldM.roles.cache.has(r.id));
      const removed = oldM.roles.cache.filter((r) => !newM.roles.cache.has(r.id));
      if (added.size) fields.push({ name: '➕ Roles added', value: added.map((r) => `${r}`).join(' ') });
      if (removed.size) fields.push({ name: '➖ Roles removed', value: removed.map((r) => `${r}`).join(' ') });
      const oldTo = oldM.communicationDisabledUntilTimestamp || 0;
      const newTo = newM.communicationDisabledUntilTimestamp || 0;
      if (newTo > Date.now() && newTo !== oldTo) {
        const who = await logger.findExecutor(newM.guild, AuditLogEvent.MemberUpdate, newM.id);
        if (who?.executor && who.executor.id !== client.user.id) {
          await cases.create({ guild: newM.guild, type: 'timeout', user: newM.user, moderator: who.executor, reason: who.reason || 'Timed out manually', durationMs: newTo - Date.now() });
        }
        fields.push({ name: '🔇 Timed out', value: `until ${full(newTo)} (${formatDuration(newTo - Date.now())})` });
      } else if (oldTo > Date.now() && !newTo) fields.push({ name: '🔊 Timeout removed', value: '—' });
      if (!fields.length) return;
      const who = await logger.findExecutor(newM.guild, AuditLogEvent.MemberUpdate, newM.id) || await logger.findExecutor(newM.guild, AuditLogEvent.MemberRoleUpdate, newM.id);
      const e = new EmbedBuilder().setColor(COLORS.info).setAuthor({ name: newM.user.tag, iconURL: newM.user.displayAvatarURL() }).setTitle('👤 Member updated').setDescription(`${newM} · ${newM.id}`).addFields(fields).setTimestamp();
      if (who?.executor && who.executor.id !== newM.id) e.setFooter({ text: `By ${who.executor.tag}` });
      await logger.log(newM.guild, 'members', e);
    },
  },
  {
    name: Events.GuildBanAdd,
    async execute(client, ban) {
      const who = await logger.findExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
      if (who?.executor && who.executor.id !== client.user.id) {
        await cases.create({ guild: ban.guild, type: 'ban', user: ban.user, moderator: who.executor, reason: who.reason || 'No reason provided (banned manually)' });
      }
      await logger.log(ban.guild, 'members', new EmbedBuilder().setColor(COLORS.ban).setAuthor({ name: ban.user.tag, iconURL: ban.user.displayAvatarURL() }).setTitle('🔨 Member banned').setDescription(`${ban.user} · ${ban.user.id}${who?.executor ? `\nBy ${who.executor}` : ''}${who?.reason ? `\n**Reason:** ${who.reason}` : ''}`).setTimestamp());
    },
  },
  {
    name: Events.GuildBanRemove,
    async execute(client, ban) {
      const who = await logger.findExecutor(ban.guild, AuditLogEvent.MemberBanRemove, ban.user.id);
      if (who?.executor && who.executor.id !== client.user.id) {
        for (const c of cases.forUser(ban.guild.id, ban.user.id)) if (c.type === 'ban' || c.type === 'tempban') c.active = false;
        await cases.create({ guild: ban.guild, type: 'unban', user: ban.user, moderator: who.executor, reason: who.reason || 'Unbanned manually' });
      }
      await logger.log(ban.guild, 'members', new EmbedBuilder().setColor(COLORS.unban).setAuthor({ name: ban.user.tag, iconURL: ban.user.displayAvatarURL() }).setTitle('🔓 Member unbanned').setDescription(`${ban.user} · ${ban.user.id}${who?.executor ? `\nBy ${who.executor}` : ''}`).setTimestamp());
    },
  },
];
