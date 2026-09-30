const { EmbedBuilder, AuditLogEvent, Events } = require('discord.js');
const logger = require('../lib/logger');
const automod = require('../lib/automod');
const { COLORS, truncate } = require('../lib/util');

module.exports = [
  {
    name: Events.MessageCreate,
    execute: (client, message) => automod.handle(message),
  },
  {
    name: Events.MessageDelete,
    async execute(client, message) {
      if (!message.inGuild() || message.author?.bot) return;
      if (message.partial && !message.author) return; // uncached; nothing to show
      const who = await logger.findExecutor(message.guild, AuditLogEvent.MessageDelete, message.author?.id);
      const e = new EmbedBuilder()
        .setColor(COLORS.error)
        .setAuthor({ name: `${message.author?.tag ?? 'Unknown'}`, iconURL: message.author?.displayAvatarURL() })
        .setTitle('🗑️ Message deleted')
        .setDescription(message.content ? truncate(message.content, 1800) : '*No text content*')
        .addFields({ name: 'Channel', value: `${message.channel}`, inline: true }, { name: 'Author', value: `${message.author ?? 'Unknown'}`, inline: true })
        .setFooter({ text: `Message ID: ${message.id}` })
        .setTimestamp();
      if (who?.executor && who.executor.id !== message.author?.id) e.addFields({ name: 'Deleted by', value: `${who.executor}`, inline: true });
      if (message.attachments.size) e.addFields({ name: 'Attachments', value: message.attachments.map((a) => a.name).join(', ').slice(0, 1024) });
      await logger.log(message.guild, 'messages', e);
    },
  },
  {
    name: Events.MessageBulkDelete,
    async execute(client, messages, channel) {
      if (!channel.guild) return;
      const list = [...messages.values()].reverse().map((m) => `[${new Date(m.createdTimestamp).toISOString().slice(11, 19)}] ${m.author?.tag ?? '?'}: ${m.content || '[no text]'}`).join('\n');
      const e = new EmbedBuilder().setColor(COLORS.purge).setTitle(`🧹 ${messages.size} messages bulk deleted`).addFields({ name: 'Channel', value: `${channel}` }).setTimestamp();
      await logger.log(channel.guild, 'messages', { embeds: [e], files: [{ attachment: Buffer.from(list || 'No cached messages.'), name: `purge-${channel.name}-${Date.now()}.txt` }] });
    },
  },
  {
    name: Events.MessageUpdate,
    async execute(client, oldMsg, newMsg) {
      if (!newMsg.inGuild() || newMsg.author?.bot) return;
      if (oldMsg.partial || oldMsg.content === newMsg.content) return; // embeds loading etc.
      const e = new EmbedBuilder()
        .setColor(COLORS.warn)
        .setAuthor({ name: newMsg.author.tag, iconURL: newMsg.author.displayAvatarURL() })
        .setTitle('✏️ Message edited')
        .addFields(
          { name: 'Before', value: truncate(oldMsg.content || '*empty*', 1000) },
          { name: 'After', value: truncate(newMsg.content || '*empty*', 1000) },
          { name: 'Channel', value: `${newMsg.channel} · [Jump](${newMsg.url})`, inline: true }
        )
        .setFooter({ text: `Author ID: ${newMsg.author.id}` })
        .setTimestamp();
      await logger.log(newMsg.guild, 'messages', e);
    },
  },
];
