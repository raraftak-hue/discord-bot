const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ==================== 🔒 إعدادات الحماية 🔒 ====================
const ALLOWED_GUILDS = [
  '1387902577496297523' // ⬅️ هذا ID سيرفرك
];
// ==================== 🔒 🔒 🔒 🔒 🔒 🔒 🔒 ====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// --- قاعدة بيانات دائمة (ملف JSON) ---
const DB_PATH = path.join(__dirname, 'database.json');
let db = {
  users: {}, // { userId: { balance: 0, history: [] } }
  welcomeSettings: {
    channelId: null,
    title: '',
    description: '',
    color: '2b2d31',
    image: null
  },
  panelAdminRoles: {} // { messageId: [roleIds] }
};

// تحميل البيانات عند التشغيل
if (fs.existsSync(DB_PATH)) {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    if (data) db = JSON.parse(data);
  } catch (e) {
    console.error("Error loading DB:", e);
  }
}

// دالة حفظ البيانات
function saveDB() {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error("Error saving DB:", e);
  }
}

function getUserData(userId) {
  if (!db.users[userId]) {
    db.users[userId] = { balance: 0, history: [] };
  }
  return db.users[userId];
}

const activeTickets = new Map();

const commands = [
  { name: 'ticketpanel', description: 'عرض لوحة التذاكر', options: [{ name: 'admin1', type: 8 }, { name: 'admin2', type: 8 }, { name: 'admin3', type: 8 }] },
  { name: 'ticketedit', description: 'تعديل لوحة التذاكر', options: [{ name: 'title', type: 3 }, { name: 'description', type: 3 }, { name: 'color', type: 3 }] },
  { name: 'welcomeset', description: 'تعيين روم الترحيب', options: [{ name: 'channel', type: 7, required: true }] },
  { name: 'welcomeedit', description: 'تعديل رسالة الترحيب', options: [{ name: 'title', type: 3 }, { name: 'description', type: 3 }, { name: 'color', type: 3 }, { name: 'image', type: 3 }] },
  { name: 'welcometest', description: 'تجربة رسالة الترحيب', options: [{ name: 'user', type: 6 }] },
  { name: 'welcomeinfo', description: 'عرض إعدادات الترحيب' },
  { name: 'bothelp', description: 'عرض جميع الأوامر' },
  { name: 'balance', description: 'عرض رصيدك من الدينار' },
  { name: 'transfer', description: 'تحويل دينار لشخص آخر', options: [{ name: 'user', type: 6, required: true }, { name: 'amount', type: 4, required: true }] },
  { name: 'top', description: 'عرض قائمة أغنى المستخدمين' },
  { name: 'history', description: 'عرض سجل تحويلاتك' },
  { name: 'add-dinar', description: 'إضافة دينار لمستخدم (للمسؤولين)', options: [{ name: 'user', type: 6, required: true }, { name: 'amount', type: 4, required: true }] }
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} جاهز!`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (error) { console.error(error); }

  // نظام الزكاة الأسبوعي (2.5%)
  cron.schedule('0 0 * * 5', () => {
    for (const userId in db.users) {
      const user = db.users[userId];
      if (user.balance > 0) {
        const zakat = Math.floor(user.balance * 0.025);
        if (zakat > 0) {
          user.balance -= zakat;
          user.history.unshift({ type: 'ZAKAT', amount: zakat, date: new Date().toISOString() });
          if (user.history.length > 10) user.history.pop();
        }
      }
    }
    saveDB();
  });
});

// ==================== 🛡️ أوامر الشات (الاختصارات) 🛡️ ====================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !ALLOWED_GUILDS.includes(message.guild.id)) return;

  const args = message.content.split(' ');
  const command = args[0];

  // --- أمر طرد ---
  if (command === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
    const member = message.mentions.members.first();
    const reason = args.slice(2).join(' ') || 'بدون سبب';
    if (!member) return message.reply('-# **يرجى منشن العضو للطرد.**');
    try {
      await member.kick(reason);
      message.reply(`-# **تم طرد ${member.user.username} بنجاح.**`);
    } catch (e) { message.reply('-# **فشل الطرد، تأكد من صلاحياتي.**'); }
  }

  // --- أمر تايم (Timeout) ---
  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    const durationStr = args[2]; // مثال: 10m, 1h, 1d
    const reason = args.slice(3).join(' ') || 'بدون سبب';
    
    if (!member || !durationStr) return message.reply('-# **الاستخدام: تايم @عضو الوقت(10m/1h) السبب**');
    
    let duration = 0;
    if (durationStr.endsWith('m')) duration = parseInt(durationStr) * 60 * 1000;
    else if (durationStr.endsWith('h')) duration = parseInt(durationStr) * 60 * 60 * 1000;
    else if (durationStr.endsWith('d')) duration = parseInt(durationStr) * 24 * 60 * 60 * 1000;
    else return message.reply('-# **صيغة الوقت غير صحيحة (m/h/d).**');

    try {
      await member.timeout(duration, reason);
      message.reply(`-# **تم إعطاء تايم آوت لـ ${member.user.username} لمدة ${durationStr}.**`);
    } catch (e) { message.reply('-# **فشل التايم آوت، تأكد من صلاحياتي.**'); }
  }

  // --- أمر حذف (Clear) ---
  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0 || amount > 100) return message.reply('-# **يرجى تحديد عدد الرسائل (1-100).**');
    try {
      await message.channel.bulkDelete(amount + 1);
      const msg = await message.channel.send(`-# **تم حذف ${amount} رسالة.**`);
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    } catch (e) { message.reply('-# **فشل الحذف، الرسائل قديمة جداً.**'); }
  }
});

