const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionsBitField, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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
  balance: { type: Number, default: 0 },
  history: [{ type: { type: String }, amount: Number, date: { type: Date, default: Date.now } }]
});
const UserModel = mongoose.model('User', UserSchema);

async function getUserData(userId) {
  let user = await UserModel.findOne({ userId });
  if (!user) user = await UserModel.create({ userId });
  return user;
}

// تخزين بيانات اللعبة الحالية
const activeMafiaGames = new Map();

client.once('ready', () => {
  console.log(`🤖 البوت يعمل باسم: ${client.user.tag}`);
});

// ==================== 🛠️ أمر وضع المطور السري 🛠️ ====================
client.on('messageCreate', async message => {
    if (message.author.id !== OWNER_ID) return;

    // أمر خاص لك فقط لبدء اللعبة فوراً مع بوتات
    if (message.content === '!devmafia') {
        if (activeMafiaGames.has(message.channel.id)) return message.reply("توجد لعبة جارية بالفعل!");

        const game = {
            hostId: message.author.id,
            players: [message.author.id, 'bot1', 'bot2', 'bot3'],
            alive: [message.author.id, 'bot1', 'bot2', 'bot3'],
            roles: {},
            votes: new Map(),
            nightAction: { target: null, doctorTarget: null },
            started: true,
            protectedByCloak: null,
            usedAbilities: new Set(),
            devMode: true
        };

        // توزيع الأدوار للمطور (أنت المافيا والباقي عشوائي)
        game.roles[message.author.id] = 'mafia';
        game.roles['bot1'] = 'doctor';
        game.roles['bot2'] = 'police';
        game.roles['bot3'] = 'citizen';

        activeMafiaGames.set(message.channel.id, game); // نربط اللعبة بآيدي الروم

        await message.reply('🚀 **تم تفعيل وضع المطور!** أنت المافيا ومعك 3 بوتات. ستبدأ اللعبة حالاً...');
        
        // إرسال زر كشف الدور ثم بدء الليل
        const revealRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('reveal_role').setLabel('كشف دوري').setStyle(ButtonStyle.Secondary)
        );
        await message.channel.send({ content: '✅ بدأت اللعبة التجريبية! اضغط لمعرفة دورك.', components: [revealRow] });

        setTimeout(() => startNight(message.channel, game), 3000);
    }
});


// ==================== 🎮 أوامر اللعبة والاقتصاد 🎮 ====================
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // سكربت الترحيب وتوزيع العملات
  if (message.channel.id === ECONOMY_CHANNEL_ID) {
    const userData = await getUserData(message.author.id);
    // منطق بسيط للمكافأة اليومية أو التفاعل (حسب كودك السابق)
    // هنا سأتركها بسيطة لعدم التعارض
  }

  // بدء إعداد لعبة المافيا
  if (message.content.startsWith('setup')) {
    if (activeMafiaGames.has(message.channel.id)) return message.reply('فيه لعبة شغالة في هذا الروم!');
    
    const embed = new EmbedBuilder()
      .setTitle('لعبة المافيا 🕵️‍♂️')
      .setDescription('-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: 0**\n\n-# **شرح اللعبة**\n-# اللعبة فيها قاتل و طبيب و شرطي و مواطنين\n-# القاتل يحاول يقتل الكل بدون ما ينكشف\n-# الطبيب يحمي شخص كل ليلة من القتل\n-# الشرطي يكشف هويات الناس بالليل\n-# المواطنين لازم يصوتون على القاتل ويطردونه عشان يفوزون')
      .setColor(0x000000)
      .setImage('https://media.discordapp.net/attachments/1329188038764560467/1334963345475637370/mafia-definitive-edition-tommy-angelo-suit-4k-wallpaper-uhdpaper.com-1411h.jpg?ex=679e7280&is=679d2100&hm=00593450e181d115904d6e903d6d34e6015560942d93540a5a3a41630138383f&=&format=webp&width=960&height=540');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary)
    );

    const msg = await message.channel.send({ embeds: [embed], components: [row] });
    
    activeMafiaGames.set(msg.id, {
      hostId: message.author.id,
      players: [],
      alive: [],
      roles: {},
      votes: new Map(),
      nightAction: { target: null, doctorTarget: null }, // للتخزين المؤقت لأفعال الليل
      started: false,
      protectedByCloak: null, // تتبع من استخدم عباءة التخفي
      usedAbilities: new Set() // تتبع من اشترى قدرات
    });
    
    // ربط اللعبة بآيدي الرسالة وآيدي الروم للسهولة
    activeMafiaGames.set(message.channel.id, activeMafiaGames.get(msg.id));
  }
});

