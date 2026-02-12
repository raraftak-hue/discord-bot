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
  history: [{ type: { type: String }, amount: Number, date: { type: Date, default: Date.now } }]
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
  embedTitle: { type: String, default: 'نظام التذاكر' },
  embedDescription: { type: String, default: 'اضغط على الزر لفتح تذكرة جديدة.' },
  embedColor: { type: String, default: '2b2d31' },
  embedImage: { type: String, default: null }
});

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

// ==================== 📋 أوامر السلاش ====================
const slashCommands = [
  { name: 'bothelp', description: 'عرض جميع الأوامر' },
  { 
    name: 'economy', 
    description: 'النظام المالي', 
    options: [
      { name: 'balance', description: 'عرض الرصيد', type: 1 },
      { name: 'transfer', description: 'تحويل الأموال', type: 1, options: [{ name: 'user', description: 'المستلم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] },
      { name: 'top', description: 'قائمة الأغنياء', type: 1 }
    ] 
  },
  {
    name: 'owner',
    description: 'أوامر المالك فقط',
    default_member_permissions: "0",
    options: [
      {
        name: 'guilds',
        description: 'إدارة السيرفرات المخولة',
        type: 1,
        options: [
          { name: 'action', description: 'اضافة أو حذف', type: 3, required: true, choices: [{ name: 'اضافة', value: 'add' }, { name: 'حذف', value: 'remove' }] },
          { name: 'id', description: 'ايدي السيرفر', type: 3, required: true }
        ]
      }
    ]
  },
  {
    name: 'resetall',
    description: 'إعادة تعيين رصيد الجميع إلى 5 دنانير',
    default_member_permissions: "0"
  },
  {
    name: 'numbers',
    description: 'لعبة الأرقام',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
  }
];

const adminSlashCommands = [
  { 
    name: 'ticket', 
    description: 'إدارة نظام التذاكر', 
    options: [
      { name: 'panel', description: 'عرض لوحة التذاكر', type: 1 },
      { 
        name: 'setup', 
        description: 'تعديل إعدادات التذاكر', 
        type: 1,
        options: [
          { name: 'category', description: 'تعيين الكاتيجوري', type: 7, required: false, channel_types: [4] },
          { name: 'title', description: 'عنوان الإيمبيد', type: 3, required: false },
          { name: 'description', description: 'وصف الإيمبيد', type: 3, required: false },
          { name: 'color', description: 'لون الإيمبيد (كود هيكس)', type: 3, required: false },
          { name: 'image', description: 'رابط صورة الإيمبيد', type: 3, required: false }
        ]
      }
    ],
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
  }, 
  { 
    name: 'welcome', 
    description: 'إدارة نظام الترحيب', 
    options: [
      { name: 'set', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }] },
      { name: 'edit', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'description', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'رابط الصورة', type: 3 }] },
      { name: 'info', description: 'عرض إعدادات الترحيب', type: 1 },
      { name: 'test', description: 'تجربة رسالة الترحيب', type: 1 }
    ],
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
  },
  {
    name: 'giveaway',
    description: 'نظام القيف أوي',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      { name: 'start', description: 'بدء قيف أوي جديد', type: 1, options: [
        { name: 'prize', description: 'الجائزة', type: 3, required: true },
        { name: 'duration', description: 'المدة (مثال: 10m, 1h, 1d)', type: 3, required: true },
        { name: 'winners', description: 'عدد الفائزين', type: 4, required: true },
        { name: 'condition', description: 'الشروط', type: 3, required: false },
        { name: 'image', description: 'رابط الصورة', type: 3, required: false }
      ]}
    ]
  }
];

