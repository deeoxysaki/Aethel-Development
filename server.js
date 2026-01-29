const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// --- SIMPLE JSON DATABASE SYSTEM ---
const DB_FILE = 'database.json';

// Initialize DB if not exists
let db = {
    apiKeys: [],
    projects: {}, // Map: email -> [projects]
    settings: {},  // Map: email -> settings
    registrations: [] // Track user logins
};

// Load Data from file (Persist across simple restarts)
if (fs.existsSync(DB_FILE)) {
    try {
        db = JSON.parse(fs.readFileSync(DB_FILE));
    } catch(e) {
        console.error("Could not load DB, starting fresh.");
    }
}

function saveDB() {
    // Write to file for simple persistence
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// --- API ROUTES ---

// 1. ADMIN: Generate Key
app.post('/api/admin/generate-key', (req, res) => {
    const { duration, createdBy } = req.body;
    
    // Generate Key
    const prefix = "sk_live_";
    const randomPart = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const key = prefix + randomPart;
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (duration * 24 * 60 * 60 * 1000));
    
    const newKey = {
        key,
        expiresAt: expiresAt.toISOString(),
        duration,
        usedBy: 'Unclaimed',
        createdAt: now.toISOString()
    };
    
    db.apiKeys.push(newKey);
    saveDB();
    
    res.json({ success: true, key: newKey.key, keys: db.apiKeys });
});

// 2. ADMIN: Get All Keys
app.get('/api/admin/keys', (req, res) => {
    res.json(db.apiKeys);
});

// 3. ADMIN: Get Registrations
app.get('/api/admin/registrations', (req, res) => {
    res.json(db.registrations);
});

// 4. AUTH: Verify Key & Login
app.post('/api/auth/key-login', (req, res) => {
    const { key, email } = req.body;
    const keyData = db.apiKeys.find(k => k.key === key);
    
    if (!keyData) return res.status(401).json({ error: "Invalid Key" });
    
    if (new Date() > new Date(keyData.expiresAt)) {
        return res.status(401).json({ error: "Key Expired" });
    }
    
    // Bind key to user if unclaimed or update usage
    if (keyData.usedBy === 'Unclaimed') {
        keyData.usedBy = email;
        keyData.usedDate = new Date().toISOString();
        
        // Add to registrations
        const existingReg = db.registrations.find(r => r.email === email);
        if (!existingReg) {
            db.registrations.push({ email, key, usedDate: new Date().toISOString() });
        }
    }
    
    saveDB();
    res.json({ success: true, role: 'Developer Access' });
});

// 5. DATA: Get User Data (Projects & Settings)
app.get('/api/user/data', (req, res) => {
    const email = req.query.email;
    if (!email) return res.json({ projects: [], settings: {} });
    
    res.json({
        projects: db.projects[email] || [],
        settings: db.settings[email] || {}
    });
});

// 6. DATA: Save User Data
app.post('/api/user/data', (req, res) => {
    const { email, projects, settings } = req.body;
    if (!email) return res.status(400).json({ error: "No email" });
    
    if (projects) db.projects[email] = projects;
    if (settings) db.settings[email] = settings;
    
    saveDB();
    res.json({ success: true });
});

// Serve HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Raw View Route
app.get('/raw/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
    console.log(`Server running at port ${port}`);
});
