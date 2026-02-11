const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const app = express();

// ==================== 🔒 الإعدادات والربط 🔒 ====================
const OWNER_ID = "1131951548772122625"; 
const MONGO_URI = "mongodb+srv://raraftak_db_user:TzKcCxo9EvNDzBbj@cluster0.t4j2uux.mongodb.net/MyBot?retryWrites=true&w=majority";
const ECONOMY_CHANNEL_ID = "1458435717200875671"; 
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.GuildMembers, 
    GatewayIntentBits.MessageContent
  ]
});

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ متصل بـ MongoDB بنجاح!'))
  .catch(err => console.error('❌ فشل الاتصال بـ MongoDB:', err));

const UserSchema = new mongoose.Schema({
  userId: String,
  balance: { type: Number, default: 10 },
  history: [{ type: { type: String }, amount: Number, date: { type: Date, default: Date.now } }]
});

const SettingsSchema = new mongoose.Schema({
  guildId: String,
  welcomeSettings: { channelId: String, title: String, description: String, color: { type: String, default: '2b2d31' }, image: String }
});

const GlobalSettingsSchema = new mongoose.Schema({
  allowedGuilds: { type: [String], default: ['1387902577496297523'] }
});

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);
const GlobalSettings = mongoose.model('GlobalSettings', GlobalSettingsSchema);

async function getGlobalSettings() {
  let settings = await GlobalSettings.findOne();
  if (!settings) {
    settings = new GlobalSettings();
    await settings.save();
  }
  return settings;
}

async function getUserData(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId, balance: 10, history: [{ type: 'STARTING_GIFT', amount: 10 }] });
    await user.save();
  }
  return user;
}

async function getSettings(guildId) {
  let settings = await Settings.findOne({ guildId });
  if (!settings) {
    settings = new Settings({ guildId, welcomeSettings: { color: '2b2d31' } });
    await settings.save();
  }
  return settings;
}

// --- تعريف أوامر السلاش ---
const slashCommands = [
  { 
    name: 'bothelp', 
    description: 'عرض جميع الأوامر' 
  },
  { 
    name: 'economy', 
    description: 'النظام المالي', 
    options: [
      { name: 'balance', description: 'عرض الرصيد', type: 1 },
      { name: 'transfer', description: 'تحويل الأموال', type: 1, options: [{ name: 'user', description: 'المستلم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] },
      { name: 'top', description: 'قائمة الأغنياء', type: 1 }
    ] 
  },
  {
    name: 'games',
    description: 'قسم الألعاب الممتعة',
    options: [
      {
        name: 'rps',
        description: 'لعبة حجر ورقة مقص مع صديق',
        type: 1,
        options: [{ name: 'user', description: 'الشخص اللي تبي تتحداه', type: 6, required: true }]
      },
      {
        name: 'mafia',
        description: 'بدء لعبة مافيا (تحتاج رتبة admin)',
        type: 1
      }
    ]
  },
  {
    name: 'owner',
    description: 'أوامر المالك فقط',
    default_member_permissions: "0", // مخفي للجميع إلا من لديه صلاحيات معينة (سنقوم بالتحقق يدوياً أيضاً)
    options: [
      {
        name: 'guilds',
        description: 'إدارة السيرفرات المخولة',
        type: 1,
        options: [
          { name: 'action', description: 'اضافة أو حذف', type: 3, required: true, choices: [{ name: 'اضافة', value: 'add' }, { name: 'حذف', value: 'remove' }] },
          { name: 'id', description: 'ايدي السيرفر', type: 3, required: true }
        ]
      }
    ]
  }
];

const adminSlashCommands = [
  { 
    name: 'ticket', 
    description: 'إدارة نظام التذاكر', 
    options: [{ name: 'panel', description: 'عرض لوحة التذاكر', type: 1 }],
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
  }, 
  { 
    name: 'welcome', 
    description: 'إدارة نظام الترحيب', 
    options: [
      { name: 'set', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'channel', description: 'اختر الروم', type: 7, required: true }] },
      { name: 'edit', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'description', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'رابط الصورة', type: 3 }] },
      { name: 'info', description: 'عرض إعدادات الترحيب', type: 1 },
      { name: 'test', description: 'تجربة رسالة الترحيب', type: 1 }
    ],
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString()
  },
  {
    name: 'giveaway',
    description: 'نظام القيف أوي',
    default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
    options: [
      { name: 'start', description: 'بدء قيف أوي جديد', type: 1, options: [
        { name: 'prize', description: 'الجائزة', type: 3, required: true },
        { name: 'duration', description: 'المدة (مثال: 10m, 1h, 1d)', type: 3, required: true },
        { name: 'winners', description: 'عدد الفائزين', type: 4, required: true },
        { name: 'condition', description: 'الشروط', type: 3, required: false },
        { name: 'image', description: 'رابط الصورة', type: 3, required: false }
      ]}
    ]
  }
];

