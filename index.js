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

const OWNER_ID = "YOUR_OWNER_ID_HERE"; // ⬅️⬅️ ضع الآيدي الخاص بك هنا
// ==================== 🔒 🔒 🔒 🔒 🔒 🔒 🔒 ====================

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

// تعديل: منح 50 دينار فورياً لأي مستخدم جديد يتم استدعاء بياناته
function getUserData(userId) {
  if (!db.users[userId]) { 
    db.users[userId] = { 
      balance: 50, // ⬅️ الرصيد الافتراضي 50 دينار
      history: [{ type: 'WELCOME_GIFT', amount: 50, date: new Date().toISOString() }] 
    }; 
    saveDB(); // حفظ فوري لضمان تسجيل الرصيد
  }
  return db.users[userId];
}

const activeTickets = new Map();

// --- تعريف الأوامر (Slash Commands) ---
const commands = [
  // أوامر الإدارة الجديدة
  {
    name: 'kick',
    description: 'طرد عضو من السيرفر',
    defaultMemberPermissions: PermissionsBitField.Flags.KickMembers, // الصلاحية المطلوبة
    options: [
      { name: 'user', description: 'العضو المراد طرده', type: 6, required: true },
      { name: 'reason', description: 'سبب الطرد', type: 3, required: false }
    ]
  },
  {
    name: 'timeout',
    description: 'إسكات عضو لفترة محددة (4h, 10m)',
    defaultMemberPermissions: PermissionsBitField.Flags.ModerateMembers, // الصلاحية المطلوبة
    options: [
      { name: 'user', description: 'العضو', type: 6, required: true },
      { name: 'duration', description: 'المدة (مثال: 10m, 4h, 1d)', type: 3, required: true },
      { name: 'reason', description: 'السبب', type: 3, required: false }
    ]
  },
  {
    name: 'clear',
    description: 'حذف عدد من الرسائل',
    defaultMemberPermissions: PermissionsBitField.Flags.ManageMessages, // الصلاحية المطلوبة
    options: [
      { name: 'amount', description: 'عدد الرسائل (1-100)', type: 4, required: true }
    ]
  },
  // بقية الأوامر
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
      },
      {
        name: 'edit', description: 'تعديل لوحة التذاكر', type: 1,
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
      { name: 'set', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }] },
      { name: 'edit', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'description', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'رابط الصورة', type: 3 }] },
      { name: 'test', description: 'تجربة رسالة الترحيب', type: 1, options: [{ name: 'user', description: 'العضو للتجربة', type: 6 }] },
      { name: 'info', description: 'عرض إعدادات الترحيب', type: 1 }
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
      { name: 'history', description: 'سجل التحويلات', type: 1 },
      { 
        name: 'add', description: 'إضافة دينار (للمالك فقط)', type: 1,
        options: [{ name: 'user', description: 'المستخدم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] 
      }
    ]
  }
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} جاهز والعملة تعمل!`);
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
  } catch (error) { console.error(error); }

  // نظام الزكاة
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

client.on('guildMemberAdd', async (member) => {
  if (!ALLOWED_GUILDS.includes(member.guild.id)) return;
  
  // التأكد من تسجيله وحصوله على الهدية
  getUserData(member.id);

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

// دالة مساعدة لتحويل النص (4h, 10m) إلى وقت
function parseDuration(str) {
    const unit = str.slice(-1).toLowerCase();
    const value = parseInt(str.slice(0, -1));
    if (isNaN(value)) return null;
    if (unit === 'm') return value * 60 * 1000;
    if (unit === 'h') return value * 60 * 60 * 1000;
    if (unit === 'd') return value * 24 * 60 * 60 * 1000;
    return null;
}

client.on('interactionCreate', async interaction => {
  if (interaction.guild && !ALLOWED_GUILDS.includes(interaction.guild.id)) return;
  
  // --- معالجة أزرار التذاكر ---
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
      return;
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, options, user, subcommand } = interaction;
  const sub = options.getSubcommand(false);

  // ==================== 🛠️ أوامر الإدارة الجديدة 🛠️ ====================
  
  if (commandName === 'kick') {
      const member = options.getMember('user');
      const reason = options.getString('reason') || 'بدون سبب';
      
      if (!member) return interaction.reply({ content: '-# **لم يتم العثور على العضو.**', ephemeral: true });
      if (!member.kickable) return interaction.reply({ content: '-# **لا يمكنني طرد هذا العضو (رتبته أعلى مني).**', ephemeral: true });

      try {
          await member.kick(reason);
          await interaction.reply({ 
              content: `-# ** تم طرد العضو ${member} احسن انطرد  كان غاثني من اول المسكين باي <a:Hiiiii:1470461001085354148>**` 
          });
      } catch (e) { interaction.reply({ content: '-# **حدث خطأ أثناء الطرد.**', ephemeral: true }); }
  }

  else if (commandName === 'timeout') {
      const member = options.getMember('user');
      const durationStr = options.getString('duration');
      const reason = options.getString('reason') || 'بدون سبب';
      const ms = parseDuration(durationStr);

      if (!member) return interaction.reply({ content: '-# **لم يتم العثور على العضو.**', ephemeral: true });
      if (!ms) return interaction.reply({ content: '-# **صيغة الوقت خاطئة. استخدم: 10m, 4h, 1d**', ephemeral: true });
      if (!member.moderatable) return interaction.reply({ content: '-# **لا يمكنني إسكات هذا العضو.**', ephemeral: true });

      try {
          await member.timeout(ms, reason);
          await interaction.reply({ 
              content: `-# **تم اسكات العضو ${member} ليش ما يستحي هو يارب ما يعيدها عشان ما يبلع مره ثانيه <a:DancingShark:1469030444774199439>**` 
          });
      } catch (e) { interaction.reply({ content: '-# **حدث خطأ أثناء التايم آوت.**', ephemeral: true }); }
  }

  else if (commandName === 'clear') {
      const amount = options.getInteger('amount');
      try {
          await interaction.channel.bulkDelete(amount);
          await interaction.reply({ content: `-# **تم حذف ${amount} رسالة.**`, ephemeral: true });
      } catch (e) { interaction.reply({ content: '-# **لا يمكن حذف الرسائل القديمة جداً (أكثر من 14 يوم) أو حدث خطأ.**', ephemeral: true }); }
  }

  // ==================== 💰 نظام الاقتصاد ====================
  
  else if (commandName === 'economy') {
    if (sub === 'balance') {
      const userData = getUserData(user.id);
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('رصيد الدينار').setDescription(`-# **رصيدك الحالي هو: ${userData.balance} دينار**`).setColor(0x2b2d31)] });
    } 
    
    else if (sub === 'transfer') {
      const target = options.getUser('user');
      const amount = options.getInteger('amount');
      const senderData = getUserData(user.id);

      if (target.id === user.id) return interaction.reply({ content: '-# **لا يمكنك التحويل لنفسك.**', ephemeral: true });
      if (amount <= 1) return interaction.reply({ content: '-# **عذراً، المبلغ قليل جداً ولا يغطي الحد الأدنى للضريبة.**', ephemeral: true });
      if (senderData.balance < amount) return interaction.reply({ content: '-# **رصيدك غير كافي.**', ephemeral: true });

      // حساب الضريبة
      let taxRate = 0;
      if (amount < 1000) taxRate = 0.05;
      else if (amount <= 4999) taxRate = 0.10;
      else taxRate = 0.20;

      let tax = Math.floor(amount * taxRate);
      tax = Math.max(tax, 1);
      const finalAmount = amount - tax;

      const receiverData = getUserData(target.id);
      senderData.balance -= amount; 
      receiverData.balance += finalAmount;
      
      senderData.history.unshift({ type: 'SENT', to: target.username, amount, tax, date: new Date().toISOString() });
      receiverData.history.unshift({ type: 'RECEIVED', from: user.username, amount: finalAmount, date: new Date().toISOString() });
      saveDB();

      // الرسالة بالشكل المطلوب بالضبط
      await interaction.reply({ 
          content: `-# **تم تحويل ${finalAmount}دينار لـ <@${target.id}> رصيدك الحالي ${senderData.balance} <a:moneywith_:1470458218953179237>**\n-# **(الضريبة المخصومة: ${tax} دينار)**`
      });
    } 
    
    else if (sub === 'top') {
      const sorted = Object.entries(db.users).sort(([, a], [, b]) => b.balance - a.balance).slice(0, 10);
      const desc = sorted.length > 0 ? sorted.map(([id, data], i) => `-# ** ${i + 1}. <@${id}>  ${data.balance} دينار**`).join('\n') : '-# **لا يوجد بيانات.**';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('قائمة الأغنياء').setDescription(`${desc}`).setColor(0x2b2d31)] });
    } 
    
    else if (sub === 'history') {
      const userData = getUserData(user.id);
      const history = userData.history.slice(0, 10).map(h => `-# **[${h.type}] ${h.amount} دينار - ${new Date(h.date).toLocaleDateString()}**`).join('\n') || '-# **لا يوجد سجل.**';
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle('سجل التحويلات').setDescription(history).setColor(0x2b2d31)] });
    } 
    
    else if (sub === 'add') {
      if (interaction.user.id !== OWNER_ID) return interaction.reply({ content: '-# **للمالك فقط.**', ephemeral: true });
      const target = options.getUser('user');
      const amount = options.getInteger('amount');
      const targetData = getUserData(target.id);
      targetData.balance += amount;
      targetData.history.unshift({ type: 'ADMIN_ADD', amount, date: new Date().toISOString() });
      saveDB();
      await interaction.reply({ content: `-# **✅ تم إضافة ${amount} دينار إلى ${target}**` });
    }
  }

  // --- بقية الأوامر (Ticket, Welcome, Bothelp) ---
  else if (commandName === 'ticket') {
    if (sub === 'panel') {
      const adminRoles = [options.getRole('admin1'), options.getRole('admin2'), options.getRole('admin3')].filter(r => r).map(r => r.id);
      const embed = new EmbedBuilder().setTitle('نظام التذاكر').setDescription('-# **اضغط على الزر لفتح تذكرة دعم.**').setColor(0x2b2d31);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Secondary));
      const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
      if (adminRoles.length > 0) { db.panelAdminRoles[reply.id] = adminRoles; saveDB(); }
    } else if (sub === 'edit') {
        await interaction.reply({ content: '-# **تم التحديث.**', ephemeral: true });
    }
  }
  else if (commandName === 'welcome') {
    if (sub === 'set') {
      db.welcomeSettings.channelId = options.getChannel('channel').id; saveDB();
      await interaction.reply({ content: `-# **تم تعيين الروم.**` });
    } else if (sub === 'edit') {
      if (options.getString('title')) db.welcomeSettings.title = options.getString('title');
      if (options.getString('description')) db.welcomeSettings.description = options.getString('description');
      if (options.getString('color')) db.welcomeSettings.color = options.getString('color').replace('#', '');
      if (options.getString('image')) db.welcomeSettings.image = options.getString('image');
      saveDB();
      await interaction.reply({ content: '-# **تم الحفظ.**', ephemeral: true });
    } else if (sub === 'test') {
      client.emit('guildMemberAdd', interaction.guild.members.cache.get((options.getUser('user') || user).id));
      await interaction.reply({ content: '-# **تم الإرسال.**', ephemeral: true });
    } else if (sub === 'info') {
      await interaction.reply({ content: `-# **القناة: <#${db.welcomeSettings.channelId}>**` });
    }
  }
  else if (commandName === 'bothelp') {
    await interaction.reply({ embeds: [new EmbedBuilder().setTitle('الأوامر').setDescription('-# **استخدم / لمعرفة الأوامر**').setColor(0x2b2d31)] });
  }
});

app.get('/', (req, res) => res.json({ status: 'online' }));
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  client.login(process.env.TOKEN).catch(() => process.exit(1));
});
