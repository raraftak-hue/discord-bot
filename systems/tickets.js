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
  channelId: String, // هذا هو الـ Thread ID
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

async function createTicket(thread, user, type) {
  const ticket = new Ticket({
    channelId: thread.id,
    guildId: thread.guild.id,
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

  // ===== أوامر السلاش (تم تنظيفها) =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'tic') {
    const sub = interaction.options.getSubcommand();
    const settings = await getTicketSettings(interaction.guild.id);

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
      if (desc !== null) settings.embedDescription = desc === 'حذف' ? '' : desc;
      if (color !== null) settings.embedColor = color === 'حذف' ? '2b2d31' : color.replace('#', '');
      if (image !== null) settings.embedImage = image === 'حذف' ? null : image;
      if (supportRole) settings.supportRoleId = supportRole.id;
      if (courtRole) settings.courtRoleId = courtRole.id;

      await settings.save();
      await interaction.reply({ content: `-# ** تم تحديث إعدادات النظام بنجاح <:2thumbup:1467287897429512396> **`, ephemeral: true });
      return true;
    }

    if (sub === 'panel') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: `-# ** ما عندك صلاحية <:emoji_84:1389404919672340592> **`, ephemeral: true });
        return true;
      }

      const embed = new EmbedBuilder()
        .setDescription(settings.embedDescription || "-# **اختر نوع التذكرة التي ترغب بفتحها**")
        .setColor(parseInt(settings.embedColor, 16) || 0x2b2d31);

      if (settings.embedImage) embed.setImage(settings.embedImage);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_ticket_support').setLabel('الدعم الفني').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('open_ticket_court').setLabel('محكمة العدل').setStyle(ButtonStyle.Secondary)
      );

      await interaction.channel.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: `-# **تم إرسال لوحة التذاكر بنجاح <:2thumbup:1467287897429512396> **`, ephemeral: true });
      return true;
    }
  }

  // ===== الأزرار =====
  if (interaction.isButton()) {
    if (interaction.customId === 'open_ticket_support') return handleOpenTicket(interaction, client, 'support');
    if (interaction.customId === 'open_ticket_court') return handleOpenTicket(interaction, client, 'court');

    // ===== استلام التذكرة =====
    if (interaction.customId === 'claim_ticket') {
      const ticket = await getTicketByChannel(interaction.channel.id);
      if (!ticket) return interaction.reply({ content: `-# **خطأ: لم يتم العثور على بيانات التذكرة في القاعدة!**`, ephemeral: true });

      const settings = await getTicketSettings(interaction.guild.id);
      const isCourt = ticket.type === 'court';
      const relevantRole = isCourt ? settings.courtRoleId : settings.supportRoleId;

      if (!relevantRole || !interaction.member.roles.cache.has(relevantRole)) {
        const msg = isCourt ? "أنت لست قاضياً لتستلم هذه الجلسة!" : "أنت لست من فريق الدعم لتستلم هذه التذكرة!";
        return interaction.reply({ content: `-# **${msg} <:emoji_38:1401773302619439147> **`, ephemeral: true });
      }

      if (ticket.claimedBy) {
        const claimer = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
        return interaction.reply({ content: `-# **تم استلامها مسبقاً من قبل ${claimer ? claimer.user : 'مسؤول آخر'} <:emoji_40:1475268254028267738> **`, ephemeral: true });
      }

      ticket.claimedBy = interaction.user.id;
      await ticket.save();

      const successMsg = isCourt 
        ? `⚖️ **باسم العدالة، القاضي ${interaction.user} يتولى زمام هذه الجلسة!**`
        : `-# **تم تعيين ${interaction.user} مسؤولاً عن مساعدتكم في هذه التذكرة <:new_emoji:1388436089584226387> **`;

      await interaction.channel.send({ content: successMsg });
      await interaction.reply({ content: `-# **تم الاستلام بنجاح <:2thumbup:1467287897429512396> **`, ephemeral: true });
      return true;
    }

    // ===== إغلاق التذكرة =====
    if (interaction.customId === 'close_ticket') {
      const ticket = await getTicketByChannel(interaction.channel.id);
      if (!ticket) return interaction.reply({ content: `-# **خطأ: لم يتم العثور على بيانات التذكرة!**`, ephemeral: true });

      if (!ticket.claimedBy) {
        const waitMsg = ticket.type === 'court' ? "انتظروا حضور القاضي لفض الجلسة!" : "انتظروا استلام التذكرة من قبل الدعم أولاً!";
        return interaction.reply({ content: `-# **${waitMsg} <:emoji_39:1474950143634706543> **`, ephemeral: true });
      }

      if (ticket.claimedBy !== interaction.user.id) {
        const settings = await getTicketSettings(interaction.guild.id);
        const relevantRole = ticket.type === 'court' ? settings.courtRoleId : settings.supportRoleId;
        const isStaff = relevantRole && interaction.member.roles.cache.has(relevantRole);

        if (isStaff) {
          const staffTitle = ticket.type === 'court' ? "القاضي" : "المسؤول";
          return interaction.reply({ content: `-# ** ${staffTitle} <@${ticket.claimedBy}> مهو مالي عينك ولا ايش <:emoji_38:1401773302619439147> **`, ephemeral: true });
        } else {
          return interaction.reply({ content: `-# **أنت لست المسؤول عن هذه التذكرة <:s7_discord:1388214117365453062> **`, ephemeral: true });
        }
      }

      const closingMsg = ticket.type === 'court' ? "⚖️ **رفعت الجلسة! جاري إغلاق المحكمة...**" : "-# **جاري إغلاق التذكرة، شكراً لتواصلكم معنا!**";
      await interaction.reply({ content: closingMsg });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      return true;
    }
  }

  return false;
}

