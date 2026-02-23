const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

const POINTS_FILE = path.join(__dirname, '../data/points.json');

if (!fs.existsSync(path.dirname(POINTS_FILE))) {
  fs.mkdirSync(path.dirname(POINTS_FILE), { recursive: true });
}

let pointsData = {};
try {
  pointsData = JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
} catch {
  pointsData = {};
  fs.writeFileSync(POINTS_FILE, JSON.stringify({}));
}

function saveToFile() {
  try {
    fs.writeFileSync(POINTS_FILE, JSON.stringify(pointsData, null, 2));
    console.log('💾 تم حفظ النقاط في الملف');
  } catch (e) {
    console.error('❌ خطأ في حفظ الملف:', e);
  }
}

function getUserData(userId, guildId) {
  const key = `${guildId}-${userId}`;
  if (!pointsData[key]) {
    pointsData[key] = {
      daily: 0,
      weekly: 0,
      lastMsg: 0,
    };
  }
  return pointsData[key];
}

function shouldGivePoint(weeklyPoints) {
  if (weeklyPoints < 10) return Math.random() < 0.20;
  if (weeklyPoints < 30) return Math.random() < 0.10;
  if (weeklyPoints < 100) return Math.random() < 0.05;
  return Math.random() < 0.025;
}

function getTopUsers(guildId, type = 'weekly') {
  const users = [];
  for (const [key, data] of Object.entries(pointsData)) {
    if (key.startsWith(guildId)) {
      users.push({
        userId: key.split('-')[1],
        points: data[type] || 0,
      });
    }
  }
  return users.sort((a, b) => b.points - a.points).slice(0, 5);
}

async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  const userData = getUserData(message.author.id, message.guild.id);
  const now = Date.now();

  if (now - userData.lastMsg < 7000) return;
  if (!shouldGivePoint(userData.weekly)) return;

  userData.daily += 1;
  userData.weekly += 1;
  userData.lastMsg = now;

  saveToFile(); // 👈 نحفظ فوراً بعد كل نقطة
}

async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  if (command === 'نقاط') {
    const target = message.mentions.users.first() || message.author;
    const userData = getUserData(target.id, message.guild.id);

    const text =
      target.id === message.author.id
        ? `تملك حالياً ${userData.daily} نقطة تفاعل<:emoji_35:1474845075950272756>`
        : `يملك المستخدم ${userData.daily} نقطة تفاعل<:emoji_35:1474845075950272756>`;

    await message.channel.send(`-# **${text} **`);
    return true;
  }

  if (command === 'ريستارت' && message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    const type = args[1]?.toLowerCase();
    if (!type || (type !== 'يومي' && type !== 'اسبوعي' && type !== 'الكل')) {
      await message.channel.send(`-# **استخدم: ريستارت يومي / اسبوعي / الكل**`);
      return true;
    }

    const now = new Date();
    const today = now.toDateString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toDateString();
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

  if (command === 'توب س') {
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

    embed.setFooter({ text: `نقاطك: ${userPoints}` });
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  if (command === 'توب ي') {
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

    embed.setFooter({ text: `نقاطك: ${userPoints}` });
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  return false;
}

async function onReady(client) {
  console.log('⭐ نظام النقاط الخفيف جاهز');
  console.log(`- إجمالي المستخدمين: ${Object.keys(pointsData).length}`);
  console.log(`- حجم الملف: ${Math.round(fs.statSync(POINTS_FILE).size / 1024)} KB`);
}

module.exports = {
  onMessage,
  handleTextCommand,
  onReady,
};