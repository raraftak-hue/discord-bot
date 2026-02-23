const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const POINTS_FILE = path.join(__dirname, 'points.json');

if (!fs.existsSync(POINTS_FILE)) {
  fs.writeFileSync(POINTS_FILE, JSON.stringify({}));
}

let pointsData = {};
try {
  pointsData = JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
} catch {
  pointsData = {};
  fs.writeFileSync(POINTS_FILE, JSON.stringify({}));
}

// هيكل الخزينة (يُحفظ في نفس الملف)
let treasuryData = {};

function saveToFile() {
  const fullData = {
    users: pointsData,
    treasury: treasuryData
  };
  fs.writeFileSync(POINTS_FILE, JSON.stringify(fullData, null, 2));
  console.log('💾 تم حفظ البيانات في الملف');
}

function getUserData(userId, guildId) {
  const key = `${guildId}-${userId}`;
  if (!pointsData[key]) {
    pointsData[key] = {
      daily: 0,
      weekly: 0,
      messageCount: 0,
      lastMsg: 0,
    };
  }
  return pointsData[key];
}

function getRequiredMessages(weeklyPoints) {
  if (weeklyPoints === 0) return 10;
  if (weeklyPoints === 1) return 20;
  if (weeklyPoints === 2) return 30;
  return 40;
}

function handleMessageCount(userData) {
  const required = getRequiredMessages(userData.weekly);
  userData.messageCount++;
  if (userData.messageCount >= required) {
    userData.daily++;
    userData.weekly++;
    userData.messageCount = 0;
    return true;
  }
  return false;
}

function getTopUsers(guildId, type = 'weekly') {
  const users = [];
  for (const [key, data] of Object.entries(pointsData)) {
    if (key.startsWith(guildId)) {
      const points = data[type] || 0;
      if (points > 0) {
        users.push({
          userId: key.split('-')[1],
          points: points,
        });
      }
    }
  }
  return users.sort((a, b) => b.points - a.points).slice(0, 3);
}

async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  const userData = getUserData(message.author.id, message.guild.id);
  const now = Date.now();
  if (now - userData.lastMsg < 7000) return;

  const oldDaily = userData.daily;
  userData.lastMsg = now;
  const gotPoint = handleMessageCount(userData);

  if (gotPoint) {
    const treasury = treasuryData[message.guild.id];
    if (treasury && treasury.active && treasury.balance >= treasury.exchangeRate) {
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

  saveToFile();
}

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

  if (command === 'تمويل' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) {
      await message.channel.send(`-# **أدخل مبلغ صحيح**`);
      return true;
    }

    const economy = client.systems.get('economy.js');
    if (!economy) {
      await message.channel.send(`-# **نظام الاقتصاد غير مفعل**`);
      return true;
    }

    try {
      const userData = await economy.getUserData(message.author.id, message.guild.id);
      if (userData.balance < amount) {
        await message.channel.send(`-# **رصيدك ما يكفي**`);
        return true;
      }

      userData.balance -= amount;
      await userData.save();

      treasuryData[message.guild.id] = treasuryData[message.guild.id] || {
        balance: 0,
        exchangeRate: 1,
        fundedBy: message.author.id,
        active: true
      };
      treasuryData[message.guild.id].balance += amount;
      treasuryData[message.guild.id].active = true;
      saveToFile();

      await message.channel.send(`-# **تم تمويل الخزينة بــ ${amount} دينار. شكراً لك!**`);
    } catch (e) {
      console.error(e);
      await message.channel.send(`-# **حدث خطأ**`);
    }
    return true;
  }

  if (command === 'points' && args[0] === 'list') {
    const settings = await getPointsSettings(message.guild.id);
    const excluded = settings.excludedChannels.map(id => `<#${id}>`).join('، ') || 'لا يوجد';
    const treasury = treasuryData[message.guild.id] || { balance: 0, exchangeRate: 1, active: false };

    await message.channel.send(
      `-# **الرومات المستثنى هي ${excluded} يوجد فالخزينة ${treasury.balance} دينار و على كل ${treasury.exchangeRate} دينار لكل نقطة**`
    );
    return true;
  }

  if (command === 'ريستارت' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const type = args[1]?.toLowerCase();
    if (!type || (type !== 'يومي' && type !== 'اسبوعي' && type !== 'الكل')) {
      await message.channel.send(`-# **استخدم: ريستارت يومي / اسبوعي / الكل**`);
      return true;
    }

    let count = 0;
    for (const key in pointsData) {
      if (key.startsWith(message.guild.id)) {
        if (type === 'يومي' || type === 'الكل') {
          pointsData[key].daily = 0;
          count++;
        }
        if (type === 'اسبوعي' || type === 'الكل') {
          pointsData[key].weekly = 0;
          count++;
        }
      }
    }

    saveToFile();
    await message.channel.send(`-# **تم إعادة تعيين ${type} لـ ${count} مستخدم <:2thumbup:1467287897429512396> **`);
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
  // مؤقت: نرجع إعدادات افتراضية لحين إضافة نظام الإعدادات
  return { excludedChannels: [] };
}

async function onReady(client) {
  console.log('⭐ نظام النقاط مع الخزينة جاهز');
  console.log(`- إجمالي المستخدمين المسجلين: ${Object.keys(pointsData).length}`);
  try {
    const stats = fs.statSync(POINTS_FILE);
    console.log(`- حجم ملف البيانات: ${Math.round(stats.size / 1024)} KB`);
  } catch (e) {
    console.log('- حجم ملف البيانات: غير معروف');
  }
}

module.exports = {
  onMessage,
  handleTextCommand,
  onReady,
};