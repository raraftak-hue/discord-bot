require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cron = require('node-cron');

// ==================== 🔒 إعدادات الحماية 🔒 ====================
// إذا كانت القائمة فارغة، سيعمل البوت في جميع السيرفرات
const ALLOWED_GUILDS = process.env.ALLOWED_GUILDS ? process.env.ALLOWED_GUILDS.split(',') : [
  '1387902577496297523' // ID سيرفرك الافتراضي
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

// --- إعداد قاعدة بيانات MongoDB ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://raraftak_db_user:TzKcCxo9EvNDzBbj@cluster0.t4j2uux.mongodb.net/?appName=Cluster0';

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ متصل بقاعدة بيانات MongoDB'))
  .catch(err => {
    console.error('❌ فشل الاتصال بـ MongoDB:', err);
    // لا ننهي البوت هنا للسماح للمستخدم بتصحيح الرابط في .env
  });

// تعريف Schema البيانات
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0, min: 0 }, // منع الرصيد السالب
  history: { type: Array, default: [] }
});

const SettingsSchema = new mongoose.Schema({
  id: { type: String, default: 'global' },
  welcomeSettings: {
    channelId: { type: String, default: null },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    color: { type: String, default: '2b2d31' },
    image: { type: String, default: null }
  },
  panelAdminRoles: { type: Map, of: [String], default: {} }
});

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// وظائف مساعدة
async function getUserData(userId) {
  try {
    let user = await User.findOne({ userId });
    if (!user) {
      user = await User.create({ userId, balance: 10 });
    }
    return user;
  } catch (e) { console.error("Error fetching user data:", e); return null; }
}

async function getSettings() {
  try {
    let settings = await Settings.findOne({ id: 'global' });
    if (!settings) {
      settings = await Settings.create({ id: 'global' });
    }
    return settings;
  } catch (e) { console.error("Error fetching settings:", e); return null; }
}

const activeTickets = new Map();

const commands = [
  { 
    name: 'ticket', 
    description: 'إدارة نظام التذاكر', 
    options: [
      {
        name: 'panel',
        description: 'عرض لوحة التذاكر',
        type: 1,
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
      { name: 'test', description: 'تجربة رسالة الترحيب', type: 1 },
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
        description: 'إضافة دينار لمستخدم (للمسؤولين)', 
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
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN || '');
    if (process.env.TOKEN) {
      console.log('⏳ جاري تسجيل الأوامر...');
      await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
      console.log('✅ تم تسجيل الأوامر بنجاح!');
    }
  } catch (error) { console.error("Error registering commands:", error); }

  cron.schedule('0 0 * * 5', async () => {
    try {
      const users = await User.find({ balance: { $gt: 0 } });
      for (const user of users) {
        const zakat = Math.floor(user.balance * 0.025);
        if (zakat > 0) {
          user.balance -= zakat;
          user.history.unshift({ type: 'ZAKAT', amount: zakat, date: new Date().toISOString() });
          await user.save();
        }
      }
    } catch (e) { console.error("Zakat cron error:", e); }
  });
});

