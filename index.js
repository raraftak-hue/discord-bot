const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, REST, Routes } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
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

// تخزين المتغيرات العامة في client
client.pendingTransfers = new Map();
client.transferCooldowns = new Map();
client.activeNumberGames = new Map();
client.systems = new Map();

// ==================== الاتصال بقاعدة البيانات ====================
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ متصل بـ MongoDB بنجاح!'))
  .catch(err => console.error('❌ فشل الاتصال بـ MongoDB:', err));

// ==================== تحميل الأنظمة ====================
const systemsPath = path.join(__dirname, 'systems');
const systemFiles = fs.readdirSync(systemsPath).filter(file => file.endsWith('.js'));

for (const file of systemFiles) {
  try {
    const system = require(path.join(systemsPath, file));
    client.systems.set(file.replace('.js', ''), system);
    console.log(`📦 تم تحميل نظام: ${file}`);
  } catch (error) {
    console.error(`❌ خطأ في تحميل ${file}:`, error.message);
  }
}

// ==================== جمع أوامر السلاش ====================
const slashCommands = [
  // أوامر wel
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
      {
        name: 'test',
        description: 'تجربة الرسالة',
        type: 1,
        options: [
          { name: 'target', description: 'العضو المستهدف (اختياري)', type: 6, required: false }
        ]
      }
    ]
  },
  // أوامر tic
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
  // أوامر give
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
  // أوامر pre
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
  // أوامر emb
  {
    name: 'emb',
    description: 'إنشاء إيمبيد',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      { name: 'title', description: 'العنوان', type: 3, required: true },
      { name: 'description', description: 'الوصف', type: 3, required: true },
      { name: 'color', description: 'اللون', type: 3, required: false },
      { name: 'image', description: 'الصورة', type: 3, required: false },
      { name: 'thumbnail', description: 'الصورة المصغرة', type: 3, required: false },
      { name: 'footer', description: 'التذييل', type: 3, required: false },
      { name: 'timestamp', description: 'إضافة وقت', type: 5, required: false }
    ]
  },
  // أوامر economy (جديد)
  {
    name: 'economy',
    description: 'إعدادات نظام الاقتصاد',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      {
        name: 'channel',
        description: 'تحديد روم مخصص لأوامر الاقتصاد',
        type: 1,
        options: [
          { name: 'room', description: 'الروم', type: 7, required: true, channel_types: [0] }
        ]
      }
    ]
  },
  // أوامر sub
  {
    name: 'sub',
    description: 'إدارة الاشتراكات (للمالك)',
    default_member_permissions: "0",
    options: [
      {
        name: 'add',
        description: 'إضافة اشتراك لسيرفر',
        type: 1,
        options: [
          { name: 'id', description: 'ID السيرفر', type: 3, required: true },
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
        description: 'حذف اشتراك سيرفر',
        type: 1,
        options: [{ name: 'id', description: 'ID السيرفر', type: 3, required: true }]
      }
    ]
  },
  // أوامر hosting
  { 
    name: 'hosting', 
    description: 'عرض السيرفرات المشتركة (للمالك)', 
    default_member_permissions: "0",
    type: 1 
  },
  // أوامر auto
  {
    name: 'auto',
    description: 'نظام الحذف التلقائي (للمالك)',
    default_member_permissions: "0",
    options: [
      {
        name: 'add',
        description: 'تفعيل الحذف التلقائي في روم',
        type: 1,
        options: [
          { name: 'channel', description: 'الروم', type: 7, required: true },
          { name: 'delay', description: 'وقت الحذف بالثواني', type: 4, required: false },
          {
            name: 'type',
            description: 'نوع الفلتر',
            type: 3,
            required: false,
            choices: [
              { name: 'الكل', value: 'all' },
              { name: 'صور', value: 'images' },
              { name: 'روابط', value: 'links' },
              { name: 'ملفات', value: 'files' }
            ]
          },
          { name: 'allow', description: 'كلمات مستثناة (افصل بفاصلة)', type: 3, required: false },
          { name: 'message', description: 'رسالة تنبيه بعد الحذف', type: 3, required: false },
          { name: 'allowed_users', description: 'ID المستخدمين المستثنين (افصل بفاصلة)', type: 3, required: false }
        ]
      },
      {
        name: 'remove',
        description: 'إيقاف الحذف التلقائي في روم',
        type: 1,
        options: [{ name: 'channel', description: 'الروم', type: 7, required: true }]
      },
      {
        name: 'list',
        description: 'عرض رومات الحذف التلقائي',
        type: 1
      }
    ]
  },
  // أوامر whisper
  {
    name: 'whisper',
    description: 'إرسال همسة لشخص معين (يشوفها فقط هو)',
    options: [
      {
        name: 'user',
        description: 'الشخص اللي تبي ترسل له الهمسة',
        type: 6,
        required: true
      },
      {
        name: 'message',
        description: 'الهمسة',
        type: 3,
        required: true
      }
    ]
  }
];

