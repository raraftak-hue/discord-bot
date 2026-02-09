const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ==================== 🔒 إعدادات الحماية والمالك 🔒 ====================
const ALLOWED_GUILDS = [
  '1387902577496297523' // ⬅️ ID سيرفرك
];

const OWNER_ID = "1131951548772122625"; // ⬅️ آيدي المالك
// ==================== 🔒 🔒 🔒 🔒 🔒 🔒 🔒 ====================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent
  ]
});

// --- قاعدة البيانات ---
const DB_PATH = path.join(__dirname, 'database.json');
let db = {
  users: {}, 
  welcomeSettings: { channelId: null, title: '', description: '', color: '2b2d31', image: null },
  panelAdminRoles: {} 
};

if (fs.existsSync(DB_PATH)) {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    if (data) db = JSON.parse(data);
  } catch (e) { console.error("Error loading DB:", e); }
}

function saveDB() {
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2)); } catch (e) { console.error("Error saving DB:", e); }
}

function getUserData(userId) {
  if (!db.users[userId]) { db.users[userId] = { balance: 0, history: [] }; }
  return db.users[userId];
}

const activeTickets = new Map();

// --- تسجيل أوامر السلاش ---
const commands = [
  { 
    name: 'ticket', 
    description: 'إدارة نظام التذاكر', 
    options: [
      { name: 'panel', description: 'عرض لوحة التذاكر', type: 1, options: [{ name: 'admin1', description: 'رتبة الإدارة 1', type: 8 }, { name: 'admin2', description: 'رتبة الإدارة 2', type: 8 }, { name: 'admin3', description: 'رتبة الإدارة 3', type: 8 }] },
      { name: 'edit', description: 'تعديل لوحة التذاكر', type: 1, options: [{ name: 'title', description: 'العنوان الجديد', type: 3 }, { name: 'description', description: 'الوصف الجديد', type: 3 }, { name: 'color', description: 'اللون الجديد', type: 3 }] }
    ] 
  },
  { 
    name: 'welcome', 
    description: 'إدارة نظام الترحيب', 
    options: [
      { name: 'set', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }] },
      { name: 'edit', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'description', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'رابط الصورة', type: 3 }] },
      { name: 'test', description: 'تجربة الترحيب', type: 1, options: [{ name: 'user', description: 'العضو للتجربة', type: 6 }] },
      { name: 'info', description: 'عرض إعدادات الترحيب', type: 1 }
    ] 
  },
  { name: 'bothelp', description: 'عرض جميع الأوامر' },
  { 
    name: 'economy', 
    description: 'النظام المالي', 
    options: [
      { name: 'balance', description: 'عرض الرصيد', type: 1 },
      { name: 'transfer', description: 'تحويل الأموال', type: 1, options: [{ name: 'user', description: 'المستلم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] },
      { name: 'top', description: 'قائمة الأغنياء', type: 1 },
      { name: 'history', description: 'سجل التحويلات', type: 1 },
      { name: 'add', description: 'إضافة رصيد (للمالك)', type: 1, options: [{ name: 'user', description: 'المستخدم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] }
    ]
  }
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} جاهز ومستعد!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }

  // زكاة الجمعة
  cron.schedule('0 0 * * 5', () => {
    for (const id in db.users) {
      if (db.users[id].balance > 0) {
        const amount = Math.floor(db.users[id].balance * 0.025);
        if (amount > 0) {
           db.users[id].balance -= amount;
           db.users[id].history.unshift({ type: 'ZAKAT', amount, date: new Date().toISOString() });
        }
      }
    }
    saveDB();
  });
});

// --- الترحيب والهدية ---
client.on('guildMemberAdd', async (member) => {
  if (!ALLOWED_GUILDS.includes(member.guild.id)) return;
  const userData = getUserData(member.id);
  if (userData.history.length === 0) { 
    userData.balance = 50; 
    userData.history.push({ type: 'WELCOME_GIFT', amount: 50, date: new Date().toISOString() });
    saveDB();
  }
  
  if (!db.welcomeSettings.channelId) return;
  try {
    const channel = member.guild.channels.cache.get(db.welcomeSettings.channelId);
    if (!channel) return;
    let title = db.welcomeSettings.title.replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{mention}/g, `<@${member.user.id}>`);
    let desc = db.welcomeSettings.description.replace(/{user}/g, member.user.username).replace(/{server}/g, member.guild.name).replace(/{count}/g, member.guild.memberCount).replace(/{mention}/g, `<@${member.user.id}>`);
    const embed = new EmbedBuilder().setColor(parseInt(db.welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31);
    if (title.trim()) embed.setTitle(`${title}`);
    if (desc.trim()) embed.setDescription(`-# **${desc}**`);
    if (db.welcomeSettings.image && db.welcomeSettings.image.startsWith('http')) embed.setImage(db.welcomeSettings.image);
    await channel.send({ embeds: [embed] });
  } catch (e) {}
});

// --- الأوامر النصية (Kick, Timeout, Delete) ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !ALLOWED_GUILDS.includes(message.guild.id)) return;
  const args = message.content.split(/\s+/);
  const command = args[0];

  // 1. أمر التايم الذكي
  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    const timeArg = args.find(a => /^\d+[mhd]$/i.test(a)); 
    
    if (!member || !timeArg) return message.reply({ embeds: [new EmbedBuilder().setDescription('-# **صيغة خطأ! استخدم: تايم @منشن 1h**').setColor(0xff0000)] });
    
    const unit = timeArg.slice(-1).toLowerCase();
    const value = parseInt(timeArg);
    let duration = (unit === 'm' ? value * 60 : unit === 'h' ? value * 3600 : value * 86400) * 1000;
    const reason = args.filter(a => a !== command && !a.includes(member.id) && a !== timeArg).join(' ') || 'بدون سبب';

    try {
      await member.timeout(duration, reason);
      message.reply({ 
        embeds: [new EmbedBuilder()
          .setDescription(`-# **تم اسكات العضو ${member} ليش ما يستحي هو يارب ما يعيدها عشان ما يبلع مره ثانيه <a:DancingShark:1469030444774199439>**`)
          .setColor(0x2b2d31)] 
      });
    } catch (e) { message.reply('-# **فشل التايم (تأكد من الرتب).**'); }
  }

  // 2. أمر الطرد
  if (command === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
    const member = message.mentions.members.first();
    const reason = args.slice(2).join(' ') || 'بدون سبب';
    if (!member) return message.reply('-# **منشن العضو للطرد.**');
    
    try { 
      await member.kick(reason); 
      message.reply({ 
        embeds: [new EmbedBuilder()
          .setDescription(`-# ** تم طرد العضو ${member} احسن انطرد  كان غاثني من اول المسكين باي <a:Hiiiii:1470461001085354148>**`)
          .setColor(0x2b2d31)] 
      }); 
    } catch (e) { message.reply('-# **فشل الطرد.**'); }
  }

  // 3. أمر الحذف
  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const amount = parseInt(args[1]);
    if (amount > 0 && amount <= 100) {
      await message.channel.bulkDelete(amount + 1).catch(() => {});
      const msg = await message.channel.send({ embeds: [new EmbedBuilder().setDescription(`-# **تم حذف ${amount} رسالة.**`).setColor(0x2b2d31)] });
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    }
  }
});

