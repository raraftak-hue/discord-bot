const { ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } = require('discord.js');

// ==================== 🎮 دوال مساعدة ====================
function getUserTag(client, userId) {
  const user = client.users.cache.get(userId);
  return user ? `<@${userId}>` : userId;
}

function findClosestGuess(guesses, secretNumber) {
  if (!guesses || guesses.length === 0) return null;
  let closest = guesses[0];
  let minDiff = Math.abs(guesses[0].guess - secretNumber);
  for (const g of guesses) {
    const diff = Math.abs(g.guess - secretNumber);
    if (diff < minDiff) {
      minDiff = diff;
      closest = g;
    }
  }
  return closest;
}

async function startNextTurn(client, channel, msgId, guildId) {
  const gameKey = `${guildId}-${msgId}`;
  const game = client.activeNumberGames.get(gameKey);
  if (!game || !game.started || game.winner) return;
  
  const maxAttempts = game.players.length === 1 ? 5 : 3;
  
  game.alivePlayers = game.players.filter(p => {
    const attempts = game.attempts.get(p) || 0;
    return attempts < maxAttempts;
  });
  
  if (game.alivePlayers.length === 0) {
    const guesses = game.guesses || [];
    const closest = findClosestGuess(guesses, game.secretNumber);
    
    if (game.players.length === 1) {
      await channel.send(`-# ** نفذت خلصت محاولاتك الـ 5 و الرقم الصح كان ${game.secretNumber} <:emoji_11:1467287898448724039> **`).catch(() => { });
    } else {
      const closestUser = closest ? getUserTag(client, closest.userId) : 'لا يوجد';
      await channel.send(`-# ** الرقم الصح كان ${game.secretNumber} محد جابها صح و نفذت كل محاولات كل المشتركين بس اقرب واحد جاب تخمين هو ${closestUser} <:emoji_11:1467287898448724039> **`).catch(() => { });
    }
    
    client.activeNumberGames.delete(gameKey);
    return;
  }
  
  if (game.currentTurnIndex >= game.alivePlayers.length) game.currentTurnIndex = 0;
  
  const currentPlayer = game.alivePlayers[game.currentTurnIndex];
  game.currentTurn = currentPlayer;
  
  if (!game.canGuess) game.canGuess = new Map();
  game.players.forEach(p => game.canGuess.set(p, false));
  
  await channel.send(`-# **دور المشارك ${getUserTag(client, currentPlayer)} للتخمين **`).catch(() => { });
  game.canGuess.set(currentPlayer, true);
  
  if (game.timer) { clearTimeout(game.timer); game.timer = null; }
  
  const timer = setTimeout(async () => {
    const game = client.activeNumberGames.get(gameKey);
    if (!game || !game.started || game.winner) return;
    if (game.currentTurn === currentPlayer) {
      game.canGuess?.set(currentPlayer, false);
      await channel.send(`-# **المشارك ${getUserTag(client, currentPlayer)} انطرد عشان ما خمن قبل انتهاء الوقت <:s7_discord:1388214117365453062> **`).catch(() => { });
      
      const attempts = game.attempts.get(currentPlayer) || 0;
      const maxAttempts = game.players.length === 1 ? 5 : 3;
      game.attempts.set(currentPlayer, attempts + maxAttempts);
      
      game.currentTurnIndex++;
      game.currentTurn = null;
      
      setTimeout(() => { startNextTurn(client, channel, msgId, guildId); }, 8000);
    }
  }, 15000);
  
  game.timer = timer;
}

async function startNumberGameAfterDelay(client, msg, gameData, guildId) {
  setTimeout(async () => {
    const gameKey = `${guildId}-${msg.id}`;
    const game = client.activeNumberGames.get(gameKey);
    if (!game) return;
    
    if (game.players.length === 0) {
      await msg.edit({ content: `-# **اللعبة فشلت عشان مافي عدد كافي دخلها <:new_emoji:1388436095842385931> **`, components: [] }).catch(() => { });
      client.activeNumberGames.delete(gameKey);
      return;
    }
    
    game.started = true;
    game.secretNumber = Math.floor(Math.random() * 100) + 1;
    const playersList = game.players.map(p => getUserTag(client, p)).join(' ');
    
    await msg.channel.send(
      `-# ** تم بدأ اللعبة كل واحد من المشاركين عنده جولة يخمن فيها الرقم و كل مشارك له ${game.players.length === 1 ? '5' : '3'} محاولات الا اذا فاز احد فيكم <:new_emoji:1388436089584226387> **\n` +
      `-# المشاركين هم ${playersList}`
    ).catch(() => { });
    
    setTimeout(async () => { await msg.delete().catch(() => { }); }, 10000);
    setTimeout(() => { startNextTurn(client, msg.channel, msg.id, guildId); }, 10000);
  }, 20000);
}

