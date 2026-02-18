const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const PointsSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  messages: { type: Number, default: 0 }
});

const PointsSettingsSchema = new mongoose.Schema({
  guildId: String,
  enabled: { type: Boolean, default: false },
  rewardPerPoint: { type: Number, default: 0 },
  pointsPerReward: { type: Number, default: 1 },
  channelId: { type: String, default: null },
  customMessage: { type: String, default: 'مبروك {user} وصلت {points} نقطة' },
  lastMessage: { type: Map, of: Date, default: new Map() },
  funded: { type: Boolean, default: false }
});

const Points = mongoose.model('Points', PointsSchema);
const PointsSettings = mongoose.model('PointsSettings', PointsSettingsSchema);

// ==================== 🔧 الدوال المساعدة ====================
function getRequiredMessages(points) {
  if (points < 5) return 5;
  else if (points < 15) return 10;
  else if (points < 30) return 20;
  else if (points < 50) return 35;
  else if (points < 75) return 55;
  else if (points < 100) return 80;
  else return 100;
}

function calculatePointsFromMessages(totalMessages) {
  let points = 0;
  let remainingMessages = totalMessages;
  while (remainingMessages >= getRequiredMessages(points)) {
    remainingMessages -= getRequiredMessages(points);
    points++;
  }
  return { points, remainingMessages };
}

// ==================== onMessage ====================
async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  const settings = await PointsSettings.findOne({ guildId: message.guild.id });
  if (!settings || !settings.enabled || !settings.funded) return;

  let pointsData = await Points.findOne({ guildId: message.guild.id, userId: message.author.id });
  if (!pointsData) {
    pointsData = new Points({ guildId: message.guild.id, userId: message.author.id });
  }
  
  pointsData.messages += 1;
  pointsData.xp += 1;
  
  const { points: newPoints } = calculatePointsFromMessages(pointsData.messages);
  
  if (newPoints > pointsData.points) {
    const pointsGained = newPoints - pointsData.points;
    pointsData.points = newPoints;
    
    if (settings.rewardPerPoint > 0 && settings.pointsPerReward > 0) {
      const rewardAmount = Math.floor(pointsGained / settings.pointsPerReward) * settings.rewardPerPoint;
      
      if (rewardAmount > 0) {
        const User = mongoose.model('User');
        const ownerData = await User.findOne({ userId: message.guild.ownerId });
        
        if (ownerData && ownerData.balance >= rewardAmount) {
          ownerData.balance -= rewardAmount;
          await ownerData.save();
          
          let userData = await User.findOne({ userId: message.author.id });
          if (!userData) userData = new User({ userId: message.author.id });
          userData.balance += rewardAmount;
          
          userData.history.push({ 
            type: 'POINTS_REWARD', 
            amount: rewardAmount, 
            date: new Date() 
          });
          
          await userData.save();
        }
      }
    }
    
    let pointsMessage = settings.customMessage || 'مبروك {user} وصلت {points} نقطة';
    pointsMessage = pointsMessage.replace('{user}', `<@${message.author.id}>`);
    pointsMessage = pointsMessage.replace('{points}', newPoints);
    pointsMessage = `-# ** ${pointsMessage} <:emoji_32:1471962578895769611> **`;
    
    if (settings.channelId) {
      const pointsChannel = message.guild.channels.cache.get(settings.channelId);
      if (pointsChannel) {
        pointsChannel.send(pointsMessage).catch(() => {});
      } else {
        message.channel.send(pointsMessage).catch(() => {});
      }
    } else {
      message.channel.send(pointsMessage).catch(() => {});
    }
    
    await pointsData.save();
  }
}

