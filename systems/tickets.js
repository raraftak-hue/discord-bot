const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const TicketSettingsSchema = new mongoose.Schema({
  guildId: String,
  categoryId: { type: String, default: '' },
  embedDescription: { type: String, default: '' },
  embedColor: { type: String, default: '2b2d31' },
  embedImage: { type: String, default: null },
  supportRoleId: { type: String, default: null },
  courtRoleId: { type: String, default: null }
});

const TicketSchema = new mongoose.Schema({
  channelId: String,
  guildId: String,
  userId: String,
  type: String, // 'support' or 'court'
  claimedBy: { type: String, default: null }, // ID الي استلم التذكرة
  createdAt: { type: Date, default: Date.now }
});

const TicketSettings = mongoose.model('TicketSettings', TicketSettingsSchema);
const Ticket = mongoose.model('Ticket', TicketSchema);

// ==================== 🔧 الدوال المساعدة ====================
async function getTicketSettings(guildId) {
  let settings = await TicketSettings.findOne({ guildId });
  if (!settings) {
    settings = new TicketSettings({ guildId });
    await settings.save();
  }
  return settings;
}

async function createTicket(channel, user, type, settings) {
  const ticket = new Ticket({
    channelId: channel.id,
    guildId: channel.guild.id,
    userId: user.id,
    type,
    claimedBy: null
  });
  await ticket.save();
  return ticket;
}

async function getTicketByChannel(channelId) {
  return await Ticket.findOne({ channelId });
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return false;

  // ===== أوامر السلاش =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'tic') {
    const sub = interaction.options.getSubcommand();
    const settings = await getTicketSettings(interaction.guild.id);

    // ===== /tic set =====
    if (sub === 'set') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: `-# ** ما عندك صلاحية <:emoji_84:1389404919672340592> **`, ephemeral: true });
        return true;
      }

      const category = interaction.options.getChannel('category');
      const desc = interaction.options.getString('desc');
      const color = interaction.options.getString('color');
      const image = interaction.options.getString('image');
      const supportRole = interaction.options.getRole('support_role');
      const courtRole = interaction.options.getRole('court_role');

      if (category) settings.categoryId = category.id;
      if (desc !== null) {
        if (desc === 'حذف') settings.embedDescription = '';
        else settings.embedDescription = desc;
      }
      if (color !== null) {
        if (color === 'حذف') settings.embedColor = '2b2d31';
        else settings.embedColor = color.replace('#', '');
      }
      if (image !== null) {
        if (image === 'حذف') settings.embedImage = null;
        else settings.embedImage = image;
      }
      if (supportRole) settings.supportRoleId = supportRole.id;
      if (courtRole) settings.courtRoleId = courtRole.id;

      await settings.save();
      await interaction.reply({ content: `-# ** تم تحديث الاعدادات <:2thumbup:1467287897429512396> **`, ephemeral: true });
      return true;
    }

    // ===== /tic panel =====
    if (sub === 'panel') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: `-# ** ما عندك صلاحية <:emoji_84:1389404919672340592> **`, ephemeral: true });
        return true;
      }

      const embed = new EmbedBuilder()
        .setDescription(settings.embedDescription || null)
        .setColor(parseInt(settings.embedColor, 16) || 0x2b2d31);

      if (settings.embedImage) embed.setImage(settings.embedImage);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_ticket_support')
          .setLabel('الدعم الفني')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('open_ticket_court')
          .setLabel('محكمة العدل')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: `-# **تم ارسال الرسالة <:2thumbup:1467287897429512396> **`, ephemeral: true });
      return true;
    }
  }

  // ===== الأزرار =====
  if (interaction.isButton()) {
    // ===== فتح تذكرة دعم =====
    if (interaction.customId === 'open_ticket_support') {
      return handleOpenTicket(interaction, client, 'support');
    }

    // ===== فتح تذكرة محكمة =====
    if (interaction.customId === 'open_ticket_court') {
      return handleOpenTicket(interaction, client, 'court');
    }

    // ===== إغلاق التذكرة =====
    if (interaction.customId === 'close_ticket') {
      const ticket = await getTicketByChannel(interaction.channel.id);
      
      // التحقق من الصلاحية: فقط الي استلم التذكرة يقدر يقفلها
      if (!ticket || ticket.claimedBy !== interaction.user.id) {
        await interaction.reply({ 
          content: `-# ** مو انت الإداري هنا، خليه هو يسكر <:emoji_38:1401773302619439147> **`, 
          ephemeral: true 
        });
        return true;
      }

      await interaction.reply({ content: `-# **احسب الين ثلاثة **` });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      return true;
    }
  }

  return false;
}

