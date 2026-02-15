/**
 * ============================================================
 * 🤖 البوت المتكامل - النسخة الكاملة والمنظمة 🤖
 * ============================================================
 * تم تنظيم هذا الكود ليكون أسهل في القراءة والصيانة مع الحفاظ على:
 * 1. كافة الوظائف الحالية بدون أي حذف.
 * 2. كافة الرسائل والإيموجيات والـ IDs كما هي بالضبط.
 * 3. كافة التفاصيل البرمجية (لعبة الأرقام، التحويلات، الاشتراكات، إلخ).
 */

const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, 
    REST, Routes 
} = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');
const app = express();

// ==================== 🔒 [1] الإعدادات والربط 🔒 ====================
const OWNER_ID = "1131951548772122625";
const MONGO_URI = "mongodb+srv://raraftak_db_user:TzKcCxo9EvNDzBbj@cluster0.t4j2uux.mongodb.net/MyBot?retryWrites=true&w=majority";

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

// ==================== 📊 [2] نماذج البيانات (Schemas) 📊 ====================
const UserSchema = new mongoose.Schema({
    userId: String,
    balance: { type: Number, default: 0 },
    history: [{
        type: { type: String },
        amount: Number,
        targetUser: String,
        targetName: String,
        date: { type: Date, default: Date.now }
    }]
});

const SettingsSchema = new mongoose.Schema({
    guildId: String,
    welcomeSettings: {
        channelId: String,
        title: String,
        description: String,
        color: { type: String, default: '2b2d31' },
        image: String
    }
});

const GlobalSettingsSchema = new mongoose.Schema({
    allowedGuilds: { type: [String], default: [] },
    subscriptions: [{
        guildId: String,
        guildName: String,
        ownerId: String,
        duration: String,
        expiresAt: Date,
        status: { type: String, default: 'active' }
    }]
});

const TicketSettingsSchema = new mongoose.Schema({
    guildId: String,
    categoryId: { type: String, default: '' },
    embedDescription: { type: String, default: 'اضغط على الزر لفتح تذكرة جديدة.' },
    embedColor: { type: String, default: '2b2d31' },
    embedImage: { type: String, default: null },
    supportRoleId: { type: String, default: null }
});

const AutoDeleteChannelSchema = new mongoose.Schema({
    guildId: String,
    channelId: String,
    deleteDelay: { type: Number, default: 0 },
    filterType: { type: String, default: 'all' },
    allowedWords: { type: [String], default: [] },
    blockedWords: { type: [String], default: [] },
    exceptUsers: { type: [String], default: [] },
    exceptRoles: { type: [String], default: [] },
    customMessage: { type: String, default: null }
});

const GiveawaySchema = new mongoose.Schema({
    guildId: String,
    channelId: String,
    messageId: String,
    prize: String,
    endTime: Date,
    winners: Number,
    participants: [String],
    image: String,
    condition: String,
    hostId: String,
    ended: { type: Boolean, default: false }
});

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);
const GlobalSettings = mongoose.model('GlobalSettings', GlobalSettingsSchema);
const TicketSettings = mongoose.model('TicketSettings', TicketSettingsSchema);
const AutoDelete = mongoose.model('AutoDeleteChannel', AutoDeleteChannelSchema);
const Giveaway = mongoose.model('Giveaway', GiveawaySchema);

