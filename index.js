const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField } = require('discord.js');
const { REST, Routes } = require('discord.js');
const express = require('express');
const app = express();

// ==================== 📁 نظام التخزين 📁 ====================
const fs = require('fs');
const path = require('path');

// ⭐⭐ استخدام /data في Railway للتخزين الدائم
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;

// ملفات البيانات
const ECONOMY_DATA_FILE = path.join(DATA_DIR, 'economy_data.json');
const BOT_SETTINGS_FILE = path.join(DATA_DIR, 'bot_settings.json');

// تحميل البيانات الاقتصادية
function loadEconomyData() {
    if (fs.existsSync(ECONOMY_DATA_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(ECONOMY_DATA_FILE, 'utf8'));
            // تحويل القديم للجديد إذا لزم
            if (data.sabobas && !data.collectives) {
                data.collectives = data.sabobas;
                delete data.sabobas;
            }
            if (!data.zakatFund) data.zakatFund = { balance: 0 };
            if (!data.taxFund) data.taxFund = { balance: 0 };
            return data;
        } catch (error) {
            console.error('❌ خطأ في تحميل البيانات الاقتصادية:', error);
            return { users: {}, zakatFund: { balance: 0 }, taxFund: { balance: 0 } };
        }
    }
    return { users: {}, zakatFund: { balance: 0 }, taxFund: { balance: 0 } };
}

// تحميل إعدادات البوت
function loadBotSettings() {
    if (fs.existsSync(BOT_SETTINGS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(BOT_SETTINGS_FILE, 'utf8'));
        } catch (error) {
            console.error('❌ خطأ في تحميل إعدادات البوت:', error);
            return { welcome: {}, tickets: {} };
        }
    }
    return { welcome: {}, tickets: {} };
}

// حفظ البيانات الاقتصادية مع Backup
function saveEconomyData(data) {
    try {
        fs.writeFileSync(ECONOMY_DATA_FILE, JSON.stringify(data, null, 2));
        
        // نسخ احتياطي في /tmp
        if (fs.existsSync('/tmp')) {
            const backupFile = `/tmp/economy_backup_${Date.now()}.json`;
            fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
        }
        
        console.log('✅ تم حفظ البيانات وعمل Backup');
    } catch (error) {
        console.error('❌ خطأ في حفظ البيانات الاقتصادية:', error);
    }
}

