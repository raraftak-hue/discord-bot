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

const SettingsSchema = new mongoose.Schema({
  guildId: String,
  prefix: { type: String, default: null },
  economyChannel: { type: String, default: null },
  economyMessage: { type: String, default: '' },
  welcomeSettings: {
    channelId: String,
    title: String,
    description: String,
    color: { type: String, default: '2b2d31' },
    image: String
  }
});

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);

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
  
  // تصفية العمليات لإخفاء OWNER_ADD و OWNER_REMOVE
  const filteredHistory = history.filter(h => h.type !== 'OWNER_ADD' && h.type !== 'OWNER_REMOVE');
  
  const lastThree = filteredHistory.slice(-3).reverse();
  const lines = [];

  for (const h of lastThree) {
    const date = new Date(h.date);
    const dateStr = `${date.getDate()} و ${date.getMonth() + 1}`;

    if (h.type === 'TRANSFER_SEND') {
      lines.push(`-# ** ارسال الى <@${h.targetUser}> بـ ${Math.abs(h.amount)} دينار في ${dateStr} <:emoji_41:1471619709936996406> **`);
    } 
    else if (h.type === 'TRANSFER_RECEIVE') {
      lines.push(`-# ** استلام من <@${h.targetUser}> بـ ${h.amount} دينار في ${dateStr} <:emoji_41:1471983856440836109>**`);
    } 
    else if (h.type === 'WEEKLY_TAX') {
      lines.push(`-# **خصم زكاة 2.5% = ${Math.abs(h.amount)} في ${dateStr} <:emoji_40:1471983905430311074>**`);
    } 
    else if (h.type === 'STARTING_GIFT') {
      lines.push(`-# **هدية ابتدائية بقيمة ${h.amount} في ${dateStr} <:emoji_35:1471963080228474890>**`);
    }
    else if (h.type === 'POINTS_REWARD') {
      lines.push(`-# **استلام من نظام النقاط بـ ${h.amount} دينار <:emoji_41:1471983856440836109> **`);
    }
    else if (h.type === 'FUNDING_DEDUCTION') {
      lines.push(`-# ** تمويل نظام النقاط بـ ${Math.abs(h.amount)} دينار  <:emoji_41:1471619709936996406> **`);
    }
    else if (h.type === 'ROLE_PURCHASE') {
      // h.targetUser هنا يحتوي على ID الرتبة
      lines.push(`-# ** شراء رتبة <@&${h.targetUser}> بـ ${Math.abs(h.amount)}دينار في ${dateStr} <:emoji_41:1471619709936996406> **`);
    }
    else {
      lines.push(`-# **${h.type}: ${Math.abs(h.amount)} في ${dateStr} <:emoji_41:1471983856440836109>**`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : "-# **ما عندك أي عمليات سابقة تظهر هنا <:emoji_32:1471962578895769611>**";
}

// ==================== handleTextCommand ====================
async function handleTextCommand(client, message, command, args, prefix) {
  const Settings = mongoose.model('Settings');
  const guildSettings = await Settings.findOne({ guildId: message.guild.id });
  
  // أوامر الاقتصاد فقط
  const economyCommands = ['دنانير', 'تحويل', 'تأكيد', 'اغنياء', 'سجل'];
  
  if (economyCommands.includes(command)) {
    // فلتر الروم: إذا في روم محدد للاقتصاد والرسالة مو فيه، نمنعها
    if (guildSettings?.economyChannel && message.channel.id !== guildSettings.economyChannel) {
      if (guildSettings.economyMessage) {
        const msg = await message.channel.send(`-# ** ${guildSettings.economyMessage} **`);
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      }
      return true;
    }

    if (command === 'دنانير') {
      const user = message.mentions.users.first() || message.author;
      const userData = await getUserData(user.id);
      const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
      await message.channel.send(`-# **رصيدك الحالي ${userData.balance} و اخر عملية تحويل تلقيتها بـ ${lastIn.amount} <:emoji_41:1471619709936996406> **`);
      return true;
    }

    if (command === 'تحويل') {
      const target = message.mentions.users.first();
      const amount = parseFloat(args.find(a => !isNaN(a) && a.includes('.') ? parseFloat(a) : parseInt(a)));
      if (!target || isNaN(amount) || amount <= 0) {
        await message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
        return true;
      }
      if (target.id === message.author.id) {
        await message.channel.send(`-# **ما تقدر تحول لنفسك يا اهبل <:emoji_464:1388211597197050029>**`);
        return true;
      }
      
      const senderData = await getUserData(message.author.id);
      const tax = calculateTax(senderData.balance, amount);
      const totalAmount = amount + tax;
      
      if (senderData.balance < totalAmount) {
        await message.channel.send(`-# **رصيدك ما يكفي يا فقير (تحتاج ${totalAmount} دينار مع الضريبة) <:emoji_464:1388211597197050029>**`);
        return true;
      }
      
      const lastTransfer = client.transferCooldowns.get(message.author.id);
      if (lastTransfer && Date.now() - lastTransfer < 10000) {
        await message.channel.send(`-# **انتظر ثواني قبل التحويل مرة أخرى <:emoji_334:1388211595053760663>**`);
        return true;
      }
      
      const confirmMsg = await message.channel.send({ content: `-# **الضريبة ${tax.toFixed(2)} دينار <:emoji_41:1471619709936996406> اكتب "تأكيد" لو انت متأكد من عملية التحويل**` });
      client.pendingTransfers.set(`${message.guild.id}-${confirmMsg.id}`, { 
        senderId: message.author.id, 
        targetId: target.id, 
        amount, 
        tax, 
        totalAmount, 
        msgId: confirmMsg.id, 
        channelId: message.channel.id 
      });
      
      setTimeout(() => { 
        if (client.pendingTransfers.has(`${message.guild.id}-${confirmMsg.id}`)) { 
          client.pendingTransfers.delete(`${message.guild.id}-${confirmMsg.id}`); 
          confirmMsg.delete().catch(() => { }); 
        } 
      }, 10000);
      return true;
    }

    if (command === 'تأكيد') {
      const pending = Array.from(client.pendingTransfers.entries()).find(([key, data]) => 
        key.startsWith(message.guild.id) && data.senderId === message.author.id && data.channelId === message.channel.id
      );

      if (!pending) return true;
      
      const [key, data] = pending;
      const sender = await getUserData(data.senderId);
      const target = await getUserData(data.targetId);
      
      if (sender.balance < data.totalAmount) {
        client.pendingTransfers.delete(key);
        await message.channel.send(`-# **رصيدك ما يكفي الحين يا فقير <:emoji_464:1388211597197050029>**`);
        return true;
      }
      
      sender.balance = parseFloat((sender.balance - data.totalAmount).toFixed(2));
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
      return true;
    }

    if (command === 'اغنياء') {
      const topUsers = await User.find().sort({ balance: -1 }).limit(5);
      const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx + 1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
      const embed = new EmbedBuilder().setDescription(`**اعلى عِلية قوم <:y_coroa:1404576666105417871> **\n\n${topMsg}`).setColor(0x2b2d31);
      await message.channel.send({ embeds: [embed] });
      return true;
    }

    if (command === 'سجل') {
      const user = message.mentions.users.first() || message.author;
      const userData = await getUserData(user.id);
      const historyText = await formatHistory(client, userData.history);
      const embed = new EmbedBuilder().setDescription(`**السجل الخاص بـ ${user.username} <:emoji_41:1471619709936996406>**\n\n${historyText}`).setColor(0x2b2d31);
      await message.channel.send({ embeds: [embed] });
      return true;
    }
  }

  return false;
}

// ==================== onMessage ====================
async function onMessage(client, message) {
  return;
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;
  
  // ===== أمر /economy =====
  if (interaction.commandName === 'economy') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: `-# ** ما عندك صلاحية <:emoji_84:1389404919672340592> **`, ephemeral: true });
      return true;
    }
    
    const sub = interaction.options.getSubcommand();
    let settings = await Settings.findOne({ guildId: interaction.guild.id });
    
    if (!settings) {
      settings = new Settings({ 
        guildId: interaction.guild.id,
        prefix: null,
        economyChannel: null,
        economyMessage: '',
        welcomeSettings: { color: '2b2d31' }
      });
    }
    
    if (sub === 'channel') {
      const room = interaction.options.getChannel('room');
      settings.economyChannel = room.id;
      await settings.save();
      
      const reply = await interaction.reply({ 
        content: `-# ** تم تعيين روم الاقتصاد إلى <#${room.id}> <:2thumbup:1467287897429512396> **`, 
        ephemeral: true,
        fetchReply: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      return true;
    }
    
    if (sub === 'message') {
      const text = interaction.options.getString('text');
      
      if (text.toLowerCase() === 'حذف') {
        settings.economyMessage = '';
        await settings.save();
        const reply = await interaction.reply({ 
          content: `-# ** تم حذف رسالة الاقتصاد <:2thumbup:1467287897429512396> **`, 
          ephemeral: true,
          fetchReply: true
        });
        setTimeout(() => reply.delete().catch(() => {}), 5000);
        return true;
      }
      
      settings.economyMessage = text;
      await settings.save();
      const reply = await interaction.reply({ 
        content: `-# ** تم تعيين رسالة الاقتصاد <:2thumbup:1467287897429512396> **`, 
        ephemeral: true,
        fetchReply: true
      });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
      return true;
    }
  }
  
  return false;
}

module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction,
  getUserData   // 👈 إضافة هذا السطر
};
