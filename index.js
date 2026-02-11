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

const UserSchema = new mongoose.Schema({
  userId: String,
  balance: { type: Number, default: 10 },
  history: [{ type: { type: String }, amount: Number, date: { type: Date, default: Date.now } }]
});

const SettingsSchema = new mongoose.Schema({
  guildId: String,
  welcomeSettings: { channelId: String, title: String, description: String, color: { type: String, default: '2b2d31' }, image: String }
});

const GlobalSettingsSchema = new mongoose.Schema({
  allowedGuilds: { type: [String], default: ['1387902577496297523'] }
});

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);
const GlobalSettings = mongoose.model('GlobalSettings', GlobalSettingsSchema);

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
    name: 'games',
    description: 'قسم الألعاب الممتعة',
    options: [
      {
        name: 'rps',
        description: 'لعبة حجر ورقة مقص مع صديق',
        type: 1,
        options: [{ name: 'user', description: 'الشخص اللي تبي تتحداه', type: 6, required: true }]
      },
      {
        name: 'mafia',
        description: 'إدارة لعبة المافيا',
        type: 1,
        options: [
          {
            name: 'action',
            description: 'اختر الإجراء',
            type: 3,
            required: true,
            choices: [
              { name: 'بدء اللعبة', value: 'start' },
              { name: 'إيقاف اللعبة', value: 'stop' }
            ]
          }
        ]
      }
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
  }
];

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

const pendingTransfers = new Map();
const transferCooldowns = new Map();
const activeMafiaGames = new Map();
const activeRPSGames = new Map();

// --- معالجة الأوامر النصية ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const globalSettings = await getGlobalSettings();
  if (!globalSettings.allowedGuilds.includes(message.guild.id)) return;

  const args = message.content.trim().split(/\s+/);
  const command = args[0];

  // أوامر الإدارة النصية
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
    if (isNaN(amount) || amount < 1 || amount > 100) return message.channel.send(`-# **حدد عدد الرسائل (1-100) يا ذكي <:emoji_334:1388211595053760663>**`);
    try {
      await message.channel.bulkDelete(amount + 1);
      const msg = await message.channel.send(`-# **تم حذف ${amount} رسالة بنجاح <:2thumbup:1467287897429512396>**`);
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    } catch (error) {
      message.channel.send(`-# **ما اقدر احذف الرسائل، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'دنانير') {
    const user = await getUserData(message.author.id);
    message.channel.send(`-# **رصيدك الحالي هو ${user.balance} دينار <a:moneywith_:1470458218953179237>**`);
  }

  if (command === 'تحويل') {
    const target = message.mentions.users.first();
    const amount = parseInt(args.find(a => /^\d+$/.test(a)));
    if (!target || isNaN(amount) || amount <= 0) return message.channel.send(`-# **الصيغة غلط يا ذكي: تحويل @شخص 100 <:emoji_334:1388211595053760663>**`);
    if (target.id === message.author.id) return message.channel.send(`-# **ما تقدر تحول لنفسك يا اهبل <:emoji_464:1388211597197050029>**`);
    if (target.bot) return message.channel.send(`-# **البوتات ما تحتاج فلوس، عندها شغل أهم منك <:emoji_464:1388211597197050029>**`);
    
    const sender = await getUserData(message.author.id);
    if (sender.balance < amount) return message.channel.send(`-# **ما عندك رصيد كافي يا طفران <:emoji_464:1388211597197050029>**`);
    
    const cooldown = transferCooldowns.get(message.author.id);
    if (cooldown && Date.now() - cooldown < 10000) return message.channel.send(`-# **انتظر شوي بين التحويلات يا مستعجل <:emoji_464:1388211597197050029>**`);

    const msg = await message.channel.send(`-# **اكتب "تأكيد" لو انت متأكد من عملية التحويل  **\n-# تجاهل الرسالة لو لم تكن متاكد`);
    
    const filter = m => m.author.id === message.author.id && m.content === 'تأكيد';
    const collector = message.channel.createMessageCollector({ filter, time: 10000, max: 1 });

    collector.on('collect', async (m) => {
      const s = await getUserData(message.author.id);
      const t = await getUserData(target.id);
      if (s.balance < amount) return m.reply('ما عندك رصيد كافي!');
      
      s.balance -= amount; t.balance += amount;
      s.history.push({ type: 'TRANSFER_SEND', amount });
      t.history.push({ type: 'TRANSFER_RECEIVE', amount });
      await s.save(); await t.save();
      transferCooldowns.set(message.author.id, Date.now());
      
      await msg.edit(`-# **تم تحويل ${amount} لـ <@${target.id}> رصيدك الآن ${s.balance} <a:moneywith_:1470458218953179237>**`);
      if (m.deletable) m.delete().catch(() => {});
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) msg.delete().catch(() => {});
    });
  }

  if (command === 'اغنياء') {
    const topUsers = await User.find().sort({ balance: -1 }).limit(10);
    const list = topUsers.map((u, i) => `-# **${i + 1}. <@${u.userId}> - ${u.balance} دينار**`).join('\n');
    const embed = new EmbedBuilder().setTitle('\u200Fالطبقة الارستقراطية <:y_coroa:1404576666105417871>\u202C').setDescription(`\u200F${list || 'لا يوجد مستخدمين بعد.'}\u202C`).setColor(0x2b2d31);
    message.channel.send({ embeds: [embed] });
  }

  if (command === 'السجل') {
    const user = await getUserData(message.author.id);
    const history = user.history.slice(-5).reverse().map(h => `- ${h.type}: ${h.amount} (${new Date(h.date).toLocaleDateString()})`).join('\n');
    const embed = new EmbedBuilder().setTitle('سجل المعاملات').setDescription(history || 'لا يوجد سجل بعد.').setColor(0x2b2d31);
    message.channel.send({ embeds: [embed] });
  }
});