// ==================== 🖱️ التفاعلات (Buttons) 🖱️ ====================
client.on('interactionCreate', async i => {
  // -------------------- 🎫 نظام التذاكر (كما هو) --------------------
  if (i.isButton() && i.customId === 'create_ticket') {
      const modal = new ModalBuilder().setCustomId('ticket_modal').setTitle('فتح تذكرة');
      const input = new TextInputBuilder().setCustomId('ticket_reason').setLabel('سبب التذكرة').setStyle(TextInputStyle.Paragraph);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await i.showModal(modal);
  }
  
  if (i.isModalSubmit() && i.customId === 'ticket_modal') {
      const reason = i.fields.getTextInputValue('ticket_reason');
      const guild = i.guild;
      const channel = await guild.channels.create({
          name: `ticket-${i.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
              { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
              { id: i.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
          ]
      });
      
      const embed = new EmbedBuilder().setTitle('تذكرة جديدة').setDescription(`صاحب التذكرة: <@${i.user.id}>\nالسبب: ${reason}`);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('إغلاق').setStyle(ButtonStyle.Danger));
      
      await channel.send({ content: `<@${i.user.id}>`, embeds: [embed], components: [row] });
      await i.reply({ content: `تم فتح التذكرة: ${channel}`, ephemeral: true });
  }

  if (i.isButton() && i.customId === 'close_ticket') {
      await i.channel.delete();
  }

  // -------------------- 🕵️‍♂️ لعبة المافيا --------------------
  if (i.isButton()) {
    // محاولة جلب اللعبة سواء عن طريق رسالة الانضمام أو الروم
    let game = activeMafiaGames.get(i.message.id) || activeMafiaGames.get(i.channel.id);

    // 1. الانضمام
    if (i.customId === 'join_mafia') {
      if (!game || game.started) return i.reply({ content: 'اللعبة بدأت أو انتهت.', ephemeral: true });
      if (game.players.includes(i.user.id)) return i.reply({ content: 'أنت منضم أصلاً!', ephemeral: true });
      
      game.players.push(i.user.id);
      
      // تحديث الامبد
      const embed = EmbedBuilder.from(i.message.embeds[0]);
      const playersList = game.players.map(p => `\u200F<@${p}>\u202C`).join(', ');
      embed.setDescription(`-# **اضغط على الزر للانضمام! نحتاج 4 لاعبين على الأقل.**\n-# **اللاعبين الحاليين: ${game.players.length}**\n${playersList}\n\n-# **شرح اللعبة**\n-# اللعبة فيها قاتل و طبيب و شرطي و مواطنين\n-# القاتل يحاول يقتل الكل بدون ما ينكشف\n-# الطبيب يحمي شخص كل ليلة من القتل\n-# الشرطي يكشف هويات الناس بالليل\n-# المواطنين لازم يصوتون على القاتل ويطردونه عشان يفوزون`);
      
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_mafia').setLabel('انضمام').setStyle(ButtonStyle.Secondary));
      
      // زر البدء يظهر فقط للمضيف إذا اكتمل العدد
      if (game.players.length >= 4) {
          row.addComponents(new ButtonBuilder().setCustomId('start_mafia').setLabel('بدء اللعبة').setStyle(ButtonStyle.Success));
      }
      
      await i.update({ embeds: [embed], components: [row] }).catch(() => {});
    }

    // 2. بدء اللعبة (عادي)
    if (i.customId === 'start_mafia') {
      if (!game || game.hostId !== i.user.id) return i.reply({ content: 'فقط صاحب الأمر يقدر يبدأ اللعبة!', ephemeral: true });
      
      game.started = true;
      game.alive = [...game.players];
      
      // توزيع الأدوار
      const shuffled = [...game.players].sort(() => Math.random() - 0.5);
      game.roles = {};
      game.roles[shuffled[0]] = 'mafia';
      game.roles[shuffled[1]] = 'doctor';
      game.roles[shuffled[2]] = 'police';
      shuffled.slice(3).forEach(p => game.roles[p] = 'citizen');

      await i.update({ content: '✅ بدأت اللعبة! اضغط على الزر لمعرفة دورك.', embeds: [], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('reveal_role').setLabel('كشف دوري').setStyle(ButtonStyle.Secondary))] }).catch(() => {});
      
      setTimeout(() => startNight(i.channel, game), 5000);
    }

    // 3. كشف الدور
    if (i.customId === 'reveal_role') {
      if (!game) return i.reply({ content: '-# **انت غير مشارك اصلا**', ephemeral: true });
      const role = game.roles[i.user.id];
      if (!role) return i.reply({ content: 'انت لست في هذه اللعبة.', ephemeral: true });

      // **تعديل: إزالة الايموجيات غير المرغوبة (السكين والمزارع)**
      const roleNames = { 
        mafia: 'مافيا <:emoji_38:1470920843398746215>',  // بدون سكين
        doctor: 'طبيب 💉 <:emoji_32:1401771771010613319>', 
        police: 'شرطي 🔍 <:s7_discord:1388214117365453062>', 
        citizen: 'مواطن <:emoji_33:1401771703306027008>' // بدون مزارع
      };
      
      const roleDescs = { 
        mafia: 'تقتل الناس بدون ما يدرون عنك.', 
        doctor: 'تحمي شخص واحد كل جولة من القتل.', 
        police: 'تحاول تكشف مين هو القاتل.', 
        citizen: 'تحاول تعيش وتصوت على الشخص الصح.'
      };

      return i.reply({ content: `-# **بدأت اللعبة لا تقول لأحد مين انت <:emoji_84:1389404919672340592> **\n-# **انت الحين ${roleNames[role]} الي تقدر تسويه ${roleDescs[role]}**`, ephemeral: true });
    }

    // 4. المتجر والشراء
    if (i.customId === 'open_mafia_shop') {
      if (!game || !game.alive.includes(i.user.id)) return i.reply({ content: '-# **انت غير مشارك أو ميت**', ephemeral: true });
      const role = game.roles[i.user.id];
      const row = new ActionRowBuilder();
      
      if (role === 'doctor') row.addComponents(new ButtonBuilder().setCustomId('buy_ability_heal').setLabel('شراء الشفاء (20)').setStyle(ButtonStyle.Success));
      if (role === 'mafia') row.addComponents(new ButtonBuilder().setCustomId('buy_ability_cloak').setLabel('شراء العباءة (10)').setStyle(ButtonStyle.Danger));
      if (role === 'police') row.addComponents(new ButtonBuilder().setCustomId('buy_ability_monitor').setLabel('شراء المراقبة (10)').setStyle(ButtonStyle.Primary));
      
      if (row.components.length === 0) return i.reply({ content: '-# **مافي شي تشتريه لدورك يا طفرة**', ephemeral: true });

      const shopEmbed = new EmbedBuilder()
        .setTitle('متجر القدرات 🛒')
        .setDescription(`-# **قدرة الشفاء 20 دينار**\n-# خاصة بالطبيب ترجع شخص واحد تم اقصائه للحياة\n-# **قدرة العبائة - 10 دينار**\n-# خاصة بالقاتل تنقذك من الكشف و التصويت مره واحدة في اللعبة الواحدة\n-# ** قدرة المراقبة - 10 دينار**\n-# تضع المراقبة على شخص واحد ليتم كشف هوية القاتل عندما يقتل الشخص الذي راقبته فالجولة السابقة`)
        .setColor(0x2b2d31);
      return i.reply({ embeds: [shopEmbed], components: [row], ephemeral: true });
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
        
        if (!game) return i.reply({ content: 'انتهت اللعبة!', ephemeral: true });
        if (game.usedAbilities.has(`${i.user.id}_${ability}`)) return i.reply({ content: 'استخدمت هذه القدرة بالفعل!', ephemeral: true });

        userData.balance -= price;
        userData.history.push({ type: 'BUY_ABILITY', amount: price });
        await userData.save();
        game.usedAbilities.add(`${i.user.id}_${ability}`);
        
        if (ability === 'cloak') game.protectedByCloak = i.user.id;
        
        await i.update({ content: '✅ تم الشراء بنجاح! تم تفعيل القدرة.', components: [], embeds: [] });
    }

    // 5. أفعال الليل (القتل، الحماية، التحقيق)
    if (i.customId.startsWith('mafia_kill_') || i.customId.startsWith('doctor_save_') || i.customId.startsWith('police_check_')) {
      if (!game || !game.alive.includes(i.user.id)) return i.reply({ content: 'أنت لست في اللعبة أو ميت!', ephemeral: true });

      const [action, , targetId] = i.customId.split('_');
      // التعامل مع اسم الهدف (سواء لاعب أو بوت)
      const targetName = targetId.startsWith('bot') ? 'اللاعب الوهمي' : `<@${targetId}>`;

      if (action === 'mafia') {
        game.nightAction.target = targetId;
        await i.reply({ content: `اخترت قتل ${targetName}`, ephemeral: true });
      } else if (action === 'doctor') {
        game.nightAction.doctorTarget = targetId;
        await i.reply({ content: `اخترت حماية ${targetName}`, ephemeral: true });
      } else if (action === 'police') {
        const isMafia = game.roles[targetId] === 'mafia';
        if (game.protectedByCloak === targetId) {
             await i.reply({ content: `الشخص ${targetName} هو مواطن بريء 😇 (العباءة نشطة)`, ephemeral: true });
        } else {
             await i.reply({ content: `الشخص ${targetName} هو ${isMafia ? 'المافيا! 😈' : 'مواطن بريء 😇'}`, ephemeral: true });
        }
      }
    }

    // 6. التصويت
    if (i.customId.startsWith('vote_')) {
      const targetId = i.customId.split('_')[1];
      if (!game || !game.alive.includes(i.user.id)) return i.reply({ content: 'أنت لست في اللعبة أو ميت!', ephemeral: true });
      
      const targetName = targetId.startsWith('bot') ? 'اللاعب الوهمي' : `<@${targetId}>`;
      game.votes.set(i.user.id, targetId);
      return i.reply({ content: `تم تسجيل تصويتك ضد ${targetName}`, ephemeral: true });
    }
  }
});

