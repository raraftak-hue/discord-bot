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
        `-# ** مبروك فزتم بـ ${giveaway.prize} افتحوا تذكرة لتستلموا الجائزة <:emoji_40:1471983905430311074> **\n` +
        `-# **الفائزين ${winners.join(' ')}**`
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
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    if (interaction.isChatInputCommand() && interaction.commandName === 'give') {
      const sub = interaction.options.getSubcommand();
      
      if (sub === 'start') {
        const prize = interaction.options.getString('prize');
        const durationStr = interaction.options.getString('time');
        const winnersCount = interaction.options.getInteger('winners');
        const condition = interaction.options.getString('cond') || 'لا توجد شروط';
        const imageOption = interaction.options.getString('img');
        
        const timeMatch = durationStr.match(/^(\d+)([mhd])$/);
        if (!timeMatch) return interaction.reply({ content: 'صيغة الوقت غلط! (10m, 1h, 1d)', ephemeral: true });
        
        const durationMs = parseInt(timeMatch[1]) * (timeMatch[2] === 'm' ? 60 : timeMatch[2] === 'h' ? 3600 : 86400) * 1000;
        const endTime = new Date(Date.now() + durationMs);
        
        const embed = new EmbedBuilder()
          .setDescription(
            `-# **سحب عشوائي على ${prize} ينتهي في <t:${Math.floor(endTime.getTime() / 1000)}:R> <:emoji_45:1397804598110195863> **\n` +
            `-# **الي سوا السحب العشوائي ${interaction.user} <:y_coroa:1404576666105417871> **\n` +
            `-# **الشروط ${condition} <:new_emoji:1388436089584226387> **`
          )
          .setColor(0x2b2d31);
        
        if (imageOption) embed.setImage(imageOption);
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('join_giveaway').setLabel('ادخل').setStyle(ButtonStyle.Secondary)
        );
        
        await interaction.deferReply({ ephemeral: true });
        const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.deleteReply();
        
        const giveaway = new Giveaway({
          guildId: interaction.guild.id,
          channelId: interaction.channel.id,
          messageId: msg.id,
          prize,
          endTime,
          winners: winnersCount,
          participants: [],
          image: imageOption,
          condition,
          hostId: interaction.user.id
        });
        
        await giveaway.save();
        setTimeout(async () => { await endGiveaway(client, giveaway); }, durationMs);
        return true;
      }
    }

    if (interaction.isButton() && interaction.customId === 'join_giveaway') {
      const giveaway = await Giveaway.findOne({ messageId: interaction.message.id, ended: false });
      
      if (!giveaway || giveaway.ended) {
        return interaction.reply({ content: '❌ هذا القيف أوي انتهى أو غير موجود', ephemeral: true });
      }
      
      if (giveaway.participants.includes(interaction.user.id)) {
        return interaction.reply({ content: `-# **انت داخل القيف اصلا <:__:1467633552408576192> **`, ephemeral: true });
      }
      
      giveaway.participants.push(interaction.user.id);
      await giveaway.save();
      
      await interaction.reply({ content: `-# **تم دخولك فالسحب <:2thumbup:1467287897429512396> **`, ephemeral: true });
      return true;
    }
  }
};