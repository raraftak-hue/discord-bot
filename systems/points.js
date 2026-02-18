const { EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
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
  funded: { type: Boolean, default: false },
  treasury: { type: Number, default: 0 },
  totalFunded: { type: Number, default: 0 },
  lastFundAmount: { type: Number, default: 0 }
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
    
    if (settings.rewardPerPoint > 0 && settings.pointsPerReward > 0 && settings.treasury > 0) {
      const rewardAmount = Math.floor(pointsGained / settings.pointsPerReward) * settings.rewardPerPoint;
      
      if (rewardAmount > 0 && settings.treasury >= rewardAmount) {
        settings.treasury -= rewardAmount;
        
        const User = mongoose.model('User');
        let userData = await User.findOne({ userId: message.author.id });
        if (!userData) userData = new User({ userId: message.author.id });
        userData.balance += rewardAmount;
        
        userData.history.push({ 
          type: 'POINTS_REWARD', 
          amount: rewardAmount, 
          date: new Date() 
        });
        
        await userData.save();
        await settings.save();
      }
      
      if (settings.treasury <= 0) {
        settings.funded = false;
        await settings.save();
        
        const owner = await client.users.fetch(message.guild.ownerId);
        if (owner) {
          await owner.send(`-# ** دنانير التمويل المكافأة خلصت و الان سوف يتم التعامل مع النقاط كانها بدون مكافأة <:2thumbup:1467287897429512396> **`).catch(() => {});
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
  const settings = await PointsSettings.findOne({ guildId: message.guild.id });
  
  if (command === 'نقاطي') {
    if (!settings || !settings.enabled) {
      const msg = await message.channel.send(`-# **نظام النقاط غير مفعل خلي اونركم يفعله <:emoji_32:1471962578895769611> **`);
      setTimeout(() => msg.delete().catch(() => {}), 10000);
      return true;
    }
    
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
    if (!settings || !settings.enabled) {
      const msg = await message.channel.send(`-# **نظام النقاط غير مفعل خلي اونركم يفعله <:emoji_32:1471962578895769611> **`);
      setTimeout(() => msg.delete().catch(() => {}), 10000);
      return true;
    }
    
    const topPoints = await Points.find({ guildId: message.guild.id })
      .sort({ points: -1 })
      .limit(5);
    
    if (topPoints.length === 0) {
      await message.channel.send(`-# **ما في نقاط مسجلة يا خليفة <:emoji_52:1473620889349128298>**`);
      return true;
    }
    
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
  if (!interaction.isChatInputCommand() && !interaction.isButton() && !interaction.isModalSubmit() && !interaction.isChannelSelectMenu()) return false;
  
  // ===== أمر السلاش الرئيسي =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'points') {
    let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
    
    if (!settings) {
      settings = new PointsSettings({
        guildId: interaction.guild.id,
        enabled: true,
        funded: false,
        treasury: 0,
        totalFunded: 0,
        lastFundAmount: 0,
        rewardPerPoint: 0,
        pointsPerReward: 1
      });
      await settings.save();
    }
    
    const statusText = settings.enabled ? 'مفعل' : 'غير مفعل';
    const lastFund = settings.lastFundAmount || 0;
    
    const description = `**حالة النضام <:new_emoji:1388436089584226387>**\n\n` +
      `-# ** النظام ${statusText} و الخزينة فيها ${settings.treasury} و اخر تمويل تم اضافته كان بـ ${lastFund} دينار <:emoji_41:1471619709936996406> **`;
    
    const embed = new EmbedBuilder()
      .setDescription(description)
      .setColor(0x2b2d31);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('points_toggle')
        .setLabel(settings.enabled ? 'تعطيل' : 'تفعيل')
        .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('points_fund')
        .setLabel('تمويل')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('points_reset')
        .setLabel('إعادة تعيين')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('points_settings')
        .setLabel('إعدادات')
        .setStyle(ButtonStyle.Secondary)
    );
    
    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    return true;
  }
  
  // ===== معالج أزرار الحالة =====
  if (interaction.isButton()) {
    if (interaction.customId === 'points_toggle') {
      let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
      if (settings) {
        settings.enabled = !settings.enabled;
        await settings.save();
        
        const statusText = settings.enabled ? 'مفعل' : 'غير مفعل';
        const lastFund = settings.lastFundAmount || 0;
        
        const description = `**حالة النضام <:new_emoji:1388436089584226387>**\n\n` +
          `-# ** النظام ${statusText} و الخزينة فيها ${settings.treasury} و اخر تمويل تم اضافته كان بـ ${lastFund} دينار <:emoji_41:1471619709936996406> **`;
        
        const embed = new EmbedBuilder()
          .setDescription(description)
          .setColor(0x2b2d31);
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('points_toggle')
            .setLabel(settings.enabled ? 'تعطيل' : 'تفعيل')
            .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('points_fund')
            .setLabel('تمويل')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('points_reset')
            .setLabel('إعادة تعيين')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('points_settings')
            .setLabel('إعدادات')
            .setStyle(ButtonStyle.Secondary)
        );
        
        await interaction.update({ embeds: [embed], components: [row] });
      }
      return true;
    }
    
    if (interaction.customId === 'points_fund') {
      const modal = new ModalBuilder()
        .setCustomId('fund_modal')
        .setTitle('تمويل نظام النقاط');
      
      const amountInput = new TextInputBuilder()
        .setCustomId('fund_amount')
        .setLabel('المبلغ (دينار)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(5);
      
      const pointsInput = new TextInputBuilder()
        .setCustomId('fund_points')
        .setLabel('كم نقطة لكل دينار')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(2);
      
      const firstRow = new ActionRowBuilder().addComponents(amountInput);
      const secondRow = new ActionRowBuilder().addComponents(pointsInput);
      
      modal.addComponents(firstRow, secondRow);
      
      await interaction.showModal(modal);
      return true;
    }
    
    if (interaction.customId === 'points_reset') {
      if (interaction.user.id !== interaction.guild.ownerId) {
        await interaction.reply({ 
          content: `-# ** فقط مالك السيرفر يستطيع إعادة تعيين النظام <:emoji_84:1389404919672340592> **`, 
          ephemeral: true 
        });
        return true;
      }
      
      await Points.deleteMany({ guildId: interaction.guild.id });
      let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
      if (settings) {
        settings.enabled = true;
        settings.funded = false;
        settings.treasury = 0;
        settings.totalFunded = 0;
        settings.lastFundAmount = 0;
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
    
    if (interaction.customId === 'points_settings') {
      let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
      const channelMention = settings?.channelId ? `<#${settings.channelId}>` : 'غير محدد';
      const currentMessage = settings?.customMessage || 'مبروك {user} وصلت {points} نقطة';
      
      const embed = new EmbedBuilder()
        .setTitle('الإعدادات')
        .setDescription(
          `-# ** الرسالة الحالية هي ${currentMessage} **\n` +
          `-# ** روم الرسالة الحالي هو ${channelMention}**`
        )
        .setColor(0x2b2d31);
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('change_message')
          .setLabel('تغيير الرسالة')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('change_channel')
          .setLabel('تغيير الروم')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('back_to_main')
          .setLabel('🔙 رجوع')
          .setStyle(ButtonStyle.Secondary)
      );
      
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return true;
    }

    if (interaction.customId === 'change_message') {
      const modal = new ModalBuilder()
        .setCustomId('message_modal')
        .setTitle('تغيير رسالة التهنئة');
      
      const messageInput = new TextInputBuilder()
        .setCustomId('new_message')
        .setLabel('الرسالة الجديدة (استخدم {user} و {points})')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(200);
      
      const row = new ActionRowBuilder().addComponents(messageInput);
      modal.addComponents(row);
      
      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId === 'change_channel') {
      const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('channel_select')
          .setPlaceholder('اختر روم التهنئة')
          .setChannelTypes([ChannelType.GuildText])
      );
      
      await interaction.reply({ 
        content: 'اختر الروم الجديد:', 
        components: [row], 
        ephemeral: true 
      });
      return true;
    }

    if (interaction.customId === 'back_to_main') {
      // نرجع للقائمة الرئيسية
      const cmdInteraction = interaction;
      cmdInteraction.commandName = 'points';
      return onInteraction(client, cmdInteraction);
    }
  }
  
  // ===== معالج اختيار الروم =====
  if (interaction.isChannelSelectMenu() && interaction.customId === 'channel_select') {
    const channelId = interaction.values[0];
    let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
    
    if (settings) {
      settings.channelId = channelId;
      await settings.save();
      
      await interaction.reply({ 
        content: `-# ** تم تعيين روم التهنئة إلى <#${channelId}> بنجاح <:2thumbup:1467287897429512396> **`, 
        ephemeral: true 
      });
    }
    return true;
  }
  
  // ===== معالج Modal التمويل =====
  if (interaction.isModalSubmit() && interaction.customId === 'fund_modal') {
    if (interaction.user.id !== interaction.guild.ownerId) {
      await interaction.reply({ 
        content: `-# ** فقط مالك السيرفر يستطيع تمويل النظام <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
      return true;
    }
    
    const amount = parseInt(interaction.fields.getTextInputValue('fund_amount'));
    const pointsPerReward = parseInt(interaction.fields.getTextInputValue('fund_points'));
    
    if (!amount || amount <= 0 || !pointsPerReward || pointsPerReward <= 0) {
      await interaction.reply({ 
        content: `-# ** القيمة غير صحيحة <:__:1467633552408576192> **`, 
        ephemeral: true 
      });
      return true;
    }
    
    const rewardPerPoint = 1 / pointsPerReward;
    
    const User = mongoose.model('User');
    const ownerData = await User.findOne({ userId: interaction.user.id });
    
    if (!ownerData || ownerData.balance < amount) {
      await interaction.reply({ 
        content: `-# ** ما عندك ذي الكمية من الدنانير لتمويل النظام <:emoji_38:1401773302619439147> **`, 
        ephemeral: true 
      });
      return true;
    }
    
    ownerData.balance -= amount;
    ownerData.history.push({ 
      type: 'POINTS_FUND', 
      amount: -amount, 
      date: new Date() 
    });
    await ownerData.save();
    
    let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
    if (!settings) {
      settings = new PointsSettings({
        guildId: interaction.guild.id,
        enabled: true,
        funded: true,
        treasury: amount,
        totalFunded: amount,
        lastFundAmount: amount,
        rewardPerPoint: rewardPerPoint,
        pointsPerReward: pointsPerReward
      });
    } else {
      settings.funded = true;
      settings.treasury = (settings.treasury || 0) + amount;
      settings.totalFunded = (settings.totalFunded || 0) + amount;
      settings.lastFundAmount = amount;
      settings.rewardPerPoint = rewardPerPoint;
      settings.pointsPerReward = pointsPerReward;
    }
    await settings.save();
    
    // تحديث الرسالة الرئيسية
    const statusText = settings.enabled ? 'مفعل' : 'غير مفعل';
    const lastFund = settings.lastFundAmount || 0;
    
    const description = `**حالة النضام <:new_emoji:1388436089584226387>**\n\n` +
      `-# ** النظام ${statusText} و الخزينة فيها ${settings.treasury} و اخر تمويل تم اضافته كان بـ ${lastFund} دينار <:emoji_41:1471619709936996406> **`;
    
    const embed = new EmbedBuilder()
      .setDescription(description)
      .setColor(0x2b2d31);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('points_toggle')
        .setLabel(settings.enabled ? 'تعطيل' : 'تفعيل')
        .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('points_fund')
        .setLabel('تمويل')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('points_reset')
        .setLabel('إعادة تعيين')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('points_settings')
        .setLabel('إعدادات')
        .setStyle(ButtonStyle.Secondary)
    );
    
    await interaction.reply({ 
      content: `-# **تم تمويل نظام النقاط بـ ${amount} دينار لكل ${pointsPerReward} نقاط و الخزينة فيها ${settings.treasury} دينار <:2thumbup:1467287897429512396> **`, 
      ephemeral: true 
    });
    
    // تحديث الرسالة الأصلية للمستخدم
    await interaction.message?.edit({ embeds: [embed], components: [row] }).catch(() => {});
    return true;
  }

  // ===== معالج Modal تغيير الرسالة =====
  if (interaction.isModalSubmit() && interaction.customId === 'message_modal') {
    const newMessage = interaction.fields.getTextInputValue('new_message');
    
    let settings = await PointsSettings.findOne({ guildId: interaction.guild.id });
    if (settings) {
      settings.customMessage = newMessage;
      await settings.save();
      
      // تحديث رسالة الإعدادات
      const channelMention = settings?.channelId ? `<#${settings.channelId}>` : 'غير محدد';
      
      const embed = new EmbedBuilder()
        .setTitle('الإعدادات')
        .setDescription(
          `-# ** الرسالة الحالية هي ${newMessage} **\n` +
          `-# ** روم الرسالة الحالي هو ${channelMention}**`
        )
        .setColor(0x2b2d31);
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('change_message')
          .setLabel('تغيير الرسالة')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('change_channel')
          .setLabel('تغيير الروم')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('back_to_main')
          .setLabel('🔙 رجوع')
          .setStyle(ButtonStyle.Secondary)
      );
      
      await interaction.reply({ 
        embeds: [embed], 
        components: [row], 
        ephemeral: true 
      });
    }
    return true;
  }
  
  return false;
}

module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction
};