client.on('guildMemberAdd', async (member) => {
  if (ALLOWED_GUILDS.length > 0 && !ALLOWED_GUILDS.includes(member.guild.id)) return;
  await getUserData(member.id);
  const settings = await getSettings();
  if (!settings || !settings.welcomeSettings.channelId) return;
  try {
    const channel = member.guild.channels.cache.get(settings.welcomeSettings.channelId);
    if (!channel) return;
    let title = (settings.welcomeSettings.title || '').replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{mention}/g, `<@${member.user.id}>`);
    let desc = (settings.welcomeSettings.description || '').replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{count}/g, member.guild.memberCount).replace(/{mention}/g, `<@${member.user.id}>`);
    const embed = new EmbedBuilder().setColor(parseInt((settings.welcomeSettings.color || '2b2d31').replace('#', ''), 16) || 0x2b2d31);
    if (title.trim()) embed.setTitle(`${title}`);
    if (desc.trim()) embed.setDescription(`-# **${desc}**`);
    if (settings.welcomeSettings.image && settings.welcomeSettings.image.startsWith('http')) embed.setImage(settings.welcomeSettings.image);
    await channel.send({ embeds: [embed] });
  } catch (e) { console.error("Welcome message error:", e); }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.guild && ALLOWED_GUILDS.length > 0 && !ALLOWED_GUILDS.includes(interaction.guild.id)) return;
    const settings = await getSettings();
    if (!settings) return;

    if (interaction.isButton() && interaction.customId === 'open_ticket') {
      if (activeTickets.has(interaction.user.id)) return interaction.reply({ content: '-# **لديك تذكرة مفتوحة.**', ephemeral: true });
      const adminRoles = settings.panelAdminRoles.get(interaction.message.id) || [];
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
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options, user } = interaction;
    const sub = options.getSubcommand(false);

    if (commandName === 'ticket' && sub === 'panel') {
      const adminRoles = [options.getRole('admin1'), options.getRole('admin2'), options.getRole('admin3')].filter(r => r).map(r => r.id);
      const embed = new EmbedBuilder().setTitle('نظام التذاكر').setDescription('-# **اضغط على الزر لفتح تذكرة دعم.**\n-# **سيتم إنشاء قناة خاصة بك.**').setColor(0x2b2d31);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Secondary));
      const reply = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
      if (adminRoles.length > 0) {
        settings.panelAdminRoles.set(reply.id, adminRoles);
        await settings.save();
      }
    }

    else if (commandName === 'welcome') {
      if (sub === 'set') {
        const channel = options.getChannel('channel');
        settings.welcomeSettings.channelId = channel.id;
        await settings.save();
        await interaction.reply({ content: `-# **تم تعيين روم الترحيب: ${channel}**` });
      } else if (sub === 'edit') {
        const title = options.getString('title');
        const desc = options.getString('description');
        const color = options.getString('color');
        const image = options.getString('image');
        if (title !== null) settings.welcomeSettings.title = title;
        if (desc !== null) settings.welcomeSettings.description = desc;
        if (color) settings.welcomeSettings.color = color.replace('#', '');
        if (image !== null) settings.welcomeSettings.image = image;
        await settings.save();
        await interaction.reply({ content: '-# **تم تحديث إعدادات الترحيب!**', ephemeral: true });
      } else if (sub === 'test') {
        const member = interaction.member;
        const channelId = settings.welcomeSettings.channelId;
        if (!channelId) return interaction.reply({ content: '-# **لم يتم تعيين روم الترحيب بعد.**', ephemeral: true });
        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) return interaction.reply({ content: '-# **روم الترحيب غير موجود.**', ephemeral: true });
        
        let title = (settings.welcomeSettings.title || '').replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{mention}/g, `<@${member.user.id}>`);
        let desc = (settings.welcomeSettings.description || '').replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{count}/g, member.guild.memberCount).replace(/{mention}/g, `<@${member.user.id}>`);
        const embed = new EmbedBuilder().setColor(parseInt((settings.welcomeSettings.color || '2b2d31').replace('#', ''), 16) || 0x2b2d31);
        if (title.trim()) embed.setTitle(`${title}`);
        if (desc.trim()) embed.setDescription(`-# **${desc}**`);
        if (settings.welcomeSettings.image && settings.welcomeSettings.image.startsWith('http')) embed.setImage(settings.welcomeSettings.image);
        await channel.send({ embeds: [embed] });
        await interaction.reply({ content: '-# **تم إرسال رسالة تجريبية!**', ephemeral: true });
      } else if (sub === 'info') {
        const embed = new EmbedBuilder()
          .setTitle('إعدادات الترحيب')
          .addFields(
            { name: 'روم الترحيب', value: settings.welcomeSettings.channelId ? `<#${settings.welcomeSettings.channelId}>` : 'غير محدد', inline: true },
            { name: 'اللون', value: `#${settings.welcomeSettings.color}`, inline: true },
            { name: 'العنوان', value: settings.welcomeSettings.title || 'لا يوجد', inline: false },
            { name: 'الوصف', value: settings.welcomeSettings.description || 'لا يوجد', inline: false }
          )
          .setColor(0x2b2d31);
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }

    else if (commandName === 'economy') {
      const userData = await getUserData(user.id);
      if (!userData) return interaction.reply({ content: "Error accessing database.", ephemeral: true });
      
      if (sub === 'balance') {
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('رصيد الدينار').setDescription(`-# **رصيدك الحالي هو: ${userData.balance} دينار**`).setColor(0x2b2d31)] });
      } else if (sub === 'transfer') {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        
        if (amount <= 0) return interaction.reply({ content: '-# **المبلغ يجب أن يكون أكبر من صفر.**', ephemeral: true });
        if (userData.balance < amount) return interaction.reply({ content: '-# **ليس لديك رصيد كافٍ.**', ephemeral: true });
        if (target.id === user.id) return interaction.reply({ content: '-# **لا يمكنك التحويل لنفسك.**', ephemeral: true });
        if (target.bot) return interaction.reply({ content: '-# **لا يمكنك التحويل للبوتات.**', ephemeral: true });

        let tax = Math.ceil(amount * 0.05); if (tax < 1) tax = 1;
        const finalAmount = amount - tax;
        const targetData = await getUserData(target.id);
        if (!targetData) return interaction.reply({ content: "Error accessing target user.", ephemeral: true });
        
        userData.balance -= amount;
        targetData.balance += finalAmount;
        userData.history.unshift({ type: 'SENT', to: target.username, amount, tax, date: new Date().toISOString() });
        targetData.history.unshift({ type: 'RECEIVED', from: user.username, amount: finalAmount, date: new Date().toISOString() });
        await userData.save(); await targetData.save();
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('عملية تحويل ناجحة').setDescription(`-# **تم التحويل ${finalAmount} دينار لـ <@${target.id}> رصيدك الحالي (${userData.balance}) <:money_with_wings:1388212679981666334>**\n\n-# **الضريبة (${tax})**`).setColor(0x2b2d31)] });
      } else if (sub === 'top') {
        const sorted = await User.find().sort({ balance: -1 }).limit(10);
        const desc = sorted.length > 0 ? sorted.map((u, i) => `-# ** ${i + 1}. <@${u.userId}>  ${u.balance} دينار**`).join('\n') : '-# **لا يوجد بيانات.**';
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('قائمة الأغنياء').setDescription(`${desc}`).setColor(0x2b2d31)] });
      } else if (sub === 'history') {
        const history = userData.history.slice(0, 10);
        const desc = history.length > 0 ? history.map(h => {
          if (h.type === 'SENT') return `📤 أرسلت ${h.amount} إلى ${h.to} (ضريبة: ${h.tax})`;
          if (h.type === 'RECEIVED') return `📥 استلمت ${h.amount} من ${h.from}`;
          if (h.type === 'ZAKAT') return `🕌 زكاة: ${h.amount}`;
          if (h.type === 'ADMIN_ADD') return `💰 إضافة إدارية: ${h.amount}`;
          return `❓ عملية غير معروفة`;
        }).join('\n') : 'لا يوجد سجل عمليات.';
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('سجل العمليات').setDescription(desc).setColor(0x2b2d31)] });
      } else if (sub === 'add') {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '-# **للمسؤولين فقط.**', ephemeral: true });
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        const targetData = await getUserData(target.id);
        if (!targetData) return interaction.reply({ content: "Error accessing user.", ephemeral: true });
        targetData.balance += amount;
        targetData.history.unshift({ type: 'ADMIN_ADD', amount, date: new Date().toISOString() });
        await targetData.save();
        await interaction.reply({ content: `-# **تم إضافة ${amount} دينار إلى ${target}**` });
      }
    }
    else if (commandName === 'bothelp') {
      const embed = new EmbedBuilder()
        .setTitle('قائمة الأوامر')
        .setDescription('إليك قائمة بجميع الأوامر المتاحة في البوت:')
        .addFields(
          { name: '🎫 /ticket panel', value: 'إنشاء لوحة التذاكر' },
          { name: '👋 /welcome set', value: 'تعيين روم الترحيب' },
          { name: '📝 /welcome edit', value: 'تعديل رسالة الترحيب' },
          { name: '💰 /economy balance', value: 'عرض رصيدك' },
          { name: '💸 /economy transfer', value: 'تحويل رصيد' },
          { name: '🏆 /economy top', value: 'قائمة الأغنياء' },
          { name: '📜 /economy history', value: 'سجل العمليات' }
        )
        .setColor(0x2b2d31);
      await interaction.reply({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'An error occurred while processing this command.', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: 'An error occurred while processing this command.', ephemeral: true }).catch(() => {});
    }
  }
});

app.get('/', (req, res) => res.json({ status: 'online' }));
app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log("Web server listening on port", process.env.PORT || 3000);
  if (process.env.TOKEN) {
    client.login(process.env.TOKEN).catch(e => {
      console.error("Login failed:", e);
    });
  } else {
    console.error("TOKEN environment variable is missing!");
  }
});
