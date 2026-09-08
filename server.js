// ============================================================
// API — ПРОВЕРКА СУЩЕСТВОВАНИЯ ПОЛЬЗОВАТЕЛЯ
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
// API — РУЧНАЯ ПРИВЯЗКА РЕФЕРАЛА (АДМИН)
// ============================================================
app.post('/api/manual-referral', (req, res) => {
    const { referrerId, referredId } = req.body;
    if (!referrerId || !referredId) {
        return res.status(400).json({ error: 'referrerId и referredId обязательны' });
    }
    
    const db = loadData();
    
    // Проверяем, существуют ли оба пользователя
    if (!db.users[referrerId]) {
        return res.status(404).json({ error: 'Пригласивший не найден' });
    }
    if (!db.users[referredId]) {
        return res.status(404).json({ error: 'Приглашённый не найден' });
    }
    
    // Проверяем, не привязан ли уже этот пользователь
    const allReferrals = getAllReferrals(referrerId, db);
    if (allReferrals.some(r => r.userId === referredId)) {
        return res.status(400).json({ error: 'Этот пользователь уже в вашей сети' });
    }
    
    // Находим место в пирамиде
    const target = findAvailableReferrer(referrerId, db);
    if (!target) {
        return res.status(400).json({ error: 'Нет свободных мест в пирамиде (максимум 15 на уровне)' });
    }
    
    const level = target.level;
    const levelKey = 'level' + level;
    const bonus = getLevelBonus(level) * 100;
    
    // Добавляем в пирамиду
    db.users[referrerId].referralTree[levelKey].push(referredId);
    db.users[referrerId].referrals += 1;
    db.users[referrerId].totalEarned += bonus;
    
    // Сохраняем в историю
    if (!db.referrals[referrerId]) db.referrals[referrerId] = [];
    db.referrals[referrerId].push({
        userId: referredId,
        userName: db.users[referredId].name || 'Игрок',
        date: new Date().toISOString(),
        bonus: bonus,
        level: level
    });
    
    // Начисляем бонус новичка
    db.users[referredId].money = (db.users[referredId].money || 0) + 100;
    db.users[referredId].referredBy = referrerId;
    db.users[referredId].referralLevel = level;
    db.users[referredId].referrerId = referrerId;
    
    saveData(db);
    
    console.log(`🔧 Ручная привязка: ${referredId} -> ${referrerId} (уровень ${level})`);
    res.json({ 
        success: true, 
        message: 'Реферал привязан',
        bonus: bonus,
        level: level
    });
});

// ============================================================
// API — ПОЛУЧИТЬ ВСЕХ ПОЛЬЗОВАТЕЛЕЙ (ДЛЯ АДМИНА)
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
