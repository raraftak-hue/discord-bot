const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schema ====================
const userPointsSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  daily: { type: Number, default: 0 },
  weekly: { type: Number, default: 0 },
  messageCount: { type: Number, default: 0 },
  lastMsg: { type: Number, default: 0 }
});

// فهرسة مركبة عشان نجيب البيانات بسرعة
userPointsSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const UserPoints = mongoose.models.UserPoints || mongoose.model('UserPoints', userPointsSchema);

// ==================== خزينة منفصلة ====================
const treasurySchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  exchangeRate: { type: Number, default: 1 },
  fundedBy: { type: String, default: null },
  active: { type: Boolean, default: false }
});

const Treasury = mongoose.models.Treasury || mongoose.model('Treasury', treasurySchema);

// ==================== إعدادات الرومات المستثناة ====================
const pointsSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  excludedChannels: { type: [String], default: [] }
});

const PointsSettings = mongoose.models.PointsSettings || mongoose.model('PointsSettings', pointsSettingsSchema);

// ==================== دوال مساعدة ====================

async function getUserData(userId, guildId) {
  let user = await UserPoints.findOne({ userId, guildId });
  if (!user) {
    user = new UserPoints({ userId, guildId });
    await user.save();
  }
  return user;
}

async function getTreasury(guildId) {
  let treasury = await Treasury.findOne({ guildId });
  if (!treasury) {
    treasury = new Treasury({ guildId });
    await treasury.save();
  }
  return treasury;
}

async function getPointsSettings(guildId) {
  let settings = await PointsSettings.findOne({ guildId });
  if (!settings) {
    settings = new PointsSettings({ guildId });
    await settings.save();
  }
  return settings;
}

function getRequiredMessages(weeklyPoints) {
  if (weeklyPoints === 0) return 10;
  if (weeklyPoints === 1) return 20;
  if (weeklyPoints === 2) return 30;
  return 40;
}

async function getTopUsers(guildId, type = 'weekly') {
  const sortField = type === 'weekly' ? 'weekly' : 'daily';
  const users = await UserPoints.find({ guildId, [sortField]: { $gt: 0 } })
    .sort({ [sortField]: -1 })
    .limit(3)
    .select('userId ' + sortField);

  return users.map(u => ({
    userId: u.userId,
    points: u[sortField]
  }));
}

// ==================== onMessage ====================
async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  const settings = await getPointsSettings(message.guild.id);
  if (settings.excludedChannels.includes(message.channel.id)) return;

  const userData = await getUserData(message.author.id, message.guild.id);
  const now = Date.now();

  if (now - userData.lastMsg < 7000) return;

  userData.lastMsg = now;
  const required = getRequiredMessages(userData.weekly);
  userData.messageCount++;

  if (userData.messageCount >= required) {
    userData.daily++;
    userData.weekly++;
    userData.messageCount = 0;
    await userData.save();

    const treasury = await getTreasury(message.guild.id);
    if (treasury.active && treasury.balance >= treasury.exchangeRate) {
      const economy = client.systems.get('economy');
      if (economy) {
        try {
          const memberEconomy = await economy.getUserData(message.author.id);
          memberEconomy.balance += treasury.exchangeRate;
          memberEconomy.history.push({
            type: 'POINTS_REWARD',
            amount: treasury.exchangeRate,
            reason: `استلام ${treasury.exchangeRate} دينار من نظام النقاط <:emoji_41:1471983856440836109>`,
            date: new Date()
          });
          await memberEconomy.save();

          treasury.balance -= treasury.exchangeRate;
          await treasury.save();

          if (treasury.balance <= 0) {
            treasury.active = false;
            await treasury.save();
            const owner = await client.users.fetch(treasury.fundedBy).catch(() => null);
            if (owner) {
              await owner.send(
                `-# **التمويل الخاص بك لنظام النقاط نفذ و الآن سوف يتم التعامل مع النظام على انه بدون تمويل <:new_emoji:1388436095842385931> **`
              );
            }
          }
        } catch (e) {
          console.error('❌ خطأ في نظام الاقتصاد:', e);
        }
      }
    }
  } else {
    await userData.save(); // ضمان حفظ عدد الرسائل حتى لو لم يصل للحد المطلوب
  }
}

