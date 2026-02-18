const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const GiveawaySchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  messageId: String,
  prize: String,
  endTime: Date,
  winners: Number,
  participants: [String],
  image: String,
  condition: String,
  hostId: String,
  ended: { type: Boolean, default: false }
});

const Giveaway = mongoose.model('Giveaway', GiveawaySchema);

// ==================== 🔧 الدوال المساعدة ====================
async function endGiveaway(client, giveaway) {
  try {
    const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
    if (!guild) return;

    const channel = await guild.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!message) return;

    const participants = giveaway.participants;

    if (participants.length === 0) {
      await message.edit({ 
        content: '❌ انتهى القيف أوي بدون مشاركين.', 
        embeds: [], 
        components: [] 
      }).catch(() => {});
    } else {
      const winners = [];
      const participantsCopy = [...participants];
      
      for (let i = 0; i < Math.min(giveaway.winners, participantsCopy.length); i++) {
        const winnerIdx = Math.floor(Math.random() * participantsCopy.length);
        winners.push(`<@${participantsCopy.splice(winnerIdx, 1)[0]}>`);
      }
      
      const embed = EmbedBuilder.from(message.embeds[0])
        .setDescription(`-# **انتهى السحب على ${giveaway.prize}**\n-# **الفائزين هم** ${winners.join(', ')}`);
      
      await message.edit({ embeds: [embed], components: [] }).catch(() => {});
      await channel.send(
        `-# **مبروك فزتم بـ ${giveaway.prize} افتحوا تكت عشان تستلموها <:emoji_33:1401771703306027008> **\n` +
        `-# **${winners.join(', ')}**`
      ).catch(() => {});
    }
    
    giveaway.ended = true;
    await giveaway.save();
    
  } catch (e) {
    console.error('خطأ في إنهاء القيف:', e);
  }
}

module.exports = {
  onReady: async (client) => {
    const activeGiveaways = await Giveaway.find({ ended: false });
    for (const g of activeGiveaways) {
      if (g.endTime > new Date()) {
        const timeLeft = g.endTime.getTime() - Date.now();
        setTimeout(() => endGiveaway(client, g), timeLeft);
        console.log(`🔄 تم استعادة قيف: ${g.prize}`);
      } else { 
        await endGiveaway(client, g); 
      }
    }
  },

  onInteraction: async (client, interaction) => {
    const { commandName, options, customId, user } = interaction;

    if (interaction.isChatInputCommand() && commandName === 'give') {
      const sub = options.getSubcommand();
      if (sub === 'start') {
        const prize = options.getString('prize');
        const timeStr = options.getString('time');
        const winners = options.getInteger('winners');
        const cond = options.getString('cond');
        const img = options.getString('img');

        const timeMatch = timeStr.match(/^(\d+)([mhd])$/);
        if (!timeMatch) return interaction.reply({ content: '❌ تنسيق الوقت غلط (مثال: 10m, 1h, 1d)', ephemeral: true });

        const duration = parseInt(timeMatch[1]);
        const unit = timeMatch[2];
        let durationMs;
        if (unit === 'm') durationMs = duration * 60 * 1000;
        else if (unit === 'h') durationMs = duration * 60 * 60 * 1000;
        else if (unit === 'd') durationMs = duration * 24 * 60 * 60 * 1000;

        const endTime = new Date(Date.now() + durationMs);
        const embed = new EmbedBuilder()
          .setTitle(`🎉 قيف أوي جديد!`)
          .setDescription(`-# **الجائزة: ${prize}**\n-# **الفائزين: ${winners}**\n-# **ينتهي في: <t:${Math.floor(endTime.getTime() / 1000)}:R>**\n-# **الشروط: ${cond || 'لا يوجد'}**`)
          .setColor(0x2b2d31);
        
        if (img) embed.setImage(img);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('join_giveaway').setLabel('انضمام').setStyle(ButtonStyle.Primary)
        );

        const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ تم بدء القيف أوي!', ephemeral: true });

        const giveaway = new Giveaway({
          guildId: interaction.guild.id,
          channelId: interaction.channel.id,
          messageId: msg.id,
          prize,
          endTime,
          winners,
          participants: [],
          image: img,
          condition: cond,
          hostId: user.id
        });
        
        await giveaway.save();
        setTimeout(async () => { await endGiveaway(client, giveaway); }, durationMs);
      }
    }

    if (interaction.isButton() && customId === 'join_giveaway') {
      const giveaway = await Giveaway.findOne({ messageId: interaction.message.id });
      if (!giveaway || giveaway.ended) return interaction.reply({ content: '❌ القيف أوي انتهى!', ephemeral: true });

      if (giveaway.participants.includes(user.id)) {
        return interaction.reply({ content: '❌ أنت مشارك بالفعل!', ephemeral: true });
      }

      giveaway.participants.push(user.id);
      await giveaway.save();
      return interaction.reply({ content: '✅ تم انضمامك للقيف أوي!', ephemeral: true });
    }
  }
};
