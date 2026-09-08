const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// НАСТРОЙКИ
// ============================================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Создаём папку data если её нет
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const DATA_FILE = path.join(DATA_DIR, 'referrals.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const GAME_DATA_FILE = path.join(DATA_DIR, 'games.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');

// ============================================================
// ЗАГРУЗКА/СОХРАНЕНИЕ ДАННЫХ
// ============================================================

function loadData(file, defaultData) {
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
      return defaultData;
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`❌ Ошибка загрузки ${file}:`, e);
    return defaultData;
  }
}

function saveData(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`❌ Ошибка сохранения ${file}:`, e);
  }
}

// ============================================================
// API — РЕГИСТРАЦИЯ
// ============================================================
app.post('/api/register', (req, res) => {
  const { userId, userName, referredBy } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });

  const db = loadData(DATA_FILE, { users: {}, referrals: {} });

  if (db.users[userId]) {
    return res.json({ success: true, user: db.users[userId] });
  }

  db.users[userId] = {
    id: userId,
    name: userName || 'Игрок',
    registeredAt: new Date().toISOString(),
    referredBy: referredBy || null,
    totalEarned: 0,
    referrals: 0,
    level: 1,
    harvests: 0,
    money: 0,
    energy: 100,
    friends: 0
  };

  if (referredBy && db.users[referredBy]) {
    db.users[referredBy].referrals += 1;
    db.users[referredBy].totalEarned += 150;

    if (!db.referrals[referredBy]) db.referrals[referredBy] = [];
    db.referrals[referredBy].push({
      userId: userId,
      userName: userName || 'Игрок',
      date: new Date().toISOString(),
      bonus: 150
    });
  }

  saveData(DATA_FILE, db);
  res.json({ success: true, user: db.users[userId], referrerBonus: referredBy ? 150 : 0 });
});

// ============================================================
// API — СТАТИСТИКА
// ============================================================
app.get('/api/stats/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadData(DATA_FILE, { users: {}, referrals: {} });

  if (!db.users[userId]) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  const user = db.users[userId];
  const referrals = db.referrals[userId] || [];

  res.json({
    user,
    referrals,
    stats: {
      totalReferrals: user.referrals || 0,
      totalEarned: user.totalEarned || 0,
      friends: referrals.map(r => ({ name: r.userName, date: r.date, bonus: r.bonus })),
      level: user.level || 1,
      harvests: user.harvests || 0,
      money: user.money || 0,
      energy: user.energy || 100,
      referredBy: user.referredBy || null
    }
  });
});

// ============================================================
// API — ОБНОВЛЕНИЕ СТАТИСТИКИ
// ============================================================
app.post('/api/update-stats', (req, res) => {
  const { userId, userName, stats } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });

  const db = loadData(DATA_FILE, { users: {}, referrals: {} });
  
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      name: userName || 'Игрок',
      registeredAt: new Date().toISOString(),
      referredBy: null,
      totalEarned: 0,
      referrals: 0,
      level: 1,
      harvests: 0,
      money: 0,
      energy: 100,
      friends: 0
    };
  }

  if (stats) {
    db.users[userId].level = stats.level || 1;
    db.users[userId].harvests = stats.harvests || 0;
    db.users[userId].money = stats.money || 0;
    db.users[userId].energy = stats.energy || 100;
    db.users[userId].friends = stats.friends || 0;
    if (userName) db.users[userId].name = userName;
  }

  saveData(DATA_FILE, db);

  // Обновляем рейтинг
  updateLeaderboard(userId, db.users[userId]);

  res.json({ success: true });
});

// ============================================================
// API — ОБНОВЛЕНИЕ РЕЙТИНГА
// ============================================================
function updateLeaderboard(userId, user) {
  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const yearKey = String(now.getFullYear());

  const lb = loadData(LEADERBOARD_FILE, { monthly: {}, yearly: {} });

  // Месячный рейтинг
  if (!lb.monthly[monthKey]) lb.monthly[monthKey] = {};
  lb.monthly[monthKey][userId] = {
    name: user.name || 'Игрок',
    money: user.money || 0,
    level: user.level || 1,
    harvests: user.harvests || 0,
    friends: user.friends || 0,
    updatedAt: new Date().toISOString()
  };

  // Годовой рейтинг
  if (!lb.yearly[yearKey]) lb.yearly[yearKey] = {};
  lb.yearly[yearKey][userId] = {
    name: user.name || 'Игрок',
    money: user.money || 0,
    level: user.level || 1,
    harvests: user.harvests || 0,
    friends: user.friends || 0,
    updatedAt: new Date().toISOString()
  };

  saveData(LEADERBOARD_FILE, lb);
}

// ============================================================
// API — ПОЛУЧИТЬ РЕЙТИНГ
// ============================================================
app.get('/api/leaderboard/:period', (req, res) => {
  const { period } = req.params;
  const now = new Date();
  let key;
  
  if (period === 'monthly') {
    key = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  } else if (period === 'yearly') {
    key = String(now.getFullYear());
  } else {
    return res.status(400).json({ error: 'Неверный период. Используйте monthly или yearly' });
  }

  const lb = loadData(LEADERBOARD_FILE, { monthly: {}, yearly: {} });
  const data = lb[period]?.[key] || {};
  
  const sorted = Object.entries(data)
    .map(([id, info]) => ({
      id: id,
      name: info.name || 'Игрок',
      money: info.money || 0,
      level: info.level || 1,
      harvests: info.harvests || 0,
      friends: info.friends || 0
    }))
    .sort((a, b) => b.money - a.money);

  res.json({ period, key, players: sorted, total: sorted.length });
});