// ==================== 🌑 منطق اللعبة (الدوال) 🌑 ====================

async function startNight(channel, game) {
  if (checkWinner(channel, game)) return; // التحقق قبل البدء

  game.nightAction = { target: null, doctorTarget: null }; 
  
  const shopRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_mafia_shop').setLabel('القدرات').setStyle(ButtonStyle.Primary));
  await channel.send({ content: '-# ** دور القاتل عشان يلعب لعبته مين بيكون الضحيه التالية يا ترى **<:1KazumaGrin:1468386233750392947>', components: [shopRow] });

  // دالة مساعدة لإنشاء الأزرار، تتجاهل البوتات في قائمة *المستقبلين* لكن تضعهم في *الأهداف*
  const createActionRow = (prefix, exludeId) => {
      const row = new ActionRowBuilder();
      game.alive.filter(id => id !== exludeId).slice(0, 5).forEach(pId => {
          // إذا كان بوت، نضع له اسماً ثابتاً، إذا لاعب نجلب اسمه
          const name = pId.startsWith('bot') ? `لاعب (${pId})` : (client.users.cache.get(pId)?.username || `لاعب`);
          row.addComponents(new ButtonBuilder().setCustomId(`${prefix}_${pId}`).setLabel(name).setStyle(prefix === 'mafia_kill' ? ButtonStyle.Danger : prefix === 'doctor_save' ? ButtonStyle.Success : ButtonStyle.Primary));
      });
      return row;
  };

  const mafiaId = Object.keys(game.roles).find(id => game.roles[id] === 'mafia' && game.alive.includes(id));
  const doctorId = Object.keys(game.roles).find(id => game.roles[id] === 'doctor' && game.alive.includes(id));
  const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police' && game.alive.includes(id));

  // إرسال الأزرار (فقط إذا لم يكونوا بوتات)
  if (mafiaId && !mafiaId.startsWith('bot')) {
      await channel.send({ content: `<@${mafiaId}> **اختر ضحيتك**`, components: [createActionRow('mafia_kill', mafiaId)] }).then(m => setTimeout(() => m.delete().catch(()=>{}), 25000));
  }
  if (doctorId && !doctorId.startsWith('bot')) {
      await channel.send({ content: `<@${doctorId}> **اختر شخصاً لحمايته**`, components: [createActionRow('doctor_save', doctorId)] }).then(m => setTimeout(() => m.delete().catch(()=>{}), 25000));
  }
  if (policeId && !policeId.startsWith('bot')) {
      await channel.send({ content: `<@${policeId}> **اختر شخصاً للتحقيق**`, components: [createActionRow('police_check', policeId)] }).then(m => setTimeout(() => m.delete().catch(()=>{}), 25000));
  }

  // إذا كانت الأدوار بوتات، يمكننا عمل محاكاة بسيطة هنا أو تركهم (المافيا البوت لن يقتل أحد، وهذا أسهل للصيانة)
  // لكن لجعل وضع المطور ممتعاً، إذا كان المافيا "bot" سنجعله يختار عشوائياً
  if (mafiaId && mafiaId.startsWith('bot')) {
      const targets = game.alive.filter(id => id !== mafiaId);
      game.nightAction.target = targets[Math.floor(Math.random() * targets.length)];
  }

  setTimeout(() => resolveNight(channel, game), 30000);
}