// ==================== معالج الأوامر النصية ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  if (command === 'نقاط') {
    const target = message.mentions.users.first() || message.author;
    const userData = await getUserData(target.id, message.guild.id);
    const text = target.id === message.author.id
      ? `تملك حالياً ${userData.daily} نقطة تفاعل<:emoji_35:1474845075950272756>`
      : `يملك المستخدم ${userData.daily} نقطة تفاعل<:emoji_35:1474845075950272756>`;
    await message.channel.send(`-# **${text} **`);
    return true;
  }

  if (command === 'اسبوعي') {
    const topUsers = await getTopUsers(message.guild.id, 'weekly');
    const userData = await getUserData(message.author.id, message.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`**خلفاء السبع ليالِ <:emoji_38:1474950090539139182>**`);

    if (topUsers.length === 0) {
      embed.setDescription(`${embed.data.description}\n\n-# ** انه اسبوع جديد و قائمة جديدة ولا يوجد منافسين حتى الآن <:emoji_32:1471962578895769611> **`);
    } else {
      let desc = '';
      for (let i = 0; i < topUsers.length; i++) {
        desc += `-# ** الخليفة <@${topUsers[i].userId}> حائز على ${topUsers[i].points} في سبع ليالٍ**\n`;
      }
      embed.setDescription(`${embed.data.description}\n\n${desc}`);
    }
    embed.setFooter({ text: `انت تملك ${userData.weekly} نقطة` });
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  if (command === 'يومي') {
    const topUsers = await getTopUsers(message.guild.id, 'daily');
    const userData = await getUserData(message.author.id, message.guild.id);
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`**خلفاء الليلة <:emoji_36:1474949953876000950>**`);

    if (topUsers.length === 0) {
      embed.setDescription(`${embed.data.description}\n\n-# ** انه يوم جديد و قائمة جديدة ولا يوجد منافسين حتى الآن <:emoji_32:1471962578895769611> **`);
    } else {
      let desc = '';
      for (let i = 0; i < topUsers.length; i++) {
        desc += `-# **الخليفة <@${topUsers[i].userId}> حائز على ${topUsers[i].points} الليلة**\n`;
      }
      embed.setDescription(`${embed.data.description}\n\n${desc}`);
    }
    embed.setFooter({ text: `انت تملك ${userData.daily} نقطة` });
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  return false;
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'points') return false;

  const guildId = interaction.guild?.id;
  if (!guildId) return false;

  const sub = interaction.options.getSubcommand();

  // ===== /points ch =====
  if (sub === 'ch') {
    const channel = interaction.options.getChannel('room');
    const settings = await getPointsSettings(guildId);

    if (settings.excludedChannels.includes(channel.id)) {
      settings.excludedChannels = settings.excludedChannels.filter(id => id !== channel.id);
      await settings.save();
      await interaction.reply({ content: `-# **تم إزالة ${channel} من الرومات المستثناة**`, ephemeral: true });
    } else {
      settings.excludedChannels.push(channel.id);
      await settings.save();
      await interaction.reply({ content: `-# **تم إضافة ${channel} إلى الرومات المستثناة**`, ephemeral: true });
    }
    return true;
  }

  // ===== /points info =====
  if (sub === 'info') {
    const settings = await getPointsSettings(guildId);
    const excluded = settings.excludedChannels.map(id => `<#${id}>`).join('، ') || 'لا يوجد';
    const treasury = await getTreasury(guildId);

    await interaction.reply({
      content: `-# **الرومات المستثنى هي ${excluded} يوجد فالخزينة ${treasury.balance} دينار و على كل نقطة ${treasury.exchangeRate} دينار**`,
      ephemeral: true
    });
    return true;
  }

  // ===== /points fund =====
  if (sub === 'fund') {
    const amount = interaction.options.getInteger('amount');
    const newRate = interaction.options.getInteger('rate');
    const economy = client.systems.get('economy');

    if (!economy) {
      return interaction.reply({ content: `-# **نظام الاقتصاد غير مفعل**`, ephemeral: true });
    }

    try {
      const adminData = await economy.getUserData(interaction.user.id);
      if (adminData.balance < amount) {
        return interaction.reply({ content: `-# **رصيدك ما يكفي**`, ephemeral: true });
      }

      adminData.balance -= amount;
      adminData.history.push({
        type: 'FUNDING_DEDUCTION',
        amount: amount,
        reason: `تمويل نظام النقاط بـ ${amount} <:emoji_41:1471619709936996406>`,
        date: new Date()
      });
      await adminData.save();

      const treasury = await getTreasury(guildId);
      treasury.balance += amount;
      treasury.fundedBy = interaction.user.id;
      treasury.active = true;
      if (newRate) treasury.exchangeRate = newRate;
      await treasury.save();

      await interaction.reply({
        content: `-# **تم تمويل الخزينة بــ ${amount} دينار. سعر الصرف الحالي: ${treasury.exchangeRate} دينار لكل نقطة**`,
        ephemeral: true
      });
    } catch (e) {
      console.error(e);
      await interaction.reply({ content: `-# **حدث خطأ**`, ephemeral: true });
    }
    return true;
  }

  // ===== /points reset =====
  if (sub === 'reset') {
    const type = interaction.options.getString('type');
    
    if (type === 'daily' || type === 'all') {
      await UserPoints.updateMany(
        { guildId },
        { $set: { daily: 0 } }
      );
    }
    if (type === 'weekly' || type === 'all') {
      await UserPoints.updateMany(
        { guildId },
        { $set: { weekly: 0 } }
      );
    }

    await interaction.reply({
      content: `-# **تم إعادة تعيين ${type === 'daily' ? 'اليومي' : type === 'weekly' ? 'الأسبوعي' : 'الكل'}**`,
      ephemeral: true
    });
    return true;
  }

  return false;
}

// ==================== onReady ====================
async function onReady(client) {
  console.log('⭐ نظام النقاط مع MongoDB جاهز');
  const usersCount = await UserPoints.countDocuments();
  const treasuryCount = await Treasury.countDocuments();
  console.log(`- إجمالي المستخدمين المسجلين: ${usersCount}`);
  console.log(`- السيرفرات المفعلة للخزينة: ${treasuryCount}`);
}

module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction,
  onReady
};
