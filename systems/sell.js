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

const SellMentionSchema = new mongoose.Schema({
  guildId: String,
  roleId: String,
  text: { type: String, default: "" },
  deleteAfter: { type: Number, default: null }
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
const SellMention = mongoose.model('SellMention', SellMentionSchema);
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

async function getSellMentionData(guildId) {
  return await SellMention.findOne({ guildId });
}

async function createProductEmbed(product) {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription(
      `**${product.name} <:emoji_35:1474845075950272756> **\n` +
      `-# **${product.description}**\n\n` +
      `**السعر <:emoji_41:1471619709936996406> **\n` +
      `-# ** ${product.price} دينار **`
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

  // ===== أمر /sell-role =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'sell-role') {
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

  // ===== أمر /sell-med =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'sell-med') {
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

  // ===== أمر /sell-mention =====
  if (interaction.isChatInputCommand() && interaction.commandName === 'sell-mention') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ 
        content: `-# **ما عندك صلاحية <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    const roleInput = interaction.options.getString('role');
    const mentionText = interaction.options.getString('text') || "";
    const deleteAfter = interaction.options.getInteger('delete_after');

    if (roleInput === 'حذف') {
      await SellMention.deleteOne({ guildId: interaction.guild.id });
      return interaction.reply({ 
        content: `-# **تم حذف إعدادات المنشن التلقائي بنجاح <:2thumbup:1467287897429512396> **`, 
        ephemeral: true 
      });
    }

    const roleId = roleInput.replace(/[<@&>]/g, '');
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
      return interaction.reply({ 
        content: `-# **رتبة غير صالحة، يرجى منشن الرتبة أو كتابة "حذف" <:emoji_84:1389404919672340592> **`, 
        ephemeral: true 
      });
    }

    await SellMention.findOneAndUpdate(
      { guildId: interaction.guild.id },
      { 
        roleId: role.id,
        text: mentionText,
        deleteAfter: deleteAfter
      },
      { upsert: true }
    );

    await interaction.reply({ 
      content: `-# **تم تعيين إعدادات المنشن: ${role} | النص: ${mentionText || 'لا يوجد'} | وقت الحذف: ${deleteAfter ? deleteAfter + ' ثانية' : 'لا يوجد'} <:2thumbup:1467287897429512396> **`, 
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
    
    // جلب بيانات المنشن التلقائية من قاعدة البيانات
    const mentionData = await getSellMentionData(interaction.guild.id);

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
    
    // إرسال المنشن في رسالة منفصلة إذا كان مفعلاً
    if (mentionData && mentionData.roleId) {
      const mentionContent = `<@&${mentionData.roleId}> ${mentionData.text}`;
      const mentionMsg = await interaction.channel.send({ content: mentionContent });
      
      // الحذف التلقائي للمنشن إذا تم تحديد وقت
      if (mentionData.deleteAfter && mentionData.deleteAfter > 0) {
        setTimeout(() => {
          mentionMsg.delete().catch(() => null);
        }, mentionData.deleteAfter * 1000);
      }
    }

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

  // ===== زر الشراء (نسخة المنشن السحري) =====
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
      const thread = await interaction.guild.channels.fetch(existingTicket.channelId).catch(() => null);
      if (thread) {
        return interaction.reply({ 
          content: `-# **انت فاتح تذكرة شراء لنفس المنتج: ${thread} <:emoji_32:1471962578895769611> **`, 
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

    // إنشاء Thread (باسم بدون فواصل)
    const ticketName = `شراء ${product.name} ${interaction.user.username}`;
    
    const thread = await interaction.channel.threads.create({
      name: ticketName.slice(0, 100),
      autoArchiveDuration: 1440,
      type: 12, // Private Thread
      invitable: false,
      reason: `تذكرة شراء ${product.name}`,
      startMessage: false
    });

    // 🧙‍♂️ السحر هنا: ما نستخدمش thread.members.add أبداً!
    // بنضيف الكل عن طريق المنشن في أول رسالة

    // أزرار الاستلام والإغلاق
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

    // تجهيز المنشن للكل
    let mentions = `${interaction.user} ${seller.user}`; // المشتري + البائع
    
    if (mediatorRoleId) {
      mentions += ` <@&${mediatorRoleId}>`; // منشن لرتبة الوسطاء كلها
    }

    // إضافة المشتري والبائع للثريد لضمان صلاحيات الكتابة
    try {
      await thread.members.add(interaction.user.id);
      await thread.members.add(seller.id);
    } catch (error) {
      console.error('❌ [SELL] خطأ في إضافة الأعضاء للثريد:', error);
    }

    // إرسال الرسالة السحرية (المنشن هيضيف الكل تلقائياً بدون رسائل نظام)
    await thread.send({
      content: `${mentions}\n` +
               `-# **انت الحين في صدد شراء ${product.name} من البائع ${seller.user}**\n` +
               `-# **عند الاتفاق على السعر يفضّل استخدام أحد الوسطاء ${mediatorRoleId ? `<@&${mediatorRoleId}>` : 'الوسطاء'} الي ياخذون ٥٪؜ فقط من المبلغ <:emoji_36:1474949953876000950> **`,
      components: [row, closeRow]
    });

    await PurchaseTicket.create({
      productId,
      buyerId: interaction.user.id,
      guildId: interaction.guild.id,
      channelId: thread.id,
      mediatorId: null
    });

    await interaction.reply({ 
      content: `-# **تم استلام طلبك ${thread} <:new_emoji:1388436089584226387> **`, 
      ephemeral: true 
    });
    return true;
  }

  // ===== زر استلام التذكرة =====
  if (interaction.isButton() && interaction.customId.startsWith('claim_')) {
    const productId = interaction.customId.split('_')[1];
    const mediatorRoleId = await getMediatorRole(interaction.guild.id);
    
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

    if (ticket.mediatorId) {
      const mediator = await interaction.guild.members.fetch(ticket.mediatorId).catch(() => null);
      return interaction.reply({ 
        content: `-# **تم استلامها من وسيط آخر قبلك و هو ${mediator ? mediator.user : 'غير معروف'} <:emoji_40:1475268254028267738> **`, 
        ephemeral: true 
      });
    }

    ticket.mediatorId = interaction.user.id;
    await ticket.save();

    await interaction.channel.send({ 
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

    if (!ticket.mediatorId) {
      return interaction.reply({ 
        content: `-# **انتضروا الى ان يأتي وسيط و يغلق التذكرة لما يتأكد ان العملية صارت بأمان <:emoji_39:1474950143634706543> **`, 
        ephemeral: true 
      });
    }

    if (ticket.mediatorId !== interaction.user.id) {
      const mediatorRoleId = await getMediatorRole(interaction.guild.id);
      const isMediator = mediatorRoleId && interaction.member.roles.cache.has(mediatorRoleId);
      
      if (isMediator) {
        return interaction.reply({ 
          content: `-# ** الوسيط <@${ticket.mediatorId}> مهو مالي عينك ولا ايش <:emoji_38:1401773302619439147> **`, 
          ephemeral: true 
        });
      } else {
        return interaction.reply({ 
          content: `-# **انت لست الوسيط هنا <:s7_discord:1388214117365453062> **`, 
          ephemeral: true 
        });
      }
    }

    await interaction.reply({ content: `-# **جاري إغلاق التذكرة...**` });
    
    setTimeout(async () => {
      try {
        await interaction.channel.delete();
        console.log(`✅ تم حذف الـ Thread: ${interaction.channel.name}`);
      } catch (error) {
        console.error('❌ خطأ في حذف الـ Thread:', error);
      }
    }, 3000);
    
    return true;
  }

  return false;
}

async function onMessage(client, message) {
  if (!message.guild || message.author.bot) return;
  if (!message.channel.isThread()) return;

  // التحقق مما إذا كانت هذه تذكرة شراء
  const ticket = await PurchaseTicket.findOne({ channelId: message.channel.id });
  if (!ticket) return;

  // أمر "تعال @منشن"
  if (message.content.startsWith('تعال')) {
    const mentionedUser = message.mentions.users.first();
    if (!mentionedUser) return;

    // التحقق من أن المرسل هو الوسيط المستلم
    if (ticket.mediatorId !== message.author.id) {
      return message.reply({
        content: `-# ** الوسيط بس يقدر يسويها <:emoji_36:1474949953876000950> **`
      });
    }

    // إضافة العضو للثريد
    try {
      await message.channel.members.add(mentionedUser.id);
      await message.react('✅');
    } catch (error) {
      console.error('❌ خطأ في إضافة عضو للثريد:', error);
      await message.reply({ content: `-# **حدث خطأ أثناء محاولة إضافة العضو.**` });
    }
  }
}

module.exports = {
  onInteraction,
  onMessage
};