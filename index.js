const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const app = express();

// ==================== 🔒 الإعدادات والربط 🔒 ====================
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

// ==================== 📊 Schemas ====================
const UserSchema = new mongoose.Schema({
  userId: String,
  balance: { type: Number, default: 5 },
  history: [{ type: { type: String }, amount: Number, date: { type: Date, default: Date.now }, targetId: String, senderId: String }]
});

const SettingsSchema = new mongoose.Schema({
  guildId: String,
  welcomeSettings: { channelId: String, title: String, description: String, color: { type: String, default: '2b2d31' }, image: String }
});

const GlobalSettingsSchema = new mongoose.Schema({
  allowedGuilds: { type: [String], default: ['1387902577496297523'] }
});

const TicketSettingsSchema = new mongoose.Schema({
  guildId: String,
  categoryId: { type: String, default: '1387909837693915148' },
  embedDescription: { type: String, default: 'اضغط على الزر لفتح تذكرة جديدة.' },
  embedColor: { type: String, default: '2b2d31' },
  embedImage: { type: String, default: null },
  supportRoleId: { type: String, default: null }
});

// ==================== 📊 نظام الحذف التلقائي الجديد مع رسالة مخصصة ====================
const AutoDeleteChannelSchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  deleteDelay: { type: Number, default: 0 }, // 0 = فوري، بالأرقام = ثواني
  filterType: { type: String, default: 'all' }, // 'all', 'words', 'images', 'links', 'files'
  allowedWords: { type: [String], default: [] },
  blockedWords: { type: [String], default: [] },
  exceptUsers: { type: [String], default: [] },
  exceptRoles: { type: [String], default: [] },
  customMessage: { type: String, default: null } // رسالة مخconst SubscriptionSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  guildName: String,
  ownerId: String,
  duration: String,
  durationValue: String,
  expiresAt: Date,
  status: { type: String, default: 'active' }
});

const Subscription = mongoose.model('Subscription', SubscriptionSchema);

const AutoDelete = mongoose.model('AutoDeleteChannel', AutoDeleteChannelSchema);

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);
const GlobalSettings = mongoose.model('GlobalSettings', GlobalSettingsSchema);
const TicketSettings = mongoose.model('TicketSettings', TicketSettingsSchema);
// ==================== 🔧 الدوال المساعدة ====================
async function getGlobalSettings() {
  let settings = await GlobalSettings.findOne();
  if (!settings) {
    settings = new GlobalSettings();
    await settings.save();
  }
  return settings;
}

async function getUserData(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId, balance: 5, history: [{ type: 'STARTING_GIFT', amount: 5 }] });
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

async function getTicketSettings(guildId) {
  let settings = await TicketSettings.findOne({ guildId });
  if (!settings) {
    settings = new TicketSettings({ guildId });
    await settings.save();
  }
  return settings;
}

async function getAutoDeleteChannels(guildId) {
  return await AutoDelete.find({ guildId });
}

async function getSubscription(guildId) {
  return await Subscription.findOne({ guildId });
}

async function getAllSubscriptions() {
  return await Subscription.find({});
}

async function addSubscription(data) {
  const newSub = new Subscription(data);
  return await newSub.save();
}

async function removeSubscription(guildId) {
  return await Subscription.deleteOne({ guildId });
}

async function updateSubscription(guildId, data) {
  return await Subscription.findOneAndUpdate({ guildId }, data, { new: true });
}

async function isSubscribed(guildId) {
  const sub = await getSubscription(guildId);
  return sub && sub.status === 'active' && sub.expiresAt > new Date();
}

async function formatHistory(client, history) {
  const filteredHistory = history.filter(h => h.type !== 'STARTING_GIFT');
  const latestThree = filteredHistory.slice(-3).reverse();

  if (latestThree.length === 0) {
    return "-# **ما عندك اي تحويلات صارت في ذي السنة <:emoji_32:1471962578895769611> **";
  }

  const historyPromises = latestThree.map(async (h) => {
    const date = new Date(h.date);
    const dateStr = `${date.getDate()}-${date.getMonth() + 1}`;
    let displayName = "";

    if (h.type === 'TRANSFER_SEND' || h.type === 'TRANSFER_RECEIVE') {
      try {
        const user = await client.users.fetch(h.targetId || h.senderId);
        displayName = user.displayName || user.username;
      } catch (error) {
        displayName = "مستخدم سابق";
      }
    }

    switch (h.type) {
      case 'TRANSFER_SEND':
        return `-# ** تحويل الى ${displayName} في ${dateStr} <:emoji_41:1471619709936996406>**`;
      case 'TRANSFER_RECEIVE':
        return `-# ** استلام من ${displayName} في ${dateStr} <:emoji_41:1471983856440836109> **`;
      case 'WEEKLY_TAX':
        return `-# ** خصم زكاة 2.5% = ${Math.abs(h.amount)} في ${dateStr} <:emoji_40:1471983905430311074>**`;
      case 'OWNER_ADD':
        return `-# ** اضافة من المالك ${h.amount} في ${dateStr} <:emoji_41:1471619709936996406>**`;
      case 'OWNER_REMOVE':
        return `-# ** سحب من المالك ${Math.abs(h.amount)} في ${dateStr} <:emoji_41:1471619709936996406>**`;
      default:
        return `-# **${h.type}: ${h.amount} في ${dateStr}**`;
    }
  });

  return (await Promise.all(historyPromises)).join('\n');
}

// ==================== 📋 أوامر السلاش (مرتبة حسب الفئات) ====================

// ==================== 👥 أوامر العامة ====================
const slashCommands = [
  { name: 'help', description: 'عرض جميع الأوامر' },
  {
    name: 'eco',
    description: 'النظام المالي',
    options: [
      { name: 'bal', description: 'عرض الرصيد', type: 1 },
      {
        name: 'pay',
        description: 'تحويل أموال',
        type: 1,
        options: [
          { name: 'user', description: 'المستلم', type: 6, required: true },
          { name: 'amount', description: 'المبلغ', type: 4, required: true }
        ]
      },
      { name: 'top', description: 'قائمة الأغنياء', type: 1 },
      { name: 'hist', description: 'سجل المعاملات', type: 1 }
    ]
  },
];

