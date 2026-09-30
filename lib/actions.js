// Shared moderation actions + button handling.
//   apply({ guild, targetId, action, moderator, reason, minutes })  -> { ok, text }
//   modButtons(userId)  -> ActionRow with Timeout 1h / Kick / Ban buttons
//   handleButton(interaction)  -> routes mod:/role:/ticket:/raid: buttons
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const store = require('./store');
const cases = require('./cases');

async function apply({ guild, targetId, action, moderator, reason, minutes = 60, extra = null }) {
  const member = await guild.members.fetch(targetId).catch(() => null);
  const user = member?.user || (await guild.client.users.fetch(targetId).catch(() => null));
  if (!user) return { ok: false, text: 'User not found.' };
  const me = guild.members.me;
  if (member && member.roles.highest.position >= me.roles.highest.position) return { ok: false, text: 'That user has a role above mine.' };
  try {
    if (action === 'timeout') {
      if (!member) return { ok: false, text: 'User is not in the server.' };
      const ms = Math.min(minutes, 40320) * 60_000;
      await member.timeout(ms, reason);
      const c = await cases.create({ guild, type: 'timeout', user, moderator, reason, durationMs: ms, extra });
      await cases.notify(guild, user, c);
      return { ok: true, text: `Timed out ${user.tag} for ${minutes}m (case #${c.id}).` };
    }
    if (action === 'kick') {
      if (!member) return { ok: false, text: 'User is not in the server.' };
      const c = await cases.create({ guild, type: 'kick', user, moderator, reason, extra });
      await cases.notify(guild, user, c);
      await member.kick(reason);
      return { ok: true, text: `Kicked ${user.tag} (case #${c.id}).` };
    }
    if (action === 'ban') {
      const c = await cases.create({ guild, type: 'ban', user, moderator, reason, extra });
      if (member) await cases.notify(guild, user, c);
      await guild.members.ban(targetId, { reason, deleteMessageSeconds: 3600 });
      return { ok: true, text: `Banned ${user.tag} (case #${c.id}).` };
    }
    return { ok: false, text: 'Unknown action.' };
  } catch (err) {
    return { ok: false, text: `Failed: ${err.message}` };
  }
}

function modButtons(userId, { kickOnly = false } = {}) {
  const row = new ActionRowBuilder();
  if (!kickOnly) row.addComponents(new ButtonBuilder().setCustomId(`mod:timeout:${userId}`).setLabel('Timeout 1h').setEmoji('🔇').setStyle(ButtonStyle.Secondary));
  row.addComponents(
    new ButtonBuilder().setCustomId(`mod:kick:${userId}`).setLabel('Kick').setEmoji('👢').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`mod:ban:${userId}`).setLabel('Ban').setEmoji('🔨').setStyle(ButtonStyle.Danger)
  );
  return row;
}

const NEED = { timeout: PermissionFlagsBits.ModerateMembers, kick: PermissionFlagsBits.KickMembers, ban: PermissionFlagsBits.BanMembers };

async function handleButton(interaction) {
  const [kind, a, b] = interaction.customId.split(':');

  // ---- mod:<action>:<userId> ----
  if (kind === 'mod') {
    if (a === 'dismiss') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '❌ Staff only.', flags: MessageFlags.Ephemeral });
      await interaction.update({ components: [], content: `${interaction.message.content || ''}\n✅ Dismissed by ${interaction.user}`.trim() });
      return true;
    }
    if (!NEED[a]) return false;
    if (!interaction.member.permissions.has(NEED[a])) return interaction.reply({ content: '❌ You lack the permission for that action.', flags: MessageFlags.Ephemeral });
    if (b === interaction.user.id) return interaction.reply({ content: "❌ You can't do that to yourself.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply();
    const res = await apply({ guild: interaction.guild, targetId: b, action: a, moderator: interaction.user, reason: `Via button on ${interaction.message.url}` });
    await interaction.editReply({ content: `${res.ok ? '✅' : '❌'} ${res.text}` });
    if (res.ok) await interaction.message.edit({ components: [] }).catch(() => null);
    return true;
  }

  // ---- role:<roleId> (self-roles) ----
  if (kind === 'role') {
    const role = interaction.guild.roles.cache.get(a);
    if (!role) return interaction.reply({ content: '❌ That role no longer exists.', flags: MessageFlags.Ephemeral });
    if (role.position >= interaction.guild.members.me.roles.highest.position) return interaction.reply({ content: '❌ I cannot manage that role (it is above mine).', flags: MessageFlags.Ephemeral });
    const has = interaction.member.roles.cache.has(role.id);
    try {
      if (has) await interaction.member.roles.remove(role, 'Self-role');
      else await interaction.member.roles.add(role, 'Self-role');
      return interaction.reply({ content: has ? `➖ Removed **${role.name}**.` : `➕ You now have **${role.name}**.`, flags: MessageFlags.Ephemeral });
    } catch (err) {
      return interaction.reply({ content: `❌ ${err.message}`, flags: MessageFlags.Ephemeral });
    }
  }

  // ---- ticket:open / ticket:close ----
  if (kind === 'ticket') {
    const tickets = require('./tickets');
    if (a === 'open') return tickets.open(interaction);
    if (a === 'close') return tickets.close(interaction);
  }

  // ---- raid:lockdown / raid:end / raid:kickrecent ----
  if (kind === 'raid') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ Manage Server required.', flags: MessageFlags.Ephemeral });
    const lockdown = require('./lockdown');
    await interaction.deferReply();
    if (a === 'lockdown') {
      const n = await lockdown.start(interaction.guild, interaction.user, 'Raid response');
      return interaction.editReply({ content: `🔒 Locked ${n} channel(s). Use \`/lockdown end\` to lift.` });
    }
    if (a === 'end') {
      const g = store.guild(interaction.guildId);
      g.antiraid.raidActive = null;
      store.save();
      return interaction.editReply({ content: '✅ Raid mode ended.' });
    }
    if (a === 'kickrecent') {
      const antiraid = require('./antiraid');
      const n = await antiraid.kickRecent(interaction.guild, interaction.user);
      return interaction.editReply({ content: `👢 Kicked ${n} account(s) that joined during the raid.` });
    }
  }
  return false;
}

module.exports = { apply, modButtons, handleButton };
