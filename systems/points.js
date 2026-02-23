const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const POINTS_FILE = path.join(__dirname, 'points.json');

// ==================== هيكل البيانات الأساسي ====================
const DEFAULT_DATA = {
  users: {},
  treasury: {}
};

// تحميل أو إنشاء ملف البيانات
let pointsData = { ...DEFAULT_DATA };
try {
  if (fs.existsSync(POINTS_FILE)) {
    const raw = fs.readFileSync(POINTS_FILE, 'utf8');
    pointsData = JSON.parse(raw);
  }
  
  // نضمن وجود users و treasury حتى لو الملف قديم أو فاضي
  if (!pointsData.users) pointsData.users = {};
  if (!pointsData.treasury) pointsData.treasury = {};
  
} catch (error) {
  console.error('❌ خطأ في قراءة ملف النقاط، سيتم إنشاء ملف جديد:', error.message);
  pointsData = { ...DEFAULT_DATA };
}

// حفظ البيانات في الملف
function saveToFile() {
  try {
    fs.writeFileSync(POINTS_FILE, JSON.stringify(pointsData, null, 2));
    console.log('💾 تم حفظ النقاط في الملف');
  } catch (error) {
    console.error('❌ خطأ في حفظ الملف:', error.message);
  }
}

// ==================== دوال مساعدة ====================

function getUserData(userId, guildId) {
  const key = `${guildId}-${userId}`;
  if (!pointsData.users[key]) {
    pointsData.users[key] = {
      daily: 0,
      weekly: 0,
      messageCount: 0,
      lastMsg: 0,
    };
  }
  return pointsData.users[key];
}

function getRequiredMessages(weeklyPoints) {
  if (weeklyPoints === 0) return 10;
  if (weeklyPoints === 1) return 20;
  if (weeklyPoints === 2) return 30;
  return 40;
}

function getTopUsers(guildId, type = 'weekly') {
  const users = [];
  
  for (const [key, data] of Object.entries(pointsData.users)) {
    if (key.startsWith(guildId)) {
      const points = data[type] || 0;
      if (points > 0) {
        users.push({ 
          userId: key.split('-')[1], 
          points 
        });
      }
    }
  }
  
  return users.sort((a, b) => b.points - a.points).slice(0, 3);
}

