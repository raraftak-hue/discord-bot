const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose'); // مكتبة المونجو
const cron = require('node-cron');
const app = express();

// ==================== 🔒 الإعدادات والربط 🔒 ====================
const ALLOWED_GUILDS = ['1387902577496297523']; 
const OWNER_ID = "1131951548772122625"; 
const MONGO_URI = "mongodb+srv://raraftak_db_user:TzKcCxo9EvNDzBbj@cluster0.t4j2uux.mongodb.net/MyBot?retryWrites=true&w=majority";
// ============================================================

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent]
});

// --- اتصال MongoDB ---
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ متصل بـ MongoDB بنجاح!'))
  .catch(err => console.error('❌ فشل الاتصال بـ MongoDB:', err));

// --- تعريف قاعدة البيانات (Models) ---
const UserSchema = new mongoose.Schema({
  userId: String,
  balance: { type: Number, default: 10 },
  history: [{ type: { type: String }, amount: Number, date: { type: Date, default: Date.now } }]
});
const SettingsSchema = new mongoose.Schema({
  guildId: String,
  welcomeSettings: { channelId: String, title: String, description: String, color: { type: String, default: '2b2d31' }, image: String }
});

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// دالة جلب بيانات العضو
async function getUserData(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId, balance: 10, history: [{ type: 'STARTING_GIFT', amount: 10 }] });
    await user.save();
  }
  return user;
}

// دالة جلب إعدادات السيرفر
async function getSettings(guildId) {
  let settings = await Settings.findOne({ guildId });
  if (!settings) {
    settings = new Settings({ guildId, welcomeSettings: { color: '2b2d31' } });
    await settings.save();
  }
  return settings;
}

// --- تسجيل أوامر السلاش ---
const commands = [
  { name: 'ticket', description: 'إدارة نظام التذاكر', options: [{ name: 'panel', description: 'عرض لوحة التذاكر', type: 1 }] },
  { name: 'welcome', description: 'إدارة نظام الترحيب', options: [
      { name: 'set', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }] },
      { name: 'edit', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'description', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'رابط الصورة', type: 3 }] },
      { name: 'info', description: 'عرض إعدادات الترحيب', type: 1 }
  ]},
  { name: 'bothelp', description: 'عرض جميع الأوامر' },
  { name: 'economy', description: 'النظام المالي', options: [
      { name: 'balance', description: 'عرض الرصيد', type: 1 },
      { name: 'transfer', description: 'تحويل الأموال', type: 1, options: [{ name: 'user', description: 'المستلم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] },
      { name: 'top', description: 'قائمة الأغنياء', type: 1 }
  ]}
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} أونلاين!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try { await rest.put(Routes.applicationCommands(client.user.id), { body: commands }); } catch (e) { console.error(e); }
  
  // ضريبة الجمعة
  cron.schedule('0 0 * * 5', async () => {
    await User.updateMany({ balance: { $gt: 0 } }, [{ $set: { balance: { $subtract: ["$balance", { $floor: { $multiply: ["$balance", 0.025] } }] } } }]);
    console.log("✅ تم خصم ضريبة الجمعة من الجميع.");
  });
});

// --- الترحيب ---
client.on('guildMemberAdd', async (member) => {
  if (!ALLOWED_GUILDS.includes(member.guild.id)) return;
  const settings = await getSettings(member.guild.id);
  const { channelId, title, description, color, image } = settings.welcomeSettings;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle(title || 'أهلاً بك')
    .setDescription(`-# **${description || `نورتنا يا ${member}`}**`)
    .setColor(parseInt(color, 16) || 0x2b2d31);
  if (image) embed.setImage(image);
  channel.send({ embeds: [embed] });
});

// --- أوامر الشات ---
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !ALLOWED_GUILDS.includes(message.guild.id)) return;
  const args = message.content.split(/\s+/);

  // أمر تايم
  if (args[0] === 'تايم') {
    // 1. التحقق من الصلاحية (إذا ما عنده صلاحية لا يرد بشيء)
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;

    const member = message.mentions.members.first();
    const timeArg = args.find(a => /^\d+[mhd]$/i.test(a));

    // 2. التحقق من الصيغة
    if (!member || !timeArg) return message.reply('-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**');

    // 3. التحقق من المدة (أقصى شيء 28 يوم حسب قوانين ديسكورد، الـ 50 يوم تعتبر غلط)
    const timeValue = parseInt(timeArg);
    const timeUnit = timeArg.slice(-1).toLowerCase();
    let durationInMs = timeValue * (timeUnit === 'm' ? 60 : timeUnit === 'h' ? 3600 : 86400) * 1000;
    
    // ديسكورد لا يسمح بأكثر من 28 يوم (2419200000 ms)
    if (durationInMs > 2419200000) return message.reply('-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**');

    // 4. التحقق إذا كان يعطي تايم لنفسه
    if (member.id === message.author.id) {
      return message.reply('-# **تبي تعطي تايم لنفسك ؟ واضح عقلك فيه خلل ما بسويها لك <:rimuruWut:1388211603140247565> **');
    }

    // 5. محاولة تنفيذ التايم (التعامل مع الرتب الأعلى)
    try {
      await member.timeout(durationInMs);
      message.reply(`-# **تم اسكات ${member} يارب ما يعيدها <a:DancingShark:1469030444774199439>**`);
    } catch (error) {
      // إذا كانت رتبته أعلى أو البوت ما يقدر عليه
      message.reply('-# **ما تقدر تسويها هو يدعس عليك <:emoji_43:1397804543789498428>**');
    }
  }

  // أمر طرد
  if (args[0] === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
    const member = message.mentions.members.first();
    if (!member) return message.reply('-# **منشن الشخص الي تبي تطرده يا ذكي <:emoji_334:1388211595053760663>**');
    
    if (member.id === message.author.id) return message.reply('-# **تبي تطرد نفسك؟ استهدي بالله <:rimuruWut:1388211603140247565>**');

    try {
      await member.kick();
      message.reply(`-# **تم طرد ${member.user.tag} بنجاح، الفكة منه!**`);
    } catch (error) {
      message.reply('-# **ما تقدر تسويها هو يدعس عليك <:emoji_43:1397804543789498428>**');
    }
  }

  if (args[0] === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const num = parseInt(args[1]);
    if (num > 0 && num <= 100) await message.channel.bulkDelete(num + 1);
  }
});

