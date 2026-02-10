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

// --- تعريف أوامر السلاش ---
const slashCommands = [
  { 
    name: 'bothelp', 
    description: 'عرض جميع الأوامر' 
  },
  { 
    name: 'economy', 
    description: 'النظام المالي', 
    options: [
      { name: 'balance', description: 'عرض الرصيد', type: 1 },
      { name: 'transfer', description: 'تحويل الأموال', type: 1, options: [{ name: 'user', description: 'المستلم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] },
      { name: 'top', description: 'قائمة الأغنياء', type: 1 }
    ] 
  }
];

// أوامر خاصة بـ Administrator فقط (يتم تسجيلها بشكل منفصل لكل سيرفر)
const adminSlashCommands = [
  { 
    name: 'ticket', 
    description: 'إدارة نظام التذاكر', 
    options: [{ name: 'panel', description: 'عرض لوحة التذاكر', type: 1 }],
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
  }, 
  { 
    name: 'welcome', 
    description: 'إدارة نظام الترحيب', 
    options: [
      { name: 'set', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }] },
      { name: 'edit', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'description', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'رابط الصورة', type: 3 }] },
      { name: 'info', description: 'عرض إعدادات الترحيب', type: 1 }
    ],
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
  }
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} أونلاين!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  
  try { 
    // تسجيل الأوامر العامة (لجميع الأعضاء)
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands }); 
    console.log('✅ تم تسجيل أوامر السلاش العامة بنجاح!');
    
    // تسجيل الأوامر الإدارية لكل سيرفر مسموح
    for (const guildId of ALLOWED_GUILDS) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: adminSlashCommands });
      console.log(`✅ تم تسجيل أوامر الأدمن للسيرفر ${guildId}`);
    }
  } catch (e) { console.error(e); }
  
  cron.schedule('0 0 * * 5', async () => {
    await User.updateMany({ balance: { $gt: 0 } }, [{ $set: { balance: { $subtract: ["$balance", { $floor: { $multiply: ["$balance", 0.025] } }] } } }]);
    console.log("✅ تم خصم ضريبة الجمعة من الجميع.");
  });
});

async function sendWelcome(member, guildSettings) {
  const { channelId, title, description, color, image } = guildSettings.welcomeSettings;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder().setColor(parseInt(color, 16) || 0x2b2d31);
  
  // معالجة المتغيرات في العنوان والوصف
  const processText = (text) => text ? text.replace(/{member}/g, `${member}`) : null;

  const finalTitle = processText(title);
  const finalDesc = processText(description);

  if (finalTitle) embed.setTitle(finalTitle);
  if (finalDesc) embed.setDescription(finalDesc); // بدون `-# ** **`
  if (image) embed.setImage(image);

  // لا ترسل الإيمبيد إذا كان فارغاً تماماً (بدون عنوان أو وصف أو صورة)
  if (!finalTitle && !finalDesc && !image) return;

  channel.send({ embeds: [embed] });
}

client.on('guildMemberAdd', async (member) => {
  if (!ALLOWED_GUILDS.includes(member.guild.id)) return;
  const settings = await getSettings(member.guild.id);
  await sendWelcome(member, settings);
});

const pendingTransfers = new Map();
const transferCooldowns = new Map();