client.once('ready', async () => {
  console.log(`✅ ${client.user.tag} أونلاين!`);
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const globalSettings = await getGlobalSettings();
  
  try { 
    await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands }); 
    console.log('✅ تم تسجيل أوامر السلاش العامة بنجاح!');
    
    for (const guildId of globalSettings.allowedGuilds) {
      try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: adminSlashCommands });
        console.log(`✅ تم تسجيل أوامر الأدمن للسيرفر ${guildId}`);
      } catch (e) { console.error(`❌ فشل تسجيل الأوامر للسيرفر ${guildId}:`, e.message); }
    }
  } catch (e) { console.error(e); }
  
  cron.schedule('0 0 * * 5', async () => {
    await User.updateMany({ balance: { $gt: 0 } }, [{ $set: { balance: { $subtract: ["$balance", { $floor: { $multiply: ["$balance", 0.025] } }] } } }]);
    console.log("✅ تم خصم ضريبة الجمعة من الجميع.");
  });
});

async function sendWelcome(member, guildSettings) {
  const { channelId, title, description, color, image } = guildSettings.welcomeSettings;
  if (!channelId) return;
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel) return;

  const embed = new EmbedBuilder().setColor(parseInt(color, 16) || 0x2b2d31);
  const processText = (text) => text ? text.replace(/{member}/g, `${member}`) : null;
  const finalTitle = processText(title);
  const finalDesc = processText(description);

  if (finalTitle) embed.setTitle(finalTitle);
  if (finalDesc) embed.setDescription(finalDesc);
  if (image) embed.setImage(image);
  if (!finalTitle && !finalDesc && !image) return;

  channel.send({ embeds: [embed] });
}

client.on('guildMemberAdd', async (member) => {
  const globalSettings = await getGlobalSettings();
  if (!globalSettings.allowedGuilds.includes(member.guild.id)) return;
  const settings = await getSettings(member.guild.id);
  await sendWelcome(member, settings);
});

const pendingTransfers = new Map();
const transferCooldowns = new Map();
const activeMafiaGames = new Map();
const activeRPSGames = new Map();

