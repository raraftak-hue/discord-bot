const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

// ==================== 🔒 إعدادات الحماية والمالك 🔒 ====================
const ALLOWED_GUILDS = ['1387902577496297523']; 
const OWNER_ID = "1131951548772122625"; 
// ============================================================

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
  if (!db.users[userId]) { 
    db.users[userId] = { 
      balance: 10, 
      history: [{ type: 'STARTING_GIFT', amount: 10, date: new Date().toISOString() }] 
    };
    saveDB(); 
  }
  return db.users[userId];
}


const activeTickets = new Map();

// --- تسجيل أوامر السلاش ---
const commands = [
  { 
    name: 'ticket', 
    description: 'إدارة نظام التذاكر', 
    options: [
      { name: 'panel', description: 'عرض لوحة التذاكر', type: 1 },
      { name: 'edit', description: 'تعديل لوحة التذاكر', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }] }
    ] 
  },
  { 
    name: 'welcome', 
    description: 'إدارة نظام الترحيب', 
    options: [
      { name: 'set', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }] },
      { name: 'edit', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'description', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'رابط الصورة', type: 3 }] },
      { name: 'test', description: 'تجربة الترحيب', type: 1 },
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
      { name: 'add', description: 'إضافة رصيد (للمالك)', type: 1, options: [{ name: 'user', description: 'المستخدم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] }
    ]
  }
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} متصل!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
  
  cron.schedule('0 0 * * 5', () => {
    for (const id in db.users) {
      if (db.users[id].balance > 0) {
        db.users[id].balance -= Math.floor(db.users[id].balance * 0.025);
      }
    }
    saveDB();
  });
});

// --- الترحيب ---
client.on('guildMemberAdd', async (member) => {
  if (!ALLOWED_GUILDS.includes(member.guild.id) || !db.welcomeSettings.channelId) return;
  const channel = member.guild.channels.cache.get(db.welcomeSettings.channelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle(db.welcomeSettings.title || 'أهلاً بك')
    .setDescription(`-# **${db.welcomeSettings.description || `نورتنا يا ${member}`}**`)
    .setColor(parseInt(db.welcomeSettings.color, 16) || 0x2b2d31);
  if (db.welcomeSettings.image) embed.setImage(db.welcomeSettings.image);
  channel.send({ embeds: [embed] });
});

// --- الأوامر النصية (تايم، طرد، حذف) ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !ALLOWED_GUILDS.includes(message.guild.id)) return;
  const args = message.content.split(/\s+/);
  const command = args[0];

  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    const timeArg = args.find(a => /^\d+[mhd]$/i.test(a));
    if (!member || !timeArg) return message.reply('-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663> **');
    const unit = timeArg.slice(-1).toLowerCase();
    const value = parseInt(timeArg);
    let duration = (unit === 'm' ? value * 60 : unit === 'h' ? value * 3600 : value * 86400) * 1000;
    try {
      await member.timeout(duration);
      message.reply({ embeds: [new EmbedBuilder().setDescription(`-# **تم اسكات العضو ${member} ليش ما يستحي هو يارب ما يعيدها عشان ما يبلع مره ثانيه <a:DancingShark:1469030444774199439>**`).setColor(0x2b2d31)] });
    } catch (e) { message.reply('-# ** ما تقدر تسويها هو يدعس عليك <:emoji_43:1397804543789498428>  **'); }
  }

  if (command === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
    const member = message.mentions.members.first();
    if (!member) return message.reply('❌ منشن العضو.');
    try {
      await member.kick();
      message.reply({ embeds: [new EmbedBuilder().setDescription(`-# ** تم طرد العضو ${member} احسن انطرد كان غاثني من اول المسكين باي <a:Hiiiii:1470461001085354148>**`).setColor(0x2b2d31)] });
    } catch (e) { message.reply('-# ** ما تقدر تسويها هو يدعس عليك <:emoji_43:1397804543789498428>  **'); }
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const num = parseInt(args[1]);
    if (num > 0 && num <= 100) await message.channel.bulkDelete(num + 1);
  }
});

