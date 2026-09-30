// /logs /config /automod /welcome
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const store = require('../lib/store');
const { COLORS, ok, fail } = require('../lib/util');

const LOG_TYPES = [
  { name: 'Moderation (warns, bans, cases…)', value: 'mod' },
  { name: 'Messages (edits, deletes, purges)', value: 'messages' },
  { name: 'Members (join, leave, nick, roles)', value: 'members' },
  { name: 'Server (channels, roles, emojis)', value: 'server' },
  { name: 'Voice (join, leave, move)', value: 'voice' },
];
const ACTIONS = [{ name: 'Timeout', value: 'timeout' }, { name: 'Kick', value: 'kick' }, { name: 'Ban', value: 'ban' }, { name: 'None (remove step)', value: 'none' }];

function fmtWelcome(tpl, member) {
  return tpl
    .replace(/\{user\}/g, `${member}`)
    .replace(/\{username\}/g, member.user?.username ?? member.username)
    .replace(/\{tag\}/g, member.user?.tag ?? member.tag)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{count\}/g, String(member.guild.memberCount));
}

module.exports = [
  // ---------------------------------------------------------------- /logs
  {
    data: new SlashCommandBuilder().setName('logs').setDescription('Configure log channels').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('set').setDescription('Send a log type to a channel')
        .addStringOption((o) => o.setName('type').setDescription('Log type').setRequired(true).addChoices(...LOG_TYPES))
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
      .addSubcommand((s) => s.setName('all').setDescription('Send every log type to one channel')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
      .addSubcommand((s) => s.setName('disable').setDescription('Disable a log type')
        .addStringOption((o) => o.setName('type').setDescription('Log type').setRequired(true).addChoices(...LOG_TYPES)))
      .addSubcommand((s) => s.setName('view').setDescription('Show current log channels')),
    async execute(interaction) {
      const g = store.guild(interaction.guildId);
      const sub = interaction.options.getSubcommand();
      if (sub === 'set') {
        const type = interaction.options.getString('type');
        const ch = interaction.options.getChannel('channel');
        g.logs[type] = ch.id;
        store.save();
        return interaction.reply(ok(`**${type}** logs → ${ch}`));
      }
      if (sub === 'all') {
        const ch = interaction.options.getChannel('channel');
        for (const t of LOG_TYPES) g.logs[t.value] = ch.id;
        store.save();
        return interaction.reply(ok(`All logs → ${ch}`));
      }
      if (sub === 'disable') {
        delete g.logs[interaction.options.getString('type')];
        store.save();
        return interaction.reply(ok(`Disabled **${interaction.options.getString('type')}** logs.`));
      }
      const e = new EmbedBuilder().setColor(COLORS.info).setTitle('Log channels')
        .setDescription(LOG_TYPES.map((t) => `**${t.value}** — ${g.logs[t.value] ? `<#${g.logs[t.value]}>` : '*disabled*'}`).join('\n'));
      return interaction.reply({ embeds: [e] });
    },
  },
  // ---------------------------------------------------------------- /config
  {
    data: new SlashCommandBuilder().setName('config').setDescription('General bot settings').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('modrole').setDescription('Add/remove a role that bypasses automod and counts as staff')
        .addRoleOption((o) => o.setName('role').setDescription('Role').setRequired(true)))
      .addSubcommand((s) => s.setName('dm').setDescription('Whether punished users get a DM')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Send DMs?').setRequired(true)))
      .addSubcommand((s) => s.setName('autorole').setDescription('Role given to new members (pick none to disable)')
        .addRoleOption((o) => o.setName('role').setDescription('Role')))
      .addSubcommand((s) => s.setName('view').setDescription('Show all settings')),
    async execute(interaction) {
      const g = store.guild(interaction.guildId);
      const sub = interaction.options.getSubcommand();
      if (sub === 'modrole') {
        const role = interaction.options.getRole('role');
        const i = g.modRoles.indexOf(role.id);
        if (i === -1) g.modRoles.push(role.id);
        else g.modRoles.splice(i, 1);
        store.save();
        return interaction.reply(ok(i === -1 ? `Added ${role} as a mod role.` : `Removed ${role} from mod roles.`));
      }
      if (sub === 'dm') {
        g.dmOnPunish = interaction.options.getBoolean('enabled');
        store.save();
        return interaction.reply(ok(`Punishment DMs ${g.dmOnPunish ? 'enabled' : 'disabled'}.`));
      }
      if (sub === 'autorole') {
        const role = interaction.options.getRole('role');
        if (role && role.position >= interaction.guild.members.me.roles.highest.position) return interaction.reply(fail('That role is above my highest role.'));
        g.autoRole = role?.id ?? null;
        store.save();
        return interaction.reply(ok(role ? `New members will get ${role}.` : 'Auto-role disabled.'));
      }
      const a = g.automod;
      const e = new EmbedBuilder().setColor(COLORS.info).setTitle('Sentinel settings').addFields(
        { name: 'Mod roles', value: g.modRoles.map((r) => `<@&${r}>`).join(' ') || 'None (Administrator only)', inline: false },
        { name: 'DM on punish', value: g.dmOnPunish ? 'Yes' : 'No', inline: true },
        { name: 'Auto-role', value: g.autoRole ? `<@&${g.autoRole}>` : 'Off', inline: true },
        { name: 'Cases', value: String(g.cases.length), inline: true },
        { name: 'Automod', value: a.enabled ? `**On** — invites: ${a.antiInvite ? '✅' : '❌'} · links: ${a.antiLink ? '✅' : '❌'} · spam: ${a.antiSpam ? `✅ (${a.spamMessages}/${a.spamSeconds}s)` : '❌'} · mentions: ${a.maxMentions || 'off'} · banned words: ${a.bannedWords.length}` : 'Off' },
        { name: 'Escalation', value: a.escalation.length ? a.escalation.map((s) => `${s.warnings} warnings → ${s.action}${s.minutes ? ` ${s.minutes}m` : ''}`).join('\n') : 'None' },
        { name: 'Welcome', value: g.welcome.enabled ? `<#${g.welcome.channelId}>` : 'Off', inline: true },
        { name: 'Leave', value: g.leave.enabled ? `<#${g.leave.channelId}>` : 'Off', inline: true },
        { name: 'Logs', value: Object.entries(g.logs).map(([k, v]) => `${k}: <#${v}>`).join(' · ') || 'None' }
      );
      return interaction.reply({ embeds: [e] });
    },
  },
  // ---------------------------------------------------------------- /automod
  {
    data: new SlashCommandBuilder().setName('automod').setDescription('Automatic moderation settings').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('toggle').setDescription('Turn automod on or off').addBooleanOption((o) => o.setName('enabled').setDescription('On?').setRequired(true)))
      .addSubcommand((s) => s.setName('filters').setDescription('Enable/disable individual filters')
        .addBooleanOption((o) => o.setName('invites').setDescription('Block Discord invites'))
        .addBooleanOption((o) => o.setName('links').setDescription('Block all links'))
        .addBooleanOption((o) => o.setName('spam').setDescription('Block message spam'))
        .addIntegerOption((o) => o.setName('max_mentions').setDescription('Max mentions per message (0 = off)').setMinValue(0).setMaxValue(50))
        .addIntegerOption((o) => o.setName('spam_messages').setDescription('Messages…').setMinValue(3).setMaxValue(30))
        .addIntegerOption((o) => o.setName('spam_seconds').setDescription('…within seconds').setMinValue(2).setMaxValue(60)))
      .addSubcommand((s) => s.setName('words').setDescription('Add or remove a banned word')
        .addStringOption((o) => o.setName('word').setDescription('Word or phrase').setRequired(true).setMaxLength(50)))
      .addSubcommand((s) => s.setName('ignore').setDescription('Toggle a channel or role that automod ignores')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel'))
        .addRoleOption((o) => o.setName('role').setDescription('Role')))
      .addSubcommand((s) => s.setName('escalation').setDescription('What happens when a user reaches N warnings')
        .addIntegerOption((o) => o.setName('warnings').setDescription('Warning count').setRequired(true).setMinValue(1).setMaxValue(50))
        .addStringOption((o) => o.setName('action').setDescription('Action').setRequired(true).addChoices(...ACTIONS))
        .addIntegerOption((o) => o.setName('minutes').setDescription('Timeout length in minutes (timeout only)').setMinValue(1).setMaxValue(40320)))
      .addSubcommand((s) => s.setName('view').setDescription('Show automod settings')),
    async execute(interaction) {
      const a = store.guild(interaction.guildId).automod;
      const sub = interaction.options.getSubcommand();
      if (sub === 'toggle') {
        a.enabled = interaction.options.getBoolean('enabled');
        store.save();
        return interaction.reply(ok(`Automod ${a.enabled ? 'enabled' : 'disabled'}.`));
      }
      if (sub === 'filters') {
        const o = interaction.options;
        if (o.getBoolean('invites') !== null) a.antiInvite = o.getBoolean('invites');
        if (o.getBoolean('links') !== null) a.antiLink = o.getBoolean('links');
        if (o.getBoolean('spam') !== null) a.antiSpam = o.getBoolean('spam');
        if (o.getInteger('max_mentions') !== null) a.maxMentions = o.getInteger('max_mentions');
        if (o.getInteger('spam_messages') !== null) a.spamMessages = o.getInteger('spam_messages');
        if (o.getInteger('spam_seconds') !== null) a.spamSeconds = o.getInteger('spam_seconds');
        store.save();
        return interaction.reply(ok('Filters updated.'));
      }
      if (sub === 'words') {
        const w = interaction.options.getString('word').toLowerCase().trim();
        const i = a.bannedWords.indexOf(w);
        if (i === -1) a.bannedWords.push(w);
        else a.bannedWords.splice(i, 1);
        store.save();
        return interaction.reply({ ...ok(i === -1 ? `Added ||${w}|| to banned words.` : `Removed ||${w}|| from banned words.`), flags: 64 });
      }
      if (sub === 'ignore') {
        const ch = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('role');
        if (!ch && !role) return interaction.reply(fail('Pick a channel or a role.'));
        const out = [];
        if (ch) {
          const i = a.ignoredChannels.indexOf(ch.id);
          i === -1 ? a.ignoredChannels.push(ch.id) : a.ignoredChannels.splice(i, 1);
          out.push(`${ch} ${i === -1 ? 'is now ignored' : 'is no longer ignored'}`);
        }
        if (role) {
          const i = a.ignoredRoles.indexOf(role.id);
          i === -1 ? a.ignoredRoles.push(role.id) : a.ignoredRoles.splice(i, 1);
          out.push(`${role} ${i === -1 ? 'is now ignored' : 'is no longer ignored'}`);
        }
        store.save();
        return interaction.reply(ok(out.join('; ') + '.'));
      }
      if (sub === 'escalation') {
        const warnings = interaction.options.getInteger('warnings');
        const action = interaction.options.getString('action');
        const minutes = interaction.options.getInteger('minutes') ?? 60;
        a.escalation = a.escalation.filter((s) => s.warnings !== warnings);
        if (action !== 'none') a.escalation.push(action === 'timeout' ? { warnings, action, minutes } : { warnings, action });
        a.escalation.sort((x, y) => x.warnings - y.warnings);
        store.save();
        return interaction.reply(ok(action === 'none' ? `Removed the step at ${warnings} warnings.` : `At **${warnings}** warnings → **${action}**${action === 'timeout' ? ` for ${minutes}m` : ''}.`));
      }
      const e = new EmbedBuilder().setColor(COLORS.info).setTitle(`Automod — ${a.enabled ? 'ON' : 'OFF'}`).addFields(
        { name: 'Invites', value: a.antiInvite ? '✅' : '❌', inline: true },
        { name: 'Links', value: a.antiLink ? '✅' : '❌', inline: true },
        { name: 'Spam', value: a.antiSpam ? `✅ ${a.spamMessages} msgs / ${a.spamSeconds}s` : '❌', inline: true },
        { name: 'Max mentions', value: a.maxMentions ? String(a.maxMentions) : 'off', inline: true },
        { name: 'Banned words', value: a.bannedWords.length ? `${a.bannedWords.length} (use /automod words to manage)` : 'none', inline: true },
        { name: 'Ignored', value: [...a.ignoredChannels.map((c) => `<#${c}>`), ...a.ignoredRoles.map((r) => `<@&${r}>`)].join(' ') || 'none' },
        { name: 'Escalation', value: a.escalation.map((s) => `**${s.warnings}** warnings → ${s.action}${s.minutes ? ` ${s.minutes}m` : ''}`).join('\n') || 'none' }
      );
      return interaction.reply({ embeds: [e] });
    },
  },
  // ---------------------------------------------------------------- /welcome
  {
    data: new SlashCommandBuilder().setName('welcome').setDescription('Welcome and leave messages').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('set').setDescription('Set the welcome channel and message')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName('message').setDescription('Placeholders: {user} {username} {tag} {server} {count}').setMaxLength(500)))
      .addSubcommand((s) => s.setName('leave').setDescription('Set the leave channel and message')
        .addChannelOption((o) => o.setName('channel').setDescription('Channel').setRequired(true).addChannelTypes(ChannelType.GuildText))
        .addStringOption((o) => o.setName('message').setDescription('Placeholders: {username} {tag} {server} {count}').setMaxLength(500)))
      .addSubcommand((s) => s.setName('disable').setDescription('Disable welcome/leave messages')
        .addStringOption((o) => o.setName('which').setDescription('Which').setRequired(true).addChoices({ name: 'Welcome', value: 'welcome' }, { name: 'Leave', value: 'leave' }, { name: 'Both', value: 'both' })))
      .addSubcommand((s) => s.setName('test').setDescription('Preview the welcome message here')),
    async execute(interaction) {
      const g = store.guild(interaction.guildId);
      const sub = interaction.options.getSubcommand();
      if (sub === 'set' || sub === 'leave') {
        const key = sub === 'set' ? 'welcome' : 'leave';
        const ch = interaction.options.getChannel('channel');
        const msg = interaction.options.getString('message');
        g[key].channelId = ch.id;
        if (msg) g[key].message = msg;
        g[key].enabled = true;
        store.save();
        return interaction.reply(ok(`${key === 'welcome' ? 'Welcome' : 'Leave'} messages → ${ch}\nPreview: ${fmtWelcome(g[key].message, interaction.member)}`));
      }
      if (sub === 'disable') {
        const which = interaction.options.getString('which');
        if (which !== 'leave') g.welcome.enabled = false;
        if (which !== 'welcome') g.leave.enabled = false;
        store.save();
        return interaction.reply(ok(`Disabled ${which === 'both' ? 'welcome and leave' : which} messages.`));
      }
      return interaction.reply({ content: fmtWelcome(g.welcome.message, interaction.member), allowedMentions: { parse: [] } });
    },
  },
];

module.exports.fmtWelcome = fmtWelcome;
