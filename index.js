const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();

// ==================== 🔒 إعدادات الحماية 🔒 ====================
const ALLOWED_GUILDS = ['1387902577496297523'];
// ==================== 🔒 🔒 🔒 🔒 🔒 🔒 🔒 ====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

const welcomeSettings = {
  channelId: null,
  title: '',
  description: '',
  color: '2b2d31',
  image: null
};

const panelAdminRoles = new Map();
const activeTickets = new Map();

// ==================== 📁 نظام تخزين البيانات 📁 ====================
const fs = require('fs');
const path = require('path');
const DATA_FILE = path.join(__dirname, 'economy_data.json');

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return { users: {}, sabobas: {}, zakatFund: { balance: 0 } };
    }
  }
  return { users: {}, sabobas: {}, zakatFund: { balance: 0 } };
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('خطأ في حفظ البيانات:', error);
  }
}

let economyData = loadData();
setInterval(() => saveData(economyData), 30000);
// ==================== 📁 📁 📁 📁 📁 📁 📁 ====================

// ==================== 💰 نظام الاقتصاد 💰 ====================
class EconomySystem {
  getBalance(userId) {
    if (!economyData.users[userId]) {
      economyData.users[userId] = { balance: 100, history: [] };
    }
    return economyData.users[userId].balance;
  }
  
  addBalance(userId, amount, reason = '') {
    const user = economyData.users[userId] || { balance: 100, history: [] };
    user.balance += amount;
    user.history.push({
      type: 'إضافة',
      amount: amount,
      reason: reason,
      date: new Date().toLocaleString('ar-SA'),
      balance: user.balance
    });
    economyData.users[userId] = user;
    return user.balance;
  }
  
  transferBalance(senderId, receiverId, amount) {
    if (this.getBalance(senderId) < amount) {
      throw new Error('رصيدك غير كافي');
    }
    
    const zakat = Math.floor(amount * 0.025);
    const netAmount = amount - zakat;
    
    const sender = economyData.users[senderId];
    sender.balance -= amount;
    sender.history.push({
      type: 'تحويل',
      amount: -amount,
      to: receiverId,
      zakat: zakat,
      date: new Date().toLocaleString('ar-SA'),
      balance: sender.balance
    });
    
    let receiver = economyData.users[receiverId];
    if (!receiver) {
      receiver = { balance: 100, history: [] };
    }
    receiver.balance += netAmount;
    receiver.history.push({
      type: 'استلام',
      amount: netAmount,
      from: senderId,
      date: new Date().toLocaleString('ar-SA'),
      balance: receiver.balance
    });
    
    economyData.users[senderId] = sender;
    economyData.users[receiverId] = receiver;
    
    economyData.zakatFund.balance += zakat;
    economyData.zakatFund.history = economyData.zakatFund.history || [];
    economyData.zakatFund.history.push({
      from: senderId,
      amount: zakat,
      date: new Date().toLocaleString('ar-SA')
    });
    
    return {
      from: sender.balance,
      to: receiver.balance,
      zakat: zakat
    };
  }
  
  getHistory(userId, limit = 10) {
    const user = economyData.users[userId];
    if (!user || !user.history) return [];
    return user.history.slice(-limit).reverse();
  }
  