// ==================== 🎫 نظام التذاكر والترحيب 🎫 ====================
client.on('guildMemberAdd', async (member) => {
  if (!db.welcomeSettings.channelId || !ALLOWED_GUILDS.includes(member.guild.id)) return;
  try {
    const channel = member.guild.channels.cache.get(db.welcomeSettings.channelId);
    if (!channel) return;
    let title = db.welcomeSettings.title.replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{mention}/g, `<@${member.user.id}>`);
    let desc = db.welcomeSettings.description.replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{count}/g, member.guild.memberCount).replace(/{mention}/g, `<@${member.user.id}>`);
    const embed = new EmbedBuilder().setColor(parseInt(db.welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31);
    if (title.trim()) embed.setTitle(title);
    if (desc.trim()) embed.setDescription(desc);
    if (db.welcomeSettings.image && db.welcomeSettings.image.startsWith('http')) embed.setImage(db.welcomeSettings.image);
    await channel.send({ embeds: [embed] });
  } catch (e) {}
});

client.on('interactionCreate', async interaction => {
  if (interaction.guild && !ALLOWED_GUILDS.includes(interaction.guild.id)) return;

  if (interaction.isButton() && interaction.customId === 'open_ticket') {
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
      embeds: [new EmbedBuilder().setTitle(`تذكرة دعم - ${interaction.user.username}`).setDescription('-# **اكتب طلب او مشكلتك بشكل واضح شوي و ان شاء الله بنرد عليك في اقرب وقت**').setColor(0x2b2d31)], 
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger))] 
    });
    return interaction.reply({ content: `-# **تم إنشاء تذكرتك: ${ticketChannel}**`, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    for (const [userId, channelId] of activeTickets.entries()) { if (channelId === interaction.channel.id) { activeTickets.delete(userId); break; } }
    await interaction.reply({ content: '-# **سيتم إغلاق التذكرة خلال 5 ثواني.**' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user, guild } = interaction;

  if (commandName === 'ticketpanel') {
    const adminRoles = [options.getRole('admin1'), options.getRole('admin2'), options.getRole('admin3')].filter(r => r).map(r => r.id);
    const embed = new EmbedBuilder().setTitle('🎫 نظام التذاكر').setDescription('-# **اضغط على الزر لفتح تذكرة دعم.**\n-# **سيتم إنشاء قناة خاصة بك.**').setColor(0x2b2d31);
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Secondary));
    const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
    if (adminRoles.length > 0) { db.panelAdminRoles[reply.id] = adminRoles; saveDB(); }
  }

  else if (commandName === 'welcomeset') {
    const channel = options.getChannel('channel');
    db.welcomeSettings.channelId = channel.id;
    saveDB();
    await interaction.reply({ content: `-# **تم تعيين روم الترحيب: ${channel}**` });
  }

  else if (commandName === 'welcomeedit') {
    const title = options.getString('title');
    const desc = options.getString('description');
    const color = options.getString('color');
    const image = options.getString('image');
    if (title !== null) db.welcomeSettings.title = title;
    if (desc !== null) db.welcomeSettings.description = desc;
    if (color) db.welcomeSettings.color = color.replace('#', '');
    if (image !== null) db.welcomeSettings.image = image;
    saveDB();
    await interaction.reply({ content: '-# **تم تحديث إعدادات الترحيب!**', ephemeral: true });
  }

  else if (commandName === 'balance') {
    const userData = getUserData(user.id);
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('رصيد الدينار').setDescription(`-# **رصيدك الحالي هو: ${userData.balance} دينار**`).setColor(0x2b2d31)] });
  }

  else if (commandName === 'transfer') {
    const target = options.getUser('user');
    const amount = options.getInteger('amount');
    const senderData = getUserData(user.id);
    if (target.id === user.id || amount <= 0 || senderData.balance < amount) return interaction.reply({ content: '-# **خطأ في عملية التحويل.**', ephemeral: true });
    const tax = Math.ceil(amount * 0.05);
    const finalAmount = amount - tax;
    const receiverData = getUserData(target.id);
    senderData.balance -= amount;
    receiverData.balance += finalAmount;
    senderData.history.unshift({ type: 'SENT', to: target.username, amount, tax, date: new Date().toISOString() });
    receiverData.history.unshift({ type: 'RECEIVED', from: user.username, amount: finalAmount, date: new Date().toISOString() });
    saveDB();
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('عملية تحويل ناجحة').setDescription(`-# **تم تحويل ${finalAmount} دينار إلى ${target}**\n-# **الضريبة: ${tax} دينار**`).setColor(0x2b2d31)] });
  }

  else if (commandName === 'top') {
    const sorted = Object.entries(db.users).sort(([, a], [, b]) => b.balance - a.balance).slice(0, 10);
    const desc = sorted.length > 0 ? sorted.map(([id, data], i) => `${i + 1}. <@${id}>: **${data.balance}** دينار`).join('\n') : '-# **لا يوجد بيانات.**';
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('قائمة الأغنياء').setDescription(`-# **${desc}**`).setColor(0x2b2d31)] });
  }

  else if (commandName === 'add-dinar') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '-# **للمسؤولين فقط.**', ephemeral: true });
    const target = options.getUser('user');
    const amount = options.getInteger('amount');
    const targetData = getUserData(target.id);
    targetData.balance += amount;
    targetData.history.unshift({ type: 'ADMIN_ADD', amount, date: new Date().toISOString() });
    saveDB();
    await interaction.reply({ content: `-# **تم إضافة ${amount} دينار إلى ${target}**` });
  }
});

app.get('/', (req, res) => res.json({ status: 'online' }));
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  client.login(process.env.TOKEN).catch(() => process.exit(1));
});