client.on('interactionCreate', async (i) => {
  const globalSettings = await getGlobalSettings();
  if (!i.guild || !globalSettings.allowedGuilds.includes(i.guild.id)) return;

  if (i.isChatInputCommand()) {
    const { commandName, options, user, member } = i;

    if (commandName === 'owner') {
      if (user.id !== OWNER_ID) return i.reply({ content: 'هذا الأمر للمالك فقط يا ذكي <:emoji_43:1397804543789498428>', ephemeral: true });
      const sub = options.getSubcommand();
      if (sub === 'guilds') {
        const action = options.getString('action');
        const guildId = options.getString('id');
        if (action === 'add') {
          if (globalSettings.allowedGuilds.includes(guildId)) return i.reply({ content: 'السيرفر موجود أصلاً!', ephemeral: true });
          globalSettings.allowedGuilds.push(guildId);
          await globalSettings.save();
          return i.reply({ content: `✅ تمت إضافة السيرفر ${guildId} بنجاح!` });
        } else {
          globalSettings.allowedGuilds = globalSettings.allowedGuilds.filter(id => id !== guildId);
          await globalSettings.save();
          return i.reply({ content: `✅ تم حذف السيرفر ${guildId} من القائمة!` });
        }
      }
    }

    if (commandName === 'games') {
      const sub = options.getSubcommand();
      if (sub === 'rps') {
        const target = options.getUser('user');
        if (target.id === user.id) return i.reply({ content: 'تبي تلعب مع نفسك؟ روح تعالج <:rimuruWut:1388211603140247565>', ephemeral: true });
        if (target.bot) return i.reply({ content: 'البوتات ما تلعب، عندها شغل أهم منك <:emoji_464:1388211597197050029>', ephemeral: true });
        
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('rps_accept').setLabel('قبول التحدي').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('rps_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
        );
        const msg = await i.reply({ content: `-# ** يـ${target} يتحداك ${user} في لعبة حجرة ورقة مقص**`, components: [row], fetchReply: true });
        activeRPSGames.set(msg.id, { challenger: user.id, opponent: target.id, challengerChoice: null, opponentChoice: null, accepted: false });
      }
      if (sub === 'mafia') {
        if (!member.roles.cache.some(r => r.name.toLowerCase() === 'admin')) {
          return i.reply({ content: 'تحتاج رتبة admin عشان تسوي لعبة مافيا يا ذكي <:emoji_43:1397804543789498428>', ephemeral: true });
        }
        const joinRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary));
        const embed = new EmbedBuilder().setTitle('لعبة مافيا 🕵️‍♂️').setDescription(`-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: 0**`).setColor(0x2b2d31);
        const msg = await i.reply({ embeds: [embed], components: [joinRow], fetchReply: true });
        activeMafiaGames.set(msg.id, { hostId: user.id, players: [], started: false, alive: [], roles: {}, votes: new Map() });
      }
    }

    if (commandName === 'giveaway') {
      const sub = options.getSubcommand();
      if (sub === 'start') {
        const prize = options.getString('prize');
        const durationStr = options.getString('duration');
        const winnersCount = options.getInteger('winners');
        const condition = options.getString('condition') || 'لا توجد شروط';
        const image = options.getString('image');
        
        const timeMatch = durationStr.match(/^(\d+)([mhd])$/);
        if (!timeMatch) return i.reply({ content: 'صيغة الوقت غلط! (مثال: 10m, 1h, 1d)', ephemeral: true });
        const timeValue = parseInt(timeMatch[1]);
        const timeUnit = timeMatch[2];
        const durationMs = timeValue * (timeUnit === 'm' ? 60 : timeUnit === 'h' ? 3600 : 86400) * 1000;
        const endTime = Math.floor((Date.now() + durationMs) / 1000);

        const embed = new EmbedBuilder()
          .setDescription(`-# **سحب عشوائي على ${prize} ينتهي في <t:${endTime}:R> <:emoji_45:1397804598110195863> **\n-# **الي سوا السحب العشوائي ${user} <:y_coroa:1404576666105417871> **\n-# **الشروط ${condition} <:new_emoji:1388436089584226387> **`)
          .setColor(0x2b2d31);
        if (image) embed.setImage(image);

        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_giveaway').setLabel('ادخل').setStyle(ButtonStyle.Secondary));
        const msg = await i.reply({ embeds: [embed], components: [row], fetchReply: true });

        const participants = new Set();
        const collector = msg.createMessageComponentCollector({ time: durationMs });

        collector.on('collect', async (btn) => {
          if (btn.customId === 'join_giveaway') {
            if (participants.has(btn.user.id)) {
              const exitRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('exit_giveaway').setLabel('خروج').setStyle(ButtonStyle.Secondary));
              return btn.reply({ content: '-# **انت داخل السحب اصلا تبي تطلع ؟ <:__:1467633552408576192> **', components: [exitRow], ephemeral: true });
            }
            participants.add(btn.user.id);
            btn.reply({ content: '-# **تم دخولك فالسحب يا رب تفوز <:2thumbup:1467287897429512396> **', ephemeral: true });
          }
          if (btn.customId === 'exit_giveaway') {
            participants.delete(btn.user.id);
            btn.update({ content: '❌ تم خروجك من السحب.', components: [], ephemeral: true });
          }
        });

        collector.on('end', async () => {
          const list = Array.from(participants);
          if (list.length === 0) return msg.edit({ content: '❌ انتهى القيف أوي بدون مشاركين.', embeds: [], components: [] });
          const winners = [];
          for (let j = 0; j < Math.min(winnersCount, list.length); j++) {
            const winnerIdx = Math.floor(Math.random() * list.length);
            winners.push(`<@${list.splice(winnerIdx, 1)[0]}>`);
          }
          const endEmbed = EmbedBuilder.from(embed).setDescription(`-# **انتهى السحب على ${prize}**\n-# **الفائزين:** ${winners.join(', ')}`);
          await msg.edit({ embeds: [endEmbed], components: [] });
          msg.channel.send(`مبروك ${winners.join(', ')}! فزتوا بـ **${prize}**! 🥳`);
        });
      }
    }
  }

  if (i.isButton()) {
    // معالجة أزرار المافيا
    if (i.customId === 'join_mafia') {
      const game = activeMafiaGames.get(i.message.id);
      if (!game || game.started) return i.reply({ content: 'اللعبة بدأت أو انتهت.', ephemeral: true });
      if (game.players.includes(i.user.id)) return i.reply({ content: 'أنت منضم أصلاً!', ephemeral: true });
      game.players.push(i.user.id);
      const embed = EmbedBuilder.from(i.message.embeds[0]);
      const playersList = game.players.map(p => `\u200F<@${p}>\u202C`).join(', ');
      embed.setDescription(`-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: ${game.players.length}**\n${playersList}`);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary));
      if (game.players.length >= 4) row.addComponents(new ButtonBuilder().setCustomId('start_mafia').setLabel('بدء اللعبة').setStyle(ButtonStyle.Success));
      await i.update({ embeds: [embed], components: [row] });
    }

    if (i.customId === 'start_mafia') {
      const game = activeMafiaGames.get(i.message.id);
      if (!game || game.hostId !== i.user.id) return i.reply({ content: 'فقط صاحب الأمر يقدر يبدأ اللعبة!', ephemeral: true });
      game.started = true;
      game.alive = [...game.players];
      const players = [...game.players].sort(() => Math.random() - 0.5);
      
      const roleNames = {
        mafia: 'مافيا 🔪 <:emoji_38:1470920843398746215>',
        doctor: 'طبيب 💉 <:emoji_32:1401771771010613319>',
        police: 'شرطي 🔍 <:s7_discord:1388214117365453062>',
        citizen: 'مواطن 👨‍🌾 <:emoji_33:1401771703306027008>'
      };
      const roleDescs = {
        mafia: 'تقتل الناس بدون ما يدرون عنك.',
        doctor: 'تحمي شخص واحد كل جولة من القتل.',
        police: 'تحاول تكشف مين هو القاتل.',
        citizen: 'تحاول تعيش وتصوت على الشخص الصح.'
      };

      game.roles[players[0]] = 'mafia';
      game.roles[players[1]] = 'doctor';
      game.roles[players[2]] = 'police';
      players.slice(3).forEach(p => game.roles[p] = 'citizen');

      await i.update({ content: '✅ بدأت اللعبة! اضغط على الزر لمعرفة دورك.', embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('reveal_role').setLabel('كشف دوري').setStyle(ButtonStyle.Secondary))] });
      
      // بدء جولة التصويت بعد دقيقة
      setTimeout(() => startVoting(i.channel, game), 60000);
    }

    if (i.customId === 'reveal_role') {
      const game = activeMafiaGames.get(i.message.id) || Array.from(activeMafiaGames.values()).find(g => g.roles[i.user.id]);
      if (!game || !game.roles[i.user.id]) return i.reply({ content: 'أنت لست جزءاً من هذه اللعبة!', ephemeral: true });
      
      const role = game.roles[i.user.id];
      const roleNames = { mafia: 'مافيا 🔪 <:emoji_38:1470920843398746215>', doctor: 'طبيب 💉 <:emoji_32:1401771771010613319>', police: 'شرطي 🔍 <:s7_discord:1388214117365453062>', citizen: 'مواطن 👨‍🌾 <:emoji_33:1401771703306027008>' };
      const roleDescs = { mafia: 'تقتل الناس بدون ما يدرون عنك.', doctor: 'تحمي شخص واحد كل جولة من القتل.', police: 'تحاول تكشف مين هو القاتل.', citizen: 'تحاول تعيش وتصوت على الشخص الصح.' };

      return i.reply({ content: `-# **بدأت اللعبة لا تقول لأحد مين انت <:emoji_84:1389404919672340592> **\n-# **انت الحين ${roleNames[role]} الي تقدر تسويه ${roleDescs[role]}**`, ephemeral: true });
    }

    if (i.customId.startsWith('vote_')) {
      const targetId = i.customId.split('_')[1];
      const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
      if (!game) return i.reply({ content: 'لست في لعبة نشطة أو أنك ميت!', ephemeral: true });
      game.votes.set(i.user.id, targetId);
      return i.reply({ content: `تم تسجيل تصويتك ضد <@${targetId}>`, ephemeral: true });
    }

    // معالجة أزرار RPS
    if (i.customId === 'rps_accept' || i.customId === 'rps_decline') {
      const game = activeRPSGames.get(i.message.id);
      if (!game) return i.reply({ content: 'انتهى التحدي!', ephemeral: true });
      if (i.user.id === game.challenger) return i.reply({ content: '-# **تراك انت الي باعت التحدي مب هو **', ephemeral: true });
      if (i.user.id !== game.opponent) return i.reply({ content: '-# **التحدي ليس لك برو اقرأ المنشن فوق **', ephemeral: true });
      
      if (i.customId === 'rps_decline') {
        activeRPSGames.delete(i.message.id);
        return i.update({ content: '❌ تم رفض التحدي.', components: [] });
      }
      game.accepted = true;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_rock').setLabel('حجر 🪨').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_paper').setLabel('ورقة 📄').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_scissors').setLabel('مقص ✂️').setStyle(ButtonStyle.Primary)
      );
      await i.update({ content: 'بدأ التحدي! اختاروا أسلحتكم (الرسائل مخفية)', components: [row] });
    }

    if (['rps_rock', 'rps_paper', 'rps_scissors'].includes(i.customId)) {
      const game = activeRPSGames.get(i.message.id);
      if (!game || (i.user.id !== game.challenger && i.user.id !== game.opponent)) return i.reply({ content: 'لست جزءاً من التحدي!', ephemeral: true });
      const choice = i.customId.split('_')[1];
      if (i.user.id === game.challenger) {
        if (game.challengerChoice) return i.reply({ content: 'اخترت خلاص!', ephemeral: true });
        game.challengerChoice = choice;
      } else {
        if (game.opponentChoice) return i.reply({ content: 'اخترت خلاص!', ephemeral: true });
        game.opponentChoice = choice;
      }
      await i.reply({ content: `اخترت ${choice === 'rock' ? 'حجر' : choice === 'paper' ? 'ورقة' : 'مقص'}!`, ephemeral: true });
      if (game.challengerChoice && game.opponentChoice) {
        const names = { rock: 'حجر 🪨', paper: 'ورقة 📄', scissors: 'مقص ✂️' };
        let result = '';
        if (game.challengerChoice === game.opponentChoice) result = 'تعادل! 🤝';
        else if ((game.challengerChoice === 'rock' && game.opponentChoice === 'scissors') || (game.challengerChoice === 'paper' && game.opponentChoice === 'rock') || (game.challengerChoice === 'scissors' && game.opponentChoice === 'paper')) result = `\u200F<@${game.challenger}>\u202C فاز على \u200F<@${game.opponent}>\u202C! 🏆`;
        else result = `\u200F<@${game.opponent}>\u202C فاز على \u200F<@${game.challenger}>\u202C! 🏆`;
        await i.message.edit({ content: `**انتهى التحدي!**\n-# \u200F<@${game.challenger}>\u202C: ${names[game.challengerChoice]}\n-# \u200F<@${game.opponent}>\u202C: ${names[game.opponentChoice]}\n\n${result}`, components: [] });
        activeRPSGames.delete(i.message.id);
      }
    }
  }
});

