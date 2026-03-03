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
  channelId: { type: String, required: true },
  guildId: String,
  userId: String,
  type: String,
  claimedBy: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

// فهرسة عشان البحث يبقى أسرع
TicketSchema.index({ channelId: 1 });

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

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return false;

  const guildId = interaction.guild?.id;
  if (!guildId) return false;

  // ===== أوامر السلاش =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'tic') {
    const sub = interaction.options.getSubcommand();
    const settings = await getTicketSettings(guildId);

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
    if (interaction.customId === 'open_ticket_support') {
      return handleOpenTicket(interaction, client, 'support');
    }

    if (interaction.customId === 'open_ticket_court') {
      return handleOpenTicket(interaction, client, 'court');
    }

    if (interaction.customId === 'claim_ticket') {
      // البحث عن التذكرة
      let ticket = await Ticket.findOne({ channelId: interaction.channel.id });
      
      if (!ticket) {
        return interaction.reply({ 
          content: `-# **حدث خطأ في تحميل التذكرة، حاول مرة أخرى <:emoji_84:1389404919672340592> **`, 
          ephemeral: true 
        });
      }

      const settings = await getTicketSettings(guildId);
      const allowedRoleId = ticket.type === 'court' ? settings.courtRoleId : settings.supportRoleId;
      
      if (!allowedRoleId || !interaction.member.roles.cache.has(allowedRoleId)) {
        return interaction.reply({ 
          content: `-# **ما تقدر تستلم هذه التذكرة <:emoji_38:1401773302619439147> **`, 
          ephemeral: true 
        });
      }

      if (ticket.claimedBy) {
        const claimer = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
        return interaction.reply({ 
          content: `-# **تم استلامها من ${claimer ? claimer.user : 'شخص آخر'} قبلك <:emoji_40:1475268254028267738> **`, 
          ephemeral: true 
        });
      }

      ticket.claimedBy = interaction.user.id;
      await ticket.save();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('claim_ticket')
          .setLabel('استلام التذكرة')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('إغلاق')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(false)
      );

      await interaction.message.edit({ components: [row] });

      await interaction.channel.send({ 
        content: `-# **تم تعيين ${interaction.user} مسؤولاً عن هذه التذكرة <:new_emoji:1388436089584226387> **`
      });

      await interaction.reply({ 
        content: `-# **تم استلام التذكرة بنجاح <:2thumbup:1467287897429512396> **`, 
        ephemeral: true 
      });
      return true;
    }

    if (interaction.customId === 'close_ticket') {
      let ticket = await Ticket.findOne({ channelId: interaction.channel.id });
      
      if (!ticket) {
        return interaction.reply({ 
          content: `-# **التذكرة غير موجودة <:emoji_84:1389404919672340592> **`, 
          ephemeral: true 
        });
      }

      if (!ticket.claimedBy) {
        return interaction.reply({ 
          content: `-# **انتظروا إلى أن يأتي أحد ويستلم التذكرة <:emoji_39:1474950143634706543> **`, 
          ephemeral: true 
        });
      }

      if (ticket.claimedBy !== interaction.user.id) {
        const settings = await getTicketSettings(guildId);
        const allowedRoleId = ticket.type === 'court' ? settings.courtRoleId : settings.supportRoleId;
        const hasRole = allowedRoleId && interaction.member.roles.cache.has(allowedRoleId);
        
        if (hasRole) {
          return interaction.reply({ 
            content: `-# **المسؤول عن التذكرة <@${ticket.claimedBy}> هو اللي يقفلها <:emoji_38:1401773302619439147> **`, 
            ephemeral: true 
          });
        } else {
          return interaction.reply({ 
            content: `-# **أنت لست مسؤول التذكرة هنا <:s7_discord:1388214117365453062> **`, 
            ephemeral: true 
          });
        }
      }

      await interaction.reply({ content: `-# **جاري إغلاق التذكرة...**` });
      
      setTimeout(async () => {
        try {
          await interaction.channel.delete();
          console.log(`✅ تم حذف التذكرة: ${interaction.channel.name}`);
        } catch (error) {
          console.error('❌ خطأ في حذف التذكرة:', error);
        }
      }, 3000);
      
      return true;
    }
  }

  return false;
}

// ==================== فتح تذكرة ====================
async function handleOpenTicket(interaction, client, type) {
  const settings = await getTicketSettings(interaction.guild.id);

  const threadName = type === 'court' 
    ? `محكمة-${interaction.user.username}` 
    : `دعم-${interaction.user.username}`;

  const existingThread = interaction.guild.channels.cache.find(c => 
    c.isThread() && c.name === threadName && !c.archived
  );
  
  if (existingThread) {
    return interaction.reply({
      content: `-# ** لديك تذكرة مفتوحة ما تقدر تفتح اخرى <:emoji_46:1473343297002148005> **`,
      ephemeral: true
    });
  }

  const thread = await interaction.channel.threads.create({
    name: threadName,
    autoArchiveDuration: 1440,
    type: 12, // Private Thread
    invitable: false,
    reason: `${type === 'court' ? 'محكمة' : 'دعم'} لـ ${interaction.user.username}`,
    startMessage: false
  });

  // 🧙‍♂️ تم إلغاء thread.members.add(interaction.user.id) لتقليل رسائل النظام المزعجة
  // ديسكورد يضيف الشخص تلقائياً عند منشنته في Private Thread

  let roleId = type === 'court' ? settings.courtRoleId : settings.supportRoleId;
  let roleMentions = roleId ? `<@&${roleId}>` : '';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('استلام التذكرة')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('إغلاق')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );

  let content = type === 'court'
    ? `-# **أهلاً بكم في محكمة العدل الرجاء كتابة ما المشكلة و من هم الشهود عليها إن وجدوا <:emoji_35:1474845075950272756> **`
    : `-# ** اكتب سبب فتحك للتذكرة و فريق الدعم بيتواصل معك قريب <:emoji_32:1471962578895769611> **`;

  // إرسال المنشن في أول رسالة يضيف الكل تلقائياً بدون رسائل نظام مزعجة
  await thread.send({
    content: `${interaction.user} ${roleMentions}\n${content}`,
    components: [row]
  });

  // تسجيل التذكرة في قاعدة البيانات (نتأكد من استخدام thread.id)
  const ticket = new Ticket({
    channelId: thread.id,
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    type,
    claimedBy: null
  });
  await ticket.save();

  await interaction.reply({
    content: `-# **تم استلام طلبك ${thread} <:new_emoji:1388436089584226387> **`,
    ephemeral: true
  });

  return true;
}

module.exports = {
  onInteraction
};
