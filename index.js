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
  { name: 'bothelp', description: 'عرض جميع الأوامر' },
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
        name: 'mafia',
        description: 'بدء لعبة مافيا (تحتاج صلاحيات)',
        type: 1
      }
    ]
  },
  {
    name: 'owner',
    description: 'أوامر المالك فقط',
    default_member_permissions: "0",
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

  channel.send({ embeds: [embed] }).catch(() => {});
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

// --- معالجة الأوامر النصية ---
// ... (بداية الكود سليمة، نبدأ التعديل من دوال المافيا والانتراكتشن)

// تخزين منفصل لطلبات الانضمام عشان ما تلخبط مع اللعب
const activeMafiaGames = new Map();

// دالة مساعدة لإنهاء اللعبة وتنظيف الذاكرة
function endGame(gameId) {
    activeMafiaGames.delete(gameId);
}

// ... (أوامر messageCreate الخاصة بالمافيا)
client.on('messageCreate', async (message) => {
    // ... (نفس كودك السابق للأوامر الأخرى)

    if (command === 'مافيا') {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.channel.send(`-# **للأسف السيرفر دكتاتوري ما معك صلاحية انك تشغل اللعبة <:__:1467633552408576192> **`);
        }
        // تنظيف أي لعبة سابقة في نفس الروم لتجنب التداخل
        if (activeMafiaGames.has(message.channel.id)) activeMafiaGames.delete(message.channel.id);

        const joinRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary));
        if (message.author.id === OWNER_ID) joinRow.addComponents(new ButtonBuilder().setCustomId('dev_start_mafia').setLabel('وضع المطور (تجربة وحدك)').setStyle(ButtonStyle.Danger));

        const embed = new EmbedBuilder().setTitle('لعبة المافيا 🕵️‍♂️').setDescription(`-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: 0**`).setColor(0x2b2d31);
        
        // نربط اللعبة بآيدي القناة عشان ما يصير تداخل لو انفتحت لعبتين برومات مختلفة
        const msg = await message.channel.send({ embeds: [embed], components: [joinRow] });
        
        activeMafiaGames.set(msg.id, { 
            hostId: message.author.id, 
            channelId: message.channel.id,
            players: [], 
            started: false, 
            alive: [], 
            roles: {}, 
            votes: new Map(), 
            usedAbilities: new Set(), 
            protectedByCloak: null, 
            monitoredTarget: null, // تم فصل المراقبة عن تحقيق الشرطي
            investigateTarget: null, // تحقيق الشرطي
            nightAction: {},
            devMode: false 
        });

        // مؤقت لبدء اللعبة أو الغائها
        setTimeout(async () => {
            const game = activeMafiaGames.get(msg.id);
            if (game && !game.started) {
                await msg.edit({ content: '-# **انلغت اللعبة لعدم اكتمال العدد أو عدم البدء <:new_emoji:1388436095842385931> **', embeds: [], components: [] }).catch(() => {});
                activeMafiaGames.delete(msg.id);
            }
        }, 60000); // خليتها دقيقة عشان يمديهم يدخلون
    }
    
    // ... (باقي الأوامر)
});

client.on('interactionCreate', async (i) => {
    // ... (تأكد من شرط الجيلد والإعدادات كما في كودك الأصلي)

    if (i.isButton()) {
        // --- أزرار المافيا ---
        if (i.customId === 'join_mafia') {
            const game = activeMafiaGames.get(i.message.id);
            if (!game) return i.reply({ content: 'اللعبة انتهت أو غير موجودة.', ephemeral: true });
            if (game.started) return i.reply({ content: 'اللعبة بدأت بالفعل.', ephemeral: true });
            if (game.players.includes(i.user.id)) return i.reply({ content: 'أنت منضم أصلاً!', ephemeral: true });
            
            game.players.push(i.user.id);
            const embed = EmbedBuilder.from(i.message.embeds[0]);
            embed.setDescription(`-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: ${game.players.length}**\n${game.players.map(p => `<@${p}>`).join(', ')}`);
            
            const row = ActionRowBuilder.from(i.message.components[0]);
            if (game.players.length >= 4 && !row.components.some(c => c.data.custom_id === 'start_mafia')) {
                 row.addComponents(new ButtonBuilder().setCustomId('start_mafia').setLabel('بدء اللعبة').setStyle(ButtonStyle.Success));
            }
            await i.update({ embeds: [embed], components: [row] });
        }

        if (i.customId === 'start_mafia' || i.customId === 'dev_start_mafia') {
            const game = activeMafiaGames.get(i.message.id);
            if (!game) return;
            if (game.hostId !== i.user.id && i.user.id !== OWNER_ID) return i.reply({ content: 'فقط المضيف يقدر يبدأ اللعبة.', ephemeral: true });

            game.started = true;
            game.devMode = (i.customId === 'dev_start_mafia');

            if (game.devMode) {
                game.players = [i.user.id, 'bot1', 'bot2', 'bot3']; // بوتات وهمية للتجربة
                game.roles = { [i.user.id]: 'mafia', 'bot1': 'doctor', 'bot2': 'police', 'bot3': 'citizen' };
            } else {
                // توزيع الأدوار عشوائياً
                const shuffled = [...game.players].sort(() => 0.5 - Math.random());
                game.roles = {};
                game.roles[shuffled[0]] = 'mafia';
                game.roles[shuffled[1]] = 'doctor';
                game.roles[shuffled[2]] = 'police';
                shuffled.slice(3).forEach(p => game.roles[p] = 'citizen');
            }
            
            game.alive = [...game.players];
            
            await i.update({ content: '🎮 **بدأت اللعبة! تم توزيع الأدوار.**', embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('reveal_role').setLabel('وش دوري؟').setStyle(ButtonStyle.Primary))] });
            
            setTimeout(() => startNight(i.channel, game), 3000);
        }

        if (i.customId === 'reveal_role') {
            // البحث عن اللعبة التي يشارك فيها اللاعب
            const game = Array.from(activeMafiaGames.values()).find(g => g.roles[i.user.id]);
            if (!game) return i.reply({ content: 'مافي لعبة شغالة انت فيها.', ephemeral: true });
            
            const role = game.roles[i.user.id];
            const roleData = {
                mafia: { name: 'المافيا 🔪', desc: 'مهمتك تقتلهم كلهم بالليل.' },
                doctor: { name: 'الطبيب 💉', desc: 'تحمي واحد كل ليلة من القتل.' },
                police: { name: 'الشرطي 👮‍♂️', desc: 'تكشف عن هوية واحد كل ليلة.' },
                citizen: { name: 'مواطن 👨‍🌾', desc: 'حاول تعيش واكشف المجرم بالتصويت.' }
            };
            return i.reply({ content: `🤫 **أنت: ${roleData[role].name}**\n${roleData[role].desc}`, ephemeral: true });
        }

        // --- أزرار اللعب (Night Actions) ---
        if (i.customId.startsWith('mafia_kill_')) {
            const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
            if (!game) return;
            game.nightAction.killTarget = i.customId.split('_')[2];
            await i.reply({ content: `🔪 اخترت قتل <@${game.nightAction.killTarget}>`, ephemeral: true });
        }

        if (i.customId.startsWith('doctor_save_')) {
            const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
            if (!game) return;
            game.nightAction.saveTarget = i.customId.split('_')[2];
            await i.reply({ content: `💉 اخترت حماية <@${game.nightAction.saveTarget}>`, ephemeral: true });
        }

        if (i.customId.startsWith('police_check_')) {
            const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
            if (!game) return;
            const targetId = i.customId.split('_')[2];
            const isMafia = game.roles[targetId] === 'mafia';
            // التحقق من العباءة فوراً للشرطي
            if (game.protectedByCloak === targetId) {
                await i.reply({ content: `🔍 **المشتبه به <@${targetId}> يبدو بريئاً... (مستخدم عباءة)**`, ephemeral: true });
            } else {
                await i.reply({ content: `🔍 **المشتبه به <@${targetId}> هو: ${isMafia ? 'المافيا 😈' : 'بريء 😇'}**`, ephemeral: true });
            }
        }
        
        // --- أزرار التصويت (Day Voting) ---
        if (i.customId.startsWith('vote_')) {
            const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
            if (!game || !game.alive.includes(i.user.id)) return i.reply({ content: 'لا يمكنك التصويت.', ephemeral: true });
            
            const targetId = i.customId.split('_')[1];
            game.votes.set(i.user.id, targetId);
            await i.reply({ content: `🗳️ صوت ضد <@${targetId}>`, ephemeral: true });
        }
    }
});