// ==================== الأحداث ====================
client.once('ready', async () => {
  console.log(`✅ تم تسجيل الدخول بـ ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('✅ تم تسجيل جميع الأوامر بنجاح!');
    console.log('📋 الأوامر المسجلة:', slashCommands.map(c => c.name).join(', '));
  } catch (e) { console.error(e); }

  // استدعاء onReady في كل نظام
  for (const system of client.systems.values()) {
    if (system.onReady) {
      try { await system.onReady(client); } catch (e) { console.error(e); }
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  
  // ===== تشغيل onMessage في كل نظام (لأي رسالة) =====
  for (const system of client.systems.values()) {
    if (system.onMessage) {
      try { await system.onMessage(client, message); } catch (e) { console.error(e); }
    }
  }
  
  // ===== معالجة الأوامر النصية =====
  const Settings = mongoose.model('Settings');
  const settings = await Settings.findOne({ guildId: message.guild.id });
  const prefix = settings?.prefix || '';
  
  if (prefix && !message.content.startsWith(prefix)) return;
  
  const args = message.content.trim().split(/\s+/);
  const firstWord = args[0];
  const command = prefix ? firstWord.slice(prefix.length).toLowerCase() : firstWord.toLowerCase();
  
  // ===== أوامر عامة =====
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
        `-# ** wel, tic, give, pre, emb, economy, whisper**\n` +
        `-# ** text -  تايم، طرد، حذف، ارقام، ايقاف**`
      );
    await message.channel.send({ embeds: [embed] });
    return;
  }
  
  // ===== تمرير الأمر لجميع الأنظمة =====
  for (const system of client.systems.values()) {
    if (system.handleTextCommand) {
      try {
        const handled = await system.handleTextCommand(client, message, command, args, prefix);
        if (handled === true) return;
      } catch (e) { console.error(e); }
    }
  }
});

client.on('interactionCreate', async (interaction) => {
  console.log(`📢 أمر سلاش: ${interaction.commandName}`);
  
  for (const [name, system] of client.systems) {
    if (system.onInteraction) {
      try {
        console.log(`🔍 جرب في نظام: ${name}`);
        const handled = await system.onInteraction(client, interaction);
        if (handled) {
          console.log(`✅ نظام ${name} تعامل مع الأمر`);
          return;
        }
      } catch (e) { 
        console.error(`❌ خطأ في نظام ${name}:`, e); 
      }
    }
  }
  
  console.log(`❌ ما في نظام تعامل مع: ${interaction.commandName}`);
});

client.on('guildCreate', async (guild) => {
  for (const system of client.systems.values()) {
    if (system.onGuildCreate) {
      try { await system.onGuildCreate(client, guild); } catch (e) { console.error(e); }
    }
  }
});

client.on('guildMemberAdd', async (member) => {
  for (const system of client.systems.values()) {
    if (system.onGuildMemberAdd) {
      try { await system.onGuildMemberAdd(client, member); } catch (e) { console.error(e); }
    }
  }
});

// ==================== تشغيل السيرفر ====================
const server = app.listen(3000, '0.0.0.0', () => {
  console.log('🌐 Server is ready on port 3000!');
});

process.on('SIGTERM', () => {
  console.log('📴 SIGTERM received, closing gracefully...');
  server.close(() => {
    console.log('🛑 HTTP server closed');
    client.destroy();
    process.exit(0);
  });
});

client.login(process.env.TOKEN);