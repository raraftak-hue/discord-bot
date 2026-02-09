const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ==================== 🔒 إعدادات الحماية والمالك 🔒 ====================
const ALLOWED_GUILDS = [
  '1387902577496297523' // آيدي سيرفرك
];

const OWNER_ID = "1131951548772122625"; // ⬅️ ضع الآيدي الخاص بك هنا
// ==================== 🔒 🔒 🔒 🔒 🔒 🔒 🔒 ====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers, // ضروري جداً لأوامر الطرد والترحيب
    GatewayIntentBits.MessageContent
  ]
});

// --- قاعدة بيانات دائمة ---
const DB_PATH = path.join(__dirname, 'database.json');
let db = {
  users: {}, 
  welcomeSettings: { channelId: null, title: '', description: '', color: '2b2d31', image: null },
  panelAdminRoles: {} 
};

if (fs.existsSync(DB_PATH)) {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    if (data) db = JSON.parse(data);
  } catch (e) { console.error("Error loading DB:", e); }
}

function saveDB() {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch (e) { console.error("Error saving DB:", e); }
}

function getUserData(userId) {
  if (!db.users[userId]) { 
    db.users[userId] = { 
      balance: 50, 
      history: [{ type: 'WELCOME_GIFT', amount: 50, date: new Date().toISOString() }] 
    }; 
    saveDB();
  }
  return db.users[userId];
}

const activeTickets = new Map();