// --- دوال اللعبة (Logic) ---

async function startNight(channel, game) {
    if (game.alive.length <= 2) return checkWinner(channel, game); // تغير الشرط لـ 2 لأنه لو بقى مافيا وواحد مواطن المافيا فاز
    
    game.nightAction = {}; 
    // تصفير حمايات الليلة السابقة
    if (!game.usedAbilities.has(game.protectedByCloak + '_cloak_permanent')) game.protectedByCloak = null;

    const mafiaId = Object.keys(game.roles).find(k => game.roles[k] === 'mafia' && game.alive.includes(k));
    const doctorId = Object.keys(game.roles).find(k => game.roles[k] === 'doctor' && game.alive.includes(k));
    const policeId = Object.keys(game.roles).find(k => game.roles[k] === 'police' && game.alive.includes(k));

    channel.send('🌃 **حل الظلام... الجميع نيام ما عدا المجرمين.** (معكم 20 ثانية)');

    // إرسال خيارات المافيا
    if (mafiaId && !mafiaId.startsWith('bot')) {
        const row = new ActionRowBuilder();
        game.alive.filter(id => id !== mafiaId).forEach(id => {
            row.addComponents(new ButtonBuilder().setCustomId(`mafia_kill_${id}`).setLabel('💀').setStyle(ButtonStyle.Danger)); // استخدمت ايموجي للاختصار لأن الزر له حد
        });
        // نضيف أسماء في رسالة منفصلة لو الأزرار ضاعت، بس هنا بنعتمد التبسيط
        // ملاحظة: الأزرار لها حد 5 في الصف، هنا نسخة مبسطة. للنسخة الكاملة تحتاج لوب لتقسيم الأزرار
        channel.send({ content: `<@${mafiaId}> **اختر ضحيتك:**\n${game.alive.filter(id => id !== mafiaId).map((id, i) => `${i+1}. <@${id}>`).join('\n')}`, components: [row] }).then(m => setTimeout(() => m.delete(), 19000));
    }

    // الطبيب
    if (doctorId && !doctorId.startsWith('bot')) {
        const row = new ActionRowBuilder();
        game.alive.forEach(id => {
            row.addComponents(new ButtonBuilder().setCustomId(`doctor_save_${id}`).setLabel('💖').setStyle(ButtonStyle.Success));
        });
        channel.send({ content: `<@${doctorId}> **مين تبي تحمي؟**`, components: [row] }).then(m => setTimeout(() => m.delete(), 19000));
    }

    // الشرطي
    if (policeId && !policeId.startsWith('bot')) {
        const row = new ActionRowBuilder();
        game.alive.filter(id => id !== policeId).forEach(id => {
            row.addComponents(new ButtonBuilder().setCustomId(`police_check_${id}`).setLabel('🔍').setStyle(ButtonStyle.Secondary));
        });
        channel.send({ content: `<@${policeId}> **مين تبي تحقق معه؟**`, components: [row] }).then(m => setTimeout(() => m.delete(), 19000));
    }

    // منطق البوتات (لو المطور يجرب)
    if (game.devMode) {
        if (!game.nightAction.saveTarget) game.nightAction.saveTarget = game.players[0]; // البوت يحميك
    }

    setTimeout(() => {
        resolveNight(channel, game);
    }, 20000); // 20 ثانية لليل
}

function resolveNight(channel, game) {
    const killed = game.nightAction.killTarget;
    const saved = game.nightAction.saveTarget;
    let msg = '🌅 **طلع الصبح...**\n';

    if (killed) {
        if (killed === saved) {
            msg += `🔪 حاولت المافيا قتل <@${killed}> لكن **الطبيب** تدخل في اللحظة الأخيرة وانقذه! 💊`;
        } else {
            msg += `💀 للأسف.. وجدنا <@${killed}> مقتولاً في منزله.`;
            game.alive = game.alive.filter(id => id !== killed);
        }
    } else {
        msg += '🕊️ مرت الليلة بسلام ولم يمت أحد.';
    }

    channel.send(msg);
    if (checkWinner(channel, game)) return;
    
    setTimeout(() => startVoting(channel, game), 3000);
}

