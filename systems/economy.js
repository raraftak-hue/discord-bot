const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const UserSchema = new mongoose.Schema({
  userId: String,
  balance: { type: Number, default: 0 },
  history: [{
    type: { type: String },
    amount: Number,
    targetUser: String,
    targetName: String,
    date: { type: Date, default: Date.now }
  }]
});

const User = mongoose.model('User', UserSchema);

// ==================== 🔧 الدوال المساعدة ====================
async function getUserData(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId, balance: 0, history: [] });
    await user.save();
  }
  return user;
}

function calculateTax(balance, amount) {
  if (balance < 20) return 0;
  if (balance >= 20 && balance <= 50) return amount * 0.05;
  if (balance >= 51 && balance <= 100) return amount * 0.10;
  if (balance >= 101 && balance <= 200) return amount * 0.15;
  if (balance >= 201 && balance <= 500) return amount * 0.20;
  if (balance >= 501 && balance <= 1000) return amount * 0.25;
  if (balance > 1000) return amount * 0.30;
  return 0;
}

async function formatHistory(client, history) {
  if (!history || history.length === 0) return "-# **ما عندك أي عمليات سابقة <:emoji_32:1471962578895769611>**";
  
  const filtered = history.slice(-3).reverse();
  const lines = [];

  for (const h of filtered) {
    const date = new Date(h.date);
    const dateStr = `${date.getDate()}-${date.getMonth() + 1}`;

    if (h.type === 'TRANSFER_SEND') {
      let targetName = 'مستخدم';
      try {
        if (h.targetUser) {
          const user = await client.users.fetch(h.targetUser).catch(() => null);
          if (user) targetName = user.username;
        }
      } catch (e) {}
      lines.push(`-# **تحويل الى ${targetName} في ${dateStr} <:emoji_41:1471619709936996406>**`);
    } 
    else if (h.type === 'TRANSFER_RECEIVE') {
      let targetName = 'مستخدم';
      try {
        if (h.targetUser) {
          const user = await client.users.fetch(h.targetUser).catch(() => null);
          if (user) targetName = user.username;
        }
      } catch (e) {}
      lines.push(`-# **استلام من ${targetName} في ${dateStr} <:emoji_41:1471983856440836109>**`);
    } 
    else if (h.type === 'WEEKLY_TAX') {
      lines.push(`-# **خصم زكاة 2.5% = ${Math.abs(h.amount)} في ${dateStr} <:emoji_40:1471983905430311074>**`);
    } 
    else if (h.type === 'OWNER_ADD') {
      lines.push(`-# **إضافة رصيد ${h.amount} <:emoji_41:1471619709936996406>**`);
    } 
    else if (h.type === 'OWNER_REMOVE') {
      lines.push(`-# **سحب رصيد ${Math.abs(h.amount)} <:emoji_41:1471619709936996406>**`);
    }
    else if (h.type === 'STARTING_GIFT') {
      lines.push(`-# **هدية ابتدائية بقيمة ${h.amount} <:emoji_35:1471963080228474890>**`);
    }
    else {
      lines.push(`-# **${h.type}: ${Math.abs(h.amount)} في ${dateStr} <:emoji_41:1471983856440836109>**`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  onMessage: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const args = content.split(/\s+/);
    const command = args[0];

    if (command === 'فلوس' || command === 'رصيد' || command === 'c' || command === 'credits') {
      const user = message.mentions.users.first() || message.author;
      const userData = await getUserData(user.id);
      
      if (user.id === message.author.id) {
        return message.channel.send(`-# **رصيدك الحالي هو ${userData.balance} <a:moneywith_:1470458218953179237>**`);
      } else {
        return message.channel.send(`-# **رصيد ${user.username} هو ${userData.balance} <a:moneywith_:1470458218953179237>**`);
      }
    }

    if ((command === 'تحويل' || command === 't') && args[1]) {
      const target = message.mentions.users.first();
      const amountStr = args[2] || args[1];
      const amount = parseFloat(amountStr);

      if (!target || isNaN(amount) || amount <= 0 || target.id === message.author.id || target.bot) return;

      const senderData = await getUserData(message.author.id);
      if (senderData.balance < amount) {
        return message.channel.send(`-# **رصيدك ما يكفي يا طفران <:emoji_32:1471962578895769611>**`);
      }

      const cooldown = client.transferCooldowns.get(message.author.id);
      if (cooldown && Date.now() - cooldown < 5000) {
        return message.channel.send(`-# **اهدا شوي، تقدر تحول كل 5 ثواني <:emoji_38:1470920843398746215>**`);
      }

      const tax = calculateTax(senderData.balance, amount);
      const finalAmount = amount - tax;
      const captcha = Math.floor(1000 + Math.random() * 9000);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_transfer').setLabel('تأكيد').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_transfer').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
      );

      const msg = await message.channel.send({
        content: `-# **${message.author.username}، أنت على وشك تحويل ${finalAmount} لـ ${target.username} (الضريبة: ${tax})\nاكتب الرقم التالي للتأكيد: \`${captcha}\`**`,
        components: [row]
      });

      client.pendingTransfers.set(`${message.guild.id}-${message.author.id}`, {
        targetId: target.id,
        amount: finalAmount,
        tax: tax,
        captcha: captcha,
        msgId: msg.id,
        senderId: message.author.id,
        timestamp: Date.now()
      });

      setTimeout(() => {
        if (client.pendingTransfers.has(`${message.guild.id}-${message.author.id}`)) {
          client.pendingTransfers.delete(`${message.guild.id}-${message.author.id}`);
          msg.edit({ content: '-# **انتهى وقت التحويل <:emoji_38:1470920843398746215>**', components: [] }).catch(() => { });
        }
      }, 30000);
    }

    // معالجة كتابة الكابتشا للتحويل
    const key = `${message.guild.id}-${message.author.id}`;
    const data = client.pendingTransfers.get(key);
    if (data && message.content === String(data.captcha)) {
      const sender = await getUserData(data.senderId);
      const target = await getUserData(data.targetId);
      
      if (sender.balance < (data.amount + data.tax)) {
        client.pendingTransfers.delete(key);
        return message.channel.send(`-# **رصيدك نقص فجأة؟ ما تقدر تحول <:emoji_32:1471962578895769611>**`);
      }

      sender.balance = parseFloat((sender.balance - (data.amount + data.tax)).toFixed(2));
      target.balance = parseFloat((target.balance + data.amount).toFixed(2));
      
      sender.history.push({ type: 'TRANSFER_SEND', amount: -data.amount, targetUser: data.targetId, targetName: target.username, date: new Date() });
      target.history.push({ type: 'TRANSFER_RECEIVE', amount: data.amount, targetUser: data.senderId, targetName: sender.username, date: new Date() });
      
      await sender.save(); 
      await target.save();
      client.transferCooldowns.set(data.senderId, Date.now());
      
      const confirmMsg = await message.channel.messages.fetch(data.msgId).catch(() => null);
      if (confirmMsg) {
        await confirmMsg.edit({ 
          content: `-# **تم تحويل ${data.amount} لـ <@${data.targetId}> رصيدك الآن ${sender.balance} <a:moneywith_:1470458218953179237>**`, 
          components: [] 
        }).catch(() => { });
      }
      
      client.pendingTransfers.delete(key);
      try { await message.delete(); } catch (e) { }
      return;
    }

    if (command === 'اغنياء') {
      const topUsers = await User.find().sort({ balance: -1 }).limit(5);
      const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx + 1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
      const embed = new EmbedBuilder().setDescription(`**الطبقة الارستقراطية <:y_coroa:1404576666105417871>**\n\n${topMsg}`).setColor(0x2b2d31);
      return message.channel.send({ embeds: [embed] });
    }

    if (command === 'سجل') {
      const user = message.mentions.users.first() || message.author;
      const userData = await getUserData(user.id);
      const historyText = await formatHistory(client, userData.history);
      const embed = new EmbedBuilder().setDescription(`**السجل الخاص بـ ${user.username} <:emoji_41:1471619709936996406>**\n\n${historyText}`).setColor(0x2b2d31);
      return message.channel.send({ embeds: [embed] });
    }
  },

  onInteraction: async (client, interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'confirm_transfer' || interaction.customId === 'cancel_transfer') {
      const key = `${interaction.guild.id}-${interaction.user.id}`;
      const data = client.pendingTransfers.get(key);

      if (!data || data.msgId !== interaction.message.id) {
        return interaction.reply({ content: '-# **هذا الزر مو لك أو انتهت صلاحيته <:emoji_38:1470920843398746215>**', ephemeral: true });
      }

      if (interaction.customId === 'cancel_transfer') {
        client.pendingTransfers.delete(key);
        await interaction.message.edit({ content: '-# **تم إلغاء عملية التحويل <:emoji_38:1470920843398746215>**', components: [] }).catch(() => { });
        return interaction.reply({ content: '-# **تم الإلغاء بنجاح**', ephemeral: true });
      }
      
      // زر التأكيد يوجه المستخدم لكتابة الكابتشا
      return interaction.reply({ content: `-# **اكتب الرقم \`${data.captcha}\` في الشات للتأكيد**`, ephemeral: true });
    }
  }
};