// --- معالجة الأوامر النصية ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !ALLOWED_GUILDS.includes(message.guild.id)) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0];

  // أوامر الإدارة
  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    const timeArg = args.find(a => /^\d+[mhd]$/i.test(a));
    if (!member || !timeArg) return message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    if (member.id === message.author.id) return message.channel.send(`-# ** ما تقدر تسوي تايم لنفسك يا اهبل <:emoji_464:1388211597197050029> **`);
    const timeValue = parseInt(timeArg);
    const timeUnit = timeArg.slice(-1).toLowerCase();
    let durationInMs = timeValue * (timeUnit === 'm' ? 60 : timeUnit === 'h' ? 3600 : 86400) * 1000;
    if (durationInMs > 2419200000) return message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    try {
      await member.timeout(durationInMs);
      message.channel.send(`-# **تم اسكات ${member} يارب ما يعيدها <a:DancingShark:1469030444774199439>**`);
    } catch (error) {
      message.channel.send(`-# **ما تقدر تسويها هو يدعس عليك <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'تكلم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    if (!member) return message.channel.send(`-# **منشن الشخص الي تبي تفك عنه التايم يا ذكي <:emoji_334:1388211595053760663>**`);
    try {
      await member.timeout(null);
      message.channel.send(`-# **تمت مسامحتك ايها العبد ${member} <:2thumbup:1467287897429512396>**`);
    } catch (error) {
      message.channel.send(`-# **ما اقدر افك عنه التايم، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
    const member = message.mentions.members.first();
    if (!member) return message.channel.send(`-# **منشن الشخص الي تبي تطرده يا ذكي <:emoji_334:1388211595053760663>**`);
    if (member.id === message.author.id) return message.channel.send(`-# **تبي تطرد نفسك؟ استهدي بالله <:rimuruWut:1388211603140247565>**`);
    try {
      const memberTag = member.user.tag;
      await member.kick();
      message.channel.send(`-# **انطرد ${memberTag} يا مسكين وش سوا يا ترى <:s7_discord:1388214117365453062>**`);
    } catch (error) {
      message.channel.send(`-# **ما تقدر تسويها هو يدعس عليك <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const num = parseInt(args[1]);
    if (num > 0 && num <= 100) await message.channel.bulkDelete(num + 1);
  }

  if (command === 'تجربة') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const settings = await getSettings(message.guild.id);
    await sendWelcome(message.member, settings);
    message.channel.send('✅ تم إرسال رسالة تجربة الترحيب.');
  }

  // أوامر الاقتصاد النصية (في الروم المحدد)
  if (message.channel.id === ECONOMY_CHANNEL_ID) {
    const userData = await getUserData(message.author.id);

    if (command === 'دنانير') {
      const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
      message.channel.send({ embeds: [new EmbedBuilder().setDescription(`-# **رصيدك الحالي ${userData.balance} من دنانير و آخر عملية تحويل تلقيتها بـ ${lastIn.amount} <:money_with_wings:1388212679981666334>**`).setColor(0x2b2d31)] });
    }

    if (command === 'تحويل') {
      const lastTransfer = transferCooldowns.get(message.author.id);
      if (lastTransfer && Date.now() - lastTransfer < 10000) {
        const remaining = Math.ceil((10000 - (Date.now() - lastTransfer)) / 1000);
        return message.channel.send(`-# **انتظر ${remaining} ثواني قبل التحويل مرة أخرى.**`);
      }

      const target = message.mentions.users.first();
      const amount = parseInt(args.find(a => /^\d+$/.test(a)));
      if (!target || isNaN(amount) || amount <= 0) return message.channel.send(`-# **استخدم: تحويل @الشخص القيمة**`);
      if (userData.balance < amount) return message.channel.send(`رصيدك لا يكفي.`);
      if (target.id === message.author.id) return message.channel.send(`ما تقدر تحول لنفسك.`);
      
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm_transfer').setLabel('تأكيد').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel_transfer').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
      );
      const confirmMsg = await message.channel.send({
        content: `-# **متأكد تبي تحول ${amount} دينار لـ ${target} ؟**`,
        components: [confirmRow]
      });
      pendingTransfers.set(confirmMsg.id, { senderId: message.author.id, targetId: target.id, amount });
    }

    if (command === 'اغنياء') {
      const topUsers = await User.find().sort({ balance: -1 }).limit(5);
      const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx+1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('قائمة الأغنياء')
        .setDescription(topMsg)
        .setColor(0x2b2d31);
      message.channel.send({ embeds: [embed] });
    }

    if (command === 'السجل') {
      const history = userData.history.slice(-5).reverse();
      const historyMsg = history.map(h => {
        let typeText = 'هدية';
        if (h.type === 'TRANSFER_RECEIVE') typeText = 'استلام';
        if (h.type === 'TRANSFER_SEND') typeText = 'تحويل';
        return `-# **\u200F${typeText} ${h.amount} دنانير**`;
      }).join('\n') || '-# **لا يوجد سجل.**';
      const embed = new EmbedBuilder()
        .setTitle('سجل التحويلات')
        .setDescription(historyMsg)
        .setColor(0x2b2d31);
      message.channel.send({ embeds: [embed] });
    }
  }
});

