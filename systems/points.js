const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const UserPointsSchema = new mongoose.Schema({
  userId: String,
  guildId: String,
  totalPoints: { type: Number, default: 0 },
  weeklyPoints: { type: Number, default: 0 },
  dailyPoints: { type: Number, default: 0 },
  lastMessageTime: { type: Date, default: null },
  lastResetDate: {
    weekly: { type: Date, default: new Date() },
    daily: { type: Date, default: new Date() }
  }
});

const PointsSettingsSchema = new mongoose.Schema({
  guildId: String,
  excludedChannels: { type: [String], default: [] }
});

// منع تكرار تعريف الموديلات
const UserPoints = mongoose.models.UserPoints || mongoose.model('UserPoints', UserPointsSchema);
const PointsSettings = mongoose.models.PointsSettings || mongoose.model('PointsSettings', PointsSettingsSchema);

// ==================== 🔧 الدوال المساعدة ====================

// حساب النقاط التصاعدية
function calculatePointsToAdd(totalPoints) {
  if (totalPoints < 100) return 1 / 5;        // 5 رسائل = 1 نقطة
  if (totalPoints < 500) return 1 / 20;       // 20 رسالة = 1 نقطة
  if (totalPoints < 2000) return 1 / 50;      // 50 رسالة = 1 نقطة
  return 1 / 100;                              // 100 رسالة = 1 نقطة
}

// الحصول على بيانات المستخدم
async function getUserPoints(userId, guildId) {
  let user = await UserPoints.findOne({ userId, guildId });
  if (!user) {
    user = new UserPoints({ userId, guildId });
    await user.save();
  }
  return user;
}

// الحصول على إعدادات النقاط للسيرفر
async function getPointsSettings(guildId) {
  let settings = await PointsSettings.findOne({ guildId });
  if (!settings) {
    settings = new PointsSettings({ guildId });
    await settings.save();
  }
  return settings;
}

// إعادة تعيين النقاط اليومية/الأسبوعية إذا لزم الأمر
async function resetPeriodicPoints(user) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());

  let updated = false;

  // إعادة تعيين النقاط اليومية
  if (user.lastResetDate.daily < today) {
    user.dailyPoints = 0;
    user.lastResetDate.daily = now;
    updated = true;
  }

  // إعادة تعيين النقاط الأسبوعية
  if (user.lastResetDate.weekly < weekStart) {
    user.weeklyPoints = 0;
    user.lastResetDate.weekly = now;
    updated = true;
  }

  if (updated) await user.save();
  return user;
}

// إنشاء Embed للمتصدرين
async function getTopUsers(guildId, type, limit = 5) {
  let sortField = 'totalPoints';
  if (type === 'daily') sortField = 'dailyPoints';
  if (type === 'weekly') sortField = 'weeklyPoints';

  const users = await UserPoints.find({ guildId })
    .sort({ [sortField]: -1 })
    .limit(limit);

  return users.map(u => ({
    userId: u.userId,
    points: Math.floor(u[sortField] * 100) / 100 // تقريب لرقمين
  }));
}

// ==================== onMessage ====================
async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  const settings = await getPointsSettings(message.guild.id);
  
  // التحقق من الرومات المستثناة
  if (settings.excludedChannels.includes(message.channel.id)) return;

  const userPoints = await getUserPoints(message.author.id, message.guild.id);
  
  // إعادة تعيين الفترات إذا لزم الأمر
  await resetPeriodicPoints(userPoints);

  // التحقق من الكولداون
  if (userPoints.lastMessageTime) {
    const timeDiff = Date.now() - userPoints.lastMessageTime.getTime();
    if (timeDiff < 7000) return; // 7 ثواني كولداون
  }

  // حساب النقاط المضافة
  const pointsToAdd = calculatePointsToAdd(userPoints.totalPoints);
  
  // تحديث النقاط
  userPoints.totalPoints += pointsToAdd;
  userPoints.weeklyPoints += pointsToAdd;
  userPoints.dailyPoints += pointsToAdd;
  userPoints.lastMessageTime = new Date();
  
  await userPoints.save();
}