// ==================== onMessage ====================
async function onMessage(client, message) {
  if (!message.guild || message.author.bot || !message.channel.isThread()) return;

  const ticket = await getTicketByChannel(message.channel.id);
  if (!ticket) return;

  if (message.content.startsWith('تعال')) {
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) return;

    if (ticket.claimedBy !== message.author.id) {
      const staffTitle = ticket.type === 'court' ? "القاضي" : "المسؤول";
      return message.reply({ content: `-# ** ${staffTitle} بس يقدر يسويها <:emoji_36:1474949953876000950> **` });
    }

    try {
      await message.channel.members.add(mentionedUser.id);
      await message.react('✅');
      if (ticket.type === 'court') {
        await message.channel.send(`⚖️ **تم استدعاء ${mentionedUser} للمثول أمام المحكمة!**`);
      }
    } catch (error) {
      console.error('❌ خطأ في إضافة عضو للثريد:', error);
    }
  }
}

// ==================== فتح تذكرة ====================
async function handleOpenTicket(interaction, client, type) {
  const settings = await getTicketSettings(interaction.guild.id);

  const ticketName = type === 'court' 
    ? `⚖️-محكمة-${interaction.user.username}` 
    : `🛠️-دعم-${interaction.user.username}`;

  const existingTicket = await Ticket.findOne({ guildId: interaction.guild.id, userId: interaction.user.id, type });
  if (existingTicket) {
    const thread = await interaction.guild.channels.fetch(existingTicket.channelId).catch(() => null);
    if (thread) return interaction.reply({ content: `-# **لديك تذكرة مفتوحة بالفعل: ${thread}**`, ephemeral: true });
    else await Ticket.deleteOne({ _id: existingTicket._id });
  }

  const thread = await interaction.channel.threads.create({
    name: ticketName.slice(0, 100),
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `تذكرة ${type} لـ ${interaction.user.tag}`,
    startMessage: false
  });

  await createTicket(thread, interaction.user, type);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('claim_ticket').setLabel(type === 'court' ? 'استلام الجلسة' : 'استلام التذكرة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger)
  );

  let roleMention = '';
  let content = '';
  const relevantRole = type === 'court' ? settings.courtRoleId : settings.supportRoleId;

  if (type === 'court') {
    roleMention = settings.courtRoleId ? `<@&${settings.courtRoleId}>` : 'القضاة';
    content = `⚖️ **باسم العدالة، تم افتتاح جلسة محاكمة جديدة!**\n-# **الرجاء من ${interaction.user} كتابة تفاصيل القضية وذكر الشهود إن وجدوا. بانتظار حضور القاضي...**`;
  } else {
    roleMention = settings.supportRoleId ? `<@&${settings.supportRoleId}>` : 'فريق الدعم';
    content = `🛠️ **أهلاً بك في قسم الدعم الفني!**\n-# **عزيزي ${interaction.user}، يرجى كتابة مشكلتك بوضوح وسيقوم أحد أعضاء الفريق بمساعدتك قريباً.**`;
  }

  let mentions = `${interaction.user}`;
  if (relevantRole) mentions += ` <@&${relevantRole}>`;

  await thread.send({ content: `${mentions}\n\n${content}`, components: [row] });
  await interaction.reply({ content: `-# **تم فتح تذكرتك بنجاح: ${thread} <:new_emoji:1388436089584226387> **`, ephemeral: true });
  return true;
}

module.exports = { onInteraction, onMessage };
