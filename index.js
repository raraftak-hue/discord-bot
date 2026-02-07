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

// BOT ID فقط
const BOT_ID = '1469663065518899292';

// تخزين البيانات
const welcomeSettings = {
  channelId: null,
  title: '',
  description: '',
  color: '2b2d31',
  image: null,
  thumbnail: null
};

const panelAdminRoles = new Map();
const activeTickets = new Map();

// ⭐⭐ الأوامر الجديدة - بدون تكرار ⭐⭐
const commands = [
  // نظام التذاكر
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('نظام التذاكر')
    .addSubcommand(subcommand =>
      subcommand
        .setName('panel')
        .setDescription('عرض لوحة التذاكر')
        .addRoleOption(option => option.setName('admin1').setDescription('رتبة الإدارة الأولى').setRequired(false))
        .addRoleOption(option => option.setName('admin2').setDescription('رتبة الإدارة الثانية').setRequired(false))
        .addRoleOption(option => option.setName('admin3').setDescription('رتبة الإدارة الثالثة').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('تعديل لوحة التذاكر')
        .addStringOption(option => option.setName('title').setDescription('عنوان جديد').setRequired(false))
        .addStringOption(option => option.setName('description').setDescription('وصف جديد').setRequired(false))
        .addStringOption(option => option.setName('color').setDescription('لون جديد (#2b2d31)').setRequired(false))
        .addRoleOption(option => option.setName('admin1').setDescription('رتبة الإدارة الأولى').setRequired(false))
        .addRoleOption(option => option.setName('admin2').setDescription('رتبة الإدارة الثانية').setRequired(false))
        .addRoleOption(option => option.setName('admin3').setDescription('رتبة الإدارة الثالثة').setRequired(false))
    ),

  // نظام الترحيب
  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('نظام الترحيب')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('تعيين روم الترحيب')
        .addChannelOption(option => 
          option.setName('channel')
            .setDescription('روم الترحيب')
            .setRequired(true))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('تعديل رسالة الترحيب')
        .addStringOption(option => option.setName('title').setDescription('عنوان (استخدم {user}, {server}, {mention})').setRequired(false))
        .addStringOption(option => option.setName('description').setDescription('وصف (استخدم {user}, {server}, {count}, {mention})').setRequired(false))
        .addStringOption(option => option.setName('color').setDescription('لون (#2b2d31)').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('تجربة رسالة الترحيب')
        .addUserOption(option => option.setName('user').setDescription('العضو للتجربة').setRequired(false))
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('info')
        .setDescription('عرض إعدادات الترحيب')
    ),

  // أمر المساعدة
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('عرض جميع الأوامر')
].map(cmd => cmd.toJSON());

// ⭐⭐ تسجيل الأوامر مرة واحدة فقط ⭐⭐
let commandsRegistered = false;

(async () => {
  if (commandsRegistered) return;
  
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(BOT_ID), { body: commands });
    console.log('✅ تم تسجيل الأوامر (مرة واحدة)');
    commandsRegistered = true;
  } catch (error) {
    console.error('❌ خطأ في تسجيل الأوامر:', error);
  }
})();