// ==================== onMessage ====================
async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  const userData = getUserData(message.author.id, message.guild.id);
  const now = Date.now();

  if (now - userData.lastMsg < 7000) return;

  userData.lastMsg = now;
  const required = getRequiredMessages(userData.weekly);
  userData.messageCount++;

  if (userData.messageCount >= required) {
    userData.daily++;
    userData.weekly++;
    userData.messageCount = 0;
    saveToFile();

    // صرف من الخزينة إذا كانت مفعلة
    const treasury = pointsData.treasury[message.guild.id];
    if (treasury?.active && treasury.balance >= treasury.exchangeRate) {
      const economy = client.systems.get('economy.js');
      if (economy) {
        try {
          const memberEconomy = await economy.getUserData(message.author.id, message.guild.id);
          memberEconomy.balance += treasury.exchangeRate;
          memberEconomy.history.push({
            type: 'POINTS_REWARD',
            amount: treasury.exchangeRate,
            date: new Date()
          });
          await memberEconomy.save();

          treasury.balance -= treasury.exchangeRate;
          saveToFile();

          if (treasury.balance <= 0) {
            treasury.active = false;
            saveToFile();
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
  }
}

// ==================== معالج الأوامر النصية ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  if (command === 'نقاط') {
    const target = message.mentions.users.first() || message.author;
    const userData = getUserData(target.id, message.guild.id);
    const text = target.id === message.author.id
      ? `تملك حالياً ${userData.daily} نقطة تفاعل<:emoji_35:1474845075950272756>`
      : `يملك المستخدم ${userData.daily} نقطة تفاعل<:emoji_35:1474845075950272756>`;
    await message.channel.send(`-# **${text} **`);
    return true;
  }

  if (command === 'اسبوعي') {
    const topUsers = getTopUsers(message.guild.id, 'weekly');
    const userPoints = getUserData(message.author.id, message.guild.id).weekly;
    
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`**خلفاء السبع ليالِ <:emoji_38:1474950090539139182>**`);

    if (topUsers.length === 0) {
      embed.setDescription(`${embed.data.description}\n\n-# **انه اسبوع جديد و قائمة جديدة ولا يوجد منافسين حتى الآن <:emoji_32:1471962578895769611> **`);
    } else {
      let desc = '';
      for (let i = 0; i < topUsers.length; i++) {
        desc += `-# ** الخليفة <@${topUsers[i].userId}> حائز على ${topUsers[i].points} في سبع ليالٍ**\n`;
      }
      embed.setDescription(`${embed.data.description}\n\n${desc}`);
    }

    embed.setFooter({ text: `انت تملك ${userPoints} نقطة` });
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  if (command === 'يومي') {
    const topUsers = getTopUsers(message.guild.id, 'daily');
    const userPoints = getUserData(message.author.id, message.guild.id).daily;
    
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`**خلفاء الليلة <:emoji_36:1474949953876000950>**`);

    if (topUsers.length === 0) {
      embed.setDescription(`${embed.data.description}\n\n-# **انه يوم جديد و قائمة جديدة ولا يوجد منافسين حتى الآن <:emoji_32:1471962578895769611> **`);
    } else {
      let desc = '';
      for (let i = 0; i < topUsers.length; i++) {
        desc += `-# **الخليفة <@${topUsers[i].userId}> حائز على ${topUsers[i].points} الليلة**\n`;
      }
      embed.setDescription(`${embed.data.description}\n\n${desc}`);
    }

    embed.setFooter({ text: `انت تملك ${userPoints} نقطة` });
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  return false;
}

async function getPointsSettings(guildId) {
  return { excludedChannels: [] };
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'points') return false;

  const guildId = interaction.guild?.id;
  if (!guildId) return false;

  const sub = interaction.options.getSubcommand();

  // تجهيز الخزينة للسيرفر إذا ما كانت موجودة
  if (!pointsData.treasury[guildId]) {
    pointsData.treasury[guildId] = {
      balance: 0,
      exchangeRate: 1,
      fundedBy: null,
      active: false
    };
  }

  // ===== /points ch =====
  if (sub === 'ch') {
    const channel = interaction.options.getChannel('room');
    const settings = await getPointsSettings(guildId);

    if (settings.excludedChannels.includes(channel.id)) {
      settings.excludedChannels = settings.excludedChannels.filter(id => id !== channel.id);
      await interaction.reply({ content: `-# **تم إزالة ${channel} من الرومات المستثناة**`, ephemeral: true });
    } else {
      settings.excludedChannels.push(channel.id);
      await interaction.reply({ content: `-# **تم إضافة ${channel} إلى الرومات المستثناة**`, ephemeral: true });
    }
    return true;
  }

  // ===== /points info =====
  if (sub === 'info') {
    const settings = await getPointsSettings(guildId);
    const excluded = settings.excludedChannels.map(id => `<#${id}>`).join('، ') || 'لا يوجد';
    const treasury = pointsData.treasury[guildId];

    await interaction.reply({
      content: `-# **الرومات المستثنى هي ${excluded} يوجد فالخزينة ${treasury.balance} دينار و على كل ${treasury.exchangeRate} دينار لكل نقطة**`,
      ephemeral: true
    });
    return true;
  }

  // ===== /points fund =====
  if (sub === 'fund') {
    const amount = interaction.options.getInteger('amount');
    const newRate = interaction.options.getInteger('rate');
    const economy = client.systems.get('economy.js');

    if (!economy) {
      return interaction.reply({ content: `-# **نظام الاقتصاد غير مفعل**`, ephemeral: true });
    }

    try {
      const adminData = await economy.getUserData(interaction.user.id, guildId);
      if (adminData.balance < amount) {
        return interaction.reply({ content: `-# **رصيدك ما يكفي**`, ephemeral: true });
      }

      adminData.balance -= amount;
      adminData.history.push({
        type: 'FUNDING_DEDUCTION',
        amount: amount,
        date: new Date()
      });
      await adminData.save();

      const treasury = pointsData.treasury[guildId];
      treasury.balance += amount;
      treasury.fundedBy = interaction.user.id;
      treasury.active = true;
      if (newRate) treasury.exchangeRate = newRate;
      saveToFile();

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
    let count = 0;

    for (const key in pointsData.users) {
      if (key.startsWith(guildId)) {
        if (type === 'daily' || type === 'all') {
          pointsData.users[key].daily = 0;
          count++;
        }
        if (type === 'weekly' || type === 'all') {
          pointsData.users[key].weekly = 0;
          count++;
        }
      }
    }

    saveToFile();
    await interaction.reply({
      content: `-# **تم إعادة تعيين ${type === 'daily' ? 'اليومي' : type === 'weekly' ? 'الأسبوعي' : 'الكل'} لـ ${count} مستخدم**`,
      ephemeral: true
    });
    return true;
  }

  return false;
}

// ==================== onReady ====================
async function onReady(client) {
  console.log('⭐ نظام النقاط مع الخزينة جاهز');
  console.log(`- إجمالي المستخدمين المسجلين: ${Object.keys(pointsData.users).length}`);
  console.log(`- السيرفرات المفعلة للخزينة: ${Object.keys(pointsData.treasury).length}`);
}

module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction,
  onReady
};