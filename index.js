// ==================== 🤖 البوت المتكامل - النسخة المدمجة 🤖 ====================
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
    status: { type: String, default: 'active' } // active, expired, pending_delete
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

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);
const GlobalSettings = mongoose.model('GlobalSettings', GlobalSettingsSchema);
const TicketSettings = mongoose.model('TicketSettings', TicketSettingsSchema);
const AutoDelete = mongoose.model('AutoDeleteChannel', AutoDeleteChannelSchema);
const Giveaway = mongoose.model('Giveaway', GiveawaySchema);

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
  { name: 'help', description: 'عرض جميع الأوامر' },
  { name: 'bal', description: 'عرض الرصيد' },
  {
    name: 'pay',
    description: 'تحويل أموال',
    options: [
      { name: 'user', description: 'المستلم', type: 6, required: true },
      { name: 'amount', description: 'المبلغ', type: 4, required: true }
    ]
  },
  { name: 'top', description: 'قائمة الأغنياء' },
  { name: 'hist', description: 'سجل المعاملات' },
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
    name: 'num',
    description: 'لعبة الأرقام',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      { name: 'start', description: 'بدء لعبة', type: 1 },
      { name: 'stop', description: 'إيقاف اللعبة', type: 1 }
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
              { name: 'كلمات محددة', value: 'words' },
              { name: 'صور', value: 'images' },
              { name: 'روابط', value: 'links' },
              { name: 'ملفات', value: 'files' }
            ]
          },
          { name: 'message', description: 'رسالة مخصصة', type: 3, required: false }
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
        description: 'عرض الإعدادات',
        type: 1
      }
    ]
  }
];

const allCommands = [...slashCommands, ...ownerCommands];

// ==================== 💸 المتغيرات العامة ====================
const pendingTransfers = new Map(); // المفتاح: guildId-msgId
const transferCooldowns = new Map(); // المفتاح: userId
const activeNumberGames = new Map(); // المفتاح: guildId-msgId

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
      await message.edit({ content: '❌ انتهى القيف أوي بدون مشاركين.', embeds: [], components: [] }).catch(() => { });
    } else {
      const winners = [];
      const participantsCopy = [...participants];
      
      for (let i = 0; i < Math.min(giveaway.winners, participantsCopy.length); i++) {
        const winnerIdx = Math.floor(Math.random() * participantsCopy.length);
        winners.push(`<@${participantsCopy.splice(winnerIdx, 1)[0]}>`);
      }
      
      const embed = EmbedBuilder.from(message.embeds[0])
        .setDescription(`-# **انتهى السحب على ${giveaway.prize}**\n-# **الفائزين هم** ${winners.join(', ')}`);
      
      await message.edit({ embeds: [embed], components: [] }).catch(() => { });
      await channel.send(`-# **مبروك فزتم بـ ${giveaway.prize} افتحوا تكت عشان تستلموها <:emoji_33:1401771703306027008> **\n-# **${winners.join(', ')}**`).catch(() => { });
    }
    
    giveaway.ended = true;
    await giveaway.save();
    
  } catch (e) {
    console.error('خطأ في إنهاء القيف:', e);
  }
}

