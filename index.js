const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const express = require('express');
const app = express();

// BOT SETUP
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// تخزين البيانات
const welcomeSettings = {
  channelId: null,
  title: 'أهلاً بك في {server}!',
  description: 'مرحباً {mention} في **{server}**!\nأنت العضو رقم **{count}** 🌟',
  color: '2b2d31',
  image: null
};

const panelAdminRoles = new Map();
const activeTickets = new Map();

// ⭐⭐ الأوامر البسيطة - بدون Subcommands ⭐⭐
const commands = [
  // 1. لوحة التذاكر
  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('عرض لوحة التذاكر')
    .addRoleOption(option => option.setName('admin1').setDescription('رتبة الإدارة الأولى').setRequired(false))
    .addRoleOption(option => option.setName('admin2').setDescription('رتبة الإدارة الثانية').setRequired(false))
    .addRoleOption(option => option.setName('admin3').setDescription('رتبة الإدارة الثالثة').setRequired(false)),
  
  // 2. تعديل اللوحة
  new SlashCommandBuilder()
    .setName('ticketedit')
    .setDescription('تعديل لوحة التذاكر')
    .addStringOption(option => option.setName('title').setDescription('عنوان جديد').setRequired(false))
    .addStringOption(option => option.setName('description').setDescription('وصف جديد').setRequired(false))
    .addStringOption(option => option.setName('color').setDescription('لون جديد').setRequired(false)),
  
  // 3. تعيين الترحيب
  new SlashCommandBuilder()
    .setName('welcomeset')
    .setDescription('تعيين روم الترحيب')
    .addChannelOption(option => option.setName('channel').setDescription('روم الترحيب').setRequired(true)),
  
  // 4. تعديل الترحيب
  new SlashCommandBuilder()
    .setName('welcomeedit')
    .setDescription('تعديل رسالة الترحيب')
    .addStringOption(option => option.setName('title').setDescription('العنوان (استخدم {user} {mention} {server})').setRequired(false))
    .addStringOption(option => option.setName('description').setDescription('الوصف (استخدم {user} {mention} {server} {count})').setRequired(false))
    .addStringOption(option => option.setName('color').setDescription('اللون (#2b2d31)').setRequired(false))
    .addStringOption(option => option.setName('image').setDescription('رابط صورة خلفية (اختياري)').setRequired(false)),
  
  // 5. تجربة الترحيب
  new SlashCommandBuilder()
    .setName('welcometest')
    .setDescription('تجربة رسالة الترحيب')
    .addUserOption(option => option.setName('user').setDescription('لعضو للتجربة').setRequired(false)),
  
  // 6. معلومات الترحيب
  new SlashCommandBuilder()
    .setName('welcomeinfo')
    .setDescription('عرض إعدادات الترحيب'),
  
  // 7. المساعدة
  new SlashCommandBuilder()
    .setName('bothelp')
    .setDescription('عرض جميع الأوامر')
].map(cmd => cmd.toJSON());

// تسجيل الأوامر
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    const data = await rest.put(Routes.applicationCommands(client.user?.id || process.env.CLIENT_ID), { body: commands });
    console.log(`✅ تم تسجيل ${data.length} أمر: ${commands.map(c => c.name).join(', ')}`);
  } catch (error) {
    console.error('❌ خطأ في تسجيل الأوامر:', error);
  }
})();

