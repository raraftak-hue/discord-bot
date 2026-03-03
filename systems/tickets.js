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

async function createTicket(channel, user, type) {
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

    // ===== استلام التذكرة =====
    if (interaction.customId === 'claim_ticket') {
      const ticket = await getTicketByChannel(interaction.channel.id);
      if (!ticket) return false;

      const settings = await getTicketSettings(interaction.guild.id);
      const relevantRole = ticket.type === 'court' ? settings.courtRoleId : settings.supportRoleId;

      if (!relevantRole || !interaction.member.roles.cache.has(relevantRole)) {
        return interaction.reply({ 
          content: `-# **انت لست من فريق العمل فلن تستطيع استلامها <:emoji_38:1401773302619439147> **`, 
          ephemeral: true 
        });
      }

      if (ticket.claimedBy) {
        const claimer = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
        return interaction.reply({ 
          content: `-# **تم استلامها من قبل ${claimer ? claimer.user : 'إداري آخر'} قبلك <:emoji_40:1475268254028267738> **`, 
          ephemeral: true 
        });
      }

      ticket.claimedBy = interaction.user.id;
      await ticket.save();

      await interaction.channel.send({ 
        content: `-# **تم تعيين ${interaction.user} مسؤولاً عن هذه التذكرة <:new_emoji:1388436089584226387> **`
      });

      await interaction.reply({ 
        content: `-# **تم استلام التذكرة بنجاح <:2thumbup:1467287897429512396> **`, 
        ephemeral: true 
      });
      return true;
    }

    // ===== إغلاق التذكرة =====
    if (interaction.customId === 'close_ticket') {
      const ticket = await getTicketByChannel(interaction.channel.id);
      if (!ticket) return false;

      if (!ticket.claimedBy) {
        return interaction.reply({ 
          content: `-# **انتظروا الى ان يأتي إداري و يغلق التذكرة لما يتأكد ان المشكلة انحلت <:emoji_39:1474950143634706543> **`, 
          ephemeral: true 
        });
      }

      if (ticket.claimedBy !== interaction.user.id) {
        const settings = await getTicketSettings(interaction.guild.id);
        const relevantRole = ticket.type === 'court' ? settings.courtRoleId : settings.supportRoleId;
        const isStaff = relevantRole && interaction.member.roles.cache.has(relevantRole);

        if (isStaff) {
          return interaction.reply({ 
            content: `-# ** الإداري <@${ticket.claimedBy}> مهو مالي عينك ولا ايش <:emoji_38:1401773302619439147> **`, 
            ephemeral: true 
          });
        } else {
          return interaction.reply({ 
            content: `-# **انت لست المسؤول هنا <:s7_discord:1388214117365453062> **`, 
            ephemeral: true 
          });
        }
      }

      await interaction.reply({ content: `-# **جاري إغلاق التذكرة...**` });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
      return true;
    }
  }

  return false;
}

// ==================== onMessage ====================
async function onMessage(client, message) {
  if (!message.guild || message.author.bot) return;
  if (!message.channel.isThread()) return;

  const ticket = await getTicketByChannel(message.channel.id);
  if (!ticket) return;

  // أمر "تعال @منشن"
  if (message.content.startsWith('تعال')) {
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) return;

    if (ticket.claimedBy !== message.author.id) {
      return message.reply({
        content: `-# ** المسؤول بس يقدر يسويها <:emoji_36:1474949953876000950> **`
      });
    }

    try {
      await message.channel.members.add(mentionedUser.id);
      await message.react('✅');
    } catch (error) {
      console.error('❌ خطأ في إضافة عضو للثريد:', error);
      await message.reply({ content: `-# **حدث خطأ أثناء محاولة إضافة العضو.**` });
    }
  }
}

// ==================== فتح تذكرة ====================
async function handleOpenTicket(interaction, client, type) {
  const settings = await getTicketSettings(interaction.guild.id);

  const ticketName = type === 'court' 
    ? `محكمة-${interaction.user.username}` 
    : `دعم-${interaction.user.username}`;

  // البحث عن تذكرة مفتوحة لنفس المستخدم في نفس القناة
  const existingTicket = await Ticket.findOne({ 
    guildId: interaction.guild.id, 
    userId: interaction.user.id,
    type
  });

  if (existingTicket) {
    const thread = await interaction.guild.channels.fetch(existingTicket.channelId).catch(() => null);
    if (thread) {
      return interaction.reply({
        content: `-# ** لديك تذكرة مفتوحة بالفعل: ${thread} <:emoji_46:1473343297002148005> **`,
        ephemeral: true
      });
    } else {
      await Ticket.deleteOne({ _id: existingTicket._id });
    }
  }

  // إنشاء Thread
  const thread = await interaction.channel.threads.create({
    name: ticketName.slice(0, 100),
    autoArchiveDuration: 1440,
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `تذكرة ${type} لـ ${interaction.user.tag}`,
    startMessage: false
  });

  // تسجيل التذكرة
  await createTicket(thread, interaction.user, type);

  // تحضير الأزرار
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('استلام التذكرة')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('إغلاق')
      .setStyle(ButtonStyle.Danger)
  );

  let roleMention = '';
  let content = '';
  const relevantRole = type === 'court' ? settings.courtRoleId : settings.supportRoleId;

  if (type === 'court') {
    roleMention = settings.courtRoleId ? `<@&${settings.courtRoleId}>` : 'فريق المحكمة';
    content = `-# **اهلا بكم في محكمة العدل الرجاء كتابة ما المشكلة و من هم الشهود عليها ان وجدوا <:emoji_35:1474845075950272756> **`;
  } else {
    roleMention = settings.supportRoleId ? `<@&${settings.supportRoleId}>` : 'فريق الدعم';
    content = `-# ** اكتب سبب فتحك للتكت و فريق الدعم بيتواصل معك قريب <:emoji_32:1471962578895769611> **`;
  }

  // المنشن السحري لإضافة الأعضاء بدون رسائل نظام
  let mentions = `${interaction.user}`;
  if (relevantRole) mentions += ` <@&${relevantRole}>`;

  await thread.send({
    content: `${mentions}\n${content}`,
    components: [row]
  });

  await interaction.reply({
    content: `-# **تم تلقي طلبك ${thread} <:new_emoji:1388436089584226387> **`,
    ephemeral: true
  });

  return true;
}

module.exports = {
  onInteraction,
  onMessage
};