// ==================== 🤖 Client Ready ====================
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} أونلاين!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const globalSettings = await getGlobalSettings();
  
  try { 
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands }); 
    console.log('✅ تم تسجيل أوامر السلاش العامة بنجاح!');
    
    for (const guildId of globalSettings.allowedGuilds) {
      try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: adminSlashCommands });
        console.log(`✅ تم تسجيل أوامر الأدمن للسيرفر ${guildId}`);
      } catch (e) { console.error(`❌ فشل تسجيل الأوامر للسيرفر ${guildId}:`, e.message); }
    }
  } catch (e) { console.error(e); }
  
  // ==================== 💰 نظام الزكاة الأسبوعي ====================
  cron.schedule('0 0 * * 5', async () => {
    console.log("⏰ بدأ تحصيل الزكاة الأسبوعية...");
    
    const users = await User.find({ balance: { $gt: 50 } });
    let totalTax = 0;
    
    for (const user of users) {
      const oldBalance = user.balance;
      const taxAmount = (oldBalance * 0.025).toFixed(2);
      const tax = parseFloat(taxAmount);
      
      user.balance = parseFloat((oldBalance - tax).toFixed(2));
      user.history.push({ type: 'WEEKLY_TAX', amount: -tax });
      await user.save();
      
      totalTax += tax;
      
      const discordUser = await client.users.fetch(user.userId).catch(() => null);
      if (discordUser) {
        await discordUser.send(`-# ** تم جمع الزكاة الاسبوعية التي تقدر بـ 2.5% على الثروة التي تبلغ فوق الـ50 دينار <:florktahehe:1458398337874268307> **`).catch(() => {});
      }
    }
    
    console.log(`✅ تم خصم الزكاة من ${users.length} عضو بمجموع ${totalTax.toFixed(2)} دينار`);
  });
});

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

  channel.send({ embeds: [embed] }).catch(() => {});
}

client.on('guildMemberAdd', async (member) => {
  const globalSettings = await getGlobalSettings();
  if (!globalSettings.allowedGuilds.includes(member.guild.id)) return;
  const settings = await getSettings(member.guild.id);
  await sendWelcome(member, settings);
});

// ==================== 💸 نظام التحويل ====================
const pendingTransfers = new Map();
const transferCooldowns = new Map();

// ==================== 🎮 لعبة الأرقام ====================
const activeNumberGames = new Map();

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

async function startNumberGameAfterDelay(msg, gameData) {
  setTimeout(async () => {
    const game = activeNumberGames.get(msg.id);
    if (!game) return;
    
    if (game.players.length === 0) {
      await msg.edit({ 
        content: `-# **اللعبة فشلت عشان مافي عدد كافي دخلها <:new_emoji:1388436095842385931> **`,
        components: [] 
      }).catch(() => {});
      activeNumberGames.delete(msg.id);
      return;
    }
    
    game.started = true;
    game.secretNumber = Math.floor(Math.random() * 100) + 1;
    
    const playersList = game.players.map(p => getUserTag(p)).join(' ');
    await msg.channel.send(
      `-# ** تم بدأ اللعبة كل واحد من المشاركين عنده جولة يخمن فيها الرقم و كل مشارك له 3 محاولات الا اذا فاز احد فيكم <:new_emoji:1388436089584226387> **\n` +
      `-# المشاركين هم ${playersList}`
    ).catch(() => {});
    
    setTimeout(async () => {
      await msg.delete().catch(() => {});
    }, 10000);
    
    setTimeout(() => {
      startNextTurn(msg.channel, msg.id);
    }, 10000);
    
  }, 20000);
}

