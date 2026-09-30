// /warn /timeout /untimeout /kick /ban /tempban /softban /unban
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const store = require('../lib/store');
const cases = require('../lib/cases');
const automod = require('../lib/automod');
const { checkHierarchy, parseDuration, formatDuration, ok, fail } = require('../lib/util');

const reasonOpt = (o) => o.setName('reason').setDescription('Reason (shown to the user and in the log)').setMaxLength(500);
const userOpt = (o) => o.setName('user').setDescription('Target user').setRequired(true);

async function resolveMember(interaction, user) {
  return interaction.guild.members.fetch(user.id).catch(() => null);
}

module.exports = [
  // ---------------------------------------------------------------- warn
  {
    data: new SlashCommandBuilder().setName('warn').setDescription('Warn a user').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(userOpt).addStringOption((o) => reasonOpt(o).setRequired(true)),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const member = await resolveMember(interaction, user);
      if (user.bot) return interaction.reply(fail("You can't warn bots."));
      const err = checkHierarchy(interaction, member);
      if (err) return interaction.reply(fail(err));
      const c = await cases.create({ guild: interaction.guild, type: 'warn', user, moderator: interaction.user, reason });
      const dm = await cases.notify(interaction.guild, user, c);
      const warnings = cases.activeWarnings(interaction.guildId, user.id);
      await interaction.reply(ok(`Warned ${user} — case #${c.id}. They now have **${warnings}** active warning(s).${dm ? '' : ' (DM could not be delivered)'}`));
      if (member) {
        const step = await automod.escalate(interaction.guild, member, warnings, interaction.client.user);
        if (step) await interaction.followUp({ content: `⚡ Escalation triggered: **${step.action}**${step.minutes ? ` (${step.minutes}m)` : ''} at ${warnings} warnings.` });
      }
    },
  },
  // ---------------------------------------------------------------- timeout
  {
    data: new SlashCommandBuilder().setName('timeout').setDescription('Time out a user (mute) for a duration').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(userOpt)
      .addStringOption((o) => o.setName('duration').setDescription('e.g. 10m, 2h, 1d (max 28d)').setRequired(true))
      .addStringOption(reasonOpt),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const ms = parseDuration(interaction.options.getString('duration'));
      const reason = interaction.options.getString('reason');
      if (!ms || ms < 5000 || ms > 28 * 86400e3) return interaction.reply(fail('Duration must be between 5s and 28d, e.g. `10m`, `2h`, `1d`.'));
      const member = await resolveMember(interaction, user);
      if (!member) return interaction.reply(fail('That user is not in this server.'));
      const err = checkHierarchy(interaction, member);
      if (err) return interaction.reply(fail(err));
      if (!member.moderatable) return interaction.reply(fail("I can't time out that user."));
      await member.timeout(ms, `${reason || 'No reason'} — by ${interaction.user.tag}`);
      const c = await cases.create({ guild: interaction.guild, type: 'timeout', user, moderator: interaction.user, reason, durationMs: ms });
      await cases.notify(interaction.guild, user, c);
      return interaction.reply(ok(`Timed out ${user} for **${formatDuration(ms)}** — case #${c.id}.`));
    },
  },
  {
    data: new SlashCommandBuilder().setName('untimeout').setDescription('Remove a timeout').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption(userOpt).addStringOption(reasonOpt),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const member = await resolveMember(interaction, user);
      if (!member?.communicationDisabledUntilTimestamp || member.communicationDisabledUntilTimestamp < Date.now()) return interaction.reply(fail('That user is not timed out.'));
      await member.timeout(null, `Removed by ${interaction.user.tag}`);
      for (const c of cases.forUser(interaction.guildId, user.id)) if (c.type === 'timeout') c.active = false;
      const c = await cases.create({ guild: interaction.guild, type: 'untimeout', user, moderator: interaction.user, reason: interaction.options.getString('reason') });
      return interaction.reply(ok(`Removed timeout from ${user} — case #${c.id}.`));
    },
  },
  // ---------------------------------------------------------------- kick
  {
    data: new SlashCommandBuilder().setName('kick').setDescription('Kick a user from the server').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .addUserOption(userOpt).addStringOption(reasonOpt),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const member = await resolveMember(interaction, user);
      if (!member) return interaction.reply(fail('That user is not in this server.'));
      const err = checkHierarchy(interaction, member);
      if (err) return interaction.reply(fail(err));
      if (!member.kickable) return interaction.reply(fail("I can't kick that user."));
      const c = await cases.create({ guild: interaction.guild, type: 'kick', user, moderator: interaction.user, reason });
      await cases.notify(interaction.guild, user, c); // DM before kicking
      await member.kick(`${reason || 'No reason'} — by ${interaction.user.tag}`);
      return interaction.reply(ok(`Kicked ${user} — case #${c.id}.`));
    },
  },
  // ---------------------------------------------------------------- ban / tempban / softban / unban
  {
    data: new SlashCommandBuilder().setName('ban').setDescription('Ban a user (works even if they already left)').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption(userOpt).addStringOption(reasonOpt)
      .addStringOption((o) => o.setName('duration').setDescription('Optional: make it temporary, e.g. 7d'))
      .addIntegerOption((o) => o.setName('delete_days').setDescription('Delete their messages from the last N days (0-7)').setMinValue(0).setMaxValue(7)),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const duration = interaction.options.getString('duration');
      const days = interaction.options.getInteger('delete_days') ?? 0;
      const ms = duration ? parseDuration(duration) : null;
      if (duration && !ms) return interaction.reply(fail('Invalid duration. Use e.g. `7d`, `12h`.'));
      const member = await resolveMember(interaction, user);
      const err = checkHierarchy(interaction, member);
      if (err) return interaction.reply(fail(err));
      if (member && !member.bannable) return interaction.reply(fail("I can't ban that user."));
      const c = await cases.create({ guild: interaction.guild, type: ms ? 'tempban' : 'ban', user, moderator: interaction.user, reason, durationMs: ms });
      if (member) await cases.notify(interaction.guild, user, c);
      await interaction.guild.members.ban(user.id, { deleteMessageSeconds: days * 86400, reason: `${reason || 'No reason'} — by ${interaction.user.tag}` });
      return interaction.reply(ok(`Banned ${user}${ms ? ` for **${formatDuration(ms)}**` : ''} — case #${c.id}.`));
    },
  },
  {
    data: new SlashCommandBuilder().setName('softban').setDescription('Ban and immediately unban to wipe recent messages').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addUserOption(userOpt).addStringOption(reasonOpt)
      .addIntegerOption((o) => o.setName('delete_days').setDescription('Delete messages from the last N days (default 1)').setMinValue(1).setMaxValue(7)),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      const days = interaction.options.getInteger('delete_days') ?? 1;
      const member = await resolveMember(interaction, user);
      if (!member) return interaction.reply(fail('That user is not in this server.'));
      const err = checkHierarchy(interaction, member);
      if (err) return interaction.reply(fail(err));
      if (!member.bannable) return interaction.reply(fail("I can't ban that user."));
      const c = await cases.create({ guild: interaction.guild, type: 'softban', user, moderator: interaction.user, reason });
      await cases.notify(interaction.guild, user, c);
      await interaction.guild.members.ban(user.id, { deleteMessageSeconds: days * 86400, reason: `Softban: ${reason || 'No reason'} — by ${interaction.user.tag}` });
      await interaction.guild.members.unban(user.id, 'Softban');
      return interaction.reply(ok(`Softbanned ${user} — case #${c.id}.`));
    },
  },
  {
    data: new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .addStringOption((o) => o.setName('user_id').setDescription('The user ID').setRequired(true)).addStringOption(reasonOpt),
    async execute(interaction) {
      const id = interaction.options.getString('user_id').trim();
      if (!/^\d{15,22}$/.test(id)) return interaction.reply(fail('That does not look like a user ID.'));
      const ban = await interaction.guild.bans.fetch(id).catch(() => null);
      if (!ban) return interaction.reply(fail('That user is not banned.'));
      await interaction.guild.members.unban(id, `${interaction.options.getString('reason') || 'No reason'} — by ${interaction.user.tag}`);
      for (const c of cases.forUser(interaction.guildId, id)) if (c.type === 'ban' || c.type === 'tempban') c.active = false;
      const c = await cases.create({ guild: interaction.guild, type: 'unban', user: ban.user, moderator: interaction.user, reason: interaction.options.getString('reason') });
      return interaction.reply(ok(`Unbanned **${ban.user.tag}** — case #${c.id}.`));
    },
  },
];