// --- معالجة التفاعلات (سلاش وأزرار) ---
client.on('interactionCreate', async (i) => {
  if (i.isChatInputCommand()) {
    if (!i.guild || !ALLOWED_GUILDS.includes(i.guild.id)) return;
    const { commandName, options, user, member } = i;

    // تحقق من صلاحية Administrator للأوامر الإدارية (احتياطي إضافي)
    if (['ticket', 'welcome'].includes(commandName)) {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return i.reply({ 
          content: `-# **يحتاج هذا الأمر لصلاحية Administrator <:emoji_43:1397804543789498428>**`, 
          ephemeral: true 
        });
      }
    }

    if (commandName === 'bothelp') {
      const helpEmbed = new EmbedBuilder()
        .setTitle('قائمة أوامر البوت')
        .setColor(0x2b2d31)
        .setDescription(`-# **تحويل @الشخص القيمة - تحويل أموال**\n-# **دنانير - عرض الرصيد**\n-# **اغنياء - قائمة الأغنياء**\n-# **السجل - سجل التحويلات**\n-# **/ticket panel - انشاء لوحة تذاكر**\n-# **/welcome set - تعيين روم الترحيب**\n-# **text cmd - أوامر الشات، حذف و تايم و طرد و تكلم و تجربة**`);
      return i.reply({ embeds: [helpEmbed] });
    }

    if (commandName === 'economy') {
      if (i.channel.id !== ECONOMY_CHANNEL_ID) return i.reply({ content: `هذه الأوامر مسموحة فقط في <#${ECONOMY_CHANNEL_ID}>`, ephemeral: true });
      const sub = options.getSubcommand();
      const userData = await getUserData(user.id);

      if (sub === 'balance') {
        const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
        return i.reply({ embeds: [new EmbedBuilder().setDescription(`-# **رصيدك الحالي ${userData.balance} دنانير و آخر عملية تحويل تلقيتها بـ ${lastIn.amount} <:money_with_wings:1388212679981666334>**`).setColor(0x2b2d31)] });
      }
      if (sub === 'transfer') {
        const lastTransfer = transferCooldowns.get(user.id);
        if (lastTransfer && Date.now() - lastTransfer < 10000) {
          const remaining = Math.ceil((10000 - (Date.now() - lastTransfer)) / 1000);
          return i.reply({ content: `انتظر ${remaining} ثواني قبل التحويل مرة أخرى.`, ephemeral: true });
        }

        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        if (userData.balance < amount) return i.reply({ content: 'رصيدك لا يكفي.', ephemeral: true });
        if (target.id === user.id) return i.reply({ content: 'ما تقدر تحول لنفسك.', ephemeral: true });
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_transfer').setLabel('تأكيد').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cancel_transfer').setLabel('إلغاء').setStyle(ButtonStyle.Danger)
        );
        const confirmMsg = await i.reply({ content: `-# **متأكد تبي تحول ${amount} دينار لـ ${target} ؟**`, components: [confirmRow], fetchReply: true });
        pendingTransfers.set(confirmMsg.id, { senderId: user.id, targetId: target.id, amount });
      }
      if (sub === 'top') {
        const topUsers = await User.find().sort({ balance: -1 }).limit(5);
        const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx+1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
        const embed = new EmbedBuilder()
          .setTitle('قائمة الأغنياء')
          .setDescription(topMsg)
          .setColor(0x2b2d31);
        return i.reply({ embeds: [embed] });
      }
    }

    if (commandName === 'welcome') {
      const sub = options.getSubcommand();
      const settings = await getSettings(i.guild.id);
      if (sub === 'set') { settings.welcomeSettings.channelId = options.getChannel('channel').id; await settings.save(); i.reply('✅ تم.'); }
      if (sub === 'edit') {
        if(options.getString('title')) settings.welcomeSettings.title = options.getString('title');
        if(options.getString('description')) settings.welcomeSettings.description = options.getString('description');
        if(options.getString('color')) settings.welcomeSettings.color = options.getString('color').replace('#','');
        if(options.getString('image')) settings.welcomeSettings.image = options.getString('image');
        await settings.save(); i.reply('✅ تم التعديل.');
      }
      if (sub === 'info') {
        i.reply({ embeds: [new EmbedBuilder().setTitle('إعدادات الترحيب').setColor(0x2b2d31).setDescription(`-# **الروم:** <#${settings.welcomeSettings.channelId || 'غير محدد'}>\n-# **اللون:** #${settings.welcomeSettings.color}\n-# **العنوان:** ${settings.welcomeSettings.title || 'غير محدد'}\n-# **الوصف:** ${settings.welcomeSettings.description || 'غير محدد'}`)] });
      }
    }
  }

  if (i.isButton()) {
    if (i.customId === 'confirm_transfer' || i.customId === 'cancel_transfer') {
      const data = pendingTransfers.get(i.message.id);
      if (!data || i.user.id !== data.senderId) return i.reply({ content: 'هذا الطلب ليس لك أو انتهى.', ephemeral: true });
      if (i.customId === 'cancel_transfer') {
        pendingTransfers.delete(i.message.id);
        return i.update({ content: '❌ تم إلغاء عملية التحويل.', components: [] });
      }
      const sender = await getUserData(data.senderId);
      if (sender.balance < data.amount) return i.update({ content: '❌ رصيدك لا يكفي.', components: [] });
      const target = await getUserData(data.targetId);
      
      sender.balance -= data.amount;
      target.balance += data.amount;
      sender.history.push({ type: 'TRANSFER_SEND', amount: data.amount });
      target.history.push({ type: 'TRANSFER_RECEIVE', amount: data.amount });
      
      await sender.save(); await target.save();
      transferCooldowns.set(data.senderId, Date.now()); 
      pendingTransfers.delete(i.message.id);
      return i.update({ content: `-# **تم تحويل ${data.amount} لـ <@${data.targetId}> رصيدك الآن ${sender.balance} <a:moneywith_:1470458218953179237>**`, components: [] });
    }
    if (i.customId === 'open_ticket') {
      const ch = await i.guild.channels.create({ name: `ticket-${i.user.username}`, type: ChannelType.GuildText, permissionOverwrites: [{ id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] });
      ch.send({ content: `${i.user}`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger))] });
      i.reply({ content: `تم فتح التذكرة ${ch}`, ephemeral: true });
    }
    if (i.customId === 'close_ticket') { await i.reply('سيتم الإغلاق...'); setTimeout(() => i.channel.delete(), 3000); }
  }
});

app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));