client.on('interactionCreate', async (i) => {
  const globalSettings = await getGlobalSettings();
  if (!globalSettings.allowedGuilds.includes(i.guild.id)) return;

  if (i.isChatInputCommand()) {
    const { commandName, options, user, member } = i;

    if (commandName === 'bothelp') {
      const embed = new EmbedBuilder()
        .setTitle('قائمة أوامر البوت 🤖')
        .setDescription(`-# **/economy balance - عرض الرصيد**\n-# **/economy transfer - تحويل أموال**\n-# **/economy top - قائمة الأغنياء**\n-# **/games rps - تحدي حجر ورقة مقص**\n-# **/games mafia - لعبة مافيا**\n-# **/welcome test - تجربة الترحيب**\n-# **/giveaway start - بدء قيف أوي**\n-# **أوامر نصية: دنانير، تحويل، اغنياء، السجل، تايم، طرد، حذف**`)
        .setColor(0x2b2d31);
      i.reply({ embeds: [embed] });
    }

    if (commandName === 'economy') {
      const sub = options.getSubcommand();
      if (sub === 'balance') {
        const userData = await getUserData(user.id);
        i.reply({ content: `-# **رصيدك الحالي هو ${userData.balance} دينار <a:moneywith_:1470458218953179237>**` });
      }
      if (sub === 'transfer') {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        if (target.id === user.id) return i.reply({ content: '-# **ما تقدر تحول لنفسك يا اهبل <:emoji_464:1388211597197050029>**', ephemeral: true });
        if (target.bot) return i.reply({ content: '-# **البوتات ما تحتاج فلوس، عندها شغل أهم منك <:emoji_464:1388211597197050029>**', ephemeral: true });
        
        const sender = await getUserData(user.id);
        if (sender.balance < amount) return i.reply({ content: '-# **ما عندك رصيد كافي يا طفران <:emoji_464:1388211597197050029>**', ephemeral: true });
        
        const cooldown = transferCooldowns.get(user.id);
        if (cooldown && Date.now() - cooldown < 10000) return i.reply({ content: '-# **انتظر شوي بين التحويلات يا مستعجل <:emoji_464:1388211597197050029>**', ephemeral: true });

        const msg = await i.reply({ content: `-# **اكتب "تأكيد" لو انت متأكد من عملية التحويل  **\n-# تجاهل الرسالة لو لم تكن متاكد`, fetchReply: true });
        
        const filter = m => m.author.id === user.id && m.content === 'تأكيد';
        const collector = i.channel.createMessageCollector({ filter, time: 10000, max: 1 });

        collector.on('collect', async (m) => {
          const s = await getUserData(user.id);
          const t = await getUserData(target.id);
          if (s.balance < amount) return m.reply('ما عندك رصيد كافي!');
          
          s.balance -= amount; t.balance += amount;
          s.history.push({ type: 'TRANSFER_SEND', amount });
          t.history.push({ type: 'TRANSFER_RECEIVE', amount });
          await s.save(); await t.save();
          transferCooldowns.set(user.id, Date.now());
          
          await i.editReply({ content: `-# **تم تحويل ${amount} لـ <@${target.id}> رصيدك الآن ${s.balance} <a:moneywith_:1470458218953179237>**` });
          if (m.deletable) m.delete().catch(() => {});
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time' && collected.size === 0) i.deleteReply().catch(() => {});
        });
      }
      if (sub === 'top') {
        const topUsers = await User.find().sort({ balance: -1 }).limit(10);
        const list = topUsers.map((u, idx) => `-# **${idx + 1}. <@${u.userId}> - ${u.balance} دينار**`).join('\n');
        const embed = new EmbedBuilder().setTitle('\u200Fالطبقة الارستقراطية <:y_coroa:1404576666105417871>\u202C').setDescription(`\u200F${list || 'لا يوجد مستخدمين بعد.'}\u202C`).setColor(0x2b2d31);
        i.reply({ embeds: [embed] });
      }
    }

    if (commandName === 'games') {
      const sub = options.getSubcommand();
      if (sub === 'rps') {
        const target = options.getUser('user');
        if (target.id === user.id) return i.reply({ content: 'تبي تلعب مع نفسك؟ روح تعالج <:rimuruWut:1388211603140247565>', ephemeral: true });
        if (target.bot) return i.reply({ content: 'البوتات ما تلعب، عندها شغل أهم منك <:emoji_464:1388211597197050029>', ephemeral: true });
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('rps_accept').setLabel('قبول التحدي').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('rps_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
        );
        const msg = await i.reply({ content: `-# ** يـ${target} يتحداك ${user} في لعبة حجرة ورقة مقص**`, components: [row], fetchReply: true });
        activeRPSGames.set(msg.id, { challenger: user.id, opponent: target.id, challengerChoice: null, opponentChoice: null, accepted: false });
      }
      if (sub === 'mafia') {
        const action = options.getString('action');
        if (action === 'start') {
          if (!member.roles.cache.some(r => r.name.toLowerCase() === 'admin')) {
            return i.reply({ content: 'تحتاج رتبة admin عشان تسوي لعبة مافيا يا ذكي <:emoji_43:1397804543789498428>', ephemeral: true });
          }
          const joinRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary));
          const embed = new EmbedBuilder().setTitle('\u200Fلعبة المافيا <:emoji_38:1401773302619439147>\u202C').setDescription(`\u200F-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: 0**\u202C`).setColor(0x2b2d31);
          const msg = await i.reply({ embeds: [embed], components: [joinRow], fetchReply: true });
          activeMafiaGames.set(msg.id, { hostId: user.id, players: [], started: false, alive: [], roles: {}, votes: new Map(), items: new Map(), actions: {}, round: 0 });
          
          setTimeout(async () => {
            const game = activeMafiaGames.get(msg.id);
            if (game && !game.started && game.players.length < 4) {
              activeMafiaGames.delete(msg.id);
              await msg.edit({ content: '-# **اللعبة فشلت عشان مافي عدد كافي دخلها <:new_emoji:1388436095842385931> **', embeds: [], components: [] }).catch(() => {});
            }
          }, 30000);
        } else if (action === 'stop') {
          if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return i.reply({ content: 'فقط الأدمن يقدر يوقف اللعبة!', ephemeral: true });
          const gameEntry = Array.from(activeMafiaGames.entries()).find(([id, g]) => g.started || !g.started);
          if (!gameEntry) return i.reply({ content: 'مافي لعبة شغالة حالياً!', ephemeral: true });
          activeMafiaGames.delete(gameEntry[0]);
          i.reply({ content: '🛑 تم إيقاف لعبة المافيا بنجاح.' });
        }
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
          .setDescription(`\u200F-# **سحب عشوائي على ${prize} ينتهي في <t:${endTime}:R> <:emoji_45:1397804598110195863> **\n-# **الي سوا السحب العشوائي ${user} <:y_coroa:1404576666105417871> **\n-# **الشروط ${condition} <:new_emoji:1388436089584226387> **\u202C`)
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
            btn.update({ content: '❌ تم خروجك من السحب.', components: [], ephemeral: true }).catch(() => {});
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
          const endEmbed = EmbedBuilder.from(embed).setDescription(`\u200F-# **انتهى السحب على ${prize}**\n-# **الفائزين هم ** ${winners.join(', ')}\u202C`);
          await msg.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
          msg.channel.send(`\u200F-# **مبروك فزتم بـ ${prize} افتحوا تكت عشان تستلموها <:emoji_33:1401771703306027008> **\n-# ** ${winners.join(', ')}**\u202C`).catch(() => {});
        });
      }
    }

    if (commandName === 'ticket') {
      if (options.getSubcommand() === 'panel') {
        const embed = new EmbedBuilder().setTitle('نظام التذاكر').setDescription('اضغط على الزر لفتح تذكرة جديدة.').setColor(0x2b2d31);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Primary));
        i.reply({ embeds: [embed], components: [row] });
      }
    }
  }

  if (i.isButton()) {
    // معالجة أزرار المافيا
    if (i.customId === 'join_mafia') {
      const game = activeMafiaGames.get(i.message.id);
      if (!game || game.started) return i.reply({ content: 'اللعبة بدأت أو انتهت.', ephemeral: true });
      if (game.players.includes(i.user.id)) return i.reply({ content: 'أنت منضم أصلاً!', ephemeral: true });
      game.players.push(i.user.id);
      const embed = EmbedBuilder.from(i.message.embeds[0]);
      const playersList = game.players.map(p => `\u200F<@${p}>\u202C`).join(', ');
      embed.setDescription(`\u200F-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: ${game.players.length}**\n${playersList}\u202C`);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary));
      if (game.players.length >= 4) row.addComponents(new ButtonBuilder().setCustomId('start_mafia').setLabel('بدء اللعبة').setStyle(ButtonStyle.Success));
      await i.update({ embeds: [embed], components: [row] }).catch(() => {});
    }

    if (i.customId === 'start_mafia') {
      const game = activeMafiaGames.get(i.message.id);
      if (!game || game.hostId !== i.user.id) return i.reply({ content: 'فقط صاحب الأمر يقدر يبدأ اللعبة!', ephemeral: true });
      game.started = true;
      game.alive = [...game.players];
      const players = [...game.players].sort(() => Math.random() - 0.5);
      
      game.roles[players[0]] = 'mafia';
      game.roles[players[1]] = 'doctor';
      game.roles[players[2]] = 'police';
      players.slice(3).forEach(p => game.roles[p] = 'citizen');

      await i.update({ content: '-# **✅ بدأت اللعبة! اضغط على الزر لمعرفة دورك.**', embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('reveal_role').setLabel('كشف دوري').setStyle(ButtonStyle.Secondary))] }).catch(() => {});
      setTimeout(() => startNightPhase(i.channel, game), 5000);
    }

    if (i.customId === 'reveal_role') {
      const game = Array.from(activeMafiaGames.values()).find(g => g.roles[i.user.id]);
      if (!game) return i.reply({ content: 'أنت لست جزءاً من هذه اللعبة!', ephemeral: true });
      
      const role = game.roles[i.user.id];
      const roleNames = { mafia: 'مافيا 🔪 <:emoji_38:1470920843398746215>', doctor: 'طبيب 💉 <:emoji_32:1401771771010613319>', police: 'شرطي 🔍 <:s7_discord:1388214117365453062>', citizen: 'مواطن 👨‍🌾 <:emoji_33:1401771703306027008>' };
      const roleDescs = { mafia: 'تقتل الناس بدون ما يدرون عنك.', doctor: 'تحمي شخص واحد كل جولة من القتل.', police: 'تحاول تكشف مين هو القاتل.', citizen: 'تحاول تعيش وتصوت على الشخص الصح.' };

      const shopRow = new ActionRowBuilder();
      if (role === 'mafia') shopRow.addComponents(new ButtonBuilder().setCustomId('buy_cloak').setLabel('شراء رداء تخفي (100)').setStyle(ButtonStyle.Primary));
      if (role === 'doctor') shopRow.addComponents(new ButtonBuilder().setCustomId('buy_heal').setLabel('شراء علاج (50)').setStyle(ButtonStyle.Primary));
      if (role === 'police') shopRow.addComponents(new ButtonBuilder().setCustomId('buy_watch').setLabel('شراء مراقبة (150)').setStyle(ButtonStyle.Primary));

      const replyData = { content: `-# **بدأت اللعبة لا تقول لأحد مين انت <:emoji_84:1389404919672340592> **\n-# **انت الحين ${roleNames[role]} الي تقدر تسويه ${roleDescs[role]}**`, ephemeral: true };
      if (shopRow.components.length > 0) replyData.components = [shopRow];
      return i.reply(replyData).catch(() => {});
    }

    // معالجة الشراء
    if (['buy_cloak', 'buy_heal', 'buy_watch'].includes(i.customId)) {
      const game = Array.from(activeMafiaGames.values()).find(g => g.players.includes(i.user.id));
      if (!game) return i.reply({ content: 'لست في لعبة نشطة!', ephemeral: true });
      
      const userItems = game.items.get(i.user.id) || [];
      const itemMap = { buy_cloak: { name: 'رداء تخفي', price: 100, id: 'cloak' }, buy_heal: { name: 'علاج', price: 50, id: 'heal' }, buy_watch: { name: 'تحقيق', price: 150, id: 'watch' } };
      const item = itemMap[i.customId];

      if (userItems.includes(item.id)) return i.reply({ content: '-# ** ما تقدر تشتريها مره اخرى في نفس اللعبة برو <:emoji_464:1388211597197050029> **', ephemeral: true });
      
      const userData = await getUserData(i.user.id);
      if (userData.balance < item.price) return i.reply({ content: '-# **ما عندك رصيد كافي يا طفران <:emoji_464:1388211597197050029>**', ephemeral: true });

      userData.balance -= item.price;
      await userData.save();
      userItems.push(item.id);
      game.items.set(i.user.id, userItems);
      
      return i.reply({ content: `-# **تم شراء ال${item.name} عندك محاولة وحدة لاستخدامه خليك حكيم<:emoji_33:1401771703306027008> **`, ephemeral: true });
    }

    // معالجة الأكشنات الليلية
    if (i.customId.startsWith('mafia_kill_') || i.customId.startsWith('doctor_heal_') || i.customId.startsWith('police_watch_')) {
      const [action, type, targetId] = i.customId.split('_');
      const game = Array.from(activeMafiaGames.values()).find(g => g.players.includes(i.user.id));
      if (!game) return i.reply({ content: 'انتهت اللعبة!', ephemeral: true });
      
      game.actions[i.user.id] = { type, targetId };
      return i.reply({ content: `-# **تم اختيار الهدف بنجاح.**`, ephemeral: true });
    }

    if (i.customId.startsWith('vote_')) {
      const targetId = i.customId.split('_')[1];
      const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
      if (!game) return i.reply({ content: 'لست في لعبة نشطة أو أنك ميت!', ephemeral: true });
      game.votes.set(i.user.id, targetId);
      return i.reply({ content: `-# **تم تسجيل تصويتك ضد <@${targetId}>**`, ephemeral: true }).catch(() => {});
    }

    // معالجة أزرار RPS
    if (i.customId === 'rps_accept' || i.customId === 'rps_decline') {
      const game = activeRPSGames.get(i.message.id);
      if (!game) return i.reply({ content: 'انتهى التحدي!', ephemeral: true });
      if (i.user.id === game.challenger) return i.reply({ content: '-# **تراك انت الي باعت التحدي مب هو **', ephemeral: true }).catch(() => {});
      if (i.user.id !== game.opponent) return i.reply({ content: '-# **التحدي ليس لك برو اقرأ المنشن فوق **', ephemeral: true }).catch(() => {});
      
      if (i.customId === 'rps_decline') {
        activeRPSGames.delete(i.message.id);
        return i.update({ content: '-# **❌ تم رفض التحدي.**', components: [] }).catch(() => {});
      }
      game.accepted = true;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_rock').setLabel('حجر 🪨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_paper').setLabel('ورقة 📄').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_scissors').setLabel('مقص ✂️').setStyle(ButtonStyle.Primary)
      );
      await i.update({ content: '-# **بدأ التحدي! اختاروا أسلحتكم (الرسائل مخفية)**', components: [row] }).catch(() => {});
    }

    if (['rps_rock', 'rps_paper', 'rps_scissors'].includes(i.customId)) {
      const game = activeRPSGames.get(i.message.id);
      if (!game || (i.user.id !== game.challenger && i.user.id !== game.opponent)) return i.reply({ content: 'لست جزءاً من التحدي!', ephemeral: true });
      const choice = i.customId.split('_')[1];
      if (i.user.id === game.challenger) {
        if (game.challengerChoice) return i.reply({ content: 'اخترت خلاص!', ephemeral: true }).catch(() => {});
        game.challengerChoice = choice;
      } else {
        if (game.opponentChoice) return i.reply({ content: 'اخترت خلاص!', ephemeral: true }).catch(() => {});
        game.opponentChoice = choice;
      }
      await i.reply({ content: `-# **اخترت ${choice === 'rock' ? 'حجر' : choice === 'paper' ? 'ورقة' : 'مقص'}!**`, ephemeral: true }).catch(() => {});
      if (game.challengerChoice && game.opponentChoice) {
        const names = { rock: 'حجر 🪨', paper: 'ورقة 📄', scissors: 'مقص ✂️' };
        let result = '';
        if (game.challengerChoice === game.opponentChoice) result = '-# **تعادل! 🤝**';
        else if ((game.challengerChoice === 'rock' && game.opponentChoice === 'scissors') || (game.challengerChoice === 'paper' && game.opponentChoice === 'rock') || (game.challengerChoice === 'scissors' && game.opponentChoice === 'paper')) result = `-# **\u200F<@${game.challenger}>\u202C فاز على \u200F<@${game.opponent}>\u202C! 🏆**`;
        else result = `-# **\u200F<@${game.opponent}>\u202C فاز على \u200F<@${game.challenger}>\u202C! 🏆**`;
        await i.message.edit({ content: `**انتهى التحدي!**\n-# \u200F<@${game.challenger}>\u202C: ${names[game.challengerChoice]}\n-# \u200F<@${game.opponent}>\u202C: ${names[game.opponentChoice]}\n\n${result}`, components: [] }).catch(() => {});
        activeRPSGames.delete(i.message.id);
      }
    }

    if (i.customId === 'open_ticket') {
      const ch = await i.guild.channels.create({ name: `ticket-${i.user.username}`, type: ChannelType.GuildText, permissionOverwrites: [{ id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] });
      ch.send({ content: `${i.user}`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger))] });
      i.reply({ content: `-# **تم فتح التذكرة ${ch}**`, ephemeral: true });
    }
    if (i.customId === 'close_ticket') { await i.reply('-# **سيتم الإغلاق...**'); setTimeout(() => i.channel.delete(), 3000); }
  }
});

