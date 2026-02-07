const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();

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
  }
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} جاهز!`);
  
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`✅ تم تسجيل ${commands.length} أوامر`);
  } catch (error) {
    console.error('❌ خطأ في تسجيل الأوامر:', error);
  }
});

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
    
    if (welcomeSettings.image && welcomeSettings.image.startsWith('http')) {
      welcomeEmbed.setImage(welcomeSettings.image);
    }

    await channel.send({ 
      content: `${member}`,
      embeds: [welcomeEmbed] 
    });
    
  } catch (error) {
    console.error('❌ خطأ في الترحيب:', error);
  }
});

client.on('interactionCreate', async interaction => {
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

  else if (interaction.commandName === 'welcomeset') {
    const channel = interaction.options.getChannel('channel');
    welcomeSettings.channelId = channel.id;
    
    await interaction.reply({ 
      content: `✅ تم تعيين روم الترحيب: ${channel}`,
      ephemeral: false 
    });
  }

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
      content: `${user}`, 
      embeds: [testEmbed] 
    });

    await interaction.reply({ 
      content: `✅ تم إرسال رسالة ترحيب تجريبية.`,
      ephemeral: true 
    });
  }

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

  else if (interaction.commandName === 'bothelp') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('أوامر البوت')
      .setColor(0x2b2d31)
      .addFields(
        { 
          name: 'التذاكر', 
          value: '`/ticketpanel` - عرض لوحة التذاكر\n' +
                 '`/ticketedit` - تعديل لوحة التذاكر'
        },
        { 
          name: 'الترحيب', 
          value: '`/welcomeset` - تعيين روم الترحيب\n' +
                 '`/welcomeedit` - تعديل رسالة الترحيب\n' +
                 '`/welcometest` - تجربة الترحيب\n' +
                 '`/welcomeinfo` - عرض الإعدادات'
        }
      );

    await interaction.reply({ 
      embeds: [helpEmbed],
      ephemeral: true 
    });
  }
});

app.get('/', (req, res) => res.json({ status: 'online' }));
app.get('/health', (req, res) => res.json({ status: 'healthy' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ السيرفر شغال على port: ${PORT}`);
  client.login(process.env.TOKEN)
    .then(() => console.log('✅ البوت متصل!'))
    .catch(err => {
      console.error('❌ فشل الاتصال:', err);
      process.exit(1);
    });
});