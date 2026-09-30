// /report, "Report message" (right-click), /lockdown, /selfroles, /ticket, /antiraid
const {
  SlashCommandBuilder, ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ChannelType,
} = require('discord.js');
const store = require('../lib/store');
const logger = require('../lib/logger');
const lockdown = require('../lib/lockdown');
const tickets = require('../lib/tickets');
const { modButtons } = require('../lib/actions');
const { COLORS, ok, fail } = require('../lib/util');

async function sendReport(interaction, { user, reason, message = null }) {
  const g = store.guild(interaction.guildId);
  if (user.bot) return interaction.reply(fail("You can't report bots."));
  if (user.id === interaction.user.id) return interaction.reply(fail("You can't report yourself."));
  const e = new EmbedBuilder()
    .setColor(COLORS.warn)
    .setTitle('🚩 New report')
    .addFields(
      { name: 'Reported user', value: `${user} (\`${user.tag}\` · ${user.id})`, inline: true },
      { name: 'Reported by', value: `${interaction.user}`, inline: true },
      { name: 'Reason', value: reason.slice(0, 1024) }
    )
    .setThumbnail(user.displayAvatarURL())
    .setTimestamp();
  if (message) e.addFields({ name: 'Message', value: `${(message.content || '*no text*').slice(0, 900)}\n[Jump to message](${message.url})` }, { name: 'Channel', value: `${message.channel}`, inline: true });
  const row = modButtons(user.id).addComponents(new ButtonBuilder().setCustomId('mod:dismiss').setLabel('Dismiss').setStyle(ButtonStyle.Secondary));
  const target = g.reportChannel ? await interaction.guild.channels.fetch(g.reportChannel).catch(() => null) : null;
  const sent = target ? await target.send({ embeds: [e], components: [row] }).catch(() => null) : await logger.log(interaction.guild, 'mod', { embeds: [e], components: [row] });
  if (!sent) return interaction.reply(fail('Reports are not set up on this server yet (ask an admin to set a report channel or mod log).'));
  return interaction.reply({ content: '✅ Thanks — your report has been sent to the staff.', flags: MessageFlags.Ephemeral });
}

