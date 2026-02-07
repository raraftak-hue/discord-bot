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

// تخزين بيانات الترحيب
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

// الأوامر
const commands = [
  new SlashCommandBuilder()
    .setName('ticketpanel')
    .setDescription('عرض لوحة التذاكر')
    .addRoleOption(option => option.setName('admin_role_1').setDescription('رتبة الإدارة الأولى').setRequired(false))
    .addRoleOption(option => option.setName('admin_role_2').setDescription('رتبة الإدارة الثانية').setRequired(false))
    .addRoleOption(option => option.setName('admin_role_3').setDescription('رتبة الإدارة الثالثة').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('editembed')
    .setDescription('تعديل رسالة الإيمبد')
    .addStringOption(option => option.setName('title').setDescription('عنوان الإيمبد').setRequired(false))
    .addStringOption(option => option.setName('description').setDescription('وصف الإيمبد').setRequired(false))
    .addStringOption(option => option.setName('color').setDescription('لون الإيمبد HEX').setRequired(false))
    .addStringOption(option => option.setName('image').setDescription('رابط الصورة').setRequired(false))
    .addStringOption(option => option.setName('thumbnail').setDescription('رابط الصورة الصغيرة').setRequired(false))
    .addRoleOption(option => option.setName('admin_role_1').setDescription('رتبة الإدارة الأولى').setRequired(false))
    .addRoleOption(option => option.setName('admin_role_2').setDescription('رتبة الإدارة الثانية').setRequired(false))
    .addRoleOption(option => option.setName('admin_role_3').setDescription('رتبة الإدارة الثالثة').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('تعيين روم الترحيب')
    .addChannelOption(option => 
      option.setName('channel')
        .setDescription('روم الترحيب')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('welcomeembed')
    .setDescription('تخصيص إيمبد الترحيب')
    .addStringOption(option => option.setName('title').setDescription('عنوان الإيمبد (استخدم {user}, {server}, {mention})').setRequired(false))
    .addStringOption(option => option.setName('description').setDescription('وصف الإيمبد (استخدم {user}, {server}, {count}, {mention})').setRequired(false))
    .addStringOption(option => option.setName('color').setDescription('لون الإيمبد HEX (#2b2d31)').setRequired(false))
    .addStringOption(option => option.setName('image').setDescription('رابط صورة خلفية').setRequired(false))
    .addStringOption(option => option.setName('thumbnail').setDescription('رابط صورة مصغرة').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('testwelcome')
    .setDescription('تجربة رسالة الترحيب')
    .addUserOption(option => option.setName('user').setDescription('العضو لتجربة الترحيب').setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('welcomeinfo')
    .setDescription('عرض إعدادات الترحيب الحالية')
].map(cmd => cmd.toJSON());

// تسجيل الأوامر
(async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(BOT_ID), { body: commands });
    console.log('✅ تم تسجيل الأوامر');
  } catch (error) {
    console.error('❌ خطأ:', error);
  }
})();

// البوت جاهز
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} جاهز!`);
});

// حدث الترحيب - بدون زر التذاكر
client.on('guildMemberAdd', async (member) => {
  if (!welcomeSettings.channelId) return;
  
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

    // أزرار الترحيب فقط - بدون زر فتح التذاكر
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('📖 القوانين')
        .setURL('https://example.com/rules') // غير الرابط لرابط قوانينك
        .setStyle(ButtonStyle.Link)
    );

    await channel.send({ 
      content: `${member}`, 
      embeds: [welcomeEmbed], 
      components: [row] 
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
      return interaction.reply({ content: 'لديك تذكرة مفتوحة بالفعل.', ephemeral: true });
    }

    const adminRoles = panelAdminRoles.get(interaction.message.id) || [];
    
    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.username}`,
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
    if (!interaction.channel.name.startsWith('ticket-')) {
      return interaction.reply({ content: 'هذا الزر يعمل فقط في قنوات التذاكر.', ephemeral: true });
    }

    for (const [userId, channelId] of activeTickets.entries()) {
      if (channelId === interaction.channel.id) {
        activeTickets.delete(userId);
        break;
      }
    }

    await interaction.reply({ content: 'سيتم إغلاق التذكرة بعد 5 ثواني.' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }

  // أمر panel
  if (interaction.isChatInputCommand() && interaction.commandName === 'ticketpanel') {
    const adminRoles = [
      interaction.options.getRole('admin_role_1'),
      interaction.options.getRole('admin_role_2'),
      interaction.options.getRole('admin_role_3')
    ].filter(r => r).map(r => r.id);

    const embed = new EmbedBuilder()
      .setTitle('نظام التذاكر')
      .setDescription('اضغط على الزر بالأسفل لفتح تذكرة دعم.\nسيتم إنشاء قناة خاصة لك.')
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
        content: `✅ تم إضافة رتب الإدارة:\n${adminRoles.map(id => `<@&${id}>`).join('\n')}`, 
        ephemeral: true 
      });
    }
  }

  // أمر edit
  if (interaction.isChatInputCommand() && interaction.commandName === 'editembed') {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color');
    const image = interaction.options.getString('image');
    const thumbnail = interaction.options.getString('thumbnail');
    
    const adminRoles = [
      interaction.options.getRole('admin_role_1'),
      interaction.options.getRole('admin_role_2'),
      interaction.options.getRole('admin_role_3')
    ].filter(r => r).map(r => r.id);

    const embedColor = color ? parseInt(color.replace('#',''),16) : 0x2b2d31;

    const embed = new EmbedBuilder()
      .setTitle(title || 'نظام التذاكر')
      .setDescription(description || 'اضغط على الزر بالأسفل لفتح تذكرة دعم.\nسيتم إنشاء قناة خاصة لك.')
      .setColor(embedColor);

    if (image) embed.setImage(image);
    if (thumbnail) embed.setThumbnail(thumbnail);

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
        content: `✅ تم إضافة رتب الإدارة:\n${adminRoles.map(id => `<@&${id}>`).join('\n')}`, 
        ephemeral: true 
      });
    }
  }

  // أمر setwelcome
  if (interaction.isChatInputCommand() && interaction.commandName === 'setwelcome') {
    const channel = interaction.options.getChannel('channel');
    welcomeSettings.channelId = channel.id;
    
    await interaction.reply({ 
      content: `✅ تم تعيين روم الترحيب: ${channel}\n\nاستخدم \`/welcomeembed\` لتخصيص الرسالة.`,
      ephemeral: false 
    });
  }

  // أمر welcomeembed
  if (interaction.isChatInputCommand() && interaction.commandName === 'welcomeembed') {
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const color = interaction.options.getString('color');
    const image = interaction.options.getString('image');
    const thumbnail = interaction.options.getString('thumbnail');

    if (title !== null) welcomeSettings.title = title || '';
    if (description !== null) welcomeSettings.description = description || '';
    if (color) welcomeSettings.color = color.startsWith('#') ? color.replace('#', '') : color;
    if (image !== null) welcomeSettings.image = image;
    if (thumbnail !== null) welcomeSettings.thumbnail = thumbnail;

    await interaction.reply({ 
      content: `✅ تم تحديث إعدادات الترحيب!\n\n` +
               `**العنوان:** ${welcomeSettings.title || '❌ لا يوجد'}\n` +
               `**الوصف:** ${welcomeSettings.description || '❌ لا يوجد'}\n` +
               `**اللون:** #${welcomeSettings.color}\n\n` +
               `**المتغيرات:** {user} {mention} {server} {count}`,
      ephemeral: true 
    });
  }

  // أمر testwelcome
  if (interaction.isChatInputCommand() && interaction.commandName === 'testwelcome') {
    if (!welcomeSettings.channelId) {
      return interaction.reply({ 
        content: '❌ لم يتم تعيين روم الترحيب بعد.\nاستخدم `/setwelcome` أولاً.',
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

    if (title.trim()) testEmbed.setTitle(`[تجربة] ${title}`);
    if (description.trim()) testEmbed.setDescription(description);
    if (welcomeSettings.image) testEmbed.setImage(welcomeSettings.image);
    if (welcomeSettings.thumbnail) testEmbed.setThumbnail(welcomeSettings.thumbnail);

    await channel.send({ 
      content: `${user}`, 
      embeds: [testEmbed] 
    });

    await interaction.reply({ 
      content: `✅ تم إرسال رسالة ترحيب تجريبية في ${channel}`,
      ephemeral: true 
    });
  }

  // أمر welcomeinfo
  if (interaction.isChatInputCommand() && interaction.commandName === 'welcomeinfo') {
    const channel = welcomeSettings.channelId ? 
      interaction.guild.channels.cache.get(welcomeSettings.channelId) : null;
    
    const infoEmbed = new EmbedBuilder()
      .setTitle('⚙️ إعدادات الترحيب الحالية')
      .setColor(0x2b2d31)
      .addFields(
        { name: '📌 الروم', value: channel ? `${channel}` : '❌ غير معين', inline: true },
        { name: '🎨 اللون', value: `#${welcomeSettings.color}`, inline: true },
        { name: '📸 صورة خلفية', value: welcomeSettings.image ? '✅' : '❌', inline: true },
        { name: '🖼️ صورة مصغرة', value: welcomeSettings.thumbnail ? '✅' : '❌', inline: true }
      )
      .setDescription(`**العنوان:** ${welcomeSettings.title || 'لا يوجد'}\n**الوصف:** ${welcomeSettings.description || 'لا يوجد'}`)
      .setTimestamp();

    await interaction.reply({ 
      embeds: [infoEmbed],
      ephemeral: true 
    });
  }
});

// سيرفر ويب لـ Railway
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    bot: client.isReady() ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: Date.now(),
    service: 'discord-ticket-welcome-bot'
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