// ==================== 🤫 نظام الهمسة (بالأزرار) ====================
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// تخزين مؤقت للهمسات (في الذاكرة)
const whispers = new Map();

module.exports = {
  name: 'whisper',

  onInteraction: async (client, interaction) => {
    // معالج زر العرض
    if (interaction.isButton() && interaction.customId.startsWith('show_whisper_')) {
      const whisperId = interaction.customId.replace('show_whisper_', '');
      const whisper = whispers.get(whisperId);

      if (!whisper) {
        await interaction.reply({ 
          content: `-# **انتهت صلاحية الهمسة أو ما هي موجودة <:new_emoji:1388436095842385931>**`, 
          ephemeral: true 
        });
        return true;
      }

      // التحقق من أن الشخص هو المستهدف
      if (interaction.user.id !== whisper.targetId) {
        await interaction.reply({ 
          content: `-# ** الهمسة مهي لك يا ملقوف <:emoji_33:1471962823532740739> **`, 
          ephemeral: true 
        });
        return true;
      }

      // إرسال الهمسة للمتلقي
      await interaction.reply({ 
        content: `-# ** ${whisper.content} <:emoji_32:1471962578895769611> **`, 
        ephemeral: true 
      });

      // تعطيل الزر بعد الضغط
      const message = await interaction.channel.messages.fetch(interaction.message.id);
      const disabledRow = new ActionRowBuilder().addComponents(
        ButtonBuilder.from(message.components[0].components[0])
          .setDisabled(true)
      );
      await message.edit({ components: [disabledRow] }).catch(() => {});

      return true;
    }

    // معالج أمر الهمسة السلاش
    if (interaction.isChatInputCommand() && interaction.commandName === 'whisper') {
      const target = interaction.options.getUser('user');
      const whisperText = interaction.options.getString('message');

      if (target.id === interaction.user.id) {
        await interaction.reply({ 
          content: `-# **ما تقدر ترسل همسة لنفسك يا ذكي <:emoji_334:1388211595053760663>**`, 
          ephemeral: true 
        });
        return true;
      }

      // إنشاء معرف فريد للهمسة
      const whisperId = `${interaction.guild.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      // تخزين الهمسة
      whispers.set(whisperId, {
        targetId: target.id,
        senderId: interaction.user.id,
        content: whisperText,
        guildId: interaction.guild.id
      });

      // حذف الهمسة من الذاكرة بعد 30 ثانية
      setTimeout(() => {
        whispers.delete(whisperId);
      }, 30000);

      // زر العرض (رصاصي)
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`show_whisper_${whisperId}`)
          .setLabel('عرض')
          .setStyle(ButtonStyle.Secondary)
      );

      // رسالة عامة
      const whisperMessage = await interaction.channel.send({
        content: `-# ** يـ ${target} تلقيت همسة من ${interaction.user} <:emoji_32:1471962578895769611> **`,
        components: [row]
      });

      // حذف الرسالة من الشات بعد 30 ثانية ⏱️
      setTimeout(() => {
        whisperMessage.delete().catch(() => {});
      }, 30000);

      await interaction.reply({ 
        content: `-# **تم إرسال الهمسة بنجاح <:2thumbup:1467287897429512396>**`, 
        ephemeral: true 
      });
      return true;
    }

    return false;
  }
};