module.exports = [
  // ---------------------------------------------------------------- /report
  {
    data: new SlashCommandBuilder().setName('report').setDescription('Report a user to the staff (private)').setDMPermission(false)
      .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
      .addStringOption((o) => o.setName('reason').setDescription('What happened').setRequired(true).setMaxLength(500)),
    execute: (i) => sendReport(i, { user: i.options.getUser('user'), reason: i.options.getString('reason') }),
  },
  // ---------------------------------------------------------------- right-click → Apps → Report message
  {
    data: new ContextMenuCommandBuilder().setName('Report message').setType(ApplicationCommandType.Message).setDMPermission(false),
    execute: (i) => sendReport(i, { user: i.targetMessage.author, reason: 'Reported via right-click', message: i.targetMessage }),
  },
  // ---------------------------------------------------------------- /lockdown
  {
    data: new SlashCommandBuilder().setName('lockdown').setDescription('Lock or unlock every text channel at once').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('start').setDescription('Lock all channels').addStringOption((o) => o.setName('reason').setDescription('Reason')))
      .addSubcommand((s) => s.setName('end').setDescription('Unlock the channels locked by /lockdown start')),
    async execute(interaction) {
      await interaction.deferReply();
      if (interaction.options.getSubcommand() === 'start') {
        if (store.guild(interaction.guildId).lockdown) return interaction.editReply({ content: '❌ A lockdown is already active. Use `/lockdown end` first.' });
        const n = await lockdown.start(interaction.guild, interaction.user, interaction.options.getString('reason') || 'No reason');
        return interaction.editReply({ content: `🔒 Locked **${n}** channel(s). Run \`/lockdown end\` to lift it.` });
      }
      const n = await lockdown.end(interaction.guild, interaction.user);
      return interaction.editReply({ content: n ? `🔓 Unlocked **${n}** channel(s).` : '❌ No lockdown is active.' });
    },
  },
  // ---------------------------------------------------------------- /selfroles
  {
    data: new SlashCommandBuilder().setName('selfroles').setDescription('Post a panel where members pick their own roles').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addStringOption((o) => o.setName('title').setDescription('Panel title').setRequired(true).setMaxLength(100))
      .addRoleOption((o) => o.setName('role1').setDescription('Role').setRequired(true))
      .addRoleOption((o) => o.setName('role2').setDescription('Role'))
      .addRoleOption((o) => o.setName('role3').setDescription('Role'))
      .addRoleOption((o) => o.setName('role4').setDescription('Role'))
      .addRoleOption((o) => o.setName('role5').setDescription('Role'))
      .addStringOption((o) => o.setName('description').setDescription('Text under the title').setMaxLength(500)),
    async execute(interaction) {
      const roles = [1, 2, 3, 4, 5].map((n) => interaction.options.getRole(`role${n}`)).filter(Boolean);
      const me = interaction.guild.members.me;
      const bad = roles.find((r) => r.position >= me.roles.highest.position || r.managed);
      if (bad) return interaction.reply(fail(`I can't manage ${bad} — it is above my role or managed by an integration.`));
      const row = new ActionRowBuilder().addComponents(roles.map((r) => new ButtonBuilder().setCustomId(`role:${r.id}`).setLabel(r.name.slice(0, 80)).setStyle(ButtonStyle.Secondary)));
      const e = new EmbedBuilder().setColor(COLORS.info).setTitle(interaction.options.getString('title')).setDescription(interaction.options.getString('description') || 'Click a button to add or remove the role.');
      await interaction.channel.send({ embeds: [e], components: [row] });
      return interaction.reply({ content: '✅ Panel posted.', flags: MessageFlags.Ephemeral });
    },
  },
  // ---------------------------------------------------------------- /ticket
  {
    data: new SlashCommandBuilder().setName('ticket').setDescription('Support tickets').setDMPermission(false)
      .addSubcommand((s) => s.setName('panel').setDescription('[Admin] Post the "Open ticket" panel here')
        .addChannelOption((o) => o.setName('category').setDescription('Category to create ticket channels in').addChannelTypes(ChannelType.GuildCategory)))
      .addSubcommand((s) => s.setName('close').setDescription('Close this ticket'))
      .addSubcommand((s) => s.setName('add').setDescription('Add a user to this ticket').addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))),
    async execute(interaction) {
      const g = store.guild(interaction.guildId);
      const sub = interaction.options.getSubcommand();
      if (sub === 'panel') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply(fail('Manage Server required.'));
        const cat = interaction.options.getChannel('category');
        g.tickets.enabled = true;
        if (cat) g.tickets.categoryId = cat.id;
        store.save();
        await interaction.channel.send(tickets.panel());
        return interaction.reply({ content: `✅ Ticket panel posted.${cat ? ` Tickets go in **${cat.name}**.` : ''}`, flags: MessageFlags.Ephemeral });
      }
      if (sub === 'close') return tickets.close(interaction);
      if (sub === 'add') {
        if (!g.tickets.open[interaction.channelId]) return interaction.reply(fail('This is not a ticket channel.'));
        const user = interaction.options.getUser('user');
        await interaction.channel.permissionOverwrites.edit(user.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
        return interaction.reply(ok(`Added ${user} to this ticket.`));
      }
    },
  },
  // ---------------------------------------------------------------- /antiraid
  {
    data: new SlashCommandBuilder().setName('antiraid').setDescription('Join-rate and new-account protection').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .addSubcommand((s) => s.setName('set').setDescription('Configure anti-raid')
        .addBooleanOption((o) => o.setName('enabled').setDescription('On/off'))
        .addIntegerOption((o) => o.setName('joins_per_minute').setDescription('Joins within 60s that count as a raid (0 = off)').setMinValue(0).setMaxValue(200))
        .addStringOption((o) => o.setName('raid_action').setDescription('What to do to joins during a raid').addChoices({ name: 'Kick', value: 'kick' }, { name: 'Timeout', value: 'timeout' }, { name: 'Log only', value: 'none' }))
        .addIntegerOption((o) => o.setName('raid_minutes').setDescription('How long raid mode lasts').setMinValue(1).setMaxValue(120))
        .addIntegerOption((o) => o.setName('min_account_age_days').setDescription('Accounts younger than this get the action (0 = off)').setMinValue(0).setMaxValue(365))
        .addStringOption((o) => o.setName('young_action').setDescription('Action for young accounts').addChoices({ name: 'Kick', value: 'kick' }, { name: 'Timeout 24h', value: 'timeout' }, { name: 'Log only', value: 'none' })))
      .addSubcommand((s) => s.setName('view').setDescription('Show anti-raid settings'))
      .addSubcommand((s) => s.setName('end').setDescription('End raid mode now')),
    async execute(interaction) {
      const a = store.guild(interaction.guildId).antiraid;
      const sub = interaction.options.getSubcommand();
      const o = interaction.options;
      if (sub === 'set') {
        if (o.getBoolean('enabled') !== null) a.enabled = o.getBoolean('enabled');
        if (o.getInteger('joins_per_minute') !== null) a.joinsPerMinute = o.getInteger('joins_per_minute');
        if (o.getString('raid_action')) a.raidAction = o.getString('raid_action');
        if (o.getInteger('raid_minutes') !== null) a.raidMinutes = o.getInteger('raid_minutes');
        if (o.getInteger('min_account_age_days') !== null) a.minAccountAgeDays = o.getInteger('min_account_age_days');
        if (o.getString('young_action')) a.youngAction = o.getString('young_action');
        store.save();
      }
      if (sub === 'end') {
        a.raidActive = null;
        store.save();
        return interaction.reply(ok('Raid mode ended.'));
      }
      const e = new EmbedBuilder().setColor(COLORS.info).setTitle(`Anti-raid — ${a.enabled ? 'ON' : 'OFF'}`).addFields(
        { name: 'Raid threshold', value: a.joinsPerMinute ? `${a.joinsPerMinute} joins / minute` : 'off', inline: true },
        { name: 'During raid', value: `${a.raidAction} for ${a.raidMinutes} min`, inline: true },
        { name: 'Raid mode', value: a.raidActive && new Date(a.raidActive) > Date.now() ? `🚨 active until <t:${Math.floor(new Date(a.raidActive) / 1000)}:R>` : 'inactive', inline: true },
        { name: 'Min account age', value: a.minAccountAgeDays ? `${a.minAccountAgeDays} days → ${a.youngAction}` : 'off', inline: true }
      );
      return interaction.reply({ embeds: [e], ...(sub === 'set' ? { content: '✅ Saved.' } : {}) });
    },
  },
];