module.exports = {
  onMessage: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();
    const args = content.split(/\s+/);
    const command = args[0];

    if (command === 'ارقام') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      for (const [key, game] of client.activeNumberGames.entries()) {
        if (key.startsWith(message.guild.id)) {
          const msg = await message.channel.messages.fetch(key.split('-')[1]).catch(() => null);
          if (msg && !game.started) return message.channel.send(`-# **في لعبة شغالة يـ عبد خلها تخلص <:emoji_38:1470920843398746215> **`);
        }
      }
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('join_number_game').setLabel('انضم للعبة').setStyle(ButtonStyle.Secondary));
      const msg = await message.channel.send({ content: `-# **تم بدأ لعبة التخمين مهمتكم رح تكون تخمين الرقم الصحيح من 1 الى 100 <:new_emoji:1388436089584226387> **`, components: [row] }).catch(() => { });
      client.activeNumberGames.set(`${message.guild.id}-${msg.id}`, { 
        hostId: message.author.id, 
        players: [], 
        attempts: new Map(), 
        guesses: [], 
        started: false, 
        winner: null, 
        secretNumber: null, 
        currentTurn: null, 
        currentTurnIndex: 0, 
        alivePlayers: [], 
        timer: null, 
        canGuess: new Map() 
      });
      startNumberGameAfterDelay(client, msg, client.activeNumberGames.get(`${message.guild.id}-${msg.id}`), message.guild.id);
      return;
    }

    if (command === 'ايقاف') {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
      let found = false;
      for (const [key, game] of client.activeNumberGames.entries()) {
        if (key.startsWith(message.guild.id)) {
          const msg = await message.channel.messages.fetch(key.split('-')[1]).catch(() => null);
          if (msg) await msg.edit({ content: `-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`, components: [] }).catch(() => { });
          if (game.timer) clearTimeout(game.timer);
          client.activeNumberGames.delete(key); 
          found = true;
        }
      }
      if (found) return message.channel.send(`-# ** تم ايقاف اللعبة <:new_emoji:1388436095842385931> **`);
    }

    // معالجة التخمين أثناء اللعبة
    for (const [key, game] of client.activeNumberGames.entries()) {
      if (key.startsWith(message.guild.id) && game.started && !game.winner) {
        if (game.currentTurn === message.author.id && game.canGuess?.get(message.author.id)) {
          const guess = parseInt(message.content);
          if (isNaN(guess)) return;

          game.canGuess.set(message.author.id, false);
          if (game.timer) { clearTimeout(game.timer); game.timer = null; }

          const attempts = (game.attempts.get(message.author.id) || 0) + 1;
          game.attempts.set(message.author.id, attempts);
          game.guesses.push({ userId: message.author.id, guess });

          if (guess === game.secretNumber) {
            game.winner = message.author.id;
            await message.channel.send(`-# **مبروك جابها صح ${getUserTag(client, message.author.id)} الرقم كان ${game.secretNumber} <:emoji_33:1401771703306027008> **`).catch(() => { });
            client.activeNumberGames.delete(key);
            return;
          } else {
            const hint = guess < game.secretNumber ? 'أكبر' : 'أصغر';
            await message.channel.send(`-# **خطأ الرقم ${hint} من ${guess} <:emoji_38:1470920843398746215> **`).catch(() => { });
            
            game.currentTurnIndex++;
            setTimeout(() => { startNextTurn(client, message.channel, key.split('-')[1], message.guild.id); }, 3000);
            return;
          }
        }
      }
    }
  },

  onInteraction: async (client, interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'join_number_game') {
      const gameKey = `${interaction.guild.id}-${interaction.message.id}`;
      const game = client.activeNumberGames.get(gameKey);
      if (!game) return interaction.reply({ content: '❌ اللعبة مو موجودة!', ephemeral: true });
      if (game.started) return interaction.reply({ content: '❌ اللعبة بدأت خلاص!', ephemeral: true });
      if (game.players.includes(interaction.user.id)) return interaction.reply({ content: '❌ أنت مسجل أصلاً!', ephemeral: true });

      game.players.push(interaction.user.id);
      return interaction.reply({ content: '✅ تم تسجيلك في اللعبة!', ephemeral: true });
    }
  }
};