// ==================== 🤖 Client Ready ====================
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} أونلاين!`);
  
  // تسجيل الأوامر
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: allCommands });
    console.log('✅ تم تسجيل جميع الأوامر بنجاح!');
  } catch (e) { console.error(e); }

  // استعادة القيف أوي من قاعدة البيانات
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

  // التحقق من الاشتراكات المنتهية كل ساعة
  cron.schedule('0 * * * *', async () => {
    const settings = await getGlobalSettings();
    const now = new Date();
    
    for (const sub of settings.subscriptions) {
      if (sub.status === 'active' && sub.expiresAt < now) {
        sub.status = 'expired';
        await settings.save();
        
        try {
          const guild = await client.guilds.fetch(sub.guildId).catch(() => null);
          if (guild) {
            const owner = await client.users.fetch(guild.ownerId).catch(() => null);
            if (owner) {
              await owner.send(`-# **انتهى اشتراككم في خدمتنا يرجى مراجعة الخادم الأم لتجديد الاشتراك <:new_emoji:1388436095842385931> **`);
            }
            
            const channel = guild.channels.cache.find(ch => ch.type === ChannelType.GuildText && ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages));
            if (channel) {
              await channel.send(`-# **انتهى اشتراككم في خدمتنا يرجى مراجعة الخادم الأم لتجديد الاشتراك <:new_emoji:1388436095842385931> **`);
            }
            
            await guild.leave();
            console.log(`🚫 غادرت سيرفر منتهي الاشتراك: ${guild.name}`);
          }
        } catch (e) { console.error(e); }
      }
      
      if (sub.status === 'expired' && sub.expiresAt) {
        const deleteDate = new Date(sub.expiresAt);
        deleteDate.setDate(deleteDate.getDate() + 10);
        if (now > deleteDate) {
          settings.subscriptions = settings.subscriptions.filter(s => s.guildId !== sub.guildId);
          await settings.save();
          console.log(`🗑️ تم حذف السيرفر ${sub.guildId} نهائياً بعد 10 أيام من انتهاء الاشتراك`);
        }
      }
    }
  });

  // التحقق من السيرفرات المنتهية قبل 24 ساعة
  cron.schedule('0 */6 * * *', async () => {
    const settings = await getGlobalSettings();
    const now = new Date();
    
    for (const sub of settings.subscriptions) {
      if (sub.status === 'active' && sub.expiresAt) {
        const timeLeft = sub.expiresAt.getTime() - now.getTime();
        const hoursLeft = timeLeft / (1000 * 60 * 60);
        
        if (hoursLeft <= 24 && hoursLeft > 23) {
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
          } catch (e) { console.error(e); }
        }
      }
    }
  });

  // الزكاة الأسبوعية (كل جمعة)
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
  if (!globalSettings.allowedGuilds.includes(message.guild.id)) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0];

  // 1️⃣ تأكيد التحويل
  const pending = Array.from(pendingTransfers.entries()).find(([key, data]) => 
    key.startsWith(message.guild.id) && data.senderId === message.author.id && data.channelId === message.channel.id
  );

  if (message.content === 'تأكيد' && pending) {
    const [key, data] = pending;
    const sender = await getUserData(data.senderId);
    const target = await getUserData(data.targetId);
    
    if (sender.balance < data.totalAmount) {
      pendingTransfers.delete(key);
      return message.channel.send(`-# **رصيدك ما يكفي الحين يا فقير <:emoji_464:1388211597197050029>**`);
    }
    
    sender.balance = parseFloat((sender.balance - data.totalAmount).toFixed(2));
    target.balance = parseFloat((target.balance + data.amount).toFixed(2));
    
    sender.history.push({ 
      type: 'TRANSFER_SEND', 
      amount: -data.amount,
      targetUser: data.targetId,
      targetName: target.username || 'مستخدم',
      date: new Date()
    });
    
    target.history.push({ 
      type: 'TRANSFER_RECEIVE', 
      amount: data.amount,
      targetUser: data.senderId,
      targetName: sender.username || 'مستخدم',
      date: new Date()
    });
    
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

  // 2️⃣ أوامر المالك النصية
  if (command === 'زد' && message.author.id === OWNER_ID) {
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) {
      return message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
    }
    
    const ownerData = await getUserData(message.author.id);
    ownerData.balance = parseFloat((ownerData.balance + amount).toFixed(2));
    ownerData.history.push({ type: 'OWNER_ADD', amount: amount, date: new Date() });
    await ownerData.save();
    return message.channel.send(`-# **تم اضافة الرصيد لحسابك <:emoji_41:1471619709936996406> **`);
  }

  if (command === 'انقص' && message.author.id === OWNER_ID) {
    const amount = parseFloat(args[1]);
    if (isNaN(amount) || amount <= 0) {
      return message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
    }
    
    const ownerData = await getUserData(message.author.id);
    if (ownerData.balance < amount) {
      return message.channel.send(`-# **العضو ما معه ذي الكمية saybu <:emoji_84:1389404919672340592> **`);
    }
    
    ownerData.balance = parseFloat((ownerData.balance - amount).toFixed(2));
    ownerData.history.push({ type: 'OWNER_REMOVE', amount: -amount, date: new Date() });
    await ownerData.save();
    return message.channel.send(`-# **تم سحب الرصيد من حسابك <:emoji_41:1471619709936996406> **`);
  }

  // 3️⃣ أوامر الاقتصاد النصية
  if (command === 'دنانير') {
    const user = message.mentions.users.first() || message.author;
    const userData = await getUserData(user.id);
    const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
    
    message.channel.send(`-# **رصيدك الحالي ${userData.balance} و اخر عملية تحويل تلقيتها بـ ${lastIn.amount} <:emoji_41:1471619709936996406> **`);
    return;
  }

  if (command === 'تحويل') {
    const target = message.mentions.users.first();
    const amount = parseFloat(args.find(a => !isNaN(a) && a.includes('.') ? parseFloat(a) : parseInt(a)));
    
    if (!target || isNaN(amount) || amount <= 0) {
      return message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    }
    
    const senderData = await getUserData(message.author.id);
    const tax = calculateTax(senderData.balance, amount);
    const totalAmount = amount + tax;
    
    if (senderData.balance < totalAmount) {
      return message.channel.send(`-# **رصيدك ما يكفي يا فقير (تحتاج ${totalAmount} دينار مع الضريبة) <:emoji_464:1388211597197050029>**`);
    }
    
    if (target.id === message.author.id) {
      return message.channel.send(`-# **ما تقدر تحول لنفسك يا اهبل <:emoji_464:1388211597197050029>**`);
    }
    
    const lastTransfer = transferCooldowns.get(message.author.id);
    if (lastTransfer && Date.now() - lastTransfer < 10000) {
      const remaining = Math.ceil((10000 - (Date.now() - lastTransfer)) / 1000);
      return message.channel.send(`-# **انتظر ${remaining} ثواني قبل التحويل مرة أخرى <:emoji_334:1388211595053760663>**`);
    }
    
    const confirmMsg = await message.channel.send({ 
      content: `-# **الضريبة ${tax.toFixed(2)} دينار <:emoji_41:1471619709936996406> اكتب "تأكيد" لو انت متأكد من عملية التحويل**\n-# **تجاهل الرسالة لو لم تكن متأكد**` 
    });
    
    const pendingKey = `${message.guild.id}-${confirmMsg.id}`;
    pendingTransfers.set(pendingKey, { 
      senderId: message.author.id, 
      targetId: target.id, 
      amount, 
      tax,
      totalAmount,
      msgId: confirmMsg.id, 
      channelId: message.channel.id 
    });
    
    setTimeout(() => { 
      if (pendingTransfers.has(pendingKey)) { 
        pendingTransfers.delete(pendingKey); 
        confirmMsg.delete().catch(() => { }); 
      } 
    }, 10000);
    
    return;
  }

  if (command === 'اغنياء') {
    const topUsers = await User.find().sort({ balance: -1 }).limit(5);
    const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx + 1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
    
    const embed = new EmbedBuilder()
      .setTitle('الطبقة الارستقراطية <:y_coroa:1404576666105417871>')
      .setDescription(topMsg)
      .setColor(0x2b2d31);
    
    message.channel.send({ embeds: [embed] });
    return;
  }

  if (command === 'سجل') {
    const user = message.mentions.users.first() || message.author;
    const userData = await getUserData(user.id);
    
    const history = userData.history
      .slice(-5)
      .reverse()
      .map(h => {
        let action = '';
        if (h.type === 'TRANSFER_SEND') action = `تحويل إلى المستخدم ${h.targetName || 'مستخدم'}`;
        else if (h.type === 'TRANSFER_RECEIVE') action = `استلام من المستخدم ${h.targetName || 'مستخدم'}`;
        else if (h.type === 'WEEKLY_TAX') action = 'زكاة أسبوعية';
        else if (h.type === 'OWNER_ADD') action = 'إضافة من المالك';
        else if (h.type === 'OWNER_REMOVE') action = 'سحب من المالك';
        else action = h.type;
        
        const date = new Date(h.date);
        return `-# **عملية ${action} بمبلغ ${Math.abs(h.amount)} في شهر ${date.getMonth() + 1} يوم ${date.getDate()} <:emoji_41:1471983856440836109>**`;
      })
      .join('\n') || 'لا يوجد سجل.';
    
    const embed = new EmbedBuilder()
      .setDescription(`**السجل الخاص بـ ${user.username} <:emoji_41:1471619709936996406>**\n\n${history}`)
      .setColor(0x2b2d31);
    
    message.channel.send({ embeds: [embed] });
    return;
  }

  if (command === 'ارقام') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    
    for (const [key, game] of activeNumberGames.entries()) {
      if (key.startsWith(message.guild.id)) {
        const msg = await message.channel.messages.fetch(key.split('-')[1]).catch(() => null);
        if (msg && !game.started) {
          return message.channel.send(`-# **في لعبة شغالة يـ عبد خلها تخلص <:emoji_38:1470920843398746215> **`);
        }
      }
    }
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join_number_game').setLabel('انضم للعبة').setStyle(ButtonStyle.Secondary)
    );
    
    const msg = await message.channel.send({ 
      content: `-# **تم بدأ لعبة التخمين مهمتكم رح تكون تخمين الرقم الصحيح من 1 الى 100 <:new_emoji:1388436089584226387> **`, 
      components: [row] 
    }).catch(() => { });
    
    const gameKey = `${message.guild.id}-${msg.id}`;
    activeNumberGames.set(gameKey, {
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
    
    startNumberGameAfterDelay(msg, activeNumberGames.get(gameKey), message.guild.id);
    return;
  }

  if (command === 'ايقاف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    
    let found = false;
    for (const [key, game] of activeNumberGames.entries()) {
      if (key.startsWith(message.guild.id)) {
        const msg = await message.channel.messages.fetch(key.split('-')[1]).catch(() => null);
        if (msg) {
          await msg.edit({ content: `-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`, components: [] }).catch(() => { });
        }
        if (game.timer) clearTimeout(game.timer);
        activeNumberGames.delete(key);
        found = true;
      }
    }
    
    if (found) {
      message.channel.send(`-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`);
    }
    return;
  }

  // 4️⃣ معالجة التخمينات
  let activeGame = null;
  let gameKey = null;
  
  for (const [key, game] of activeNumberGames.entries()) {
    if (key.startsWith(message.guild.id) && 
        game.started && 
        game.alivePlayers && 
        game.alivePlayers.includes(message.author.id) && 
        game.currentTurn === message.author.id &&
        game.canGuess?.get(message.author.id) === true) {
      activeGame = game;
      gameKey = key;
      break;
    }
  }

  if (activeGame) {
    const guess = parseInt(message.content);
    if (isNaN(guess) || guess < 1 || guess > 100) return;
    
    activeGame.canGuess.set(message.author.id, false);
    if (activeGame.timer) { clearTimeout(activeGame.timer); activeGame.timer = null; }
    
    const attempts = (activeGame.attempts.get(message.author.id) || 0) + 1;
    activeGame.attempts.set(message.author.id, attempts);
    activeGame.guesses.push({ userId: message.author.id, guess });
    
    if (guess === activeGame.secretNumber) {
      activeGame.winner = message.author.id;
      await message.channel.send(`-# ** مبروك جابها صح ${message.author} الرقم كان ${activeGame.secretNumber} <:emoji_33:1401771703306027008> **`).catch(() => { });
      activeNumberGames.delete(gameKey);
    } else {
      const hint = guess > activeGame.secretNumber ? 'أصغر' : 'أكبر';
      await message.channel.send(`-# ** خطأ الرقم ${hint} من ${guess} <:emoji_11:1467287898448724039> **`).catch(() => { });
      
      activeGame.currentTurnIndex++;
      activeGame.currentTurn = null;
      setTimeout(() => { startNextTurn(message.channel, gameKey.split('-')[1], message.guild.id); }, 3000);
    }
    return;
  }

  // 5️⃣ الحذف التلقائي
  const autoDeleteChannels = await getAutoDeleteChannels(message.guild.id);
  const autoDelete = autoDeleteChannels.find(ch => ch.channelId === message.channel.id);
  
  if (autoDelete) {
    let shouldDelete = false;
    if (autoDelete.filterType === 'all') shouldDelete = true;
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

// ==================== 🛠️ معالج التفاعلات (Slash Commands & Buttons) ====================
client.on('interactionCreate', async (i) => {
  if (i.isChatInputCommand()) {
    const { commandName, options, member, user } = i;
    const userData = await getUserData(user.id);

    if (commandName === 'help') {
      const embed = new EmbedBuilder()
        .setTitle('قائمة الأوامر 🤖')
        .setDescription(
          `**أوامر الاقتصاد:**\n` +
          `- \`/bal\`: عرض رصيدك\n` +
          `- \`/pay\`: تحويل أموال\n` +
          `- \`/top\`: قائمة الأغنياء\n` +
          `- \`/hist\`: سجل المعاملات\n\n` +
          `**أوامر الإدارة:**\n` +
          `- \`/wel\`: نظام الترحيب\n` +
          `- \`/tic\`: نظام التذاكر\n` +
          `- \`/num\`: لعبة الأرقام\n` +
          `- \`/give\`: نظام القيف أوي`
        )
        .setColor(0x2b2d31);
      return i.reply({ embeds: [embed] });
    }

    if (commandName === 'bal') {
      const target = options.getUser('user') || user;
      const data = await getUserData(target.id);
      const lastIn = data.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
      return i.reply({ content: `-# **رصيد <@${target.id}> الحالي ${data.balance} و اخر عملية تحويل تلقاها بـ ${lastIn.amount} <:emoji_41:1471619709936996406> **` });
    }

    if (commandName === 'pay') {
      const target = options.getUser('user');
      const amount = options.getInteger('amount');
      
      if (target.id === user.id) return i.reply({ content: 'ما تقدر تحول لنفسك يا اهبل', ephemeral: true });
      
      const tax = calculateTax(userData.balance, amount);
      const totalAmount = amount + tax;
      
      if (userData.balance < totalAmount) {
        return i.reply({ content: `رصيدك ما يكفي (تحتاج ${totalAmount} مع الضريبة)`, ephemeral: true });
      }
      
      const lastTransfer = transferCooldowns.get(user.id);
      if (lastTransfer && Date.now() - lastTransfer < 10000) {
        return i.reply({ content: 'انتظر قليلاً قبل التحويل مرة أخرى', ephemeral: true });
      }
      
      await i.reply({ 
        content: `-# **الضريبة ${tax.toFixed(2)} دينار <:emoji_41:1471619709936996406> اكتب "تأكيد" لو انت متأكد من عملية التحويل**`,
        ephemeral: false
      });
      
      const msg = await i.fetchReply();
      pendingTransfers.set(`${i.guild.id}-${msg.id}`, {
        senderId: user.id,
        targetId: target.id,
        amount,
        tax,
        totalAmount,
        msgId: msg.id,
        channelId: i.channel.id
      });
      
      setTimeout(() => {
        if (pendingTransfers.has(`${i.guild.id}-${msg.id}`)) {
          pendingTransfers.delete(`${i.guild.id}-${msg.id}`);
          msg.delete().catch(() => { });
        }
      }, 10000);
    }

    if (commandName === 'top') {
      const topUsers = await User.find().sort({ balance: -1 }).limit(5);
      const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx + 1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
      
      const embed = new EmbedBuilder()
        .setTitle('الطبقة الارستقراطية <:y_coroa:1404576666105417871>')
        .setDescription(topMsg)
        .setColor(0x2b2d31);
      
      return i.reply({ embeds: [embed] });
    }

    if (commandName === 'hist') {
      const history = userData.history
        .slice(-5)
        .reverse()
        .map(h => {
          let action = '';
          if (h.type === 'TRANSFER_SEND') action = `تحويل إلى المستخدم ${h.targetName || 'مستخدم'}`;
          else if (h.type === 'TRANSFER_RECEIVE') action = `استلام من المستخدم ${h.targetName || 'مستخدم'}`;
          else if (h.type === 'WEEKLY_TAX') action = 'زكاة أسبوعية';
          else if (h.type === 'OWNER_ADD') action = 'إضافة من المالك';
          else if (h.type === 'OWNER_REMOVE') action = 'سحب من المالك';
          else action = h.type;
          
          const date = new Date(h.date);
          return `-# **عملية ${action} بمبلغ ${Math.abs(h.amount)} في شهر ${date.getMonth() + 1} يوم ${date.getDate()} <:emoji_41:1471983856440836109>**`;
        })
        .join('\n') || 'لا يوجد سجل.';
      
      const embed = new EmbedBuilder()
        .setDescription(`**السجل الخاص بـ ${user.username} <:emoji_41:1471619709936996406>**\n\n${history}`)
        .setColor(0x2b2d31);
      
      return i.reply({ embeds: [embed] });
    }

    // أوامر الترحيب
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

    // أوامر التذاكر
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

    // أوامر الأرقام
    if (commandName === 'num') {
      const sub = options.getSubcommand();
      
      if (sub === 'start') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return i.reply({ content: '❌ هذا الأمر للأدمن فقط', ephemeral: true });
        }
        
        for (const [key, game] of activeNumberGames.entries()) {
          if (key.startsWith(i.guild.id)) {
            const msg = await i.channel.messages.fetch(key.split('-')[1]).catch(() => null);
            if (msg && !game.started) {
              return i.reply({ content: `-# **في لعبة شغالة يـ عبد خلها تخلص <:emoji_38:1470920843398746215> **`, ephemeral: true });
            }
          }
        }
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('join_number_game').setLabel('انضم للعبة').setStyle(ButtonStyle.Secondary)
        );
        
        await i.reply({ 
          content: `-# **تم بدأ لعبة التخمين مهمتكم رح تكون تخمين الرقم الصحيح من 1 الى 100 <:new_emoji:1388436089584226387> **`, 
          components: [row] 
        });
        
        const msg = await i.fetchReply();
        const gameKey = `${i.guild.id}-${msg.id}`;
        
        activeNumberGames.set(gameKey, {
          hostId: i.user.id,
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
        
        startNumberGameAfterDelay(msg, activeNumberGames.get(gameKey), i.guild.id);
      }
      
      if (sub === 'stop') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
        
        let found = false;
        for (const [key, game] of activeNumberGames.entries()) {
          if (key.startsWith(i.guild.id)) {
            const msg = await i.channel.messages.fetch(key.split('-')[1]).catch(() => null);
            if (msg) {
              await msg.edit({ content: `-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`, components: [] }).catch(() => { });
            }
            if (game.timer) clearTimeout(game.timer);
            activeNumberGames.delete(key);
            found = true;
          }
        }
        
        if (found) {
          return i.reply({ content: `-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`, ephemeral: true });
        }
      }
    }

    // أوامر القيف أوي
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

    // أوامر المالك
    if (commandName === 'sub' && i.user.id === OWNER_ID) {
      const sub = options.getSubcommand();
      const settings = await getGlobalSettings();
      
      if (sub === 'add') {
        const serverId = options.getString('id');
        const duration = options.getString('duration');
        
        let guild;
        try { guild = await client.guilds.fetch(serverId); } catch (e) {
          return i.reply({ content: `-# ** البوت غير متواجد في هذا السيرفر تأكد من الـID <:2thumbup:1467287897429512396> **`, ephemeral: true });
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
        settings.subscriptions.push({ guildId: serverId, guildName: guild.name, ownerId: guild.ownerId, duration: durationText, expiresAt, status: 'active' });
        if (!settings.allowedGuilds.includes(serverId)) settings.allowedGuilds.push(serverId);
        await settings.save();
        
        try {
          const owner = await client.users.fetch(guild.ownerId);
          await owner.send(`-# **الخادم ${guild.name} تم تفعيل اشتراكهم و الباقة ${durationText} <:new_emoji:1388436089584226387> **`);
        } catch (e) { }
        
        return i.reply({ content: `-# ** تم اضافة البوت للسيرفر بنجاح <:2thumbup:1467287897429512396> **`, ephemeral: true });
      }
      
      if (sub === 'remove') {
        const serverId = options.getString('id');
        const subscription = settings.subscriptions.find(s => s.guildId === serverId);
        if (!subscription) return i.reply({ content: `-# ** البوت غير متواجد في هذا السيرفر تأكد من الـID <:2thumbup:1467287897429512396> **`, ephemeral: true });
        
        settings.subscriptions = settings.subscriptions.filter(s => s.guildId !== serverId);
        settings.allowedGuilds = settings.allowedGuilds.filter(id => id !== serverId);
        await settings.save();
        
        try { const guild = await client.guilds.fetch(serverId); await guild.leave(); } catch (e) { }
        return i.reply({ content: `-# ** تم حذف البوت من السيرفر بنجاح <:emoji_464:1388211597197050029> **`, ephemeral: true });
      }
    }

    if (commandName === 'hosting' && i.user.id === OWNER_ID) {
      const settings = await getGlobalSettings();
      if (settings.subscriptions.length === 0) return i.reply({ content: '⚠️ لا يوجد سيرفرات مشتركة', ephemeral: true });
      
      let activeMsg = '';
      let expiredMsg = '';
      for (const sub of settings.subscriptions) {
        const line = `-# **الخادم ${sub.guildName} تم تفعيل اشتراكهم و الباقة ${sub.duration} <:new_emoji:1388436089584226387> **\n`;
        if (sub.status === 'active') activeMsg += line;
        else expiredMsg += `-# **الخادم ${sub.guildName} منتهي اشتراكهم <:new_emoji:1388436095842385931> **\n`;
      }
      
      const embed = new EmbedBuilder().setDescription(`**الخوادم المشتركة <:emoji_41:1471983856440836109>**\n\n${activeMsg}\n${expiredMsg}`).setColor(0x2b2d31);
      return i.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'auto' && i.user.id === OWNER_ID) {
      const sub = options.getSubcommand();
      if (sub === 'add') {
        const channel = options.getChannel('channel');
        const delay = options.getInteger('delay') ?? 0;
        const filterType = options.getString('type') ?? 'all';
        const customMessage = options.getString('message') || null;
        
        await AutoDelete.deleteMany({ guildId: i.guild.id, channelId: channel.id });
        const newSettings = new AutoDelete({ guildId: i.guild.id, channelId: channel.id, deleteDelay: delay, filterType, customMessage });
        await newSettings.save();
        return i.reply({ content: `-# ** تم تعيين هذا الروم للحذف التلقائي <:new_emoji:1388436089584226387> **`, ephemeral: true });
      }
      
      if (sub === 'rem') {
        const channel = options.getChannel('channel');
        await AutoDelete.deleteMany({ guildId: i.guild.id, channelId: channel.id });
        return i.reply({ content: `-# ** تم حذف هذا الروم من الحذف التلقائي <:new_emoji:1388436095842385931> **`, ephemeral: true });
      }
      
      if (sub === 'list') {
        const channels = await getAutoDeleteChannels(i.guild.id);
        if (channels.length === 0) return i.reply({ content: '⚠️ لا يوجد رومات مفعلة للحذف التلقائي', ephemeral: true });
        
        let message = `**رومات الحذف التلقائي <:new_emoji:1388436089584226387> **\n\n`;
        const filterTypes = { 'all': 'جميع الرسائل', 'words': 'كلمات محددة', 'images': 'الصور', 'links': 'الروابط', 'files': 'الملفات' };
        for (const ch of channels) {
          const delayText = ch.deleteDelay === 0 ? 'فوري' : `${ch.deleteDelay} ثانية`;
          message += `-# **الروم <#${ch.channelId}>**\n-# **الرسائل تنحذف ${delayText}**\n-# **النوع: ${filterTypes[ch.filterType] || ch.filterType}**\n`;
          if (ch.customMessage) message += `-# **الرسالة: ${ch.customMessage}**\n`;
          message += `\n`;
        }
        return i.reply({ content: message, ephemeral: true });
      }
    }
  }

  // تفاعلات الأزرار
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
      if (ticketSettings.supportRoleId) ticketMessage = `<@&${ticketSettings.supportRoleId}> ` + ticketMessage;
      ticketMessage += `\n-# ** اكتب سبب فتحك للتكت و فريق الدعم بيتواصل معك قريب <:emoji_32:1471962578895769611> **`;
      
      await ch.send({
        content: ticketMessage,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger))]
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
      if (!game || game.started) return i.reply({ content: `-# **اللعبة فشلت عشان مافي عدد كافي دخلها <:new_emoji:1388436095842385931> **`, ephemeral: true }).catch(() => { });
      if (game.players.length >= 6) return i.reply({ content: `-# **اللعبة ممتلئة للأسف ليش ما جيت بسرعه <:emoji_84:1389404919672340592> **`, ephemeral: true }).catch(() => { });
      if (game.players.includes(i.user.id)) return i.reply({ content: `-# **انت داخل اللعبة اصلا <:__:1467633552408576192> **`, ephemeral: true }).catch(() => { });
      
      game.players.push(i.user.id);
      game.attempts.set(i.user.id, 0);
      if (!game.canGuess) game.canGuess = new Map();
      game.canGuess.set(i.user.id, false);
      await i.reply({ content: `-# **تم انت الحين مشارك فاللعبة <:2thumbup:1467287897429512396> **`, ephemeral: true }).catch(() => { });
    }

    if (i.customId === 'join_giveaway') {
      const giveaway = await Giveaway.findOne({ messageId: i.message.id, ended: false });
      if (!giveaway) return i.reply({ content: '❌ هذا القيف أوي انتهى أو غير موجود', ephemeral: true });
      if (giveaway.participants.includes(i.user.id)) return i.reply({ content: `-# **انت داخل القيف اصلا <:__:1467633552408576192> **`, ephemeral: true });
      
      giveaway.participants.push(i.user.id);
      await giveaway.save();
      await i.reply({ content: `-# **تم دخولك فالسحب يا رب تفوز <:2thumbup:1467287897429512396> **`, ephemeral: true });
    }
  }
});