async function startNightPhase(channel, game) {
  if (game.alive.length <= 1) return checkWinner(channel, game);
  game.round++;
  game.actions = {};

  const mafiaId = Object.keys(game.roles).find(id => game.roles[id] === 'mafia');
  const doctorId = Object.keys(game.roles).find(id => game.roles[id] === 'doctor');
  const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police');

  await channel.send({ content: `-# ** دور القاتل عشان يلعب لعبته مين بيكون الضحيه التالية يا ترى **<:1KazumaGrin:1468386233750392947>` });

  if (game.alive.includes(mafiaId)) {
    const row = new ActionRowBuilder();
    game.alive.filter(id => id !== mafiaId).slice(0, 5).forEach(id => {
      row.addComponents(new ButtonBuilder().setCustomId(`mafia_kill_${id}`).setLabel(client.users.cache.get(id)?.username || id).setStyle(ButtonStyle.Danger));
    });
    client.users.send(mafiaId, { content: 'اختر ضحيتك:', components: [row] }).catch(() => {});
  }

  if (game.alive.includes(doctorId)) {
    const row = new ActionRowBuilder();
    game.alive.slice(0, 5).forEach(id => {
      row.addComponents(new ButtonBuilder().setCustomId(`doctor_heal_${id}`).setLabel(client.users.cache.get(id)?.username || id).setStyle(ButtonStyle.Success));
    });
    client.users.send(doctorId, { content: 'اختر شخصاً لحمايته:', components: [row] }).catch(() => {});
  }

  if (game.alive.includes(policeId)) {
    const row = new ActionRowBuilder();
    game.alive.filter(id => id !== policeId).slice(0, 5).forEach(id => {
      row.addComponents(new ButtonBuilder().setCustomId(`police_watch_${id}`).setLabel(client.users.cache.get(id)?.username || id).setStyle(ButtonStyle.Primary));
    });
    client.users.send(policeId, { content: 'اختر شخصاً لمراقبته:', components: [row] }).catch(() => {});
  }

  setTimeout(() => processNightActions(channel, game), 15000);
}