async function startVoting(channel, game) {
  if (game.alive.length <= 1) return checkWinner(channel, game);
  
  const row = new ActionRowBuilder();
  game.alive.slice(0, 5).forEach(pId => {
    row.addComponents(new ButtonBuilder().setCustomId(`vote_${pId}`).setLabel(client.users.cache.get(pId)?.username || pId).setStyle(ButtonStyle.Secondary));
  });

  const voteMsg = await channel.send({ content: `-# ** صوتوا على الشخص الي تشوفونه هو القاتل <:emoji_38:1470920843398746215> **`, components: [row] });
  
  setTimeout(async () => {
    const voteCounts = {};
    game.votes.forEach(targetId => voteCounts[targetId] = (voteCounts[targetId] || 0) + 1);
    
    let kickedId = null;
    let maxVotes = 0;
    for (const [id, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) { maxVotes = count; kickedId = id; }
    }

    if (kickedId) {
      const role = game.roles[kickedId];
      const roleNames = { mafia: 'مافيا 🔪', doctor: 'طبيب 💉', police: 'شرطي 🔍', citizen: 'مواطن 👨‍🌾' };
      game.alive = game.alive.filter(id => id !== kickedId);
      channel.send(`-# ** تم طرد <@${kickedId}> و هو كان ${roleNames[role]} **`);
      if (role === 'mafia') return checkWinner(channel, game);
    } else {
      channel.send('لم يتم التصويت على أحد، تستمر اللعبة...');
    }

    game.votes.clear();
    if (game.alive.length > 1) setTimeout(() => startVoting(channel, game), 60000);
    else checkWinner(channel, game);
  }, 60000);
}

function checkWinner(channel, game) {
  const mafiaAlive = game.alive.some(id => game.roles[id] === 'mafia');
  const mafiaId = Object.keys(game.roles).find(id => game.roles[id] === 'mafia');
  const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police');
  const doctorId = Object.keys(game.roles).find(id => game.roles[id] === 'doctor');
  const citizens = Object.keys(game.roles).filter(id => game.roles[id] === 'citizen').map(id => `<@${id}>`).join(', ');

  if (!mafiaAlive) {
    channel.send(`-# **المواطنين فازوا  الشرطي <@${policeId}><:s7_discord:1388214117365453062>  المواطنين ${citizens} <:emoji_33:1401771703306027008>  الطبيب <@${doctorId}> <:emoji_32:1401771771010613319>**`);
  } else {
    channel.send(`-# **القاتل <@${mafiaId}> <:emoji_38:1470920843398746215> لعب فيهم لعب و فاز و محد كشفه <:emoji_33:1401771703306027008>  **`);
  }
  // تنظيف اللعبة
  for (const [key, val] of activeMafiaGames.entries()) {
    if (val === game) activeMafiaGames.delete(key);
  }
}

app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));
