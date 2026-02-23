const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ==================== 📁 File-based Storage ====================
const POINTS_FILE = path.join(__dirname, '../data/points.json');

// التأكد من وجود المجلد
if (!fs.existsSync(path.dirname(POINTS_FILE))) {
  fs.mkdirSync(path.dirname(POINTS_FILE), { recursive: true });
}

// تحميل البيانات أو إنشاء ملف جديد
let pointsData = {};
try {
  pointsData = JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
} catch {
  pointsData = {};
  fs.writeFileSync(POINTS_FILE, JSON.stringify({}));
}

// ==================== 📊 Cache ====================
const pointsCache = new Map();
let pendingWrites = {};

// ==================== 🔧 الدوال المساعدة ====================

// حفظ البيانات في الملف
function saveToFile() {
  try {
    for (const [key, value] of Object.entries(pendingWrites)) {
      if (!pointsData[key]) {
        pointsData[key] = { 
          daily: 0, 
          weekly: 0, 
          lastMsg: 0, 
          lastDailyReset: new Date().toDateString(), 
          lastWeeklyReset: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - new Date().getDay()).toDateString() 
        };
      }
      pointsData[key].daily += value.daily || 0;
      pointsData[key].weekly += value.weekly || 0;
      pointsData[key].lastMsg = value.lastMsg || pointsData[key].lastMsg;
    }
    fs.writeFileSync(POINTS_FILE, JSON.stringify(pointsData, null, 2));
    pendingWrites = {};
    console.log('💾 تم حفظ النقاط في الملف');
  } catch (e) {
    console.error('❌ خطأ في حفظ الملف:', e);
  }
}
setInterval(saveToFile, 5 * 60 * 1000);

// تنظيف الكاش القديم
function cleanCache() {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, data] of pointsCache.entries()) {
    if (now - data.lastAccess > 60 * 60 * 1000) {
      pointsCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`🧹 تم تنظيف ${cleaned} مستخدم من الكاش`);
}
setInterval(cleanCache, 30 * 60 * 1000);

// إعادة تعيين النقاط اليومية/الأسبوعية
function resetPeriodicPoints(userData) {
  const now = new Date();
  const today = now.toDateString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toDateString();
  let updated = false;
  if (userData.lastDailyReset !== today) {
    userData.daily = 0;
    userData.lastDailyReset = today;
    updated = true;
  }
  if (userData.lastWeeklyReset !== weekStart) {
    userData.weekly = 0;
    userData.lastWeeklyReset = weekStart;
    updated = true;
  }
  return updated;
}

// الحصول على بيانات المستخدم
function getUserData(userId, guildId) {
  const key = `${guildId}-${userId}`;
  
  if (pointsCache.has(key)) {
    const cached = pointsCache.get(key);
    resetPeriodicPoints(cached);
    return cached;
  }
  
  let userData = pointsData[key];
  if (!userData) {
    userData = {
      daily: 0,
      weekly: 0,
      lastMsg: 0,
      lastDailyReset: new Date().toDateString(),
      lastWeeklyReset: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - new Date().getDay()).toDateString()
    };
    pointsData[key] = userData;
    pendingWrites[key] = { daily: 0, weekly: 0, lastMsg: 0 };
  }
  
  resetPeriodicPoints(userData);
  pointsCache.set(key, { ...userData, lastAccess: Date.now() });
  
  return userData;
}

// نسب تصاعدية
function shouldGivePoint(weeklyPoints) {
  if (weeklyPoints < 10) return Math.random() < 0.20;
  if (weeklyPoints < 30) return Math.random() < 0.10;
  if (weeklyPoints < 100) return Math.random() < 0.05;
  return Math.random() < 0.025;
}

// الحصول على أفضل 5
function getTopUsers(guildId, type = 'weekly') {
  const users = [];
  for (const [key, data] of Object.entries(pointsData)) {
    if (key.startsWith(guildId)) {
      users.push({
        userId: key.split('-')[1],
        points: data[type] || 0
      });
    }
  }
  return users.sort((a, b) => b.points - a.points).slice(0, 5);
}