async function startNextTurn(channel, gameId) {
  const game = activeNumberGames.get(gameId);
  if (!game || !game.started || game.winner) return;
  
  game.alivePlayers = game.players.filter(p => {
    const attempts = game.attempts.get(p) || 0;
    return attempts < 3;
  });
  
  if (game.alivePlayers.length === 0) {
    const guesses = game.guesses || [];
    const closest = findClosestGuess(guesses, game.secretNumber);
    
    if (game.players.length === 1) {
      await channel.send(
        `-# ** نفذت خلصت محاولاتك و الرقم الصح كان ${game.secretNumber} <:emoji_11:1467287898448724039> **`
      ).catch(() => {});
    } else {
      const closestUser = closest ? getUserTag(closest.userId) : 'لا يوجد';
      await channel.send(
        `-# ** الرقم الصح كان ${game.secretNumber} محد جابها صح و نفذت كل محاولات كل المشتركين بس اقرب واحد جاب تخمين هو ${closestUser} <:emoji_11:1467287898448724039> **`
      ).catch(() => {});
    }
    
    activeNumberGames.delete(gameId);
    return;
  }
  
  if (game.currentTurnIndex >= game.alivePlayers.length) {
    game.currentTurnIndex = 0;
  }
  
  const currentPlayer = game.alivePlayers[game.currentTurnIndex];
  game.currentTurn = currentPlayer;
  
  await channel.send(
    `-# **دور المشارك ${getUserTag(currentPlayer)} للتخمين **`
  ).catch(() => {});
  
  const timer = setTimeout(async () => {
    const game = activeNumberGames.get(gameId);
    if (!game || !game.started || game.winner) return;
    if (game.currentTurn === currentPlayer) {
      
      await channel.send(
        `-# **المشارك ${getUserTag(currentPlayer)} انطرد عشان ما خمن قبل انتهاء الوقت <:s7_discord:1388214117365453062> **`
      ).catch(() => {});
      
      const attempts = game.attempts.get(currentPlayer) || 0;
      game.attempts.set(currentPlayer, attempts + 3);
      
      game.currentTurnIndex++;
      
      setTimeout(() => {
        startNextTurn(channel, gameId);
      }, 5000);
    }
  }, 10000);
  
  game.timer = timer;
}

// ==================== 📝 الأوامر النصية ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const globalSettings = await getGlobalSettings();
  if (!globalSettings.allowedGuilds.includes(message.guild.id)) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0];

  const pending = Array.from(pendingTransfers.values()).find(p => p.senderId === message.author.id && p.channelId === message.channel.id);
  if (message.content === 'تأكيد' && pending) {
    const data = pending;
    const sender = await getUserData(data.senderId);
    const target = await getUserData(data.targetId);
    
    if (sender.balance < data.amount) {
      pendingTransfers.delete(data.msgId);
      return message.channel.send(`-# **رصيدك ما يكفي الحين يا فقير <:emoji_464:1388211597197050029>**`);
    }

    sender.balance = parseFloat((sender.balance - data.amount).toFixed(2));
    target.balance = parseFloat((target.balance + data.amount).toFixed(2));
    sender.history.push({ type: 'TRANSFER_SEND', amount: -data.amount });
    target.history.push({ type: 'TRANSFER_RECEIVE', amount: data.amount });
    await sender.save(); await target.save();
    transferCooldowns.set(data.senderId, Date.now()); 
    
    const confirmMsg = await message.channel.messages.fetch(data.msgId).catch(() => null);
    if (confirmMsg) {
      await confirmMsg.edit({ content: `-# **تم تحويل ${data.amount} لـ <@${data.targetId}> رصيدك الآن ${sender.balance} <a:moneywith_:1470458218953179237>**`, components: [] }).catch(() => {});
    }
    pendingTransfers.delete(data.msgId);
    try { await message.delete(); } catch (e) {}
    return;
  }

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
      message.channel.send(`-# **ما اقدر اطرده، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.channel.send(`-# **حدد عدد الرسايل الي تبي تحذفها (1-100) يا ذكي <:emoji_334:1388211595053760663>**`);
    try {
      await message.channel.bulkDelete(amount + 1);
      const msg = await message.channel.send(`-# **تم حذف ${amount} رسايل بنجاح <:2thumbup:1467287897429512396>**`);
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    } catch (error) {
      message.channel.send(`-# **ما اقدر احذف الرسايل، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'دنانير') {
    const user = message.mentions.users.first() || message.author;
    const userData = await getUserData(user.id);
    message.channel.send(`-# **رصيد ${user} هو ${userData.balance} دينار <:money_with_wings:1388212679981666334>**`);
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
    setTimeout(() => { if (pendingTransfers.has(confirmMsg.id)) { pendingTransfers.delete(confirmMsg.id); confirmMsg.delete().catch(() => {}); } }, 10000);
  }

  if (command === 'اغنياء') {
    const topUsers = await User.find().sort({ balance: -1 }).limit(5);
    const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx+1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
    const embed = new EmbedBuilder().setTitle('الطبقة الارستقراطية <:y_coroa:1404576666105417871>').setDescription(topMsg).setColor(0x2b2d31);
    message.channel.send({ embeds: [embed] });
  }

  if (command === 'السجل') {
    const user = message.mentions.users.first() || message.author;
    const userData = await getUserData(user.id);
    const history = userData.history.slice(-5).reverse().map(h => `-# **${h.type}: ${h.amount} (${h.date.toLocaleDateString()})**`).join('\n') || 'لا يوجد سجل.';
    message.channel.send({ embeds: [new EmbedBuilder().setTitle(`سجل ${user.username}`).setDescription(history).setColor(0x2b2d31)] });
  }

  if (command === 'ارقام') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return;
    }
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('join_number_game')
        .setLabel('انضم للعبة')
        .setStyle(ButtonStyle.Secondary)
    );
    
    const msg = await message.channel.send({
      content: `-# **تم بدأ لعبة التخمين مهمتكم رح تكون تخمين الرقم الصحيح من 1 الى 100 <:new_emoji:1388436089584226387> **`,
      components: [row]
    }).catch(() => {});
    
    activeNumberGames.set(msg.id, {
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
      timer: null
    });
    
    startNumberGameAfterDelay(msg, activeNumberGames.get(msg.id));
  }
});

