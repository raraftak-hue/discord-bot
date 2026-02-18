// ==================== 🤖 البوت المتكامل - النسخة النهائية (ملف واحد) 🤖 ====================
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const app = express();

// ==================== 🔒 الإعدادات والربط 🔒 ====================
const OWNER_ID = "1131951548772122625";
const MONGO_URI = "mongodb+srv://raraftak_db_user:TzKcCxo9EvNDzBbj@cluster0.t4j2uux.mongodb.net/MyBot?retryWrites=true&w=majority";

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
  welcomeSettings: {
    channelId: String,
    title: String,
    description: String,
    color: { type: String, default: '2b2d31' },
    image: String
  }
});

const GlobalSettingsSchema = new mongoose.Schema({
  allowedGuilds: { type: [String], default: [] },
  subscriptions: [{
    guildId: String,
    guildName: String,
    ownerId: String,
    duration: String,
    expiresAt: Date,
    status: { type: String, default: 'active' },
    warned24h: { type: Boolean, default: false }
  }]
});

const TicketSettingsSchema = new mongoose.Schema({
  guildId: String,
  categoryId: { type: String, default: '' },
  embedDescription: { type: String, default: 'اضغط على الزر لفتح تذكرة جديدة.' },
  embedColor: { type: String, default: '2b2d31' },
  embedImage: { type: String, default: null },
  supportRoleId: { type: String, default: null }
});

const AutoDeleteChannelSchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  deleteDelay: { type: Number, default: 0 },
  filterType: { type: String, default: 'all' },
  allowedWords: { type: [String], default: [] },
  blockedWords: { type: [String], default: [] },
  exceptUsers: { type: [String], default: [] },
  exceptRoles: { type: [String], default: [] },
  customMessage: { type: String, default: null }
});

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

// ==================== 🎯 نظام النقاط Schemas ====================
const PointsSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  messages: { type: Number, default: 0 }
});

const PointsSettingsSchema = new mongoose.Schema({
  guildId: String,
  enabled: { type: Boolean, default: false },
  rewardPerPoint: { type: Number, default: 0 },
  channelId: { type: String, default: null },
  customMessage: { type: String, default: 'مبروك {user} وصلت {points} نقطة' },
  lastMessage: { type: Map, of: Date, default: new Map() }
});

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);
const GlobalSettings = mongoose.model('GlobalSettings', GlobalSettingsSchema);
const TicketSettings = mongoose.model('TicketSettings', TicketSettingsSchema);
const AutoDelete = mongoose.model('AutoDeleteChannel', AutoDeleteChannelSchema);
const Giveaway = mongoose.model('Giveaway', GiveawaySchema);
const Points = mongoose.model('Points', PointsSchema);
const PointsSettings = mongoose.model('PointsSettings', PointsSettingsSchema);

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
    user = new User({ userId, balance: 0, history: [] });
    await user.save();
  }
  return user;
}

async function getSettings(guildId) {
  let settings = await Settings.findOne({ guildId });
  if (!settings) {
    settings = new Settings({ 
      guildId, 
      prefix: null,
      welcomeSettings: { color: '2b2d31' } 
    });
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

// ==================== 🎯 دوال نظام النقاط المساعدة ====================
function getRequiredMessages(points) {
  if (points < 5) return 5;           // النقاط 0-4: 5 رسائل
  else if (points < 15) return 10;    // النقاط 5-14: 10 رسائل
  else if (points < 30) return 20;    // النقاط 15-29: 20 رسالة
  else if (points < 50) return 35;    // النقاط 30-49: 35 رسالة
  else if (points < 75) return 55;    // النقاط 50-74: 55 رسالة
  else if (points < 100) return 80;   // النقاط 75-99: 80 رسالة
  else return 100;                     // بعد 100 نقطة: 100 رسالة
}

function calculatePointsFromMessages(totalMessages) {
  let points = 0;
  let remainingMessages = totalMessages;
  
  while (remainingMessages >= getRequiredMessages(points)) {
    remainingMessages -= getRequiredMessages(points);
    points++;
  }
  
  return { points, remainingMessages };
}

// ==================== 💰 حساب الضريبة ====================
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

// ==================== 📋 الأوامر المختصرة ====================
const slashCommands = [
  {
    name: 'wel',
    description: 'نظام الترحيب',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      { name: 'ch', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'room', description: 'الروم', type: 7, required: true }] },
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
    name: 'tic',
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
    name: 'pre',
    description: 'تغيير البادئة (اكتب "حذف" عشان تشيلها)',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      {
        name: 'new',
        description: 'البادئة الجديدة',
        type: 3,
        required: true,
        min_length: 1,
        max_length: 3
      }
    ]
  },
  {
    name: 'emb',
    description: 'إنشاء إيمبيد',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      {
        name: 'title',
        description: 'العنوان',
        type: 3,
        required: true
      },
      {
        name: 'description',
        description: 'الوصف',
        type: 3,
        required: true
      },
      {
        name: 'color',
        description: 'اللون',
        type: 3,
        required: false
      },
      {
        name: 'image',
        description: 'الصورة',
        type: 3,
        required: false
      },
      {
        name: 'thumbnail',
        description: 'الصورة المصغرة',
        type: 3,
        required: false
      },
      {
        name: 'footer',
        description: 'نص سفلي',
        type: 3,
        required: false
      },
      {
        name: 'timestamp',
        description: 'ختم وقت',
        type: 5,
        required: false
      }
    ]
  },
  // ==================== أوامر نظام النقاط ====================
  {
    name: 'points',
    description: 'نظام النقاط',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      {
        name: 'setup',
        description: 'تفعيل نظام النقاط',
        type: 1,
        options: [
          {
            name: 'channel',
            description: 'روم التهنئة (اختياري)',
            type: 7,
            required: false,
            channel_types: [0]
          },
          {
            name: 'message',
            description: 'رسالة التهنئة (استخدم {user} و {points})',
            type: 3,
            required: false
          },
          {
            name: 'reward',
            description: 'المكافأة لكل نقطة (دينار)',
            type: 4,
            required: false,
            min_value: 1
          }
        ]
      },
      {
        name: 'disable',
        description: 'إطفاء نظام النقاط',
        type: 1
      },
      {
        name: 'enable',
        description: 'تشغيل نظام النقاط',
        type: 1
      },
      {
        name: 'reset',
        description: 'إعادة تعيين نظام النقاط للجميع',
        type: 1
      }
    ]
  }
];

