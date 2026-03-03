const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schemas ====================
const SellerRoleSchema = new mongoose.Schema({
  guildId: String,
  roleId: String
});

const MediatorRoleSchema = new mongoose.Schema({
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
  mediatorId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const SellerRole = mongoose.model('SellerRole', SellerRoleSchema);
const MediatorRole = mongoose.model('MediatorRole', MediatorRoleSchema);
const Product = mongoose.model('Product', ProductSchema);
const PurchaseTicket = mongoose.model('PurchaseTicket', PurchaseTicketSchema);

// ==================== دوال مساعدة ====================
async function getSellerRole(guildId) {
  const data = await SellerRole.findOne({ guildId });
  return data?.roleId || null;
}

async function getMediatorRole(guildId) {
  const data = await MediatorRole.findOne({ guildId });
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

  // ===== أمر /set-mediator-role =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'set-mediator-role') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ 
        content: `-# **ما عندك صلاحية <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    const role = interaction.options.getRole('role');

    await MediatorRole.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { roleId: role.id },
      { upsert: true }
    );

    await interaction.reply({ 
      content: `-# **تم تعيين رتبة الوسطاء إلى ${role} <:2thumbup:1467287897429512396> **`, 
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

    // جلب رتبة الوسيط
    const mediatorRoleId = await getMediatorRole(interaction.guild.id);
    const mediatorRole = mediatorRoleId ? `<@&${mediatorRoleId}>` : 'وسيط';

    // إنشاء تذكرة
    const ticketName = `شراء-${product.name}-${interaction.user.username}`;
    
    const ticketChannel = await interaction.guild.channels.create({
      name: ticketName.slice(0, 50),
      type: 0,
      parent: null,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: seller.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: mediatorRoleId ? mediatorRoleId : null, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }.filter(p => p.id !== null),
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    await PurchaseTicket.create({
      productId,
      buyerId: interaction.user.id,
      guildId: interaction.guild.id,
      channelId: ticketChannel.id,
      mediatorId: null
    });

    // زر واحد للاستلام + زر الإغلاق
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_${productId}`)
        .setLabel('استلام التذكرة')
        .setStyle(ButtonStyle.Secondary)
    );

    const closeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_${productId}`)
        .setLabel('إغلاق')
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `${seller.user} ${interaction.user}\n` +
               `-# **انت الحين في صدد شراء ${product.name} من البائع ${seller.user}**\n` +
               `-# **عند الاتفاق على السعر يفضّل استخدام أحد الوسطاء ${mediatorRole} الي ياخذون ٥٪؜ فقط من المبلغ <:emoji_36:1474949953876000950> **`,
      components: [row, closeRow]
    });

    // رسالة الاستلام الجديدة
    await interaction.reply({ 
      content: `-# **تم استلام طلبك ${ticketChannel} <:new_emoji:1388436089584226387> **`, 
      ephemeral: true 
    });
    return true;
  }

  // ===== زر استلام التذكرة =====
  if (interaction.isButton() && interaction.customId.startsWith('claim_')) {
    const productId = interaction.customId.split('_')[1];
    const mediatorRoleId = await getMediatorRole(interaction.guild.id);
    
    // التحقق من رتبة الوسيط
    if (!mediatorRoleId || !interaction.member.roles.cache.has(mediatorRoleId)) {
      return interaction.reply({ 
        content: `-# **انت لست وسيطاً فلن تستطيع استلامها <:emoji_38:1401773302619439147> **`, 
        ephemeral: true 
      });
    }

    const ticket = await PurchaseTicket.findOne({ productId, guildId: interaction.guild.id });
    if (!ticket) {
      return interaction.reply({ 
        content: `-# **التذكرة غير موجودة <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    // التحقق إذا كانت التذكرة مستلمة من قبل
    if (ticket.mediatorId) {
      const mediator = await interaction.guild.members.fetch(ticket.mediatorId).catch(() => null);
      return interaction.reply({ 
        content: `-# **تم استلامها من وسيط آخر قبلك و هو ${mediator ? mediator.user : 'غير معروف'} <:emoji_40:1475268254028267738> **`, 
        ephemeral: true 
      });
    }

    // استلام التذكرة
    ticket.mediatorId = interaction.user.id;
    await ticket.save();

    // تحديث صلاحيات الروم
    const channel = interaction.channel;
    await channel.permissionOverwrites.edit(interaction.user.id, {
      ViewChannel: true,
      SendMessages: true
    });

    // إرسال رسالة التعيين في الروم (الكل يشوفها)
    await channel.send({ 
      content: `-# **تم تعيين ${interaction.user} وسيطاً لهذه العملية <:new_emoji:1388436089584226387> **`
    });

    await interaction.reply({ 
      content: `-# **تم استلام التذكرة بنجاح <:2thumbup:1467287897429512396> **`, 
      ephemeral: true 
    });
    return true;
  }

  // ===== زر إغلاق التذكرة =====
  if (interaction.isButton() && interaction.customId.startsWith('close_')) {
    const productId = interaction.customId.split('_')[1];
    const ticket = await PurchaseTicket.findOne({ productId, guildId: interaction.guild.id });

    if (!ticket) {
      return interaction.reply({ 
        content: `-# **التذكرة غير موجودة <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    // إذا لم يتم استلام التذكرة بعد
    if (!ticket.mediatorId) {
      return interaction.reply({ 
        content: `-# **انتضروا الى ان يأتي وسيط و يغلق التذكرة لما يتأكد ان العملية صارت بأمان <:emoji_39:1474950143634706543> **`, 
        ephemeral: true 
      });
    }

    // إذا كان المستخدم ليس الوسيط
    if (ticket.mediatorId !== interaction.user.id) {
      return interaction.reply({ 
        content: `-# **انت لست الوسيط هنا <:s7_discord:1388214117365453062> **`, 
        ephemeral: true 
      });
    }

    // إغلاق التذكرة
    await interaction.reply({ content: `-# **جاري إغلاق التذكرة...**` });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    return true;
  }

  return false;
}

module.exports = {
  onInteraction
};