async function processNightActions(channel, game) {
  const mafiaId = Object.keys(game.roles).find(id => game.roles[id] === 'mafia');
  const doctorId = Object.keys(game.roles).find(id => game.roles[id] === 'doctor');
  const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police');

  const killAction = game.actions[mafiaId];
  const healAction = game.actions[doctorId];
  const watchAction = game.actions[policeId];

  let killedId = killAction?.targetId;
  let healedId = healAction?.targetId;
  let watchedId = watchAction?.targetId;

  if (killedId && killedId === healedId) {
    channel.send(`-# ** الطبيب الكفو قدر يرجع <@${killedId}> <:echat_kannaCool:1405424651399598221> **`);
    killedId = null;
  }

  if (killedId) {
    const roleNames = { mafia: 'مافيا 🔪', doctor: 'طبيب 💉', police: 'شرطي 🔍', citizen: 'مواطن 👨‍🌾' };
    const killedRole = game.roles[killedId];
    game.alive = game.alive.filter(id => id !== killedId);
    let killMsg = `-# **المرحوم راح فيها و تم قتله <@${killedId}> <:emoji_84:1389404919672340592> هو كان ${roleNames[killedRole]}**`;
    
    if (killedId === watchedId) {
      const mafiaItems = game.items.get(mafiaId) || [];
      if (mafiaItems.includes('cloak')) {
      } else {
        killMsg += `\n-# ** لاكن الشرطي كان حاطت مراقبة على ذا الشخص و شاف القاتل و هو يقتله<:s7_discord:1388214117365453062> **`;
        channel.send(`-# ** تم امساك القاتل <@${mafiaId}> هذا كان انت اجل…. <:__:1467633552408576192>  **`);
        return checkWinner(channel, game, true);
      }
    }
    channel.send(killMsg);
  }

  if (game.alive.length > 1) setTimeout(() => startVoting(channel, game), 2000);
  else checkWinner(channel, game);
}

