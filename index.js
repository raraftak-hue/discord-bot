const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ==================== 🔒 إعدادات الحماية والمالك 🔒 ====================
const ALLOWED_GUILDS = ['1387902577496297523']; 
const OWNER_ID = "1131951548772122625"; 
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
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
  if (!db.users[userId]) { db.users[userId] = { balance: 0, history: [] }; }
  return db.users[userId];
}

const activeTickets = new Map();

// --- تعريف أوامر السلاش (Slash Commands) ---
const commands = [
  { 
    name: 'ticket', 
    description: 'إدارة نظام التذاكر', 
    options: [
      { name: 'panel', description: 'عرض لوحة التذاكر', type: 1, options: [{ name: 'admin1', description: 'رتبة الإدارة 1', type: 8 }, { name: 'admin2', description: 'رتبة الإدارة 2', type: 8 }, { name: 'admin3', description: 'رتبة الإدارة 3', type: 8 }] },
      { name: 'edit', description: 'تعديل لوحة التذاكر', type: 1, options: [{ name: 'title', description: 'العنوان الجديد', type: 3 }, { name: 'description', description: 'الوصف الجديد', type: 3 }, { name: 'color', description: 'اللون الجديد', type: 3 }] }
    ] 
  },
  { 
    name: 'welcome', 
    description: 'إدارة نظام الترحيب', 
    options: [
      { name: 'set', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }] },
      { name: 'edit', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'description', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'رابط الصورة', type: 3 }] },
      { name: 'test', description: 'تجربة الترحيب', type: 1, options: [{ name: 'user', description: 'العضو للتجربة', type: 6 }] },
      { name: 'info', description: 'عرض إعدادات الترحيب', type: 1 }
    ] 
  },
  { name: 'bothelp', description: 'عرض جميع الأوامر' },
  { 
    name: 'economy', 
    description: 'النظام المالي', 
    options: [
      { name: 'balance', description: 'عرض الرصيد', type: 1 },
      { name: 'transfer', description: 'تحويل الأموال', type: 1, options: [{ name: 'user', description: 'المستلم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] },
      { name: 'top', description: 'قائمة الأغنياء', type: 1 },
      { name: 'history', description: 'سجل التحويلات', type: 1 },
      { name: 'add', description: 'إضافة رصيد (للمالك)', type: 1, options: [{ name: 'user', description: 'المستخدم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] }
    ]
  }
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} متصل الآن!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }

  // نظام الزكاة الأسبوعي
  cron.schedule('0 0 * * 5', () => {
    for (const id in db.users) {
      if (db.users[id].balance > 0) {
        const amount = Math.floor(db.users[id].balance * 0.025);
        db.users[id].balance -= amount;
        db.users[id].history.unshift({ type: 'ZAKAT', amount, date: new Date().toISOString() });
      }
    }
    saveDB();
  });
});

// --- الترحيب والهدية ---
client.on('guildMemberAdd', async (member) => {
  if (!ALLOWED_GUILDS.includes(member.guild.id)) return;
  const userData = getUserData(member.id);
  if (userData.history.length === 0) { 
    userData.balance = 50; 
    userData.history.push({ type: 'WELCOME_GIFT', amount: 50, date: new Date().toISOString() });
    saveDB();
  }
  // إرسال رسالة الترحيب... (نفس منطقك السابق)
});

// --- الأوامر النصية (التايم، الحذف، الطرد) ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !ALLOWED_GUILDS.includes(message.guild.id)) return;
  const args = message.content.split(/\s+/);
  const command = args[0];

  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    const timeArg = args.find(a => /^\d+[mhd]$/i.test(a));
    if (!member || !timeArg) return message.reply('❌ **استخدم: تايم @عضو 1h سبب**');
    
    const unit = timeArg.slice(-1).toLowerCase();
    const value = parseInt(timeArg);
    let duration = (unit === 'm' ? value * 60 : unit === 'h' ? value * 3600 : value * 86400) * 1000;
    const reason = args.filter(a => a !== command && !a.includes(member.id) && a !== timeArg).join(' ') || 'بدون سبب';

    try {
      await member.timeout(duration, reason);
      message.reply({ embeds: [new EmbedBuilder().setTitle('✅ تم كتم العضو').setDescription(`العضو: ${member}\nالمدة: ${timeArg}\nالسبب: ${reason}`).setColor(0x2b2d31)] });
    } catch (e) { message.reply('❌ فشل، تأكد من رتبة البوت.'); }
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const amount = parseInt(args[1]);
    if (amount > 0 && amount <= 100) {
      await message.channel.bulkDelete(amount + 1).catch(() => {});
    }
  }
});

// --- التعامل مع التفاعلات (Buttons & Slash) ---
client.on('interactionCreate', async (i) => {
  if (!i.guild || !ALLOWED_GUILDS.includes(i.guild.id)) return;

  if (i.isButton()) {
    if (i.customId === 'open_ticket') {
      if (activeTickets.has(i.user.id)) return i.reply({ content: 'عندك تذكرة مفتوحة!', ephemeral: true });
      const channel = await i.guild.channels.create({
        name: `ticket-${i.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });
      activeTickets.set(i.user.id, channel.id);
      await channel.send({ content: `${i.user}`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger))] });
      i.reply({ content: `تم فتح تذكرتك: ${channel}`, ephemeral: true });
    }
    if (i.customId === 'close_ticket') {
      await i.reply('سيتم الإغلاق...');
      setTimeout(() => i.channel.delete().catch(() => {}), 3000);
    }
  }

  if (i.isChatInputCommand()) {
    const { commandName, options, user } = i;
    const sub = options.getSubcommand(false);

    if (commandName === 'economy') {
      const data = getUserData(user.id);
      if (sub === 'balance') i.reply(`رصيدك: ${data.balance} دينار`);
      if (sub === 'add' && user.id === OWNER_ID) {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        getUserData(target.id).balance += amount;
        saveDB();
        i.reply(`تمت إضافة ${amount} لـ ${target.username}`);
      }
      // يمكنك إضافة باقي الأوامر هنا بنفس الطريقة...
    }
    
    if (commandName === 'ticket' && sub === 'panel') {
        const embed = new EmbedBuilder().setTitle('الدعم الفني').setDescription('اضغط لفتح تذكرة').setColor(0x2b2d31);
        const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Primary));
        i.reply({ embeds: [embed], components: [btn] });
    }
  }
});

app.get('/', (req, res) => res.send('Bot is Running!'));
app.listen(3000, () => client.login(process.env.TOKEN));
