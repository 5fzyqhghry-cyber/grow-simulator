const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data', 'referrals.json');
const LEADERBOARD_FILE = path.join(__dirname, 'data', 'leaderboard.json');
const GAME_DATA_FILE = path.join(__dirname, 'data', 'games.json');

// ============================================================
// ЗАГРУЗКА/СОХРАНЕНИЕ
// ============================================================
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, referrals: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch { return { users: {}, referrals: {} }; }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function loadLeaderboard() {
  try {
    if (!fs.existsSync(LEADERBOARD_FILE)) {
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify({ monthly: {}, yearly: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
  } catch { return { monthly: {}, yearly: {} }; }
}

function saveLeaderboard(data) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
}

function loadGameData() {
  try {
    if (!fs.existsSync(GAME_DATA_FILE)) {
      fs.writeFileSync(GAME_DATA_FILE, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(GAME_DATA_FILE, 'utf8'));
  } catch { return {}; }
}

function saveGameData(data) {
  fs.writeFileSync(GAME_DATA_FILE, JSON.stringify(data, null, 2));
}

// ============================================================
// ОБНОВЛЕНИЕ РЕЙТИНГА
// ============================================================
function updateLeaderboard(userId, userName, stats) {
  const lb = loadLeaderboard();
  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const yearKey = String(now.getFullYear());
  
  if (!lb.monthly[monthKey]) lb.monthly[monthKey] = {};
  lb.monthly[monthKey][userId] = {
    name: userName || 'Игрок',
    money: stats.money || 0,
    level: stats.level || 1,
    harvests: stats.harvests || 0,
    friends: stats.friends || 0,
    updatedAt: now.toISOString()
  };
  
  if (!lb.yearly[yearKey]) lb.yearly[yearKey] = {};
  lb.yearly[yearKey][userId] = {
    name: userName || 'Игрок',
    money: stats.money || 0,
    level: stats.level || 1,
    harvests: stats.harvests || 0,
    friends: stats.friends || 0,
    updatedAt: now.toISOString()
  };
  
  saveLeaderboard(lb);
}

// ============================================================
// API — РЕГИСТРАЦИЯ
// ============================================================
app.post('/api/register', (req, res) => {
  const { userId, userName, referredBy } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });
  
  const db = loadData();
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
    money: 0
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
  
  saveData(db);
  res.json({ success: true, user: db.users[userId], referrerBonus: referredBy ? 150 : 0 });
});

// ============================================================
// API — ОБНОВЛЕНИЕ СТАТИСТИКИ
// ============================================================
app.post('/api/update-stats', (req, res) => {
  const { userId, userName, stats } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });
  
  const db = loadData();
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
      money: 0
    };
  }
  
  db.users[userId].level = stats.level || 1;
  db.users[userId].harvests = stats.harvests || 0;
  db.users[userId].money = stats.money || 0;
  db.users[userId].name = userName || 'Игрок';
  
  saveData(db);
  
  updateLeaderboard(userId, userName || 'Игрок', {
    money: stats.money || 0,
    level: stats.level || 1,
    harvests: stats.harvests || 0,
    friends: stats.friends || 0
  });
  
  res.json({ success: true });
});

// ============================================================
// API — СОХРАНЕНИЕ ИГРЫ (НОВОЕ!)
// ============================================================
app.post('/api/save-game', (req, res) => {
  const { userId, gameState } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });
  
  const db = loadGameData();
  db[userId] = {
    ...gameState,
    savedAt: new Date().toISOString()
  };
  saveGameData(db);
  console.log('💾 Сохранено для пользователя:', userId);
  res.json({ success: true });
});

// ============================================================
// API — ЗАГРУЗКА ИГРЫ (НОВОЕ!)
// ============================================================
app.get('/api/load-game/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadGameData();
  if (db[userId]) {
    console.log('📥 Загружено сохранение для:', userId);
    res.json({ success: true, gameState: db[userId] });
  } else {
    res.json({ success: false });
  }
});

// ============================================================
// API — ПОЛУЧИТЬ СТАТИСТИКУ ПОЛЬЗОВАТЕЛЯ
// ============================================================
app.get('/api/stats/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadData();
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
      referredBy: user.referredBy || null
    }
  });
});

// ============================================================
// API — ПОЛУЧИТЬ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ
// ============================================================
app.get('/api/users', (req, res) => {
  const db = loadData();
  res.json(db.users);
});

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
  
  const lb = loadLeaderboard();
  const data = lb[period]?.[key] || {};
  
  const sorted = Object.entries(data).map(([id, info]) => ({
    id: id,
    name: info.name || 'Игрок',
    money: info.money || 0,
    level: info.level || 1,
    harvests: info.harvests || 0,
    friends: info.friends || 0
  })).sort((a, b) => b.money - a.money);
  
  res.json({
    period: period,
    key: key,
    players: sorted
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