// حفظ إعدادات البوت
function saveBotSettings(settings) {
    try {
        fs.writeFileSync(BOT_SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (error) {
        console.error('❌ خطأ في حفظ إعدادات البوت:', error);
    }
}

// ⭐⭐ وظيفة النسخ الاحتياطي المتعدد
function backupData() {
    try {
        // نسخ احتياطي في /tmp
        if (fs.existsSync('/tmp')) {
            const backupFile = `/tmp/economy_backup_${Date.now()}.json`;
            fs.writeFileSync(backupFile, JSON.stringify(economyData, null, 2));
        }
        
        // نسخ احتياطي ثانوي
        const secondaryBackup = path.join(__dirname, `backup_${Date.now()}.json`);
        fs.writeFileSync(secondaryBackup, JSON.stringify(economyData, null, 2));
        
        // حذف النسخ القديمة (أكثر من 7 أيام)
        if (fs.existsSync('/tmp')) {
            fs.readdirSync('/tmp').forEach(file => {
                if (file.startsWith('economy_backup_')) {
                    const filePath = path.join('/tmp', file);
                    try {
                        const stats = fs.statSync(filePath);
                        const age = Date.now() - stats.mtimeMs;
                        if (age > 7 * 24 * 60 * 60 * 1000) {
                            fs.unlinkSync(filePath);
                        }
                    } catch (e) {
                        // تجاهل الأخطاء في حذف الملفات
                    }
                }
            });
        }
    } catch (error) {
        console.error('❌ خطأ في النسخ الاحتياطي:', error);
    }
}

// تحميل البيانات
let economyData = loadEconomyData();
let botSettings = loadBotSettings();

// ⭐⭐ تحديث البيانات في الذاكرة كل 10 ثواني
setInterval(() => {
    economyData = loadEconomyData();
    botSettings = loadBotSettings();
}, 10000);

// ⭐⭐ النسخ الاحتياطي كل ساعة
setInterval(backupData, 60 * 60 * 1000);

// حفظ تلقائي كل 30 ثانية
const autoSaveInterval = setInterval(() => {
    saveEconomyData(economyData);
    saveBotSettings(botSettings);
}, 30000);
// ==================== 📁 📁 📁 📁 📁 📁 📁 ====================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

// إعدادات الترحيب (من ملف)
const welcomeSettings = botSettings.welcome || {
    channelId: null,
    title: '',
    description: '',
    color: '2b2d31',
    image: null
};

// إعدادات التذاكر (من ملف)
const panelAdminRoles = botSettings.tickets?.panelAdmins || {};

// التذاكر النشطة (في الذاكرة فقط)
const activeTickets = new Map();

// ==================== 💰 نظام الاقتصاد 💰 ====================
class EconomySystem {
    getBalance(userId) {
        economyData = loadEconomyData();
        
        if (!economyData.users[userId]) {
            economyData.users[userId] = { 
                balance: 50, 
                history: [{
                    type: 'هدية ترحيب',
                    amount: 50,
                    date: new Date().toLocaleString('ar-SA'),
                    balance: 50
                }],
                joinedAt: Date.now()
            };
            saveEconomyData(economyData);
        }
        return economyData.users[userId].balance;
    }
    
    addBalance(userId, amount, reason = '') {
        economyData = loadEconomyData();
        const user = economyData.users[userId] || this.getBalance(userId);
        user.balance += amount;
        user.history.push({
            type: 'إضافة',
            amount: amount,
            reason: reason,
            date: new Date().toLocaleString('ar-SA'),
            balance: user.balance
        });
        economyData.users[userId] = user;
        saveEconomyData(economyData);
        return user.balance;
    }
    
    calculateTransferTax(amount) {
        if (amount > 10000) return 0.10;
        if (amount > 5000) return 0.05;
        if (amount > 1000) return 0.025;
        return 0.01;
    }
    
    collectWeeklyZakat() {
        console.log('⏳ جاري جمع الزكاة الأسبوعية...');
        economyData = loadEconomyData();
        
        let totalZakat = 0;
        let affectedUsers = 0;
        
        for (const userId in economyData.users) {
            const user = economyData.users[userId];
            const zakat = Math.floor(user.balance * 0.025);
            
            if (zakat > 0) {
                user.balance -= zakat;
                totalZakat += zakat;
                affectedUsers++;
                
                user.history.push({
                    type: 'زكاة أسبوعية',
                    amount: -zakat,
                    date: new Date().toLocaleString('ar-SA'),
                    balance: user.balance
                });
            }
        }
        
        economyData.zakatFund.balance += totalZakat;
        saveEconomyData(economyData);
        
        console.log(`✅ تم جمع ${totalZakat} دينار زكاة من ${affectedUsers} مستخدم`);
    }
    
    collectWealthTax() {
        console.log('⏳ جاري جمع ضريبة الثروة...');
        economyData = loadEconomyData();
        
        let totalTax = 0;
        let affectedUsers = 0;
        
        for (const userId in economyData.users) {
            const user = economyData.users[userId];
            if (user.balance > 10000) {
                const excess = user.balance - 10000;
                const tax = Math.floor(excess * 0.01);
                
                if (tax > 0) {
                    user.balance -= tax;
                    totalTax += tax;
                    affectedUsers++;
                    
                    user.history.push({
                        type: 'ضريبة ثروة',
                        amount: -tax,
                        date: new Date().toLocaleString('ar-SA'),
                        balance: user.balance
                    });
                }
            }
        }
        
        economyData.taxFund.balance += totalTax;
        saveEconomyData(economyData);
        
        console.log(`✅ تم جمع ${totalTax} دينار ضريبة ثروة من ${affectedUsers} مستخدم`);
    }
    
    transferBalance(senderId, receiverId, amount) {
        economyData = loadEconomyData();
        
        if (this.getBalance(senderId) < amount) {
            throw new Error('رصيدك غير كافي');
        }
        
        const taxRate = this.calculateTransferTax(amount);
        let tax = Math.floor(amount * taxRate);
        
        if (tax === 0 && amount > 0) {
            tax = 1;
        }
        
        const netAmount = amount - tax;
        
        const sender = economyData.users[senderId];
        sender.balance -= amount;
        sender.history.push({
            type: 'تحويل',
            amount: -amount,
            to: receiverId,
            tax: tax,
            netAmount: netAmount,
            date: new Date().toLocaleString('ar-SA'),
            balance: sender.balance
        });
        
        let receiver = economyData.users[receiverId];
        if (!receiver) {
            receiver = { balance: 50, history: [], joinedAt: Date.now() };
        }
        receiver.balance += netAmount;
        receiver.history.push({
            type: 'استلام',
            amount: netAmount,
            from: senderId,
            date: new Date().toLocaleString('ar-SA'),
            balance: receiver.balance
        });
        
        economyData.users[senderId] = sender;
        economyData.users[receiverId] = receiver;
        
        economyData.taxFund.balance += tax;
        
        saveEconomyData(economyData);
        
        return {
            from: sender.balance,
            to: receiver.balance,
            tax: tax,
            taxRate: Math.floor(taxRate * 100)
        };
    }
    
    getHistory(userId, limit = 10) {
        economyData = loadEconomyData();
        const user = economyData.users[userId];
        if (!user || !user.history) return [];
        return user.history.slice(-limit).reverse();
    }
    
    topUsers(limit = 10) {
        economyData = loadEconomyData();
        const users = Object.entries(economyData.users)
            .map(([id, data]) => ({ id, balance: data.balance }))
            .sort((a, b) => b.balance - a.balance)
            .slice(0, limit);
        return users;
    }
}

const economy = new EconomySystem();

// نظام جدولة ذكي مع منع التكرار
let zakatInterval = null;
let wealthTaxInterval = null;

function scheduleTaxes() {
    if (zakatInterval) clearInterval(zakatInterval);
    if (wealthTaxInterval) clearInterval(wealthTaxInterval);
    
    zakatInterval = setInterval(() => {
        console.log('💰 وقت جمع الزكاة الأسبوعية!');
        economy.collectWeeklyZakat();
    }, 7 * 24 * 60 * 60 * 1000);
    
    wealthTaxInterval = setInterval(() => {
        console.log('🏛️ وقت جمع ضريبة الثروة!');
        economy.collectWealthTax();
    }, 30 * 24 * 60 * 60 * 1000);
    
    console.log('📅 تم جدولة الزكاة والضرائب بنجاح');
}

// ⭐⭐ فحص دوري للتذاكر المفتوحة
setInterval(() => {
    activeTickets.forEach(async (channelId, userId) => {
        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                activeTickets.delete(userId);
                console.log(`🧹 تم تنظيف تذكرة غير موجودة للمستخدم: ${userId}`);
            }
        } catch (error) {
            // تجاهل الأخطاء
        }
    });
}, 5 * 60 * 1000); // كل 5 دقائق