// ==================== onMessage ====================
async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const guildId = message.guild.id;
  const key = `${guildId}-${userId}`;
  const now = Date.now();

  let userData = getUserData(userId, guildId);

  if (now - userData.lastMsg < 7000) return;
  if (!shouldGivePoint(userData.weekly)) return;

  userData.daily += 1;
  userData.weekly += 1;
  userData.lastMsg = now;
  userData.lastAccess = now;

  pointsCache.set(key, userData);

  if (!pendingWrites[key]) pendingWrites[key] = { daily: 0, weekly: 0 };
  pendingWrites[key].daily += 1;
  pendingWrites[key].weekly += 1;
  pendingWrites[key].lastMsg = now;
}

// ==================== معالج الأوامر النصية ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  // أمر المساعدة
  if (command === 'اوامر') {
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(
        `** members<:emoji_32:1471962578895769611> **\n` +
        `-# **text - دنانير، تحويل، اغنياء، نقاط، توب س، توب ي، سجل**\n\n` +
        `** Mods <:emoji_38:1470920843398746215>**\n` +
        `-# **wel, tic, give, pre, emb, eco, whisper**\n` +
        `-# **text - تايم، طرد، حذف، ارقام، ايقاف**`
      );
    await message.channel.send({ embeds: [embed] });
    return true;
  }

  // أمر عرض النقاط
  if (command === 'نقاط') {
    const target = message.mentions.users.first();
    
    if (target) {
      const userData = getUserData(target.id, message.guild.id);
      await message.channel.send(
        `-# **يملك المستخدم ${userData.daily} نقطة تفاعل<:emoji_35:1474845075950272756> **`
      );
    } else {
      const userData = getUserData(message.author.id, message.guild.id);
      await message.channel.send(
        `-# **تملك حالياً ${userData.daily} نقطة تفاعل<:emoji_35:1474845075950272756> **`
      );
    }
    return true;
  }

  // أمر إعادة التعيين (للمشرفين فقط)
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
          pointsData[key].lastDailyReset = today;
          count++;
        }
        if (type === 'اسبوعي' || type === 'الكل') {
          pointsData[key].weekly = 0;
          pointsData[key].lastWeeklyReset = weekStart;
          count++;
        }
      }
    }

    pointsCache.clear();
    saveToFile();
    await message.channel.send(`-# **تم إعادة تعيين ${type} لـ ${count} مستخدم <:2thumbup:1467287897429512396> **`);
    return true;
  }

  // توب أسبوعي
  if (command === 'توب س') {
    const topUsers = getTopUsers(message.guild.id, 'weekly');
    const userPoints = getUserData(message.author.id, message.guild.id).weekly;
    
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`**خلفاء السبع ليالِ <:emoji_38:1474950090539139182>**`);

    if (topUsers.length === 0) {
      embed.setDescription(`${embed.data.description}\n\n-# **لا يوجد منافسين للآن <:emoji_40:1475268254028267738> **`);
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

  // توب يومي
  if (command === 'توب ي') {
    const topUsers = getTopUsers(message.guild.id, 'daily');
    const userPoints = getUserData(message.author.id, message.guild.id).daily;
    
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`**خلفاء الليلة <:emoji_36:1474949953876000950>**`);

    if (topUsers.length === 0) {
      embed.setDescription(`${embed.data.description}\n\n-# **لا يوجد منافسين للآن <:emoji_40:1475268254028267738> **`);
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

// ==================== onInteraction (اختياري) ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;
  if (interaction.commandName === 'points') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: `-# **ما عندك صلاحية**`, ephemeral: true });
      return true;
    }
    await interaction.reply({ content: `-# **نظام النقاط شغال بنسب تصاعدية (20% → 2.5%)**`, ephemeral: true });
    return true;
  }
  return false;
}

// ==================== onReady ====================
async function onReady(client) {
  console.log('⭐ نظام النقاط الخفيف جاهز');
  console.log(`- إجمالي المستخدمين: ${Object.keys(pointsData).length}`);
  console.log(`- حجم الملف: ${Math.round(fs.statSync(POINTS_FILE).size / 1024)} KB`);
}

module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction,
  onReady
};