// --- تعريف الأوامر (Slash Commands) ---
const commands = [
  {
    name: 'kick',
    description: 'طرد عضو من السيرفر',
    defaultMemberPermissions: PermissionsBitField.Flags.KickMembers,
    options: [
      { name: 'user', description: 'العضو المراد طرده', type: 6, required: true },
      { name: 'reason', description: 'سبب الطرد', type: 3, required: false }
    ]
  },
  {
    name: 'timeout',
    description: 'إسكات عضو لفترة محددة (4h, 10m)',
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers,
    options: [
      { name: 'user', description: 'العضو', type: 6, required: true },
      { name: 'duration', description: 'المدة (مثال: 10m, 4h, 1d)', type: 3, required: true },
      { name: 'reason', description: 'السبب', type: 3, required: false }
    ]
  },
  {
    name: 'clear',
    description: 'حذف عدد من الرسائل',
    defaultMemberPermissions: PermissionsBitField.Flags.ManageMessages,
    options: [
      { name: 'amount', description: 'عدد الرسائل (1-100)', type: 4, required: true }
    ]
  },
  { 
    name: 'ticket', 
    description: 'إدارة نظام التذاكر', 
    options: [
      {
        name: 'panel', description: 'عرض لوحة التذاكر', type: 1,
        options: [
          { name: 'admin1', description: 'رتبة الإدارة 1', type: 8, required: false },
          { name: 'admin2', description: 'رتبة الإدارة 2', type: 8, required: false },
          { name: 'admin3', description: 'رتبة الإدارة 3', type: 8, required: false }
        ]
      }
    ] 
  },
  { 
    name: 'welcome', 
    description: 'إدارة نظام الترحيب', 
    options: [
      { name: 'set', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }] },
      { name: 'edit', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'description', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'رابط الصورة', type: 3 }] },
      { name: 'test', description: 'تجربة رسالة الترحيب', type: 1, options: [{ name: 'user', description: 'العضو للتجربة', type: 6 }] }
    ] 
  },
  { name: 'bothelp', description: 'عرض جميع الأوامر' },
  { 
    name: 'economy', 
    description: 'النظام المالي', 
    options: [
      { name: 'balance', description: 'عرض رصيدك', type: 1 },
      { 
        name: 'transfer', description: 'تحويل دينار', type: 1,
        options: [
          { name: 'user', description: 'المستلم', type: 6, required: true },
          { name: 'amount', description: 'المبلغ', type: 4, required: true }
        ] 
      },
      { name: 'top', description: 'قائمة الأغنياء', type: 1 },
      { 
        name: 'add', description: 'إضافة دينار (للمالك فقط)', type: 1,
        options: [{ name: 'user', description: 'المستخدم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] 
      }
    ]
  }
];

// ==================== 🚀 تشغيل البوت وتحديث الأوامر 🚀 ====================
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} جاهز!`);

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('🔄 جارٍ تحديث أوامر السلاش للسيرفر...');
    // التسجيل لكل سيرفر موجود في القائمة لضمان السرعة
    for (const guildId of ALLOWED_GUILDS) {
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, guildId),
            { body: commands }
        );
    }
    console.log('✅ تم تحديث الأوامر وتظهر الآن في سيرفرك.');
  } catch (error) { console.error('❌ خطأ في تحديث الأوامر:', error); }

  cron.schedule('0 0 * * 5', () => {
    for (const userId in db.users) {
      const user = db.users[userId];
      if (user.balance > 0) {
        const zakat = Math.floor(user.balance * 0.025);
        if (zakat > 0) {
          user.balance -= zakat;
          user.history.unshift({ type: 'ZAKAT', amount: zakat, date: new Date().toISOString() });
        }
      }
    }
    saveDB();
  });
});

// ==================== 📩 معالجة التفاعلات 📩 ====================
client.on('interactionCreate', async interaction => {
  if (interaction.guild && !ALLOWED_GUILDS.includes(interaction.guild.id)) return;
  
  if (interaction.isButton()) {
      if (interaction.customId === 'open_ticket') {
        if (activeTickets.has(interaction.user.id)) return interaction.reply({ content: '-# **لديك تذكرة مفتوحة.**', ephemeral: true });
        const adminRoles = db.panelAdminRoles[interaction.message.id] || [];
        const ticketChannel = await interaction.guild.channels.create({
          name: `تذكرة-${interaction.user.username}`,
          type: ChannelType.GuildText,
          parent: interaction.channel.parentId,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
            ...adminRoles.map(roleId => ({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }))
          ],
        });
        activeTickets.set(interaction.user.id, ticketChannel.id);
        await ticketChannel.send({ 
          content: `${interaction.user}${adminRoles.length > 0 ? `\n${adminRoles.map(id => `<@&${id}>`).join(' ')}` : ''}`, 
          embeds: [new EmbedBuilder().setTitle('تذكرة دعم').setDescription(`-# **تذكرة دعم - ${interaction.user.username}**\n-# **اكتب طلب او مشكلتك بشكل واضح شوي و ان شاء الله بنرد عليك في اقرب وقت**`).setColor(0x2b2d31)], 
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger))] 
        });
        return interaction.reply({ content: `-# **تم إنشاء تذكرتك: ${ticketChannel}**`, ephemeral: true });
      }
      if (interaction.customId === 'close_ticket') {
        for (const [userId, channelId] of activeTickets.entries()) { if (channelId === interaction.channel.id) { activeTickets.delete(userId); break; } }
        await interaction.reply({ content: '-# **سيتم إغلاق التذكرة خلال 5 ثواني.**' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      }
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user } = interaction;
  const sub = options.getSubcommand(false);

  // --- أوامر الإدارة ---
  if (commandName === 'kick') {
      const member = options.getMember('user');
      const reason = options.getString('reason') || 'بدون سبب';
      if (!member) return interaction.reply({ content: '-# **العضو غير موجود.**', ephemeral: true });
      if (!member.kickable) return interaction.reply({ content: '-# **رتبة العضو أعلى مني أو ليس لدي صلاحية.**', ephemeral: true });
      await member.kick(reason);
      await interaction.reply({ content: `-# **تم طرد ${member.user.tag} بنجاح 👋**` });
  }

  else if (commandName === 'timeout') {
      const member = options.getMember('user');
      const durationStr = options.getString('duration');
      const ms = parseDuration(durationStr);
      if (!ms || !member || !member.moderatable) return interaction.reply({ content: '-# **تعذر تنفيذ الأمر (تأكد من الوقت أو الصلاحيات).**', ephemeral: true });
      await member.timeout(ms, options.getString('reason') || 'بدون سبب');
      await interaction.reply({ content: `-# **تم إسكات ${member} بنجاح.**` });
  }

  else if (commandName === 'clear') {
      const amount = options.getInteger('amount');
      await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: `-# **تم مسح ${amount} رسالة.**`, ephemeral: true });
  }

  // --- نظام الاقتصاد ---
  else if (commandName === 'economy') {
      if (sub === 'balance') {
          const data = getUserData(user.id);
          await interaction.reply({ content: `-# **رصيدك: ${data.balance} دينار 💰**` });
      } else if (sub === 'add') {
          if (user.id !== OWNER_ID) return interaction.reply({ content: 'للمالك فقط!', ephemeral: true });
          const target = options.getUser('user');
          const amount = options.getInteger('amount');
          const data = getUserData(target.id);
          data.balance += amount;
          saveDB();
          await interaction.reply({ content: `✅ تم إضافة ${amount} دينار لـ ${target}` });
      }
  }

  // --- نظام الترحيب ---
  else if (commandName === 'welcome') {
      if (sub === 'set') {
          db.welcomeSettings.channelId = options.getChannel('channel').id;
          saveDB();
          await interaction.reply('✅ تم تحديد قناة الترحيب.');
      }
  }
});

// دالة مساعدة للوقت
function parseDuration(str) {
    const unit = str.slice(-1);
    const val = parseInt(str);
    if (unit === 'm') return val * 60000;
    if (unit === 'h') return val * 3600000;
    if (unit === 'd') return val * 86400000;
    return null;
}

client.on('guildMemberAdd', async (member) => {
    if (!ALLOWED_GUILDS.includes(member.guild.id)) return;
    getUserData(member.id);
    const channel = member.guild.channels.cache.get(db.welcomeSettings.channelId);
    if (channel) {
        channel.send(`أهلاً بك ${member} في سيرفرنا! 🎉`);
    }
});

app.get('/', (req, res) => res.send('Bot is Running!'));
app.listen(3000);

client.login(process.env.TOKEN);
