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
  channelId: { type: String, default: null },
  customMessage: { type: String, default: 'مبروك {user} وصلت {points} نقطة' },
  lastMessage: { type: Map, of: Date, default: new Map() }
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

// ==================== onMessage (للرسائل العادية) ====================
async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  // نظام زيادة النقاط تلقائياً
  const settings = await PointsSettings.findOne({ guildId: message.guild.id });
  if (settings && settings.enabled) {
    let pointsData = await Points.findOne({ guildId: message.guild.id, userId: message.author.id });
    if (!pointsData) {
      pointsData = new Points({ guildId: message.guild.id, userId: message.author.id });
    }
    
    pointsData.messages += 1;
    pointsData.xp += 1;
    
    const { points: newPoints } = calculatePointsFromMessages(pointsData.messages);
    
    if (newPoints > pointsData.points) {
      pointsData.points = newPoints;
      await pointsData.save();
    }
  }
}

// ==================== معالج الأوامر النصية ====================
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
    
    const pointsSettings = await PointsSettings.findOne({ guildId: message.guild.id });
    
    let replyMsg = `-# ** نقاطك حالياً ${pointsData.points} و باقيلك ${remaining} رسالة عشان تزيد نقطة`;
    
    if (pointsSettings && pointsSettings.rewardPerPoint && pointsSettings.rewardPerPoint > 0) {
      const totalEarned = pointsData.points * pointsSettings.rewardPerPoint;
      replyMsg += ` (كسبت ${totalEarned} دينار)`;
    }
    
    replyMsg += ` <:emoji_32:1471962578895769611> **`;
    
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
    
    let leaderboardText = '';
    topPoints.forEach((entry, idx) => {
      leaderboardText += `-# ** الخليفة <@${entry.userId}> ${entry.points} نقطة**\n`;
    });
    
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
  const { commandName, options } = interaction;

  if (commandName === 'points') {
    const sub = options.getSubcommand();
    
    if (sub === 'setup') {
      const channel = options.getChannel('channel');
      const customMessage = options.getString('message');
      const reward = options.getInteger('reward');
      
      let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
      
      if (!settings) {
        settings = new PointsSettings({
          guildId: interaction.guild.id,
          enabled: true,
          channelId: channel?.id || null,
          customMessage: customMessage || 'مبروك {user} وصلت {points} نقطة',
          rewardPerPoint: reward || 0
        });
      } else {
        settings.enabled = true;
        if (channel) settings.channelId = channel.id;
        if (customMessage) settings.customMessage = customMessage;
        if (reward !== null) settings.rewardPerPoint = reward;
      }
      
      await settings.save();
      
      let replyMsg = `-# ** تم تفعيل نظام النقاط في السيرفر <:new_emoji:1388436089584226387> **`;
      if (channel) replyMsg += `\n-# **📢 الروم: <#${channel.id}>**`;
      if (customMessage) replyMsg += `\n-# **📝 الرسالة: ${customMessage}**`;
      if (reward) replyMsg += `\n-# **💰 المكافأة: ${reward} دينار لكل نقطة**`;
      
      await interaction.reply({ content: replyMsg, ephemeral: true });
      return true;
    }
    
    if (sub === 'disable') {
      let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
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
      let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
      if (settings) {
        settings.enabled = true;
        await settings.save();
      } else {
        settings = new PointsSettings({
          guildId: interaction.guild.id,
          enabled: true
        });
        await settings.save();
      }
      await interaction.reply({ 
        content: `-# **تم تشغيل نظام النقاط <:new_emoji:1388436089584226387> **`, 
        ephemeral: true 
      });
      return true;
    }
    
    if (sub === 'reset') {
      await Points.deleteMany({ guildId: interaction.guild.id });
      let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
      if (settings) {
        settings.enabled = true;
        settings.rewardPerPoint = 0;
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

// ==================== تصدير النظام ====================
module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction
};