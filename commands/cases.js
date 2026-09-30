// /modlogs /case /warnings /clearwarnings /reason /note
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const store = require('../lib/store');
const cases = require('../lib/cases');
const logger = require('../lib/logger');
const { COLORS, ok, fail, rel } = require('../lib/util');

const ICON = { warn: '⚠️', timeout: '🔇', untimeout: '🔊', kick: '👢', ban: '🔨', tempban: '⏳', softban: '🧹', unban: '🔓', purge: '🗑️', note: '📝' };

function historyEmbed(user, list, title) {
  const e = new EmbedBuilder().setColor(COLORS.info).setTitle(title).setThumbnail(user.displayAvatarURL?.() ?? null);
  if (!list.length) return e.setDescription('No cases found.');
  const lines = list.slice(-15).reverse().map((c) => `${ICON[c.type] ?? '•'} **#${c.id}** ${c.type}${c.active && c.type === 'warn' ? '' : c.type === 'warn' ? ' (cleared)' : ''} — ${c.reason.slice(0, 60)} · ${rel(c.createdAt)}`);
  e.setDescription(lines.join('\n'));
  const counts = {};
  for (const c of list) counts[c.type] = (counts[c.type] || 0) + 1;
  e.setFooter({ text: `${list.length} total · ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}` });
  return e;
}

module.exports = [
  {
    data: new SlashCommandBuilder().setName('modlogs').setDescription("Show a user's moderation history").setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const list = cases.forUser(interaction.guildId, user.id);
      return interaction.reply({ embeds: [historyEmbed(user, list, `Mod logs — ${user.tag}`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('warnings').setDescription("Show a user's active warnings").setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true)),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const list = cases.forUser(interaction.guildId, user.id).filter((c) => c.type === 'warn' && c.active);
      return interaction.reply({ embeds: [historyEmbed(user, list, `Active warnings — ${user.tag} (${list.length})`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('clearwarnings').setDescription("Clear a user's active warnings").setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addIntegerOption((o) => o.setName('case').setDescription('Clear only this case number (default: all)')),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const only = interaction.options.getInteger('case');
      let n = 0;
      for (const c of cases.forUser(interaction.guildId, user.id)) {
        if (c.type === 'warn' && c.active && (!only || c.id === only)) {
          c.active = false;
          n++;
        }
      }
      if (!n) return interaction.reply(fail('No matching active warnings.'));
      store.save();
      await logger.log(interaction.guild, 'mod', new EmbedBuilder().setColor(COLORS.success).setAuthor({ name: '🧽 Warnings cleared' }).setDescription(`${n} warning(s) cleared for ${user} by ${interaction.user}`).setTimestamp());
      return interaction.reply(ok(`Cleared **${n}** warning(s) for ${user}.`));
    },
  },
  {
    data: new SlashCommandBuilder().setName('case').setDescription('View a case by number').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addIntegerOption((o) => o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1)),
    async execute(interaction) {
      const c = cases.get(interaction.guildId, interaction.options.getInteger('number'));
      if (!c) return interaction.reply(fail('No such case.'));
      const u = await interaction.client.users.fetch(c.userId).catch(() => null);
      return interaction.reply({ embeds: [cases.buildEmbed(c, u)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('reason').setDescription('Edit the reason of a case').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addIntegerOption((o) => o.setName('number').setDescription('Case number').setRequired(true).setMinValue(1))
      .addStringOption((o) => o.setName('reason').setDescription('New reason').setRequired(true).setMaxLength(500)),
    async execute(interaction) {
      const c = cases.get(interaction.guildId, interaction.options.getInteger('number'));
      if (!c) return interaction.reply(fail('No such case.'));
      const old = c.reason;
      c.reason = interaction.options.getString('reason');
      store.save();
      await logger.log(interaction.guild, 'mod', new EmbedBuilder().setColor(COLORS.info).setAuthor({ name: `✏️ Reason updated • Case #${c.id}` }).addFields({ name: 'Before', value: old.slice(0, 1024) }, { name: 'After', value: c.reason.slice(0, 1024) }).setFooter({ text: `By ${interaction.user.tag}` }).setTimestamp());
      return interaction.reply(ok(`Updated reason for case #${c.id}.`));
    },
  },
  {
    data: new SlashCommandBuilder().setName('note').setDescription('Add a private mod note to a user (no DM, no punishment)').setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .addUserOption((o) => o.setName('user').setDescription('User').setRequired(true))
      .addStringOption((o) => o.setName('text').setDescription('Note').setRequired(true).setMaxLength(500)),
    async execute(interaction) {
      const user = interaction.options.getUser('user');
      const c = await cases.create({ guild: interaction.guild, type: 'note', user, moderator: interaction.user, reason: interaction.options.getString('text') });
      return interaction.reply(ok(`Note added for ${user} — case #${c.id}.`));
    },
  },
];
