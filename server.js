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
  } catch (e) {
    console.error('❌ Ошибка загрузки referrals.json:', e);
    return { users: {}, referrals: {} };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('❌ Ошибка сохранения referrals.json:', e);
  }
}

function loadLeaderboard() {
  try {
    if (!fs.existsSync(LEADERBOARD_FILE)) {
      fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify({ monthly: {}, yearly: {} }, null, 2));
    }
    return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
  } catch (e) {
    console.error('❌ Ошибка загрузки leaderboard.json:', e);
    return { monthly: {}, yearly: {} };
  }
}

function saveLeaderboard(data) {
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('❌ Ошибка сохранения leaderboard.json:', e);
  }
}

function loadGameData() {
  try {
    if (!fs.existsSync(GAME_DATA_FILE)) {
      fs.writeFileSync(GAME_DATA_FILE, JSON.stringify({}, null, 2));
    }
    return JSON.parse(fs.readFileSync(GAME_DATA_FILE, 'utf8'));
  } catch (e) {
    console.error('❌ Ошибка загрузки games.json:', e);
    return {};
  }
}

function saveGameData(data) {
  try {
    fs.writeFileSync(GAME_DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('❌ Ошибка сохранения games.json:', e);
  }
}

// ============================================================
// ПИРАМИДАЛЬНАЯ СИСТЕМА
// ============================================================
function getAllReferrals(userId, db, level = 0, maxLevel = 5) {
  if (level >= maxLevel) return [];
  const directReferrals = db.referrals[userId] || [];
  let result = [];
  directReferrals.forEach(ref => {
    result.push({ ...ref, level: level + 1, bonus: getLevelBonus(level + 1) });
    const subReferrals = getAllReferrals(ref.userId, db, level + 1, maxLevel);
    result = result.concat(subReferrals);
  });
  return result;
}

function getLevelBonus(level) {
  const bonuses = { 1: 0.30, 2: 0.20, 3: 0.15, 4: 0.10, 5: 0.05 };
  return bonuses[level] || 0;
}

function getLevelLimit(level) { return 15; }

function canAddReferral(userId, level, db) {
  const referrals = getAllReferrals(userId, db);
  const countAtLevel = referrals.filter(r => r.level === level).length;
  return countAtLevel < getLevelLimit(level);
}

function findAvailableReferrer(userId, db, depth = 0) {
  if (depth > 5) return null;
  for (let level = 1; level <= 5; level++) {
    if (canAddReferral(userId, level, db)) {
      return { userId, level };
    }
  }
  const directRefs = db.referrals[userId] || [];
  for (const ref of directRefs) {
    const result = findAvailableReferrer(ref.userId, db, depth + 1);
    if (result) return result;
  }
  return null;
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
    money: 0,
    referralTree: { level1: [], level2: [], level3: [], level4: [], level5: [] }
  };
  
  if (referredBy && db.users[referredBy]) {
    const target = findAvailableReferrer(referredBy, db);
    if (target) {
      const level = target.level;
      const referrerId = target.userId;
      const levelKey = 'level' + level;
      const bonus = getLevelBonus(level) * 100;
      
      db.users[referrerId].referralTree[levelKey].push(userId);
      db.users[referrerId].referrals += 1;
      db.users[referrerId].totalEarned += bonus;
      
      if (!db.referrals[referrerId]) db.referrals[referrerId] = [];
      db.referrals[referrerId].push({
        userId: userId,
        userName: userName || 'Игрок',
        date: new Date().toISOString(),
        bonus: bonus,
        level: level
      });
      
      db.users[userId].referralLevel = level;
      db.users[userId].referrerId = referrerId;
    }
  }
  
  saveData(db);
  res.json({ success: true, user: db.users[userId], referrerBonus: referredBy ? 150 : 0 });
});

// ============================================================
// API — ПРОВЕРКА ПОЛЬЗОВАТЕЛЯ
// ============================================================
app.get('/api/user/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadData();
  if (db.users[userId]) {
    res.json({ success: true, user: db.users[userId] });
  } else {
    res.json({ success: false });
  }
});