// ==================== handleTextCommand ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (command === 'نقاطي') {
    const pointsData = await Points.findOne({ 
      guildId: message.guild.id, 
      userId: message.author.id 
    });
    
    if (!pointsData) {
      await message.channel.send(`-# **ما عندك نقاط، اكتب شوية رسايل <:emoji_32:1471962578895769611>**`);
      return true;
    }
    
    const { remainingMessages } = calculatePointsFromMessages(pointsData.messages);
    const requiredForNext = getRequiredMessages(pointsData.points);
    const remaining = requiredForNext - remainingMessages;
    
    let replyMsg = `-# ** نقاطك حالياً ${pointsData.points} و باقيلك ${remaining} رسالة عشان تزيد نقطة <:emoji_32:1471962578895769611> **`;
    
    await message.channel.send(replyMsg);
    return true;
  }

  if (command === 'نقاط') {
    const topPoints = await Points.find({ guildId: message.guild.id })
      .sort({ points: -1 })
      .limit(5);
    
    if (topPoints.length === 0) {
      await message.channel.send(`-# **ما في نقاط مسجلة يا خليفة <:emoji_52:1473620889349128298>**`);
      return true;
    }
    
    const settings = await PointsSettings.findOne({ guildId: message.guild.id });
    const rewardPerPoint = settings?.rewardPerPoint || 0;
    
    let leaderboardText = '';
    
    for (const entry of topPoints) {
      const earnedMoney = Math.floor(entry.points * rewardPerPoint);
      
      if (earnedMoney > 0) {
        leaderboardText += `-# ** الخليفة <@${entry.userId}> ${entry.points} نقاط و كسبت ${earnedMoney} دينار **\n`;
      } else {
        leaderboardText += `-# ** الخليفة <@${entry.userId}> ${entry.points} نقاط **\n`;
      }
    }
    
    const embed = new EmbedBuilder()
      .setDescription(`**خلفاء السبع ليالِ <:emoji_52:1473620889349128298>**\n\n${leaderboardText}`)
      .setColor(0x2b2d31);
    
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  return false;
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;
  const { commandName, options, guild, user } = interaction;

  if (commandName === 'points') {
    const sub = options.getSubcommand();
    
    if (sub === 'setup') {
      const channel = options.getChannel('channel');
      const customMessage = options.getString('message');
      
      let settings = await PointsSettings.findOne({ guildId: guild.id });
      
      if (!settings) {
        settings = new PointsSettings({
          guildId: guild.id,
          enabled: true,
          funded: false,
          channelId: channel?.id || null,
          customMessage: customMessage || 'مبروك {user} وصلت {points} نقطة'
        });
      } else {
        settings.enabled = true;
        if (channel) settings.channelId = channel.id;
        if (customMessage) settings.customMessage = customMessage;
      }
      
      await settings.save();
      
      let replyMsg = `-# ** تم تفعيل نظام النقاط في السيرفر <:new_emoji:1388436089584226387> **`;
      if (channel) replyMsg += `\n-# **📢 الروم: <#${channel.id}>**`;
      if (customMessage) replyMsg += `\n-# **📝 الرسالة: ${customMessage}**`;
      replyMsg += `\n-# **⚠️ النظام غير ممول، استخدم /points fund لتمويله**`;
      
      await interaction.reply({ content: replyMsg, ephemeral: true });
      return true;
    }
    
    if (sub === 'fund') {
      // التأكد أن المستخدم هو مالك السيرفر
      if (user.id !== guild.ownerId) {
        await interaction.reply({ 
          content: `-# ** فقط مالك السيرفر يستطيع تمويل النظام <:emoji_84:1389404919672340592> **`, 
          ephemeral: true 
        });
        return true;
      }
      
      const amount = options.getInteger('amount');
      const pointsPerReward = options.getInteger('points');
      
      if (!amount || amount <= 0 || !pointsPerReward || pointsPerReward <= 0) {
        await interaction.reply({ 
          content: `-# ** القيمة غير صحيحة <:__:1467633552408576192> **`, 
          ephemeral: true 
        });
        return true;
      }
      
      const rewardPerPoint = 1 / pointsPerReward;
      
      const User = mongoose.model('User');
      const ownerData = await User.findOne({ userId: user.id });
      
      // التحقق من الرصيد
      if (!ownerData || ownerData.balance < amount) {
        await interaction.reply({ 
          content: `-# ** ما عندك ذي الكمية من الدنانير لتمويل النظام <:emoji_38:1401773302619439147> **`, 
          ephemeral: true 
        });
        return true;
      }
      
      // خصم المبلغ من مالك السيرفر
      ownerData.balance -= amount;
      ownerData.history.push({ 
        type: '-# ** تمويل نضام النقاط <:emoji_41:1471619709936996406> **', 
        amount: -amount, 
        date: new Date() 
      });
      await ownerData.save();
      
      // تحديث إعدادات النظام
      let settings = await PointsSettings.findOne({ guildId: guild.id });
      if (!settings) {
        settings = new PointsSettings({
          guildId: guild.id,
          enabled: true,
          funded: true,
          rewardPerPoint: rewardPerPoint,
          pointsPerReward: pointsPerReward
        });
      } else {
        settings.funded = true;
        settings.rewardPerPoint = rewardPerPoint;
        settings.pointsPerReward = pointsPerReward;
      }
      await settings.save();
      
      await interaction.reply({ 
        content: `-# **تم تمويل نظام النقاط بـ ${amount} دينار لكل ${pointsPerReward} نقاط <:2thumbup:1467287897429512396> **`, 
        ephemeral: true 
      });
      return true;
    }
    
    if (sub === 'disable') {
      let settings = await PointsSettings.findOne({ guildId: guild.id });
      if (settings) {
        settings.enabled = false;
        await settings.save();
      }
      await interaction.reply({ 
        content: `-# ** تم إطفاء نظام النقاط <:new_emoji:1388436095842385931> **`, 
        ephemeral: true 
      });
      return true;
    }
    
    if (sub === 'enable') {
      let settings = await PointsSettings.findOne({ guildId: guild.id });
      if (settings) {
        settings.enabled = true;
        await settings.save();
      } else {
        settings = new PointsSettings({
          guildId: guild.id,
          enabled: true,
          funded: false
        });
        await settings.save();
      }
      
      let replyMsg = `-# **تم تشغيل نظام النقاط <:new_emoji:1388436089584226387> **`;
      if (!settings.funded) {
        replyMsg += `\n-# **⚠️ النظام غير ممول، استخدم /points fund لتمويله**`;
      }
      
      await interaction.reply({ content: replyMsg, ephemeral: true });
      return true;
    }
    
    if (sub === 'reset') {
      await Points.deleteMany({ guildId: guild.id });
      let settings = await PointsSettings.findOne({ guildId: guild.id });
      if (settings) {
        settings.enabled = true;
        settings.funded = false;
        settings.rewardPerPoint = 0;
        settings.pointsPerReward = 1;
        await settings.save();
      }
      
      await interaction.reply({ 
        content: `-# **تم اعادة تعيين نظام النقاط <:2thumbup:1467287897429512396> **`, 
        ephemeral: true 
      });
      return true;
    }
  }
  
  return false;
}

module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction
};