// البوت جاهز
client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} جاهز!`);
  
  // تأخير بسيط لظهور الأوامر
  setTimeout(() => {
    console.log('📋 الأوامر المتاحة:');
    console.log('  /ticket panel - عرض لوحة التذاكر');
    console.log('  /ticket edit - تعديل اللوحة');
    console.log('  /welcome set - تعيين روم الترحيب');
    console.log('  /welcome edit - تعديل الترحيب');
    console.log('  /welcome test - تجربة الترحيب');
    console.log('  /welcome info - عرض الإعدادات');
    console.log('  /help - المساعدة');
  }, 2000);
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
      .setColor(parseInt(welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31);

    if (title.trim()) welcomeEmbed.setTitle(title);
    if (description.trim()) welcomeEmbed.setDescription(description);
    if (welcomeSettings.image) welcomeEmbed.setImage(welcomeSettings.image);
    if (welcomeSettings.thumbnail) welcomeEmbed.setThumbnail(welcomeSettings.thumbnail);

    await channel.send({ 
      content: `${member}`, 
      embeds: [welcomeEmbed] 
    });
    
    console.log(`👋 تم ترحيب ${member.user.tag}`);
  } catch (error) {
    console.error('❌ خطأ في الترحيب:', error);
  }
});

// الأوامر - نظيفة ومنظمة
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

  // ⭐⭐ أوامر Subcommands نظيفة ⭐⭐
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options } = interaction;

  // أمر ticket
  if (commandName === 'ticket') {
    const subcommand = options.getSubcommand();
    
    if (subcommand === 'panel') {
      const adminRoles = [
        options.getRole('admin1'),
        options.getRole('admin2'),
        options.getRole('admin3')
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
          content: `✅ تم إضافة رتب الإدارة للوحة.`,
          ephemeral: true 
        });
      }
    }
    
    else if (subcommand === 'edit') {
      const title = options.getString('title');
      const description = options.getString('description');
      const color = options.getString('color');
      const adminRoles = [
        options.getRole('admin1'),
        options.getRole('admin2'),
        options.getRole('admin3')
      ].filter(r => r).map(r => r.id);

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

      const reply = await interaction.reply({ 
        embeds: [embed], 
        components: [row], 
        fetchReply: true 
      });

      if (adminRoles.length > 0) {
        panelAdminRoles.set(reply.id, adminRoles);
        await interaction.followUp({ 
          content: `✅ تم إضافة رتب الإدارة للوحة.`,
          ephemeral: true 
        });
      }
    }
  }

  // أمر welcome
  else if (commandName === 'welcome') {
    const subcommand = options.getSubcommand();
    
    if (subcommand === 'set') {
      const channel = options.getChannel('channel');
      welcomeSettings.channelId = channel.id;
      
      await interaction.reply({ 
        content: `✅ تم تعيين روم الترحيب: ${channel}\n\nاستخدم \`/welcome edit\` لتخصيص الرسالة.`,
        ephemeral: false 
      });
    }
    
    else if (subcommand === 'edit') {
      const title = options.getString('title');
      const description = options.getString('description');
      const color = options.getString('color');

      if (title !== null) welcomeSettings.title = title || '';
      if (description !== null) welcomeSettings.description = description || '';
      if (color) welcomeSettings.color = color.startsWith('#') ? color.replace('#', '') : color;

      await interaction.reply({ 
        content: `✅ تم تحديث إعدادات الترحيب!\n\n` +
                 `**العنوان:** ${welcomeSettings.title || '❌ لا يوجد'}\n` +
                 `**الوصف:** ${welcomeSettings.description || '❌ لا يوجد'}\n` +
                 `**اللون:** #${welcomeSettings.color}`,
        ephemeral: true 
      });
    }
    
    else if (subcommand === 'test') {
      if (!welcomeSettings.channelId) {
        return interaction.reply({ 
          content: '❌ لم يتم تعيين روم الترحيب بعد.\nاستخدم `/welcome set` أولاً.',
          ephemeral: true 
        });
      }

      const user = options.getUser('user') || interaction.user;
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

      if (title.trim()) testEmbed.setTitle(`[تجربة] ${title}`);
      if (description.trim()) testEmbed.setDescription(description);

      await channel.send({ 
        content: `${user}`, 
        embeds: [testEmbed] 
      });

      await interaction.reply({ 
        content: `✅ تم إرسال رسالة ترحيب تجريبية.`,
        ephemeral: true 
      });
    }
    
    else if (subcommand === 'info') {
      const channel = welcomeSettings.channelId ? 
        interaction.guild.channels.cache.get(welcomeSettings.channelId) : null;
      
      const infoEmbed = new EmbedBuilder()
        .setTitle('⚙️ إعدادات الترحيب')
        .setColor(0x2b2d31)
        .addFields(
          { name: '📌 الروم', value: channel ? `${channel}` : '❌ غير معين', inline: true },
          { name: '🎨 اللون', value: `#${welcomeSettings.color}`, inline: true }
        )
        .setDescription(`**العنوان:** ${welcomeSettings.title || 'لا يوجد'}\n**الوصف:** ${welcomeSettings.description || 'لا يوجد'}`)
        .setTimestamp();

      await interaction.reply({ 
        embeds: [infoEmbed],
        ephemeral: true 
      });
    }
  }

  // أمر help
  else if (commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('🛠️ أوامر البوت')
      .setColor(0x2b2d31)
      .addFields(
        { 
          name: '🎫 نظام التذاكر', 
          value: '`/ticket panel` - عرض لوحة التذاكر\n' +
                 '`/ticket edit` - تعديل لوحة التذاكر\n' +
                 '**زر:** فتح تذكرة\n' +
                 '**زر:** إغلاق التذكرة (داخل القناة)'
        },
        { 
          name: '👋 نظام الترحيب', 
          value: '`/welcome set` - تعيين روم الترحيب\n' +
                 '`/welcome edit` - تعديل رسالة الترحيب\n' +
                 '`/welcome test` - تجربة الترحيب\n' +
                 '`/welcome info` - عرض الإعدادات\n' +
                 '**المتغيرات:** {user} {mention} {server} {count}'
        }
      )
      .setFooter({ text: 'البوت شغال 24/7 على Railway' })
      .setTimestamp();

    await interaction.reply({ 
      embeds: [helpEmbed],
      ephemeral: true 
    });
  }
});

// سيرفر ويب
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: client.isReady() ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

app.get('/health', (req, res) => {
  if (client.isReady()) {
    res.status(200).json({ status: 'healthy', bot: 'online' });
  } else {
    res.status(503).json({ status: 'unhealthy', bot: 'offline' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 البوت شغال على port ${PORT}`);
});

client.login(process.env.TOKEN).catch(console.error);