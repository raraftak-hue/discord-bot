const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const SettingsSchema = new mongoose.Schema({
  guildId: String,
  prefix: { type: String, default: null },
  welcomeSettings: {
    channelId: String,
    title: String,
    description: String,
    color: { type: String, default: '2b2d31' },
    image: String
  }
});

const Settings = mongoose.model('Settings', SettingsSchema);

// ==================== 🔧 الدوال المساعدة ====================
async function getSettings(guildId) {
  let settings = await Settings.findOne({ guildId });
  if (!settings) {
    settings = new Settings({ 
      guildId, 
      prefix: null,
      welcomeSettings: { color: '2b2d31' } 
    });
    await settings.save();
  }
  return settings;
}

async function sendWelcomeMessage(member, settings) {
  const welcome = settings.welcomeSettings;
  if (!welcome || !welcome.channelId) return;

  const channel = await member.guild.channels.fetch(welcome.channelId).catch(() => null);
  if (!channel) return;

  const finalTitle = welcome.title ? welcome.title.replace('{member}', `${member}`) : null;
  const finalDesc = welcome.description ? welcome.description.replace('{member}', `${member}`) : null;
  const color = parseInt(welcome.color, 16) || 0x2b2d31;
  const image = welcome.image || null;

  const embed = new EmbedBuilder().setColor(color);
  if (finalTitle) embed.setTitle(finalTitle);
  if (finalDesc) embed.setDescription(finalDesc);
  if (image) embed.setImage(image);
  
  if (!finalTitle && !finalDesc && !image) return;
  channel.send({ embeds: [embed] }).catch(() => { });
}

module.exports = {
  onGuildMemberAdd: async (client, member) => {
    const settings = await getSettings(member.guild.id);
    await sendWelcomeMessage(member, settings);
  },

  onInteraction: async (client, interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'wel') return;
    const { options, guild } = interaction;
    const sub = options.getSubcommand();
    const settings = await getSettings(guild.id);

    if (sub === 'ch') {
      const room = options.getChannel('room');
      settings.welcomeSettings.channelId = room.id;
      await settings.save();
      return interaction.reply({ content: `-# ** تم تعيين روم الترحيب <:new_emoji:1388436089584226387> **`, ephemeral: true });
    }

    if (sub === 'msg') {
      const title = options.getString('title');
      const desc = options.getString('desc');
      const color = options.getString('color');
      const image = options.getString('image');

      if (title) settings.welcomeSettings.title = title;
      if (desc) settings.welcomeSettings.description = desc;
      if (color) settings.welcomeSettings.color = color.replace('#', '');
      if (image) settings.welcomeSettings.image = image;

      await settings.save();
      return interaction.reply({ content: `-# ** تم تحديث الاعدادات <:2thumbup:1467287897429512396> **`, ephemeral: true });
    }

    if (sub === 'info') {
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(
          `**إعدادات الترحيب**\n\n` +
          `-# **الروم:** ${settings.welcomeSettings.channelId ? `<#${settings.welcomeSettings.channelId}>` : 'غير محدد'}\n` +
          `-# **اللون:** #${settings.welcomeSettings.color}\n` +
          `-# **العنوان:** ${settings.welcomeSettings.title || 'غير محدد'}\n` +
          `-# **الوصف:** ${settings.welcomeSettings.description || 'غير محدد'}`
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'test') {
      await sendWelcomeMessage(interaction.member, settings);
      return interaction.reply({ content: `-# **تم ارسال الرسالة <:2thumbup:1467287897429512396> **`, ephemeral: true });
    }
  }
};