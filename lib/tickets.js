// Support tickets: a panel button opens a private channel for the user + staff.
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const store = require('./store');
const logger = require('./logger');
const { COLORS } = require('./util');

function panel() {
  return {
    embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle('🎫 Support').setDescription('Need help from the staff? Click the button below to open a private ticket.')],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:open').setLabel('Open ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary))],
  };
}

async function open(interaction) {
  const g = store.guild(interaction.guildId);
  const t = g.tickets;
  const existing = Object.entries(t.open).find(([, uid]) => uid === interaction.user.id);
  if (existing && interaction.guild.channels.cache.has(existing[0])) {
    return interaction.reply({ content: `You already have an open ticket: <#${existing[0]}>`, flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const n = ++t.counter;
  const overwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    { id: interaction.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ...g.modRoles.filter((r) => interaction.guild.roles.cache.has(r)).map((r) => ({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
  ];
  try {
    const ch = await interaction.guild.channels.create({
      name: `ticket-${String(n).padStart(4, '0')}-${interaction.user.username}`.slice(0, 90),
      type: ChannelType.GuildText,
      parent: t.categoryId && interaction.guild.channels.cache.has(t.categoryId) ? t.categoryId : null,
      topic: `Ticket #${n} · opened by ${interaction.user.tag} (${interaction.user.id})`,
      permissionOverwrites: overwrites,
      reason: `Ticket #${n}`,
    });
    t.open[ch.id] = interaction.user.id;
    store.save();
    await ch.send({
      content: `${interaction.user}${g.modRoles.length ? ' ' + g.modRoles.map((r) => `<@&${r}>`).join(' ') : ''}`,
      embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle(`🎫 Ticket #${n}`).setDescription('Describe your issue here. A staff member will be with you shortly.\nStaff can close this ticket with the button or `/ticket close`.')],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger))],
    });
    await logger.log(interaction.guild, 'mod', new EmbedBuilder().setColor(COLORS.info).setTitle(`🎫 Ticket #${n} opened`).setDescription(`${interaction.user} → ${ch}`).setTimestamp());
    return interaction.editReply({ content: `✅ Your ticket is ready: ${ch}` });
  } catch (err) {
    return interaction.editReply({ content: `❌ Could not create the ticket: ${err.message}` });
  }
}

async function close(interaction) {
  const g = store.guild(interaction.guildId);
  const uid = g.tickets.open[interaction.channelId];
  if (!uid) return interaction.reply({ content: '❌ This is not a ticket channel.', flags: MessageFlags.Ephemeral });
  const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) || g.modRoles.some((r) => interaction.member.roles.cache.has(r));
  if (!isStaff && interaction.user.id !== uid) return interaction.reply({ content: '❌ Only staff or the ticket owner can close this.', flags: MessageFlags.Ephemeral });
  await interaction.reply({ content: '🔒 Closing this ticket in 5 seconds… saving transcript.' });
  // transcript
  let transcript = '';
  try {
    const msgs = await interaction.channel.messages.fetch({ limit: 100 });
    transcript = [...msgs.values()].reverse().map((m) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || '[embed/attachment]'}`).join('\n');
  } catch {}
  delete g.tickets.open[interaction.channelId];
  store.save();
  await logger.log(interaction.guild, 'mod', {
    embeds: [new EmbedBuilder().setColor(COLORS.neutral).setTitle(`🎫 Ticket closed — ${interaction.channel.name}`).setDescription(`Opened by <@${uid}> · closed by ${interaction.user}`).setTimestamp()],
    files: transcript ? [{ attachment: Buffer.from(transcript), name: `${interaction.channel.name}.txt` }] : [],
  });
  setTimeout(() => interaction.channel.delete('Ticket closed').catch(() => null), 5000);
}

module.exports = { panel, open, close };