// ==================== 🚫 نظام منع الاستخدام غير المصرح به ====================
client.on('guildCreate', async (guild) => {
  const globalSettings = await getGlobalSettings();
  const subscription = globalSettings.subscriptions.find(s => s.guildId === guild.id);
  
  if (!subscription || subscription.status !== 'active') {
    const channel = guild.channels.cache.filter(ch => ch.type === ChannelType.GuildText && ch.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages)).first();
    if (channel) {
      const embed = new EmbedBuilder().setColor(0xff0000).setDescription("-# **هذا البوت خاص و لن يعمل في خادمك الا اذا تواصلت مع سيرفر المطور لكي يسمح لك مجانا او لا <:emoji_41:1471619709936996406> **\n\n-# **البوت سوف يخرج نفسه من السيرفر في غضون ١٠ ثوان <:emoji_32:1471962578895769611> **").setFooter({ text: "سيتم المغادرة تلقائياً..." });
      await channel.send({ embeds: [embed] });
    }
    await new Promise(resolve => setTimeout(resolve, 10000));
    await guild.leave();
  }
});

client.on('guildMemberAdd', async (member) => {
  const globalSettings = await getGlobalSettings();
  if (!globalSettings.allowedGuilds.includes(member.guild.id)) return;
  const settings = await getSettings(member.guild.id);
  await sendWelcome(member, settings);
});

// ==================== 🚀 تشغيل البوت ====================
app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));
