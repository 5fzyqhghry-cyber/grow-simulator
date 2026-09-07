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
app.use(express.json());
app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'data', 'referrals.json');

// ============================================================
// РАБОТА С БАЗОЙ ДАННЫХ (JSON)
// ============================================================
function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, referrals: {} }, null, 2));
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('❌ Ошибка загрузки данных:', e);
    return { users: {}, referrals: {} };
  }
}

function saveData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Данные сохранены');
  } catch (e) {
    console.error('❌ Ошибка сохранения:', e);
  }
}

// ============================================================
// API — РЕГИСТРАЦИЯ НОВОГО ИГРОКА
// ============================================================
app.post('/api/register', (req, res) => {
  const { userId, userName, referredBy } = req.body;
  
  console.log('📥 Запрос на регистрацию:', { userId, userName, referredBy });
  
  if (!userId) {
    return res.status(400).json({ error: 'userId обязателен' });
  }
  
  const db = loadData();
  
  // Проверяем, есть ли уже такой пользователь
  if (db.users[userId]) {
    console.log('ℹ️ Пользователь уже зарегистрирован:', userId);
    return res.json({ 
      success: true, 
      message: 'Пользователь уже зарегистрирован',
      user: db.users[userId]
    });
  }
  
  // Регистрируем нового пользователя
  db.users[userId] = {
    id: userId,
    name: userName || 'Игрок',
    registeredAt: new Date().toISOString(),
    referredBy: referredBy || null,
    totalEarned: 0,
    referrals: 0
  };
  
  console.log('✅ Новый пользователь зарегистрирован:', userId);
  
  // Если есть реферальный код — начисляем бонусы
  if (referredBy && db.users[referredBy]) {
    console.log('🎁 Начисляем бонус пригласившему:', referredBy);
    
    // Начисляем бонус пригласившему
    db.users[referredBy].referrals += 1;
    db.users[referredBy].totalEarned += 150;
    
    // Сохраняем в историю рефералов
    if (!db.referrals[referredBy]) {
      db.referrals[referredBy] = [];
    }
    db.referrals[referredBy].push({
      userId: userId,
      userName: userName || 'Игрок',
      date: new Date().toISOString(),
      bonus: 150
    });
    
    console.log('✅ Бонус начислен! Всего рефералов:', db.users[referredBy].referrals);
  } else {
    console.log('ℹ️ Без реферала или пригласивший не найден');
  }
  
  saveData(db);
  
  res.json({
    success: true,
    message: 'Пользователь зарегистрирован',
    user: db.users[userId],
    referrerBonus: referredBy ? 150 : 0
  });
});

// ============================================================
// API — ПОЛУЧИТЬ СТАТИСТИКУ ПОЛЬЗОВАТЕЛЯ
// ============================================================
app.get('/api/stats/:userId', (req, res) => {
  const { userId } = req.params;
  console.log('📊 Запрос статистики для:', userId);
  
  const db = loadData();
  
  if (!db.users[userId]) {
    console.log('❌ Пользователь не найден:', userId);
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  
  const user = db.users[userId];
  const referrals = db.referrals[userId] || [];
  
  console.log('📊 Статистика:', {
    totalReferrals: user.referrals || 0,
    totalEarned: user.totalEarned || 0,
    friends: referrals.length
  });
  
  res.json({
    user: user,
    referrals: referrals,
    stats: {
      totalReferrals: user.referrals || 0,
      totalEarned: user.totalEarned || 0,
      friends: referrals.map(r => ({
        name: r.userName,
        date: r.date,
        bonus: r.bonus
      }))
    }
  });
});

// ============================================================
// API — ПОЛУЧИТЬ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ (для админа)
// ============================================================
app.get('/api/users', (req, res) => {
  const db = loadData();
  res.json(db.users);
});

// ============================================================
// API — ПОЛУЧИТЬ ВСЕ РЕФЕРАЛЫ (для админа)
// ============================================================
app.get('/api/referrals', (req, res) => {
  const db = loadData();
  res.json(db.referrals);
});

// ============================================================
// ЗАПУСК СЕРВЕРА
// ============================================================
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📁 Данные хранятся в: ${DATA_FILE}`);
});
