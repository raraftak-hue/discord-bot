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
    const { guild, user, customId, commandName, options } = interaction;

    if (interaction.isChatInputCommand() && commandName === 'tic') {
      const sub = options.getSubcommand();
      const settings = await getTicketSettings(guild.id);

      if (sub === 'set') {
        const category = options.getChannel('category');
        const desc = options.getString('desc');
        const color = options.getString('color');
        const image = options.getString('image');
        const role = options.getRole('role');

        if (category) settings.categoryId = category.id;
        if (desc) settings.embedDescription = desc;
        if (color) settings.embedColor = color;
        if (image) settings.embedImage = image;
        if (role) settings.supportRoleId = role.id;

        await settings.save();
        return interaction.reply({ content: `-# ** تم حفظ إعدادات التذاكر بنجاح <:2thumbup:1467287897429512396> **`, ephemeral: true });
      }

      if (sub === 'panel') {
        const embed = new EmbedBuilder()
          .setDescription(settings.embedDescription)
          .setColor(parseInt(settings.embedColor.replace('#', ''), 16) || 0x2b2d31);
        
        if (settings.embedImage) embed.setImage(settings.embedImage);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Primary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: `-# ** تم إرسال لوحة التذاكر <:2thumbup:1467287897429512396> **`, ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      if (customId === 'open_ticket') {
        const settings = await getTicketSettings(guild.id);
        const ticketName = `ticket-${user.username}`;
        
        const existingChannel = guild.channels.cache.find(c => c.name === ticketName.toLowerCase());
        if (existingChannel) return interaction.reply({ content: `-# ** عندك تذكرة مفتوحة أصلاً: <#${existingChannel.id}> **`, ephemeral: true });

        const permissionOverwrites = [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] }
        ];

        if (settings.supportRoleId) {
          permissionOverwrites.push({ id: settings.supportRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
        }

        const channel = await guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          parent: settings.categoryId || null,
          permissionOverwrites
        });

        const embed = new EmbedBuilder()
          .setDescription(`-# **أهلاً بك في تذكرتك <@${user.id}>، سيقوم فريق الدعم بالرد عليك قريباً.**`)
          .setColor(0x2b2d31);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger)
        );

        await channel.send({ content: `<@${user.id}> ${settings.supportRoleId ? `<@&${settings.supportRoleId}>` : ''}`, embeds: [embed], components: [row] });
        return interaction.reply({ content: `-# ** تم فتح التذكرة: <#${channel.id}> **`, ephemeral: true });
      }

      if (customId === 'close_ticket') {
        await interaction.reply({ content: `-# ** سيتم إغلاق التذكرة خلال 5 ثوانٍ... **` });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      }
    }
  }
};
