const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const cron = require('node-cron');

// ==================== 📊 Schemas ====================
const GlobalSettingsSchema = new mongoose.Schema({
  allowedGuilds: { type: [String], default: [] },
  subscriptions: [{
    guildId: String,
    guildName: String,
    ownerId: String,
    duration: String,
    expiresAt: Date,
    status: { type: String, default: 'active' },
    warned24h: { type: Boolean, default: false }
  }]
});

const GlobalSettings = mongoose.model('GlobalSettings', GlobalSettingsSchema);

// ==================== 🔧 الدوال المساعدة ====================
async function getGlobalSettings() {
  let settings = await GlobalSettings.findOne();
  if (!settings) {
    settings = new GlobalSettings();
    await settings.save();
  }
  return settings;
}

// فحص الاشتراك (لما يدخل سيرفر جديد)
async function checkSubscription(guild) {
  const settings = await getGlobalSettings();
  
  // إذا السيرفر مسموح له، تمام
  if (settings.allowedGuilds.includes(guild.id)) return true;
  
  // إذا لأ، اطرده
  try {
    const owner = await guild.client.users.fetch(guild.ownerId).catch(() => null);
    if (owner) {
      await owner.send(`-# **عذراً، هذا السيرفر غير مشترك في البوت. يرجى التواصل مع المالك للتفعيل.**`);
    }
    await guild.leave();
  } catch (e) {}
  return false;
}