async function startVoting(channel, game) {
    const rows = [];
    let currentRow = new ActionRowBuilder();
    
    game.alive.forEach((pId, index) => {
        if (index > 0 && index % 5 === 0) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
        currentRow.addComponents(new ButtonBuilder().setCustomId(`vote_${pId}`).setLabel(client.users.cache.get(pId)?.username || `لاعب ${index+1}`).setStyle(ButtonStyle.Secondary));
    });
    rows.push(currentRow);

    const voteMsg = await channel.send({ content: `🗳️ **وقت التصويت! معكم 30 ثانية لاختيار المشتبه به.**\n(الأغلبية تطرد الشخص)`, components: rows });

    setTimeout(() => {
        voteMsg.delete().catch(() => {});
        
        // حساب الأصوات
        const counts = {};
        game.votes.forEach(target => counts[target] = (counts[target] || 0) + 1);
        
        // إيجاد الأكثر تصويتاً مع معالجة التعادل
        let maxVotes = 0;
        let candidates = [];
        
        for (const [id, count] of Object.entries(counts)) {
            if (count > maxVotes) {
                maxVotes = count;
                candidates = [id];
            } else if (count === maxVotes) {
                candidates.push(id);
            }
        }

        if (candidates.length === 1 && maxVotes > 0) {
            const kickedId = candidates[0];
            // التحقق من العباءة في التصويت (اذا كانت العباءة تحمي من التصويت - حسب تصميم لعبتك)
            // سأفترض العباءة تحمي من القتل والشرطي فقط، لكن لو تبيها تحمي من التصويت فعل السطرين تحت:
            // if (game.protectedByCloak === kickedId) { channel.send(`👻 صوتوا على <@${kickedId}> لكنه اختفى بعباءة!`); } else {
            
            game.alive = game.alive.filter(id => id !== kickedId);
            channel.send(`⚖️ **بناءً على التصويت، تم إعدام <@${kickedId}>!**\nكشفت جثته أنه كان: **${game.roles[kickedId]}**`);
            
        } else {
            channel.send('⚖️ **تعادلت الأصوات أو لم يصوت أحد. لن يتم إعدام أحد اليوم.**');
        }

        game.votes.clear();
        if (!checkWinner(channel, game)) {
            setTimeout(() => startNight(channel, game), 5000);
        }

    }, 30000);
}

function checkWinner(channel, game) {
    const mafiaCount = game.alive.filter(id => game.roles[id] === 'mafia').length;
    const othersCount = game.alive.length - mafiaCount;

    if (mafiaCount === 0) {
        channel.send(`🎉 **فاز المواطنين! تم القضاء على المافيا!**\nالمافيا كان: ${Object.keys(game.roles).filter(k => game.roles[k] === 'mafia').map(k => `<@${k}>`).join(', ')}`);
        activeMafiaGames.delete(game.id || channel.id); // تنظيف باستخدام مفتاح البحث الصحيح
        // بما أن الـ Map مفتاحها msg.id في الكود الأصلي، نحتاج طريقة للوصول له أو نعتمد أن اللعبة تنتهي
        // هنا سأقوم بمسح كل الألعاب في الـ Map التي تطابق الهوست لتنظيف مضمون
        for (const [key, val] of activeMafiaGames.entries()) {
            if (val === game) activeMafiaGames.delete(key);
        }
        return true;
    }
    
    if (mafiaCount >= othersCount) {
        channel.send(`😈 **فازت المافيا! سيطروا على المدينة.**\nالمافيا: ${Object.keys(game.roles).filter(k => game.roles[k] === 'mafia').map(k => `<@${k}>`).join(', ')}`);
        for (const [key, val] of activeMafiaGames.entries()) {
            if (val === game) activeMafiaGames.delete(key);
        }
        return true;
    }

    return false;
}


  // أوامر الإدارة النصية
  if (command === 'تايم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    const timeArg = args.find(a => /^\d+[mhd]$/i.test(a));
    if (!member || !timeArg) return message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    if (member.id === message.author.id) return message.channel.send(`-# ** ما تقدر تسوي تايم لنفسك يا اهبل <:emoji_464:1388211597197050029> **`);
    const timeValue = parseInt(timeArg);
    const timeUnit = timeArg.slice(-1).toLowerCase();
    let durationInMs = timeValue * (timeUnit === 'm' ? 60 : timeUnit === 'h' ? 3600 : 86400) * 1000;
    if (durationInMs > 2419200000) return message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    try {
      await member.timeout(durationInMs);
      message.channel.send(`-# **تم اسكات ${member} يارب ما يعيدها <a:DancingShark:1469030444774199439>**`);
    } catch (error) {
      message.channel.send(`-# **ما تقدر تسويها هو يدعس عليك <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'تكلم') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return;
    const member = message.mentions.members.first();
    if (!member) return message.channel.send(`-# **منشن الشخص الي تبي تفك عنه التايم يا ذكي <:emoji_334:1388211595053760663>**`);
    try {
      await member.timeout(null);
      message.channel.send(`-# **تمت مسامحتك ايها العبد ${member} <:2thumbup:1467287897429512396>**`);
    } catch (error) {
      message.channel.send(`-# **ما اقدر افك عنه التايم، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'طرد') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.KickMembers)) return;
    const member = message.mentions.members.first();
    if (!member) return message.channel.send(`-# **منشن الشخص الي تبي تطرده يا ذكي <:emoji_334:1388211595053760663>**`);
    if (member.id === message.author.id) return message.channel.send(`-# **تبي تطرد نفسك؟ استهدي بالله <:rimuruWut:1388211603140247565>**`);
    try {
      const memberTag = member.user.tag;
      await member.kick();
      message.channel.send(`-# **انطرد ${memberTag} يا مسكين وش سوا يا ترى <:s7_discord:1388214117365453062>**`);
    } catch (error) {
      message.channel.send(`-# **ما اقدر اطرده، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'حذف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount < 1 || amount > 100) return message.channel.send(`-# **حدد عدد الرسايل الي تبي تحذفها (1-100) يا ذكي <:emoji_334:1388211595053760663>**`);
    try {
      await message.channel.bulkDelete(amount + 1);
      const msg = await message.channel.send(`-# **تم حذف ${amount} رسايل بنجاح <:2thumbup:1467287897429512396>**`);
      setTimeout(() => msg.delete().catch(() => {}), 3000);
    } catch (error) {
      message.channel.send(`-# **ما اقدر احذف الرسايل، تأكد من صلاحيات البوت <:emoji_43:1397804543789498428>**`);
    }
  }

  if (command === 'دنانير') {
    const user = message.mentions.users.first() || message.author;
    const userData = await getUserData(user.id);
    message.channel.send(`-# **رصيد ${user} هو ${userData.balance} دنانير <:money_with_wings:1388212679981666334>**`);
  }

  if (command === 'تحويل') {
    const target = message.mentions.users.first();
    const amount = parseInt(args.find(a => !isNaN(a)));
    if (!target || isNaN(amount) || amount <= 0) return message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
    const senderData = await getUserData(message.author.id);
    if (senderData.balance < amount) return message.channel.send(`-# **رصيدك ما يكفي يا فقير <:emoji_464:1388211597197050029>**`);
    if (target.id === message.author.id) return message.channel.send(`-# **ما تقدر تحول لنفسك يا اهبل <:emoji_464:1388211597197050029>**`);
    
    const lastTransfer = transferCooldowns.get(message.author.id);
    if (lastTransfer && Date.now() - lastTransfer < 10000) {
      const remaining = Math.ceil((10000 - (Date.now() - lastTransfer)) / 1000);
      return message.channel.send(`-# **انتظر ${remaining} ثواني قبل التحويل مرة أخرى <:emoji_334:1388211595053760663>**`);
    }

    const confirmMsg = await message.channel.send({ content: `-# **اكتب "تأكيد" لو انت متأكد من عملية التحويل  **\n-# تجاهل الرسالة لو لم تكن متاكد` });
    pendingTransfers.set(confirmMsg.id, { senderId: message.author.id, targetId: target.id, amount, msgId: confirmMsg.id, channelId: message.channel.id });
    setTimeout(() => { if (pendingTransfers.has(confirmMsg.id)) { pendingTransfers.delete(confirmMsg.id); confirmMsg.delete().catch(() => {}); } }, 10000);
  }

  if (command === 'اغنياء') {
    const topUsers = await User.find().sort({ balance: -1 }).limit(5);
    const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx+1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
    const embed = new EmbedBuilder().setTitle('الطبقة الارستقراطية <:y_coroa:1404576666105417871>').setDescription(topMsg).setColor(0x2b2d31);
    message.channel.send({ embeds: [embed] });
  }

  if (command === 'السجل') {
    const user = message.mentions.users.first() || message.author;
    const userData = await getUserData(user.id);
    const history = userData.history.slice(-5).reverse().map(h => `-# **${h.type}: ${h.amount} (${h.date.toLocaleDateString()})**`).join('\n') || 'لا يوجد سجل.';
    message.channel.send({ embeds: [new EmbedBuilder().setTitle(`سجل ${user.username}`).setDescription(history).setColor(0x2b2d31)] });
  }

  if (command === 'مافيا') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.channel.send(`-# **للأسف السيرفر دكتاتوري ما معك صلاحية انك تشغل اللعبة <:__:1467633552408576192> **`);
    }
    const joinRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary));
    if (message.author.id === OWNER_ID) joinRow.addComponents(new ButtonBuilder().setCustomId('dev_start_mafia').setLabel('وضع المطور (تجربة وحدك)').setStyle(ButtonStyle.Danger));
    
    const embed = new EmbedBuilder().setTitle('لعبة المافيا <:emoji_38:1401773302619439147>').setDescription(`-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: 0**\n\n-# **شرح اللعبة**\n-# اللعبة فيها قاتل و طبيب و شرطي و مواطنين\n-# القاتل يحاول يقتل الكل بدون ما ينكشف\n-# الطبيب يحمي شخص كل ليلة من القتل\n-# الشرطي يكشف هويات الناس بالليل\n-# المواطنين لازم يصوتون على القاتل ويطردونه عشان يفوزون`).setColor(0x2b2d31);
    const msg = await message.channel.send({ embeds: [embed], components: [joinRow] });
    activeMafiaGames.set(msg.id, { hostId: message.author.id, players: [], started: false, alive: [], roles: {}, votes: new Map(), usedAbilities: new Set(), protectedByCloak: null, monitored: null, devMode: false });
    
    setTimeout(async () => {
    if (!game.started) return;
      const game = activeMafiaGames.get(msg.id);
      if (game && !game.started) {
        if (game.players.length < 4 && !game.devMode) {
          await msg.edit({ content: '-# **اللعبة فشلت عشان مافي عدد كافي دخلها <:new_emoji:1388436095842385931> **', embeds: [], components: [] }).catch(() => {});
          activeMafiaGames.delete(msg.id);
        }
      }
    }, 30000);
  }

  if (command === 'وقف') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const gameEntry = Array.from(activeMafiaGames.entries()).find(([, g]) => g.hostId === message.author.id || message.member.permissions.has(PermissionsBitField.Flags.Administrator));
    if (gameEntry) {
      activeMafiaGames.delete(gameEntry[0]);
      message.channel.send(`-# **تم وقفنا اللعبة عن التشغيل <:new_emoji:1388436095842385931> **`);
    }
  }
});