async function startVoting(channel, game) {
  if (game.alive.length <= 1) return checkWinner(channel, game);
  const row = new ActionRowBuilder();
  game.alive.slice(0, 5).forEach(pId => {
    row.addComponents(new ButtonBuilder().setCustomId(`vote_${pId}`).setLabel(client.users.cache.get(pId)?.username || pId).setStyle(ButtonStyle.Secondary));
  });
  await channel.send({ content: `-# ** صوتوا على الشخص الي تشوفونه هو القاتل <:emoji_38:1470920843398746215> **`, components: [row] }).catch(() => {});
  setTimeout(async () => {
    const voteCounts = {};
    game.votes.forEach(targetId => voteCounts[targetId] = (voteCounts[targetId] || 0) + 1);
    let kickedId = null; let maxVotes = 0;
    for (const [id, count] of Object.entries(voteCounts)) { if (count > maxVotes) { maxVotes = count; kickedId = id; } }
    
    if (kickedId) {
      const mafiaId = Object.keys(game.roles).find(id => game.roles[id] === 'mafia');
      if (kickedId === mafiaId) {
        const mafiaItems = game.items.get(mafiaId) || [];
        if (mafiaItems.includes('cloak')) {
          channel.send(`-# **اقتربتوا منه كثير بس كان مستخدم زي تخفي <:emoji_38:1470920843398746215> **`);
          kickedId = null;
        }
      }
    }

    if (kickedId) {
      const role = game.roles[kickedId];
      const roleNames = { mafia: 'مافيا 🔪', doctor: 'طبيب 💉', police: 'شرطي 🔍', citizen: 'مواطن 👨‍🌾' };
      game.alive = game.alive.filter(id => id !== kickedId);
      channel.send(`-# ** تم طرد <@${kickedId}> و هو كان ${roleNames[role]} **`).catch(() => {});
    } else { 
      channel.send('-# **لم يتم التصويت على أحد أو القاتل استخدم التخفي، تستمر اللعبة...**').catch(() => {}); 
    }
    
    game.votes.clear();
    if (game.alive.length > 1) setTimeout(() => startNightPhase(channel, game), 2000);
    else checkWinner(channel, game);
  }, 15000);
}

function checkWinner(channel, game, forcePoliceWin = false) {
  const mafiaAlive = game.alive.some(id => game.roles[id] === 'mafia');
  const mafiaId = Object.keys(game.roles).find(id => game.roles[id] === 'mafia');
  const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police');
  const doctorId = Object.keys(game.roles).find(id => game.roles[id] === 'doctor');
  const citizens = Object.keys(game.roles).filter(id => game.roles[id] === 'citizen').map(id => `<@${id}>`).join(', ');
  
  if (!mafiaAlive || forcePoliceWin) { 
    channel.send(`\u200F-# **المواطنين فازوا  الشرطي <@${policeId}><:s7_discord:1388214117365453062>  المواطنين ${citizens} <:emoji_33:1401771703306027008>  الطبيب <@${doctorId}> <:emoji_32:1401771771010613319>**\u202C`).catch(() => {}); 
  }
  else { 
    channel.send(`\u200F-# **القاتل <@${mafiaId}> <:emoji_38:1470920843398746215> لعب فيهم لعب و فاز و محد كشفه <:emoji_33:1401771703306027008>  **\u202C`).catch(() => {}); 
  }
  for (const [key, val] of activeMafiaGames.entries()) { if (val === game) activeMafiaGames.delete(key); }
}

app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));
