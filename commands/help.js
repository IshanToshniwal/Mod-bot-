const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { COLORS } = require('../lib/util');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('List Sentinel commands').setDMPermission(false),
  async execute(interaction) {
    const e = new EmbedBuilder().setColor(COLORS.info).setTitle('🛡️ Sentinel — commands').addFields(
      { name: 'Moderation', value: '`/warn` `/timeout` `/untimeout` `/kick` `/ban` (optional duration) `/softban` `/unban` `/purge` `/slowmode` `/lock` `/unlock` `/nick`' },
      { name: 'Cases', value: '`/modlogs @user` `/warnings @user` `/clearwarnings` `/case #` `/reason #` `/note`' },
      { name: 'Protection', value: '`/lockdown start|end` · `/antiraid set|view|end` · `/report @user` or right-click a message → Apps → **Report message**' },
      { name: 'Community', value: '`/ticket panel|close|add` · `/selfroles` · `/userinfo` `/serverinfo`' },
      { name: 'Setup (Manage Server)', value: '`/logs set|all|disable|view` · `/config modrole|dm|autorole|appeal|warnexpiry|reports|view` · `/automod toggle|filters|words|ignore|escalation|view` · `/welcome set|leave|disable|test`' },
      { name: 'Quick start', value: '1. `/logs all #mod-logs`\n2. `/automod toggle enabled:true`\n3. `/config modrole @Moderator`\n4. `/welcome set #general`' }
    );
    return interaction.reply({ embeds: [e] });
  },
};