client.on('interactionCreate', async (i) => {
  const globalSettings = await getGlobalSettings();
  if (i.guild && !globalSettings.allowedGuilds.includes(i.guild.id)) return;

  if (i.isChatInputCommand()) {
    const { commandName, options, user, member } = i;
    const userData = await getUserData(user.id);

    if (commandName === 'bothelp') {
      const embed = new EmbedBuilder()
        .setTitle('قائمة الأوامر')
        .setColor(0x2b2d31)
        .setDescription(`-# **/economy balance - عرض الرصيد**\n-# **/economy transfer - تحويل أموال**\n-# **/economy top - قائمة الأغنياء**\n-# **/games mafia - لعبة مافيا**\n-# **/welcome test - تجربة الترحيب**\n-# **/giveaway start - بدء قيف أوي**\n-# **أوامر نصية: دنانير، تحويل، اغنياء، السجل، تايم، طرد، حذف، مافيا، وقف**`);
      return i.reply({ embeds: [embed] });
    }

    if (commandName === 'economy') {
      const sub = options.getSubcommand();
      if (sub === 'balance') {
        const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
        return i.reply({ embeds: [new EmbedBuilder().setDescription(`-# **رصيدك الحالي ${userData.balance} دنانير و آخر عملية تحويل تلقيتها بـ ${lastIn.amount} <:money_with_wings:1388212679981666334>**`).setColor(0x2b2d31)] });
      }
      if (sub === 'transfer') {
        const lastTransfer = transferCooldowns.get(user.id);
        if (lastTransfer && Date.now() - lastTransfer < 10000) {
          const remaining = Math.ceil((10000 - (Date.now() - lastTransfer)) / 1000);
          return i.reply({ content: `انتظر ${remaining} ثواني قبل التحويل مرة أخرى.`, ephemeral: true });
        }
        const target = options.getUser('user');
        const amount = options.getInteger('amount');
        if (userData.balance < amount) return i.reply({ content: 'رصيدك لا يكفي.', ephemeral: true });
        if (target.id === user.id) return i.reply({ content: 'ما تقدر تحول لنفسك.', ephemeral: true });
        
        const confirmMsg = await i.reply({ content: `-# **اكتب "تأكيد" لو انت متأكد من عملية التحويل  **\n-# تجاهل الرسالة لو لم تكن متاكد`, fetchReply: true });
        pendingTransfers.set(confirmMsg.id, { senderId: user.id, targetId: target.id, amount, msgId: confirmMsg.id, channelId: i.channel.id });
        setTimeout(() => { if (pendingTransfers.has(confirmMsg.id)) { pendingTransfers.delete(confirmMsg.id); i.deleteReply().catch(() => {}); } }, 10000);
      }
      if (sub === 'top') {
        const topUsers = await User.find().sort({ balance: -1 }).limit(5);
        const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx+1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
        const embed = new EmbedBuilder().setTitle('الطبقة الارستقراطية <:y_coroa:1404576666105417871>').setDescription(topMsg).setColor(0x2b2d31);
        return i.reply({ embeds: [embed] });
      }
    }

    if (commandName === 'games') {
      const sub = options.getSubcommand();
      if (sub === 'mafia') {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return i.reply({ content: '-# **للأسف السيرفر دكتاتوري ما معك صلاحية انك تشغل اللعبة <:__:1467633552408576192> **', ephemeral: true });
        }
        const joinRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary));
        if (user.id === OWNER_ID) joinRow.addComponents(new ButtonBuilder().setCustomId('dev_start_mafia').setLabel('وضع المطور (تجربة وحدك)').setStyle(ButtonStyle.Danger));
        
        const embed = new EmbedBuilder().setTitle('لعبة المافيا <:emoji_38:1401773302619439147>').setDescription(`-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: 0**\n\n-# **شرح اللعبة**\n-# اللعبة فيها قاتل و طبيب و شرطي و مواطنين\n-# القاتل يحاول يقتل الكل بدون ما ينكشف\n-# الطبيب يحمي شخص كل ليلة من القتل\n-# الشرطي يكشف هويات الناس بالليل\n-# المواطنين لازم يصوتون على القاتل ويطردونه عشان يفوزون`).setColor(0x2b2d31);
        const msg = await i.reply({ embeds: [embed], components: [joinRow], fetchReply: true });
        activeMafiaGames.set(msg.id, { hostId: user.id, players: [], started: false, alive: [], roles: {}, votes: new Map(), usedAbilities: new Set(), protectedByCloak: null, monitored: null, devMode: false });
        
        setTimeout(async () => {
    if (!game.started) return;
          const game = activeMafiaGames.get(msg.id);
          if (game && !game.started) {
            if (game.players.length < 4 && !game.devMode) {
              await i.editReply({ content: '-# **اللعبة فشلت عشان مافي عدد كافي دخلها <:new_emoji:1388436095842385931> **', embeds: [], components: [] }).catch(() => {});
              activeMafiaGames.delete(msg.id);
            }
          }
        }, 30000);
      }
    }

    if (commandName === 'welcome') {
      const sub = options.getSubcommand();
      const settings = await getSettings(i.guild.id);
      if (sub === 'set') { settings.welcomeSettings.channelId = options.getChannel('channel').id; await settings.save(); i.reply('✅ تم تعيين الروم.'); }
      if (sub === 'edit') {
        if(options.getString('title')) settings.welcomeSettings.title = options.getString('title');
        if(options.getString('description')) settings.welcomeSettings.description = options.getString('description');
        if(options.getString('color')) settings.welcomeSettings.color = options.getString('color').replace('#','');
        if(options.getString('image')) settings.welcomeSettings.image = options.getString('image');
        await settings.save(); i.reply('✅ تم التعديل.');
      }
      if (sub === 'info') {
        i.reply({ embeds: [new EmbedBuilder().setTitle('إعدادات الترحيب').setColor(0x2b2d31).setDescription(`-# **الروم:** <#${settings.welcomeSettings.channelId || 'غير محدد'}>\n-# **اللون:** #${settings.welcomeSettings.color}\n-# **العنوان:** ${settings.welcomeSettings.title || 'غير محدد'}\n-# **الوصف:** ${settings.welcomeSettings.description || 'غير محدد'}`)] });
      }
      if (sub === 'test') {
        await sendWelcome(member, settings);
        i.reply({ content: '✅ تم إرسال تجربة الترحيب.', ephemeral: true });
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
              return btn.reply({ content: '-# **انت داخل السحب اصلا تبي تطلع ؟ <:__:1467633552408576192> **', components: [exitRow], ephemeral: true }).catch(() => {});
            }
            participants.add(btn.user.id);
            btn.reply({ content: '-# **تم دخولك فالسحب يا رب تفوز <:2thumbup:1467287897429512396> **', ephemeral: true }).catch(() => {});
          }
          if (btn.customId === 'exit_giveaway') {
            participants.delete(btn.user.id);
            btn.update({ content: '❌ تم خروجك من السحب.', components: [], ephemeral: true }).catch(() => {});
          }
        });

        collector.on('end', async () => {
          const list = Array.from(participants);
          if (list.length === 0) return msg.edit({ content: '❌ انتهى القيف أوي بدون مشاركين.', embeds: [], components: [] }).catch(() => {});
          const winners = [];
          for (let j = 0; j < Math.min(winnersCount, list.length); j++) {
            const winnerIdx = Math.floor(Math.random() * list.length);
            winners.push(`<@${list.splice(winnerIdx, 1)[0]}>`);
          }
          const endEmbed = EmbedBuilder.from(embed).setDescription(`-# **انتهى السحب على ${prize}**\n-# **الفائزين هم** ${winners.join(', ')}`);
          await msg.edit({ embeds: [endEmbed], components: [] }).catch(() => {});
          msg.channel.send(`-# **مبروك فزتم بـ ${prize} افتحوا تكت عشان تستلموها <:emoji_33:1401771703306027008> **\n-# **${winners.join(', ')}**`).catch(() => {});
        });
      }
    }

    if (commandName === 'ticket') {
      if (options.getSubcommand() === 'panel') {
        const embed = new EmbedBuilder().setTitle('نظام التذاكر').setDescription('اضغط على الزر لفتح تذكرة جديدة.').setColor(0x2b2d31);
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Primary));
        i.reply({ embeds: [embed], components: [row] });
      }
    }
  }

  if (i.isButton()) {
    // معالجة أزرار المافيا
        if (i.customId === 'mafia_rules') {
      const rulesEmbed = new EmbedBuilder()
        .setTitle('شرح لعبة المافيا 🔪')
        .setDescription(`-# **الأدوار:**\n-# 🔪 **القاتل:** يحاول قتل الجميع دون كشفه. يمكنه شراء "العباءة" للتخفي.\n-# 💉 **الطبيب:** يحمي شخصاً كل ليلة. يمكنه شراء "الشفاء" لإعادة ميت.\n-# 🔍 **الشرطي:** يكشف هويات اللاعبين. يمكنه شراء "المراقبة" لكشف القاتل عند القتل.\n-# 👨‍🌾 **المواطن:** يحاول كشف القاتل عبر التصويت.\n\n-# **المتجر:** يمكنك شراء قدرات خاصة أثناء الليل أو النهار باستخدام رصيدك.`)
        .setColor(0x2b2d31);
      return i.reply({ embeds: [rulesEmbed], ephemeral: true });
    }
    if (i.customId === 'join_mafia') {
      const game = activeMafiaGames.get(i.message.id);
      if (!game || game.started) return i.reply({ content: 'اللعبة بدأت أو انتهت.', ephemeral: true });
      if (game.players.includes(i.user.id)) return i.reply({ content: 'أنت منضم أصلاً!', ephemeral: true });
      game.players.push(i.user.id);
      const embed = EmbedBuilder.from(i.message.embeds[0]);
      const playersList = game.players.map(p => `\u200F<@${p}>\u202C`).join(', ');
      embed.setDescription(`-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**
-# **اللاعبين الحاليين: ${game.players.length}**
${playersList}`);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('mafia_rules').setLabel('شرح اللعبة').setStyle(ButtonStyle.Secondary));
      if (game.players.length >= 4) row.addComponents(new ButtonBuilder().setCustomId('start_mafia').setLabel('بدء اللعبة').setStyle(ButtonStyle.Secondary));
      await i.update({ embeds: [embed], components: [row] }).catch(() => {});
    }

    if (i.customId === 'dev_start_mafia') {
      const game = activeMafiaGames.get(i.message.id);
      if (!game || i.user.id !== OWNER_ID) return i.reply({ content: 'هذا الزر للمطور فقط!', ephemeral: true });
      game.devMode = true;
      game.started = true;
      game.players = [i.user.id, 'bot1', 'bot2', 'bot3'];
      game.alive = [...game.players];
      game.roles[i.user.id] = 'mafia';
      game.roles['bot1'] = 'doctor';
      game.roles['bot2'] = 'police';
      game.roles['bot3'] = 'citizen';
      await i.update({ content: '🚀 تم تفعيل وضع المطور! أنت الآن المافيا لتجربة كل شيء.', embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('reveal_role').setLabel('كشف دوري').setStyle(ButtonStyle.Secondary))] }).catch(() => {});
      setTimeout(() => startNight(i.channel, game), 5000);
    }

    if (i.customId === 'start_mafia') {
      const game = activeMafiaGames.get(i.message.id);
      if (!game || game.hostId !== i.user.id) return i.reply({ content: 'فقط صاحب الأمر يقدر يبدأ اللعبة!', ephemeral: true });
      game.started = true;
      game.alive = [...game.players];
      const players = [...game.players].sort(() => Math.random() - 0.5);
      
      game.roles[players[0]] = 'mafia';
      game.roles[players[1]] = 'doctor';
      game.roles[players[2]] = 'police';
      players.slice(3).forEach(p => game.roles[p] = 'citizen');

      await i.update({ content: '✅ بدأت اللعبة! اضغط على الزر لمعرفة دورك.', embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('reveal_role').setLabel('كشف دوري').setStyle(ButtonStyle.Secondary))] }).catch(() => {});
      setTimeout(() => startNight(i.channel, game), 5000);
    }

    if (i.customId === 'reveal_role') {
      const game = Array.from(activeMafiaGames.values()).find(g => g.roles[i.user.id]);
      if (!game) return i.reply({ content: '-# **انت غير مشارك اصلا**', ephemeral: true });
      
      const role = game.roles[i.user.id];
      const roleNames = { mafia: 'مافيا', doctor: 'طبيب', police: 'شرطي', citizen: 'مواطن' };
      const roleDescs = { mafia: 'تقتل الناس بدون ما يدرون عنك.', doctor: 'تحمي شخص واحد كل جولة من القتل.', police: 'تحاول تكشف مين هو القاتل.', citizen: 'تحاول تعيش وتصوت على الشخص الصح.' };

      return i.reply({ content: `-# **بدأت اللعبة لا تقول لأحد مين انت <:emoji_84:1389404919672340592> **\n-# **انت الحين ${roleNames[role]} الي تقدر تسويه ${roleDescs[role]}**`, ephemeral: true }).catch(() => {});
    }

    if (i.customId === 'open_mafia_shop') {
      const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
      if (!game) return i.reply({ content: '-# **انت غير مشارك اصلا**', ephemeral: true });
      const role = game.roles[i.user.id];
      const row = new ActionRowBuilder();
      
      if (role === 'doctor') row.addComponents(new ButtonBuilder().setCustomId('buy_ability_heal').setLabel('شراء الشفاء (20)').setStyle(ButtonStyle.Secondary));
      if (role === 'mafia') row.addComponents(new ButtonBuilder().setCustomId('buy_ability_cloak').setLabel('شراء العباءة (10)').setStyle(ButtonStyle.Secondary));
      if (role === 'police') row.addComponents(new ButtonBuilder().setCustomId('buy_ability_monitor').setLabel('شراء المراقبة (10)').setStyle(ButtonStyle.Secondary));
      
      const shopEmbed = new EmbedBuilder()
        .setTitle('متجر القدرات 🛒')
        .setDescription(`-# **قدرة الشفاء 20 دينار**\n-# خاصة بالطبيب ترجع شخص واحد تم اقصائه للحياة\n-# **قدرة العبائة - 10 دينار**\n-# خاصة بالقاتل تنقذك من الكشف و التصويت مره واحدة في اللعبة الواحدة\n-# ** قدرة المراقبة - 10 دينار**\n-# تضع المراقبة على شخص واحد ليتم كشف هوية القاتل عندما يقتل الشخص الذي راقبته فالجولة السابقة`)
        .setColor(0x2b2d31);
      
      return i.reply({ embeds: [shopEmbed], components: row.components.length > 0 ? [row] : [], ephemeral: true });
    }

    if (i.customId.startsWith('buy_ability_')) {
      const ability = i.customId.replace('buy_ability_', '');
      const prices = { heal: 20, cloak: 10, monitor: 10 };
      const price = prices[ability];
      const userData = await getUserData(i.user.id);
      
      if (userData.balance < price) return i.reply({ content: '-# **تراك مطفر افتح تكت خذ عملات <:money_with_wings:1388212679981666334> **', ephemeral: true });
      
      const confirmRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`confirm_buy_${ability}`).setLabel('تأكيد الشراء').setStyle(ButtonStyle.Secondary));
      return i.reply({ content: `هل أنت متأكد من شراء القدرة بـ ${price} دينار؟`, components: [confirmRow], ephemeral: true });
    }

    if (i.customId.startsWith('confirm_buy_')) {
      const ability = i.customId.replace('confirm_buy_', '');
      const prices = { heal: 20, cloak: 10, monitor: 10 };
      const price = prices[ability];
      const userData = await getUserData(i.user.id);
      const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
      
      if (!game) return i.reply({ content: 'انتهت اللعبة!', ephemeral: true });
      if (game.usedAbilities.has(`${i.user.id}_${ability}`)) return i.reply({ content: 'استخدمت هذه القدرة بالفعل في هذه المباراة!', ephemeral: true });

      userData.balance -= price;
      userData.history.push({ type: 'BUY_ABILITY', amount: price });
      await userData.save();
      game.usedAbilities.add(`${i.user.id}_${ability}`);
      
      if (ability === 'cloak') game.protectedByCloak = i.user.id;
      if (ability === 'monitor') game.usedAbilities.add(`${i.user.id}_monitor`);
      
      await i.update({ content: '✅ تم الشراء بنجاح! تم تفعيل القدرة.', components: [], embeds: [] });
    }

    if (i.customId.startsWith('mafia_kill_') || i.customId.startsWith('doctor_save_') || i.customId.startsWith('police_check_')) {
      const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
      if (!game) return i.reply({ content: '-# **انت غير مشارك اصلا**', ephemeral: true });
      if (!game.alive.includes(i.user.id)) return i.reply({ content: 'أنت ميت!', ephemeral: true });

      const [action, , targetId] = i.customId.split('_');
      if (action === 'mafia') {
        game.nightAction = { type: 'kill', target: targetId };
        await i.reply({ content: `-# **انت اخترت <@${targetId}> لقتله **`, ephemeral: true });
      } else if (action === 'doctor') {
        game.nightAction = { ...game.nightAction, doctorTarget: targetId };
        await i.reply({ content: `اخترت حماية <@${targetId}>`, ephemeral: true });
      } else if (action === 'police') {
        game.nightAction = { ...game.nightAction, monitorTarget: targetId };
        if (game.protectedByCloak === targetId) {
          await i.reply({ content: `الشخص <@${targetId}> هو مواطن بريء 😇 (تم استخدام العباءة)`, ephemeral: true });
          game.protectedByCloak = null;
        } else {
          const isMafia = game.roles[targetId] === 'mafia';
          await i.reply({ content: `الشخص <@${targetId}> هو ${isMafia ? 'المافيا' : 'مواطن بريء'}`, ephemeral: true });
        }
      }
    }

    if (i.customId.startsWith('vote_')) {
      const targetId = i.customId.split('_')[1];
      const game = Array.from(activeMafiaGames.values()).find(g => g.alive.includes(i.user.id));
      if (!game) return i.reply({ content: '-# **انت غير مشارك اصلا**', ephemeral: true });
      if (!game.alive.includes(i.user.id)) return i.reply({ content: 'أنت ميت!', ephemeral: true });
      
      if (game.protectedByCloak === targetId) {
        return i.reply({ content: 'هذا الشخص محمي بعباءة الإخفاء! لا يمكنك التصويت ضده الآن.', ephemeral: true });
      }
      
      game.votes.set(i.user.id, targetId);
      return i.reply({ content: `تم تسجيل تصويتك ضد <@${targetId}>`, ephemeral: true }).catch(() => {});
    }

    if (i.customId === 'open_ticket') {
      const ch = await i.guild.channels.create({ name: `ticket-${i.user.username}`, type: ChannelType.GuildText, permissionOverwrites: [{ id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }] });
      ch.send({ content: `${i.user}`, components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Secondary))] });
      i.reply({ content: `تم فتح التذكرة ${ch}`, ephemeral: true });
    }
    if (i.customId === 'close_ticket') { await i.reply('سيتم الإغلاق...'); setTimeout(() => i.channel.delete(), 3000); }
  }
});