// ==================== 📋 الأوامر 📋 ====================
const commands = [
    {
        name: 'welcome',
        description: 'نظام الترحيب',
        options: [
            {
                type: 1,
                name: 'set',
                description: 'تعيين روم الترحيب',
                options: [{ name: 'channel', description: 'روم الترحيب', type: 7, required: true }]
            },
            {
                type: 1,
                name: 'edit',
                description: 'تعديل رسالة الترحيب',
                options: [
                    { name: 'title', description: 'العنوان', type: 3, required: false },
                    { name: 'description', description: 'الوصف', type: 3, required: false },
                    { name: 'color', description: 'اللون (#2b2d31)', type: 3, required: false },
                    { name: 'image', description: 'رابط صورة خلفية', type: 3, required: false }
                ]
            },
            {
                type: 1,
                name: 'test',
                description: 'تجربة رسالة الترحيب',
                options: [{ name: 'user', description: 'عضو للتجربة', type: 6, required: false }]
            },
            {
                type: 1,
                name: 'info',
                description: 'عرض إعدادات الترحيب'
            }
        ]
    },
    {
        name: 'ticket',
        description: 'نظام التذاكر',
        options: [
            {
                type: 1,
                name: 'panel',
                description: 'عرض لوحة التذاكر',
                options: [
                    { name: 'admin1', description: 'رتبة الإدارة الأولى', type: 8, required: false },
                    { name: 'admin2', description: 'رتبة الإدارة الثانية', type: 8, required: false },
                    { name: 'admin3', description: 'رتبة الإدارة الثالثة', type: 8, required: false }
                ]
            },
            {
                type: 1,
                name: 'edit',
                description: 'تعديل لوحة التذاكر',
                options: [
                    { name: 'title', description: 'عنوان جديد', type: 3, required: false },
                    { name: 'description', description: 'وصف جديد', type: 3, required: false },
                    { name: 'color', description: 'لون جديد', type: 3, required: false }
                ]
            }
        ]
    },
    {
        name: 'eco-balance',
        description: 'عرض رصيدك من الدينار'
    },
    {
        name: 'eco-transfer',
        description: 'تحويل دينار لعضو آخر',
        options: [
            { name: 'user', description: 'الشخص اللي تبي تحول له', type: 6, required: true },
            { name: 'amount', description: 'كمية الدينار', type: 4, required: true, min_value: 1 }
        ]
    },
    {
        name: 'eco-history',
        description: 'عرض سجل معاملاتك'
    },
    {
        name: 'eco-top',
        description: 'أعلى الأعضاء رصيداً'
    },
    {
        name: 'help',
        description: 'عرض جميع الأوامر'
    },
    {
        name: 'backup-data',
        description: 'تصدير نسخة احتياطية من البيانات (للمشرفين فقط)'
    }
];

