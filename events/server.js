const { EmbedBuilder, AuditLogEvent, Events, ChannelType } = require('discord.js');
const logger = require('../lib/logger');
const { COLORS } = require('../lib/util');

const TYPE = { [ChannelType.GuildText]: 'text', [ChannelType.GuildVoice]: 'voice', [ChannelType.GuildCategory]: 'category', [ChannelType.GuildAnnouncement]: 'announcement', [ChannelType.GuildForum]: 'forum', [ChannelType.GuildStageVoice]: 'stage' };

async function simple(guild, type, color, title, description, auditType, targetId) {
  const who = auditType ? await logger.findExecutor(guild, auditType, targetId) : null;
  const e = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
  if (who?.executor) e.setFooter({ text: `By ${who.executor.tag}`, iconURL: who.executor.displayAvatarURL() });
  await logger.log(guild, type, e);
}

module.exports = [
  {
    name: Events.ChannelCreate,
    execute: (client, ch) => ch.guild && simple(ch.guild, 'server', COLORS.success, '📗 Channel created', `${ch} (${TYPE[ch.type] ?? ch.type}) · ${ch.id}`, AuditLogEvent.ChannelCreate, ch.id),
  },
  {
    name: Events.ChannelDelete,
    execute: (client, ch) => ch.guild && simple(ch.guild, 'server', COLORS.error, '📕 Channel deleted', `#${ch.name} (${TYPE[ch.type] ?? ch.type}) · ${ch.id}`, AuditLogEvent.ChannelDelete, ch.id),
  },
  {
    name: Events.ChannelUpdate,
    async execute(client, oldC, newC) {
      if (!newC.guild) return;
      const changes = [];
      if (oldC.name !== newC.name) changes.push(`**Name:** ${oldC.name} → ${newC.name}`);
      if (oldC.topic !== newC.topic) changes.push(`**Topic:** ${oldC.topic || '*none*'} → ${newC.topic || '*none*'}`);
      if (oldC.nsfw !== newC.nsfw) changes.push(`**NSFW:** ${oldC.nsfw} → ${newC.nsfw}`);
      if (oldC.parentId !== newC.parentId) changes.push(`**Category:** ${oldC.parent?.name ?? 'none'} → ${newC.parent?.name ?? 'none'}`);
      if (!changes.length) return;
      await simple(newC.guild, 'server', COLORS.info, '📘 Channel updated', `${newC}\n${changes.join('\n')}`, AuditLogEvent.ChannelUpdate, newC.id);
    },
  },
  {
    name: Events.GuildRoleCreate,
    execute: (client, role) => simple(role.guild, 'server', COLORS.success, '🎭 Role created', `${role} · ${role.id}`, AuditLogEvent.RoleCreate, role.id),
  },
  {
    name: Events.GuildRoleDelete,
    execute: (client, role) => simple(role.guild, 'server', COLORS.error, '🎭 Role deleted', `**${role.name}** · ${role.id}`, AuditLogEvent.RoleDelete, role.id),
  },
  {
    name: Events.GuildRoleUpdate,
    async execute(client, oldR, newR) {
      const changes = [];
      if (oldR.name !== newR.name) changes.push(`**Name:** ${oldR.name} → ${newR.name}`);
      if (oldR.hexColor !== newR.hexColor) changes.push(`**Color:** ${oldR.hexColor} → ${newR.hexColor}`);
      if (oldR.hoist !== newR.hoist) changes.push(`**Hoisted:** ${oldR.hoist} → ${newR.hoist}`);
      if (oldR.mentionable !== newR.mentionable) changes.push(`**Mentionable:** ${oldR.mentionable} → ${newR.mentionable}`);
      if (!oldR.permissions.equals(newR.permissions)) {
        const added = newR.permissions.missing(oldR.permissions);
        const removed = oldR.permissions.missing(newR.permissions);
        if (added.length) changes.push(`**Permissions added:** ${added.join(', ')}`);
        if (removed.length) changes.push(`**Permissions removed:** ${removed.join(', ')}`);
      }
      if (!changes.length) return;
      await simple(newR.guild, 'server', COLORS.info, '🎭 Role updated', `${newR}\n${changes.join('\n')}`, AuditLogEvent.RoleUpdate, newR.id);
    },
  },
  {
    name: Events.GuildEmojiCreate,
    execute: (client, emoji) => simple(emoji.guild, 'server', COLORS.success, '😀 Emoji created', `${emoji} \`:${emoji.name}:\``, AuditLogEvent.EmojiCreate, emoji.id),
  },
  {
    name: Events.GuildEmojiDelete,
    execute: (client, emoji) => simple(emoji.guild, 'server', COLORS.error, '😶 Emoji deleted', `\`:${emoji.name}:\``, AuditLogEvent.EmojiDelete, emoji.id),
  },
  {
    name: Events.GuildUpdate,
    async execute(client, oldG, newG) {
      const changes = [];
      if (oldG.name !== newG.name) changes.push(`**Name:** ${oldG.name} → ${newG.name}`);
      if (oldG.iconURL() !== newG.iconURL()) changes.push('**Icon changed**');
      if (oldG.ownerId !== newG.ownerId) changes.push(`**Owner:** <@${oldG.ownerId}> → <@${newG.ownerId}>`);
      if (oldG.verificationLevel !== newG.verificationLevel) changes.push(`**Verification level:** ${oldG.verificationLevel} → ${newG.verificationLevel}`);
      if (!changes.length) return;
      await simple(newG, 'server', COLORS.info, '⚙️ Server updated', changes.join('\n'), AuditLogEvent.GuildUpdate, null);
    },
  },
  {
    name: Events.VoiceStateUpdate,
    async execute(client, oldS, newS) {
      const member = newS.member ?? oldS.member;
      if (!member || member.user.bot) return;
      let title, color, desc;
      if (!oldS.channelId && newS.channelId) [title, color, desc] = ['🔊 Joined voice', COLORS.success, `${member} joined ${newS.channel}`];
      else if (oldS.channelId && !newS.channelId) [title, color, desc] = ['🔇 Left voice', COLORS.error, `${member} left ${oldS.channel}`];
      else if (oldS.channelId !== newS.channelId) [title, color, desc] = ['↔️ Moved voice', COLORS.info, `${member}: ${oldS.channel} → ${newS.channel}`];
      else if (oldS.serverMute !== newS.serverMute) [title, color, desc] = [newS.serverMute ? '🙊 Server muted' : '🗣️ Server unmuted', COLORS.warn, `${member} in ${newS.channel}`];
      else if (oldS.serverDeaf !== newS.serverDeaf) [title, color, desc] = [newS.serverDeaf ? '🙉 Server deafened' : '👂 Server undeafened', COLORS.warn, `${member} in ${newS.channel}`];
      else return;
      await logger.log(member.guild, 'voice', new EmbedBuilder().setColor(color).setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() }).setTitle(title).setDescription(desc).setTimestamp());
    },
  },
];