const ownerCommands = [
  {
    name: 'sub',
    description: 'نظام الاشتراكات',
    default_member_permissions: "0",
    options: [
      {
        name: 'add',
        description: 'إضافة سيرفر',
        type: 1,
        options: [
          { name: 'id', description: 'ايدي السيرفر', type: 3, required: true },
          {
            name: 'duration',
            description: 'المدة',
            type: 3,
            required: true,
            choices: [
              { name: 'تجريبي (3 أيام)', value: 'trial' },
              { name: 'اسبوع', value: '7d' },
              { name: 'شهر', value: '30d' },
              { name: 'شهرين', value: '60d' },
              { name: 'سنة', value: '1y' }
            ]
          }
        ]
      },
      {
        name: 'remove',
        description: 'حذف سيرفر',
        type: 1,
        options: [
          { name: 'id', description: 'ايدي السيرفر', type: 3, required: true }
        ]
      }
    ]
  },
  {
    name: 'hosting',
    description: 'عرض السيرفرات المشتركين',
    default_member_permissions: "0"
  },
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
          { name: 'delay', description: 'مدة الحذف (ثواني)', type: 4, required: false },
          {
            name: 'type',
            description: 'نوع الرسائل',
            type: 3,
            required: false,
            choices: [
              { name: 'الكل', value: 'all' },
              { name: 'صور', value: 'images' },
              { name: 'روابط', value: 'links' },
              { name: 'ملفات', value: 'files' }
            ]
          },
          { name: 'message', description: 'رسالة مخصصة', type: 3, required: false },
          { 
            name: 'allow', 
            description: 'كلمات مستثناة (افصل بينها بفاصلة)', 
            type: 3, 
            required: false 
          },
          { 
            name: 'allowed_users', 
            description: 'آيديات الأعضاء المسموح لهم (افصل بينها بفاصلة)', 
            type: 3, 
            required: false 
          }
        ]
      },
      {
        name: 'rem',
        description: 'إزالة روم',
        type: 1,
        options: [
          { name: 'channel', description: 'الروم', type: 7, required: true, channel_types: [0] }
        ]
      },
      {
        name: 'list',
        description: 'قائمة الرومات',
        type: 1
      }
    ]
  }
];

const allCommands = [...slashCommands, ...ownerCommands];

// ==================== 💾 تخزين مؤقت ====================
const pendingTransfers = new Map();
const transferCooldowns = new Map();
const activeNumberGames = new Map();

// ==================== 👋 نظام الترحيب ====================
async function sendWelcome(member, guildSettings) {
  const { channelId, title, description, color, image } = guildSettings.welcomeSettings;
  if (!channelId) return;
  
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;
  
  const embed = new EmbedBuilder().setColor(parseInt(color, 16) || 0x2b2d31);
  const processText = (text) => text ? text.replace(/{member}/g, `${member}`) : null;
  
  const finalTitle = processText(title);
  const finalDesc = processText(description);
  
  if (finalTitle) embed.setTitle(finalTitle);
  if (finalDesc) embed.setDescription(finalDesc);
  if (image) embed.setImage(image);
  
  if (!finalTitle && !finalDesc && !image) return;
  channel.send({ embeds: [embed] }).catch(() => { });
}

// ==================== 🎮 دوال لعبة الأرقام ====================
function getUserTag(userId) {
  const user = client.users.cache.get(userId);
  return user ? `<@${userId}>` : userId;
}

function findClosestGuess(guesses, secretNumber) {
  if (!guesses || guesses.length === 0) return null;
  let closest = guesses[0];
  let minDiff = Math.abs(guesses[0].guess - secretNumber);
  for (const g of guesses) {
    const diff = Math.abs(g.guess - secretNumber);
    if (diff < minDiff) {
      minDiff = diff;
      closest = g;
    }
  }
  return closest;
}

async function startNumberGameAfterDelay(msg, gameData, guildId) {
  setTimeout(async () => {
    const gameKey = `${guildId}-${msg.id}`;
    const game = activeNumberGames.get(gameKey);
    if (!game) return;
    
    if (game.players.length === 0) {
      await msg.edit({ content: `-# **اللعبة فشلت عشان مافي عدد كافي دخلها <:new_emoji:1388436095842385931> **`, components: [] }).catch(() => { });
      activeNumberGames.delete(gameKey);
      return;
    }
    
    game.started = true;
    game.secretNumber = Math.floor(Math.random() * 100) + 1;
    const playersList = game.players.map(p => getUserTag(p)).join(' ');
    
    await msg.channel.send(
      `-# ** تم بدأ اللعبة كل واحد من المشاركين عنده جولة يخمن فيها الرقم و كل مشارك له ${game.players.length === 1 ? '5' : '3'} محاولات الا اذا فاز احد فيكم <:new_emoji:1388436089584226387> **\n` +
      `-# المشاركين هم ${playersList}`
    ).catch(() => { });
    
    setTimeout(async () => { await msg.delete().catch(() => { }); }, 10000);
    setTimeout(() => { startNextTurn(msg.channel, msg.id, guildId); }, 10000);
  }, 20000);
}

async function startNextTurn(channel, msgId, guildId) {
  const gameKey = `${guildId}-${msgId}`;
  const game = activeNumberGames.get(gameKey);
  if (!game || !game.started || game.winner) return;
  
  const maxAttempts = game.players.length === 1 ? 5 : 3;
  
  game.alivePlayers = game.players.filter(p => {
    const attempts = game.attempts.get(p) || 0;
    return attempts < maxAttempts;
  });
  
  if (game.alivePlayers.length === 0) {
    const guesses = game.guesses || [];
    const closest = findClosestGuess(guesses, game.secretNumber);
    
    if (game.players.length === 1) {
      await channel.send(`-# ** نفذت خلصت محاولاتك الـ 5 و الرقم الصح كان ${game.secretNumber} <:emoji_11:1467287898448724039> **`).catch(() => { });
    } else {
      const closestUser = closest ? getUserTag(closest.userId) : 'لا يوجد';
      await channel.send(`-# ** الرقم الصح كان ${game.secretNumber} محد جابها صح و نفذت كل محاولات كل المشتركين بس اقرب واحد جاب تخمين هو ${closestUser} <:emoji_11:1467287898448724039> **`).catch(() => { });
    }
    
    activeNumberGames.delete(gameKey);
    return;
  }
  
  if (game.currentTurnIndex >= game.alivePlayers.length) game.currentTurnIndex = 0;
  
  const currentPlayer = game.alivePlayers[game.currentTurnIndex];
  game.currentTurn = currentPlayer;
  
  if (!game.canGuess) game.canGuess = new Map();
  game.players.forEach(p => game.canGuess.set(p, false));
  
  await channel.send(`-# **دور المشارك ${getUserTag(currentPlayer)} للتخمين **`).catch(() => { });
  game.canGuess.set(currentPlayer, true);
  
  if (game.timer) { clearTimeout(game.timer); game.timer = null; }
  
  const timer = setTimeout(async () => {
    const game = activeNumberGames.get(gameKey);
    if (!game || !game.started || game.winner) return;
    if (game.currentTurn === currentPlayer) {
      game.canGuess?.set(currentPlayer, false);
      await channel.send(`-# **المشارك ${getUserTag(currentPlayer)} انطرد عشان ما خمن قبل انتهاء الوقت <:s7_discord:1388214117365453062> **`).catch(() => { });
      
      const attempts = game.attempts.get(currentPlayer) || 0;
      const maxAttempts = game.players.length === 1 ? 5 : 3;
      game.attempts.set(currentPlayer, attempts + maxAttempts);
      
      game.currentTurnIndex++;
      game.currentTurn = null;
      
      setTimeout(() => { startNextTurn(channel, msgId, guildId); }, 8000);
    }
  }, 15000);
  
  game.timer = timer;
}

