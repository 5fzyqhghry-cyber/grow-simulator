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
    referrals: 0
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

app.get('/api/stats/:userId', (req, res) => {
  const { userId } = req.params;
  const db = loadData();
  if (!db.users[userId]) return res.status(404).json({ error: 'Пользователь не найден' });
  
  const user = db.users[userId];
  const referrals = db.referrals[userId] || [];
  res.json({
    user,
    referrals,
    stats: {
      totalReferrals: user.referrals || 0,
      totalEarned: user.totalEarned || 0,
      friends: referrals.map(r => ({ name: r.userName, date: r.date, bonus: r.bonus }))
    }
  });
});

app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));