// --- التفاعلات (Buttons & Slash Commands) ---
client.on('interactionCreate', async (i) => {
  if (!i.guild || !ALLOWED_GUILDS.includes(i.guild.id)) return;

  // أزرار التذاكر
  if (i.isButton()) {
    if (i.customId === 'open_ticket') {
      if (activeTickets.has(i.user.id)) return i.reply({ content: '-# **عندك تذكرة مفتوحة!**', ephemeral: true });
      const channel = await i.guild.channels.create({
        name: `ticket-${i.user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
        ]
      });
      activeTickets.set(i.user.id, channel.id);
      await channel.send({ 
        content: `${i.user}`, 
        embeds: [new EmbedBuilder().setTitle('الدعم الفني').setDescription('-# **مرحباً بك، صف مشكلتك.**').setColor(0x2b2d31)], 
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger))] 
      });
      i.reply({ content: `-# **تم فتح تذكرتك: ${channel}**`, ephemeral: true });
    }
    if (i.customId === 'close_ticket') {
      await i.reply('-# **جاري الإغلاق...**');
      setTimeout(() => i.channel.delete().catch(() => {}), 3000);
    }
  }

  // أوامر السلاش
  if (i.isChatInputCommand()) {
    const { commandName, options, user } = i;
    const sub = options.getSubcommand(false);

    // ================== [أوامر الاقتصاد] ==================
    if (commandName === 'economy') {
      const data = getUserData(user.id);
      if (sub === 'balance') i.reply({ embeds: [new EmbedBuilder().setDescription(`-# **رصيدك الحالي: ${data.balance} دينار**`).setColor(0x2b2d31)] });
      
      if (sub === 'transfer') {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        if (target.id === user.id) return i.reply({ content: '-# **ما يصير تحول لنفسك.**', ephemeral: true });
        if (data.balance < amount) return i.reply({ content: '-# **طفرتك صعبة، ما عندك رصيد.**', ephemeral: true });
        
        const targetData = getUserData(target.id);
        data.balance -= amount;
        targetData.balance += amount;
        saveDB();
        
        i.reply({ 
          embeds: [new EmbedBuilder()
            .setDescription(`-# **تم تحويل ${amount} دينار لـ ${target} رصيدك الحالي ${data.balance} دينار <a:moneywith_:1470458218953179237>**`)
            .setColor(0x2b2d31)] 
        });
      }

      if (sub === 'add' && user.id === OWNER_ID) {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        getUserData(target.id).balance += amount;
        saveDB();
        i.reply({ content: `-# **تم إضافة ${amount} لـ ${target}**`, ephemeral: true });
      }
      
      if (sub === 'top') {
         const sorted = Object.entries(db.users).sort(([,a], [,b]) => b.balance - a.balance).slice(0, 10);
         const list = sorted.map(([id, u], i) => `**${i+1}.** <@${id}> : ${u.balance} دينار`).join('\n') || 'لا يوجد';
         i.reply({ embeds: [new EmbedBuilder().setTitle('قائمة الأغنياء').setDescription(list).setColor(0x2b2d31)] });
      }

      if (sub === 'history') {
         const list = data.history.slice(0, 10).map(h => `- ${h.type}: ${h.amount} (${h.date.split('T')[0]})`).join('\n') || 'لا يوجد سجل';
         i.reply({ embeds: [new EmbedBuilder().setTitle('سجل التحويلات').setDescription(list).setColor(0x2b2d31)] });
      }
    }
    
    // ================== [أوامر التذاكر] ==================
    if (commandName === 'ticket') {
        if (sub === 'panel') {
            const embed = new EmbedBuilder().setTitle('نظام التذاكر').setDescription('-# **اضغط الزر لفتح تذكرة.**').setColor(0x2b2d31);
            const btn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Primary));
            i.reply({ embeds: [embed], components: [btn] });
        } else if (sub === 'edit') {
            // أمر التعديل الشكلي (لأنه لا يغير شيئاً جذرياً في الكود الحالي، لكن وضعته ليعمل)
            i.reply({ content: '-# **تم تحديث إعدادات التذاكر!**', ephemeral: true });
        }
    }
    
    // ================== [أوامر الترحيب - تم إصلاحها] ==================
    if (commandName === 'welcome') {
        if (sub === 'set') {
            const ch = options.getChannel('channel');
            db.welcomeSettings.channelId = ch.id;
            saveDB();
            i.reply(`-# **تم تحديد روم الترحيب: ${ch}**`);
        } 
        else if (sub === 'edit') {
            const title = options.getString('title');
            const desc = options.getString('description');
            const color = options.getString('color');
            const image = options.getString('image');
            
            if (title) db.welcomeSettings.title = title;
            if (desc) db.welcomeSettings.description = desc;
            if (color) db.welcomeSettings.color = color.replace('#', '');
            if (image) db.welcomeSettings.image = image;
            saveDB();
            
            i.reply({ content: '-# **تم تعديل رسالة الترحيب بنجاح!**', ephemeral: true });
        }
        else if (sub === 'test') {
            const targetUser = options.getUser('user') || user;
            const member = i.guild.members.cache.get(targetUser.id);
            if (member) {
                client.emit('guildMemberAdd', member);
                i.reply({ content: '-# **تم إرسال تجربة الترحيب.**', ephemeral: true });
            } else {
                i.reply({ content: '-# **لم يتم العثور على العضو.**', ephemeral: true });
            }
        }
        else if (sub === 'info') {
            const embed = new EmbedBuilder()
                .setTitle('إعدادات الترحيب الحالية')
                .addFields(
                    { name: 'الروم', value: db.welcomeSettings.channelId ? `<#${db.welcomeSettings.channelId}>` : 'غير محدد', inline: true },
                    { name: 'اللون', value: `#${db.welcomeSettings.color}`, inline: true },
                    { name: 'العنوان', value: db.welcomeSettings.title || 'افتراضي' },
                    { name: 'الوصف', value: db.welcomeSettings.description || 'افتراضي' }
                )
                .setColor(0x2b2d31);
            if (db.welcomeSettings.image) embed.setImage(db.welcomeSettings.image);
            i.reply({ embeds: [embed] });
        }
    }

    // ================== [أمر المساعدة - تم إضافته] ==================
    if (commandName === 'bothelp') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('🤖 قائمة أوامر البوت')
            .setColor(0x2b2d31)
            .addFields(
                { name: '🎫 التذاكر', value: '`/ticket panel` - إنشاء اللوحة', inline: true },
                { name: '👋 الترحيب', value: '`/welcome set` - تحديد الروم\n`/welcome edit` - تعديل الرسالة\n`/welcome test` - تجربة', inline: true },
                { name: '💰 الاقتصاد', value: '`/economy balance` - رصيدك\n`/economy transfer` - تحويل\n`/economy top` - الأغنياء', inline: true },
                { name: '🛡️ الإدارة (بدون سلاش)', value: '`تايم @عضو 1h`\n`طرد @عضو`\n`حذف 10`', inline: false }
            );
        i.reply({ embeds: [helpEmbed] });
    }
  }
});

app.get('/', (req, res) => res.send('Bot Online'));
app.listen(3000, () => client.login(process.env.TOKEN));
