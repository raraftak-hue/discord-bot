// ==================== 🤫 نظام الهمسة (المتطور) ====================
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'whisper',

  handleTextCommand: async (client, message, command, args, prefix) => {
    if (command !== 'همسة' && command !== 'whisper' && command !== 'همس') return false;

    const target = message.mentions.members.first();
    if (!target) {
      await message.channel.send(`-# **منشن الشخص اللي تبي ترسل له همسة <:emoji_334:1388211595053760663>**`);
      return true;
    }

    const whisperText = args.slice(1).join(' ');
    if (!whisperText) {
      await message.channel.send(`-# **اكتب الرسالة اللي تبي ترسلها <:emoji_334:1388211595053760663>**`);
      return true;
    }

    // حذف رسالة المستخدم الأصلية
    await message.delete().catch(() => {});

    // إنشاء رسالتين: وحدة للمستهدف ووحدة للعامة
    const messages = [];

    // الرسالة الخاصة بالمستهدف (يشوفها هو فقط)
    const targetMessage = await message.channel.send({
      content: `🤫 **${message.author.username}** -> **${target.user.username}**`,
      embeds: [new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(whisperText)
        .setFooter({ text: '🤫 همسة خاصة' })
      ]
    });

    // إضافة المستهدف ومنع الباقين من رؤيتها
    await targetMessage.permissionOverwrites.edit(target.id, {
      ViewChannel: true,
      ReadMessageHistory: true
    });

    await targetMessage.permissionOverwrites.edit(message.guild.id, {
      ViewChannel: false,
      ReadMessageHistory: false
    });

    // الرسالة العامة للجميع (تظهر للكل)
    const publicMessage = await message.channel.send(`🤫 **${message.author.username}** أرسل همسة لـ **${target.user.username}**`);

    // حذف الرسالة العامة بعد 5 ثواني عشان ما تزعج
    setTimeout(() => {
      publicMessage.delete().catch(() => {});
    }, 5000);

    return true;
  }
};