// ==================== 📜 دالة تنسيق السجل المعدلة ====================
async function formatHistory(history) {
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

// ==================== 🎁 دالة إنهاء القيف أوي ====================
async function endGiveaway(giveaway) {
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

// ==================== 🚀 تشغيل البوت ====================
client.once('ready', async () => {
  console.log(`✅ تم تسجيل الدخول بـ ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: allCommands });
    console.log('✅ تم تسجيل جميع الأوامر بنجاح!');
  } catch (e) { console.error(e); }

  const activeGiveaways = await Giveaway.find({ ended: false });
  for (const g of activeGiveaways) {
    if (g.endTime > new Date()) {
      const timeLeft = g.endTime.getTime() - Date.now();
      setTimeout(() => endGiveaway(g), timeLeft);
      console.log(`🔄 تم استعادة قيف: ${g.prize}`);
    } else { 
      await endGiveaway(g); 
    }
  }

  // ==================== ⏰ التحقق من الاشتراكات كل ساعة ====================
  cron.schedule('0 * * * *', async () => {
    const settings = await getGlobalSettings();
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    
    const initialSubCount = settings.subscriptions.length;
    settings.subscriptions = settings.subscriptions.filter(sub => {
      if (sub.status === 'expired' && sub.expiresAt < tenDaysAgo) {
        settings.allowedGuilds = settings.allowedGuilds.filter(id => id !== sub.guildId);
        console.log(`🗑️ تم حذف السيرفر ${sub.guildName} بعد 10 أيام من انتهاء الاشتراك`);
        return false;
      }
      return true;
    });
    if (settings.subscriptions.length !== initialSubCount) await settings.save();

    for (const sub of settings.subscriptions) {
      if (sub.status === 'active') {
        const timeLeft = sub.expiresAt.getTime() - now.getTime();
        
        if (timeLeft <= 24 * 60 * 60 * 1000 && timeLeft > 0 && !sub.warned24h) {
          try {
            const guild = await client.guilds.fetch(sub.guildId).catch(() => null);
            if (guild) {
              const owner = await client.users.fetch(guild.ownerId).catch(() => null);
              if (owner) {
                await owner.send(
                  `-# **عزيزي المشترك اشتراكك في بوتنا المتكامل وشك على الانتهاء المدة الباقية لك 24 ساعة <:emoji_84:1389404919672340592> **\n` +
                  `-# **سوف يخرج البوت من الخادم ان لم تتجدد الباقة <:emoji_84:1389404919672340592> **`
                );
              }
            }
            sub.warned24h = true;
            await settings.save();
          } catch (e) {}
        }
        
        if (sub.expiresAt < now) {
          sub.status = 'expired';
          await settings.save();
          
          try {
            const guild = await client.guilds.fetch(sub.guildId).catch(() => null);
            if (guild) {
              const owner = await client.users.fetch(guild.ownerId).catch(() => null);
              if (owner) {
                await owner.send(
                  `-# **انتهى اشتراككم في خدمتنا يرجى مراجعة الخادم الأم لتجديد الاشتراك <:new_emoji:1388436095842385931> **`
                );
              }
              
              const channel = guild.channels.cache.find(ch => 
                ch.type === ChannelType.GuildText && 
                ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
              );
              
              if (channel) {
                await channel.send(
                  `-# **انتهى اشتراككم في خدمتنا يرجى مراجعة الخادم الأم لتجديد الاشتراك <:new_emoji:1388436095842385931> **`
                );
              }
              
              await guild.leave();
              console.log(`🚫 غادرت سيرفر منتهي الاشتراك: ${guild.name}`);
            }
          } catch (e) { }
        }
      }
    }
  });

  // ==================== 💰 الزكاة الأسبوعية (كل جمعة) ====================
  cron.schedule('0 0 * * 5', async () => {
    console.log("⏰ بدأ تحصيل الزكاة الأسبوعية...");
    const users = await User.find({ balance: { $gt: 50 } });
    let totalTax = 0;
    
    for (const user of users) {
      const taxAmount = user.balance * 0.025;
      user.balance = parseFloat((user.balance - taxAmount).toFixed(2));
      user.history.push({ 
        type: 'WEEKLY_TAX', 
        amount: -taxAmount, 
        date: new Date() 
      });
      await user.save();
      totalTax += taxAmount;
    }
    
    console.log(`✅ تم خصم الزكاة من ${users.length} عضو بمجموع ${totalTax.toFixed(2)} دينار`);
  });
});

