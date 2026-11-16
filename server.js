const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

// ডেটাবেস ইনিশিয়ালাইজেশন
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
        users: [], requests: [], cashouts: [], chats: [], agent: { name: "Admin", phone: "01700000000", password: "admin123" }
    }, null, 2));
}

function readDB() {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!data.chats) data.chats = [];
        if (!data.cashouts) data.cashouts = [];
        if (!data.requests) data.requests = [];
        return data;
    } catch (e) { return { users: [], requests: [], cashouts: [], chats: [] }; }
}

function writeDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

// ============ USER API ============

app.post('/api/register', (req, res) => {
    const { name, phone, password } = req.body;
    const db = readDB();
    if (db.users.find(u => u.phone === phone)) return res.status(400).json({ error: 'এই নাম্বার দিয়ে অ্যাকাউন্ট আছে' });
    
    const newUser = { id: Date.now(), name, phone, password, kycDone: false, walletBalance: 0, profilePic: null, kycData: null };
    db.users.push(newUser);
    writeDB(db);
    res.json({ success: true, user: newUser });
});

app.post('/api/login', (req, res) => {
    const { phone, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.phone === phone && u.password === password);
    if (!user) return res.status(401).json({ error: 'ভুল ফোন বা পাসওয়ার্ড' });
    res.json({ success: true, user });
});

app.post('/api/kyc', (req, res) => {
    const { userId, firstName, fatherName, dob, address, nidNumber, faceImg, nidFront, nidBack } = req.body;
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'ইউজার নেই' });
    
    db.users[idx].kycDone = true;
    db.users[idx].profilePic = faceImg;
    db.users[idx].kycData = { firstName, fatherName, dob, address, nidNumber, nidFront, nidBack };
    writeDB(db);
    res.json({ success: true });
});

app.post('/api/loan-request', (req, res) => {
    const { userId, amount, trxId, depositAmount } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: 'ইউজার নেই!' });

    const request = {
        id: Date.now(), userId: user.id, userName: user.name, userPhone: user.phone,
        kycNid: user.kycData?.nidNumber || 'N/A', kycAddress: user.kycData?.address || 'N/A',
        kycFather: user.kycData?.fatherName || 'N/A', faceImg: user.profilePic || null,
        amount, trxId, depositAmount, status: 'pending', date: new Date().toISOString()
    };
    db.requests.push(request);
    writeDB(db);
    res.json({ success: true, request });
});

app.get('/api/user/requests/:userId', (req, res) => {
    const db = readDB();
    res.json(db.requests.filter(r => r.userId === parseInt(req.params.userId)));
});

app.post('/api/cashout', (req, res) => {
    const { userId, amount, number } = req.body;
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'ইউজার নেই' });
    if (db.users[idx].walletBalance < amount) return res.status(400).json({ error: 'পর্যাপ্ত ব্যালেন্স নেই' });

    db.users[idx].walletBalance -= amount;
    db.cashouts.push({ id: Date.now(), userId, userName: db.users[idx].name, amount, number, status: 'pending', date: new Date().toISOString() });
    writeDB(db);
    res.json({ success: true });
});

// ============ CHAT API ============

app.post('/api/chat/send', (req, res) => {
    const { userId, userName, text, sender } = req.body;
    if (!userId || !text) return res.status(400).json({ error: "userId and text required" });
    const db = readDB();
    db.chats.push({ id: Date.now(), userId, userName, text, sender, timestamp: new Date().toISOString() });
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/chat/user/:userId', (req, res) => {
    const db = readDB();
    res.json(db.chats.filter(c => c.userId == req.params.userId));
});

// ============ AGENT API ============

app.get('/api/agent/requests', (req, res) => {
    const db = readDB();
    res.json(db.requests.filter(r => r.status === 'pending'));
});

app.post('/api/agent/action', (req, res) => {
    const { requestId, action } = req.body;
    const db = readDB();
    const reqIdx = db.requests.findIndex(r => r.id === requestId);
    if (reqIdx === -1) return res.status(404).json({ error: 'রিকোয়েস্ট নেই' });

    const request = db.requests[reqIdx];
    const userIdx = db.users.findIndex(u => u.id === request.userId);

    if (action === 'approve') {
        db.requests[reqIdx].status = 'approved';
        if (userIdx !== -1) db.users[userIdx].walletBalance += request.amount;
    } else {
        db.requests[reqIdx].status = 'rejected';
    }
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/agent/users', (req, res) => {
    const db = readDB();
    res.json(db.users);
});

app.post('/api/agent/reset-password', (req, res) => {
    const { userId, newPassword } = req.body;
    const db = readDB();
    const idx = db.users.findIndex(u => u.id === userId);
    if (idx === -1) return res.status(404).json({ error: 'ইউজার নেই' });
    db.users[idx].password = newPassword;
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/agent/cashouts', (req, res) => {
    const db = readDB();
    res.json(db.cashouts.filter(c => c.status === 'pending'));
});

app.post('/api/agent/cashout-action', (req, res) => {
    const { cashoutId, action } = req.body;
    const db = readDB();
    const idx = db.cashouts.findIndex(c => c.id === cashoutId);
    if (idx === -1) return res.status(404).json({ error: 'ক্যাশ আউট নেই' });

    if (action === 'approve') {
        db.cashouts[idx].status = 'approved';
    } else {
        db.cashouts[idx].status = 'rejected';
        const userIdx = db.users.findIndex(u => u.id === db.cashouts[idx].userId);
        if (userIdx !== -1) db.users[userIdx].walletBalance += db.cashouts[idx].amount; // ফেরত দেওয়া
    }
    writeDB(db);
    res.json({ success: true });
});

app.get('/api/chat/agent', (req, res) => {
    const db = readDB();
    res.json(db.chats);
});

app.get('/api/agent/stats', (req, res) => {
    const db = readDB();
    res.json({
        totalUsers: db.users.length,
        totalLoans: db.requests.length,
        totalPendingLoans: db.requests.filter(r => r.status === 'pending').length,
        totalCashouts: db.cashouts.filter(c => c.status === 'pending').length
    });
});

// ============ AGENT PROFILE API ============
app.post('/api/agent/update-profile', (req, res) => {
    const { name, phone, password, profilePic } = req.body;
    const db = readDB();
    if (!db.agent) db.agent = {};
    if (name) db.agent.name = name;
    if (phone) db.agent.phone = phone;
    if (password) db.agent.password = password;
    if (profilePic) db.agent.profilePic = profilePic;
    writeDB(db);
    res.json({ success: true, agent: db.agent });
});

app.get('/api/agent/profile', (req, res) => {
    const db = readDB();
    res.json(db.agent || { name: "Admin", phone: "01700000000" });
});

app.get('/health', (req, res) => {
    res.json({ success: true, service: 'e-Rin API', status: 'running' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ e-Rin API running on http://0.0.0.0:${PORT}`);
});