// ==================== معالج الأوامر النصية ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  if (command === 'نقاطي') {
    const userPoints = await getUserPoints(message.author.id, message.guild.id);
    await resetPeriodicPoints(userPoints);
    
    await message.channel.send(
      `-# **تملك حالياً ${Math.floor(userPoints.totalPoints * 100) / 100} نقطة تفاعل <:emoji_35:1474845075950272756> **`
    );
    return true;
  }

  if (command === 'نقاط') {
    const target = message.mentions.users.first();
    if (!target) return false;

    const userPoints = await getUserPoints(target.id, message.guild.id);
    await resetPeriodicPoints(userPoints);
    
    await message.channel.send(
      `-# **يملك المستخدم ${Math.floor(userPoints.totalPoints * 100) / 100} نقطة تفاعل <:emoji_35:1474845075950272756> **`
    );
    return true;
  }

  if (command === 'توب') {
    const topUsers = await getTopUsers(message.guild.id, 'total');
    
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`**ابسلوت خلفاء <:emoji_52:1473620889349128298>**`);

    if (topUsers.length === 0) {
      embed.setDescription(`${embed.data.description}\n\n-# **لا يوجد بيانات بعد**`);
    } else {
      let description = '';
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        description += `-# ** الخليفة <@${user.userId}> حائز على ${user.points} اجمالية**\n`;
      }
      embed.setDescription(`${embed.data.description}\n\n${description}`);
    }
    
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  if (command === 'توب س') {
    const topUsers = await getTopUsers(message.guild.id, 'weekly');
    
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`**خلفاء السبع ليالِ <:emoji_38:1474950090539139182>**`);

    if (topUsers.length === 0) {
      embed.setDescription(`${embed.data.description}\n\n-# **لا يوجد بيانات بعد**`);
    } else {
      let description = '';
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        description += `-# ** الخليفة <@${user.userId}> حائز على ${user.points} في سبع ليالٍ**\n`;
      }
      embed.setDescription(`${embed.data.description}\n\n${description}`);
    }
    
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  if (command === 'توب ي') {
    const topUsers = await getTopUsers(message.guild.id, 'daily');
    
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`**خلفاء الليلة <:emoji_36:1474949953876000950>**`);

    if (topUsers.length === 0) {
      embed.setDescription(`${embed.data.description}\n\n-# **لا يوجد بيانات بعد**`);
    } else {
      let description = '';
      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        description += `-# **الخليفة <@${user.userId}> حائز على ${user.points} الليلة**\n`;
      }
      embed.setDescription(`${embed.data.description}\n\n${description}`);
    }
    
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  return false;
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;

  if (interaction.commandName === 'points') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ 
        content: `-# ** ما عندك صلاحية <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
      return true;
    }

    const sub = interaction.options.getSubcommand();
    const settings = await getPointsSettings(interaction.guild.id);

    if (sub === 'exclude') {
      const channel = interaction.options.getChannel('channel');
      
      if (settings.excludedChannels.includes(channel.id)) {
        // إزالة من المستثناة
        settings.excludedChannels = settings.excludedChannels.filter(id => id !== channel.id);
        await settings.save();
        await interaction.reply({ 
          content: `-# ** تم إزالة <#${channel.id}> من الرومات المستثناة <:2thumbup:1467287897429512396> **`, 
          ephemeral: true 
        });
      } else {
        // إضافة للمستثناة
        settings.excludedChannels.push(channel.id);
        await settings.save();
        await interaction.reply({ 
          content: `-# ** تم إضافة <#${channel.id}> إلى الرومات المستثناة <:new_emoji:1388436089584226387> **`, 
          ephemeral: true 
        });
      }
      return true;
    }

    if (sub === 'list') {
      if (settings.excludedChannels.length === 0) {
        await interaction.reply({ 
          content: `-# **لا توجد رومات مستثناة <:new_emoji:1388436095842385931> **`, 
          ephemeral: true 
        });
      } else {
        const channelsList = settings.excludedChannels.map(id => `<#${id}>`).join('، ');
        await interaction.reply({ 
          content: `-# **الرومات المستثناة: ${channelsList}**`, 
          ephemeral: true 
        });
      }
      return true;
    }
  }

  return false;
}

// ==================== تصدير النظام ====================
module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction
};