// ==================== 📝 معالج الرسائل ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  
  const globalSettings = await getGlobalSettings();
  const subscription = globalSettings.subscriptions.find(s => s.guildId === message.guild.id);

  if (!globalSettings.allowedGuilds.includes(message.guild.id)) {
    if (subscription && subscription.status === 'active') {
      globalSettings.allowedGuilds.push(message.guild.id);
      await globalSettings.save();
      console.log(`✅ تمت إضافة السيرفر ${message.guild.name} تلقائياً للقائمة المسموحة`);
    } else {
      return;
    }
  }
  
  // ==================== نظام النقاط ====================
  if (!message.author.bot) {
    const pointsSettings = await PointsSettings.findOne({ guildId: message.guild.id });
    
    if (pointsSettings && pointsSettings.enabled) {
      let pointsData = await Points.findOne({ 
        guildId: message.guild.id, 
        userId: message.author.id 
      });
      
      if (!pointsData) {
        pointsData = new Points({
          guildId: message.guild.id,
          userId: message.author.id,
          xp: 0,
          points: 0,
          messages: 0
        });
      }
      
      pointsData.messages += 1;
      pointsData.xp += 1;
      
      const { points: newPoints } = calculatePointsFromMessages(pointsData.messages);
      
      if (newPoints > pointsData.points) {
        const pointsGained = newPoints - pointsData.points;
        
        let pointsMessage = pointsSettings.customMessage || 'مبروك {user} وصلت {points} نقطة';
        pointsMessage = pointsMessage.replace('{user}', message.author.username);
        pointsMessage = pointsMessage.replace('{points}', newPoints);
        
        if (pointsSettings.rewardPerPoint && pointsSettings.rewardPerPoint > 0) {
          const reward = pointsGained * pointsSettings.rewardPerPoint;
          pointsMessage += ` و كسبت ${reward} دينار`;
        }
        
        pointsMessage = `-# ** ${pointsMessage} <:emoji_32:1471962578895769611> **`;
        
        if (pointsSettings.channelId) {
          const pointsChannel = message.guild.channels.cache.get(pointsSettings.channelId);
          if (pointsChannel) {
            pointsChannel.send(pointsMessage).catch(() => {});
          } else {
            message.channel.send(pointsMessage).catch(() => {});
          }
        } else {
          message.channel.send(pointsMessage).catch(() => {});
        }
        
        pointsData.points = newPoints;
      }
      
      await pointsData.save();
    }
  }
  
  const args = message.content.trim().split(/\s+/);
  const firstWord = args[0];

  const settings = await getSettings(message.guild.id);
  const prefix = settings.prefix;

  let command;

  if (prefix) {
    if (!message.content.startsWith(prefix)) return;
    command = firstWord.slice(prefix.length);
  } else {
    command = firstWord;
  }

  command = command.toLowerCase();

  // ==================== أوامر الأعضاء النصية ====================
  if (command === 'اوامر') {
    let membersMsg = '';
    
    if (prefix) {
      membersMsg = `${prefix}دنانير، ${prefix}تحويل، ${prefix}اغنياء، ${prefix}سجل، ${prefix}نقاطي، ${prefix}نقاط`;
    } else {
      membersMsg = `دنانير، تحويل، اغنياء، سجل، نقاطي، نقاط`;
    }
    
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setDescription(
        `** members<:emoji_32:1471962578895769611> **\n-# ** text - ${membersMsg}**\n\n` +
        `** Mods <:emoji_38:1470920843398746215>**\n` +
        `-# ** wel, tic, give, pre, emb, points**\n` +
        `-# ** text -  تايم، طرد، حذف، ارقام، ايقاف**`
      );
    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'دنانير') {
    const user = message.mentions.users.first() || message.author;
    const userData = await getUserData(user.id);
    const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
    return message.channel.send(`-# **رصيدك الحالي ${userData.balance} و اخر عملية تحويل تلقيتها بـ ${lastIn.amount} <:emoji_41:1471619709936996406> **`);
  }

  if (command === 'تحويل') {
    const target = message.mentions.users.first();
    const amount = parseFloat(args.find(a => !isNaN(a) && a.includes('.') ? parseFloat(a) : parseInt(a)));
    if (!target || isNaN(amount) || amount <= 0) return message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    if (target.id === message.author.id) return message.channel.send(`-# **ما تقدر تحول لنفسك يا اهبل <:emoji_464:1388211597197050029>**`);
    
    const senderData = await getUserData(message.author.id);
    const tax = calculateTax(senderData.balance, amount);
    const totalAmount = amount + tax;
    
    if (senderData.balance < totalAmount) return message.channel.send(`-# **رصيدك ما يكفي يا فقير (تحتاج ${totalAmount} دينار مع الضريبة) <:emoji_464:1388211597197050029>**`);
    
    const lastTransfer = transferCooldowns.get(message.author.id);
    if (lastTransfer && Date.now() - lastTransfer < 10000) return message.channel.send(`-# **انتظر ثواني قبل التحويل مرة أخرى <:emoji_334:1388211595053760663>**`);
    
    const confirmMsg = await message.channel.send({ content: `-# **الضريبة ${tax.toFixed(2)} دينار <:emoji_41:1471619709936996406> اكتب "تأكيد" لو انت متأكد من عملية التحويل**` });
    pendingTransfers.set(`${message.guild.id}-${confirmMsg.id}`, { 
      senderId: message.author.id, 
      targetId: target.id, 
      amount, 
      tax, 
      totalAmount, 
      msgId: confirmMsg.id, 
      channelId: message.channel.id 
    });
    
    setTimeout(() => { 
      if (pendingTransfers.has(`${message.guild.id}-${confirmMsg.id}`)) { 
        pendingTransfers.delete(`${message.guild.id}-${confirmMsg.id}`); 
        confirmMsg.delete().catch(() => { }); 
      } 
    }, 10000);
    return;
  }

  if (command === 'تأكيد') {
    const pending = Array.from(pendingTransfers.entries()).find(([key, data]) => 
      key.startsWith(message.guild.id) && data.senderId === message.author.id && data.channelId === message.channel.id
    );

    if (!pending) return;
    
    const [key, data] = pending;
    const sender = await getUserData(data.senderId);
    const target = await getUserData(data.targetId);
    
    if (sender.balance < data.totalAmount) {
      pendingTransfers.delete(key);
      return message.channel.send(`-# **رصيدك ما يكفي الحين يا فقير <:emoji_464:1388211597197050029>**`);
    }
    
    sender.balance = parseFloat((sender.balance - data.totalAmount).toFixed(2));
    target.balance = parseFloat((target.balance + data.amount).toFixed(2));
    
    sender.history.push({ type: 'TRANSFER_SEND', amount: -data.amount, targetUser: data.targetId, targetName: target.username, date: new Date() });
    target.history.push({ type: 'TRANSFER_RECEIVE', amount: data.amount, targetUser: data.senderId, targetName: sender.username, date: new Date() });
    
    await sender.save(); 
    await target.save();
    transferCooldowns.set(data.senderId, Date.now());
    
    const confirmMsg = await message.channel.messages.fetch(data.msgId).catch(() => null);
    if (confirmMsg) {
      await confirmMsg.edit({ 
        content: `-# **تم تحويل ${data.amount} لـ <@${data.targetId}> رصيدك الآن ${sender.balance} <a:moneywith_:1470458218953179237>**`, 
        components: [] 
      }).catch(() => { });
    }
    
    pendingTransfers.delete(key);
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
    const historyText = await formatHistory(userData.history);
    const embed = new EmbedBuilder().setDescription(`**السجل الخاص بـ ${user.username} <:emoji_41:1471619709936996406>**\n\n${historyText}`).setColor(0x2b2d31);
    return message.channel.send({ embeds: [embed] });
  }

  // ==================== أوامر نظام النقاط النصية ====================
  if (command === 'نقاطي') {
    const pointsData = await Points.findOne({ 
      guildId: message.guild.id, 
      userId: message.author.id 
    });
    
    if (!pointsData) {
      return message.channel.send(`-# **ما عندك نقاط، اكتب شوية رسايل <:emoji_32:1471962578895769611>**`);
    }
    
    const { remainingMessages } = calculatePointsFromMessages(pointsData.messages);
    const requiredForNext = getRequiredMessages(pointsData.points);
    const remaining = requiredForNext - remainingMessages;
    
    const pointsSettings = await PointsSettings.findOne({ guildId: message.guild.id });
    
    let replyMsg = `-# ** نقاطك حالياً ${pointsData.points} و باقيلك ${remaining} رسالة عشان تزيد نقطة`;
    
    if (pointsSettings && pointsSettings.rewardPerPoint && pointsSettings.rewardPerPoint > 0) {
      const totalEarned = pointsData.points * pointsSettings.rewardPerPoint;
      replyMsg += ` (كسبت ${totalEarned} دينار)`;
    }
    
    replyMsg += ` <:emoji_32:1471962578895769611> **`;
    
    return message.channel.send(replyMsg);
  }

  if (command === 'نقاط') {
    const topPoints = await Points.find({ guildId: message.guild.id })
      .sort({ points: -1 })
      .limit(5);
    
    if (topPoints.length === 0) {
      return message.channel.send(`-# **ما في نقاط مسجلة يا خليفة <:emoji_52:1473620889349128298>**`);
    }
    
    let leaderboardText = '';
    
    topPoints.forEach((entry, idx) => {
      leaderboardText += `-# ** الخليفة <@${entry.userId}> ${entry.points} نقطة**\n`;
    });
    
    const embed = new EmbedBuilder()
      .setDescription(`**خلفاء السبع ليالِ <:emoji_52:1473620889349128298>**\n\n${leaderboardText}`)
      .setColor(0x2b2d31);
    
    return message.channel.send({ embeds: [embed] });
  }

  if (command === 'ارقام') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    for (const [key, game] of activeNumberGames.entries()) {
      if (key.startsWith(message.guild.id)) {
        const msg = await message.channel.messages.fetch(key.split('-')[1]).catch(() => null);
        if (msg && !game.started) return message.channel.send(`-# **في لعبة شغالة يـ عبد خلها تخلص <:emoji_38:1470920843398746215> **`);
      }
    }
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_number_game').setLabel('انضم للعبة').setStyle(ButtonStyle.Secondary));
    const msg = await message.channel.send({ content: `-# **تم بدأ لعبة التخمين مهمتكم رح تكون تخمين الرقم الصحيح من 1 الى 100 <:new_emoji:1388436089584226387> **`, components: [row] }).catch(() => { });
    activeNumberGames.set(`${message.guild.id}-${msg.id}`, { 
      hostId: message.author.id, 
      players: [], 
      attempts: new Map(), 
      guesses: [], 
      started: false, 
      winner: null, 
      secretNumber: null, 
      currentTurn: null, 
      currentTurnIndex: 0, 
      alivePlayers: [], 
      timer: null, 
      canGuess: new Map() 
    });
    startNumberGameAfterDelay(msg, activeNumberGames.get(`${message.guild.id}-${msg.id}`), message.guild.id);
    return;
  }

  if (command === 'ايقاف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    let found = false;
    for (const [key, game] of activeNumberGames.entries()) {
      if (key.startsWith(message.guild.id)) {
        const msg = await message.channel.messages.fetch(key.split('-')[1]).catch(() => null);
        if (msg) await msg.edit({ content: `-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`, components: [] }).catch(() => { });
        if (game.timer) clearTimeout(game.timer);
        activeNumberGames.delete(key); 
        found = true;
      }
    }
    if (found) return message.channel.send(`-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`);
  }

  // ==================== أوامر المشرفين النصية ====================
  if (command === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
    
    const target = message.mentions.members.first();
    if (!target) return;
    
    if (target.id === message.author.id) return;
    
    if (target.permissions.has(PermissionsBitField.Flags.Administrator) || 
        target.roles.highest.position >= message.member.roles.highest.position) {
      return message.channel.send(`-# ** ما تقدر تطرده هو يدعس عليك <:emoji_84:1389404919672340592> **`);
    }
    
    if (!target.kickable) {
      return message.channel.send(`-# ** رتبتي اقل من رتبته جرب ترفعني فوق شوي <:emoji_464:1388211597197050029> **`);
    }
    
    try {
      await target.kick('طرد من مشرف');
      return message.channel.send(`-# **ما كنت مرتاح له من الاول الصراحة، باي باي <a:Hiiiii:1470461001085354148>**`);
    } catch (e) {
      return message.channel.send(`-# **صارت مشكلة بالطرد <:emoji_84:1389404919672340592> **`);
    }
  }

  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    
    const target = message.mentions.members.first();
    if (!target) return;
    
    const timeArg = args[2];
    if (!timeArg) return;
    
    const timeMatch = timeArg.match(/^(\d+)([mhd])$/);
    if (!timeMatch) return;
    
    if (target.id === message.author.id) return;
    
    const duration = parseInt(timeMatch[1]);
    const unit = timeMatch[2];
    
    let milliseconds;
    if (unit === 'm') milliseconds = duration * 60 * 1000;
    else if (unit === 'h') milliseconds = duration * 60 * 60 * 1000;
    else if (unit === 'd') milliseconds = duration * 24 * 60 * 60 * 1000;
    
    if (target.permissions.has(PermissionsBitField.Flags.Administrator) || 
        target.roles.highest.position >= message.member.roles.highest.position) {
      return message.channel.send(`-# ** ما تقدر تعطيه تايم هو يدعس عليك <:emoji_84:1389404919672340592> **`);
    }
    
    if (!target.moderatable) {
      return message.channel.send(`-# ** رتبتي اقل من رتبته جرب ترفعني فوق شوي <:emoji_464:1388211597197050029> **`);
    }
    
    try {
      await target.timeout(milliseconds, 'تايم من مشرف');
      return message.channel.send(`-# **تم اسكات ${target.user.username} يارب ما يعيدها <a:DancingShark:1469030444774199439>**`);
    } catch (e) {
      return message.channel.send(`-# **صارت مشكلة بالتايم <:emoji_84:1389404919672340592> **`);
    }
  }

  if (command === 'تكلم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    
    const target = message.mentions.members.first();
    if (!target) return;
    
    if (target.id === message.author.id) return;
    
    if (target.permissions.has(PermissionsBitField.Flags.Administrator) || 
        target.roles.highest.position >= message.member.roles.highest.position) {
      return message.channel.send(`-# ** ما تقدر تعطيه تايم هو يدعس عليك <:emoji_84:1389404919672340592> **`);
    }
    
    if (!target.moderatable) {
      return message.channel.send(`-# ** رتبتي اقل من رتبته جرب ترفعني فوق شوي <:emoji_464:1388211597197050029> **`);
    }
    
    try {
      await target.timeout(null);
      return message.channel.send(`-# **تمت مسامحتك ايها العبد ${target.user.username}<:2thumbup:1467287897429512396>**`);
    } catch (e) {
      return message.channel.send(`-# **صارت مشكلة بفك التايم <:emoji_84:1389404919672340592> **`);
    }
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) return;
    
    try {
      const messages = await message.channel.bulkDelete(amount, true);
      const reply = await message.channel.send(`-# ** تم حذف ${messages.size} رسالة <:2thumbup:1467287897429512396> **`);
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } catch (e) {
      return message.channel.send(`-# **صارت مشكلة بالحذف <:emoji_84:1389404919672340592> **`);
    }
  }

  // ==================== أوامر المالك النصية ====================
  if (command === 'زد' && message.author.id === OWNER_ID) {
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) return message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
    const ownerData = await getUserData(message.author.id);
    ownerData.balance = parseFloat((ownerData.balance + amount).toFixed(2));
    ownerData.history.push({ type: 'OWNER_ADD', amount: amount, date: new Date() });
    await ownerData.save();
    return message.channel.send(`-# **تم اضافة الرصيد لحسابك <:emoji_41:1471619709936996406> **`);
  }

  if (command === 'سحب' && message.author.id === OWNER_ID) {
    const target = message.mentions.users.first() || message.author;
    
    let amount;
    if (message.mentions.users.first()) {
      amount = parseFloat(args[2]);
    } else {
      amount = parseFloat(args[1]);
    }
    
    if (isNaN(amount) || amount <= 0) return message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
    
    const targetData = await getUserData(target.id);
    
    if (targetData.balance < amount) {
      return message.channel.send(`-# **العضو ما معه ذي الكمية saybu <:emoji_84:1389404919672340592> **`);
    }
    
    targetData.balance = parseFloat((targetData.balance - amount).toFixed(2));
    targetData.history.push({ 
      type: 'OWNER_REMOVE', 
      amount: -amount, 
      targetUser: message.author.id,
      targetName: message.author.username,
      date: new Date() 
    });
    
    await targetData.save();
    
    if (target.id === message.author.id) {
      return message.channel.send(`-# **تم سحب ${amount} دينار من حسابك <:emoji_41:1471619709936996406> **`);
    } else {
      return message.channel.send(`-# **تم سحب ${amount} دينار من ${target.username} <:emoji_41:1471619709936996406> **`);
    }
  }

  // ==================== معالجة التخمينات ====================
  let activeGame = null; 
  let gameKey = null;
  for (const [key, game] of activeNumberGames.entries()) {
    if (key.startsWith(message.guild.id) && game.started && game.alivePlayers?.includes(message.author.id) && game.currentTurn === message.author.id && game.canGuess?.get(message.author.id) === true) {
      activeGame = game; 
      gameKey = key; 
      break;
    }
  }
  
  if (activeGame) {
    const guess = parseInt(message.content);
    if (!isNaN(guess) && guess >= 1 && guess <= 100) {
      activeGame.canGuess.set(message.author.id, false);
      if (activeGame.timer) { clearTimeout(activeGame.timer); activeGame.timer = null; }
      
      const attempts = (activeGame.attempts.get(message.author.id) || 0) + 1;
      activeGame.attempts.set(message.author.id, attempts);
      activeGame.guesses.push({ userId: message.author.id, guess });
      
      if (guess === activeGame.secretNumber) {
        activeGame.winner = message.author.id;
        await message.channel.send(`-# **مبروك المشارك ${getUserTag(message.author.id)} جاب الرقم الصح و هو ${activeGame.secretNumber} حظا اوفر للمشاركين الآخرين فالمرات القادمة <:emoji_33:1471962823532740739> **`).catch(() => { });
        activeNumberGames.delete(gameKey);
      } else {
        const hint = guess < activeGame.secretNumber ? 'أكبر' : 'أصغر';
        await message.channel.send(`-# **تخمين غلط من العضو ${getUserTag(message.author.id)} و الرقم ${hint} من الرقم ${guess} **`).catch(() => { });
        
        const maxAttempts = activeGame.players.length === 1 ? 5 : 3;
        
        if (attempts >= maxAttempts) {
          await message.channel.send(`-# **المشارك ${getUserTag(message.author.id)} انطرد عشان خلصت محاولاته ${maxAttempts} <:emoji_32:1471962578895769611> **`).catch(() => { });
          activeGame.currentTurnIndex++;
          activeGame.currentTurn = null;
          setTimeout(() => { startNextTurn(message.channel, gameKey.split('-')[1], message.guild.id); }, 3000);
        } else {
          activeGame.currentTurnIndex++;
          activeGame.currentTurn = null;
          setTimeout(() => { startNextTurn(message.channel, gameKey.split('-')[1], message.guild.id); }, 3000);
        }
      }
    }
  }

  // ==================== نظام الحذف التلقائي ====================
  const autoDeleteChannels = await getAutoDeleteChannels(message.guild.id);
  const autoDelete = autoDeleteChannels.find(ch => ch.channelId === message.channel.id);
  if (autoDelete) {
    
    if (autoDelete.exceptUsers && autoDelete.exceptUsers.includes(message.author.id)) {
      return;
    }
    
    if (autoDelete.exceptRoles && autoDelete.exceptRoles.length > 0) {
      const memberRoles = message.member.roles.cache.map(r => r.id);
      const hasAllowedRole = memberRoles.some(roleId => autoDelete.exceptRoles.includes(roleId));
      if (hasAllowedRole) return;
    }
    
    let shouldDelete = false;
    
    if (autoDelete.filterType === 'all') {
      if (autoDelete.allowedWords && autoDelete.allowedWords.length > 0) {
        const messageWords = message.content.split(/\s+/).map(w => w.trim());
        const allWordsAllowed = messageWords.every(word => autoDelete.allowedWords.includes(word));
        if (!allWordsAllowed) {
          shouldDelete = true;
        }
      } else {
        shouldDelete = true;
      }
    }
    else if (autoDelete.filterType === 'images' && message.attachments.some(a => a.contentType?.startsWith('image/'))) shouldDelete = true;
    else if (autoDelete.filterType === 'links' && /https?:\/\/[^\s]+/.test(message.content)) shouldDelete = true;
    else if (autoDelete.filterType === 'files' && message.attachments.size > 0) shouldDelete = true;
    
    if (shouldDelete) {
      setTimeout(async () => {
        try {
          await message.delete();
          if (autoDelete.customMessage) {
            const msg = await message.channel.send(autoDelete.customMessage.replace(/{user}/g, `${message.author}`));
            setTimeout(() => msg.delete().catch(() => { }), 5000);
          }
        } catch (e) { }
      }, autoDelete.deleteDelay * 1000);
    }
  }
});

