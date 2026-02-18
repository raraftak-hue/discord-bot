const { PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const AutoDeleteChannelSchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  deleteDelay: { type: Number, default: 0 },
  filterType: { type: String, default: 'all' },
  allowedWords: { type: [String], default: [] },
  blockedWords: { type: [String], default: [] },
  exceptUsers: { type: [String], default: [] },
  exceptRoles: { type: [String], default: [] },
  customMessage: { type: String, default: null }
});

const AutoDelete = mongoose.model('AutoDeleteChannel', AutoDeleteChannelSchema);

module.exports = {
  onMessage: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const channels = await AutoDelete.find({ guildId: message.guild.id, channelId: message.channel.id });
    if (channels.length === 0) return;

    for (const settings of channels) {
      // التحقق من الاستثناءات
      if (settings.exceptUsers.includes(message.author.id)) continue;
      if (message.member.roles.cache.some(r => settings.exceptRoles.includes(r.id))) continue;

      let shouldDelete = false;
      if (settings.filterType === 'all') {
        shouldDelete = true;
      } else if (settings.filterType === 'words') {
        const content = message.content.toLowerCase();
        const hasAllowed = settings.allowedWords.some(w => content.includes(w.toLowerCase()));
        if (!hasAllowed) shouldDelete = true;
      }

      if (shouldDelete) {
        setTimeout(async () => {
          try {
            await message.delete();
            if (settings.customMessage) {
              const reply = await message.channel.send(settings.customMessage.replace('{user}', `<@${message.author.id}>`));
              setTimeout(() => reply.delete().catch(() => {}), 3000);
            }
          } catch (e) {}
        }, settings.deleteDelay * 1000);
      }
    }
  },

  onInteraction: async (client, interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'auto') return;
    const { options, guild, user } = interaction;
    const sub = options.getSubcommand();

    // ملاحظة: هذا الأمر مخصص للمالك فقط في الكود الأصلي
    const OWNER_ID = "1131951548772122625";
    if (user.id !== OWNER_ID) return interaction.reply({ content: '❌ هذا الأمر للمالك فقط!', ephemeral: true });

    if (sub === 'add') {
      const channel = options.getChannel('channel');
      const delay = options.getInteger('delay') ?? 0;
      const filterType = options.getString('type') ?? 'all';
      const customMessage = options.getString('message') || null;
      
      const allowedWordsInput = options.getString('allow');
      const allowedWords = allowedWordsInput 
        ? allowedWordsInput.split(',').map(w => w.trim()).filter(w => w.length > 0)
        : [];
      
      const allowedUsersInput = options.getString('allowed_users');
      const allowedUsers = allowedUsersInput
        ? allowedUsersInput.split(',').map(id => id.trim()).filter(id => id.length > 0)
        : [];
      
      await AutoDelete.deleteMany({ guildId: guild.id, channelId: channel.id });
      
      const newSettings = new AutoDelete({
        guildId: guild.id,
        channelId: channel.id,
        deleteDelay: delay,
        filterType,
        customMessage,
        allowedWords: allowedWords,
        exceptUsers: allowedUsers
      });
      
      await newSettings.save();
      
      let replyMsg = `-# **تم تفعيل الحذف التلقائي في <#${channel.id}> <:2thumbup:1467287897429512396> **`;
      if (allowedWords.length > 0) replyMsg += `\n-# **كلمات مستثناة: ${allowedWords.join('، ')}**`;
      
      return interaction.reply({ content: replyMsg, ephemeral: true });
    }

    if (sub === 'remove') {
      const channel = options.getChannel('channel');
      await AutoDelete.deleteMany({ guildId: guild.id, channelId: channel.id });
      return interaction.reply({ content: `-# **تم إيقاف الحذف التلقائي في <#${channel.id}> <:2thumbup:1467287897429512396> **`, ephemeral: true });
    }
  }
};