// --- التفاعلات ---
client.on('interactionCreate', async (i) => {
  if (!i.guild || !ALLOWED_GUILDS.includes(i.guild.id)) return;

  if (i.isChatInputCommand()) {
    const { commandName, options, user } = i;
    const sub = options.getSubcommand(false);

    if (commandName === 'bothelp') {
      const helpEmbed = new EmbedBuilder()
        .setTitle('قائمة أوامر البوت')
        .setColor(0x2b2d31)
        .setDescription(`-# **/economy top - قائمة الاغنياء**\n-# **/ticket panel - انشاء لوحة تذاكر**\n-# **/welcome set - تعيين روم الترحيب**\n-# **/economy transfer- تحويل الأموال**\n-# **/economy balance - عرض الرصيد**\n-# **text cmd - أوامر الشات، حذف و تايم و طرد**`);
      return i.reply({ embeds: [helpEmbed] });
    }

    if (commandName === 'economy') {
      const userData = await getUserData(user.id);
      if (sub === 'balance') {
        const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
        return i.reply({ embeds: [new EmbedBuilder().setDescription(`-# **رصيدك الحالي ${userData.balance} دنانير و آخر عملية تحويل تلقيتها بـ ${lastIn.amount} <:money_with_wings:1388212679981666334>**`).setColor(0x2b2d31)] });
      }
      if (sub === 'transfer') {
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        if (userData.balance < amount) return i.reply('رصيدك لا يكفي.');
        const targetData = await getUserData(target.id);
        userData.balance -= amount;
        targetData.balance += amount;
        targetData.history.push({ type: 'TRANSFER_RECEIVE', amount });
        await userData.save(); await targetData.save();
        i.reply({ embeds: [new EmbedBuilder().setDescription(`-# **تم تحويل ${amount} لـ ${target} رصيدك الآن ${userData.balance} <a:moneywith_:1470458218953179237>**`).setColor(0x2b2d31)] });
      }
      if (sub === 'top') {
        const topUsers = await User.find().sort({ balance: -1 }).limit(5);
        const topMsg = topUsers.map((u, idx) => `**${idx+1}.** <@${u.userId}> - ${u.balance}`).join('\n');
        i.reply({ embeds: [new EmbedBuilder().setTitle('قائمة الأغنياء').setDescription(`\u200F${topMsg}`).setColor(0x2b2d31)] });
      }
    }

    if (commandName === 'welcome') {
      const settings = await getSettings(i.guild.id);
      if (sub === 'set') { settings.welcomeSettings.channelId = options.getChannel('channel').id; await settings.save(); i.reply('✅ تم.'); }
      if (sub === 'edit') {
        if(options.getString('title')) settings.welcomeSettings.title = options.getString('title');
        if(options.getString('description')) settings.welcomeSettings.description = options.getString('description');
        if(options.getString('color')) settings.welcomeSettings.color = options.getString('color').replace('#','');
        if(options.getString('image')) settings.welcomeSettings.image = options.getString('image');
        await settings.save(); i.reply('✅ تم التعديل.');
      }
      if (sub === 'info') {
        i.reply({ embeds: [new EmbedBuilder().setTitle('إعدادات الترحيب').setColor(0x2b2d31).setDescription(`-# **الروم:** <#${settings.welcomeSettings.channelId || 'غير محدد'}>\n-# **اللون:** #${settings.welcomeSettings.color}\n-# **العنوان:** ${settings.welcomeSettings.title || 'افتراضي'}`)] });
      }
    }
  }

  // نظام التذاكر المطور
  if (i.isButton()) {
    if (i.customId === 'open_ticket') {
      const ch = await i.guild.channels.create({ name: `ticket-${i.user.username}`, type: ChannelType.GuildText, permissionOverwrites: [{ id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] });
      ch.send({ content: `${i.user}`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger))] });
      i.reply({ content: `تم فتح التذكرة ${ch}`, ephemeral: true });
    }
    if (i.customId === 'close_ticket') { await i.reply('سيتم الإغلاق...'); setTimeout(() => i.channel.delete(), 3000); }
  }
});

app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));