  topUsers(limit = 10) {
    const users = Object.entries(economyData.users)
      .map(([id, data]) => ({ id, balance: data.balance }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit);
    return users;
  }
  
  createSaboba(creatorId, goal, reason) {
    const sabobaId = Date.now().toString();
    economyData.sabobas[sabobaId] = {
      creator: creatorId,
      goal: goal,
      collected: 0,
      reason: reason,
      members: {},
      createdAt: Date.now()
    };
    return sabobaId;
  }
  
  donateToSaboba(userId, sabobaId, amount) {
    if (this.getBalance(userId) < amount) {
      throw new Error('رصيدك غير كافي');
    }
    
    const saboba = economyData.sabobas[sabobaId];
    if (!saboba) {
      throw new Error('السبوبة غير موجودة');
    }
    
    economyData.users[userId].balance -= amount;
    saboba.collected += amount;
    
    if (!saboba.members[userId]) {
      saboba.members[userId] = 0;
    }
    saboba.members[userId] += amount;
    
    economyData.users[userId].history.push({
      type: 'تبرع_سبوبة',
      amount: -amount,
      sabobaId: sabobaId,
      date: new Date().toLocaleString('ar-SA')
    });
    
    return saboba;
  }
  
  getActiveSabobas() {
    return Object.entries(economyData.sabobas)
      .filter(([_, saboba]) => saboba.collected < saboba.goal)
      .map(([id, saboba]) => ({ id, ...saboba }));
  }
}

const economy = new EconomySystem();
// ==================== 💰 💰 💰 💰 💰 💰 💰 ====================

// ==================== 📋 الأوامر 📋 ====================
const commands = [
  {
    name: 'ticketpanel',
    description: 'عرض لوحة التذاكر',
    options: [
      { name: 'admin1', description: 'رتبة الإدارة الأولى', type: 8, required: false },
      { name: 'admin2', description: 'رتبة الإدارة الثانية', type: 8, required: false },
      { name: 'admin3', description: 'رتبة الإدارة الثالثة', type: 8, required: false }
    ]
  },
  {
    name: 'ticketedit',
    description: 'تعديل لوحة التذاكر',
    options: [
      { name: 'title', description: 'عنوان جديد', type: 3, required: false },
      { name: 'description', description: 'وصف جديد', type: 3, required: false },
      { name: 'color', description: 'لون جديد', type: 3, required: false }
    ]
  },
  {
    name: 'welcomeset',
    description: 'تعيين روم الترحيب',
    options: [
      { name: 'channel', description: 'روم الترحيب', type: 7, required: true }
    ]
  },
  {
    name: 'welcomeedit',
    description: 'تعديل رسالة الترحيب',
    options: [
      { name: 'title', description: 'العنوان', type: 3, required: false },
      { name: 'description', description: 'الوصف', type: 3, required: false },
      { name: 'color', description: 'اللون (#2b2d31)', type: 3, required: false },
      { name: 'image', description: 'رابط صورة خلفية', type: 3, required: false }
    ]
  },
  {
    name: 'welcometest',
    description: 'تجربة رسالة الترحيب',
    options: [
      { name: 'user', description: 'لعضو للتجربة', type: 6, required: false }
    ]
  },
  {
    name: 'welcomeinfo',
    description: 'عرض إعدادات الترحيب'
  },
  {
    name: 'bothelp',
    description: 'عرض جميع الأوامر'
  },
  {
    name: 'رصيدي',
    description: 'عرض رصيدك من الدينار'
  },
  {
    name: 'حول',
    description: 'تحويل دينار لعضو آخر',
    options: [
      { name: 'الشخص', description: 'الشخص اللي تبي تحول له', type: 6, required: true },
      { name: 'المبلغ', description: 'كمية الدينار', type: 4, required: true, min_value: 1 }
    ]
  },
  {
    name: 'سجلي',
    description: 'عرض سجل معاملاتك'
  },
  {
    name: 'الأعلى',
    description: 'أعلى الأعضاء رصيداً'
  },
  {
    name: 'سبوبة',
    description: 'بدء سبوبة جديدة',
    options: [
      { name: 'الهدف', description: 'المبلغ المطلوب', type: 4, required: true, min_value: 100 },
      { name: 'السبب', description: 'سبب السبوبة', type: 3, required: true }
    ]
  },
  {
    name: 'تبرع',
    description: 'التبرع لسبوبة',
    options: [
      { name: 'السبوبة', description: 'رقم السبوبة', type: 3, required: true },
      { name: 'المبلغ', description: 'المبلغ المتبرع به', type: 4, required: true, min_value: 10 }
    ]
  },
  {
    name: 'السبوبات',
    description: 'عرض السبوبات النشطة'
  }
];

// ==================== 🔒 حدث الحماية 🔒 ====================
client.on('guildCreate', async guild => {
  if (!ALLOWED_GUILDS.includes(guild.id)) {
    console.log(`🚫 ${guild.name} (${guild.id}) حاول يضيف البوت!`);
    
    try {
      const owner = await guild.fetchOwner();
      const embed = new EmbedBuilder()
        .setTitle('البوت خاص')
        .setDescription('-# **هذا البوت خاص و لن يعمل في خادمك الا اذا تواصلت مع سيرفر المطور الذي في الـ بايو لكي يسمح لك مجانا او مدفوع**\n\n-# **البوت سوف يخرج نفسه من السيرفر في غضون ١٠ ثوان**')
        .setColor(0x2b2d31);
      
      await owner.send({ embeds: [embed] });
      console.log(`📩 أرسلت رسالة تحذير لمالك ${guild.name}`);
    } catch (err) {
      console.log('❌ ما قدرت أرسل رسالة للمالك');
    }
    
    setTimeout(async () => {
      await guild.leave();
      console.log(`✅ طلعت من ${guild.name}`);
    }, 10000);
  }
});

// ==================== 🚀 البوت جاهز 🚀 ====================
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} جاهز!`);
  console.log(`📊 السيرفرات المصرحة: ${ALLOWED_GUILDS.length} سيرفر`);
  
  client.guilds.cache.forEach(guild => {
    if (ALLOWED_GUILDS.includes(guild.id)) {
      console.log(`✅ ${guild.name} (${guild.memberCount} أعضاء)`);
    }
  });
  
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`✅ تم تسجيل ${commands.length} أوامر`);
  } catch (error) {
    console.error('❌ خطأ في تسجيل الأوامر:', error);
  }
});

// ==================== 👋 حدث الترحيب 👋 ====================
client.on('guildMemberAdd', async (member) => {
  if (!welcomeSettings.channelId || !ALLOWED_GUILDS.includes(member.guild.id)) return;
  
  try {
    const channel = member.guild.channels.cache.get(welcomeSettings.channelId);
    if (!channel) return;

    let title = welcomeSettings.title
      .replace(/{user}/g, member.user.username)
      .replace(/{server}/g, member.guild.name)
      .replace(/{mention}/g, `<@${member.user.id}>`);
    
    let description = welcomeSettings.description
      .replace(/{user}/g, member.user.username)
      .replace(/{server}/g, member.guild.name)
      .replace(/{count}/g, member.guild.memberCount)
      .replace(/{mention}/g, `<@${member.user.id}>`);

    const welcomeEmbed = new EmbedBuilder()
      .setColor(parseInt(welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31);

    if (title.trim()) welcomeEmbed.setTitle(title);
    if (description.trim()) welcomeEmbed.setDescription(description);
    
    if (welcomeSettings.image && welcomeSettings.image.startsWith('http')) {
      welcomeEmbed.setImage(welcomeSettings.image);
    }

    await channel.send({ 
      content: '',
      embeds: [welcomeEmbed] 
    });
    
  } catch (error) {
    console.error('❌ خطأ في الترحيب:', error);
  }
});

// ==================== ⚡ تفاعلات الأوامر ⚡ ====================
client.on('interactionCreate', async interaction => {
  if (interaction.guild && !ALLOWED_GUILDS.includes(interaction.guild.id)) return;
  
  // ========== 🎫 نظام التذاكر ==========
  if (interaction.isButton() && interaction.customId === 'open_ticket') {
    if (activeTickets.has(interaction.user.id)) {
      return interaction.reply({ content: 'لديك تذكرة مفتوحة.', ephemeral: true });
    }

    const adminRoles = panelAdminRoles.get(interaction.message.id) || [];
    
    const ticketChannel = await interaction.guild.channels.create({
      name: `تذكرة-${interaction.user.username}`,
      type: ChannelType.GuildText,
      parent: interaction.channel.parentId,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
        ...adminRoles.map(roleId => ({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
      ],
    });

    activeTickets.set(interaction.user.id, ticketChannel.id);

    const mentions = `${interaction.user}${adminRoles.length > 0 ? `\n${adminRoles.map(id => `<@&${id}>`).join(' ')}` : ''}`;
    
    await ticketChannel.send({ 
      content: mentions, 
      embeds: [new EmbedBuilder()
        .setTitle(`تذكرة دعم - ${interaction.user.username}`)
        .setDescription('-# اكتب طلب او مشكلتك بشكل واضح شوي و ان شاء الله بنرد عليك في اقرب وقت')
        .setColor(0x2b2d31)
        .setTimestamp()], 
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger)
      )] 
    });

    return interaction.reply({ content: `تم إنشاء تذكرتك: ${ticketChannel}`, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    if (!interaction.channel.name.startsWith('تذكرة-')) {
      return interaction.reply({ content: 'هذا الزر يعمل فقط في قنوات التذاكر.', ephemeral: true });
    }

    for (const [userId, channelId] of activeTickets.entries()) {
      if (channelId === interaction.channel.id) {
        activeTickets.delete(userId);
        break;
      }
    }

    await interaction.reply({ content: 'سيتم إغلاق التذكرة خلال 5 ثواني.' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }

  if (!interaction.isChatInputCommand()) return;

  // 🎫 ticketpanel
  if (interaction.commandName === 'ticketpanel') {
    const adminRoles = [
      interaction.options.getRole('admin1'),
      interaction.options.getRole('admin2'),
      interaction.options.getRole('admin3')
    ].filter(r => r).map(r => r.id);

    const embed = new EmbedBuilder()
      .setTitle('🎫 نظام التذاكر')
      .setDescription('اضغط على الزر لفتح تذكرة دعم.\nسيتم إنشاء قناة خاصة بك.')
      .setColor(0x2b2d31);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_ticket')
        .setLabel('فتح تذكرة')
        .setStyle(ButtonStyle.Secondary)
    );

    const reply = await interaction.reply({ 
      embeds: [embed], 
      components: [row], 
      fetchReply: true 
    });

    if (adminRoles.length > 0) {
      panelAdminRoles.set(reply.id, adminRoles);
      await interaction.followUp({ 
        content: `✅ تم إضافة رتب الإدارة.`,
        ephemeral: true 
      });
    }
  }

  // 🎫 ticketedit
  else if (interaction.commandName === 'ticketedit') {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color');

    const embedColor = color ? parseInt(color.replace('#',''),16) : 0x2b2d31;

    const embed = new EmbedBuilder()
      .setTitle(title || '🎫 نظام التذاكر')
      .setDescription(description || 'اضغط على الزر لفتح تذكرة دعم.\nسيتم إنشاء قناة خاصة بك.')
      .setColor(embedColor);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_ticket')
        .setLabel('فتح تذكرة')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ 
      embeds: [embed], 
      components: [row] 
    });
  }

  // 👋 welcomeset
  else if (interaction.commandName === 'welcomeset') {
    const channel = interaction.options.getChannel('channel');
    welcomeSettings.channelId = channel.id;
    
    await interaction.reply({ 
      content: `✅ تم تعيين روم الترحيب: ${channel}`,
      ephemeral: false 
    });
  }

  // 👋 welcomeedit
  else if (interaction.commandName === 'welcomeedit') {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color');
    const image = interaction.options.getString('image');

    if (title !== null) welcomeSettings.title = title;
    if (description !== null) welcomeSettings.description = description;
    if (color) welcomeSettings.color = color.startsWith('#') ? color.replace('#', '') : color;
    if (image !== null) welcomeSettings.image = image;

    await interaction.reply({ 
      content: `✅ تم تحديث إعدادات الترحيب!`,
      ephemeral: true 
    });
  }

  // 👋 welcometest
  else if (interaction.commandName === 'welcometest') {
    if (!welcomeSettings.channelId) {
      return interaction.reply({ 
        content: '❌ لم يتم تعيين روم الترحيب بعد.\nاستخدم `/welcomeset` أولاً.',
        ephemeral: true 
      });
    }

    const user = interaction.options.getUser('user') || interaction.user;
    const channel = interaction.guild.channels.cache.get(welcomeSettings.channelId);
    
    if (!channel) {
      return interaction.reply({ 
        content: '❌ روم الترحيب غير موجود.',
        ephemeral: true 
      });
    }

    let title = welcomeSettings.title
      .replace(/{user}/g, user.username)
      .replace(/{server}/g, interaction.guild.name)
      .replace(/{mention}/g, `<@${user.id}>`);
    
    let description = welcomeSettings.description
      .replace(/{user}/g, user.username)
      .replace(/{server}/g, interaction.guild.name)
      .replace(/{count}/g, interaction.guild.memberCount)
      .replace(/{mention}/g, `<@${user.id}>`);

    const testEmbed = new EmbedBuilder()
      .setColor(parseInt(welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31);

    if (title.trim()) testEmbed.setTitle(title);
    if (description.trim()) testEmbed.setDescription(description);
    if (welcomeSettings.image && welcomeSettings.image.startsWith('http')) {
      testEmbed.setImage(welcomeSettings.image);
    }

    await channel.send({ 
      content: '',
      embeds: [testEmbed] 
    });

    await interaction.reply({ 
      content: `✅ تم إرسال رسالة ترحيب تجريبية.`,
      ephemeral: true 
    });
  }

  // 👋 welcomeinfo
  else if (interaction.commandName === 'welcomeinfo') {
    const channel = welcomeSettings.channelId ? 
      interaction.guild.channels.cache.get(welcomeSettings.channelId) : null;
    
    const infoEmbed = new EmbedBuilder()
      .setTitle('إعدادات الترحيب')
      .setColor(0x2b2d31)
      .addFields(
        { name: '📌 الروم', value: channel ? `${channel}` : '❌ غير معين', inline: true },
        { name: '🎨 اللون', value: `#${welcomeSettings.color}`, inline: true },
        { name: '🖼️ صورة', value: welcomeSettings.image ? '✅ معين' : '❌ غير معين', inline: true }
      );

    await interaction.reply({ 
      embeds: [infoEmbed],
      ephemeral: true 
    });
  }

  // 🛠️ bothelp
  else if (interaction.commandName === 'bothelp') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('أوامر البوت')
      .setColor(0x2b2d31)
      .addFields(
        { 
          name: 'التذاكر', 
          value: '`/ticketpanel` - عرض لوحة التذاكر\n`/ticketedit` - تعديل لوحة التذاكر'
        },
        { 
          name: 'الترحيب', 
          value: '`/welcomeset` - تعيين روم الترحيب\n`/welcomeedit` - تعديل رسالة الترحيب\n`/welcometest` - تجربة الترحيب\n`/welcomeinfo` - عرض الإعدادات'
        },
        { 
          name: 'الاقتصاد', 
          value: '`/رصيدي` - عرض رصيدك\n`/حول` - تحويل دينار\n`/سجلي` - سجل المعاملات\n`/الأعلى` - أعلى الأعضاء\n`/سبوبة` - بدء سبوبة\n`/تبرع` - تبرع لسبوبة\n`/السبوبات` - عرض السبوبات'
        }
      );

    await interaction.reply({ 
      embeds: [helpEmbed],
      ephemeral: true 
    });
  }

  // ========== 💰 نظام الاقتصاد ==========
  // 💰 رصيدي
  else if (interaction.commandName === 'رصيدي') {
    const balance = economy.getBalance(interaction.user.id);
    const history = economy.getHistory(interaction.user.id, 1);
    
    const embed = new EmbedBuilder()
      .setTitle('رصيد الدينار')
      .setColor(0x2b2d31)
      .addFields(
        { name: 'الرصيد الحالي', value: `**${balance}** دينار`, inline: true }
      );
    
    if (history.length > 0) {
      embed.addFields({ 
        name: 'آخر عملية', 
        value: `${history[0].type}: **${history[0].amount}** دينار`, 
        inline: true 
      });
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 💰 حول
  else if (interaction.commandName === 'حول') {
    const targetUser = interaction.options.getUser('الشخص');
    const amount = interaction.options.getInteger('المبلغ');
    
    try {
      const result = economy.transferBalance(interaction.user.id, targetUser.id, amount);
      
      const embed = new EmbedBuilder()
        .setTitle('تم التحويل بنجاح')
        .setColor(0x2b2d31)
        .addFields(
          { name: 'المبلغ المحول', value: `**${amount}** دينار`, inline: true },
          { name: 'المستلم', value: `${targetUser}`, inline: true },
          { name: 'رصيدك الجديد', value: `**${result.from}** دينار`, inline: true },
          { name: 'رصيده الجديد', value: `**${result.to}** دينار`, inline: true },
          { name: 'الزكاة', value: `**${result.zakat}** دينار (2.5%)`, inline: true }
        );
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }
  }

  // 💰 سجلي
  else if (interaction.commandName === 'سجلي') {
    const history = economy.getHistory(interaction.user.id, 10);
    
    const embed = new EmbedBuilder()
      .setTitle('سجل معاملاتك')
      .setColor(0x2b2d31);
    
    if (history.length === 0) {
      embed.setDescription('لا توجد معاملات سابقة');
    } else {
      const historyText = history.map(record => 
        `**${record.type}**: ${record.amount} دينار\n*${record.date}*`
      ).join('\n\n');
      embed.setDescription(historyText);
    }
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // 💰 الأعلى
  else if (interaction.commandName === 'الأعلى') {
    const top = economy.topUsers(10);
    
    const embed = new EmbedBuilder()
      .setTitle('أعلى الأعضاء رصيداً')
      .setColor(0x2b2d31)
      .setDescription(
        top.map((user, index) => 
          `${index + 1}. <@${user.id}> - **${user.balance}** دينار`
        ).join('\n')
      );
    
    await interaction.reply({ embeds: [embed] });
  }

  // 💰 سبوبة
  else if (interaction.commandName === 'سبوبة') {
    const goal = interaction.options.getInteger('الهدف');
    const reason = interaction.options.getString('السبب');
    
    const sabobaId = economy.createSaboba(interaction.user.id, goal, reason);
    
    const embed = new EmbedBuilder()
      .setTitle('سبوبة جديدة')
      .setColor(0x2b2d31)
      .addFields(
        { name: 'رقم السبوبة', value: `**${sabobaId}**`, inline: true },
        { name: 'الهدف', value: `**${goal}** دينار`, inline: true },
        { name: 'السبب', value: reason, inline: false },
        { name: 'المنشئ', value: `${interaction.user}`, inline: true },
        { name: 'المجموع', value: `0/${goal} دينار`, inline: true }
      )
      .setFooter({ text: 'استخدم /تبرع للمساهمة' });
    
    await interaction.reply({ embeds: [embed] });
  }

  // 💰 تبرع
  else if (interaction.commandName === 'تبرع') {
    const sabobaId = interaction.options.getString('السبوبة');
    const amount = interaction.options.getInteger('المبلغ');
    
    try {
      const saboba = economy.donateToSaboba(interaction.user.id, sabobaId, amount);
      
      const embed = new EmbedBuilder()
        .setTitle('تم التبرع بنجاح')
        .setColor(0x2b2d31)
        .addFields(
          { name: 'المتبرع', value: `${interaction.user}`, inline: true },
          { name: 'المبلغ', value: `**${amount}** دينار`, inline: true },
          { name: 'رقم السبوبة', value: sabobaId, inline: true },
          { name: 'المجموع الحالي', value: `**${saboba.collected}/${saboba.goal}** دينار`, inline: true },
          { name: 'المتبقي', value: `**${saboba.goal - saboba.collected}** دينار`, inline: true }
        );
      
      if (saboba.collected >= saboba.goal) {
        embed.addFields({ name: '🎉 حالة', value: 'اكتملت السبوبة!', inline: true });
      }
      
      await interaction.reply({ embeds: [embed] });
    } catch (error) {
      await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }
  }

  // 💰 السبوبات
  else if (interaction.commandName === 'السبوبات') {
    const sabobas = economy.getActiveSabobas();
    
    const embed = new EmbedBuilder()
      .setTitle('السبوبات النشطة')
      .setColor(0x2b2d31);
    
    if (sabobas.length === 0) {
      embed.setDescription('لا توجد سبوبات نشطة حالياً');
    } else {
      const sabobasText = sabobas.map(s => 
        `**#${s.id}**\nالسبب: ${s.reason}\nالمجموع: ${s.collected}/${s.goal} دينار\nالمنشئ: <@${s.creator}>\n`
      ).join('\n');
      embed.setDescription(sabobasText);
    }
    
    await interaction.reply({ embeds: [embed] });
  }
});

// ==================== 🌐 سيرفر الويب 🌐 ====================
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    users: Object.keys(economyData.users).length,
    sabobas: Object.keys(economyData.sabobas).length 
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    uptime: process.uptime() 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ السيرفر شغال على port: ${PORT}`);
  console.log(`💰 النظام الاقتصادي: ${Object.keys(economyData.users).length} مستخدم`);
  
  client.login(process.env.TOKEN)
    .then(() => console.log('✅ البوت متصل!'))
    .catch(err => {
      console.error('❌ فشل الاتصال:', err);
      process.exit(1);
    });
});