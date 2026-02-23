const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schema ====================
const AfkSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  reason: { type: String, default: 'بدون سبب' },
  timestamp: { type: Date, default: Date.now }
});

AfkSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const Afk = mongoose.model('Afk', AfkSchema);

// ==================== 🔥 Cache for Speed ====================
// هذا هو الحل السحري: نخزن الـ AFK في ذاكرة البوت
const afkCache = new Map(); // المفتاح: `${guildId}-${userId}`

// دالة لتحديث الكاش
function updateAfkCache(guildId, userId, afkData) {
  const key = `${guildId}-${userId}`;
  if (afkData) {
    afkCache.set(key, afkData);
  } else {
    afkCache.delete(key);
  }
}

// دالة لجلب البيانات من الكاش أو من قاعدة البيانات
async function getAfkFromCacheOrDb(guildId, userId) {
  const key = `${guildId}-${userId}`;
  // نشوف الأول في الكاش
  if (afkCache.has(key)) {
    return afkCache.get(key);
  }
  // لو مش موجود في الكاش، نجيب من قاعدة البيانات
  const afkData = await Afk.findOne({ userId, guildId }).lean(); // .lean() يجيب البيانات بشكل أسرع
  if (afkData) {
    afkCache.set(key, afkData); // نخزنه في الكاش للمرة الجاية
  }
  return afkData;
}

// ==================== معالج الأوامر النصية ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  if (command === 'غايب') {
    const reason = args.join(' ') || 'بدون سبب';
    const userId = message.author.id;
    const guildId = message.guild.id;

    // حفظ في قاعدة البيانات
    const afk = await Afk.findOneAndUpdate(
      { userId, guildId },
      { userId, guildId, reason, timestamp: new Date() },
      { upsert: true, new: true }
    ).lean();

    // تحديث الكاش
    updateAfkCache(guildId, userId, afk);

    await message.channel.send(`-# **غايب و عذرك معاك بالتوفيق <:emoji_84:1389404919672340592> **`);
    return true;
  }
  return false;
}

// ==================== onMessage ====================
async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  const userId = message.author.id;
  const guildId = message.guild.id;

  // ===== 1. إذا المستخدم نفسه رجع، نحذف AFK =====
  const userAfk = await getAfkFromCacheOrDb(guildId, userId);
  if (userAfk) {
    await Afk.deleteOne({ userId, guildId });
    // تحديث الكاش: نحذفه
    updateAfkCache(guildId, userId, null);
    await message.channel.send(`-# **الحمدلله رجعتلنا بالسلامة <:emoji_37:1474950026840244265> **`);
    return;
  }

  // ===== 2. إذا فيه منشن، نفحص كل منشن باستخدام الكاش =====
  if (message.mentions.users.size > 0) {
    for (const mentionedUser of message.mentions.users.values()) {
      if (mentionedUser.bot) continue;

      // بنستخدم الكاش هنا بدل ما نروح للـ DB كل مرة
      const afk = await getAfkFromCacheOrDb(guildId, mentionedUser.id);
      if (afk) {
        await message.channel.send(`-# **المستخدم غايب و يقول ${afk.reason}**`);
      }
    }
  }
}

// ==================== تنظيف الكاش كل ساعة (اختياري) ====================
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [key, value] of afkCache.entries()) {
    if (value.timestamp < oneHourAgo) {
      afkCache.delete(key);
    }
  }
  console.log('🧹 تم تنظيف كاش الـ AFK');
}, 60 * 60 * 1000);

module.exports = {
  onMessage,
  handleTextCommand
};