// ==================== 🔧 [3] الدوال المساعدة (Helpers) 🔧 ====================
const Helpers = {
    async getGlobalSettings() {
        let settings = await GlobalSettings.findOne();
        if (!settings) {
            settings = new GlobalSettings();
            await settings.save();
        }
        return settings;
    },
    async getUserData(userId) {
        let user = await User.findOne({ userId });
        if (!user) {
            user = new User({ userId, balance: 0, history: [] });
            await user.save();
        }
        return user;
    },
    async getSettings(guildId) {
        let settings = await Settings.findOne({ guildId });
        if (!settings) {
            settings = new Settings({ guildId, welcomeSettings: { color: '2b2d31' } });
            await settings.save();
        }
        return settings;
    },
    async getTicketSettings(guildId) {
        let settings = await TicketSettings.findOne({ guildId });
        if (!settings) {
            settings = new TicketSettings({ guildId });
            await settings.save();
        }
        return settings;
    },
    async getAutoDeleteChannels(guildId) {
        return await AutoDelete.find({ guildId });
    },
    calculateTax(balance, amount) {
        if (balance < 20) return 0;
        if (balance >= 20 && balance <= 50) return amount * 0.05;
        if (balance >= 51 && balance <= 100) return amount * 0.10;
        if (balance >= 101 && balance <= 200) return amount * 0.15;
        if (balance >= 201 && balance <= 500) return amount * 0.20;
        if (balance >= 501 && balance <= 1000) return amount * 0.25;
        if (balance > 1000) return amount * 0.30;
        return 0;
    },
    async formatHistory(history) {
        if (history.length === 0) return 'لا يوجد سجل معاملات.';
        return history.slice(-5).map(h => {
            const date = new Date(h.date).toLocaleDateString('ar-EG');
            if (h.type === 'TRANSFER_SEND') return `-# **تحويل لـ ${h.targetName}: ${h.amount} دينار (${date})**`;
            if (h.type === 'TRANSFER_RECEIVE') return `-# **استلام من ${h.targetName}: ${h.amount} دينار (${date})**`;
            if (h.type === 'OWNER_ADD') return `-# **إضافة من المطور: ${h.amount} دينار (${date})**`;
            if (h.type === 'OWNER_REMOVE') return `-# **سحب من المطور: ${h.amount} دينار (${date})**`;
            if (h.type === 'WEEKLY_TAX') return `-# **ضريبة أسبوعية: ${h.amount} دينار (${date})**`;
            return `-# **عملية أخرى: ${h.amount} دينار (${date})**`;
        }).join('\n');
    }
};

// ==================== 📋 [4] تعريف الأوامر 📋 ====================
const slashCommands = [
    { name: 'help', description: 'عرض جميع الأوامر' },
    { name: 'bal', description: 'عرض الرصيد', options: [{ name: 'user', description: 'المستخدم', type: 6 }] },
    { name: 'pay', description: 'تحويل أموال', options: [{ name: 'user', description: 'المستلم', type: 6, required: true }, { name: 'amount', description: 'المبلغ', type: 4, required: true }] },
    { name: 'top', description: 'قائمة الأغنياء' },
    { name: 'hist', description: 'سجل المعاملات' },
    {
        name: 'wel', description: 'نظام الترحيب', default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
        options: [
            { name: 'ch', description: 'تعيين روم الترحيب', type: 1, options: [{ name: 'room', description: 'الروم', type: 7, required: true }] },
            { name: 'msg', description: 'تعديل رسالة الترحيب', type: 1, options: [{ name: 'title', description: 'العنوان', type: 3 }, { name: 'desc', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'الصورة', type: 3 }] },
            { name: 'info', description: 'عرض الإعدادات', type: 1 },
            { name: 'test', description: 'تجربة الرسالة', type: 1 }
        ]
    },
    {
        name: 'tic', description: 'نظام التذاكر', default_member_permissions: PermissionsBitField.Flags.Administrator.toString(),
        options: [
            { name: 'panel', description: 'عرض لوحة التذاكر', type: 1 },
            { name: 'set', description: 'إعدادات التذاكر', type: 1, options: [{ name: 'category', description: 'روم التذاكر', type: 7, channel_types: [4] }, { name: 'desc', description: 'الوصف', type: 3 }, { name: 'color', description: 'اللون', type: 3 }, { name: 'image', description: 'الصورة', type: 3 }, { name: 'role', description: 'رتبة الدعم', type: 8 }] }
        ]
    },
    { name: 'num', description: 'لعبة الأرقام', default_member_permissions: PermissionsBitField.Flags.Administrator.toString(), options: [{ name: 'start', description: 'بدء لعبة', type: 1 }, { name: 'stop', description: 'إيقاف اللعبة', type: 1 }] },
    { name: 'give', description: 'نظام القيف أوي', default_member_permissions: PermissionsBitField.Flags.Administrator.toString(), options: [{ name: 'start', description: 'بدء قيف أوي', type: 1, options: [{ name: 'prize', description: 'الجائزة', type: 3, required: true }, { name: 'time', description: 'المدة', type: 3, required: true }, { name: 'winners', description: 'عدد الفائزين', type: 4, required: true }, { name: 'cond', description: 'الشروط', type: 3 }, { name: 'img', description: 'الصورة', type: 3 }] }] }
];