module.exports = {
  onReady: async (client) => {
    // فحص الاشتراكات كل 24 ساعة (الساعة 12 منتصف الليل)
    cron.schedule('0 0 * * *', async () => {
      console.log('🔍 فحص الاشتراكات اليومي...');
      const settings = await getGlobalSettings();
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      
      const initialSubCount = settings.subscriptions.length;
      
      // تنظيف السيرفرات القديمة (بعد 10 أيام من انتهاء الاشتراك)
      settings.subscriptions = settings.subscriptions.filter(sub => {
        if (sub.status === 'expired' && sub.expiresAt < tenDaysAgo) {
          settings.allowedGuilds = settings.allowedGuilds.filter(id => id !== sub.guildId);
          console.log(`🗑️ تم حذف السيرفر ${sub.guildName} بعد 10 أيام من انتهاء الاشتراك`);
          return false;
        }
        return true;
      });
      
      if (settings.subscriptions.length !== initialSubCount) await settings.save();

      // فحص الاشتراكات النشطة
      for (const sub of settings.subscriptions) {
        if (sub.status === 'active') {
          const timeLeft = sub.expiresAt.getTime() - now.getTime();
          
          // تحذير قبل 24 ساعة (مرة واحدة فقط)
          if (timeLeft <= 24 * 60 * 60 * 1000 && timeLeft > 0 && !sub.warned24h) {
            try {
              const guild = await client.guilds.fetch(sub.guildId).catch(() => null);
              if (guild) {
                const owner = await client.users.fetch(guild.ownerId).catch(() => null);
                if (owner) {
                  await owner.send(
                    `-# **عزيزي المشترك، اشتراكك في البوت بينتهي خلال 24 ساعة <:emoji_84:1389404919672340592> **\n` +
                    `-# **سوف يغادر البوت السيرفر تلقائياً بعد انتهاء الاشتراك.**`
                  );
                }
              }
              sub.warned24h = true;
              await settings.save();
            } catch (e) {}
          }
          
          // طرد السيرفرات المنتهية
          if (timeLeft <= 0) {
            sub.status = 'expired';
            await settings.save();
            try {
              const guild = await client.guilds.fetch(sub.guildId).catch(() => null);
              if (guild) {
                const owner = await client.users.fetch(guild.ownerId).catch(() => null);
                if (owner) {
                  await owner.send(
                    `-# **عزيزي المشترك، انتهى اشتراكك في البوت. شكراً لاستخدامك خدماتنا.**`
                  );
                }
                await guild.leave();
                console.log(`👋 تم طرد البوت من ${sub.guildName} (انتهاء الاشتراك)`);
              }
            } catch (e) {}
          }
        }
      }
      
      console.log('✅ تم فحص الاشتراكات');
    });
  },

  onGuildCreate: async (client, guild) => {
    await checkSubscription(guild);
  },

  onMessage: async (client, message) => {
    if (!message.guild) return;
    // فحص سريع للاشتراك (ما يمنع النوم لأنه فقط عند التفاعل)
    const settings = await getGlobalSettings();
    if (!settings.allowedGuilds.includes(message.guild.id)) {
      await message.guild.leave();
    }
  },

  onInteraction: async (client, interaction) => {
    if (!interaction.guild) return false;
    
    // فحص الاشتراك أولاً
    const settings = await getGlobalSettings();
    if (!settings.allowedGuilds.includes(interaction.guild.id)) {
      await interaction.guild.leave();
      return true;
    }
    
    const { commandName, options, user } = interaction;
    const OWNER_ID = "1131951548772122625";

    // أوامر المالك فقط
    if (commandName === 'sub' && user.id === OWNER_ID) {
      const sub = options.getSubcommand();
      
      if (sub === 'add') {
        const serverId = options.getString('id');
        const duration = options.getString('duration');
        
        let guild;
        try {
          guild = await client.guilds.fetch(serverId);
        } catch (e) {
          return interaction.reply({ 
            content: `-# ** البوت غير متواجد في هذا السيرفر <:2thumbup:1467287897429512396> **`, 
            ephemeral: true 
          });
        }
        
        let expiresAt = new Date();
        let durationText = '';
        switch (duration) {
          case 'trial': expiresAt.setDate(expiresAt.getDate() + 3); durationText = 'تجريبي (3 أيام)'; break;
          case '7d': expiresAt.setDate(expiresAt.getDate() + 7); durationText = 'اسبوع'; break;
          case '30d': expiresAt.setDate(expiresAt.getDate() + 30); durationText = 'شهر'; break;
          case '60d': expiresAt.setDate(expiresAt.getDate() + 60); durationText = 'شهرين'; break;
          case '1y': expiresAt.setFullYear(expiresAt.getFullYear() + 1); durationText = 'سنة'; break;
        }
        
        const settings = await getGlobalSettings();
        settings.subscriptions = settings.subscriptions.filter(s => s.guildId !== serverId);
        settings.subscriptions.push({
          guildId: serverId,
          guildName: guild.name,
          ownerId: guild.ownerId,
          duration: durationText,
          expiresAt,
          status: 'active',
          warned24h: false
        });
        
        if (!settings.allowedGuilds.includes(serverId)) {
          settings.allowedGuilds.push(serverId);
        }
        await settings.save();
        
        try {
          const owner = await client.users.fetch(guild.ownerId).catch(() => null);
          if (owner) {
            await owner.send(
              `-# **الخادم ${guild.name} تم تفعيل اشتراكه لمدة ${durationText} <:new_emoji:1388436089584226387> **`
            );
          }
        } catch (e) {}
        
        return interaction.reply({ 
          content: `-# ** تم تفعيل السيرفر بنجاح <:2thumbup:1467287897429512396> **`, 
          ephemeral: true 
        });
      }
      
      if (sub === 'remove') {
        const serverId = options.getString('id');
        const settings = await getGlobalSettings();
        
        settings.subscriptions = settings.subscriptions.filter(s => s.guildId !== serverId);
        settings.allowedGuilds = settings.allowedGuilds.filter(id => id !== serverId);
        await settings.save();
        
        try {
          const guild = await client.guilds.fetch(serverId);
          await guild.leave();
        } catch (e) { }
        
        return interaction.reply({ 
          content: `-# ** تم حذف البوت من السيرفر بنجاح <:emoji_464:1388211597197050029> **`, 
          ephemeral: true 
        });
      }
    }

    if (commandName === 'hosting' && user.id === OWNER_ID) {
      const settings = await getGlobalSettings();
      if (settings.subscriptions.length === 0) {
        return interaction.reply({ 
          content: '⚠️ لا يوجد سيرفرات مشتركة', 
          ephemeral: true 
        });
      }
      
      let activeMsg = '';
      let expiredMsg = '';
      
      for (const sub of settings.subscriptions) {
        if (sub.status === 'active') {
          activeMsg += `-# **الخادم ${sub.guildName} - ${sub.duration} - ينتهي ${new Date(sub.expiresAt).toLocaleDateString('ar')} <:new_emoji:1388436089584226387> **\n`;
        } else {
          expiredMsg += `-# **الخادم ${sub.guildName} منتهي الاشتراك <:new_emoji:1388436095842385931> **\n`;
        }
      }
      
      const embed = new EmbedBuilder()
        .setDescription(`**الخوادم المشتركة <:emoji_41:1471983856440836109>**\n\n${activeMsg}\n${expiredMsg}`)
        .setColor(0x2b2d31);
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    return false;
  }
};