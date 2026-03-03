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
  console.log(`📢 [TICKETS] تفاعل جديد - Type: ${interaction.type}, CustomId: ${interaction.customId}, User: ${interaction.user.tag}`);

  if (!interaction.isChatInputCommand() && !interaction.isButton()) {
    console.log(`❌ [TICKETS] مش سلاش ولا زر - نوع التفاعل: ${interaction.type}`);
    return false;
  }

  const guildId = interaction.guild?.id;
  if (!guildId) {
    console.log(`❌ [TICKETS] لا يوجد Guild ID`);
    return false;
  }

  console.log(`✅ [TICKETS] Guild ID: ${guildId}`);

  // ===== أوامر السلاش =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'tic') {
    console.log(`✅ [TICKETS] أمر سلاش tic تم استقباله - Subcommand: ${interaction.options.getSubcommand()}`);
    
    const sub = interaction.options.getSubcommand();
    const settings = await getTicketSettings(guildId);

    if (sub === 'set') {
      console.log(`🔧 [TICKETS] تنفيذ /tic set`);
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
      console.log(`🔧 [TICKETS] تنفيذ /tic panel`);
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
          .setCustomId('ticket_support')
          .setLabel('الدعم الفني')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ticket_court')
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
    console.log(`🔘 [TICKETS] زر مضغوط: ${interaction.customId}`);

    if (interaction.customId === 'ticket_support') {
      console.log(`🎫 [TICKETS] فتح تذكرة دعم`);
      return handleOpenTicket(interaction, client, 'support');
    }

    if (interaction.customId === 'ticket_court') {
      console.log(`🎫 [TICKETS] فتح تذكرة محكمة`);
      return handleOpenTicket(interaction, client, 'court');
    }

    if (interaction.customId === 'ticket_claim') {
      console.log(`🔄 [TICKETS] محاولة استلام تذكرة في: ${interaction.channel.id}`);
      
      let ticket = await Ticket.findOne({ channelId: interaction.channel.id });
      console.log(`📦 [TICKETS] نتيجة البحث في DB: ${ticket ? 'موجودة' : 'غير موجودة'}`);
      
      if (!ticket) {
        console.log(`❌ [TICKETS] التذكرة غير موجودة في DB - Channel ID: ${interaction.channel.id}`);
        return interaction.reply({ 
          content: `-# **التذكرة غير موجودة <:emoji_84:1389404919672340592> **`, 
          ephemeral: true 
        });
      }

      console.log(`📋 [TICKETS] بيانات التذكرة:`, {
        channelId: ticket.channelId,
        type: ticket.type,
        claimedBy: ticket.claimedBy,
        userId: ticket.userId
      });

      const settings = await getTicketSettings(guildId);
      const allowedRoleId = ticket.type === 'court' ? settings.courtRoleId : settings.supportRoleId;
      
      console.log(`👤 [TICKETS] رتبة المستخدمين: support=${settings.supportRoleId}, court=${settings.courtRoleId}, allowed=${allowedRoleId}`);

      if (!allowedRoleId || !interaction.member.roles.cache.has(allowedRoleId)) {
        console.log(`❌ [TICKETS] المستخدم ${interaction.user.id} ليس لديه الرتبة المطلوبة`);
        return interaction.reply({ 
          content: `-# **ما تقدر تستلم هذه التذكرة <:emoji_38:1401773302619439147> **`, 
          ephemeral: true 
        });
      }

      if (ticket.claimedBy) {
        console.log(`⚠️ [TICKETS] التذكرة مستلمة بالفعل بواسطة ${ticket.claimedBy}`);
        const claimer = await interaction.guild.members.fetch(ticket.claimedBy).catch(() => null);
        return interaction.reply({ 
          content: `-# **تم استلامها من ${claimer ? claimer.user : 'شخص آخر'} قبلك <:emoji_40:1475268254028267738> **`, 
          ephemeral: true 
        });
      }

      console.log(`✅ [TICKETS] تم استلام التذكرة بواسطة ${interaction.user.id}`);
      ticket.claimedBy = interaction.user.id;
      await ticket.save();
      console.log(`✅ [TICKETS] تم حفظ الاستلام في DB`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel('استلام التذكرة')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('ticket_close')
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
      console.log(`✅ [TICKETS] تم إكمال استلام التذكرة`);
      return true;
    }

    if (interaction.customId === 'ticket_close') {
      console.log(`🔒 [TICKETS] محاولة إغلاق تذكرة في: ${interaction.channel.id}`);
      
      let ticket = await Ticket.findOne({ channelId: interaction.channel.id });
      
      if (!ticket) {
        console.log(`❌ [TICKETS] التذكرة غير موجودة في DB - Channel ID: ${interaction.channel.id}`);
        return interaction.reply({ 
          content: `-# **التذكرة غير موجودة <:emoji_84:1389404919672340592> **`, 
          ephemeral: true 
        });
      }

      console.log(`📋 [TICKETS] بيانات التذكرة:`, {
        channelId: ticket.channelId,
        type: ticket.type,
        claimedBy: ticket.claimedBy,
        userId: ticket.userId
      });

      if (!ticket.claimedBy) {
        console.log(`⚠️ [TICKETS] التذكرة غير مستلمة بعد`);
        return interaction.reply({ 
          content: `-# **انتظروا إلى أن يأتي أحد ويستلم التذكرة <:emoji_39:1474950143634706543> **`, 
          ephemeral: true 
        });
      }

      if (ticket.claimedBy !== interaction.user.id) {
        console.log(`❌ [TICKETS] المستخدم ${interaction.user.id} ليس المسؤول (المسؤول: ${ticket.claimedBy})`);
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

      console.log(`✅ [TICKETS] تم إغلاق التذكرة بواسطة ${interaction.user.id}`);
      await interaction.reply({ content: `-# **جاري إغلاق التذكرة...**` });
      
      setTimeout(async () => {
        try {
          await interaction.channel.delete();
          console.log(`✅ [TICKETS] تم حذف التذكرة: ${interaction.channel.name}`);
        } catch (error) {
          console.error('❌ [TICKETS] خطأ في حذف التذكرة:', error);
        }
      }, 3000);
      
      return true;
    }

    console.log(`⚠️ [TICKETS] زر غير معروف: ${interaction.customId}`);
    return false;
  }

  console.log(`❌ [TICKETS] تفاعل غير معالج`);
  return false;
}

// ==================== فتح تذكرة ====================
async function handleOpenTicket(interaction, client, type) {
  console.log(`🎫 [TICKETS] بدء فتح تذكرة من نوع ${type}`);
  
  const settings = await getTicketSettings(interaction.guild.id);

  const threadName = type === 'court' 
    ? `محكمة ${interaction.user.username}` 
    : `دعم ${interaction.user.username}`;

  console.log(`📝 [TICKETS] اسم الثريد: ${threadName}`);

  const existingThread = interaction.guild.channels.cache.find(c => 
    c.isThread() && c.name === threadName && !c.archived
  );
  
  if (existingThread) {
    console.log(`⚠️ [TICKETS] تذكرة موجودة بالفعل: ${existingThread.id}`);
    return interaction.reply({
      content: `-# ** لديك تذكرة مفتوحة ما تقدر تفتح اخرى <:emoji_46:1473343297002148005> **`,
      ephemeral: true
    });
  }

  console.log(`🆕 [TICKETS] إنشاء ثريد جديد...`);
  const thread = await interaction.channel.threads.create({
    name: threadName,
    autoArchiveDuration: 1440,
    type: 12,
    invitable: false,
    reason: `${type === 'court' ? 'محكمة' : 'دعم'} لـ ${interaction.user.username}`,
    startMessage: false
  });

  console.log(`✅ [TICKETS] تم إنشاء الثريد: ${thread.id}`);

  let roleId = type === 'court' ? settings.courtRoleId : settings.supportRoleId;
  let roleMentions = roleId ? `<@&${roleId}>` : '';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_claim')
      .setLabel('استلام التذكرة')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('إغلاق')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true)
  );

  let content = type === 'court'
    ? `-# **أهلاً بكم في محكمة العدل الرجاء كتابة ما المشكلة و من هم الشهود عليها إن وجدوا <:emoji_35:1474845075950272756> **`
    : `-# ** اكتب سبب فتحك للتذكرة و فريق الدعم بيتواصل معك قريب <:emoji_32:1471962578895769611> **`;

  await thread.send({
    content: `${interaction.user} ${roleMentions}\n${content}`,
    components: [row]
  });

  console.log(`💾 [TICKETS] حفظ التذكرة في قاعدة البيانات...`);
  const ticket = new Ticket({
    channelId: thread.id,
    guildId: interaction.guild.id,
    userId: interaction.user.id,
    type,
    claimedBy: null
  });
  await ticket.save();
  
  const savedTicket = await Ticket.findOne({ channelId: thread.id });
  console.log(`✅ [TICKETS] تم حفظ التذكرة في DB: ${savedTicket ? 'نعم' : 'لا'}`);

  await interaction.reply({
    content: `-# **تم استلام طلبك ${thread} <:new_emoji:1388436089584226387> **`,
    ephemeral: true
  });

  console.log(`✅ [TICKETS] تم فتح التذكرة بنجاح`);
  return true;
}

module.exports = {
  onInteraction
};