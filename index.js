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

// تعريف الأوامر (نفس الأوامر الأصلية)
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
      { name: 'title', description: 'العنوان', type: 3, required: true },
      { name: 'description', description: 'الوصف', type: 3, required: true },
      { name: 'color', description: 'اللون', type: 3, required: false },
      { name: 'image', description: 'الصورة', type: 3, required: false },
      { name: 'thumbnail', description: 'الصورة المصغرة', type: 3, required: false },
      { name: 'footer', description: 'التذييل', type: 3, required: false },
      { name: 'timestamp', description: 'إضافة وقت', type: 5, required: false }
    ]
  },
  {
    name: 'points',
    description: 'نظام النقاط',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      {
        name: 'setup',
        description: 'إعداد نظام النقاط',
        type: 1,
        options: [
          { name: 'channel', description: 'روم التهنئة', type: 7, required: false },
          { name: 'message', description: 'رسالة التهنئة ({user}, {points})', type: 3, required: false },
          { name: 'reward', description: 'المكافأة المالية لكل نقطة', type: 4, required: false }
        ]
      },
      { name: 'disable', description: 'إيقاف نظام النقاط', type: 1 },
      { name: 'enable', description: 'تشغيل نظام النقاط', type: 1 },
      { name: 'reset', description: 'تصفير جميع النقاط', type: 1 }
    ]
  },
  {
    name: 'sub',
    description: 'إدارة الاشتراكات (للمالك)',
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
  { name: 'hosting', description: 'عرض السيرفرات المشتركة (للمالك)', type: 1 },
  {
    name: 'auto',
    description: 'نظام الحذف التلقائي (للمالك)',
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
              { name: 'حذف كل شيء', value: 'all' },
              { name: 'حذف كل شيء ما عدا كلمات معينة', value: 'words' }
            ]
          },
          { name: 'allow', description: 'الكلمات المسموحة (افصل بفاصلة)', type: 3, required: false },
          { name: 'message', description: 'رسالة تنبيه بعد الحذف', type: 3, required: false },
          { name: 'allowed_users', description: 'ID المستخدمين المستثنين (افصل بفاصلة)', type: 3, required: false }
        ]
      },
      {
        name: 'remove',
        description: 'إيقاف الحذف التلقائي في روم',
        type: 1,
        options: [{ name: 'channel', description: 'الروم', type: 7, required: true }]
      }
    ]
  }
];

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ متصل بـ MongoDB بنجاح!'))
  .catch(err => console.error('❌ فشل الاتصال بـ MongoDB:', err));

// تحميل الأنظمة من مجلد systems
const systemsPath = path.join(__dirname, 'systems');
const systemFiles = fs.readdirSync(systemsPath).filter(file => file.endsWith('.js'));

for (const file of systemFiles) {
  const system = require(path.join(systemsPath, file));
  client.systems.set(file, system);
  console.log(`📦 تم تحميل نظام: ${file}`);
}

// توجيه الأحداث لجميع الأنظمة
client.once('ready', async () => {
  console.log(`✅ تم تسجيل الدخول بـ ${client.user.tag}`);
  
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
    console.log('✅ تم تسجيل جميع الأوامر بنجاح!');
  } catch (e) { console.error(e); }

  // استدعاء onReady في كل نظام
  for (const system of client.systems.values()) {
    if (system.onReady) await system.onReady(client);
  }
});

client.on('messageCreate', async (message) => {
  for (const system of client.systems.values()) {
    if (system.onMessage) await system.onMessage(client, message);
  }
});

client.on('interactionCreate', async (interaction) => {
  for (const system of client.systems.values()) {
    if (system.onInteraction) await system.onInteraction(client, interaction);
  }
});

client.on('guildCreate', async (guild) => {
  for (const system of client.systems.values()) {
    if (system.onGuildCreate) await system.onGuildCreate(client, guild);
  }
});

client.on('guildMemberAdd', async (member) => {
  for (const system of client.systems.values()) {
    if (system.onGuildMemberAdd) await system.onGuildMemberAdd(client, member);
  }
});

// Express Server
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(3000, () => console.log('🌐 Server is ready!'));

client.login(process.env.TOKEN);