// --- التفاعلات (Slash & Buttons) ---
client.on('interactionCreate', async (i) => {
  if (!i.guild || !ALLOWED_GUILDS.includes(i.guild.id)) return;

  if (i.isButton()) {
    if (i.customId === 'open_ticket') {
      const ch = await i.guild.channels.create({ name: `ticket-${i.user.username}`, type: ChannelType.GuildText, permissionOverwrites: [{ id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] });
      await ch.send({ content: `${i.user}`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger))] });
      i.reply({ content: `تم فتح التذكرة ${ch}`, ephemeral: true });
    }
    if (i.customId === 'close_ticket') {
      await i.reply('سيتم الإغلاق...');
      setTimeout(() => i.channel.delete(), 3000);
    }
  }

  if (i.isChatInputCommand()) {
    const { commandName, options, user } = i;
    const sub = options.getSubcommand(false);

    // --- BOTH HELP ---
    if (commandName === 'bothelp') {
        const helpEmbed = new EmbedBuilder()
            .setTitle('قائمة أوامر البوت')
            .setColor(0x2b2d31)
            .setDescription(
                `-# **/economy top - قائمة الاغنياء**\n` +
                `-# **/ticket panel - انشاء لوحة تذاكر**\n` +
                `-# **/welcome set - تعيين روم الترحيب**\n` +
                `-# **/economy transfer- تحويل الأموال**\n` +
                `-# **/economy balance - عرض الرصيد**\n` +
                `-# **text cmd - أوامر الشات، حذف و تايم و طرد**`
            );
        return i.reply({ embeds: [helpEmbed] });
    }

    // --- ECONOMY ---
    if (commandName === 'economy') {
      const data = getUserData(user.id);
            if (sub === 'balance') {
        const lastAmount = (data.history.find(h => h.type === 'TRANSFER_RECEIVE') || { amount: 0 }).amount;
        return i.reply({ embeds: [new EmbedBuilder().setDescription(`-# ** رصيدك الحالي ${data.balance} آخر عملية تحويل تلقيتها كانت بـ ${lastAmount} <:money_with_wings:1388212679981666334> **`).setColor(0x2b2d31)] });
      }

      if (sub === 'transfer') {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        if (data.balance < amount) return i.reply('رصيدك لا يكفي.');
        const tData = getUserData(target.id);
        data.balance -= amount; tData.balance += amount; saveDB();
        i.reply({ embeds: [new EmbedBuilder().setDescription(`-# **تم تحويل ${amount} دينار لـ ${target} رصيدك الحالي هو ${data.balance} دينار <a:moneywith_:1470458218953179237>**`).setColor(0x2b2d31)] });
      }
      if (sub === 'top') {
        const top = Object.entries(db.users).sort(([,a],[,b]) => b.balance - a.balance).slice(0, 5).map(([id, u], idx) => `**${idx+1}.** <@${id}> - ${u.balance}`).join('\n');
        i.reply({ embeds: [new EmbedBuilder().setTitle('قائمة الأغنياء').setDescription(top).setColor(0x2b2d31)] });
      }
    }

    // --- WELCOME ---
    if (commandName === 'welcome') {
      if (sub === 'set') { db.welcomeSettings.channelId = options.getChannel('channel').id; saveDB(); i.reply('✅ تم.'); }
      if (sub === 'edit') { 
        if(options.getString('title')) db.welcomeSettings.title = options.getString('title');
        if(options.getString('description')) db.welcomeSettings.description = options.getString('description');
        if(options.getString('color')) db.welcomeSettings.color = options.getString('color').replace('#','');
        if(options.getString('image')) db.welcomeSettings.image = options.getString('image');
        saveDB(); i.reply('✅ تم التعديل.');
      }
      if (sub === 'info') {
        i.reply({ embeds: [new EmbedBuilder()
          .setTitle('إعدادات الترحيب')
          .setColor(0x2b2d31)
          .setDescription(
            `-# **الروم:** ${db.welcomeSettings.channelId ? `<#${db.welcomeSettings.channelId}>` : 'غير محدد'}\n` +
            `-# **اللون:** #${db.welcomeSettings.color}\n` +
            `-# **العنوان:** ${db.welcomeSettings.title || 'افتراضي'}\n` +
            `-# **الوصف:** ${db.welcomeSettings.description || 'افتراضي'}`
          )] });
      }
    }

    // --- TICKET ---
    if (commandName === 'ticket' && sub === 'panel') {
      i.reply({ embeds: [new EmbedBuilder().setTitle('التذاكر').setDescription('اضغط الزر.')], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Primary))] });
    }
  }
});

app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));
