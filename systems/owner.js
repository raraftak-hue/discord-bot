const { PermissionsBitField, REST, Routes } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
// نحتاج لتعريف الـ Schemas هنا أيضاً لأن كل نظام يجب أن يكون مستقلاً
const UserSchema = new mongoose.Schema({
  userId: String,
  balance: { type: Number, default: 0 },
  history: [{
    type: { type: String },
    amount: Number,
    targetUser: String,
    targetName: String,
    date: { type: Date, default: Date.now }
  }]
});

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

// التحقق من وجود الموديلات قبل تعريفها لتجنب خطأ OverwriteModelError
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Settings = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);

// ==================== 🔧 الدوال المساعدة ====================
async function getUserData(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId, balance: 0, history: [] });
    await user.save();
  }
  return user;
}

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

module.exports = {
  onReady: async (client) => {
    // تسجيل الأوامر (هذا الجزء كان في index.js الأصلي)
    // ملاحظة: الأوامر معرفة في index.js الأصلي كـ allCommands
    // بما أننا نقوم بالتقسيم، يفضل أن يكون تسجيل الأوامر في index.js الرئيسي
    // لكن سأضعه هنا إذا كان المالك يريد التحكم فيه
  },

  onMessage: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const OWNER_ID = "1131951548772122625";
    const content = message.content.trim();
    const args = content.split(/\s+/);
    const command = args[0];

    if (command === 'زد' && message.author.id === OWNER_ID) {
      const amount = parseFloat(args[1]);
      if (isNaN(amount) || amount <= 0) return message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
      const ownerData = await getUserData(message.author.id);
      ownerData.balance = parseFloat((ownerData.balance + amount).toFixed(2));
      ownerData.history.push({ type: 'OWNER_ADD', amount: amount, date: new Date() });
      await ownerData.save();
      return message.channel.send(`-# **تم اضافة الرصيد لحسابك <:emoji_41:1471619709936996406> **`);
    }

    if (command === 'سحب' && message.author.id === OWNER_ID) {
      const amount = parseFloat(args[1]);
      if (isNaN(amount) || amount <= 0) return message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
      const ownerData = await getUserData(message.author.id);
      ownerData.balance = parseFloat((ownerData.balance - amount).toFixed(2));
      ownerData.history.push({ type: 'OWNER_REMOVE', amount: -amount, date: new Date() });
      await ownerData.save();
      return message.channel.send(`-# **تم سحب الرصيد من حسابك <:emoji_41:1471619709936996406> **`);
    }
  },

  onInteraction: async (client, interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, guild } = interaction;

    if (commandName === 'pre') {
      const newPrefix = options.getString('new');
      const settings = await getSettings(guild.id);
      
      if (newPrefix === 'null' || newPrefix === 'none' || newPrefix === 'حذف' || newPrefix === '0') {
        settings.prefix = null;
        await settings.save();
        return interaction.reply({ 
          content: `-# ** تم الغاء تعيين البادئة و ستعمل كل الأوامر بدونها <:new_emoji:1388436095842385931> **`, 
          ephemeral: true 
        });
      }
      
      settings.prefix = newPrefix;
      await settings.save();
      
      return interaction.reply({ 
        content: `-# ** تم تعيين البادئة \`${newPrefix}\` كـ بادئة للأوامر النصية <:new_emoji:1388436089584226387> **`, 
        ephemeral: true 
      });
    }
  }
};
