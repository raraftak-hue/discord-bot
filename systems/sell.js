const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schema ====================
const ProductSchema = new mongoose.Schema({
  productId: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  sellerId: String,
  guildId: String,
  name: String,
  description: String,
  price: Number,
  messageId: String,
  channelId: String,
  createdAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true } // بدل sold
});

const PurchaseTicketSchema = new mongoose.Schema({
  productId: String,
  buyerId: String,
  guildId: String,
  channelId: String,
  createdAt: { type: Date, default: Date.now }
});

const Product = mongoose.model('Product', ProductSchema);
const PurchaseTicket = mongoose.model('PurchaseTicket', PurchaseTicketSchema);

// ==================== دوال مساعدة ====================
async function createProductEmbed(product, seller) {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription(
      `**${product.name}**\n\n` +
      `-# **${product.description}**\n\n` +
      `**السعر ${product.price} دينار <:emoji_41:1471619709936996406>**`
    );
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return false;

  // ===== أمر /sell =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'sell') {
    const name = interaction.options.getString('name');
    const description = interaction.options.getString('description');
    const price = interaction.options.getInteger('price');

    const product = new Product({
      sellerId: interaction.user.id,
      guildId: interaction.guild.id,
      name,
      description,
      price,
      channelId: interaction.channel.id,
      isActive: true
    });

    const embed = await createProductEmbed(product, interaction.user);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_${product.productId}`)
        .setLabel('شراء')
        .setStyle(ButtonStyle.Secondary)
    );

    const msg = await interaction.channel.send({ 
      embeds: [embed], 
      components: [row] 
    });

    product.messageId = msg.id;
    await product.save();

    await interaction.reply({ 
      content: `-# **تم نشر منتجك بنجاح <:2thumbup:1467287897429512396> **`, 
      ephemeral: true 
    });
    return true;
  }

  // ===== زر الشراء =====
  if (interaction.isButton() && interaction.customId.startsWith('buy_')) {
    const productId = interaction.customId.split('_')[1];
    const product = await Product.findOne({ productId, isActive: true });
    
    if (!product) {
      return interaction.reply({ 
        content: `-# **هذا المنتج غير متوفر أو تم إلغاؤه <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    // التحقق من إن المشتري مش هو البائع
    if (product.sellerId === interaction.user.id) {
      return interaction.reply({ 
        content: `-# **ما تقدر تشتري منتجك بنفسك <:emoji_464:1388211597197050029> **`, 
        ephemeral: true 
      });
    }

    // التحقق من وجود تذكرة مفتوحة لنفس المنتج للمشتري ده
    const existingTicket = await PurchaseTicket.findOne({
      productId,
      buyerId: interaction.user.id,
      guildId: interaction.guild.id
    });

    if (existingTicket) {
      const channel = await interaction.guild.channels.fetch(existingTicket.channelId).catch(() => null);
      if (channel) {
        return interaction.reply({ 
          content: `-# **انت فاتح تذكرة شراء لنفس المنتج: ${channel} <:emoji_32:1471962578895769611> **`, 
          ephemeral: true 
        });
      } else {
        // لو الروم اتeliminated نمسح السجل
        await PurchaseTicket.deleteOne({ _id: existingTicket._id });
      }
    }

    // جلب بيانات البائع
    const seller = await interaction.guild.members.fetch(product.sellerId).catch(() => null);
    if (!seller) {
      return interaction.reply({ 
        content: `-# **البائع غير موجود في السيرفر <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    // إنشاء تذكرة جديدة
    const ticketName = `شراء-${product.name}-${interaction.user.username}`;
    
    const ticketChannel = await interaction.guild.channels.create({
      name: ticketName.slice(0, 50),
      type: 0,
      parent: null,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: seller.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    // تسجيل التذكرة في قاعدة البيانات
    await PurchaseTicket.create({
      productId,
      buyerId: interaction.user.id,
      guildId: interaction.guild.id,
      channelId: ticketChannel.id
    });

    // رسالة الترحيب في التذكرة
    await ticketChannel.send({
      content: `${seller.user} ${interaction.user}\n-# **اهلا بكم في تذكرة شراء ${product.name}**\n-# **يرجى الترتيب على التفاصيل هنا**`
    });

    await interaction.reply({ 
      content: `-# **تم إنشاء تذكرة شراء: ${ticketChannel} <:2thumbup:1467287897429512396> **`, 
      ephemeral: true 
    });
    return true;
  }

  return false;
}

module.exports = {
  onInteraction
};