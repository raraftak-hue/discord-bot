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

async function getAutoDeleteChannels(guildId) {
  return await AutoDelete.find({ guildId });
}

module.exports = {
  onMessage: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const autoDeleteChannels = await getAutoDeleteChannels(message.guild.id);
    const autoDelete = autoDeleteChannels.find(ch => ch.channelId === message.channel.id);
    
    if (autoDelete) {
      if (autoDelete.exceptUsers && autoDelete.exceptUsers.includes(message.author.id)) return;
      
      if (autoDelete.exceptRoles && autoDelete.exceptRoles.length > 0) {
        const memberRoles = message.member.roles.cache.map(r => r.id);
        const hasAllowedRole = memberRoles.some(roleId => autoDelete.exceptRoles.includes(roleId));
        if (hasAllowedRole) return;
      }
      
      let shouldDelete = false;
      
      if (autoDelete.filterType === 'all') {
        if (autoDelete.allowedWords && autoDelete.allowedWords.length > 0) {
          const messageWords = message.content.split(/\s+/).map(w => w.trim());
          const allWordsAllowed = messageWords.every(word => autoDelete.allowedWords.includes(word));
          if (!allWordsAllowed) shouldDelete = true;
        } else {
          shouldDelete = true;
        }
      }
      else if (autoDelete.filterType === 'images' && message.attachments.some(a => a.contentType?.startsWith('image/'))) shouldDelete = true;
      else if (autoDelete.filterType === 'links' && /https?:\/\/[^\s]+/.test(message.content)) shouldDelete = true;
      else if (autoDelete.filterType === 'files' && message.attachments.size > 0) shouldDelete = true;
      
      if (shouldDelete) {
        setTimeout(async () => {
          try {
            await message.delete();
            if (autoDelete.customMessage) {
              const msg = await message.channel.send(autoDelete.customMessage.replace(/{user}/g, `${message.author}`));
              setTimeout(() => msg.delete().catch(() => { }), 5000);
            }
          } catch (e) { }
        }, autoDelete.deleteDelay * 1000);
      }
    }
  },

  onInteraction: async (client, interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'auto') return;
    const { options, guild, user } = interaction;
    const sub = options.getSubcommand();

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
      
      let replyMsg = `-# ** تم تعيين روم الحذف التلقائي <:new_emoji:1388436089584226387> **`;
      if (allowedWords.length > 0) replyMsg += `\n-# **كلمات مستثناة: ${allowedWords.join('، ')}**`;
      if (allowedUsers.length > 0) replyMsg += `\n-# **أعضاء مسموح لهم: <@${allowedUsers.join('>, <@')}>**`;
      
      return interaction.reply({ content: replyMsg, ephemeral: true });
    }

    if (sub === 'rem') {
      const channel = options.getChannel('channel');
      await AutoDelete.deleteMany({ guildId: guild.id, channelId: channel.id });
      return interaction.reply({ content: `-# ** تم تحديث الاعدادات <:2thumbup:1467287897429512396> **`, ephemeral: true });
    }

    if (sub === 'list') {
      const channels = await getAutoDeleteChannels(guild.id);
      
      if (channels.length === 0) {
        return interaction.reply({ content: `-# **ما في رومات حذف تلقائي <:new_emoji:1388436095842385931> **`, ephemeral: true });
      }
      
      const filterTypes = { 
        'all': 'جميع الرسائل', 
        'images': 'الصور', 
        'links': 'الروابط', 
        'files': 'الملفات' 
      };
      
      let description = '';
      
      for (const ch of channels) {
        let استثناءات = [];
        if (ch.allowedWords && ch.allowedWords.length > 0) {
          استثناءات.push(`كلمات: ${ch.allowedWords.join('، ')}`);
        }
        if (ch.exceptUsers && ch.exceptUsers.length > 0) {
          استثناءات.push(`أعضاء: <@${ch.exceptUsers.join('>, <@')}>`);
        }
        
        let استثناءاتنص = استثناءات.length > 0 ? استثناءات.join(' و ') : 'لا يوجد';
        
        description += `-# ** روم <#${ch.channelId}> و سيحذف ${filterTypes[ch.filterType] || ch.filterType} ما عدا ${استثناءاتنص} في مدة ${ch.deleteDelay} ثانية <:new_emoji:1388436089584226387> **\n\n`;
      }
      
      const embed = new EmbedBuilder()
        .setTitle('رومات الحذف التلقائي')
        .setDescription(description)
        .setColor(0x2b2d31);
      
      await interaction.deferReply({ ephemeral: true });
      await interaction.channel.send({ embeds: [embed] });
      await interaction.deleteReply();
      return true;
    }
  }
};