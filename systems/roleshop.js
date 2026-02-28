const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schema ====================
const roleShopSchema = new mongoose.Schema({
  guildId: String,
  roleId: String,
  price: Number,
  channelId: String,
  messageId: String
});

const RoleShop = mongoose.model('RoleShop', roleShopSchema);

// ==================== تحديث القائمة ====================
async function updateShopMessage(guild) {
  const items = await RoleShop.find({ guildId: guild.id });
  
  if (items.length === 0) return;

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setDescription(`**الرتب الشرائية <:emoji_41:1471983856440836109>**\n\n`);

  let desc = '';
  for (const item of items) {
    const role = await guild.roles.fetch(item.roleId).catch(() => null);
    if (role) {
      desc += `-# **${role} – ${item.price} دينار <:emoji_41:1471619709936996406> **\n`;
    }
  }

  embed.setDescription(embed.data.description + desc);

  const firstItem = items[0];
  const channel = await guild.channels.fetch(firstItem.channelId).catch(() => null);
  if (!channel) return;

  try {
    const msg = await channel.messages.fetch(firstItem.messageId);
    await msg.edit({ embeds: [embed] });
  } catch {
    const msg = await channel.send({ embeds: [embed] });
    await RoleShop.updateMany({ guildId: guild.id }, { messageId: msg.id });
  }
}

// ==================== onInteraction (سلاش) ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;

  // ===== أمر /shop =====
  if (interaction.commandName === 'shop') {
    const sub = interaction.options.getSubcommand();

    // ✅ /shop add
    if (sub === 'add') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: `-# **ما عندك صلاحية**`, ephemeral: true });
        return true;
      }

      const role = interaction.options.getRole('role');
      const price = interaction.options.getInteger('price');
      const channel = interaction.options.getChannel('channel');

      await RoleShop.findOneAndUpdate(
        { guildId: interaction.guild.id, roleId: role.id },
        { price, channelId: channel.id },
        { upsert: true }
      );

      await updateShopMessage(interaction.guild);
      await interaction.reply({ 
        content: `-# **تم إضافة ${role} للسوق بـ ${price} دينار <:2thumbup:1467287897429512396> **`, 
        ephemeral: true 
      });
      return true;
    }

    // ✅ /shop remove
    if (sub === 'remove') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: `-# **ما عندك صلاحية**`, ephemeral: true });
        return true;
      }

      const role = interaction.options.getRole('role');
      await RoleShop.deleteOne({ guildId: interaction.guild.id, roleId: role.id });
      await updateShopMessage(interaction.guild);
      await interaction.reply({ 
        content: `-# **تم إزالة ${role} من السوق <:2thumbup:1467287897429512396> **`, 
        ephemeral: true 
      });
      return true;
    }
  }

  return false;
}

// ==================== handleTextCommand (للشراء) ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  if (command === 'شراء') {
    // التأكد من وجود منشن رتبة
    if (message.mentions.roles.size === 0) {
      await message.channel.send(`-# **منشن الرتبة اللي تبي تشتريها <:emoji_334:1388211595053760663> **`);
      return true;
    }

    const role = message.mentions.roles.first();
    
    const item = await RoleShop.findOne({ guildId: message.guild.id, roleId: role.id });
    if (!item) {
      await message.channel.send(`-# **هذي الرتبة مو موجودة بالسوق <:emoji_84:1389404919672340592> **`);
      return true;
    }

    const economy = client.systems.get('economy');
    if (!economy) {
      await message.channel.send(`-# **نظام الاقتصاد غير مفعل <:emoji_84:1389404919672340592> **`);
      return true;
    }

    const userData = await economy.getUserData(message.author.id);
    if (userData.balance < item.price) {
      await message.channel.send(`-# **رصيدك ما يكفي (تحتاج ${item.price} دينار) <:emoji_464:1388211597197050029> **`);
      return true;
    }

    // رسالة تأكيد
    const confirmMsg = await message.channel.send({
      content: `-# **بتشتري ${role} بـ ${item.price} دينار؟ اكتب "تأكيد" <:emoji_41:1471619709936996406> **`
    });

    const filter = (m) => m.author.id === message.author.id && m.content === 'تأكيد';
    const collector = message.channel.createMessageCollector({ filter, max: 1, time: 15000 });

    collector.on('collect', async () => {
      // التحقق مرة ثانية من الرصيد
      const freshData = await economy.getUserData(message.author.id);
      if (freshData.balance < item.price) {
        await message.channel.send(`-# **رصيدك تغير، العملية ملغية <:emoji_84:1389404919672340592> **`);
        return;
      }

      // خصم الرصيد
      freshData.balance -= item.price;
      freshData.history.push({
        type: 'ROLE_PURCHASE',
        amount: item.price,
        targetUser: role.id, // تخزين ID الرتبة هنا ليظهر المنشن في السجل
        targetName: role.name,
        date: new Date()
      });
      await freshData.save();

      // إضافة الرتبة فعلياً
      await message.member.roles.add(role.id);

      // تحديث رسالة التأكيد
      await confirmMsg.edit({
        content: `-# **تم شراء ${role} بـ ${item.price} دينار <:2thumbup:1467287897429512396> **`,
        components: []
      });

      // حذف رسالة التأكيد بعد 12 ثانية
      setTimeout(() => {
        confirmMsg.delete().catch(() => null);
      }, 12000);

      // رسالة السجل (بمنشن الرتبة)
      const now = new Date();
      const day = now.getDate();
      const month = now.getMonth() + 1; // الأشهر تبدأ من 0
      await message.channel.send(`-# ** شراء رتبة ${role} بـ ${item.price}دينار في ${day} و ${month} <:emoji_41:1471619709936996406> **`);
    });

    collector.on('end', (collected) => {
      if (collected.size === 0) {
        message.channel.send(`-# **انتهى وقت التأكيد <:new_emoji:1388436095842385931> **`);
      }
    });

    return true;
  }

  return false;
}

module.exports = {
  onInteraction,
  handleTextCommand
};