// ============================================================
// API — РУЧНАЯ ПРИВЯЗКА РЕФЕРАЛА
// ============================================================
app.post('/api/manual-referral', (req, res) => {
  const { referrerId, referredId } = req.body;
  if (!referrerId || !referredId) {
    return res.status(400).json({ error: 'referrerId и referredId обязательны' });
  }
  
  const db = loadData();
  if (!db.users[referrerId]) {
    return res.status(404).json({ error: 'Пригласивший не найден' });
  }
  if (!db.users[referredId]) {
    return res.status(404).json({ error: 'Приглашённый не найден' });
  }
  
  const allReferrals = getAllReferrals(referrerId, db);
  if (allReferrals.some(r => r.userId === referredId)) {
    return res.status(400).json({ error: 'Этот пользователь уже в вашей сети' });
  }
  
  const target = findAvailableReferrer(referrerId, db);
  if (!target) {
    return res.status(400).json({ error: 'Нет свободных мест в пирамиде' });
  }
  
  const level = target.level;
  const levelKey = 'level' + level;
  const bonus = getLevelBonus(level) * 100;
  
  db.users[referrerId].referralTree[levelKey].push(referredId);
  db.users[referrerId].referrals += 1;
  db.users[referrerId].totalEarned += bonus;
  
  if (!db.referrals[referrerId]) db.referrals[referrerId] = [];
  db.referrals[referrerId].push({
    userId: referredId,
    userName: db.users[referredId].name || 'Игрок',
    date: new Date().toISOString(),
    bonus: bonus,
    level: level
  });
  
  db.users[referredId].money = (db.users[referredId].money || 0) + 100;
  db.users[referredId].referredBy = referrerId;
  db.users[referredId].referralLevel = level;
  db.users[referredId].referrerId = referrerId;
  
  saveData(db);
  res.json({ success: true, bonus: bonus, level: level });
});

// ============================================================
// API — СТАТИСТИКА РЕФЕРАЛОВ
// ============================================================
app.get('/api/referral-stats/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadData();
  if (!db.users[userId]) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  const allReferrals = getAllReferrals(userId, db);
  const levels = {
    level1: { count: 0, users: [] },
    level2: { count: 0, users: [] },
    level3: { count: 0, users: [] },
    level4: { count: 0, users: [] },
    level5: { count: 0, users: [] }
  };
  let totalBonus = 0;
  
  allReferrals.forEach(ref => {
    const key = 'level' + ref.level;
    if (levels[key]) {
      levels[key].count += 1;
      levels[key].users.push(ref);
    }
    totalBonus += ref.bonus || 0;
  });
  
  res.json({ success: true, stats: { totalReferrals: allReferrals.length, totalEarned: totalBonus, levels: levels, referralsList: allReferrals } });
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
      money: 0,
      referralTree: { level1: [], level2: [], level3: [], level4: [], level5: [] }
    };
  }
  
  db.users[userId].level = stats.level || 1;
  db.users[userId].harvests = stats.harvests || 0;
  db.users[userId].money = stats.money || 0;
  db.users[userId].name = userName || 'Игрок';
  
  saveData(db);
  res.json({ success: true });
});

// ============================================================
// API — СТАТИСТИКА ПОЛЬЗОВАТЕЛЯ
// ============================================================
app.get('/api/stats/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadData();
  if (!db.users[userId]) {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  const user = db.users[userId];
  const referrals = db.referrals[userId] || [];
  const allReferrals = getAllReferrals(userId, db);
  
  res.json({
    user,
    referrals,
    stats: {
      totalReferrals: user.referrals || 0,
      totalEarned: user.totalEarned || 0,
      friends: referrals.map(r => ({ name: r.userName, date: r.date, bonus: r.bonus, level: r.level })),
      level: user.level || 1,
      harvests: user.harvests || 0,
      money: user.money || 0,
      referredBy: user.referredBy || null,
      pyramidStats: {
        total: allReferrals.length,
        levels: {
          1: allReferrals.filter(r => r.level === 1).length,
          2: allReferrals.filter(r => r.level === 2).length,
          3: allReferrals.filter(r => r.level === 3).length,
          4: allReferrals.filter(r => r.level === 4).length,
          5: allReferrals.filter(r => r.level === 5).length
        }
      }
    }
  });
});

// ============================================================
// API — СОХРАНЕНИЕ ИГРЫ
// ============================================================
app.post('/api/save-game', (req, res) => {
  const { userId, gameState } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId обязателен' });
  
  const db = loadGameData();
  db[userId] = { ...gameState, savedAt: new Date().toISOString() };
  saveGameData(db);
  res.json({ success: true });
});

app.get('/api/load-game/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadGameData();
  if (db[userId]) {
    res.json({ success: true, gameState: db[userId] });
  } else {
    res.json({ success: false });
  }
});

// ============================================================
// API — РЕЙТИНГ
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
    return res.status(400).json({ error: 'Неверный период' });
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
  
  res.json({ period: period, key: key, players: sorted });
});

// ============================================================
// API — ВСЕ ПОЛЬЗОВАТЕЛИ
// ============================================================
app.get('/api/all-users', (req, res) => {
  const db = loadData();
  const users = Object.keys(db.users).map(id => ({
    id: id,
    name: db.users[id].name || 'Игрок',
    registeredAt: db.users[id].registeredAt,
    referredBy: db.users[id].referredBy || null
  }));
  res.json({ success: true, users: users });
});

// ============================================================
// ЗАПУСК СЕРВЕРА
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📁 Данные хранятся в папке data/`);
});