async function startNight(channel, game) {
  if (game.alive.length <= 1) return checkWinner(channel, game);
  game.nightAction = {};
  const mafiaId = Object.keys(game.roles).find(id => game.roles[id] === 'mafia' && game.alive.includes(id));
  const doctorId = Object.keys(game.roles).find(id => game.roles[id] === 'doctor' && game.alive.includes(id));
  const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police' && game.alive.includes(id));

  
  channel.send({ content: '-# ** دور القاتل عشان يلعب لعبته مين بيكون الضحيه التالية يا ترى **<:1KazumaGrin:1468386233750392947>' });

  if (mafiaId && mafiaId !== 'bot1' && mafiaId !== 'bot2' && mafiaId !== 'bot3') {
    const row = new ActionRowBuilder();
    game.alive.filter(id => id !== mafiaId).slice(0, 5).forEach(pId => {
      row.addComponents(new ButtonBuilder().setCustomId(`mafia_kill_${pId}`).setLabel(client.users.cache.get(pId)?.username || pId).setStyle(ButtonStyle.Secondary));
    });
    channel.send({ content: `<@${mafiaId}> -# **اختر ضحيتك تراك بس الي شايف ذي الخيارات محد شايفهم غيرك <:emoji_38:1401773302619439147> **`, components: [row] }).catch(() => {});
  }

  setTimeout(async () => {
    if (!game.started) return;
    if (!game.nightAction.target && mafiaId && !game.devMode) {
      game.alive = game.alive.filter(id => id !== mafiaId);
      channel.send(`-# ** القاتل تم طرده من اللعبة لانه ما لعب <:new_emoji:1388436095842385931> **`);
      return checkWinner(channel, game);
    }

    if (doctorId && doctorId !== 'bot1' && doctorId !== 'bot2' && doctorId !== 'bot3') {
      const row = new ActionRowBuilder();
      game.alive.slice(0, 5).forEach(pId => {
        row.addComponents(new ButtonBuilder().setCustomId(`doctor_save_${pId}`).setLabel(client.users.cache.get(pId)?.username || pId).setStyle(ButtonStyle.Secondary));
      });
      channel.send({ content: `<@${doctorId}> اختر شخصاً لحمايته`, components: [row] }).catch(() => {});
    }

    if (policeId && policeId !== 'bot1' && policeId !== 'bot2' && policeId !== 'bot3') {
      const row = new ActionRowBuilder();
      game.alive.filter(id => id !== policeId).slice(0, 5).forEach(pId => {
        row.addComponents(new ButtonBuilder().setCustomId(`police_check_${pId}`).setLabel(client.users.cache.get(pId)?.username || pId).setStyle(ButtonStyle.Secondary));
      });
      channel.send({ content: `<@${policeId}> اختر شخصاً للكشف عن هويته`, components: [row] }).catch(() => {});
    }

    setTimeout(() => {
      const killedId = game.nightAction.target;
      const savedId = game.nightAction.doctorTarget;
      const roleNames = { mafia: 'مافيا', doctor: 'طبيب', police: 'شرطي', citizen: 'مواطن' };
      const role = game.roles[killedId];

            if (killedId && killedId !== savedId) {
        game.alive = game.alive.filter(id => id !== killedId);
        let msg = `-# **المرحوم راح فيها و تم قتله <@${killedId}> هو كان ${roleNames[role]} <:emoji_84:1389404919672340592>**`;
        const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police');
        if (game.nightAction.monitorTarget === killedId) {
            msg += `
-# ** لاكن الشرطي كان حاطت مراقبة على ذا الشخص و شاف القاتل و هو يقتله<:s7_discord:1388214117365453062> **`;
        }
        channel.send(msg);
      } else if (killedId && killedId === savedId) {
        channel.send(`-# ** الطبيب الكفو قدر يرجع <@${killedId}> <:echat_kannaCool:1405424651399598221> **`);
      } else if (!killedId && mafiaId) {
        game.alive = game.alive.filter(id => id !== mafiaId);
        channel.send(`-# ** القاتل تم طرده من اللعبة لانه ما لعب <:new_emoji:1388436095842385931> **`);
        return checkWinner(channel, game);
      } else {
        channel.send('🌅 طلع الصبح... لم يمت أحد هذا الليل.');
      }
      startVoting(channel, game);
    }, 15000);
  }, 30000);
}