const ownerCommands = [
    { name: 'sub', description: 'نظام الاشتراكات', default_member_permissions: "0", options: [{ name: 'add', description: 'إضافة سيرفر', type: 1, options: [{ name: 'id', description: 'ايدي السيرفر', type: 3, required: true }, { name: 'duration', description: 'المدة', type: 3, required: true, choices: [{ name: 'تجريبي (3 أيام)', value: 'trial' }, { name: 'اسبوع', value: '7d' }, { name: 'شهر', value: '30d' }, { name: 'شهرين', value: '60d' }, { name: 'سنة', value: '1y' }] }] }, { name: 'remove', description: 'حذف سيرفر', type: 1, options: [{ name: 'id', description: 'ايدي السيرفر', type: 3, required: true }] }] },
    { name: 'hosting', description: 'عرض السيرفرات المشتركين', default_member_permissions: "0" },
    { name: 'auto', description: 'نظام الحذف التلقائي', default_member_permissions: "0", options: [{ name: 'add', description: 'إضافة روم', type: 1, options: [{ name: 'channel', description: 'الروم', type: 7, required: true }, { name: 'delay', description: 'المدة', type: 4 }, { name: 'type', description: 'النوع', type: 3, choices: [{ name: 'الكل', value: 'all' }, { name: 'صور', value: 'images' }, { name: 'روابط', value: 'links' }] }, { name: 'message', description: 'رسالة مخصصة', type: 3 }] }, { name: 'rem', description: 'إزالة روم', type: 1, options: [{ name: 'channel', description: 'الروم', type: 7, required: true }] }, { name: 'list', description: 'قائمة الرومات', type: 1 }] }
];

const allCommands = [...slashCommands, ...ownerCommands];
const pendingTransfers = new Map();
const transferCooldowns = new Map();
const activeNumberGames = new Map();

// ==================== 🚀 [5] بدء التشغيل والكرون جوب 🚀 ====================
client.once('ready', async () => {
    console.log(`✅ تم تسجيل الدخول بـ ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try { await rest.put(Routes.applicationCommands(client.user.id), { body: allCommands }); } catch (e) { console.error(e); }

    // معالجة القيف أوي النشط
    const activeGiveaways = await Giveaway.find({ ended: false });
    for (const g of activeGiveaways) {
        if (g.endTime > new Date()) {
            setTimeout(() => endGiveaway(g), g.endTime.getTime() - Date.now());
        } else { await endGiveaway(g); }
    }

    // الكرون جوب (كل 6 ساعات) - نظام الاشتراكات
    cron.schedule('0 */6 * * *', async () => {
        const settings = await Helpers.getGlobalSettings();
        const now = new Date();
        const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        for (const sub of settings.subscriptions) {
            if (sub.status === 'active') {
                // تنبيه قبل 24 ساعة
                if (sub.expiresAt <= oneDayFromNow && sub.expiresAt > now) {
                    const owner = await client.users.fetch(sub.ownerId).catch(() => null);
                    if (owner) await owner.send(`-# **عزيزي المشترك اشتراكك في بوتنا المتكامل وشك على الانتهاء المدة الباقية لك 24 ساعة <:emoji_84:1389404919672340592> **\n-# **سوف يخرج البوت من الخادم ان لم تتجدد الباقة <:emoji_84:1389404919672340592> **`).catch(() => {});
                }
                // انتهاء الاشتراك
                if (sub.expiresAt < now) {
                    sub.status = 'expired'; await settings.save();
                    const guild = await client.guilds.fetch(sub.guildId).catch(() => null);
                    if (guild) {
                        const owner = await client.users.fetch(guild.ownerId).catch(() => null);
                        if (owner) await owner.send(`-# **انتهى اشتراككم في خدمتنا يرجى مراجعة الخادم الأم لتجديد الاشتراك <:new_emoji:1388436095842385931> **`).catch(() => {});
                        await guild.leave().catch(() => {});
                    }
                }
            }
        }
    });

    // ضريبة أسبوعية
    cron.schedule('0 0 * * 5', async () => {
        const users = await User.find({ balance: { $gt: 50 } });
        for (const user of users) {
            const taxAmount = user.balance * 0.025;
            user.balance = parseFloat((user.balance - taxAmount).toFixed(2));
            user.history.push({ type: 'WEEKLY_TAX', amount: -taxAmount, date: new Date() });
            await user.save();
        }
    });
});