async function resolveNight(channel, game) {
    const killedId = game.nightAction.target;
    const savedId = game.nightAction.doctorTarget;
    
    // **تعديل: إزالة الايموجيات من النصوص هنا أيضاً**
    const roleNames = { mafia: 'مافيا', doctor: 'طبيب 💉', police: 'شرطي 🔍', citizen: 'مواطن' };

    let msg = "";
    if (killedId && killedId !== savedId) {
        const role = game.roles[killedId];
        game.alive = game.alive.filter(id => id !== killedId);
        
        // التحقق إذا كان المقتول بوت أو لاعب
        const killedName = killedId.startsWith('bot') ? `اللاعب ${killedId}` : `<@${killedId}>`;
        
        msg = `-# **المرحوم راح فيها و تم قتله ${killedName} هو كان ${roleNames[role]} <:emoji_84:1389404919672340592>**`;
    } else if (killedId && killedId === savedId) {
        const savedName = killedId.startsWith('bot') ? `اللاعب ${killedId}` : `<@${killedId}>`;
        msg = `-# ** الطبيب الكفو قدر يرجع ${savedName} <:echat_kannaCool:1405424651399598221> **`;
    } else {
        msg = '🌅 طلع الصبح... والكل عايش!';
    }

    await channel.send(msg);
    setTimeout(() => startVoting(channel, game), 4000);
}