async function startVoting(channel, game) {
  if (game.alive.length <= 1) return checkWinner(channel, game);
  const rows = [];
  let currentRow = new ActionRowBuilder();
  game.alive.forEach((pId, index) => {
    if (index > 0 && index % 5 === 0) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
    currentRow.addComponents(new ButtonBuilder().setCustomId(`vote_${pId}`).setLabel(client.users.cache.get(pId)?.username || pId).setStyle(ButtonStyle.Secondary));
  });
  rows.push(currentRow);

  const shopRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_mafia_shop').setLabel('القدرات').setStyle(ButtonStyle.Secondary));
  rows.push(shopRow);

  const voteMsg = await channel.send({ content: `-# ** صوتوا على الشخص الي تشوفونه هو القاتل <:emoji_38:1470920843398746215> **`, components: rows }).catch(() => {});
  
  setTimeout(async () => {
    if (!game.started) return;
    const voteCounts = {};
    game.votes.forEach(targetId => voteCounts[targetId] = (voteCounts[targetId] || 0) + 1);
    let kickedId = null; let maxVotes = 0;
    for (const [id, count] of Object.entries(voteCounts)) { if (count > maxVotes) { maxVotes = count; kickedId = id; } }
    
    if (kickedId) {
      if (game.protectedByCloak === kickedId) {
        channel.send(`-# **حاولتم طرد <@${kickedId}> لكنه استخدم عباءة الإخفاء ونجا!**`);
        game.protectedByCloak = null;
      } else {
        const role = game.roles[kickedId];
        const roleNames = { mafia: 'مافيا', doctor: 'طبيب', police: 'شرطي', citizen: 'مواطن' };
        game.alive = game.alive.filter(id => id !== kickedId);
        
        if (role === 'mafia') {
          // التحقق من التخفي عند التصويت
          const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police');
          if (game.protectedByCloak === kickedId) {
             channel.send(`-# **اقتربتوا منه كثير بس كان مستخدم زي تخفي <:emoji_38:1470920843398746215> **`);
          } else {
             channel.send(`-# ** تم امساك القاتل <@${kickedId}> هذا كان انت اجل…. <:__:1467633552408576192>  **`);
             return checkWinner(channel, game);
          }
        } else {
          channel.send(`-# **المسكين <@${kickedId}> تم التصويت عليه ظلم و راح فيها هو كان ${roleNames[role]} <:emoji_43:1397804543789498428> **`);
        }
      }
    } else { channel.send('لم يتم التصويت على أحد، تستمر اللعبة...').catch(() => {}); }
    
    game.votes.clear();
    if (game.alive.length > 1) startNight(channel, game);
    else checkWinner(channel, game);
  }, 30000);
}