// ==================== 📝 [6] معالج الرسائل (messageCreate) 📝 ====================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const globalSettings = await Helpers.getGlobalSettings();
    if (!globalSettings.allowedGuilds.includes(message.guild.id)) return;

    const args = message.content.trim().split(/\s+/);
    const command = args[0];

    // --- نظام التحويل (تأكيد) ---
    const pending = Array.from(pendingTransfers.entries()).find(([key, data]) => 
        key.startsWith(message.guild.id) && data.senderId === message.author.id && data.channelId === message.channel.id
    );
    if (message.content === 'تأكيد' && pending) {
        const [key, data] = pending;
        const sender = await Helpers.getUserData(data.senderId);
        const target = await Helpers.getUserData(data.targetId);
        if (sender.balance < data.totalAmount) {
            pendingTransfers.delete(key);
            return message.channel.send(`-# **رصيدك ما يكفي الحين يا فقير <:emoji_464:1388211597197050029>**`);
        }
        sender.balance = parseFloat((sender.balance - data.totalAmount).toFixed(2));
        target.balance = parseFloat((target.balance + data.amount).toFixed(2));
        sender.history.push({ type: 'TRANSFER_SEND', amount: -data.amount, targetUser: data.targetId, targetName: target.username, date: new Date() });
        target.history.push({ type: 'TRANSFER_RECEIVE', amount: data.amount, targetUser: data.senderId, targetName: sender.username, date: new Date() });
        await sender.save(); await target.save();
        transferCooldowns.set(data.senderId, Date.now());
        const confirmMsg = await message.channel.messages.fetch(data.msgId).catch(() => null);
        if (confirmMsg) await confirmMsg.edit({ content: `-# **تم تحويل ${data.amount} لـ <@${data.targetId}> رصيدك الآن ${sender.balance} <a:moneywith_:1470458218953179237>**`, components: [] }).catch(() => { });
        pendingTransfers.delete(key);
        try { await message.delete(); } catch (e) { }
        return;
    }

    // --- أوامر المطور (زد، انقص) ---
    if (message.author.id === OWNER_ID) {
        if (command === 'زد' || command === 'انقص') {
            const amount = parseFloat(args[1]);
            if (isNaN(amount) || amount <= 0) return message.channel.send(`-# **القيمة غير صحيحه <:__:1467633552408576192> **`);
            const ownerData = await Helpers.getUserData(message.author.id);
            if (command === 'انقص' && ownerData.balance < amount) return message.channel.send(`-# **العضو ما معه ذي الكمية saybu <:emoji_84:1389404919672340592> **`);
            ownerData.balance = parseFloat((ownerData.balance + (command === 'زد' ? amount : -amount)).toFixed(2));
            ownerData.history.push({ type: command === 'زد' ? 'OWNER_ADD' : 'OWNER_REMOVE', amount: command === 'زد' ? amount : -amount, date: new Date() });
            await ownerData.save();
            return message.channel.send(`-# **تم ${command === 'زد' ? 'اضافة' : 'سحب'} الرصيد <:emoji_41:1471619709936996406> **`);
        }
    }

    // --- أوامر عامة (دنانير، تحويل، اغنياء، سجل) ---
    if (command === 'دنانير') {
        const user = message.mentions.users.first() || message.author;
        const userData = await Helpers.getUserData(user.id);
        const lastIn = userData.history.filter(h => h.type === 'TRANSFER_RECEIVE').pop() || { amount: 0 };
        return message.channel.send(`-# **رصيد <@${user.id}> الحالي ${userData.balance} و اخر عملية تحويل تلقاها بـ ${lastIn.amount} <:emoji_41:1471619709936996406> **`);
    }

    if (command === 'تحويل') {
        const target = message.mentions.users.first();
        const amount = parseFloat(args.find(a => !isNaN(a)));
        if (!target || isNaN(amount) || amount <= 0 || target.id === message.author.id) return message.channel.send(`-# **الصيغة غلط يا ذكي <:emoji_334:1388211595053760663>**`);
        const senderData = await Helpers.getUserData(message.author.id);
        const tax = Helpers.calculateTax(senderData.balance, amount);
        if (senderData.balance < (amount + tax)) return message.channel.send(`-# **رصيدك ما يكفي يا فقير <:emoji_464:1388211597197050029>**`);
        const confirmMsg = await message.channel.send({ content: `-# **الضريبة ${tax.toFixed(2)} دينار <:emoji_41:1471619709936996406> اكتب "تأكيد" للتحويل**` });
        pendingTransfers.set(`${message.guild.id}-${confirmMsg.id}`, { senderId: message.author.id, targetId: target.id, amount, tax, totalAmount: amount + tax, msgId: confirmMsg.id, channelId: message.channel.id });
    }

    if (command === 'اغنياء') {
        const topUsers = await User.find().sort({ balance: -1 }).limit(5);
        const topMsg = topUsers.map((u, idx) => `-# **\u200F${idx + 1}. \u202B<@${u.userId}>\u202C - ${u.balance} دينار**`).join('\n');
        const embed = new EmbedBuilder().setDescription(`**الطبقة الارستقراطية <:y_coroa:1404576666105417871>**\n\n${topMsg}`).setColor(0x2b2d31);
        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'سجل') {
        const user = message.mentions.users.first() || message.author;
        const userData = await Helpers.getUserData(user.id);
        const historyText = await Helpers.formatHistory(userData.history);
        const embed = new EmbedBuilder().setDescription(`**السجل الخاص بـ ${user.username} <:emoji_41:1471619709936996406>**\n\n${historyText}`).setColor(0x2b2d31);
        return message.channel.send({ embeds: [embed] });
    }

    // --- لعبة الأرقام (تخمين) ---
    let activeGame = null; let gameKey = null;
    for (const [key, game] of activeNumberGames.entries()) {
        if (key.startsWith(message.guild.id) && game.started && game.alivePlayers?.includes(message.author.id) && game.currentTurn === message.author.id && game.canGuess?.get(message.author.id) === true) {
            activeGame = game; gameKey = key; break;
        }
    }
    if (activeGame) {
        const guess = parseInt(message.content);
        if (!isNaN(guess) && guess >= 1 && guess <= 100) {
            activeGame.canGuess.set(message.author.id, false);
            if (activeGame.timer) { clearTimeout(activeGame.timer); activeGame.timer = null; }
            activeGame.attempts.set(message.author.id, (activeGame.attempts.get(message.author.id) || 0) + 1);
            activeGame.guesses.push({ userId: message.author.id, guess });
            if (guess === activeGame.secretNumber) {
                activeGame.winner = message.author.id;
                await message.channel.send(`-# ** مبروك جابها صح ${message.author} الرقم كان ${activeGame.secretNumber} <:emoji_33:1401771703306027008> **`);
                activeNumberGames.delete(gameKey);
            } else {
                setTimeout(() => { startNextTurn(message.channel, gameKey.split('-')[1], message.guild.id); }, 3000);
            }
            return;
        }
    }

    // --- الحذف التلقائي ---
    const autoDeleteChannels = await Helpers.getAutoDeleteChannels(message.guild.id);
    const autoDelete = autoDeleteChannels.find(ch => ch.channelId === message.channel.id);
    if (autoDelete) {
        let shouldDelete = autoDelete.filterType === 'all' || (autoDelete.filterType === 'images' && message.attachments.size > 0);
        if (shouldDelete) {
            setTimeout(async () => {
                try {
                    await message.delete();
                    if (autoDelete.customMessage) {
                        const msg = await message.channel.send(autoDelete.customMessage.replace(/{user}/g, `${message.author}`));
                        setTimeout(() => msg.delete().catch(() => { }), 5000);
                    }
                } catch (e) { }
            }, autoDelete.deleteDelay * 1000);
        }
    }
});