// ==================== 🛠️ معالج التفاعلات (السلاش والأزرار) ====================
client.on('interactionCreate', async (i) => {
  if (i.isChatInputCommand()) {
    const { commandName, options, member, user, guild } = i;
    const userData = await getUserData(user.id);

    // ==================== أوامر الإدارة السلاش ====================
    if (commandName === 'wel') {
      const sub = options.getSubcommand();
      const settings = await getSettings(i.guild.id);
      
      if (sub === 'ch') {
        settings.welcomeSettings.channelId = options.getChannel('room').id;
        await settings.save();
        return i.reply({ content: '✅ تم تعيين روم الترحيب', ephemeral: true });
      }
      
      if (sub === 'msg') {
        if (options.getString('title')) settings.welcomeSettings.title = options.getString('title');
        if (options.getString('desc')) settings.welcomeSettings.description = options.getString('desc');
        if (options.getString('color')) settings.welcomeSettings.color = options.getString('color').replace('#', '');
        if (options.getString('image')) settings.welcomeSettings.image = options.getString('image');
        await settings.save();
        return i.reply({ content: '✅ تم تعديل رسالة الترحيب', ephemeral: true });
      }
      
      if (sub === 'info') {
        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(
            `**إعدادات الترحيب**\n\n` +
            `-# **الروم:** ${settings.welcomeSettings.channelId ? `<#${settings.welcomeSettings.channelId}>` : 'غير محدد'}\n` +
            `-# **اللون:** #${settings.welcomeSettings.color}\n` +
            `-# **العنوان:** ${settings.welcomeSettings.title || 'غير محدد'}\n` +
            `-# **الوصف:** ${settings.welcomeSettings.description || 'غير محدد'}`
          );
        return i.reply({ embeds: [embed], ephemeral: true });
      }
      
      if (sub === 'test') {
        await sendWelcome(member, settings);
        return i.reply({ content: '✅ تم إرسال تجربة الترحيب', ephemeral: true });
      }
    }

    if (commandName === 'tic') {
      const sub = options.getSubcommand();
      const ticketSettings = await getTicketSettings(i.guild.id);
      
      if (sub === 'panel') {
        const embed = new EmbedBuilder()
          .setColor(parseInt(ticketSettings.embedColor, 16) || 0x2b2d31);
        
        if (ticketSettings.embedDescription) embed.setDescription(ticketSettings.embedDescription);
        if (ticketSettings.embedImage) embed.setImage(ticketSettings.embedImage);
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Secondary)
        );
        
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
        
        if (updated) {
          await ticketSettings.save();
          return i.reply({ content: '✅ تم تحديث إعدادات التذاكر بنجاح', ephemeral: true });
        } else {
          return i.reply({ content: '⚠️ ما حددت أي خيار للتحديث', ephemeral: true });
        }
      }
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
        if (!timeMatch) return i.reply({ content: 'صيغة الوقت غلط! (10m, 1h, 1d)', ephemeral: true });
        
        const durationMs = parseInt(timeMatch[1]) * (timeMatch[2] === 'm' ? 60 : timeMatch[2] === 'h' ? 3600 : 86400) * 1000;
        const endTime = new Date(Date.now() + durationMs);
        
        const embed = new EmbedBuilder()
          .setDescription(
            `-# **سحب عشوائي على ${prize} ينتهي في <t:${Math.floor(endTime.getTime() / 1000)}:R> <:emoji_45:1397804598110195863> **\n` +
            `-# **الي سوا السحب العشوائي ${i.user} <:y_coroa:1404576666105417871> **\n` +
            `-# **الشروط ${condition} <:new_emoji:1388436089584226387> **`
          )
          .setColor(0x2b2d31);
        
        if (imageOption) embed.setImage(imageOption);
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('join_giveaway').setLabel('ادخل').setStyle(ButtonStyle.Secondary)
        );
        
        await i.deferReply({ ephemeral: true });
        const msg = await i.channel.send({ embeds: [embed], components: [row] });
        await i.deleteReply();
        
        const giveaway = new Giveaway({
          guildId: i.guild.id,
          channelId: i.channel.id,
          messageId: msg.id,
          prize,
          endTime,
          winners: winnersCount,
          participants: [],
          image: imageOption,
          condition,
          hostId: i.user.id
        });
        
        await giveaway.save();
        setTimeout(async () => { await endGiveaway(giveaway); }, durationMs);
      }
    }

    if (commandName === 'pre') {
      const newPrefix = options.getString('new');
      const settings = await getSettings(i.guild.id);
      
      if (newPrefix === 'null' || newPrefix === 'none' || newPrefix === 'حذف' || newPrefix === '0') {
        settings.prefix = null;
        await settings.save();
        return i.reply({ 
          content: `-# ** تم الغاء تعيين البادئة و ستعمل كل الأوامر بدونها <:new_emoji:1388436095842385931> **`, 
          ephemeral: true 
        });
      }
      
      settings.prefix = newPrefix;
      await settings.save();
      
      return i.reply({ 
        content: `-# ** تم تعيين البادئة \`${newPrefix}\` كـ بادئة للأوامر النصية <:new_emoji:1388436089584226387> **`, 
        ephemeral: true 
      });
    }

    if (commandName === 'emb') {
      const title = options.getString('title');
      const description = options.getString('description');
      const colorInput = options.getString('color');
      const imageUrl = options.getString('image');
      const thumbnailUrl = options.getString('thumbnail');
      const footerText = options.getString('footer');
      const addTimestamp = options.getBoolean('timestamp') || false;

      let color = 0x2b2d31;
      if (colorInput) {
        const cleanColor = colorInput.replace('#', '');
        if (/^[0-9A-Fa-f]{6}$/.test(cleanColor)) {
          color = parseInt(cleanColor, 16);
        }
      }

      let finalDescription = `**${title}**\n\n${description}`;

      const embed = new EmbedBuilder()
        .setDescription(finalDescription)
        .setColor(color);

      if (imageUrl) embed.setImage(imageUrl);
      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
      if (footerText) embed.setFooter({ text: footerText });
      if (addTimestamp) embed.setTimestamp();

      await i.deferReply({ ephemeral: true });
      await i.channel.send({ embeds: [embed] });
      await i.editReply({ content: `-# ** تم ارسال الإيمبيد <:2thumbup:1467287897429512396> **` });
    }

    // ==================== أوامر نظام النقاط السلاش ====================
    if (commandName === 'points') {
      const sub = options.getSubcommand();
      
      if (sub === 'setup') {
        const channel = options.getChannel('channel');
        const customMessage = options.getString('message');
        const reward = options.getInteger('reward');
        
        let settings = await PointsSettings.findOne({ guildId: i.guild.id });
        
        if (!settings) {
          settings = new PointsSettings({
            guildId: i.guild.id,
            enabled: true,
            channelId: channel?.id || null,
            customMessage: customMessage || 'مبروك {user} وصلت {points} نقطة',
            rewardPerPoint: reward || 0
          });
        } else {
          settings.enabled = true;
          if (channel) settings.channelId = channel.id;
          if (customMessage) settings.customMessage = customMessage;
          if (reward !== null) settings.rewardPerPoint = reward;
        }
        
        await settings.save();
        
        let replyMsg = `-# ** تم تفعيل نظام النقاط في السيرفر <:new_emoji:1388436089584226387> **`;
        if (channel) replyMsg += `\n-# **📢 الروم: <#${channel.id}>**`;
        if (customMessage) replyMsg += `\n-# **📝 الرسالة: ${customMessage}**`;
        if (reward) replyMsg += `\n-# **💰 المكافأة: ${reward} دينار لكل نقطة**`;
        
        return i.reply({ content: replyMsg, ephemeral: true });
      }
      
      if (sub === 'disable') {
        let settings = await PointsSettings.findOne({ guildId: i.guild.id });
        if (settings) {
          settings.enabled = false;
          await settings.save();
        }
        return i.reply({ 
          content: `-# ** تم إطفاء نظام النقاط <:new_emoji:1388436095842385931> **`, 
          ephemeral: true 
        });
      }
      
      if (sub === 'enable') {
        let settings = await PointsSettings.findOne({ guildId: i.guild.id });
        if (settings) {
          settings.enabled = true;
          await settings.save();
        } else {
          settings = new PointsSettings({
            guildId: i.guild.id,
            enabled: true
          });
          await settings.save();
        }
        return i.reply({ 
          content: `-# **تم تشغيل نظام النقاط <:new_emoji:1388436089584226387> **`, 
          ephemeral: true 
        });
      }
      
      if (sub === 'reset') {
        await Points.deleteMany({ guildId: i.guild.id });
        
        let settings = await PointsSettings.findOne({ guildId: i.guild.id });
        if (settings) {
          settings.enabled = true;
          settings.rewardPerPoint = 0;
          await settings.save();
        }
        
        return i.reply({ 
          content: `-# **تم اعادة تعيين نظام النقاط <:2thumbup:1467287897429512396> **`, 
          ephemeral: true 
        });
      }
    }

    // ==================== أوامر المالك السلاش ====================
    if (commandName === 'sub' && i.user.id === OWNER_ID) {
      const sub = options.getSubcommand();
      const settings = await getGlobalSettings();
      
      if (sub === 'add') {
        const serverId = options.getString('id');
        const duration = options.getString('duration');
        
        let guild;
        try {
          guild = await client.guilds.fetch(serverId);
        } catch (e) {
          return i.reply({ content: `-# ** البوت غير متواجد في هذا السيرفر <:2thumbup:1467287897429512396> **`, ephemeral: true });
        }
        
        let expiresAt = new Date();
        let durationText = '';
        switch (duration) {
          case 'trial': expiresAt.setDate(expiresAt.getDate() + 3); durationText = 'تجريبي (3 أيام)'; break;
          case '7d': expiresAt.setDate(expiresAt.getDate() + 7); durationText = 'اسبوع'; break;
          case '30d': expiresAt.setDate(expiresAt.getDate() + 30); durationText = 'شهر'; break;
          case '60d': expiresAt.setDate(expiresAt.getDate() + 60); durationText = 'شهرين'; break;
          case '1y': expiresAt.setFullYear(expiresAt.getFullYear() + 1); durationText = 'سنة'; break;
        }
        
        settings.subscriptions = settings.subscriptions.filter(s => s.guildId !== serverId);
        settings.subscriptions.push({
          guildId: serverId,
          guildName: guild.name,
          ownerId: guild.ownerId,
          duration: durationText,
          expiresAt,
          status: 'active',
          warned24h: false
        });
        
        if (!settings.allowedGuilds.includes(serverId)) settings.allowedGuilds.push(serverId);
        await settings.save();
        
        try {
          const owner = await client.users.fetch(guild.ownerId).catch(() => null);
          if (owner) {
            await owner.send(`-# **الخادم ${guild.name} تم تفعيل اشتراكهم و الباقة ${durationText} <:new_emoji:1388436089584226387> **`);
          }
        } catch (e) {}
        
        return i.reply({ content: `-# ** تم تفعيل السيرفر بنجاح <:2thumbup:1467287897429512396> **`, ephemeral: true });
      }
      
      if (sub === 'remove') {
        const serverId = options.getString('id');
        
        const subscription = settings.subscriptions.find(s => s.guildId === serverId);
        if (!subscription) {
          return i.reply({ content: `-# ** البوت غير متواجد في هذا السيرفر <:2thumbup:1467287897429512396> **`, ephemeral: true });
        }
        
        settings.subscriptions = settings.subscriptions.filter(s => s.guildId !== serverId);
        settings.allowedGuilds = settings.allowedGuilds.filter(id => id !== serverId);
        await settings.save();
        
        try {
          const guild = await client.guilds.fetch(serverId);
          await guild.leave();
        } catch (e) { }
        
        return i.reply({ content: `-# ** تم حذف البوت من السيرفر بنجاح <:emoji_464:1388211597197050029> **`, ephemeral: true });
      }
    }

    if (commandName === 'hosting' && i.user.id === OWNER_ID) {
      const settings = await getGlobalSettings();
      
      if (settings.subscriptions.length === 0) {
        return i.reply({ content: '⚠️ لا يوجد سيرفرات مشتركة', ephemeral: true });
      }
      
      let activeMsg = '';
      let expiredMsg = '';
      
      for (const sub of settings.subscriptions) {
        if (sub.status === 'active') {
          activeMsg += `-# **الخادم ${sub.guildName} تم تفعيل اشتراكهم و الباقة ${sub.duration} <:new_emoji:1388436089584226387> **\n`;
        } else {
          expiredMsg += `-# **الخادم ${sub.guildName} منتهي اشتراكهم <:new_emoji:1388436095842385931> **\n`;
        }
      }
      
      const embed = new EmbedBuilder()
        .setDescription(`**الخوادم المشتركة <:emoji_41:1471983856440836109>**\n\n${activeMsg}\n${expiredMsg}`)
        .setColor(0x2b2d31);
      
      return i.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'auto' && i.user.id === OWNER_ID) {
      const sub = options.getSubcommand();
      
      if (sub === 'add') {
        const channel = options.getChannel('channel');
        const delay = options.getInteger('delay') ?? 0;
        const filterType = options.getString('type') ?? 'all';
        const customMessage = options.getString('message') || null;
        
        const allowedWordsInput = options.getString('allow');
        const allowedWords = allowedWordsInput 
          ? allowedWordsInput.split(',').map(w => w.trim()).filter(w => w.length > 0)
          : [];
        
        const allowedUsersInput = options.getString('allowed_users');
        const allowedUsers = allowedUsersInput
          ? allowedUsersInput.split(',').map(id => id.trim()).filter(id => id.length > 0)
          : [];
        
        await AutoDelete.deleteMany({ guildId: i.guild.id, channelId: channel.id });
        
        const newSettings = new AutoDelete({
          guildId: i.guild.id,
          channelId: channel.id,
          deleteDelay: delay,
          filterType,
          customMessage,
          allowedWords: allowedWords,
          exceptUsers: allowedUsers
        });
        
        await newSettings.save();
        
        let replyMsg = `-# **ما في رومات حذف تلقائي <:new_emoji:1388436095842385931> **`;
        if (allowedWords.length > 0) replyMsg += `\n-# **كلمات مستثناة: ${allowedWords.join('، ')}**`;
        if (allowedUsers.length > 0) replyMsg += `\n-# **أعضاء مسموح لهم: <@${allowedUsers.join('>, <@')}>**`;
        
        return i.reply({ content: replyMsg, ephemeral: true });
      }
      
      if (sub === 'rem') {
        const channel = options.getChannel('channel');
        await AutoDelete.deleteMany({ guildId: i.guild.id, channelId: channel.id });
        return i.reply({ content: `-# **تم حذف روم الحذف التلقائي <:new_emoji:1388436095842385931> **`, ephemeral: true });
      }
      
      if (sub === 'list') {
        const channels = await getAutoDeleteChannels(i.guild.id);
        
        if (channels.length === 0) {
          return i.reply({ content: `-# **ما في رومات حذف تلقائي <:new_emoji:1388436095842385931> **`, ephemeral: true });
        }
        
        const filterTypes = { 
          'all': 'جميع الرسائل', 
          'images': 'الصور', 
          'links': 'الروابط', 
          'files': 'الملفات' 
        };
        
        let description = '';
        
        for (const ch of channels) {
          let استثناءات = [];
          if (ch.allowedWords && ch.allowedWords.length > 0) {
            استثناءات.push(`كلمات: ${ch.allowedWords.join('، ')}`);
          }
          if (ch.exceptUsers && ch.exceptUsers.length > 0) {
            استثناءات.push(`أعضاء: <@${ch.exceptUsers.join('>, <@')}>`);
          }
          
          let استثناءاتنص = استثناءات.length > 0 ? استثناءات.join(' و ') : 'لا يوجد';
          
          description += `-# ** روم <#${ch.channelId}> و سيحذف ${filterTypes[ch.filterType] || ch.filterType} ما عدا ${استثناءاتنص} في مدة ${ch.deleteDelay} ثانية <:new_emoji:1388436089584226387> **\n\n`;
        }
        
        const embed = new EmbedBuilder()
          .setTitle('رومات الحذف التلقائي')
          .setDescription(description)
          .setColor(0x2b2d31);
        
        await i.deferReply({ ephemeral: true });
        await i.channel.send({ embeds: [embed] });
        await i.deleteReply();
      }
    }
  }

  // ==================== معالج الأزرار ====================
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
      const gameKey = `${i.guild.id}-${i.message.id}`;
      const game = activeNumberGames.get(gameKey);
      
      if (!game || game.started) {
        return i.reply({ content: `-# **اللعبة فشلت <:new_emoji:1388436095842385931> **`, ephemeral: true }).catch(() => { });
      }
      
      if (game.players.length >= 6) {
        return i.reply({ content: `-# **اللعبة ممتلئة <:emoji_84:1389404919672340592> **`, ephemeral: true }).catch(() => { });
      }
      
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
      const giveaway = await Giveaway.findOne({ messageId: i.message.id, ended: false });
      
      if (!giveaway) {
        return i.reply({ content: '❌ هذا القيف أوي انتهى أو غير موجود', ephemeral: true });
      }
      
      if (giveaway.participants.includes(i.user.id)) {
        return i.reply({ content: `-# **انت داخل القيف اصلا <:__:1467633552408576192> **`, ephemeral: true });
      }
      
      giveaway.participants.push(i.user.id);
      await giveaway.save();
      
      await i.reply({ content: `-# **تم دخولك فالسحب <:2thumbup:1467287897429512396> **`, ephemeral: true });
    }
  }
});