// ==================== 🛡️ أوامر الإدارة ====================
const adminCommands = [
  {
    name: 'ticket',
    description: 'نظام التذاكر',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      { name: 'panel', description: 'عرض لوحة التذاكر', type: 1 },
      {
        name: 'set',
        description: 'إعدادات التذاكر',
        type: 1,
        options: [
          { name: 'category', description: 'روم التذاكر', type: 7, required: false, channel_types: [4] },
          { name: 'desc', description: 'الوصف', type: 3, required: false },
          { name: 'color', description: 'اللون', type: 3, required: false },
          { name: 'image', description: 'الصورة', type: 3, required: false },
          { name: 'role', description: 'رتبة الدعم', type: 8, required: false }
        ]
      }
    ]
  },
  {
    name: 'welcome',
    description: 'نظام الترحيب',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      { name: 'channel', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'room', description: 'الروم', type: 7, required: true }] },
      {
        name: 'msg',
        description: 'تعديل رسالة الترحيب',
        type: 1,
        options: [
          { name: 'title', description: 'العنوان', type: 3 },
          { name: 'desc', description: 'الوصف', type: 3 },
          { name: 'color', description: 'اللون', type: 3 },
          { name: 'image', description: 'الصورة', type: 3 }
        ]
      },
      { name: 'info', description: 'عرض الإعدادات', type: 1 },
      { name: 'test', description: 'تجربة الرسالة', type: 1 }
    ]
  },
  {
    name: 'give',
    description: 'نظام القيف أوي',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      {
        name: 'start',
        description: 'بدء قيف أوي',
        type: 1,
        options: [
          { name: 'prize', description: 'الجائزة', type: 3, required: true },
          { name: 'time', description: 'المدة (10m, 1h, 1d)', type: 3, required: true },
          { name: 'winners', description: 'عدد الفائزين', type: 4, required: true },
          { name: 'cond', description: 'الشروط', type: 3, required: false },
          { name: 'img', description: 'الصورة', type: 3, required: false }
        ]
      }
    ]
  },
  {
    name: 'num',
    description: 'لعبة الأرقام',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      { name: 'start', description: 'بدء لعبة', type: 1 },
      { name: 'stop', description: 'إيقاف اللعبة', type: 1 }
    ]
  }
];

// ==================== 👑 أوامر المالك ====================
const ownerCommands = [
  {
    name: 'own',
    description: 'أوامر المالك',
    default_member_permissions: "0",
    options: [
      {
        name: 'servers',
        description: 'إدارة السيرفرات',
        type: 1,
        options: [
          { name: 'action', description: 'add/remove', type: 3, required: true, choices: [{ name: '➕ إضافة', value: 'add' }, { name: '➖ حذف', value: 'remove' }] },
          { name: 'id', description: 'ايدي السيرفر', type: 3, required: true }
        ]
      },
      { name: 'reset', description: 'إعادة تعيين الرصيد', type: 1 }
    ]
  },
  {
    name: 'bal',
    description: 'إدارة الرصيد (للمالك)',
    default_member_permissions: "0",
    options: [
      { name: 'add', description: 'إضافة رصيد', type: 1, options: [{ name: 'amount', description: 'الكمية', type: 4, required: true }] },
      { name: 'rem', description: 'سحب رصيد', type: 1, options: [{ name: 'amount', description: 'الكمية', type: 4, required: true }] }
    ]
  },
  {
    name: 'sub',
    description: 'إدارة الاشتراكات (للمالك)',
    default_member_permissions: '0',
    options: [
      {
        name: 'add',
        description: 'إضافة اشتراك',
        type: 1,
        options: [
          { name: 'id', description: 'ايدي السيرفر', type: 3, required: true },
          { name: 'duration', description: 'المدة (تجريبي, 7d, 30d, 60d, 1y)', type: 3, required: true, choices: [
            { name: 'تجريبي (3 أيام)', value: '3d' },
            { name: 'اسبوع (7 أيام)', value: '7d' },
            { name: 'شهر (30 يوم)', value: '30d' },
            { name: 'شهرين (60 يوم)', value: '60d' },
            { name: 'سنة (365 يوم)', value: '1y' }
          ] }
        ]
      },
      {
        name: 'remove',
        description: 'إزالة اشتراك',
        type: 1,
        options: [
          { name: 'id', description: 'ايدي السيرفر', type: 3, required: true }
        ]
      },
      { name: 'list', description: 'عرض الاشتراكات', type: 1 }
    ]
  },
  // ==================== 🤖 نظام الحذف التلقائي مع رسالة مخصصة ====================
  {
    name: 'auto',
    description: 'نظام الحذف التلقائي',
    default_member_permissions: "0",
    options: [
      {
        name: 'add',
        description: 'إضافة روم للحذف التلقائي',
        type: 1,
        options: [
          { name: 'channel', description: 'الروم', type: 7, required: true, channel_types: [0] },
          { name: 'delay', description: 'مدة الحذف (ثواني، 0 = فوري)', type: 4, required: false },
          { name: 'type', description: 'نوع الرسائل', type: 3, required: false, 
            choices: [
              { name: '📝 الكل', value: 'all' },
              { name: '🔤 كلمات محددة', value: 'words' },
              { name: '🖼️ صور', value: 'images' },
              { name: '🔗 روابط', value: 'links' },
              { name: '📁 ملفات', value: 'files' }
            ] 
          },
          { name: 'allowed', description: 'كلمات مسموحة (مفصولة بفواصل)', type: 3, required: false },
          { name: 'blocked', description: 'كلمات ممنوعة (مفصولة بفواصل)', type: 3, required: false },
          { name: 'except_users', description: 'ايديات مستثناة (مفصولة بفواصل)', type: 3, required: false },
          { name: 'except_roles', description: 'ايديات رتب مستثناة (مفصولة بفواصل)', type: 3, required: false },
          { name: 'message', description: 'رسالة مخصصة عند الحذف', type: 3, required: false }
        ]
      },
      {
        name: 'rem',
        description: 'إزالة روم من الحذف التلقائي',
        type: 1,
        options: [
          { name: 'channel', description: 'الروم', type: 7, required: true, channel_types: [0] }
        ]
      },
      {
        name: 'list',
        description: 'عرض إعدادات الحذف التلقائي',
        type: 1
      }
    ]
  }
];

// دمج جميع الأوامر
const allCommands = [...slashCommands, ...adminCommands, ...ownerCommands];

client.on('ready', async () => {
  console.log(`✅ ${client.user.tag} جاهز للعمل!`);

  // تسجيل أوامر السلاش
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('بدأ تحديث أوامر السلاش (/).');
    await rest.put(Routes.applicationCommands(client.user.id), { body: allCommands });
    console.log('تم تحديث أوامر السلاش بنجاح.');
  } catch (error) {
    console.error('❌ خطأ في تحديث أوامر السلاش:', error);
  }
});