// ==================== 🎉 حدث إضافة البوت للسيرفر 🎉 ====================
client.on('guildCreate', async guild => {
    console.log(`🎉 ${guild.name} (${guild.id}) أضاف البوت!`);
    
    try {
        const owner = await guild.fetchOwner();
        
        const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setDescription(`-# **البوت بوت إدارة تقريباً شامل ولاكنه لا يغنيك عن بعض البوتات الأخرى مع انه سيفي بالغرض نتمنى من ادارتكم ان تستعمل عملة البوت "الدينار" في الفعاليات و غيرها لتدعمنا و تنتشر عملتنا <:5_69:1467295817001074954> **`);
        
        try {
            await owner.send({ embeds: [embed] });
            console.log(`📩 أرسلت رسالة خاصة لمالك السيرفر`);
        } catch (dmError) {
            console.log('❌ ما قدرت أرسل للونر في الخاص');
        }
        
    } catch (error) {
        console.error('❌ خطأ في معالجة إضافة السيرفر:', error);
    }
});

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} جاهز!`);
    
    scheduleTaxes();
    
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log(`✅ تم تسجيل ${commands.length} أوامر`);
    } catch (error) {
        console.error('❌ خطأ في تسجيل الأوامر:', error);
    }
});

// ==================== 👋 الترحيب (كما كان) ====================
client.on('guildMemberAdd', async (member) => {
    console.log(`👤 عضو جديد: ${member.user.tag} في ${member.guild.name}`);
    
    if (!welcomeSettings.channelId) {
        console.log(`❌ الترحيب معطل: قناة غير معينة`);
        return;
    }
    
    try {
        const channel = member.guild.channels.cache.get(welcomeSettings.channelId);
        if (!channel) {
            console.log(`❌ القناة ${welcomeSettings.channelId} غير موجودة`);
            return;
        }

        console.log(`✅ وجدت قناة الترحيب: ${channel.name}`);

        let title = welcomeSettings.title
            .replace(/{user}/g, member.user.username)
            .replace(/{server}/g, member.guild.name)
            .replace(/{mention}/g, `<@${member.user.id}>`);
        
        let description = welcomeSettings.description
            .replace(/{user}/g, member.user.username)
            .replace(/{server}/g, member.guild.name)
            .replace(/{count}/g, member.guild.memberCount)
            .replace(/{mention}/g, `<@${member.user.id}>`);

        const welcomeEmbed = new EmbedBuilder()
            .setColor(parseInt(welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31);

        if (title.trim()) welcomeEmbed.setTitle(title);
        if (description.trim()) welcomeEmbed.setDescription(description);
        
        if (welcomeSettings.image && welcomeSettings.image.startsWith('http')) {
            welcomeEmbed.setImage(welcomeSettings.image);
        }

        await channel.send({ 
            content: '',
            embeds: [welcomeEmbed] 
        });
        
        console.log(`✅ تم ترحيب ${member.user.tag} في ${channel.name}`);
        
    } catch (error) {
        console.error('❌ خطأ في الترحيب:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;
    
    if (interaction.isButton() && interaction.customId === 'open_ticket') {
        if (activeTickets.has(interaction.user.id)) {
            return interaction.reply({ content: 'لديك تذكرة مفتوحة.', ephemeral: true });
        }

        const adminRoles = panelAdminRoles[interaction.message.id] || [];
        
        const ticketChannel = await interaction.guild.channels.create({
            name: `تذكرة-${interaction.user.username}`,
            type: ChannelType.GuildText,
            parent: interaction.channel.parentId,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
                ...adminRoles.map(roleId => ({ id: roleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
            ],
        });

        activeTickets.set(interaction.user.id, ticketChannel.id);

        const mentions = `${interaction.user}${adminRoles.length > 0 ? `\n${adminRoles.map(id => `<@&${id}>`).join(' ')}` : ''}`;
        
        await ticketChannel.send({ 
            content: mentions, 
            embeds: [new EmbedBuilder()
                .setTitle(`تذكرة دعم - ${interaction.user.username}`)
                .setDescription('-# اكتب طلب او مشكلتك بشكل واضح شوي و ان شاء الله بنرد عليك في اقرب وقت')
                .setColor(0x2b2d31)
                .setTimestamp()], 
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق التذكرة').setStyle(ButtonStyle.Danger)
            )] 
        });

        return interaction.reply({ content: `تم إنشاء تذكرتك: ${ticketChannel}`, ephemeral: true });
    }

    if (interaction.isButton() && interaction.customId === 'close_ticket') {
        if (!interaction.channel.name.startsWith('تذكرة-')) {
            return interaction.reply({ content: 'هذا الزر يعمل فقط في قنوات التذاكر.', ephemeral: true });
        }

        for (const [userId, channelId] of activeTickets.entries()) {
            if (channelId === interaction.channel.id) {
                activeTickets.delete(userId);
                break;
            }
        }

        await interaction.reply({ content: 'سيتم إغلاق التذكرة خلال 5 ثواني.' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    if (!interaction.isChatInputCommand()) return;

    const commandName = interaction.commandName;
    const subcommand = interaction.options.getSubcommand(false);

    if (commandName === 'welcome') {
        if (subcommand === 'set') {
            const channel = interaction.options.getChannel('channel');
            welcomeSettings.channelId = channel.id;
            
            botSettings.welcome = welcomeSettings;
            saveBotSettings(botSettings);
            
            console.log(`✅ تم تعيين قناة الترحيب: ${channel.id} (${channel.name})`);
            await interaction.reply({ content: `✅ تم تعيين روم الترحيب: ${channel}`, ephemeral: false });
        }
        
        else if (subcommand === 'edit') {
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const color = interaction.options.getString('color');
            const image = interaction.options.getString('image');

            if (title !== null) welcomeSettings.title = title;
            if (description !== null) welcomeSettings.description = description;
            if (color) welcomeSettings.color = color.startsWith('#') ? color.replace('#', '') : color;
            if (image !== null) welcomeSettings.image = image;

            botSettings.welcome = welcomeSettings;
            saveBotSettings(botSettings);

            console.log(`✅ تم تحديث إعدادات الترحيب`);
            await interaction.reply({ content: `✅ تم تحديث إعدادات الترحيب!`, ephemeral: true });
        }
        
        else if (subcommand === 'test') {
            if (!welcomeSettings.channelId) {
                return interaction.reply({ 
                    content: '❌ لم يتم تعيين روم الترحيب بعد.\nاستخدم `/welcome set` أولاً.',
                    ephemeral: true 
                });
            }

            const user = interaction.options.getUser('user') || interaction.user;
            const channel = interaction.guild.channels.cache.get(welcomeSettings.channelId);
            
            if (!channel) {
                return interaction.reply({ 
                    content: '❌ روم الترحيب غير موجود.',
                    ephemeral: true 
                });
            }

            let title = welcomeSettings.title
                .replace(/{user}/g, user.username)
                .replace(/{server}/g, interaction.guild.name)
                .replace(/{mention}/g, `<@${user.id}>`);
            
            let description = welcomeSettings.description
                .replace(/{user}/g, user.username)
                .replace(/{server}/g, interaction.guild.name)
                .replace(/{count}/g, interaction.guild.memberCount)
                .replace(/{mention}/g, `<@${user.id}>`);

            const testEmbed = new EmbedBuilder()
                .setColor(parseInt(welcomeSettings.color.replace('#', ''), 16) || 0x2b2d31);

            if (title.trim()) testEmbed.setTitle(title);
            if (description.trim()) testEmbed.setDescription(description);
            if (welcomeSettings.image && welcomeSettings.image.startsWith('http')) {
                testEmbed.setImage(welcomeSettings.image);
            }

            await channel.send({ content: '', embeds: [testEmbed] });
            console.log(`✅ تم إرسال ترحيب تجريبي لـ ${user.tag}`);
            await interaction.reply({ content: `✅ تم إرسال رسالة ترحيب تجريبية.`, ephemeral: true });
        }
        
        else if (subcommand === 'info') {
            const channel = welcomeSettings.channelId ? 
                interaction.guild.channels.cache.get(welcomeSettings.channelId) : null;
            
            const infoEmbed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setDescription(`-# **إعدادات الترحيب**\n\n-# 📌 الروم: ${channel ? channel.toString() : '❌ غير معين'}\n-# 🎨 اللون: #${welcomeSettings.color}\n-# 🖼️ صورة: ${welcomeSettings.image ? '✅ معين' : '❌ غير معين'}`);

            await interaction.reply({ embeds: [infoEmbed], ephemeral: true });
        }
    }

    else if (commandName === 'ticket') {
        if (subcommand === 'panel') {
            const adminRoles = [
                interaction.options.getRole('admin1'),
                interaction.options.getRole('admin2'),
                interaction.options.getRole('admin3')
            ].filter(r => r).map(r => r.id);

            const embed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setDescription('-# **🎫 نظام التذاكر**\n\n-# اضغط على الزر لفتح تذكرة دعم.\n-# سيتم إنشاء قناة خاصة بك.');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('فتح تذكرة')
                    .setStyle(ButtonStyle.Secondary)
            );

            const reply = await interaction.reply({ 
                embeds: [embed], 
                components: [row], 
                fetchReply: true 
            });

            if (adminRoles.length > 0) {
                panelAdminRoles[reply.id] = adminRoles;
                botSettings.tickets = botSettings.tickets || {};
                botSettings.tickets.panelAdmins = panelAdminRoles;
                saveBotSettings(botSettings);
                
                await interaction.followUp({ 
                    content: `✅ تم إضافة رتب الإدارة.`,
                    ephemeral: true 
                });
            }
        }
        
        else if (subcommand === 'edit') {
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const color = interaction.options.getString('color');

            const embedColor = color ? parseInt(color.replace('#',''),16) : 0x2b2d31;

            const embed = new EmbedBuilder()
                .setTitle(title || '🎫 نظام التذاكر')
                .setColor(embedColor)
                .setDescription(`-# ${description || 'اضغط على الزر لفتح تذكرة دعم.'}\n-# سيتم إنشاء قناة خاصة بك.`);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('فتح تذكرة')
                    .setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({ 
                embeds: [embed], 
                components: [row] 
            });
        }
    }

    else if (commandName === 'eco-balance') {
        const balance = economy.getBalance(interaction.user.id);
        const history = economy.getHistory(interaction.user.id, 1);
        const lastTransfer = history.length > 0 ? `${history[0].type}: ${history[0].amount} دينار` : 'لا توجد';
        
        const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setDescription(`-# **رصيدك الحالي ${balance} اخر عملية تحويل لك ${lastTransfer} <:money_with_wings:1388212679981666334> **`);
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (commandName === 'eco-transfer') {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        
        try {
            const result = economy.transferBalance(interaction.user.id, targetUser.id, amount);
            
            const embed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setDescription(`-# **تم التحويل ${amount} دينار  لـ ${targetUser} رصيدك الحالي ${result.from} <:money_with_wings:1388212679981666334> **\n\n-# الضريبة ${result.tax}`);
            
            await interaction.reply({ embeds: [embed] });
        } catch (error) {
            await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
        }
    }

    else if (commandName === 'eco-history') {
        const history = economy.getHistory(interaction.user.id, 10);
        
        const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setDescription(`-# **سجل معاملاتك**\n\n${history.length === 0 ? '-# لا توجد معاملات سابقة' : history.map(record => `-# **${record.type}**: ${record.amount > 0 ? '+' : ''}${record.amount} دينار\n-# *${record.date}*`).join('\n\n')}`);
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (commandName === 'eco-top') {
        const top = economy.topUsers(10);
        
        const embed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setDescription(`-# **أعلى الأعضاء رصيداً**\n\n${top.map((user, index) => `-# ${index + 1}. <@${user.id}> - **${user.balance}** دينار`).join('\n')}`);
        
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'backup-data') {
        // التحقق من الصلاحيات
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: '❌ تحتاج صلاحية Administrator', ephemeral: true });
        }
        
        // إنشاء ملف مؤقت
        const backupData = JSON.stringify(economyData, null, 2);
        const buffer = Buffer.from(backupData, 'utf-8');
        
        // إرسال الملف
        await interaction.reply({
            files: [{
                attachment: buffer,
                name: `economy_backup_${Date.now()}.json`
            }],
            ephemeral: true
        });
        
        console.log(`✅ تم إنشاء نسخة احتياطية بواسطة ${interaction.user.tag}`);
    }

    else if (commandName === 'help') {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x2b2d31)
            .setDescription(`-# **أوامر البوت**\n\n-# **👋 الترحيب**\n-# \`/welcome set\` - تعيين روم الترحيب\n-# \`/welcome edit\` - تعديل رسالة الترحيب\n-# \`/welcome test\` - تجربة الترحيب\n-# \`/welcome info\` - عرض الإعدادات\n\n-# **🎫 التذاكر**\n-# \`/ticket panel\` - عرض لوحة التذاكر\n-# \`/ticket edit\` - تعديل لوحة التذاكر\n\n-# **💰 الاقتصاد**\n-# \`/eco-balance\` - عرض رصيدك\n-# \`/eco-transfer\` - تحويل دينار\n-# \`/eco-history\` - سجل المعاملات\n-# \`/eco-top\` - أعلى الأعضاء\n-# \`/backup-data\` - تصدير نسخة احتياطية (للمشرفين فقط)`);

        await interaction.reply({ 
            embeds: [helpEmbed],
            ephemeral: true 
        });
    }
});