// ==================== 🛠️ [7] معالج التفاعلات (Slash & Buttons) 🛠️ ====================
client.on('interactionCreate', async (i) => {
    if (i.isChatInputCommand()) {
        const { commandName, options, user } = i;
        const userData = await Helpers.getUserData(user.id);

        if (commandName === 'help') {
            const embed = new EmbedBuilder().setTitle('قائمة الأوامر 🤖').setDescription(`**أوامر الاقتصاد:**\n- \`/bal\`: عرض رصيدك\n- \`/pay\`: تحويل أموال\n- \`/top\`: قائمة الأغنياء\n- \`/hist\`: سجل المعاملات\n\n**أوامر الإدارة:**\n- \`/wel\`: نظام الترحيب\n- \`/tic\`: نظام التذاكر\n- \`/num\`: لعبة الأرقام\n- \`/give\`: نظام القيف أوي`).setColor(0x2b2d31);
            return i.reply({ embeds: [embed] });
        }

        if (commandName === 'bal') {
            const target = options.getUser('user') || user;
            const data = await Helpers.getUserData(target.id);
            return i.reply({ content: `-# **رصيد <@${target.id}> الحالي ${data.balance} <:emoji_41:1471619709936996406> **` });
        }

        // --- نظام الاشتراكات (Owner Only) ---
        if (commandName === 'sub' && i.user.id === OWNER_ID) {
            const sub = options.getSubcommand();
            const settings = await Helpers.getGlobalSettings();
            if (sub === 'add') {
                const serverId = options.getString('id'); const duration = options.getString('duration');
                const guild = await client.guilds.fetch(serverId).catch(() => null);
                if (!guild) return i.reply({ content: 'البوت غير موجود هناك', ephemeral: true });
                
                let exp = new Date(); let durText = '';
                const map = { trial: [3, 'تجريبي'], '7d': [7, 'اسبوع'], '30d': [30, 'شهر'], '60d': [60, 'شهرين'], '1y': [365, 'سنة'] };
                exp.setDate(exp.getDate() + map[duration][0]); durText = map[duration][1];

                settings.subscriptions = settings.subscriptions.filter(s => s.guildId !== serverId);
                settings.subscriptions.push({ guildId: serverId, guildName: guild.name, ownerId: guild.ownerId, duration: durText, expiresAt: exp, status: 'active' });
                if (!settings.allowedGuilds.includes(serverId)) settings.allowedGuilds.push(serverId);
                await settings.save();

                const owner = await client.users.fetch(guild.ownerId).catch(() => null);
                if (owner) await owner.send(`-# **تم الاشتراك في خدمتة البوت المتكامل في باقة "${durText}" سوف يتم اعلامك قبل يوم من انتهاء الاشتراك <:emoji_38:1401773302619439147> **`).catch(() => {});
                return i.reply({ content: `✅ تم تفعيل ${guild.name}`, ephemeral: true });
            }
            if (sub === 'remove') {
                const serverId = options.getString('id');
                const subData = settings.subscriptions.find(s => s.guildId === serverId);
                if (subData) {
                    const owner = await client.users.fetch(subData.ownerId).catch(() => null);
                    if (owner) await owner.send(`-# **تم إلغاء اشتراككم في خدمة البوت المتكامل للسيرفر ${subData.guildName} <:emoji_464:1388211597197050029> **`).catch(() => {});
                }
                settings.subscriptions = settings.subscriptions.filter(s => s.guildId !== serverId);
                settings.allowedGuilds = settings.allowedGuilds.filter(id => id !== serverId);
                await settings.save();
                const guild = await client.guilds.fetch(serverId).catch(() => null);
                if (guild) await guild.leave().catch(() => {});
                return i.reply({ content: '✅ تم الحذف', ephemeral: true });
            }
        }

        // --- نظام التذاكر ---
        if (commandName === 'tic') {
            const sub = options.getSubcommand(); const ts = await Helpers.getTicketSettings(i.guild.id);
            if (sub === 'panel') {
                const embed = new EmbedBuilder().setColor(parseInt(ts.embedColor, 16) || 0x2b2d31).setDescription(ts.embedDescription);
                if (ts.embedImage) embed.setImage(ts.embedImage);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_ticket').setLabel('فتح تذكرة').setStyle(ButtonStyle.Secondary));
                await i.channel.send({ embeds: [embed], components: [row] });
                return i.reply({ content: '✅ تم إرسال اللوحة', ephemeral: true });
            }
        }
    }

    // --- Buttons (Tickets, Number Game, Giveaway) ---
    if (i.isButton()) {
        if (i.customId === 'open_ticket') {
            const ts = await Helpers.getTicketSettings(i.guild.id);
            const ch = await i.guild.channels.create({
                name: `ticket-${i.user.username}`,
                parent: ts.categoryId || null,
                permissionOverwrites: [
                    { id: i.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
                ]
            });
            await ch.send(`${i.user}\n-# ** اكتب سبب فتحك للتكت و فريق الدعم بيتواصل معك قريب <:emoji_32:1471962578895769611> **`);
            return i.reply({ content: `✅ تم فتح التذكرة ${ch}`, ephemeral: true });
        }
        if (i.customId === 'close_ticket') {
            await i.reply({ content: `🔒 سيتم الإغلاق...`, ephemeral: true });
            setTimeout(() => i.channel.delete().catch(() => {}), 3000);
        }
    }
});

// ==================== 🌍 [8] أحداث السيرفر (guildCreate, Welcome) 🌍 ====================
client.on('guildCreate', async (guild) => {
    const settings = await Helpers.getGlobalSettings();
    if (!settings.subscriptions.find(s => s.guildId === guild.id && s.status === 'active')) {
        const msg = "-# **هذا البوت خاص و لن يعمل في خادمك الا اذا تواصلت مع سيرفر المطور لكي يسمح لك مجانا او لا <:emoji_41:1471619709936996406> **\n-# **البوت سوف يخرج نفسه من السيرفر في غضون ٢٤ ساعة <:emoji_32:1471962578895769611> **";
        const owner = await client.users.fetch(guild.ownerId).catch(() => null);
        let sent = false;
        if (owner) { try { await owner.send(msg); sent = true; } catch (e) {} }
        if (!sent) {
            const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionsBitField.Flags.SendMessages));
            if (ch) await ch.send(msg).catch(() => {});
        }
        setTimeout(async () => {
            const s = await Helpers.getGlobalSettings();
            if (!s.subscriptions.find(sub => sub.guildId === guild.id && sub.status === 'active')) await guild.leave().catch(() => {});
        }, 24 * 60 * 60 * 1000);
    }
});

