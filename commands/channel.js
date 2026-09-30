// /purge /slowmode /lock /unlock /nick /userinfo /serverinfo
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags, ChannelType } = require('discord.js');
const cases = require('../lib/cases');
const logger = require('../lib/logger');
const { COLORS, parseDuration, ok, fail, checkHierarchy, full, rel } = require('../lib/util');

module.exports = [
  {
    data: new SlashCommandBuilder().setName('purge').setDescription('Bulk delete messages in this channel').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addIntegerOption((o) => o.setName('amount').setDescription('How many messages to check (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption((o) => o.setName('user').setDescription('Only delete messages from this user'))
      .addStringOption((o) => o.setName('contains').setDescription('Only delete messages containing this text'))
      .addBooleanOption((o) => o.setName('bots').setDescription('Only delete bot messages')),
    async execute(interaction) {
      const amount = interaction.options.getInteger('amount');
      const user = interaction.options.getUser('user');
      const contains = interaction.options.getString('contains')?.toLowerCase();
      const botsOnly = interaction.options.getBoolean('bots');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const fetched = await interaction.channel.messages.fetch({ limit: amount });
      const cutoff = Date.now() - 14 * 86400e3; // bulk delete only works on messages < 14 days old
      const targets = fetched.filter((m) =>
        m.createdTimestamp > cutoff &&
        (!user || m.author.id === user.id) &&
        (!contains || m.content.toLowerCase().includes(contains)) &&
        (!botsOnly || m.author.bot)
      );
      if (!targets.size) return interaction.editReply({ content: '❌ Nothing to delete (messages older than 14 days cannot be bulk-deleted).' });
      const deleted = await interaction.channel.bulkDelete(targets, true);
      await cases.create({
        guild: interaction.guild, type: 'purge', user: user ?? interaction.user, moderator: interaction.user,
        reason: `Purged ${deleted.size} message(s)${user ? ` from ${user.tag}` : ''}${contains ? ` containing "${contains}"` : ''}`,
        extra: { count: deleted.size, channelId: interaction.channelId },
      });
      return interaction.editReply({ content: `🗑️ Deleted **${deleted.size}** message(s).` });
    },
  },
  {
    data: new SlashCommandBuilder().setName('slowmode').setDescription('Set slowmode for this channel').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addStringOption((o) => o.setName('interval').setDescription('e.g. 5s, 2m, or "off"').setRequired(true)),
    async execute(interaction) {
      const raw = interaction.options.getString('interval').toLowerCase();
      const ms = raw === 'off' || raw === '0' ? 0 : parseDuration(raw);
      if (ms === null || ms > 6 * 3600e3) return interaction.reply(fail('Use a duration up to 6h, e.g. `5s`, `2m`, or `off`.'));
      await interaction.channel.setRateLimitPerUser(Math.round(ms / 1000), `By ${interaction.user.tag}`);
      await logger.log(interaction.guild, 'server', new EmbedBuilder().setColor(COLORS.info).setAuthor({ name: '🐢 Slowmode changed' }).setDescription(`${interaction.channel}: **${ms ? raw : 'off'}** by ${interaction.user}`).setTimestamp());
      return interaction.reply(ok(ms ? `Slowmode set to **${raw}**.` : 'Slowmode disabled.'));
    },
  },
  {
    data: new SlashCommandBuilder().setName('lock').setDescription('Lock this channel (members cannot send messages)').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
      .addStringOption((o) => o.setName('reason').setDescription('Reason')),
    async execute(interaction) {
      const reason = interaction.options.getString('reason') || 'No reason';
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false }, { reason: `Lock: ${reason} — ${interaction.user.tag}` });
      await logger.log(interaction.guild, 'server', new EmbedBuilder().setColor(COLORS.warn).setAuthor({ name: '🔒 Channel locked' }).setDescription(`${interaction.channel} by ${interaction.user}\n**Reason:** ${reason}`).setTimestamp());
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setDescription(`🔒 This channel has been locked.\n**Reason:** ${reason}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('unlock').setDescription('Unlock this channel').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    async execute(interaction) {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null }, { reason: `Unlock — ${interaction.user.tag}` });
      await logger.log(interaction.guild, 'server', new EmbedBuilder().setColor(COLORS.success).setAuthor({ name: '🔓 Channel unlocked' }).setDescription(`${interaction.channel} by ${interaction.user}`).setTimestamp());
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(COLORS.success).setDescription('🔓 This channel has been unlocked.')] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('nick').setDescription("Change or reset a user's nickname").setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption((o) => o.setName('nickname').setDescription('New nickname (leave empty to reset)').setMaxLength(32)),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const nick = interaction.options.getString('nickname');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply(fail('That user is not in this server.'));
      const err = checkHierarchy(interaction, member);
      if (err) return interaction.reply(fail(err));
      await member.setNickname(nick || null, `By ${interaction.user.tag}`);
      return interaction.reply(ok(nick ? `Nickname of ${user} set to **${nick}**.` : `Nickname of ${user} reset.`));
    },
  },
  {
    data: new SlashCommandBuilder().setName('userinfo').setDescription('Info about a user').setDMPermission(false)
      .addUserOption((o) => o.setName('user').setDescription('User (default: you)')),
    async execute(interaction) {
      const user = interaction.options.getUser('user') ?? interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const list = cases.forUser(interaction.guildId, user.id);
      const e = new EmbedBuilder().setColor(member?.displayColor || COLORS.info).setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() }).setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Created', value: `${full(user.createdAt)} (${rel(user.createdAt)})`, inline: true }
        );
      if (member) {
        e.addFields(
          { name: 'Joined', value: `${full(member.joinedAt)} (${rel(member.joinedAt)})`, inline: true },
          { name: `Roles (${member.roles.cache.size - 1})`, value: member.roles.cache.filter((r) => r.id !== interaction.guildId).sort((a, b) => b.position - a.position).map((r) => `${r}`).slice(0, 20).join(' ') || 'None' }
        );
        if (member.communicationDisabledUntilTimestamp > Date.now()) e.addFields({ name: 'Timed out until', value: full(member.communicationDisabledUntilTimestamp) });
      } else e.addFields({ name: 'Member', value: 'Not in this server' });
      e.addFields({ name: 'Mod history', value: `${list.length} case(s) · ${list.filter((c) => c.type === 'warn' && c.active).length} active warning(s)` });
      return interaction.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('serverinfo').setDescription('Info about this server').setDMPermission(false),
    async execute(interaction) {
      const g = interaction.guild;
      const owner = await g.fetchOwner().catch(() => null);
      const channels = g.channels.cache;
      const e = new EmbedBuilder().setColor(COLORS.info).setTitle(g.name).setThumbnail(g.iconURL({ size: 256 }))
        .addFields(
          { name: 'Owner', value: owner ? `${owner.user.tag}` : 'Unknown', inline: true },
          { name: 'Members', value: String(g.memberCount), inline: true },
          { name: 'Created', value: `${full(g.createdAt)} (${rel(g.createdAt)})`, inline: true },
          { name: 'Channels', value: `${channels.filter((c) => c.type === ChannelType.GuildText).size} text · ${channels.filter((c) => c.type === ChannelType.GuildVoice).size} voice · ${channels.filter((c) => c.type === ChannelType.GuildCategory).size} categories`, inline: true },
          { name: 'Roles', value: String(g.roles.cache.size - 1), inline: true },
          { name: 'Boosts', value: `${g.premiumSubscriptionCount ?? 0} (tier ${g.premiumTier})`, inline: true },
          { name: 'ID', value: g.id, inline: true }
        );
      return interaction.reply({ embeds: [e] });
    },
  },
];