// ==================== معالجة التخمينات ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  let activeGame = null;
  let gameId = null;
  
  for (const [id, game] of activeNumberGames.entries()) {
    if (game.started && game.alivePlayers && game.alivePlayers.includes(message.author.id) && game.currentTurn === message.author.id) {
      activeGame = game;
      gameId = id;
      break;
    }
  }
  
  if (!activeGame) return;
  
  const game = activeGame;
  const guess = parseInt(message.content);
  
  if (isNaN(guess) || guess < 1 || guess > 100) {
    return message.reply(`-# **يرجى إدخال رقم بين 1 و 100**`).catch(() => {});
  }
  
  if (game.timer) clearTimeout(game.timer);
  
  game.guesses.push({
    userId: message.author.id,
    guess: guess
  });
  
  if (guess === game.secretNumber) {
    game.winner = message.author.id;
    
    if (game.players.length === 1) {
      await message.channel.send(
        `-# **مبروك ${getUserTag(message.author.id)} جبت الرقم الصح و هو ${game.secretNumber} هذا ذكاء ولا حظ يا ترى …. <:1_81:1467286889877999843> **`
      ).catch(() => {});
    } else {
      await message.channel.send(
        `-# **مبروك المشارك ${getUserTag(message.author.id)} جاب الرقم الصح و هو ${game.secretNumber} حظا اوفر للمشاركين الآخرين فالمرات القادمة <:1_81:1467286889877999843> **`
      ).catch(() => {});
    }
    
    activeNumberGames.delete(gameId);
    return;
  }
  
  const attempts = game.attempts.get(message.author.id) || 0;
  game.attempts.set(message.author.id, attempts + 1);
  
  if (guess < game.secretNumber) {
    await message.channel.send(
      `-# **تخمين غلط من العضو ${getUserTag(message.author.id)} و الرقم أصغر من الرقم ${guess} **`
    ).catch(() => {});
  } else {
    await message.channel.send(
      `-# **تخمين غلط من العضو ${getUserTag(message.author.id)} و الرقم أكبر من الرقم ${guess} **`
    ).catch(() => {});
  }
  
  if (attempts + 1 >= 3) {
    await message.channel.send(
      `-# **المشارك ${getUserTag(message.author.id)} انطرد عشان خلصت محاولاته الثلاث <:s7_discord:1388214117365453062> **`
    ).catch(() => {});
  }
  
  game.currentTurnIndex++;
  
  setTimeout(() => {
    startNextTurn(message.channel, gameId);
  }, 5000);
});

