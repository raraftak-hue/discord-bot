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

const TicketSettings = mongoose.model('TicketSettings', TicketSettingsSchema);

// ==================== 🔧 الدوال المساعدة ====================
async function getTicketSettings(guildId) {
  let settings = await TicketSettings.findOne({ guildId });
  if (!settings) {
    settings = new TicketSettings({ guildId });
    await settings.save();
  }
  return settings;
}

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
    { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, // @everyone ممنوع
    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }, // صاحب التذكرة
    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] } // البوت
  ];

  // ✅ إضافة الرتبة المناسبة للصلاحيات
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

  // إنشاء الروم مع الصلاحيات الكاملة
  const channel = await interaction.guild.channels.create({
    name: roomName,
    type: ChannelType.GuildText,
    parent: settings.categoryId || null,
    permissionOverwrites: permissionOverwrites
  });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger)
  );

  // إرسال رسالة الترحيب مع منشن الرتبة (اختياري الآن)
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
  onInteraction: async (client, interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return false;

    if (interaction.isChatInputCommand() && interaction.commandName === 'tic') {
      const sub = interaction.options.getSubcommand();
      const settings = await getTicketSettings(interaction.guild.id);

      if (sub === 'set') {
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

    if (interaction.isButton()) {
      if (interaction.customId === 'open_ticket_support') {
        return handleOpenTicket(interaction, client, 'support');
      }

      if (interaction.customId === 'open_ticket_court') {
        return handleOpenTicket(interaction, client, 'court');
      }

      if (interaction.customId === 'close_ticket') {
        await interaction.reply({ content: `-# **احسب الين ثلاثة **` });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        return true;
      }
    }

    return false;
  }
};