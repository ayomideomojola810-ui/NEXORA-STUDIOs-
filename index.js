const express = require('express');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// Middleware check for API Security
const verifyApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.body.apiKey;
    if (process.env.GATEWAY_API_KEY && apiKey !== process.env.GATEWAY_API_KEY) {
        return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
    }
    next();
};

app.get('/', (req, res) => {
    res.send({ status: "online", message: "NEXORA STUDIOS WhatsApp Gateway Server Active" });
});

app.post('/api/pair', verifyApiKey, async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number is required" });

    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    const sessionDir = path.join(__dirname, 'sessions', `session_${cleanNumber}`);

    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' })
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log(`Reconnecting session for ${cleanNumber}...`);
                }
            } else if (connection === 'open') {
                console.log(`✅ Successfully connected WhatsApp for: ${cleanNumber}`);
            }
        });

        if (!sock.authState.creds.registered) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            const code = await sock.requestPairingCode(cleanNumber);
            return res.json({ success: true, pairingCode: code });
        } else {
            return res.json({ success: true, message: "Session already active and paired!" });
        }

    } catch (err) {
        console.error("Pairing Error:", err);
        res.status(500).json({ error: "Failed to generate pairing code from WhatsApp servers" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Nexora Gateway running on port ${PORT}`);
});