// ==================== handleTextCommand ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  const ticket = await getTicketByChannel(message.channel.id);
  if (!ticket) return false; // مش تذكرة

  // ===== أمر استلام =====
  if (command === 'استلام') {
    // التحقق من الصلاحية: هل الشخص عنده رتبة دعم أو محكمة؟
    const settings = await getTicketSettings(message.guild.id);
    const supportRole = settings.supportRoleId;
    const courtRole = settings.courtRoleId;
    
    const hasSupportRole = supportRole && message.member.roles.cache.has(supportRole);
    const hasCourtRole = courtRole && message.member.roles.cache.has(courtRole);

    if (!hasSupportRole && !hasCourtRole) {
      await message.channel.send(`-# **ما عندك صلاحية استلام التذاكر <:emoji_84:1389404919672340592> **`);
      return true;
    }

    // التحقق من إن التذكرة مش مستلمة قبل كده
    if (ticket.claimedBy) {
      await message.channel.send(`-# **التذكرة مستلمة بالفعل <:emoji_84:1389404919672340592> **`);
      return true;
    }

    // استلام التذكرة
    ticket.claimedBy = message.author.id;
    await ticket.save();

    await message.channel.send(`-# **تم استلام التذكرة <:new_emoji:1388436089584226387> **`);
    return true;
  }

  // ===== أمر تعال =====
  if (command === 'تعال') {
    // التحقق من إن المستخدم الحالي هو المستلم
    if (ticket.claimedBy !== message.author.id) {
      await message.channel.send(`-# **فقط مستلم التذكرة يقدر يستدعي أعضاء <:emoji_84:1389404919672340592> **`);
      return true;
    }

    const target = message.mentions.users.first();
    if (!target) {
      await message.channel.send(`-# **منشن الشخص اللي تبي تستدعيه <:emoji_334:1388211595053760663> **`);
      return true;
    }

    await message.channel.send(`${target}`);
    return true;
  }

  return false;
}

// ==================== فتح تذكرة ====================
async function handleOpenTicket(interaction, client, type) {
  const settings = await getTicketSettings(interaction.guild.id);

  const roomName = type === 'court' 
    ? `محكمة-${interaction.user.username}` 
    : `دعم-${interaction.user.username}`;

  const existingChannel = interaction.guild.channels.cache.find(c => c.name === roomName);
  if (existingChannel) {
    return interaction.reply({
      content: `-# ** لديك تذكرة مفتوحة ما تقدر تفتح اخرى <:emoji_46:1473343297002148005> **`,
      ephemeral: true
    });
  }

  // تحضير الصلاحيات
  const permissionOverwrites = [
    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
  ];

  let roleMention = '';
  let content = '';

  if (type === 'court') {
    if (settings.courtRoleId) {
      permissionOverwrites.push({
        id: settings.courtRoleId,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
      });
      roleMention = `<@&${settings.courtRoleId}>`;
    }
    content = `-# **اهلا بكم في محكمة العدل الرجاء كتابة ما المشكلة و من هم الشهود عليها ان وجدوا <:emoji_35:1474845075950272756> **`;
  } else {
    if (settings.supportRoleId) {
      permissionOverwrites.push({
        id: settings.supportRoleId,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
      });
      roleMention = `<@&${settings.supportRoleId}>`;
    }
    content = `-# ** اكتب سبب فتحك للتكت و فريق الدعم بيتواصل معك قريب <:emoji_32:1471962578895769611> **`;
  }

  // إنشاء الروم
  const channel = await interaction.guild.channels.create({
    name: roomName,
    type: ChannelType.GuildText,
    parent: settings.categoryId || null,
    permissionOverwrites
  });

  // تسجيل التذكرة في قاعدة البيانات
  await createTicket(channel, interaction.user, type, settings);

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `${interaction.user} ${roleMention}\n${content}`,
    components: [closeRow]
  });

  await interaction.reply({
    content: `-# **تم تلقي طلبك <:new_emoji:1388436089584226387> **`,
    ephemeral: true
  });

  return true;
}

module.exports = {
  onInteraction,
  handleTextCommand
};