async function startVoting(channel, game) {
  if (checkWinner(channel, game)) return;

  game.votes.clear();
  const rows = [];
  let currentRow = new ActionRowBuilder();
  
  game.alive.forEach((pId, index) => {
    if (index > 0 && index % 5 === 0) { rows.push(currentRow); currentRow = new ActionRowBuilder(); }
    
    const name = pId.startsWith('bot') ? `لاعب (${pId})` : (client.users.cache.get(pId)?.username || `لاعب`);
    currentRow.addComponents(new ButtonBuilder().setCustomId(`vote_${pId}`).setLabel(name).setStyle(ButtonStyle.Secondary));
  });
  rows.push(currentRow);
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_mafia_shop').setLabel('القدرات').setStyle(ButtonStyle.Primary)));

  await channel.send({ content: `-# ** صوتوا على الشخص الي تشوفونه هو القاتل <:emoji_38:1470920843398746215> **`, components: rows });

  // تصويت البوتات العشوائي (عشان وضع المطور يشتغل صح)
  game.alive.forEach(botId => {
      if (botId.startsWith('bot')) {
          const targets = game.alive.filter(t => t !== botId);
          const randomVote = targets[Math.floor(Math.random() * targets.length)];
          game.votes.set(botId, randomVote);
      }
  });

  setTimeout(async () => {
    const voteCounts = {};
    game.votes.forEach(targetId => { voteCounts[targetId] = (voteCounts[targetId] || 0) + 1; });

    let kickedId = null; 
    let maxVotes = 0;
    for (const [id, count] of Object.entries(voteCounts)) { 
        if (count > maxVotes) { maxVotes = count; kickedId = id; } 
        else if (count === maxVotes) { kickedId = null; }
    }
    
    if (kickedId) {
      if (game.protectedByCloak === kickedId) {
        const name = kickedId.startsWith('bot') ? kickedId : `<@${kickedId}>`;
        await channel.send(`-# **حاولتم طرد ${name} لكنه استخدم عباءة الإخفاء ونجا!**`);
        game.protectedByCloak = null;
      } else {
        const role = game.roles[kickedId];
        game.alive = game.alive.filter(id => id !== kickedId);
        
        // **تعديل: إزالة الايموجيات هنا أيضاً**
        const roleNames = { mafia: 'مافيا', doctor: 'طبيب 💉', police: 'شرطي 🔍', citizen: 'مواطن' };
        const kickedName = kickedId.startsWith('bot') ? `اللاعب ${kickedId}` : `<@${kickedId}>`;

        if (role === 'mafia') {
             await channel.send(`-# ** تم امساك القاتل ${kickedName} هذا كان انت اجل…. <:__:1467633552408576192>  **`);
             return checkWinner(channel, game);
        } else {
             await channel.send(`-# **المسكين ${kickedName} تم التصويت عليه ظلم و راح فيها هو كان ${roleNames[role]} <:emoji_43:1397804543789498428> **`);
        }
      }
    } else { 
        await channel.send('تعادل في الأصوات! محد انطرد.');
    }
    
    if (!checkWinner(channel, game)) setTimeout(() => startNight(channel, game), 5000);

  }, 30000);
}