function checkWinner(channel, game) {
  const mafiaAlive = game.alive.some(id => game.roles[id] === 'mafia');
  const mafiaId = Object.keys(game.roles).find(id => game.roles[id] === 'mafia');
  const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police');
  const doctorId = Object.keys(game.roles).find(id => game.roles[id] === 'doctor');
  const citizens = Object.keys(game.roles).filter(id => game.roles[id] === 'citizen').map(id => `<@${id}>`).join(', ');
  
  if (!mafiaAlive) { 
    channel.send(`-# **المواطنين فازوا وانفضح المجرم <@${mafiaId}> <:emoji_38:1470920843398746215>
الشرطي <@${policeId}><:s7_discord:1388214117365453062> المواطنين ${citizens} <:emoji_33:1401771703306027008> الطبيب <@${doctorId}> <:emoji_32:1401771771010613319>**`).catch(() => {}); 
  } else { 
    channel.send(`-# **القاتل <@${mafiaId}> لعب فيهم لعب و فاز و محد كشفه <:emoji_38:1401773302619439147>  **`).catch(() => {}); 
  }
  
  game.started = false;
  game.alive = [];
  game.roles = {};
  game.votes.clear();
  for (const [key, val] of activeMafiaGames.entries()) { if (val === game) activeMafiaGames.delete(key); }
}>`).join(', ');
  
  if (!mafiaAlive) { 
    channel.send(`-# **المواطنين فازوا وانفضح المجرم <@${mafiaId}> <:emoji_38:1470920843398746215>
