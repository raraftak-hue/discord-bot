const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schema ====================
const AfkSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  reason: { type: String, default: 'بدون سبب' },
  timestamp: { type: Date, default: Date.now }
});

// فهرسة مركبة عشان نجيب البيانات بسرعة
AfkSchema.index({ guildId: 1, userId: 1 }, { unique: true });

const Afk = mongoose.model('Afk', AfkSchema);

// ==================== معالج الأوامر النصية ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  // ===== أمر غايب =====
  if (command === 'غايب') {
    const reason = args.join(' ') || 'بدون سبب';
    const userId = message.author.id;
    const guildId = message.guild.id;

    // حذف أي AFK قديم للمستخدم
    await Afk.deleteOne({ userId, guildId });

    // إنشاء AFK جديد
    const afk = new Afk({
      userId,
      guildId,
      reason,
      timestamp: new Date()
    });
    await afk.save();

    await message.reply(`-# **غايب و عذرك معاك بالتوفيق <:emoji_84:1389404919672340592> **`);
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
  const userAfk = await Afk.findOne({ userId, guildId });
  if (userAfk) {
    await Afk.deleteOne({ userId, guildId });
    await message.reply(`-# **الحمدلله رجعتلنا بالسلامة <:emoji_37:1474950026840244265> **`);
    return; // ما نكمل عشان ما يفحص المنشن
  }

  // ===== 2. إذا فيه منشن، نفحص كل منشن =====
  if (message.mentions.users.size > 0) {
    for (const mentionedUser of message.mentions.users.values()) {
      if (mentionedUser.bot) continue;

      const afk = await Afk.findOne({ userId: mentionedUser.id, guildId });
      if (afk) {
        await message.reply(`-# **المستخدم غايب و يقول ${afk.reason}**`);
        // ما نعمل break عشان لو فيه أكثر من منشن، كل واحد ياخذ رده
      }
    }
  }
}

module.exports = {
  onMessage,
  handleTextCommand
};