function checkWinner(channel, game) {
  const mafiaAlive = game.alive.some(id => game.roles[id] === 'mafia');
  const othersCount = game.alive.filter(id => game.roles[id] !== 'mafia').length;
  const mafiaCount = game.alive.filter(id => game.roles[id] === 'mafia').length;

  const getMention = (id) => id?.startsWith('bot') ? `لاعب (${id})` : `<@${id}>`;

  const mafiaId = Object.keys(game.roles).find(id => game.roles[id] === 'mafia');
  const policeId = Object.keys(game.roles).find(id => game.roles[id] === 'police');
  const doctorId = Object.keys(game.roles).find(id => game.roles[id] === 'doctor');
  const citizens = Object.keys(game.roles).filter(id => game.roles[id] === 'citizen').map(id => getMention(id)).join(', ');

  if (!mafiaAlive) { 
      channel.send(`-# **المواطنين فازوا 🎉\nالشرطي ${getMention(policeId)}<:s7_discord:1388214117365453062>\nالمواطنين ${citizens} <:emoji_33:1401771703306027008>\nالطبيب ${getMention(doctorId)} <:emoji_32:1401771771010613319>**`);
      activeMafiaGames.delete(channel.id);
      return true;
  }
  
  if (mafiaCount >= othersCount) { 
      channel.send(`-# **القاتل ${getMention(mafiaId)} لعب فيهم لعب و فاز و محد كشفه <:emoji_38:1401773302619439147>  **`);
      activeMafiaGames.delete(channel.id);
      return true;
  }

  return false;
}

// تشغيل البوت
app.get('/', (req, res) => res.send('Bot is Alive!'));
app.listen(3000, () => console.log('🚀 Server started'));
client.login("YOUR_TOKEN_HERE"); // تأكد من وضع التوكن الخاص بك هنا أو في متغيرات البيئة
