const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================
// РАБОТА С ДАННЫМИ
// ============================================================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATA_FILE = path.join(DATA_DIR, 'users.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify({ users: {}, referrals: {} }, null, 2));
        }
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        console.error('❌ Ошибка загрузки данных:', e);
        return { users: {}, referrals: {} };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('❌ Ошибка сохранения данных:', e);
    }
}

// ============================================================
// API ЭНДПОИНТЫ
// ============================================================

// Регистрация пользователя
app.post('/api/register', (req, res) => {
    const { userId, userName, referredBy } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId обязателен' });
    }
    
    const db = loadData();
    
    if (db.users[userId]) {
        return res.json({ success: true, user: db.users[userId] });
    }
    
    db.users[userId] = {
        id: userId,
        name: userName || 'Игрок',
        registeredAt: new Date().toISOString(),
        referredBy: referredBy || null,
        referrals: 0,
        referralEarned: 0,
        level: 1,
        harvests: 0,
        money: 0,
        energy: 100
    };
    
    if (referredBy && db.users[referredBy]) {
        db.users[referredBy].referrals += 1;
        db.users[referredBy].referralEarned += 150;
        
        if (!db.referrals[referredBy]) {
            db.referrals[referredBy] = [];
        }
        db.referrals[referredBy].push({
            userId: userId,
            userName: userName || 'Игрок',
            date: new Date().toISOString(),
            bonus: 150
        });
    }
    
    saveData(db);
    res.json({ success: true, user: db.users[userId] });
});

// Получить рефералов пользователя
app.get('/api/referrals/:userId', (req, res) => {
    const { userId } = req.params;
    const db = loadData();
    
    if (!db.users[userId]) {
        return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    const referrals = db.referrals[userId] || [];
    res.json({
        referrals: referrals,
        total: db.users[userId].referrals || 0,
        earned: db.users[userId].referralEarned || 0
    });
});

// Добавить реферала
app.post('/api/referral/add', (req, res) => {
    const { referrerId, userId, userName, bonus } = req.body;
    if (!referrerId || !userId) {
        return res.status(400).json({ error: 'referrerId и userId обязательны' });
    }
    
    const db = loadData();
    
    if (!db.users[referrerId]) {
        return res.status(404).json({ error: 'Реферер не найден' });
    }
    
    if (!db.referrals[referrerId]) {
        db.referrals[referrerId] = [];
    }
    
    const exists = db.referrals[referrerId].some(r => r.userId === userId);
    if (!exists) {
        db.referrals[referrerId].push({
            userId: userId,
            userName: userName || 'Игрок',
            date: new Date().toISOString(),
            bonus: bonus || 150
        });
        db.users[referrerId].referrals = (db.users[referrerId].referrals || 0) + 1;
        db.users[referrerId].referralEarned = (db.users[referrerId].referralEarned || 0) + (bonus || 150);
        saveData(db);
    }
    
    res.json({ success: true });
});

// Обновление статистики
app.post('/api/update-stats', (req, res) => {
    const { userId, userName, stats } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId обязателен' });
    }
    
    const db = loadData();
    
    if (!db.users[userId]) {
        db.users[userId] = {
            id: userId,
            name: userName || 'Игрок',
            registeredAt: new Date().toISOString(),
            referredBy: null,
            referrals: 0,
            referralEarned: 0,
            level: 1,
            harvests: 0,
            money: 0,
            energy: 100
        };
    }
    
    if (stats) {
        db.users[userId].level = stats.level || 1;
        db.users[userId].harvests = stats.harvests || 0;
        db.users[userId].money = stats.money || 0;
        db.users[userId].energy = stats.energy || 100;
        if (userName) {
            db.users[userId].name = userName;
        }
    }
    
    saveData(db);
    res.json({ success: true });
});

// Рейтинг
app.get('/api/leaderboard/:period', (req, res) => {
    const db = loadData();
    const users = Object.values(db.users);
    
    const sorted = users
        .sort((a, b) => (b.money || 0) - (a.money || 0))
        .slice(0, 100)
        .map(user => ({
            id: user.id,
            name: user.name || 'Игрок',
            money: user.money || 0,
            level: user.level || 1,
            harvests: user.harvests || 0,
            referrals: user.referrals || 0
        }));
    
    res.json({
        period: req.params.period || 'monthly',
        players: sorted,
        total: sorted.length
    });
});

// ============================================================
// ЗАПУСК
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📁 Данные хранятся в ${DATA_FILE}`);
});