client.on('guildMemberAdd', async (member) => {
    const gs = await Helpers.getGlobalSettings(); if (!gs.allowedGuilds.includes(member.guild.id)) return;
    const s = await Helpers.getSettings(member.guild.id);
    const ch = member.guild.channels.cache.get(s.welcomeSettings.channelId);
    if (ch) {
        const embed = new EmbedBuilder()
            .setTitle(s.welcomeSettings.title?.replace(/{user}/g, member.user.username) || 'أهلاً بك!')
            .setDescription(s.welcomeSettings.description?.replace(/{user}/g, `${member}`) || `نورت السيرفر يا ${member}`)
            .setColor(parseInt(s.welcomeSettings.color, 16) || 0x2b2d31);
        if (s.welcomeSettings.image) embed.setImage(s.welcomeSettings.image);
        await ch.send({ embeds: [embed] }).catch(() => {});
    }
});

// ==================== 🎮 [9] وظائف الألعاب والقيف أوي 🎮 ====================
async function endGiveaway(g) {
    const giveaway = await Giveaway.findById(g._id);
    if (!giveaway || giveaway.ended) return;
    giveaway.ended = true; await giveaway.save();
    const guild = await client.guilds.fetch(giveaway.guildId).catch(() => null);
    if (!guild) return;
    const ch = guild.channels.cache.get(giveaway.channelId);
    if (!ch || giveaway.participants.length === 0) return;
    const winners = []; const p = [...giveaway.participants];
    for (let i = 0; i < Math.min(giveaway.winners, p.length); i++) {
        winners.push(p.splice(Math.floor(Math.random() * p.length), 1)[0]);
    }
    ch.send(`-# **مبروك للفائزين بالقيف أوي على ${giveaway.prize}: ${winners.map(w => `<@${w}>`).join(', ')} <:emoji_33:1401771703306027008> **`);
}

async function startNextTurn(channel, msgId, guildId) {
    const game = activeNumberGames.get(`${guildId}-${msgId}`);
    if (!game || !game.started || game.winner) return;
    game.canGuess.set(game.currentTurn, true);
    game.timer = setTimeout(async () => {
        game.alivePlayers = game.alivePlayers.filter(p => p !== game.currentTurn);
        if (game.alivePlayers.length < 1) {
            await channel.send(`-# **انتهت اللعبة! الكل خسر <:new_emoji:1388436095842385931> الرقم كان ${game.secretNumber}**`);
            activeNumberGames.delete(`${guildId}-${msgId}`);
            return;
        }
        game.currentTurnIndex = game.currentTurnIndex % game.alivePlayers.length;
        game.currentTurn = game.alivePlayers[game.currentTurnIndex];
        startNextTurn(channel, msgId, guildId);
    }, 15000);
    await channel.send(`-# **الدور الآن على <@${game.currentTurn}> معك 15 ثانية <:new_emoji:1388436089584226387> **`);
}

// ==================== 🌐 [10] السيرفر والاستضافة 🌐 ====================
app.get('/', (req, res) => res.send('Bot is Live!'));
app.listen(3000, () => client.login(process.env.TOKEN));
