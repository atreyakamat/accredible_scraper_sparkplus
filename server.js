const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./database');
const { discoverWallet, scrapeWalletCredentials } = require('./scraper');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// 1. Input Handler & Discovery
app.post('/api/discover', async (req, res) => {
    const { certUrl, userId } = req.body;

    if (!certUrl || !userId) {
        return res.status(400).json({ error: "Missing certUrl or userId" });
    }

    // Basic validation
    if (!certUrl.includes('credential.net') && !certUrl.includes('accredible.com')) {
        return res.status(400).json({ error: "Invalid domain. Must be credential.net or accredible.com" });
    }

    try {
        const walletUrl = await discoverWallet(certUrl);
        res.json({ success: true, walletUrl });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Confirm & Sync (Initial Import)
app.post('/api/sync', async (req, res) => {
    const { userId, walletUrl, autoSync } = req.body;

    if (!walletUrl || !userId) {
        return res.status(400).json({ error: "Missing walletUrl or userId" });
    }

    try {
        // 1. Save/Update Profile
        const stmt = db.prepare(`
            INSERT INTO external_profiles (user_id, wallet_url, auto_sync, last_synced_at, status)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'active')
            ON CONFLICT(user_id, wallet_url) DO UPDATE SET
            auto_sync = excluded.auto_sync,
            last_synced_at = CURRENT_TIMESTAMP,
            status = 'active'
        `);
        
        stmt.run(userId, walletUrl, autoSync ? 1 : 0);
        stmt.finalize();

        // 2. Scrape Credentials
        const credentials = await scrapeWalletCredentials(walletUrl);
        let newCount = 0;

        // 3. Store Credentials (Deduplicated)
        const credStmt = db.prepare(`
            INSERT INTO credentials (user_id, credential_uuid, issuer_domain, credential_url)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, credential_uuid) DO NOTHING
        `);

        credentials.forEach(cred => {
            credStmt.run(userId, cred.credential_uuid, cred.issuer_domain, cred.credential_url, function() {
                if (this.changes > 0) newCount++;
            });
        });
        credStmt.finalize();

        res.json({ 
            success: true, 
            message: "Sync complete", 
            totalFound: credentials.length,
            newImported: newCount,
            credentials 
        });

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. Get User Credentials
app.get('/api/credentials/:userId', (req, res) => {
    const { userId } = req.params;
    db.all("SELECT * FROM credentials WHERE user_id = ?", [userId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 4. Get User Profile Settings
app.get('/api/profile/:userId', (req, res) => {
    const { userId } = req.params;
    db.get("SELECT * FROM external_profiles WHERE user_id = ?", [userId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

// 5. Toggle Auto-Sync
app.post('/api/toggle-sync', (req, res) => {
    const { userId, enable } = req.body;
    db.run("UPDATE external_profiles SET auto_sync = ? WHERE user_id = ?", [enable ? 1 : 0, userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// 6. One-Shot Import (New: Discover + Scrape immediately)
app.post('/api/full-import', async (req, res) => {
    const { certUrl, userId } = req.body;

    if (!certUrl || !userId) {
        return res.status(400).json({ error: "Missing certUrl or userId" });
    }

    try {
        // 1. Discover Wallet
        const walletUrl = await discoverWallet(certUrl);
        
        // 2. Save Profile (Defaulting auto_sync to 0 for this quick-view mode)
        const stmt = db.prepare(`
            INSERT INTO external_profiles (user_id, wallet_url, auto_sync, last_synced_at, status)
            VALUES (?, ?, 0, CURRENT_TIMESTAMP, 'active')
            ON CONFLICT(user_id, wallet_url) DO UPDATE SET
            last_synced_at = CURRENT_TIMESTAMP,
            status = 'active'
        `);
        stmt.run(userId, walletUrl);
        stmt.finalize();

        // 3. Scrape Credentials
        const credentials = await scrapeWalletCredentials(walletUrl);
        
        // 4. Store Credentials
        const credStmt = db.prepare(`
            INSERT INTO credentials (user_id, credential_uuid, issuer_domain, credential_url)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, credential_uuid) DO NOTHING
        `);

        credentials.forEach(cred => {
            credStmt.run(userId, cred.credential_uuid, cred.issuer_domain, cred.credential_url);
        });
        credStmt.finalize();

        res.json({ 
            success: true, 
            walletUrl,
            credentials 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