// ==================== ⭐⭐ معالجة الأخطاء ⭐⭐ ====================
process.on('uncaughtException', (error) => {
    console.error('❌ خطأ غير متوقع:', error);
    // حفظ البيانات قبل الخروج
    saveEconomyData(economyData);
    saveBotSettings(botSettings);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ وعد مرفوض:', reason);
});

// ==================== 🚀 سيرفر Express 🚀 ====================
app.get('/', (req, res) => {
    res.json({ 
        status: 'online', 
        users: Object.keys(economyData.users).length,
        zakatFund: economyData.zakatFund.balance || 0,
        taxFund: economyData.taxFund.balance || 0
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy', 
        uptime: process.uptime() 
    });
});

app.get('/stats', (req, res) => {
    const stats = {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        users: Object.keys(economyData.users).length,
        tickets: activeTickets.size,
        timestamp: new Date().toISOString()
    };
    res.json(stats);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ السيرفر شغال على port: ${PORT}`);
    console.log(`📁 مسار البيانات: ${DATA_DIR}`);
    console.log(`💰 النظام الاقتصادي: ${Object.keys(economyData.users).length} مستخدم`);
    console.log(`🏦 صندوق الزكاة: ${economyData.zakatFund.balance || 0} دينار`);
    console.log(`🏛️ صندوق الضرائب: ${economyData.taxFund.balance || 0} دينار`);
    console.log(`⚙️ الإعدادات: ${Object.keys(botSettings).length} قسم`);
    
    client.login(process.env.TOKEN)
        .then(() => console.log('✅ البوت متصل!'))
        .catch(err => {
            console.error('❌ فشل الاتصال:', err);
            process.exit(1);
        });
});