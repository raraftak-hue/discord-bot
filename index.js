const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const app = express();

// ==================== 🔒 الإعدادات والربط 🔒 ====================
const ALLOWED_GUILDS = ['1387902577496297523']; 
const OWNER_ID = "1131951548772122625"; 
const MONGO_URI = "mongodb+srv://raraftak_db_user:TzKcCxo9EvNDzBbj@cluster0.t4j2uux.mongodb.net/MyBot?retryWrites=true&w=majority";
const ECONOMY_CHANNEL_ID = "1458435717200875671"; 
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.MessageContent
  ]
});

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ متصل بـ MongoDB بنجاح!'))
  .catch(err => console.error('❌ فشل الاتصال بـ MongoDB:', err));

const UserSchema = new mongoose.Schema({
  userId: String,
  balance: { type: Number, default: 10 },
  history: [{ type: { type: String }, amount: Number, date: { type: Date, default: Date.now } }]
});
const SettingsSchema = new mongoose.Schema({
  guildId: String,
  welcomeSettings: { channelId: String, title: String, description: String, color: { type: String, default: '2b2d31' }, image: String }
});

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

async function getUserData(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId, balance: 10, history: [{ type: 'STARTING_GIFT', amount: 10 }] });
    await user.save();
  }
  return user;
}

async function getSettings(guildId) {
  let settings = await Settings.findOne({ guildId });
  if (!settings) {
    settings = new Settings({ guildId, welcomeSettings: { color: '2b2d31' } });
    await settings.save();
  }
  return settings;
}

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} أونلاين!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try { 
    // تسجيل أوامر السلاش (اختياري بما أنك تفضل النصية الآن)
    await rest.put(Routes.applicationCommands(client.user.id), { body: [
      { name: 'bothelp', description: 'عرض جميع الأوامر' }
    ]}); 
  } catch (e) { console.error(e); }
  
  cron.schedule('0 0 * * 5', async () => {
    await User.updateMany({ balance: { $gt: 0 } }, [{ $set: { balance: { $subtract: ["$balance", { $floor: { $multiply: ["$balance", 0.025] } }] } } }]);
    console.log("✅ تم خصم ضريبة الجمعة من الجميع.");
  });
});

client.on('guildMemberAdd', async (member) => {
  if (!ALLOWED_GUILDS.includes(member.guild.id)) return;
  const settings = await getSettings(member.guild.id);
  const { channelId, title, description, color, image } = settings.welcomeSettings;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle(title || 'أهلاً بك')
    .setDescription(`-# **${description || `نورتنا يا ${member}`}**`)
    .setColor(parseInt(color, 16) || 0x2b2d31);
  if (image) embed.setImage(image);
  channel.send({ embeds: [embed] });
});