الشرطي <@${policeId}><:s7_discord:1388214117365453062> المواطنين ${citizens} <:emoji_33:1401771703306027008> الطبيب <@${doctorId}> <:emoji_32:1401771771010613319>**`).catch(() => {}); 
  } else { 
    channel.send(`-# **القاتل <@${mafiaId}> لعب فيهم لعب و فاز و محد كشفه <:emoji_38:1401773302619439147>  **`).catch(() => {}); 
  }
  
  // تصفير اللعبة تماماً لمنع استمرار الأوامر
  for (const [key, val] of activeMafiaGames.entries()) { 
    if (val === game) {
        val.started = false;
        val.alive = [];
        activeMafiaGames.delete(key); 
    }
  }
}>`).join(', ');
  if (!mafiaAlive) { channel.send(`-# **المواطنين فازوا وانفضح المجرم <@${mafiaId}> <:emoji_38:1470920843398746215>
الشرطي <@${policeId}><:s7_discord:1388214117365453062> المواطنين ${citizens} <:emoji_33:1401771703306027008> الطبيب <@${doctorId}> <:emoji_32:1401771771010613319>**`).catch(() => {}); }
  else { channel.send(`-# **القاتل <@${mafiaId}> لعب فيهم لعب و فاز و محد كشفه <:emoji_38:1401773302619439147>  **`).catch(() => {}); }
  for (const [key, val] of activeMafiaGames.entries()) { if (val === game) activeMafiaGames.delete(key); }
}

app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));