const transferCooldowns = new Map();
const pendingTransfers = new Map();

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // معالجة تأكيد التحويل
  if (message.content.toLowerCase() === 'تأكيد' && pendingTransfers.has(message.reference?.messageId)) {
    const { senderId, targetId, amount, msgId, channelId } = pendingTransfers.get(message.reference.messageId);
    if (message.author.id !== senderId) return;

    pendingTransfers.delete(message.reference.messageId);
    const confirmMsg = await message.channel.messages.fetch(msgId).catch(() => {});
    if (confirmMsg) confirmMsg.delete().catch(() => {});

    const senderData = await getUserData(senderId);
    const targetData = await getUserData(targetId);

    if (senderData.balance < amount) return message.channel.send(`-# **رصيدك ما يكفي يا فقير <:emoji_464:1388211597197050029>**`);

    senderData.balance = parseFloat((senderData.balance - amount).toFixed(2));
    senderData.history.push({ type: 'TRANSFER_SEND', amount: -amount, targetId: targetId });
    targetData.balance = parseFloat((targetData.balance + amount).toFixed(2));
    targetData.history.push({ type: 'TRANSFER_RECEIVE', amount: amount, senderId: senderId });

    await senderData.save();
    await targetData.save();

    transferCooldowns.set(senderId, Date.now());
    return message.channel.send(`-# **تم تحويل ${amount} دينار إلى <@${targetId}> بنجاح! <:emoji_41:1471619709936996406>**`);
  }

  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // 1️⃣ أوامر المالك النصية
  if (message.author.id === OWNER_ID) {
    if (command === 'addbal') {
      const amount = parseFloat(args[0]);
      if (isNaN(amount) || amount <= 0) return message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
      const ownerData = await getUserData(message.author.id);
      ownerData.balance = parseFloat((ownerData.balance + amount).toFixed(2));
      ownerData.history.push({ type: 'OWNER_ADD', amount: amount });
      await ownerData.save();
      return message.channel.send(`-# **تم اضافة الرصيد لحسابك <:emoji_41:1471619709936996406> **`);
    }
    if (command === 'rembal') {
      const amount = parseFloat(args[0]);
      if (isNaN(amount) || amount <= 0) return message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
      const ownerData = await getUserData(message.author.id);
      if (ownerData.balance < amount) {
        return message.channel.send(`-# **العضو ما معه ذي الكمية saybu <:emoji_84:1389404919672340592> **`);
      }
      ownerData.balance = parseFloat((ownerData.balance - amount).toFixed(2));
      ownerData.history.push({ type: 'OWNER_REMOVE', amount: -amount });
      await ownerData.save();
      return message.channel.send(`-# **تم سحب الرصيد من حسابك <:emoji_41:1471619709936996406> **`);
    }
  }

  // 3️⃣ أوامر الاقتصاد النصية
  const isAdmin = message.member.permissions.has(PermissionsBitField.Flags.Administrator);
  
  if (command === 'دنانير' || command === 'تحويل' || command === 'اغنياء' || command === 'سجل') {
    if (!isAdmin && message.channel.id !== ECONOMY_CHANNEL_ID) {
      return message.channel.send(`-# **هذا الامر في روم <#${ECONOMY_CHANNEL_ID}> <:1_81:1467286889877999843> **`);
    }
  }

  if (command === 'دنانير') {
    const user = message.mentions.users.first() || message.author;
    const userData = await getUserData(user.id);
    const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
    message.channel.send(`-# **رصيدك الحالي ${userData.balance} و اخر عملية تحويل تلقيتها كانت بـ ${lastIn.amount} دينار <:emoji_41:1471619709936996406> **`);
    return;
  }

  if (command === 'تحويل') {
    const target = message.mentions.users.first();
    const amount = parseFloat(args.find(a => !isNaN(a) && a.includes('.') ? parseFloat(a) : parseInt(a)));
    if (!target || isNaN(amount) || amount <= 0) return message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    const senderData = await getUserData(message.author.id);
    if (senderData.balance < amount) return message.channel.send(`-# **رصيدك ما يكفي يا فقير <:emoji_464:1388211597197050029>**`);
    if (target.id === message.author.id) return message.channel.send(`-# **ما تقدر تحول لنفسك يا اهبل <:emoji_464:1388211597197050029>**`);
    const lastTransfer = transferCooldowns.get(message.author.id);
    if (lastTransfer && Date.now() - lastTransfer < 10000) {
      const remaining = Math.ceil((10000 - (Date.now() - lastTransfer)) / 1000);
      return message.channel.send(`-# **انتظر ${remaining} ثواني قبل التحويل مرة أخرى <:emoji_334:1388211595053760663>**`);
    }
    const confirmMsg = await message.channel.send({ content: `-# **اكتب "تأكيد" لو انت متأكد من عملية التحويل  **\n-# تجاهل الرسالة لو لم تكن متاكد` });
    pendingTransfers.set(confirmMsg.id, { senderId: message.author.id, targetId: target.id, amount, msgId: confirmMsg.id, channelId: message.channel.id });
    setTimeout(() => { if (pendingTransfers.has(confirmMsg.id)) { pendingTransfers.delete(confirmMsg.id); confirmMsg.delete().catch(() => { }); } }, 10000);
    return;
  }

  if (command === 'اغنياء') {
    const topUsers = await User.find().sort({ balance: -1 }).limit(5);
    const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx + 1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
    const embed = new EmbedBuilder().setTitle('الطبقة الارستقراطية <:y_coroa:1404576666105417871>').setDescription(topMsg).setColor(0x2b2d31);
    message.channel.send({ embeds: [embed] });
    return;
  }

  if (command === 'سجل') {
    const user = message.mentions.users.first() || message.author;
    const userData = await getUserData(user.id);
    const formattedHistory = await formatHistory(client, userData.history);
    message.channel.send({ embeds: [new EmbedBuilder().setTitle(`سجل ${user.username} <:emoji_41:1471619709936996406>`).setDescription(formattedHistory).setColor(0x2b2d31)] });
    return;
  }

  // 4️⃣ أوامر الإدارة النصية
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
    return;
  }

  if (command === 'تكلم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    if (!member) return message.channel.send(`-# **منشن الشخص الي تبي تفك عنه التايم يا ذكي <:emoji_334:1388211595053760663>**`);
    try {
      await member.timeout(null);
      message.channel.send(`-# **تمت مسامحتك ايها العبد ${member} <:2thumbup:1467287897429512396>**`);
    } catch (error) {
      message.channel.send(`-# **ما اقدر فك عنه التايم، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
    return;
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
      message.channel.send(`-# **ما اقدر اطرده، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
    return;
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.channel.send(`-# **حدد عدد الرسايل الي تبي تحذفها (1-100) يا ذكي <:emoji_334:1388211595053760663>**`);
    try {
      await message.channel.bulkDelete(amount + 1);
      const msg = await message.channel.send(`-# **تم حذف ${amount} رسايل بنجاح <:2thumbup:1467287897429512396>**`);
      setTimeout(() => msg.delete().catch(() => { }), 3000);
    } catch (error) {
      message.channel.send(`-# **ما اقدر احذف الرسايل، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
    return;
  }

  if (command === 'ارقام') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    for (const [id, game] of activeNumberGames.entries()) {
      const msg = await message.channel.messages.fetch(id).catch(() => null);
      if (msg && !game.started) {
        return message.channel.send(`-# **في لعبة شغالة يـ عبد خلها تخلص <:emoji_38:1470920843398746215> **`);
      }
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join_number_game').setLabel('انضم للعبة').setStyle(ButtonStyle.Secondary)
    );
    const msg = await message.channel.send({ content: `-# **تم بدأ لعبة التخمين مهمتكم رح تكون تخمين الرقم الصحيح من 1 الى 100 <:new_emoji:1388436089584226387> **`, components: [row] }).catch(() => { });
    activeNumberGames.set(msg.id, {
      hostId: message.author.id, players: [], attempts: new Map(), guesses: [], started: false,
      winner: null, secretNumber: null, currentTurn: null, currentTurnIndex: 0, alivePlayers: [], timer: null, canGuess: new Map()
    });
    startNumberGameAfterDelay(msg, activeNumberGames.get(msg.id));
    return;
  }

  if (command === 'ايقاف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    
    let found = false;
    for (const [id, game] of activeNumberGames.entries()) {
      const msg = await message.channel.messages.fetch(id).catch(() => null);
      if (msg) {
        await msg.edit({ 
          content: `-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`, 
          components: [] 
        }).catch(() => { });
      }
      if (game.timer) clearTimeout(game.timer);
      activeNumberGames.delete(id);
      found = true;
    }
    
    if (found) {
      message.channel.send(`-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`);
    }
    return;
  }

  let activeGame = null;
  let gameId = null;
  for (const [id, game] of activeNumberGames.entries()) {
    if (game.started && 
        game.alivePlayers && 
        game.alivePlayers.includes(message.author.id) && 
        game.currentTurn === message.author.id &&
        game.canGuess?.get(message.author.id) === true) {
      activeGame = game;
      gameId = id;
      break;
    }
  }
  
  if (activeGame) {
    const game = activeGame;
    const guess = parseInt(message.content);
    if (isNaN(guess) || guess < 1 || guess > 100) return;
    
    if (game.timer) { clearTimeout(game.timer); game.timer = null; }
    
    game.canGuess?.set(message.author.id, false);
    
    game.guesses.push({ userId: message.author.id, guess: guess });
    
    if (guess === game.secretNumber) {
      game.winner = message.author.id;
      if (game.players.length === 1) {
        await message.channel.send(`-# **مبروك جبت الرقم الصح و هو ${game.secretNumber} هذا ذكاء ولا حظ يا ترى …. <:1_81:1467286889877999843> **`).catch(() => { });
      } else {
        await message.channel.send(`-# **مبروك المشارك ${getUserTag(message.author.id)} جاب الرقم الصح و هو ${game.secretNumber} حظا اوفر للمشاركين الآخرين فالمرات القادمة <:1_81:1467286889877999843> **`).catch(() => { });
      }
      activeNumberGames.delete(gameId);
      return;
    }
    
    const attempts = game.attempts.get(message.author.id) || 0;
    game.attempts.set(message.author.id, attempts + 1);
    const maxAttempts = game.players.length === 1 ? 5 : 3;
    
    if (game.players.length === 1) {
      if (guess < game.secretNumber) { await message.channel.send(`-# **تخمينك غلط و الرقم اكبر من ${guess} <:1_12:1467286888489422984> **`).catch(() => { }); }
      else { await message.channel.send(`-# **تخمينك غلط و الرقم اصغر من ${guess} <:1_12:1467286888489422984> **`).catch(() => { }); }
    } else {
      if (guess < game.secretNumber) { await message.channel.send(`-# **تخمين غلط من العضو ${getUserTag(message.author.id)} و الرقم أكبر من الرقم ${guess} **`).catch(() => { }); }
      else { await message.channel.send(`-# **تخمين غلط من العضو ${getUserTag(message.author.id)} و الرقم أصغر من الرقم ${guess} **`).catch(() => { }); }
    }
    
    if (attempts + 1 >= maxAttempts) {
      await message.channel.send(`-# **المشارك ${getUserTag(message.author.id)} انطرد عشان خلصت محاولاته ${maxAttempts} <:s7_discord:1388214117365453062> **`).catch(() => { });
      game.currentTurnIndex++;
      game.currentTurn = null;
      
      setTimeout(() => { startNextTurn(message.channel, gameId); }, 8000);
      return;
    }
    
    game.currentTurnIndex++;
    game.currentTurn = null;
    
    setTimeout(() => { startNextTurn(message.channel, gameId); }, 8000);
    return;
  }

// ==================== 🤖 نظام الحذف التلقائي المعدل (مع التأخير الزمني) ====================
  const autoDeleteChannels = await getAutoDeleteChannels(message.guild.id);
  
  for (const settings of autoDeleteChannels) {
    if (message.channel.id !== settings.channelId) continue;
    
    // تحقق من الاستثناءات
    if (settings.exceptUsers.includes(message.author.id)) continue;
    
    let memberRoles = message.member?.roles.cache.map(r => r.id) || [];
    if (settings.exceptRoles.some(roleId => memberRoles.includes(roleId))) continue;
    
    // تحقق من نوع الفلتر
    let shouldDelete = false;
    let filterTypeText = '';
    
    switch (settings.filterType) {
      case 'all':
        shouldDelete = true;
        filterTypeText = 'جميع الرسائل';
        break;
      case 'images':
        shouldDelete = message.attachments.size > 0 && message.attachments.some(a => a.contentType?.startsWith('image/'));
        filterTypeText = 'الصور';
        break;
      case 'links':
        shouldDelete = message.content.match(/https?:\/\/[^\s]+/g) !== null;
        filterTypeText = 'الروابط';
        break;
      case 'files':
        shouldDelete = message.attachments.size > 0;
        filterTypeText = 'الملفات';
        break;
      case 'words':
        // كلمات ممنوعة
        if (settings.blockedWords.length > 0) {
          const content = message.content.toLowerCase();
          shouldDelete = settings.blockedWords.some(word => content.includes(word.toLowerCase()));
        }
        // كلمات مسموحة (إذا كانت الكل ممنوع عدا المسموح)
        if (settings.allowedWords.length > 0 && !shouldDelete) {
          const content = message.content.toLowerCase();
          shouldDelete = !settings.allowedWords.some(word => content.includes(word.toLowerCase()));
        }
        filterTypeText = 'كلمات محددة';
        break;
    }
    
    if (shouldDelete) {
      try {
        // تطبيق التأخير الزمني
        if (settings.deleteDelay > 0) {
          // تأخير الحذف
          setTimeout(async () => {
            try {
              // التحقق أن الرسالة ما زالت موجودة
              const fetchedMsg = await message.channel.messages.fetch(message.id).catch(() => null);
              if (fetchedMsg) {
                await message.delete();
              }
            } catch (e) {
              // الرسالة ربما حذفت بالفعل
            }
          }, settings.deleteDelay * 1000);
          
          // إرسال رسالة تحذير فورية
          let warningText = settings.customMessage || `-# ** سيتم حذف رسالتك بعد ${settings.deleteDelay} ثواني <:emoji_38:1401773302619439147> **`;
          
          // استبدال المتغيرات
          warningText = warningText.replace(/{user}/g, message.author.toString())
                                  .replace(/{channel}/g, message.channel.toString())
                                  .replace(/{type}/g, filterTypeText)
                                  .replace(/{delay}/g, settings.deleteDelay.toString());
          
          const warningMsg = await message.channel.send(warningText);
          
          setTimeout(() => warningMsg.delete().catch(() => {}), 10000);
          
        } else {
          // حذف فوري
          await message.delete();
          
          // إرسال رسالة تحذير (تنحذف بعد 10 ثواني)
          let warningText = settings.customMessage || `-# ** هذا الروم مخصص بس للـ ${filterTypeText} يـ ذكي <:emoji_38:1401773302619439147> **`;
          
          // استبدال المتغيرات
          warningText = warningText.replace(/{user}/g, message.author.toString())
                                  .replace(/{channel}/g, message.channel.toString())
                                  .replace(/{type}/g, filterTypeText)
                                  .replace(/{delay}/g, '0');
          
          const warningMsg = await message.channel.send(warningText);
          
          setTimeout(() => warningMsg.delete().catch(() => {}), 10000);
        }
        
      } catch (e) {
        // رسالة خطأ إذا ماقدر يحذف
        console.error('خطأ في الحذف التلقائي:', e);
      }
    }
    
    break;
  }
});