// مخزن مؤقت لعمليات التحويل المعلقة
const pendingTransfers = new Map();

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !ALLOWED_GUILDS.includes(message.guild.id)) return;

  const content = message.content.trim();
  const args = content.split(/\s+/);
  const command = args[0];

  // --- أوامر الإدارة ---
  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    const timeArg = args.find(a => /^\d+[mhd]$/i.test(a));
    if (!member || !timeArg) return message.channel.send(`${message.author}, -# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    const timeValue = parseInt(timeArg);
    const timeUnit = timeArg.slice(-1).toLowerCase();
    let durationInMs = timeValue * (timeUnit === 'm' ? 60 : timeUnit === 'h' ? 3600 : 86400) * 1000;
    if (durationInMs > 2419200000) return message.channel.send(`${message.author}, -# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    if (member.id === message.author.id) return message.channel.send(`${message.author}, -# **تبي تعطي تايم لنفسك ؟ واضح عقلك فيه خلل ما بسويها لك <:rimuruWut:1388211603140247565> **`);
    try {
      await member.timeout(durationInMs);
      message.channel.send(`-# **تم اسكات ${member} يارب ما يعيدها <a:DancingShark:1469030444774199439>**`);
    } catch (error) {
      message.channel.send(`${message.author}, -# **ما تقدر تسويها هو يدعس عليك <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
    const member = message.mentions.members.first();
    if (!member) return message.channel.send(`${message.author}, -# **منشن الشخص الي تبي تطرده يا ذكي <:emoji_334:1388211595053760663>**`);
    if (member.id === message.author.id) return message.channel.send(`${message.author}, -# **تبي تطرد نفسك؟ استهدي بالله <:rimuruWut:1388211603140247565>**`);
    try {
      await member.kick();
      message.channel.send(`-# **تم طرد ${member.user.tag} بنجاح، الفكة منه!**`);
    } catch (error) {
      message.channel.send(`${message.author}, -# **ما تقدر تسويها هو يدعس عليك <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const num = parseInt(args[1]);
    if (num > 0 && num <= 100) await message.channel.bulkDelete(num + 1);
  }

  // --- أوامر الاقتصاد (في الروم المحدد) ---
  if (message.channel.id === ECONOMY_CHANNEL_ID) {
    const userData = await getUserData(message.author.id);

    if (command === 'دنانير') {
      const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
      message.channel.send({ embeds: [new EmbedBuilder().setDescription(`-# **رصيدك الحالي ${userData.balance} دنانير و آخر عملية تحويل تلقيتها بـ ${lastIn.amount} <:money_with_wings:1388212679981666334>**`).setColor(0x2b2d31)] });
    }

    if (command === 'تحويل') {
      const target = message.mentions.users.first();
      // البحث عن المبلغ في الأرجومنتس (قد يكون args[2] أو args[1] لو المنشن في الأخير)
      const amount = parseInt(args.find(a => !isNaN(a) && a.length < 10)); 
      
      if (!target || isNaN(amount) || amount <= 0) return message.channel.send(`${message.author}, -# **استخدم: تحويل @الشخص القيمة**`);
      if (userData.balance < amount) return message.channel.send(`${message.author}, رصيدك لا يكفي.`);
      if (target.id === message.author.id) return message.channel.send(`${message.author}, ما تقدر تحول لنفسك.`);

      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_transfer').setLabel('تأكيد').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_transfer').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
      );

      const confirmMsg = await message.channel.send({
        content: `-# **متأكد تبي تحول ${amount} دينار لـ ${target} ؟**`,
        components: [confirmRow]
      });

      pendingTransfers.set(confirmMsg.id, { senderId: message.author.id, targetId: target.id, amount });
      
      // حذف رسالة التأكيد بعد دقيقة لو ما صار تفاعل
      setTimeout(() => { if(pendingTransfers.has(confirmMsg.id)) { pendingTransfers.delete(confirmMsg.id); confirmMsg.delete().catch(() => {}); } }, 60000);
    }

    if (command === 'اغنياء') {
      const topUsers = await User.find().sort({ balance: -1 }).limit(5);
      // استخدام \u200F لضمان اتجاه النص العربي مع الأسماء الإنجليزية
      const topMsg = topUsers.map((u, idx) => `\u200F-# ${idx+1}. <@${u.userId}> - ${u.balance} دينار`).join('\n');
      message.channel.send({ content: `**قائمة الأغنياء**\n${topMsg}` });
    }

    if (command === 'السجل') {
      const history = userData.history.slice(-5).reverse();
      const historyMsg = history.map(h => `\u200F- **${h.type === 'TRANSFER_RECEIVE' ? 'استلام' : 'هدية'}**: ${h.amount} دنانير`).join('\n') || 'لا يوجد سجل.';
      message.channel.send({ embeds: [new EmbedBuilder().setTitle('سجل التحويلات').setDescription(historyMsg).setColor(0x2b2d31)] });
    }
  }
});

client.on('interactionCreate', async (i) => {
  if (!i.isButton()) return;

  if (i.customId === 'confirm_transfer' || i.customId === 'cancel_transfer') {
    const transferData = pendingTransfers.get(i.message.id);
    if (!transferData) return i.reply({ content: 'انتهت صلاحية هذا الطلب.', ephemeral: true });
    if (i.user.id !== transferData.senderId) return i.reply({ content: 'هذا الطلب ليس لك.', ephemeral: true });

    if (i.customId === 'cancel_transfer') {
      pendingTransfers.delete(i.message.id);
      return i.update({ content: '❌ تم إلغاء عملية التحويل.', components: [] });
    }

    const senderData = await getUserData(transferData.senderId);
    if (senderData.balance < transferData.amount) {
      pendingTransfers.delete(i.message.id);
      return i.update({ content: '❌ رصيدك لم يعد يكفي لإتمام العملية.', components: [] });
    }

    const targetData = await getUserData(transferData.targetId);
    senderData.balance -= transferData.amount;
    targetData.balance += transferData.amount;
    targetData.history.push({ type: 'TRANSFER_RECEIVE', amount: transferData.amount });
    
    await senderData.save();
    await targetData.save();
    pendingTransfers.delete(i.message.id);

    await i.update({ 
      content: `-# **تم تحويل ${transferData.amount} لـ <@${transferData.targetId}> رصيدك الآن ${senderData.balance} <a:moneywith_:1470458218953179237>**`, 
      components: [] 
    });
  }

  // نظام التذاكر
  if (i.customId === 'open_ticket') {
    const ch = await i.guild.channels.create({ name: `ticket-${i.user.username}`, type: ChannelType.GuildText, permissionOverwrites: [{ id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] });
    ch.send({ content: `${i.user}`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger))] });
    i.reply({ content: `تم فتح التذكرة ${ch}`, ephemeral: true });
  }
  if (i.customId === 'close_ticket') { await i.reply('سيتم الإغلاق...'); setTimeout(() => i.channel.delete(), 3000); }
});

app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));
