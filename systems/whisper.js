// ==================== 🤫 نظام الهمسة ====================
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'whisper',

  handleTextCommand: async (client, message, command, args, prefix) => {
    if (command !== 'همسة' && command !== 'whisper' && command !== 'همس') return false;

    const target = message.mentions.users.first();
    if (!target) {
      await message.channel.send(`-# **منشن الشخص اللي تبي ترسل له همسة <:emoji_334:1388211595053760663>**`);
      return true;
    }

    const whisperText = args.slice(1).join(' ');
    if (!whisperText) {
      await message.channel.send(`-# **اكتب الرسالة اللي تبي ترسلها <:emoji_334:1388211595053760663>**`);
      return true;
    }

    // إنشاء رابط الرسالة
    const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;

    // الرسالة الخاصة للمستهدف
    const targetEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
      .setDescription(whisperText)
      .setFooter({ text: 'رسالة خاصة من 👆' })
      .setTimestamp();

    try {
      await target.send({ embeds: [targetEmbed] });
    } catch (error) {
      await message.channel.send(`-# **ما قدرت أوصل له الهمسة، الخاص مقفل <:emoji_84:1389404919672340592>**`);
      return true;
    }

    // حذف الرسالة الأصلية عشان محد يشوفها
    await message.delete().catch(() => {});

    // رسالة التغطية في الشات
    const coverEmbed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(`🔇 **${message.author.username}** أرسل همسة لـ **${target.username}**`)
      .setFooter({ text: 'الرسالة وصلت للخاص' });

    await message.channel.send({ embeds: [coverEmbed] });

    // تسجيل في سجل البوت (اختياري)
    console.log(`🔇 ${message.author.tag} أرسل همسة لـ ${target.tag}: ${whisperText}`);

    return true;
  }
};