// ==================== 🎮 تفاعلات الأزرار ====================
client.on('interactionCreate', async (i) => {
  const globalSettings = await getGlobalSettings();
  if (i.guild && !globalSettings.allowedGuilds.includes(i.guild.id)) return;

  if (i.isChatInputCommand()) {
    const { commandName, options, user, member, guild } = i;
    const userData = await getUserData(user.id);

    if (commandName === 'bothelp') {
      const embed = new EmbedBuilder()
        .setTitle('قائمة الأوامر')
        .setColor(0x2b2d31)
        .setDescription(`-# **/economy balance - عرض الرصيد**\n-# **/economy transfer - تحويل أموال**\n-# **/economy top - قائمة الأغنياء**\n-# **/welcome test - تجربة الترحيب**\n-# **/giveaway start - بدء قيف أوي**\n-# **/ticket panel - لوحة التذاكر**\n-# **/ticket setup - تعديل إعدادات التذاكر**\n-# **/numbers - لعبة الأرقام**\n-# **أوامر نصية: دنانير، تحويل، اغنياء، السجل، تايم، طرد، حذف، ارقام**`);
      return i.reply({ embeds: [embed] });
    }

    if (commandName === 'economy') {
      const sub = options.getSubcommand();
      if (sub === 'balance') {
        const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
        return i.reply({ embeds: [new EmbedBuilder().setDescription(`-# **رصيدك الحالي ${userData.balance} دينار و آخر عملية تحويل تلقيتها بـ ${lastIn.amount} <:money_with_wings:1388212679981666334>**`).setColor(0x2b2d31)] });
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
        
        const confirmMsg = await i.reply({ content: `-# **اكتب "تأكيد" لو انت متأكد من عملية التحويل  **\n-# تجاهل الرسالة لو لم تكن متاكد`, fetchReply: true });
        pendingTransfers.set(confirmMsg.id, { senderId: user.id, targetId: target.id, amount, msgId: confirmMsg.id, channelId: i.channel.id });
        setTimeout(() => { if (pendingTransfers.has(confirmMsg.id)) { pendingTransfers.delete(confirmMsg.id); i.deleteReply().catch(() => {}); } }, 10000);
      }
      if (sub === 'top') {
        const topUsers = await User.find().sort({ balance: -1 }).limit(5);
        const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx+1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
        const embed = new EmbedBuilder().setTitle('الطبقة الارستقراطية <:y_coroa:1404576666105417871>').setDescription(topMsg).setColor(0x2b2d31);
        return i.reply({ embeds: [embed] });
      }
    }

    if (commandName === 'welcome') {
      const sub = options.getSubcommand();
      const settings = await getSettings(i.guild.id);
      if (sub === 'set') { settings.welcomeSettings.channelId = options.getChannel('channel').id; await settings.save(); i.reply('✅ تم تعيين الروم.'); }
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
      if (sub === 'test') {
        await sendWelcome(member, settings);
        i.reply({ content: '✅ تم إرسال تجربة الترحيب.', ephemeral: true });
      }
    }

    if (commandName === 'giveaway') {
      const sub = options.getSubcommand();
      if (sub === 'start') {
        const prize = options.getString('prize');
        const durationStr = options.getString('duration');
        const winnersCount = options.getInteger('winners');
        const condition = options.getString('condition') || 'لا توجد شروط';
        const image = options.getString('image');
        
        const timeMatch = durationStr.match(/^(\d+)([mhd])$/);
        if (!timeMatch) return i.reply({ content: 'صيغة الوقت غلط! (مثال: 10m, 1h, 1d)', ephemeral: true });
        const timeValue = parseInt(timeMatch[1]);
        const timeUnit = timeMatch[2];
        const durationMs = timeValue * (timeUnit === 'm' ? 60 : timeUnit === 'h' ? 3600 : 86400) * 1000;
        const endTime = Math.floor((Date.now() + durationMs) / 1000);

        const embed = new EmbedBuilder()
          .setDescription(`-# **سحب عشوائي على ${prize} ينتهي في <t:${endTime}:R> <:emoji_45:1397804598110195863> **\n-# **الي سوا السحب العشوائي ${user} <:y_coroa:1404576666105417871> **\n-# **الشروط ${condition} <:new_emoji:1388436089584226387> **`)
          .setColor(0x2b2d31);
        if (image) embed.setImage(image);

        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_giveaway').setLabel('ادخل').setStyle(ButtonStyle.Secondary));
        const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });

        const participants = new Set();
        const collector = msg.createMessageComponentCollector({ time: durationMs });

        collector.on('collect', async (btn) => {
          if (btn.customId === 'join_giveaway') {
            if (participants.has(btn.user.id)) {
              const exitRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('exit_giveaway').setLabel('خروج').setStyle(ButtonStyle.Secondary));
              return btn.reply({ content: '-# **انت داخل السحب اصلا تبي تطلع ؟ <:__:1467633552408576192> **', components: [exitRow], ephemeral: true }).catch(() => {});
            }
            participants.add(btn.user.id);
            btn.reply({ content: '-# **تم دخولك فالسحب يا رب تفوز <:2thumbup:1467287897429512396> **', ephemeral: true }).catch(() => {});
          }
          if (btn.customId === 'exit_giveaway') {
            participants.delete(btn.user.id);
            btn.reply({ content: '❌ تم خروجك من السحب.', ephemeral: true }).catch(() => {});
          }
        });

        collector.on('end', async () => {
          const list = Array.from(participants);
          if (list.length === 0) return msg.edit({ content: '❌ انتهى القيف أوي بدون مشاركين.', embeds: [], components: [] }).catch(() => {});
          const winners = [];
          for (let j = 0; j < Math.min(winnersCount, list.length); j++) {
            const winnerIdx = Math.floor(Math.random() * list.length);
            winners.push(`<@${list.splice(winnerIdx, 1)[0]}>`);
          }
          const endEmbed = EmbedBuilder.from(embed).setDescription(`-# **انتهى السحب على ${prize}**\n-# **الفائزين هم** ${winners.join(', ')}`);
          await msg.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
          msg.channel.send(`-# **مبروك فزتم بـ ${prize} افتحوا تكت عشان تستلموها <:emoji_33:1401771703306027008> **\n-# **${winners.join(', ')}**`).catch(() => {});
        });
      }
    }

    if (commandName === 'ticket') {
      const sub = options.getSubcommand();
      const ticketSettings = await getTicketSettings(i.guild.id);
      
      if (sub === 'panel') {
        const embed = new EmbedBuilder()
          .setTitle(ticketSettings.embedTitle)
          .setDescription(ticketSettings.embedDescription)
          .setColor(parseInt(ticketSettings.embedColor, 16) || 0x2b2d31);
        if (ticketSettings.embedImage) embed.setImage(ticketSettings.embedImage);
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Secondary)
        );
        i.reply({ embeds: [embed], components: [row] });
      }

      if (sub === 'setup') {
        let updated = false;
        if (options.getChannel('category')) {
          ticketSettings.categoryId = options.getChannel('category').id;
          updated = true;
        }
        if (options.getString('title')) {
          ticketSettings.embedTitle = options.getString('title');
          updated = true;
        }
        if (options.getString('description')) {
          ticketSettings.embedDescription = options.getString('description');
          updated = true;
        }
        if (options.getString('color')) {
          ticketSettings.embedColor = options.getString('color').replace('#', '');
          updated = true;
        }
        if (options.getString('image')) {
          ticketSettings.embedImage = options.getString('image');
          updated = true;
        }

        if (updated) {
          await ticketSettings.save();
          i.reply({ content: '✅ تم تحديث إعدادات التذاكر بنجاح.', ephemeral: true });
        } else {
          i.reply({ content: '⚠️ ما حددت أي خيار للتحديث.', ephemeral: true });
        }
      }
    }

    if (commandName === 'resetall') {
      if (user.id !== OWNER_ID) {
        return i.reply({ content: '❌ هذا الأمر فقط لمالك البوت.', ephemeral: true });
      }
      await User.updateMany({}, {
        balance: 5,
        history: [{ type: 'RESET_ALL', amount: 5, date: new Date() }]
      });
      return i.reply('✅ تم إعادة تعيين رصيد الجميع إلى **5 دنانير**.');
    }

    if (commandName === 'numbers') {
      if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return i.reply({ content: '❌ هذا الأمر للأدمن فقط.', ephemeral: true });
      }
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('join_number_game')
          .setLabel('انضم للعبة')
          .setStyle(ButtonStyle.Secondary)
      );
      
      await i.reply({
        content: `-# **تم بدأ لعبة التخمين مهمتكم رح تكون تخمين الرقم الصحيح من 1 الى 100 <:new_emoji:1388436089584226387> **`,
        components: [row]
      });
      
      const msg = await i.fetchReply();
      
      activeNumberGames.set(msg.id, {
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
        timer: null
      });
      
      startNumberGameAfterDelay(msg, activeNumberGames.get(msg.id));
    }
  }

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

      const embed = new EmbedBuilder()
        .setTitle(ticketSettings.embedTitle)
        .setDescription(ticketSettings.embedDescription)
        .setColor(parseInt(ticketSettings.embedColor, 16) || 0x2b2d31);
      if (ticketSettings.embedImage) embed.setImage(ticketSettings.embedImage);

      ch.send({ 
        content: `${i.user}`,
        embeds: [embed], 
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger)
        )] 
      });
      i.reply({ content: `✅ تم فتح التذكرة: ${ch}`, ephemeral: true });
    }

    if (i.customId === 'close_ticket') { 
      await i.reply('🔒 سيتم إغلاق التذكرة خلال 3 ثواني...'); 
      setTimeout(() => i.channel.delete().catch(() => {}), 3000); 
    }

    if (i.customId === 'join_number_game') {
      const game = activeNumberGames.get(i.message.id);
      if (!game || game.started) {
        return i.reply({ 
          content: `-# **اللعبة فشلت عشان مافي عدد كافي دخلها <:new_emoji:1388436095842385931> **`, 
          ephemeral: true 
        }).catch(() => {});
      }
      
      if (game.players.length >= 6) {
        return i.reply({ 
          content: `-# **اللعبة ممتلئة للأسف ليش ما جيت بسرعه <:emoji_84:1389404919672340592> **`, 
          ephemeral: true 
        }).catch(() => {});
      }
      
      if (game.players.includes(i.user.id)) {
        return i.reply({ 
          content: `-# **تم انت الحين مشارك فاللعبة <:2thumbup:1467287897429512396> **`, 
          ephemeral: true 
        }).catch(() => {});
      }
      
      game.players.push(i.user.id);
      game.attempts.set(i.user.id, 0);
      
      await i.reply({ 
        content: `-# **تم انت الحين مشارك فاللعبة <:2thumbup:1467287897429512396> **`, 
        ephemeral: true 
      }).catch(() => {});
    }
  }
});

// ==================== 🚀 تشغيل البوت ====================
app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));