const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const TicketSettingsSchema = new mongoose.Schema({
  guildId: String,
  categoryId: { type: String, default: '' },
  embedDescription: { type: String, default: 'اضغط على الزر لفتح تذكرة جديدة.' },
  embedColor: { type: String, default: '2b2d31' },
  embedImage: { type: String, default: null },
  supportRoleId: { type: String, default: null }
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

module.exports = {
  onInteraction: async (client, interaction) => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
    
    if (interaction.isChatInputCommand() && interaction.commandName === 'tic') {
      const sub = interaction.options.getSubcommand();
      const settings = await getTicketSettings(interaction.guild.id);

      if (sub === 'set') {
        const category = interaction.options.getChannel('category');
        const desc = interaction.options.getString('desc');
        const color = interaction.options.getString('color');
        const image = interaction.options.getString('image');
        const role = interaction.options.getRole('role');

        if (category) settings.categoryId = category.id;
        if (desc) settings.embedDescription = desc;
        if (color) settings.embedColor = color.replace('#', '');
        if (image) settings.embedImage = image;
        if (role) settings.supportRoleId = role.id;

        await settings.save();
        return interaction.reply({ content: `-# ** تم تحديث الاعدادات <:2thumbup:1467287897429512396> **`, ephemeral: true });
      }

      if (sub === 'panel') {
        const embed = new EmbedBuilder()
          .setDescription(settings.embedDescription)
          .setColor(parseInt(settings.embedColor, 16) || 0x2b2d31);
        
        if (settings.embedImage) embed.setImage(settings.embedImage);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: `-# **تم ارسال الرسالة <:2thumbup:1467287897429512396> **`, ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'open_ticket') {
        const settings = await getTicketSettings(interaction.guild.id);
        
        const existingChannel = interaction.guild.channels.cache.find(c => c.name === `ticket-${interaction.user.username}`);
        if (existingChannel) {
          return interaction.reply({ content: `-# ** لديك تذكرة مفتوحة ما تقدر تفتح اخرى <:emoji_46:1473343297002148005> **`, ephemeral: true });
        }

        const channel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}`,
          type: ChannelType.GuildText,
          parent: settings.categoryId || null,
          permissionOverwrites: [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
        });

        if (settings.supportRoleId) {
          await channel.permissionOverwrites.create(settings.supportRoleId, {
            ViewChannel: true,
            SendMessages: true
          });
        }

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger)
        );

        let ticketMessage = `${interaction.user}`;
        if (settings.supportRoleId) {
          ticketMessage = `<@&${settings.supportRoleId}> ` + ticketMessage;
        }
        ticketMessage += `\n-# ** اكتب سبب فتحك للتكت و فريق الدعم بيتواصل معك قريب <:emoji_32:1471962578895769611> **`;

        await channel.send({ content: ticketMessage, components: [closeRow] });
        return interaction.reply({ content: `-# ** تم فتح تذكرتك <:emoji_33:1471962823532740739> **`, ephemeral: true });
      }

      if (interaction.customId === 'close_ticket') {
        await interaction.reply({ content: `-# **يلا يلا عد معي ل ثلاثة <:1KazumaGrin:1468386233750392947> **` });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
        return true;
      }
    }
  }
};