// البوت جاهز
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} جاهز!`);
  console.log(`🆔 ID: ${client.user.id}`);
  console.log(`📊 ${client.guilds.cache.size} سيرفر`);
});

// حدث الترحيب
client.on('guildMemberAdd', async (member) => {
  if (!welcomeSettings.channelId || (!welcomeSettings.title && !welcomeSettings.description)) {
    return;
  }
  
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
      .setColor(parseInt(welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31)
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ 
        text: `ID: ${member.user.id} | العضو رقم: ${member.guild.memberCount}`,
        iconURL: member.guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    if (title.trim()) welcomeEmbed.setTitle(title);
    if (description.trim()) welcomeEmbed.setDescription(description);
    if (welcomeSettings.image) welcomeEmbed.setImage(welcomeSettings.image);

    await channel.send({ 
      content: `${member}`,
      embeds: [welcomeEmbed] 
    });
    
    console.log(`👋 تم ترحيب ${member.user.tag}`);
  } catch (error) {
    console.error('❌ خطأ في الترحيب:', error);
  }
});

// الأوامر
client.on('interactionCreate', async interaction => {
  // فتح تذكرة
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
        .setDescription('-# اكتب طلب او مشكلتك بشكل واضح شوي و ان شاء الله بنرد عليك في اقرب وقت <:1_81:1467286889877999843>')
        .setColor(0x2b2d31)
        .setTimestamp()], 
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger)
      )] 
    });

    return interaction.reply({ content: `تم إنشاء تذكرتك: ${ticketChannel}`, ephemeral: true });
  }

  // إغلاق تذكرة
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

  // أوامر الشات
  if (!interaction.isChatInputCommand()) return;

  // 1. ticketpanel
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

  // 2. ticketedit
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

  // 3. welcomeset
  else if (interaction.commandName === 'welcomeset') {
    const channel = interaction.options.getChannel('channel');
    welcomeSettings.channelId = channel.id;
    
    await interaction.reply({ 
      content: `✅ تم تعيين روم الترحيب: ${channel}`,
      ephemeral: false 
    });
  }

  // 4. welcomeedit
  else if (interaction.commandName === 'welcomeedit') {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color');
    const image = interaction.options.getString('image');

    if (title !== null) welcomeSettings.title = title || '';
    if (description !== null) welcomeSettings.description = description || '';
    if (color) welcomeSettings.color = color.startsWith('#') ? color.replace('#', '') : color;
    if (image) welcomeSettings.image = image;

    await interaction.reply({ 
      content: `✅ تم تحديث إعدادات الترحيب!`,
      ephemeral: true 
    });
  }

  // 5. welcometest
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
      .setColor(parseInt(welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
      .setFooter({ 
        text: `[تجربة] | العضو رقم: ${interaction.guild.memberCount}`,
        iconURL: interaction.guild.iconURL({ dynamic: true })
      })
      .setTimestamp();

    if (title.trim()) testEmbed.setTitle(title);
    if (description.trim()) testEmbed.setDescription(description);
    if (welcomeSettings.image) testEmbed.setImage(welcomeSettings.image);

    await channel.send({ 
      content: `${user}`, 
      embeds: [testEmbed] 
    });

    await interaction.reply({ 
      content: `✅ تم إرسال رسالة ترحيب تجريبية.`,
      ephemeral: true 
    });
  }

  // 6. welcomeinfo
  else if (interaction.commandName === 'welcomeinfo') {
    const channel = welcomeSettings.channelId ? 
      interaction.guild.channels.cache.get(welcomeSettings.channelId) : null;
    
    const infoEmbed = new EmbedBuilder()
      .setTitle('⚙️ إعدادات الترحيب')
      .setColor(0x2b2d31)
      .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
      .addFields(
        { name: '📌 الروم', value: channel ? `${channel}` : '❌ غير معين', inline: true },
        { name: '🎨 اللون', value: `#${welcomeSettings.color}`, inline: true },
        { name: '🖼️ صورة', value: welcomeSettings.image ? '✅ معين' : '❌ غير معين', inline: true }
      )
      .setDescription(
        `**العنوان:**\n${welcomeSettings.title || 'لا يوجد'}\n\n` +
        `**الوصف:**\n${welcomeSettings.description || 'لا يوجد'}`
      )
      .setTimestamp();

    await interaction.reply({ 
      embeds: [infoEmbed],
      ephemeral: true 
    });
  }

  // 7. bothelp
  else if (interaction.commandName === 'bothelp') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('🛠️ أوامر البوت')
      .setColor(0x2b2d31)
      .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { 
          name: '🎫 التذاكر', 
          value: '`/ticketpanel` - عرض لوحة التذاكر\n' +
                 '`/ticketedit` - تعديل لوحة التذاكر'
        },
        { 
          name: '👋 الترحيب', 
          value: '`/welcomeset` - تعيين روم الترحيب\n' +
                 '`/welcomeedit` - تعديل رسالة الترحيب\n' +
                 '`/welcometest` - تجربة الترحيب\n' +
                 '`/welcomeinfo` - عرض الإعدادات'
        }
      )
      .setFooter({ text: 'شغال 24/7 على Railway' })
      .setTimestamp();

    await interaction.reply({ 
      embeds: [helpEmbed],
      ephemeral: true 
    });
  }
});

// 🔥 Health check تلقائي
let lastPing = Date.now();
setInterval(() => {
  console.log('❤️ Health check ping');
  lastPing = Date.now();
}, 30 * 1000);

// سيرفر ويب
app.get('/', (req, res) => {
  res.json({ 
    status: 'online', 
    bot: client.isReady() ? 'connected' : 'disconnected'
  });
});

app.get('/ping', (req, res) => {
  lastPing = Date.now();
  res.status(200).json({ 
    status: 'alive', 
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  lastPing = Date.now();
  res.status(200).json({ 
    status: 'healthy',
    bot: client.isReady(),
    guilds: client.guilds.cache.size,
    uptime: process.uptime()
  });
});

app.get('/status', (req, res) => {
  const uptime = process.uptime();
  const memory = process.memoryUsage();
  res.json({
    status: 'running',
    uptime: `${Math.floor(uptime / 60)} دقائق`,
    memory: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
    lastPing: Date.now() - lastPing
  });
});

// 🔥 الجزء المهم - التسلسل الصحيح
const PORT = process.env.PORT || 3000;

// 1. ابدأ سيرفر الويب أول
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ السيرفر شغال على port: ${PORT}`);
  console.log(`🌐 Health check: http://0.0.0.0:${PORT}/health`);
  
  // 2. بعدين سجل البوت
  client.login(process.env.TOKEN)
    .then(() => {
      console.log('✅ البوت متصل بـ Discord!');
      console.log(`👑 ${client.user.tag} جاهز للعمل`);
    })
    .catch(err => {
      console.error('❌ فشل تسجيل الدخول:', err);
      server.close();
      process.exit(1);
    });
});

// 🔧 منع الإغلاق
process.on('SIGTERM', () => {
  console.log('🛑 إغلاق نظيف...');
  setTimeout(() => {
    console.log('⏳ تأخير الإغلاق...');
    process.exit(0);
  }, 10000);
});

// ping تلقائي كل 5 دقائق
setInterval(() => {
  console.log('🫀 Ping - البوت شغال');
  if (client.isReady()) {
    console.log(`📊 ${client.guilds.cache.size} سيرفر`);
  }
}, 5 * 60 * 1000);