// ============================================================
// API — СОХРАНЕНИЕ/ЗАГРУЗКА ИГРЫ
// ============================================================
app.post('/api/save-game', (req, res) => {
  const { userId, gameState } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });

  const db = loadData(GAME_DATA_FILE, {});
  db[userId] = { ...gameState, savedAt: new Date().toISOString() };
  saveData(GAME_DATA_FILE, db);
  res.json({ success: true });
});

app.get('/api/load-game/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadData(GAME_DATA_FILE, {});
  if (db[userId]) {
    res.json({ success: true, gameState: db[userId] });
  } else {
    res.json({ success: false });
  }
});

// ============================================================
// API — ДРУЗЬЯ
// ============================================================
app.post('/api/friends/add', (req, res) => {
  const { userId, friendId, friendName } = req.body;
  if (!userId || !friendId) return res.status(400).json({ error: 'userId и friendId обязательны' });
  if (userId === friendId) return res.status(400).json({ error: 'Нельзя добавить себя' });

  const db = loadData(FRIENDS_FILE, {});
  if (!db[userId]) db[userId] = { friends: [], requests: [] };
  
  if (db[userId].friends.find(f => f.id === friendId)) {
    return res.status(400).json({ error: 'Уже в друзьях' });
  }

  db[userId].friends.push({
    id: friendId,
    name: friendName || 'Игрок',
    addedAt: new Date().toISOString()
  });

  saveData(FRIENDS_FILE, db);
  res.json({ success: true });
});

app.post('/api/friends/request', (req, res) => {
  const { userId, targetId, targetName } = req.body;
  if (!userId || !targetId) return res.status(400).json({ error: 'userId и targetId обязательны' });

  const db = loadData(FRIENDS_FILE, {});
  if (!db[targetId]) db[targetId] = { friends: [], requests: [] };
  
  if (db[targetId].requests.find(r => r.id === userId)) {
    return res.status(400).json({ error: 'Заявка уже отправлена' });
  }

  db[targetId].requests.push({
    id: userId,
    name: targetName || 'Игрок',
    date: new Date().toISOString()
  });

  saveData(FRIENDS_FILE, db);
  res.json({ success: true });
});

app.post('/api/friends/accept', (req, res) => {
  const { userId, friendId, friendName } = req.body;
  if (!userId || !friendId) return res.status(400).json({ error: 'userId и friendId обязательны' });

  const db = loadData(FRIENDS_FILE, {});
  if (!db[userId]) db[userId] = { friends: [], requests: [] };
  
  // Удаляем заявку
  db[userId].requests = db[userId].requests.filter(r => r.id !== friendId);
  
  // Добавляем в друзья
  if (!db[userId].friends.find(f => f.id === friendId)) {
    db[userId].friends.push({
      id: friendId,
      name: friendName || 'Игрок',
      addedAt: new Date().toISOString()
    });
  }

  saveData(FRIENDS_FILE, db);
  res.json({ success: true });
});

app.get('/api/friends/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadData(FRIENDS_FILE, {});
  res.json(db[userId] || { friends: [], requests: [] });
});

// ============================================================
// API — ОБМЕН
// ============================================================
app.post('/api/trade/send', (req, res) => {
  const { fromId, toId, item, quantity } = req.body;
  if (!fromId || !toId) return res.status(400).json({ error: 'fromId и toId обязательны' });

  const db = loadData(GAME_DATA_FILE, {});
  if (!db[toId]) db[toId] = { trades: [] };
  if (!db[toId].trades) db[toId].trades = [];
  
  db[toId].trades.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    from: fromId,
    item: item || 'unknown',
    quantity: quantity || 1,
    status: 'pending',
    date: new Date().toISOString()
  });

  saveData(GAME_DATA_FILE, db);
  res.json({ success: true });
});

app.post('/api/trade/accept', (req, res) => {
  const { userId, tradeId } = req.body;
  if (!userId || !tradeId) return res.status(400).json({ error: 'userId и tradeId обязательны' });

  const db = loadData(GAME_DATA_FILE, {});
  if (!db[userId]) db[userId] = { trades: [] };
  
  const trade = db[userId].trades.find(t => t.id === tradeId);
  if (trade) {
    trade.status = 'accepted';
    trade.acceptedAt = new Date().toISOString();
  }

  saveData(GAME_DATA_FILE, db);
  res.json({ success: true });
});

app.get('/api/trades/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadData(GAME_DATA_FILE, {});
  res.json(db[userId]?.trades || []);
});

// ============================================================
// API — БОНУСЫ
// ============================================================
app.post('/api/bonus/daily', (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });

  const db = loadData(DATA_FILE, { users: {}, referrals: {} });
  if (!db.users[userId]) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }

  const now = Date.now();
  const lastBonus = db.users[userId].lastBonus || 0;
  const cooldown = 24 * 60 * 60 * 1000; // 24 часа

  if (now - lastBonus < cooldown) {
    const remaining = cooldown - (now - lastBonus);
    return res.status(400).json({ 
      error: 'Бонус ещё недоступен', 
      remaining: remaining 
    });
  }

  const bonus = 50 + (db.users[userId].friends || 0) * 10;
  db.users[userId].money = (db.users[userId].money || 0) + bonus;
  db.users[userId].lastBonus = now;

  saveData(DATA_FILE, db);
  res.json({ success: true, bonus: bonus });
});

// ============================================================
// ЗАПУСК
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📁 Данные хранятся в папке data/`);
  console.log(`📊 Рейтинг доступен по адресу: /api/leaderboard/monthly`);
});