// ==================== 🎮 تفاعلات الأزرار ====================
client.on('interactionCreate', async (i) => {
  const globalSettings = await getGlobalSettings();
  if (i.guild && !globalSettings.allowedGuilds.includes(i.guild.id)) return;

  if (i.isChatInputCommand()) {
    const { commandName, options, user, member } = i;
    const userData = await getUserData(user.id);

    // ==================== 👥 أوامر العامة ====================
    if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('قائمة الأوامر')
        .setColor(0x2b2d31)
        .setDescription(
          `**👥 أوامر العامة**\n` +
          `-# /help - عرض الأوامر\n` +
          `-# /eco bal - عرض الرصيد\n` +
          `-# /eco pay - تحويل أموال\n` +
          `-# /eco top - قائمة الأغنياء\n` +
          `-# /eco hist - سجل المعاملات\n\n` +
          `**📝 أوامر نصية**\n` +
          `-# دنانير، تحويل، اغنياء، سجل\n` +
          `-# تايم، طرد، حذف\n\n` +
          `**🛡️ أوامر الإدارة**\n` +
          `-# /welcome, /ticket, /give, /num\n\n` +
          `**👑 أوامر المالك**\n` +
          `-# /own, /bal, /auto`
        );
      return i.reply({ embeds: [embed] });
    }

    if (commandName === 'eco') {
      const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!isAdmin && i.channel.id !== ECONOMY_CHANNEL_ID) {
        return i.reply({ 
          content: `-# **هذا الامر في روم <#${ECONOMY_CHANNEL_ID}> <:1_81:1467286889877999843> **`, 
          ephemeral: false 
        });
      }

      const sub = options.getSubcommand();
      if (sub === 'bal') {
        const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
        return i.reply({ content: `-# **رصيدك الحالي ${userData.balance} و اخر عملية تحويل تلقيتها كانت بـ ${lastIn.amount}**`, ephemeral: false });
      }
      if (sub === 'pay') {
        const lastTransfer = transferCooldowns.get(user.id);
        if (lastTransfer && Date.now() - lastTransfer < 10000) {
          const remaining = Math.ceil((10000 - (Date.now() - lastTransfer)) / 1000);
          return i.reply({ content: `انتظر ${remaining} ثواني قبل التحويل مرة أخرى.`, ephemeral: true });
        }
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        if (userData.balance < amount) return i.reply({ content: 'رصيدك لا يكفي.', ephemeral: true });
        if (target.id === user.id) return i.reply({ content: 'ما تقدر تحول لنفسك.', ephemeral: true });
        const confirmMsg = await i.reply({ content: `-# **اكتب "تأكيد" لو انت متأكد من عملية التحويل  **\n-# تجاهل الرسالة لو لم تكن متاكد`, fetchReply: true });
        pendingTransfers.set(confirmMsg.id, { senderId: user.id, targetId: target.id, amount, msgId: confirmMsg.id, channelId: i.channel.id });
        setTimeout(() => { if (pendingTransfers.has(confirmMsg.id)) { pendingTransfers.delete(confirmMsg.id); i.deleteReply().catch(() => { }); } }, 10000);
        return;
      }
      if (sub === 'top') {
        const topUsers = await User.find().sort({ balance: -1 }).limit(5);
        const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx + 1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
        const embed = new EmbedBuilder().setTitle('الطبقة الارستقراطية <:y_coroa:1404576666105417871>').setDescription(topMsg).setColor(0x2b2d31);
        return i.reply({ embeds: [embed] });
      }
      if (sub === 'hist') {
        const formattedHistory = await formatHistory(client, userData.history);
        return i.reply({ embeds: [new EmbedBuilder().setTitle(`سجل ${user.username} <:emoji_41:1471619709936996406>`).setDescription(formattedHistory).setColor(0x2b2d31)] });
      }
    }

    // ==================== 🛡️ أوامر الإدارة ====================
    if (commandName === 'ticket') {
      const sub = options.getSubcommand();
      const ticketSettings = await getTicketSettings(i.guild.id);
      
      if (sub === 'panel') {
        const embed = new EmbedBuilder()
          .setColor(parseInt(ticketSettings.embedColor, 16) || 0x2b2d31);
        
        if (ticketSettings.embedDescription) embed.setDescription(ticketSettings.embedDescription);
        if (ticketSettings.embedImage) embed.setImage(ticketSettings.embedImage);
        
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Secondary));
        
        await i.deferReply({ ephemeral: true });
        await i.channel.send({ embeds: [embed], components: [row] });
        await i.deleteReply();
      }
      
      if (sub === 'set') {
        let updated = false;
        if (options.getChannel('category')) { ticketSettings.categoryId = options.getChannel('category').id; updated = true; }
        if (options.getString('desc')) { ticketSettings.embedDescription = options.getString('desc'); updated = true; }
        if (options.getString('color')) { ticketSettings.embedColor = options.getString('color').replace('#', ''); updated = true; }
        if (options.getString('image')) { ticketSettings.embedImage = options.getString('image'); updated = true; }
        if (options.getRole('role')) { ticketSettings.supportRoleId = options.getRole('role').id; updated = true; }
        
        if (updated) { await ticketSettings.save(); i.reply({ content: '✅ تم تحديث إعدادات التذاكر بنجاح.', ephemeral: true }); }
        else { i.reply({ content: '⚠️ ما حددت أي خيار للتحديث.', ephemeral: true }); }
      }
      return;
    }

    if (commandName === 'welcome') {
      const sub = options.getSubcommand();
      const settings = await getSettings(i.guild.id);
      
      if (sub === 'channel') { 
        settings.welcomeSettings.channelId = options.getChannel('room').id; 
        await settings.save(); 
        i.reply('✅ تم تعيين الروم.'); 
      }
      
      if (sub === 'msg') {
        if (options.getString('title')) settings.welcomeSettings.title = options.getString('title');
        if (options.getString('desc')) settings.welcomeSettings.description = options.getString('desc');
        if (options.getString('color')) settings.welcomeSettings.color = options.getString('color').replace('#', '');
        if (options.getString('image')) settings.welcomeSettings.image = options.getString('image');
        await settings.save(); 
        i.reply('✅ تم التعديل.');
      }
      
      if (sub === 'info') {
        i.reply({ embeds: [new EmbedBuilder().setTitle('إعدادات الترحيب').setColor(0x2b2d31).setDescription(`-# **الروم:** <#${settings.welcomeSettings.channelId || 'غير محدد'}>\n-# **اللون:** #${settings.welcomeSettings.color}\n-# **العنوان:** ${settings.welcomeSettings.title || 'غير محدد'}\n-# **الوصف:** ${settings.welcomeSettings.description || 'غير محدد'}`)] });
      }
      
      if (sub === 'test') {
        await sendWelcome(member, settings);
        i.reply({ content: '✅ تم إرسال تجربة الترحيب.', ephemeral: true });
      }
      return;
    }

    if (commandName === 'give') {
      const sub = options.getSubcommand();
      
      if (sub === 'start') {
        const prize = options.getString('prize');
        const durationStr = options.getString('time');
        const winnersCount = options.getInteger('winners');
        const condition = options.getString('cond') || 'لا توجد شروط';
        const imageOption = options.getString('img');
        const timeMatch = durationStr.match(/^(\d+)([mhd])$/);
        if (!timeMatch) return i.reply({ content: 'صيغة الوقت غلط! (مثال: 10m, 1h, 1d)', ephemeral: true });
        const timeValue = parseInt(timeMatch[1]);
        const timeUnit = timeMatch[2];
        const durationMs = timeValue * (timeUnit === 'm' ? 60 : timeUnit === 'h' ? 3600 : 86400) * 1000;
        const endTime = Math.floor((Date.now() + durationMs) / 1000);
        
        // حفظ آخر صورة
        let image = giveawayImages.get(i.guild.id);
        if (imageOption) {
          image = imageOption;
          giveawayImages.set(i.guild.id, imageOption);
        }
        
        const embed = new EmbedBuilder()
          .setDescription(`-# **سحب عشوائي على ${prize} ينتهي في <t:${endTime}:R> <:emoji_45:1397804598110195863> **\n-# **الي سوا السحب العشوائي ${user} <:y_coroa:1404576666105417871> **\n-# **الشروط ${condition} <:new_emoji:1388436089584226387> **`)
          .setColor(0x2b2d31);
        if (image) embed.setImage(image);
        
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_giveaway').setLabel('ادخل').setStyle(ButtonStyle.Secondary));
        
        await i.deferReply({ ephemeral: true });
        const msg = await i.channel.send({ embeds: [embed], components: [row] });
        await i.deleteReply();
        
        const participants = new Set();
        const collector = msg.createMessageComponentCollector({ time: durationMs });
        
        collector.on('collect', async (btn) => {
          if (btn.customId === 'join_giveaway') {
            if (participants.has(btn.user.id)) {
              return btn.reply({ content: `-# **انت داخل القيف اصلا <:__:1467633552408576192> **`, ephemeral: true }).catch(() => { });
            }
            participants.add(btn.user.id);
            await btn.reply({ content: `-# **تم دخولك فالسحب يا رب تفوز <:2thumbup:1467287897429512396> **`, ephemeral: true }).catch(() => { });
          }
        });

        collector.on('end', async () => {
          const list = Array.from(participants);
          if (list.length === 0) return msg.edit({ content: '❌ انتهى القيف أوي بدون مشاركين.', embeds: [], components: [] }).catch(() => { });
          const winners = [];
          for (let j = 0; j < Math.min(winnersCount, list.length); j++) {
            const winnerIdx = Math.floor(Math.random() * list.length);
            winners.push(`<@${list.splice(winnerIdx, 1)[0]}>`);
          }
          const endEmbed = EmbedBuilder.from(embed).setDescription(`-# **انتهى السحب على ${prize}**\n-# **الفائزين هم** ${winners.join(', ')}`);
          await msg.edit({ embeds: [endEmbed], components: [] }).catch(() => { });
          msg.channel.send(`-# **مبروك فزتم بـ ${prize} افتحوا تكت عشان تستلموها <:emoji_33:1401771703306027008> **\n-# **${winners.join(', ')}**`).catch(() => { });
        });
      }
      return;
    }

    if (commandName === 'num') {
      const sub = options.getSubcommand();
      
      if (sub === 'start') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) { return i.reply({ content: '❌ هذا الأمر للأدمن فقط.', ephemeral: true }); }
        for (const [id, game] of activeNumberGames.entries()) {
          const msg = await i.channel.messages.fetch(id).catch(() => null);
          if (msg && !game.started) { return i.reply({ content: `-# **في لعبة شغالة يـ عبد خلها تخلص <:emoji_38:1470920843398746215> **`, ephemeral: true }); }
        }
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_number_game').setLabel('انضم للعبة').setStyle(ButtonStyle.Secondary));
        await i.reply({ content: `-# **تم بدأ لعبة التخمين مهمتكم رح تكون تخمين الرقم الصحيح من 1 الى 100 <:new_emoji:1388436089584226387> **`, components: [row] });
        const msg = await i.fetchReply();
        activeNumberGames.set(msg.id, {
          hostId: i.user.id, players: [], attempts: new Map(), guesses: [], started: false,
          winner: null, secretNumber: null, currentTurn: null, currentTurnIndex: 0, alivePlayers: [], timer: null, canGuess: new Map()
        });
        startNumberGameAfterDelay(msg, activeNumberGames.get(msg.id));
        return;
      }
      
      if (sub === 'stop') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
        
        let found = false;
        for (const [id, game] of activeNumberGames.entries()) {
          const msg = await i.channel.messages.fetch(id).catch(() => null);
          if (msg) {
            await msg.edit({ content: `-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`, components: [] }).catch(() => { });
          }
          if (game.timer) clearTimeout(game.timer);
          activeNumberGames.delete(id);
          found = true;
        }
        
        if (found) {
          i.reply({ content: `-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`, ephemeral: true });
        }
        return;
      }
    }

    // ==================== 👑 أوامر المالك ====================
    if (commandName === 'own' && user.id === OWNER_ID) {
      const sub = options.getSubcommand();
      
      if (sub === 'servers') {
        const action = options.getString('action');
        const id = options.getString('id');
        const settings = await getGlobalSettings();
        
        if (action === 'add') {
          if (!settings.allowedGuilds.includes(id)) {
            settings.allowedGuilds.push(id);
            await settings.save();
            i.reply({ content: `✅ تم إضافة السيرفر ${id}`, ephemeral: true });
          } else {
            i.reply({ content: `⚠️ السيرفر موجود بالفعل`, ephemeral: true });
          }
        } else {
          settings.allowedGuilds = settings.allowedGuilds.filter(g => g !== id);
          await settings.save();
          i.reply({ content: `✅ تم حذف السيرفر ${id}`, ephemeral: true });
        }
      }
      
      if (sub === 'reset') {
        await User.updateMany({}, { balance: 5, history: [{ type: 'RESET_ALL', amount: 5, date: new Date() }] });
        i.reply('✅ تم إعادة تعيين رصيد الجميع إلى **5 دنانير**.');
      }
    }

    if (commandName === 'bal' && user.id === OWNER_ID) {
      const sub = options.getSubcommand();
      const amount = options.getInteger('amount');
      
      if (amount <= 0) {
        return i.reply({ content: `-# **القيمة غير صحيحه <:__:1467633552408576192> **`, ephemeral: true });
      }
      
      const ownerData = await getUserData(user.id);
      
      if (sub === 'add') {
        ownerData.balance = parseFloat((ownerData.balance + amount).toFixed(2));
        ownerData.history.push({ type: 'OWNER_ADD', amount: amount });
        await ownerData.save();
        return i.reply({ content: `-# **تم اضافة الرصيد لحسابك <:emoji_41:1471619709936996406> **`, ephemeral: true });
      }
      
      if (sub === 'rem') {
        if (ownerData.balance < amount) {
          return i.reply({ content: `-# **العضو ما معه ذي الكمية saybu <:emoji_84:1389404919672340592> **`, ephemeral: true });
        }
        ownerData.balance = parseFloat((ownerData.balance - amount).toFixed(2));
        ownerData.history.push({ type: 'OWNER_REMOVE', amount: -amount });
        await ownerData.save();
        return i.reply({ content: `-# **تم سحب الرصيد من حسابك <:emoji_41:1471619709936996406> **`, ephemeral: true });
      }
    }

   if (commandName === 'sub' && user.id === OWNER_ID) {
      const sub = options.getSubcommand();

      if (sub === 'add') {
        const guildId = options.getString('id');
        const durationValue = options.getString('duration');
        const durationMap = { '3d': 'تجريبي\n', '7d': 'اسبوع\n', '30d': 'شهر\n', '60d': 'شهرين\n', '1y': 'سنة' };
        const durationText = durationMap[durationValue];

        try {
          const guild = await client.guilds.fetch(guildId);
          const owner = await guild.fetchOwner();

          const expiresAt = new Date();
          if (durationValue.endsWith('d')) {
            expiresAt.setDate(expiresAt.getDate() + parseInt(durationValue));
          } else if (durationValue.endsWith('y')) {
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          }

          const subData = {
            guildId: guild.id,
            guildName: guild.name,
            ownerId: owner.id,
            duration: durationText,
            durationValue: durationValue,
            expiresAt: expiresAt,
            status: 'active'
          };

          const existingSub = await getSubscription(guild.id);
          if (existingSub) {
            await updateSubscription(guild.id, subData);
          } else {
            await addSubscription(subData);
          }

          await owner.send(`-# **تم الاشتراك في خدمتة البوت المتكامل في باقة \"${durationText}\" سوف يتم اعلامك قبل يوم من انتهاء الاشتراك <:emoji_38:1401773302619439147> **`).catch(() => {});
          return i.reply({ content: `✅ تم تفعيل الاشتراك للسيرفر ${guild.name} لمدة ${durationText}`, ephemeral: true });
        } catch (error) {
          console.error(error);
          return i.reply({ content: '❌ تعذر العثور على السيرفر أو تفعيل الاشتراك.', ephemeral: true });
        }
      }

      if (sub === 'remove') {
        const guildId = options.getString('id');
        try {
          const sub = await getSubscription(guildId);
          if (sub) {
            const owner = await client.users.fetch(sub.ownerId).catch(() => null);
            if (owner) {
              await owner.send(`-# **تم إلغاء اشتراككم في خدمة البوت المتكامل للسيرفر ${sub.guildName} <:emoji_464:1388211597197050029> **`).catch(() => {});
            }
          }

          await removeSubscription(guildId);
          const guild = await client.guilds.fetch(guildId).catch(() => null);
          if (guild) {
            await guild.leave();
          }
          return i.reply({ content: '✅ تم إلغاء الاشتراك وإخراج البوت من السيرفر.', ephemeral: true });
        } catch (error) {
          console.error(error);
          return i.reply({ content: '❌ حدث خطأ أثناء إزالة الاشتراك.', ephemeral: true });
        }
      }

      if (sub === 'list') {
        const subs = await getAllSubscriptions();
        if (subs.length === 0) {
          return i.reply({ content: 'لا توجد اشتراكات حالياً.', ephemeral: true });
        }

        let list = subs.map(s => {
          return `- **${s.guildName}** (ID: ${s.guildId})\n  - الحالة: ${s.status}\n  - المدة: ${s.duration}\n  - تنتهي في: ${s.expiresAt.toLocaleDateString()}`;
        }).join('\n');

        if (list.length > 2000) {
          list = list.substring(0, 1990) + '...';
        }

        return i.reply({ content: `**قائمة الاشتراكات:**\n${list}`, ephemeral: true });
      }
    }

    if (commandName === 'auto' && user.id === OWNER_ID) {      const sub = options.getSubcommand();
      
      if (sub === 'add') {
        const channel = options.getChannel('channel');
        const delay = options.getInteger('delay') ?? 0;
        const filterType = options.getString('type') ?? 'all';
        const allowedStr = options.getString('allowed') || '';
        const blockedStr = options.getString('blocked') || '';
        const exceptUsersStr = options.getString('except_users') || '';
        const exceptRolesStr = options.getString('except_roles') || '';
        const customMessage = options.getString('message') || null;
        
        // تحويل النصوص إلى مصفوفات
        const allowedWords = allowedStr.split(',').map(s => s.trim()).filter(s => s);
        const blockedWords = blockedStr.split(',').map(s => s.trim()).filter(s => s);
        const exceptUsers = exceptUsersStr.split(',').map(s => s.trim()).filter(s => s);
        const exceptRoles = exceptRolesStr.split(',').map(s => s.trim()).filter(s => s);
        
        // حذف الإعدادات القديمة لهذا الروم إن وجدت
        await AutoDelete.deleteMany({ guildId: i.guild.id, channelId: channel.id });
        
        // إنشاء إعدادات جديدة
        const newSettings = new AutoDelete({
          guildId: i.guild.id,
          channelId: channel.id,
          deleteDelay: delay,
          filterType,
          allowedWords,
          blockedWords,
          exceptUsers,
          exceptRoles,
          customMessage
        });
        
        await newSettings.save();
        
        return i.reply({ 
          content: `-# ** تم تعيين هذا الروم للحذف التلقائي <:new_emoji:1388436089584226387> **`, 
          ephemeral: true 
        });
      }
      
      if (sub === 'rem') {
        const channel = options.getChannel('channel');
        await AutoDelete.deleteMany({ guildId: i.guild.id, channelId: channel.id });
        
        return i.reply({ 
          content: `-# ** تم حذف هذا الروم من الحذف التلقائي <:new_emoji:1388436095842385931> **`, 
          ephemeral: true 
        });
      }
      
      if (sub === 'list') {
        const channels = await getAutoDeleteChannels(i.guild.id);
        
        if (channels.length === 0) {
          return i.reply({ content: '⚠️ لا يوجد رومات مفعلة للحذف التلقائي.', ephemeral: true });
        }
        
        let message = `**رومات الحذف التلقائي و معلوماتها <:new_emoji:1388436089584226387> **\n\n`;
        
        for (const ch of channels) {
          const filterTypes = {
            'all': 'جميع الرسائل',
            'words': 'كلمات محددة',
            'images': 'الصور',
            'links': 'الروابط',
            'files': 'الملفات'
          };
          
          const delayText = ch.deleteDelay === 0 ? 'فوري' : `${ch.deleteDelay} ثانية`;
          const allowedText = ch.allowedWords.length > 0 ? ch.allowedWords.join(', ') : 'لا يوجد';
          const blockedText = ch.blockedWords.length > 0 ? ch.blockedWords.join(', ') : 'لا يوجد';
          const exceptUsersText = ch.exceptUsers.length > 0 ? ch.exceptUsers.map(id => `<@${id}>`).join(' ') : 'لا يوجد';
          const exceptRolesText = ch.exceptRoles.length > 0 ? ch.exceptRoles.map(id => `<@&${id}>`).join(' ') : 'لا يوجد';
          const customMessageText = ch.customMessage || 'الرسالة الافتراضية';
          
          message += `-# **الروم <#${ch.channelId}>**\n`;
          message += `-# **المستثنين هم ${exceptUsersText}**\n`;
          message += `-# **الرتب المستثناة ${exceptRolesText}**\n`;
          message += `-# **الرسائل فيه تنحذف ${delayText}**\n`;
          message += `-# **نوع الرسائل الي تحذف هي ${filterTypes[ch.filterType] || ch.filterType}**\n`;
          message += `-# **الرسالة المخصصة:** ${customMessageText}\n`;
          
          if (ch.filterType === 'words') {
            if (ch.blockedWords.length > 0) message += `-# **الكلمات الممنوعة: ${blockedText}**\n`;
            if (ch.allowedWords.length > 0) message += `-# **الكلمات المسموحة فقط: ${allowedText}**\n`;
          }
          
          message += `\n`;
        }
        
        // تقسيم الرسالة إذا كانت طويلة
        if (message.length > 2000) {
          const chunks = message.match(/[\s\S]{1,1900}/g) || [];
          await i.reply({ content: chunks[0], ephemeral: true });
          for (let j = 1; j < chunks.length; j++) {
            await i.followUp({ content: chunks[j], ephemeral: true });
          }
        } else {
          await i.reply({ content: message, ephemeral: true });
        }
      }
    }
  }

  // ==================== 🎮 تفاعلات الأزرار ====================
  if (i.isButton()) {
    if (i.customId === 'open_ticket') {
      const ticketSettings = await getTicketSettings(i.guild.id);
      const category = i.guild.channels.cache.get(ticketSettings.categoryId);
      
      const ch = await i.guild.channels.create({
        name: `ticket-${i.user.username}`, 
        type: ChannelType.GuildText, 
        parent: category?.id || null,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });
      
      // بناء الرسالة مع الرتبة إذا موجودة
      let ticketMessage = `${i.user}`;
      
      if (ticketSettings.supportRoleId) {
        ticketMessage = `<@&${ticketSettings.supportRoleId}> ` + ticketMessage;
      }
      
      ticketMessage += `\n-# ** اكتب سبب فتحك للتكت و فريق الدعم بيتواصل معك قريب <:emoji_32:1471962578895769611> **`;
      
      await ch.send({ 
        content: ticketMessage,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger)
          )
        ]
      });
      
      i.reply({ content: `✅ تم فتح التذكرة: ${ch}`, ephemeral: true });
    }

    if (i.customId === 'close_ticket') {
      await i.reply({ content: `🔒 سيتم إغلاق التذكرة خلال 3 ثواني...`, ephemeral: true });
      setTimeout(() => { i.channel.delete().catch(() => { }); }, 3000);
    }

    if (i.customId === 'join_number_game') {
      const game = activeNumberGames.get(i.message.id);
      if (!game || game.started) { return i.reply({ content: `-# **اللعبة فشلت عشان مافي عدد كافي دخلها <:new_emoji:1388436095842385931> **`, ephemeral: true }).catch(() => { }); }
      if (game.players.length >= 6) { return i.reply({ content: `-# **اللعبة ممتلئة للأسف ليش ما جيت بسرعه <:emoji_84:1389404919672340592> **`, ephemeral: true }).catch(() => { }); }
      if (game.players.includes(i.user.id)) {
        return i.reply({ content: `-# **انت داخل اللعبة اصلا <:__:1467633552408576192> **`, ephemeral: true }).catch(() => { });
      }
      game.players.push(i.user.id);
      game.attempts.set(i.user.id, 0);
      if (!game.canGuess) game.canGuess = new Map();
      game.canGuess.set(i.user.id, false);
      await i.reply({ content: `-# **تم انت الحين مشارك فاللعبة <:2thumbup:1467287897429512396> **`, ephemeral: true }).catch(() => { });
    }

    if (i.customId === 'join_giveaway') {
      // معالج القيف أوي موجود في الـ collector
    }
  }
});

