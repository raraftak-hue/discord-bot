const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ==================== 🔒 إعدادات الحماية والمالك 🔒 ====================
const ALLOWED_GUILDS = [
  '1387902577496297523' // ⬅️ ID سيرفرك
];

const OWNER_ID = "1131951548772122625"; // ⬅️⬅️ ضع الآيدي الخاص بك هنا (مهم جداً لنظام البنك)
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
  users: {}, 
  welcomeSettings: {
    channelId: null,
    title: '',
    description: '',
    color: '2b2d31',
    image: null
  },
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
    db.users[userId] = { balance: 0, history: [] }; 
  }
  return db.users[userId];
}

const activeTickets = new Map();

// --- دمج الأوامر بذكاء ---
const commands = [
  { 
    name: 'ticket', 
    description: 'إدارة نظام التذاكر', 
    options: [
      {
        name: 'panel',
        description: 'عرض لوحة التذاكر',
        type: 1, // Subcommand
        options: [
          { name: 'admin1', description: 'رتبة الإدارة 1', type: 8, required: false },
          { name: 'admin2', description: 'رتبة الإدارة 2', type: 8, required: false },
          { name: 'admin3', description: 'رتبة الإدارة 3', type: 8, required: false }
        ]
      },
      {
        name: 'edit',
        description: 'تعديل لوحة التذاكر',
        type: 1,
        options: [
          { name: 'title', description: 'العنوان الجديد', type: 3, required: false },
          { name: 'description', description: 'الوصف الجديد', type: 3, required: false },
          { name: 'color', description: 'اللون الجديد', type: 3, required: false }
        ]
      }
    ] 
  },
  { 
    name: 'welcome', 
    description: 'إدارة نظام الترحيب', 
    options: [
      {
        name: 'set',
        description: 'تعيين روم الترحيب',
        type: 1,
        options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }]
      },
      {
        name: 'edit',
        description: 'تعديل رسالة الترحيب',
        type: 1,
        options: [
          { name: 'title', description: 'العنوان', type: 3, required: false },
          { name: 'description', description: 'الوصف', type: 3, required: false },
          { name: 'color', description: 'اللون', type: 3, required: false },
          { name: 'image', description: 'رابط الصورة', type: 3, required: false }
        ]
      },
      {
        name: 'test',
        description: 'تجربة رسالة الترحيب',
        type: 1,
        options: [{ name: 'user', description: 'العضو للتجربة', type: 6, required: false }]
      },
      { name: 'info', description: 'عرض إعدادات الترحيب', type: 1 }
    ] 
  },
  { name: 'bothelp', description: 'عرض جميع الأوامر' },
  { 
    name: 'economy', 
    description: 'النظام المالي (رصيد، تحويل، توب)', 
    options: [
      { name: 'balance', description: 'عرض رصيدك من الدينار', type: 1 },
      { 
        name: 'transfer', 
        description: 'تحويل دينار لشخص آخر', 
        type: 1,
        options: [
          { name: 'user', description: 'المستلم', type: 6, required: true },
          { name: 'amount', description: 'المبلغ', type: 4, required: true }
        ] 
      },
      { name: 'top', description: 'عرض قائمة أغنى المستخدمين', type: 1 },
      { name: 'history', description: 'عرض سجل تحويلاتك', type: 1 },
      { 
        name: 'add', 
        description: 'إضافة دينار لمستخدم (للمالك فقط)', 
        type: 1,
        options: [
          { name: 'user', description: 'المستخدم', type: 6, required: true },
          { name: 'amount', description: 'المبلغ', type: 4, required: true }
        ] 
      }
    ]
  }
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} جاهز!`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (error) { console.error(error); }

  // --- نظام الزكاة (كل يوم جمعة) ---
  cron.schedule('0 0 * * 5', () => {
    console.log('🔄 جاري تنفيذ نظام الزكاة...');
    for (const userId in db.users) {
      const user = db.users[userId];
      if (user.balance > 0) {
        // خصم 2.5%
        const zakat = Math.floor(user.balance * 0.025);
        if (zakat > 0) {
          user.balance -= zakat;
          user.history.unshift({ type: 'ZAKAT', amount: zakat, date: new Date().toISOString() });
          if (user.history.length > 10) user.history.pop();
        }
      }
    }
    saveDB();
    console.log('✅ تم تنفيذ الزكاة.');
  });
});

// رسالة المالك عند إضافة البوت
client.on('guildCreate', async (guild) => {
  if (!ALLOWED_GUILDS.includes(guild.id)) {
    try {
      const owner = await guild.fetchOwner();
      await owner.send({
        embeds: [new EmbedBuilder()
          .setTitle('البوت خاص')
          .setDescription('-# **هذا البوت خاص و لن يعمل في خادمك الا اذا تواصلت مع سيرفر المطور الذي في الـ بايو لكي يسمح لك مجانا او مدفوع**\n\n-# **البوت سوف يخرج نفسه من السيرفر في غضون ١٠ ثوان**')
          .setColor(0x2b2d31)]
      });
      setTimeout(() => guild.leave(), 10000);
    } catch (e) {}
    return;
  }

  try {
    const owner = await guild.fetchOwner();
    await owner.send({
      embeds: [new EmbedBuilder()
        .setTitle('شكراً لإضافة البوت')
        .setDescription('-# **عزيزي الـ owner بما انك اضف البوت لخادمك الجميل نود منك فضلا ان تساهم معنا و تساعدنا في رفع معدل استعمال العملة يمكنك استعمالها في المسابقات كـ نقاط يستبدلونها بأي شيء البوت مله مجاني بدون علامات حقوق و ما الى ذالك لكي يساعدك في بناء خادمك**')
        .setColor(0x2b2d31)]
    });
  } catch (e) {}
});

// هدية الترحيب (معدلة لتكون 50 دينار)
client.on('guildMemberAdd', async (member) => {
  if (!ALLOWED_GUILDS.includes(member.guild.id)) return;
  
  if (!db.users[member.id]) {
    const userData = getUserData(member.id);
    userData.balance = 50; // ⬅️ تعديل المبلغ لـ 50
    userData.history.unshift({ type: 'WELCOME_GIFT', amount: 50, date: new Date().toISOString() });
    saveDB();
  }

  if (!db.welcomeSettings.channelId) return;
  try {
    const channel = member.guild.channels.cache.get(db.welcomeSettings.channelId);
    if (!channel) return;
    let title = db.welcomeSettings.title.replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{mention}/g, `<@${member.user.id}>`);
    let desc = db.welcomeSettings.description.replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{count}/g, member.guild.memberCount).replace(/{mention}/g, `<@${member.user.id}>`);
    const embed = new EmbedBuilder().setColor(parseInt(db.welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31);
    if (title.trim()) embed.setTitle(`${title}`);
    if (desc.trim()) embed.setDescription(`-# **${desc}**`);
    if (db.welcomeSettings.image && db.welcomeSettings.image.startsWith('http')) embed.setImage(db.welcomeSettings.image);
    await channel.send({ embeds: [embed] });
  } catch (e) {}
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !ALLOWED_GUILDS.includes(message.guild.id)) return;
  const args = message.content.split(' ');
  const command = args[0];

  if (command === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
    const member = message.mentions.members.first();
    const reason = args.slice(2).join(' ') || 'بدون سبب';
    if (!member) return message.reply('-# **يرجى منشن العضو للطرد.**');
    try { await member.kick(reason); message.reply({ embeds: [new EmbedBuilder().setTitle('تم الطرد').setDescription(`-# **تم طرد ${member.user.username} بنجاح.**`).setColor(0x2b2d31)] }); } catch (e) { message.reply('-# **فشل الطرد.**'); }
  }

  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    const durationStr = args[2]; 
    const reason = args.slice(3).join(' ') || 'بدون سبب';
    if (!member || !durationStr) return message.reply('-# **الاستخدام: تايم @عضو الوقت(10m/1h) السبب**');
    let duration = 0;
    if (durationStr.endsWith('m')) duration = parseInt(durationStr) * 60 * 1000;
    else if (durationStr.endsWith('h')) duration = parseInt(durationStr) * 60 * 60 * 1000;
    else if (durationStr.endsWith('d')) duration = parseInt(durationStr) * 24 * 60 * 60 * 1000;
    else return message.reply('-# **صيغة الوقت غير صحيحة.**');
    try { await member.timeout(duration, reason); message.reply({ embeds: [new EmbedBuilder().setTitle('تم التايم آوت').setDescription(`-# **تم إعطاء تايم آوت لـ ${member.user.username} لمدة ${durationStr}.**`).setColor(0x2b2d31)] }); } catch (e) { message.reply('-# **فشل التايم آوت.**'); }
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0 || amount > 100) return message.reply('-# **يرجى تحديد عدد الرسائل (1-100).**');
    try { await message.channel.bulkDelete(amount + 1); const msg = await message.channel.send({ embeds: [new EmbedBuilder().setTitle('تم الحذف').setDescription(`-# **تم حذف ${amount} رسالة.**`).setColor(0x2b2d31)] }); setTimeout(() => msg.delete().catch(() => {}), 3000); } catch (e) { message.reply('-# **فشل الحذف.**'); }
  }
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
      embeds: [new EmbedBuilder().setTitle('تذكرة دعم').setDescription(`-# **تذكرة دعم - ${interaction.user.username}**\n-# **اكتب طلب او مشكلتك بشكل واضح شوي و ان شاء الله بنرد عليك في اقرب وقت**`).setColor(0x2b2d31)], 
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
  const { commandName, options, user, subcommand } = interaction;
  const sub = options.getSubcommand(false);

  // --- Ticket Command ---
  if (commandName === 'ticket') {
    if (sub === 'panel') {
      const adminRoles = [options.getRole('admin1'), options.getRole('admin2'), options.getRole('admin3')].filter(r => r).map(r => r.id);
      const embed = new EmbedBuilder().setTitle('نظام التذاكر').setDescription('-# **اضغط على الزر لفتح تذكرة دعم.**\n-# **سيتم إنشاء قناة خاصة بك.**').setColor(0x2b2d31);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Secondary));
      const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
      if (adminRoles.length > 0) { db.panelAdminRoles[reply.id] = adminRoles; saveDB(); }
    } else if (sub === 'edit') {
      const title = options.getString('title');
      const desc = options.getString('description');
      const color = options.getString('color');
      await interaction.reply({ content: '-# **تم تحديث إعدادات لوحة التذاكر!**', ephemeral: true });
    }
  }

  // --- Welcome Command ---
  else if (commandName === 'welcome') {
    if (sub === 'set') {
      const channel = options.getChannel('channel');
      db.welcomeSettings.channelId = channel.id;
      saveDB();
      await interaction.reply({ content: `-# **تم تعيين روم الترحيب: ${channel}**` });
    } else if (sub === 'edit') {
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
    } else if (sub === 'test') {
      const targetUser = options.getUser('user') || user;
      const member = interaction.guild.members.cache.get(targetUser.id);
      client.emit('guildMemberAdd', member);
      await interaction.reply({ content: '-# **تم إرسال تجربة الترحيب.**', ephemeral: true });
    } else if (sub === 'info') {
      const embed = new EmbedBuilder()
        .setTitle('إعدادات الترحيب')
        .setDescription(`-# **الروم: <#${db.welcomeSettings.channelId || 'غير محدد'}>**\n-# **العنوان: ${db.welcomeSettings.title || 'افتراضي'}**\n-# **اللون: #${db.welcomeSettings.color}**`)
        .setColor(0x2b2d31);
      await interaction.reply({ embeds: [embed] });
    }
  }

  // --- Economy Command ---
  else if (commandName === 'economy') {
    if (sub === 'balance') {
      const userData = getUserData(user.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('رصيد الدينار').setDescription(`-# **رصيدك الحالي هو: ${userData.balance} دينار**`).setColor(0x2b2d31)] });
    
    // ---------------------- تعديل منطق التحويل والضرائب ----------------------
    } else if (sub === 'transfer') {
      const target = options.getUser('user');
      const amount = options.getInteger('amount');
      const senderData = getUserData(user.id);

      // تحقق من التحويل لنفس الشخص أو مبالغ غير منطقية (أقل من الحد الأدنى للضريبة)
      if (target.id === user.id) return interaction.reply({ content: '-# **لا يمكنك التحويل لنفسك.**', ephemeral: true });
      if (amount <= 1) return interaction.reply({ content: '-# **عذراً، المبلغ قليل جداً ولا يغطي الحد الأدنى للضريبة (1 دينار).**', ephemeral: true });
      if (senderData.balance < amount) return interaction.reply({ content: '-# **رصيدك غير كافي لإتمام التحويل.**', ephemeral: true });

      // حساب الضريبة التصاعدية
      let taxRate = 0;
      let taxPercentageString = "0%";

      if (amount < 1000) {
        taxRate = 0.05; // 5%
        taxPercentageString = "5%";
      } else if (amount >= 1000 && amount <= 4999) {
        taxRate = 0.10; // 10%
        taxPercentageString = "10%";
      } else {
        taxRate = 0.20; // 20%
        taxPercentageString = "20%";
      }

      let tax = Math.floor(amount * taxRate);
      
      // تطبيق الحد الأدنى للضريبة (1 دينار)
      tax = Math.max(tax, 1);

      const finalAmount = amount - tax;

      // تنفيذ العملية
      const receiverData = getUserData(target.id);
      senderData.balance -= amount; 
      receiverData.balance += finalAmount;
      
      senderData.history.unshift({ type: 'SENT', to: target.username, amount, tax, date: new Date().toISOString() });
      receiverData.history.unshift({ type: 'RECEIVED', from: user.username, amount: finalAmount, date: new Date().toISOString() });
      saveDB();

      // رسالة منسقة بوضوح
      const embed = new EmbedBuilder()
        .setTitle('✅ عملية تحويل ناجحة')
        .setColor(0x2b2d31)
        .addFields(
            { name: 'المبلغ المرسل', value: `${amount} دينار`, inline: true },
            { name: 'الضريبة المستقطعة', value: `${tax} دينار (${taxPercentageString})`, inline: true },
            { name: 'المبلغ الصافي للمستلم', value: `${finalAmount} دينار`, inline: true },
            { name: 'المرسل', value: `<@${user.id}>`, inline: true },
            { name: 'المستلم', value: `<@${target.id}>`, inline: true }
        )
        .setFooter({ text: `رصيدك الحالي: ${senderData.balance} دينار` });

      await interaction.reply({ embeds: [embed] });

    } else if (sub === 'top') {
      const sorted = Object.entries(db.users).sort(([, a], [, b]) => b.balance - a.balance).slice(0, 10);
      const desc = sorted.length > 0 ? sorted.map(([id, data], i) => `-# ** ${i + 1}. <@${id}>  ${data.balance} دينار**`).join('\n') : '-# **لا يوجد بيانات.**';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('قائمة الأغنياء').setDescription(`${desc}`).setColor(0x2b2d31)] });
    } else if (sub === 'history') {
      const userData = getUserData(user.id);
      const history = userData.history.slice(0, 10).map(h => `-# **[${h.type}] ${h.amount} دينار - ${new Date(h.date).toLocaleDateString()}**`).join('\n') || '-# **لا يوجد سجل.**';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('سجل التحويلات').setDescription(history).setColor(0x2b2d31)] });
    
    // ---------------------- تعديل أمر الإضافة (المركزية) ----------------------
    } else if (sub === 'add') {
      // التحقق من ID المالك فقط بدلاً من صلاحيات الأدمن
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '-# **❌ هذا الأمر مخصص لمالك البوت فقط (البنك المركزي).**', ephemeral: true });
      }

      const target = options.getUser('user');
      const amount = options.getInteger('amount');
      const targetData = getUserData(target.id);
      targetData.balance += amount;
      targetData.history.unshift({ type: 'ADMIN_ADD', amount, date: new Date().toISOString() });
      saveDB();
      await interaction.reply({ content: `-# **✅ تم إضافة ${amount} دينار إلى ${target} بواسطة البنك المركزي.**` });
    }
  }

  else if (commandName === 'bothelp') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('قائمة الأوامر')
      .setDescription('-# **/ticket panel** - إنشاء لوحة التذاكر\n-# **/welcome set** - تعيين روم الترحيب\n-# **/economy balance** - عرض الرصيد\n-# **/economy transfer** - تحويل الأموال\n-# **/economy top** - قائمة الأغنياء')
      .setColor(0x2b2d31);
    await interaction.reply({ embeds: [helpEmbed] });
  }
});

app.get('/', (req, res) => res.json({ status: 'online' }));
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  client.login(process.env.TOKEN).catch(() => process.exit(1));
});
