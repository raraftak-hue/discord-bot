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
const pointsCache = new Map(); // للقراءة السريعة
let pendingWrites = {}; // للتحديثات الدورية

// ==================== 🔧 الدوال المساعدة ====================

// حفظ البيانات في الملف
function saveToFile() {
  try {
    // دمج التحديثات المعلقة
    for (const [key, value] of Object.entries(pendingWrites)) {
      if (!pointsData[key]) {
        pointsData[key] = { daily: 0, weekly: 0, lastMsg: 0 };
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

// حفظ كل 5 دقائق
setInterval(saveToFile, 5 * 60 * 1000);

// تنظيف الكاش القديم
function cleanCache() {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, data] of pointsCache.entries()) {
    if (now - data.lastAccess > 60 * 60 * 1000) { // ساعة بدون استخدام
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
  
  // من الكاش أولاً
  if (pointsCache.has(key)) {
    const cached = pointsCache.get(key);
    resetPeriodicPoints(cached);
    return cached;
  }
  
  // من الملف
  let userData = pointsData[key] || {
    daily: 0,
    weekly: 0,
    lastMsg: 0,
    lastDailyReset: new Date().toDateString(),
    lastWeeklyReset: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - new Date().getDay()).toDateString()
  };
  
  resetPeriodicPoints(userData);
  pointsCache.set(key, { ...userData, lastAccess: Date.now() });
  
  return userData;
}

// إعطاء نقطة (احتمالية 2.5% = 1/40)
function shouldGivePoint() {
  return Math.random() < 0.025; // 2.5%
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
  
  // 2.5% فقط يدخل هنا (كل 40 رسالة بالمعدل)
  if (!shouldGivePoint()) return;
  
  const userId = message.author.id;
  const guildId = message.guild.id;
  const key = `${guildId}-${userId}`;
  const now = Date.now();
  
  // جلب البيانات
  let userData = getUserData(userId, guildId);
  
  // كولداون 7 ثواني (حماية إضافية)
  if (now - userData.lastMsg < 7000) return;
  
  // إعطاء النقطة
  userData.daily = (userData.daily || 0) + 1;
  userData.weekly = (userData.weekly || 0) + 1;
  userData.lastMsg = now;
  userData.lastAccess = now;
  
  // تحديث الكاش
  pointsCache.set(key, userData);
  
  // تسجيل التحديث المعلق
  if (!pendingWrites[key]) pendingWrites[key] = { daily: 0, weekly: 0 };
  pendingWrites[key].daily += 1;
  pendingWrites[key].weekly += 1;
  pendingWrites[key].lastMsg = now;
}

// ==================== معالج الأوامر النصية ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  if (command === 'نقاط') {
    // إذا في منشن → نقاط العضو الآخر
    const target = message.mentions.users.first() || message.author;
    const userData = getUserData(target.id, message.guild.id);
    
    await message.channel.send(
      `-# **يملك المستخدم ${userData.daily} نقطة اليوم و ${userData.weekly} نقطة هذا الأسبوع <:emoji_35:1474845075950272756> **`
    );
    return true;
  }

  if (command === 'توب س') {
    const topUsers = getTopUsers(message.guild.id, 'weekly');
    
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
    const topUsers = getTopUsers(message.guild.id, 'daily');
    
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

    await interaction.reply({ 
      content: `-# **نظام النقاط شغال بنسق 2.5% (كل 40 رسالة بالمعدل)**`, 
      ephemeral: true 
    });
    return true;
  }

  return false;
}

// ==================== onReady ====================
async function onReady(client) {
  console.log('⭐ نظام النقاط الخفيف جاهز');
  console.log('📊 إحصائيات:');
  console.log(`- إجمالي المستخدمين: ${Object.keys(pointsData).length}`);
  console.log(`- حجم الملف: ${Math.round(fs.statSync(POINTS_FILE).size / 1024)} KB`);
}

// ==================== تصدير النظام ====================
module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction,
  onReady
};