client.on('guildCreate', async (guild) => {
  const isSub = await isSubscribed(guild.id);
  if (!isSub) {
    const owner = await guild.fetchOwner();
    const messageContent = "-# **هذا البوت خاص و لن يعمل في خادمك الا اذا تواصلت مع سيرفر المطور لكي يسمح لك مجانا او لا <:emoji_41:1471619709936996406> **";
    try {
      await owner.send(messageContent);
      setTimeout(() => guild.leave().catch(() => {}), 10000);
    } catch (e) {
      console.error(`Failed to send DM to owner ${owner.user.tag} for guild ${guild.name}:`, e);
      const generalChannel = guild.channels.cache.find(
        channel => channel.type === ChannelType.GuildText &&
                   channel.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
      );
      if (generalChannel) {
        await generalChannel.send(messageContent).catch(() => {});
        setTimeout(() => guild.leave().catch(() => {}), 10000);
      } else {
        console.error(`Could not find a suitable channel to send message in guild ${guild.name}`);
        setTimeout(() => guild.leave().catch(() => {}), 10000);
      }
    }
  }
});

cron.schedule('0 */6 * * *', async () => {
  const subscriptions = await getAllSubscriptions();
  const now = new Date();

  for (const sub of subscriptions) {
    if (sub.status === 'active') {
      const timeLeft = sub.expiresAt.getTime() - now.getTime();
      const hoursLeft = timeLeft / (1000 * 60 * 60);

      try {
        const guild = await client.guilds.fetch(sub.guildId).catch(() => null);
        if (!guild) {
          console.log(`Guild ${sub.guildId} not found, removing subscription.`);
          await removeSubscription(sub.guildId);
          continue;
        }
        const owner = await client.users.fetch(sub.ownerId).catch(() => null);

        if (hoursLeft <= 24 && hoursLeft > 0) {
          if (owner) {
            await owner.send("-# **عزيزي المشترك اشتراكك في بوتنا المتكامل وشك على الانتهاء المدة الباقية لك 24 ساعة <:emoji_84:1389404919672340592> **\n-# **سوف يخرج البوت من الخادم ان لم تتجدد الباقة <:emoji_84:1389404919672340592> **").catch(() => {});
          }
        } else if (hoursLeft <= 0) {
          await updateSubscription(sub.guildId, { status: 'expired' });
          if (owner) {
            await owner.send("-# **انتهى اشتراككم في خدمتنا يرجى مراجعة الخادم الأم لتجديد الاشتراك <:new_emoji:1388436095842385931> **").catch(() => {});
          }
          await guild.leave().catch(() => {});
        }
      } catch (error) {
        console.error(`Error processing subscription for guild ${sub.guildId}:`, error);
      }
    }
  }
});

cron.schedule('0 0 0 * * 5', async () => {
  const users = await User.find({ balance: { $gt: 50 } });
  for (const user of users) {
    const taxAmount = user.balance * 0.025;
    user.balance = parseFloat((user.balance - taxAmount).toFixed(2));
    user.history.push({ type: 'WEEKLY_TAX', amount: -taxAmount });
    await user.save();
    try {
      const discordUser = await client.users.fetch(user.userId);
      await discordUser.send("-# ** تم جمع الزكاة الاسبوعية التي تقدر بـ 2.5% على الثروة التي تبلغ فوق الـ50 دينار <:florktahehe:1458398337874268307> **").catch(() => {});
    } catch (error) {
      console.error(`Failed to send tax message to user ${user.userId}:`, error);
    }
  }
});

app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));
