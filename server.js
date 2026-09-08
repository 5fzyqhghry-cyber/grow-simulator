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
// ДАННЫЕ
// ============================================================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DATA_FILE = path.join(DATA_DIR, 'players.json');

function loadData() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            fs.writeFileSync(DATA_FILE, JSON.stringify({ players: {} }, null, 2));
        }
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
        return { players: {} };
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Ошибка сохранения:', e);
    }
}

// ============================================================
// API
// ============================================================

// Регистрация/обновление игрока
app.post('/api/register', (req, res) => {
    const { userId, userName, money, level, energy, harvests } = req.body;
    if (!userId) {
        return res.status(400).json({ error: 'userId обязателен' });
    }
    
    const db = loadData();
    
    db.players[userId] = {
        id: userId,
        name: userName || 'Игрок',
        money: money || 0,
        level: level || 1,
        energy: energy || 100,
        harvests: harvests || 0,
        registeredAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
    };
    
    saveData(db);
    res.json({ success: true, user: db.players[userId] });
});

// Получить рейтинг
app.get('/api/leaderboard/:period', (req, res) => {
    const db = loadData();
    const players = Object.values(db.players);
    
    const sorted = players
        .sort((a, b) => (b.money || 0) - (a.money || 0))
        .slice(0, 100)
        .map(p => ({
            id: p.id,
            name: p.name || 'Игрок',
            money: p.money || 0,
            level: p.level || 1,
            harvests: p.harvests || 0
        }));
    
    res.json({
        period: req.params.period || 'monthly',
        players: sorted,
        total: sorted.length
    });
});

// Получить данные игрока
app.get('/api/player/:userId', (req, res) => {
    const { userId } = req.params;
    const db = loadData();
    
    if (!db.players[userId]) {
        return res.status(404).json({ error: 'Игрок не найден' });
    }
    
    res.json(db.players[userId]);
});

// ============================================================
// ЗАПУСК
// ============================================================
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log(`📁 Данные в ${DATA_FILE}`);
});
