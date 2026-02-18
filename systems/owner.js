const { PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
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

// ==================== onMessage (للرسائل العادية) ====================
async function onMessage(client, message) {
  // هذا النظام ما يحتاج معالجة رسائل عادية
  return;
}

// ==================== معالج الأوامر النصية ====================
async function handleTextCommand(client, message, command, args, prefix) {
  const OWNER_ID = "1131951548772122625";

  if (command === 'زد' && message.author.id === OWNER_ID) {
    // تحديد الهدف: إذا في منشن نأخذ المنشن وإلا المالك نفسه
    const target = message.mentions.users.first() || message.author;
    
    // تحديد المبلغ: إذا في منشن المبلغ في args[2] وإلا في args[1]
    let amount;
    if (message.mentions.users.first()) {
      amount = parseFloat(args[2]);
    } else {
      amount = parseFloat(args[1]);
    }
    
    if (isNaN(amount) || amount <= 0) {
      await message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
      return true;
    }
    
    const targetData = await getUserData(target.id);
    targetData.balance = parseFloat((targetData.balance + amount).toFixed(2));
    targetData.history.push({ type: 'OWNER_ADD', amount: amount, date: new Date() });
    await targetData.save();
    
    if (target.id === message.author.id) {
      await message.channel.send(`-# **تم اضافة ${amount} دينار لحسابك <:emoji_41:1471619709936996406> **`);
    } else {
      await message.channel.send(`-# **تم اضافة ${amount} دينار لحساب ${target.username} <:emoji_41:1471619709936996406> **`);
    }
    return true;
  }

  if (command === 'سحب' && message.author.id === OWNER_ID) {
    // تحديد الهدف: إذا في منشن نأخذ المنشن وإلا المالك نفسه
    const target = message.mentions.users.first() || message.author;
    
    // تحديد المبلغ: إذا في منشن المبلغ في args[2] وإلا في args[1]
    let amount;
    if (message.mentions.users.first()) {
      amount = parseFloat(args[2]);
    } else {
      amount = parseFloat(args[1]);
    }
    
    if (isNaN(amount) || amount <= 0) {
      await message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
      return true;
    }
    
    const targetData = await getUserData(target.id);
    
    if (targetData.balance < amount) {
      await message.channel.send(`-# **العضو ما معه ذي الكمية saybu <:emoji_84:1389404919672340592> **`);
      return true;
    }
    
    targetData.balance = parseFloat((targetData.balance - amount).toFixed(2));
    targetData.history.push({ 
      type: 'OWNER_REMOVE', 
      amount: -amount, 
      targetUser: message.author.id,
      targetName: message.author.username,
      date: new Date() 
    });
    
    await targetData.save();
    
    if (target.id === message.author.id) {
      await message.channel.send(`-# **تم سحب ${amount} دينار من حسابك <:emoji_41:1471619709936996406> **`);
    } else {
      await message.channel.send(`-# **تم سحب ${amount} دينار من ${target.username} <:emoji_41:1471619709936996406> **`);
    }
    return true;
  }

  return false;
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;
  const { commandName, options, guild } = interaction;

  if (commandName === 'pre') {
    const newPrefix = options.getString('new');
    const settings = await getSettings(guild.id);
    
    if (newPrefix === 'null' || newPrefix === 'none' || newPrefix === 'حذف' || newPrefix === '0') {
      settings.prefix = null;
      await settings.save();
      await interaction.reply({ 
        content: `-# ** تم الغاء تعيين البادئة و ستعمل كل الأوامر بدونها <:new_emoji:1388436095842385931> **`, 
        ephemeral: true 
      });
      return true;
    }
    
    settings.prefix = newPrefix;
    await settings.save();
    
    await interaction.reply({ 
      content: `-# ** تم تعيين البادئة \`${newPrefix}\` كـ بادئة للأوامر النصية <:new_emoji:1388436089584226387> **`, 
      ephemeral: true 
    });
    return true;
  }

  return false;
}

// ==================== onReady (اختياري) ====================
async function onReady(client) {
  // يمكن إضافة أي كود هنا إذا لزم الأمر
  console.log('👑 نظام المالك جاهز');
}

// ==================== تصدير النظام ====================
module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction,
  onReady
};