// ==================== 🚫 عند إضافة البوت لسيرفر جديد ====================
client.on('guildCreate', async (guild) => {
  const globalSettings = await getGlobalSettings();
  const subscription = globalSettings.subscriptions.find(s => s.guildId === guild.id);
  
  if (!subscription || subscription.status !== 'active') {
    try {
      const owner = await client.users.fetch(guild.ownerId);
      
      const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(
          "-# **هذا البوت خاص و لن يعمل في خادمك الا اذا تواصلت مع سيرفر المطور لكي يسمح لك مجانا او لا <:emoji_41:1471619709936996406> **\n\n" +
          "-# **البوت سوف يخرج نفسه من السيرفر في غضون ساعة <:emoji_32:1471962578895769611> **"
        );
      
      await owner.send({ embeds: [embed] });
      
    } catch (error) {
      const channel = guild.channels.cache.find(ch => 
        ch.type === ChannelType.GuildText && 
        ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)
      );

      if (channel) {
        const embed = new EmbedBuilder()
          .setColor(0x2b2d31)
          .setDescription(
            "-# **هذا البوت خاص و لن يعمل في خادمك الا اذا تواصلت مع سيرفر المطور لكي يسمح لك مجانا او لا <:emoji_41:1471619709936996406> **\n\n" +
            "-# **البوت سوف يخرج نفسه من السيرفر في غضون ساعة <:emoji_32:1471962578895769611> **"
          );
        
        await channel.send({ embeds: [embed] });
      }
    }
    
    setTimeout(() => guild.leave(), 3600000);
  }
});

// ==================== 👋 عند دخول عضو جديد ====================
client.on('guildMemberAdd', async (member) => {
  const globalSettings = await getGlobalSettings();
  if (!globalSettings.allowedGuilds.includes(member.guild.id)) return;
  const settings = await getSettings(member.guild.id);
  await sendWelcome(member, settings);
});

// ==================== 🚀 تشغيل السيرفر ====================
app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));