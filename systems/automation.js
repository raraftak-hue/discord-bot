const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');

// ==================== 📊 Schema ====================
const autoReactSchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  reaction: String,
  isActive: { type: Boolean, default: true }
});

const autoReplySchema = new mongoose.Schema({
  guildId: String,
  channelId: String,
  reply: String,
  isActive: { type: Boolean, default: true }
});

const AutoReact = mongoose.model('AutoReact', autoReactSchema);
const AutoReply = mongoose.model('AutoReply', autoReplySchema);

// ==================== onMessage ====================
async function onMessage(client, message) {
  if (message.author.bot || !message.guild) return;

  // ريأكشن تلقائي
  const autoReacts = await AutoReact.find({ 
    guildId: message.guild.id, 
    channelId: message.channel.id,
    isActive: true 
  });
  
  for (const react of autoReacts) {
    try { await message.react(react.reaction); } catch (e) {}
  }

  // رد تلقائي (نص)
  const autoReplies = await AutoReply.find({ 
    guildId: message.guild.id, 
    channelId: message.channel.id,
    isActive: true 
  });
  
  for (const reply of autoReplies) {
    try { await message.channel.send(reply.reply); } catch (e) {}
  }
}

// ==================== handleTextCommand ====================
async function handleTextCommand(client, message, command, args, prefix) {
  if (!message.guild) return false;

  if (command === 'فراغ') {
    await message.channel.send('‎');
    await message.delete().catch(() => null);
    return true;
  }

  return false;
}

// ==================== onInteraction ====================
async function onInteraction(client, interaction) {
  if (!interaction.isChatInputCommand()) return false;

  // ===== /react =====
  if (interaction.commandName === 'react') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: `-# **ما عندك صلاحية**`, ephemeral: true });
      return true;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const channel = interaction.options.getChannel('channel');
      const reaction = interaction.options.getString('reaction');
      await AutoReact.findOneAndUpdate(
        { guildId: interaction.guild.id, channelId: channel.id },
        { reaction, isActive: true },
        { upsert: true }
      );
      await interaction.reply({ content: `-# **تم تفعيل الريأكشن ${reaction} في ${channel}**`, ephemeral: true });
      return true;
    }

    if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel');
      await AutoReact.deleteOne({ guildId: interaction.guild.id, channelId: channel.id });
      await interaction.reply({ content: `-# **تم إيقاف الريأكشن في ${channel}**`, ephemeral: true });
      return true;
    }
  }

  // ===== /reply =====
  if (interaction.commandName === 'reply') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      await interaction.reply({ content: `-# **ما عندك صلاحية**`, ephemeral: true });
      return true;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const channel = interaction.options.getChannel('channel');
      const text = interaction.options.getString('text');
      await AutoReply.findOneAndUpdate(
        { guildId: interaction.guild.id, channelId: channel.id },
        { reply: text, isActive: true },
        { upsert: true }
      );
      await interaction.reply({ content: `-# **تم تفعيل الرد في ${channel}**`, ephemeral: true });
      return true;
    }

    if (sub === 'remove') {
      const channel = interaction.options.getChannel('channel');
      await AutoReply.deleteOne({ guildId: interaction.guild.id, channelId: channel.id });
      await interaction.reply({ content: `-# **تم إيقاف الرد في ${channel}**`, ephemeral: true });
      return true;
    }
  }

  return false;
}

module.exports = {
  onMessage,
  handleTextCommand,
  onInteraction
};