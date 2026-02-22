const { EmbedBuilder, PermissionsBitField } = require('discord.js');

// ==================== معالج الأوامر النصية ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (command === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return true;
    
    const target = message.mentions.members.first();
    if (!target || target.id === message.author.id) return true;
    
    if (target.permissions.has(PermissionsBitField.Flags.Administrator) || 
        target.roles.highest.position >= message.member.roles.highest.position) {
      await message.channel.send(`-# ** ما تقدر تطرده هو يدعس عليك <:emoji_84:1389404919672340592> **`);
      return true;
    }
    
    if (!target.kickable) {
      await message.channel.send(`-# ** رتبتي اقل من رتبته جرب ترفعني فوق شوي <:emoji_464:1388211597197050029> **`);
      return true;
    }
    
    try {
      await target.kick('طرد من مشرف');
      await message.channel.send(`-# **ما كنت مرتاح له من الاول الصراحة، باي باي <a:Hiiiii:1470461001085354148>**`);
    } catch (e) {
      await message.channel.send(`-# **صارت مشكلة بالطرد <:emoji_84:1389404919672340592> **`);
    }
    return true;
  }

  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return true;
    
    const target = message.mentions.members.first();
    const timeArg = args[2];
    if (!target || !timeArg) return true;
    
    const timeMatch = timeArg.match(/^(\d+)([mhd])$/);
    if (!timeMatch || target.id === message.author.id) return true;
    
    const duration = parseInt(timeMatch[1]);
    const unit = timeMatch[2];
    let milliseconds;
    if (unit === 'm') milliseconds = duration * 60 * 1000;
    else if (unit === 'h') milliseconds = duration * 60 * 60 * 1000;
    else if (unit === 'd') milliseconds = duration * 24 * 60 * 60 * 1000;
    
    if (target.permissions.has(PermissionsBitField.Flags.Administrator) || 
        target.roles.highest.position >= message.member.roles.highest.position) {
      await message.channel.send(`-# ** ما تقدر تعطيه تايم هو يدعس عليك <:emoji_84:1389404919672340592> **`);
      return true;
    }
    
    if (!target.moderatable) {
      await message.channel.send(`-# ** رتبتي اقل من رتبته جرب ترفعني فوق شوي <:emoji_464:1388211597197050029> **`);
      return true;
    }
    
    try {
      await target.timeout(milliseconds, 'تايم من مشرف');
      await message.channel.send(`-# **تم اسكات ${target.user.username} يارب ما يعيدها <a:DancingShark:1469030444774199439>**`);
    } catch (e) {
      await message.channel.send(`-# **صارت مشكلة بالتايم <:emoji_84:1389404919672340592> **`);
    }
    return true;
  }

  if (command === 'تكلم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return true;
    
    const target = message.mentions.members.first();
    if (!target || target.id === message.author.id) return true;
    
    if (target.permissions.has(PermissionsBitField.Flags.Administrator) || 
        target.roles.highest.position >= message.member.roles.highest.position) {
      await message.channel.send(`-# ** ما تقدر تعطيه تايم هو يدعس عليك <:emoji_84:1389404919672340592> **`);
      return true;
    }
    
    if (!target.moderatable) {
      await message.channel.send(`-# ** رتبتي اقل من رتبته جرب ترفعني فوق شوي <:emoji_464:1388211597197050029> **`);
      return true;
    }
    
    try {
      await target.timeout(null);
      await message.channel.send(`-# **تمت مسامحتك ايها العبد ${target.user.username}<:2thumbup:1467287897429512396>**`);
    } catch (e) {
      await message.channel.send(`-# **صارت مشكلة بفك التايم <:emoji_84:1389404919672340592> **`);
    }
    return true;
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return true;
    
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) return true;
    
    try {
      const messages = await message.channel.bulkDelete(amount, true);
      const reply = await message.channel.send(`-# ** تم حذف ${messages.size} رسالة <:2thumbup:1467287897429512396> **`);
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } catch (e) {
      await message.channel.send(`-# **صارت مشكلة بالحذف <:emoji_84:1389404919672340592> **`);
    }
    return true;
  }

  return false;
}

// ==================== onMessage (للرسائل العادية) ====================
async function onMessage(client, message) {
  return;
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;
  const { commandName, options } = interaction;

  if (commandName === 'emb') {
    const title = options.getString('title');
    const description = options.getString('description');
    const colorInput = options.getString('color');
    const imageUrl = options.getString('image');
    const thumbnailUrl = options.getString('thumbnail');
    const footerText = options.getString('footer');
    const addTimestamp = options.getBoolean('timestamp') || false;

    // ✅ التحقق من وجود أي خيار
    if (!title && !description && !imageUrl && !thumbnailUrl && !footerText && !addTimestamp) {
      await interaction.reply({
        content: `-# ** لازم تكتب عنوان، وصف، صورة، أو أي خيار عشان الإيمبيد يشتغل <:emoji_334:1388211595053760663> **`,
        ephemeral: true
      });
      return true;
    }

    let color = 0x2b2d31;
    if (colorInput) {
      const cleanColor = colorInput.replace('#', '');
      if (/^[0-9A-Fa-f]{6}$/.test(cleanColor)) {
        color = parseInt(cleanColor, 16);
      }
    }

    const embed = new EmbedBuilder().setColor(color);

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (imageUrl) embed.setImage(imageUrl);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    if (footerText) embed.setFooter({ text: footerText });
    if (addTimestamp) embed.setTimestamp();

    await interaction.deferReply({ ephemeral: true });
    await interaction.channel.send({ embeds: [embed] });
    await interaction.editReply({ content: `-# ** تم ارسال الإيمبيد <:2thumbup:1467287897429512396> **` });
    return true;
  }

  return false;
}

// ==================== تصدير النظام ====================
module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction
};