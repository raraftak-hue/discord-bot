const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const SellerRoleSchema = new mongoose.Schema({
  guildId: String,
  roleId: String
});

const ProductSchema = new mongoose.Schema({
  productId: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
  sellerId: String,
  guildId: String,
  name: String,
  description: String,
  price: Number,
  messageId: String,
  channelId: String,
  webhookId: String,
  webhookToken: String,
  createdAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true }
});

const PurchaseTicketSchema = new mongoose.Schema({
  productId: String,
  buyerId: String,
  guildId: String,
  channelId: String,
  createdAt: { type: Date, default: Date.now }
});

const SellerRole = mongoose.model('SellerRole', SellerRoleSchema);
const Product = mongoose.model('Product', ProductSchema);
const PurchaseTicket = mongoose.model('PurchaseTicket', PurchaseTicketSchema);

// ==================== دوال مساعدة ====================
async function getSellerRole(guildId) {
  const data = await SellerRole.findOne({ guildId });
  return data?.roleId || null;
}

async function createProductEmbed(product) {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription(
      `**${product.name}**\n` +
      `-# **${product.description}**\n\n` +
      `**السعر ${product.price} دينار <:emoji_41:1471619709936996406>**`
    );
}

async function getOrCreateWebhook(channel, seller) {
  const webhooks = await channel.fetchWebhooks();
  let webhook = webhooks.find(w => w.owner.id === seller.id);
  
  if (!webhook) {
    webhook = await channel.createWebhook({
      name: seller.user.username,
      avatar: seller.user.displayAvatarURL({ extension: 'png' }),
      reason: `Webhook للبائع ${seller.user.tag}`
    });
  }
  
  return webhook;
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand() && !interaction.isButton()) return false;

  // ===== أمر /set-seller-role =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'set-seller-role') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ 
        content: `-# **ما عندك صلاحية <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    const role = interaction.options.getRole('role');

    await SellerRole.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { roleId: role.id },
      { upsert: true }
    );

    await interaction.reply({ 
      content: `-# **تم تعيين رتبة البائعين إلى ${role} <:2thumbup:1467287897429512396> **`, 
      ephemeral: true 
    });
    return true;
  }

  // ===== أمر /sell =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'sell') {
    
    const sellerRoleId = await getSellerRole(interaction.guild.id);
    
    if (!sellerRoleId) {
      return interaction.reply({ 
        content: `-# **لم يتم تحديد رتبة البائعين بعد، تواصل مع الإدارة <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    if (!interaction.member.roles.cache.has(sellerRoleId)) {
      return interaction.reply({ 
        content: `-# **ما تقدر تبيع، أنت لست بائع <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

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

    const embed = await createProductEmbed(product);
    
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`buy_${product.productId}`)
        .setLabel('شراء')
        .setStyle(ButtonStyle.Secondary)
    );

    const webhook = await getOrCreateWebhook(interaction.channel, interaction.member);
    
    const msg = await webhook.send({
      embeds: [embed],
      components: [row],
      wait: true
    });

    product.messageId = msg.id;
    product.webhookId = webhook.id;
    product.webhookToken = webhook.token;
    await product.save();

    await interaction.reply({ 
      content: `-# **تم نشر منتجك بنجاح <:2thumbup:1467287897429512396> **`, 
      ephemeral: true 
    });
    return true;
  }

  // ===== زر الشراء (أي عضو عادي) =====
  if (interaction.isButton() && interaction.customId.startsWith('buy_')) {
    const productId = interaction.customId.split('_')[1];
    const product = await Product.findOne({ productId, isActive: true });
    
    if (!product) {
      return interaction.reply({ 
        content: `-# **هذا المنتج غير متوفر أو تم إلغاؤه <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    if (product.sellerId === interaction.user.id) {
      return interaction.reply({ 
        content: `-# **ما تقدر تشتري منتجك بنفسك <:emoji_464:1388211597197050029> **`, 
        ephemeral: true 
      });
    }

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
        await PurchaseTicket.deleteOne({ _id: existingTicket._id });
      }
    }

    const seller = await interaction.guild.members.fetch(product.sellerId).catch(() => null);
    if (!seller) {
      return interaction.reply({ 
        content: `-# **البائع غير موجود في السيرفر <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

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

    await PurchaseTicket.create({
      productId,
      buyerId: interaction.user.id,
      guildId: interaction.guild.id,
      channelId: ticketChannel.id
    });

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