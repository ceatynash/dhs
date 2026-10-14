const express = require('express');
const { Server } = require('socket.io');
const crypto = require('crypto');
const http = require('http');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: process.env.ALLOWED_ORIGIN || true }
});

app.use(express.json({ limit: '32kb' }));

// Serve static assets out of the root or a public folder
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'students.json');
const STAFF_FILE = path.join(__dirname, 'staff.json');
const DOSA_FILE = path.join(__dirname, 'dosa_members.json');
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const sessions = new Map();

function createSession(email, role, dosaName) {
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { email, role, dosaName, expires: Date.now() + 8 * 60 * 60 * 1000 });
    return token;
}
function getSession(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer\\s+/i, '') || req.headers['x-session-token'];
    const session = token && sessions.get(token);
    if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; }
    return session;
}
function requireAuth(req, res, next) {
    const session = getSession(req);
    if (!session) return res.status(401).json({ success: false, message: 'Please sign in again.' });
    req.sessionUser = session; next();
}
function requireDeveloper(req, res, next) {
    if (!req.sessionUser || req.sessionUser.role !== 'Developer') return res.status(403).json({ success: false, message: 'Developer access required.' });
    next();
}

// Memory storage blocks
const verificationCodes = new Map();
let systemSponsors = ["Daramombe Old Students Association (DOSA)"]; 
let systemAnnouncements = [
    { id: 1, sender: "Headmaster Office", text: "Welcome to the real-time DASAP Network Engine environment.", date: "2026-06-15" }
];

// LIVE TRACKER STORAGE: Maps socket IDs to active DOSA session nodes
let activeDosaSessions = {}; 

// System Constants & Hardcoded Access Frameworks
const DEVELOPER_EMAIL = (process.env.DEVELOPER_EMAIL || '').toLowerCase().trim();
const GMAIL_USER = process.env.GMAIL_USER || '';
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD || '';
const transporter = (GMAIL_USER && GMAIL_PASS) ? nodemailer.createTransport({
    service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_PASS }
}) : null;

// Database Operations
const readDatabase = () => {
    if (!fs.existsSync(DB_FILE)) {
        // Generate mock seed student data if file doesn't exist
        const initialStudents = [
            { id: 1, name: "Tinashe Moyo", schoolId: "DHS-2026-001", class: "Form 6", parentPhone: "+263771111111", parentEmail: "parent1@gmail.com", marks: { "Mathematics": 85, "English Literature": 74, "History": 91 } },
            { id: 2, name: "Chipo Chivhu", schoolId: "DHS-2026-002", class: "Form 4", parentPhone: "+263772222222", parentEmail: "parent2@gmail.com", marks: { "Mathematics": 62, "English Language": 78, "Geography": 70 } }
        ];
        fs.writeFileSync(DB_FILE, JSON.stringify(initialStudents, null, 2), 'utf8');
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
};

const writeDatabase = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');

const readStaffDatabase = () => {
    if (!fs.existsSync(STAFF_FILE)) {
        // Pre-seed database with a default authorized staff member
        const initialStaff = [
            { id: 1, name: "Principal Administrator", email: "admin@daramombe.ac.zw", role: "Head/Deputy" }
        ];
        fs.writeFileSync(STAFF_FILE, JSON.stringify(initialStaff, null, 2), 'utf8');
    }
    return JSON.parse(fs.readFileSync(STAFF_FILE, 'utf8'));
};

const writeStaffDatabase = (data) => fs.writeFileSync(STAFF_FILE, JSON.stringify(data, null, 2), 'utf8');

// HTTP Core REST API Routers
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/students', (req, res) => res.json(readDatabase()));
app.get('/api/staff', (req, res) => res.json(readStaffDatabase()));
app.get('/api/messages', (req, res) => res.json(systemAnnouncements));
app.get('/api/sponsors', (req, res) => res.json(systemSponsors));

// Endpoint for Developer dashboard initialization panel to populate active DOSA metrics on page mount
app.get('/api/developer/tracked-dosa', requireAuth, requireDeveloper, (req, res) => {
    res.json(Object.values(activeDosaSessions));
});

// Authentication and Security Pipeline Engine
app.post('/api/auth/request-code', async (req, res) => {
    const { email, role, dosaName } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Missing email parameter identifier." });

    const cleanEmail = email.toLowerCase().trim();

    // Verification Logic Rules Matrix
    if (!['Developer', 'Teacher', 'Head/Deputy', 'Parent', 'DOSA'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid account role.' });
    }
    if (role === 'Developer') {
        if (!DEVELOPER_EMAIL || cleanEmail !== DEVELOPER_EMAIL) {
            return res.status(403).json({ success: false, message: "Access Denied: Specified email violates core system administrator keys." });
        }
    } else if (role === 'Teacher' || role === 'Head/Deputy') {
        const staffList = readStaffDatabase();
        const verifiedStaff = staffList.find(s => s.email.toLowerCase() === cleanEmail && s.role === role);
        if (!verifiedStaff) {
            return res.status(401).json({ success: false, message: "Identity Matching Failure: This email address is not cleared inside standard staff ledgers." });
        }
    } else if (role === 'Parent') {
        const studentList = readDatabase();
        const verifiedParent = studentList.find(s => (s.parentEmail || '').toLowerCase() === cleanEmail);
        if (!verifiedParent) return res.status(401).json({ success: false, message: 'No student record is linked to this parent email.' });
    } else if (role === 'DOSA') {
        let members = [];
        try { members = JSON.parse(fs.readFileSync(DOSA_FILE, 'utf8')); } catch (_) {}
        if (!members.some(m => (m.email || '').toLowerCase() === cleanEmail)) return res.status(401).json({ success: false, message: 'This email is not registered for DOSA access.' });
    }

    // Generate a 6-Digit Cryptographic OTP Key
    if (!transporter) return res.status(503).json({ success: false, message: 'Email delivery is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD on the server.' });
    const secureToken = crypto.randomInt(100000, 1000000).toString();
    verificationCodes.set(cleanEmail, { code: secureToken, role, dosaName: dosaName || 'Alumni Member Unit', expires: Date.now() + 600000, attempts: 0 }); // 10 Min lifecycle

    // Build Email Template Parameters
    const emailTemplate = {
        from: `"DASAP System Core" <${GMAIL_USER}>`,
        to: email,
        subject: `[${secureToken}] Authentication Gateway Security Key Request`,
        html: `
            <div style="font-family: monospace; background-color: #020617; color: #f1f5f9; padding: 20px; border-radius: 8px;">
                <h2 style="color: #f59e0b; border-bottom: 1px solid #1e293b; padding-bottom: 10px;">DASAP SYSTEM CLEARANCE CHALLENGE</h2>
                <p>A verification request has mapped security routes to this handle for access permission as: <strong>${role}</strong>.</p>
                <div style="background-color: #0f172a; border: 1px solid #334155; padding: 15px; text-align: center; font-size: 24px; color: #34d399; tracking-letter: 4px; font-weight: bold; margin: 20px 0;">
                    ${secureToken}
                </div>
                <p style="color: #64748b; font-size: 11px;">Security Notice: This token expires exactly 10 minutes from issue generation timestamps. Do not share codes.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(emailTemplate);
        res.json({ success: true, message: `Access sequence mapped. A validation code has been sent over secure pipelines to ${email}.` });
    } catch (err) {
        console.error("Nodemailer routing exception thrown:", err);
        res.status(500).json({ success: false, message: "Outbound Mail Dispatch failure. Check transport system credentials configuration keys." });
    }
});

app.post('/api/auth/verify-code', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ success: false, message: "Verification tracking components dropped." });

    const cleanEmail = email.toLowerCase().trim();
    const activeMapping = verificationCodes.get(cleanEmail);

    if (!activeMapping) return res.status(400).json({ success: false, message: "No operational handshake sequence found for this parameter address." });
    if (activeMapping.code !== code.trim()) {
        activeMapping.attempts += 1;
        if (activeMapping.attempts >= 5) verificationCodes.delete(cleanEmail);
        return res.status(401).json({ success: false, message: 'Invalid code. Request a new code if attempts are exhausted.' });
    }
    if (Date.now() > activeMapping.expires) {
        verificationCodes.delete(cleanEmail);
        return res.status(401).json({ success: false, message: "Time-window lifecycle verification expired. Please renew loop tracking requests." });
    }

    // Success handshake mapping
    delete verificationCodes[cleanEmail];
    const sessionToken = createSession(cleanEmail, activeMapping.role, activeMapping.dosaName);
    res.json({ success: true, role: activeMapping.role, dosaName: activeMapping.dosaName, token: sessionToken });
});

// Developer Matrix Infrastructure Operations
app.post('/api/developer/add-student', requireAuth, requireDeveloper, (req, res) => {
    const { name, schoolId, formClass, parentPhone, parentEmail } = req.body;
    const records = readDatabase();
    
    const duplicate = records.find(s => s.schoolId.toLowerCase() === schoolId.toLowerCase().trim());
    if (duplicate) return res.status(400).json({ success: false, message: "Profile creation collision: ID matches established parameters." });

    const targetNode = {
        id: Date.now(),
        name,
        schoolId: schoolId.trim(),
        class: formClass,
        parentPhone,
        parentEmail,
        marks: { "Mathematics": 0, "English Language": 0, "Science": 0 }
    };

    records.push(targetNode);
    writeDatabase(records);
    io.emit('ledger_sync_update', records); // Live update up out standard socket maps
    res.json({ success: true, student: targetNode });
});

app.post('/api/developer/add-staff', requireAuth, requireDeveloper, (req, res) => {
    const { name, email, role } = req.body;
    const faculty = readStaffDatabase();

    const collisionCheck = faculty.find(f => f.email.toLowerCase() === email.toLowerCase().trim());
    if (collisionCheck) return res.status(400).json({ success: false, message: "Faculty records overlap error." });

    const targetStaff = { id: Date.now(), name, email: email.trim().toLowerCase(), role };
    faculty.push(targetStaff);
    writeStaffDatabase(faculty);
    io.emit('staff_sync_update', faculty);
    res.json({ success: true, staff: targetStaff });
});


// Real-Time Socket Interactivity Pipelines
io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const session = token && sessions.get(token);
    if (!session || session.expires < Date.now()) return next(new Error('Unauthorized'));
    socket.sessionUser = session;
    next();
});

io.on('connection', (socket) => {
    console.log(`Active node connected down terminal thread reference code ID: ${socket.id}`);

    // Track when active DOSA users connect
    socket.on('register_dosa_session', (payload) => {
        if (socket.sessionUser.role !== 'DOSA') return;
        activeDosaSessions[socket.id] = {
            socketId: socket.id,
            email: payload.email,
            dosaName: payload.dosaName || "Daramombe Alumni Association Node",
            loginTime: new Date().toLocaleTimeString()
        };
        io.emit('dosa_tracker_sync', Object.values(activeDosaSessions));
    });

    // Student Mark Modifying Transaction Block
    socket.on('update_student_marks', (payload) => {
        if (!['Teacher', 'Head/Deputy', 'Developer'].includes(socket.sessionUser.role)) return;
        const { id, marks } = payload;
        let ledger = readDatabase();
        let entityIndex = ledger.findIndex(s => s.id === id);

        if (entityIndex !== -1) {
            ledger[entityIndex].marks = marks;
            writeDatabase(ledger);
            io.emit('ledger_sync_update', ledger); // Push update to everyone instantly
        }
    });

    // Developer Purge Handlers
    socket.on('developer_remove_student', (id) => {
        if (socket.sessionUser.role !== 'Developer') return;
        let ledger = readDatabase();
        let targetStudent = ledger.find(s => s.id === id);
        ledger = ledger.filter(s => s.id !== id);
        writeDatabase(ledger);
        
        io.emit('ledger_sync_update', ledger);
        if (targetStudent) {
            io.emit('forced_disconnect_target', { type: 'Student', targetId: id });
        }
    });

    socket.on('developer_remove_staff', (id) => {
        if (socket.sessionUser.role !== 'Developer') return;
        let faculty = readStaffDatabase();
        let targetStaff = faculty.find(f => f.id === id);
        faculty = faculty.filter(f => f.id !== id);
        writeStaffDatabase(faculty);
        
        io.emit('staff_sync_update', faculty);
        if (targetStaff) {
            io.emit('forced_disconnect_target', { type: 'Staff', targetEmail: targetStaff.email });
        }
    });

    // Developer drops tracked live DOSA sockets
    socket.on('developer_disconnect_dosa', (targetSocketId) => {
        if (socket.sessionUser.role !== 'Developer') return;
        if (io.sockets.sockets.get(targetSocketId)) {
            io.to(targetSocketId).emit('forced_dosa_kick');
            io.sockets.sockets.get(targetSocketId).disconnect();
        }
        delete activeDosaSessions[targetSocketId];
        io.emit('dosa_tracker_sync', Object.values(activeDosaSessions));
    });

    // Messaging Engine Cluster
    socket.on('submit_broadcast', (msgPayload) => {
        if (!['Developer', 'Teacher', 'Head/Deputy'].includes(socket.sessionUser.role)) return;
        if (!msgPayload || typeof msgPayload.text !== 'string' || !msgPayload.text.trim() || msgPayload.text.length > 2000) return;
        const finalizedBroadcast = {
            id: Date.now(),
            sender: socket.sessionUser.role + ' (' + socket.sessionUser.email + ')',
            text: msgPayload.text,
            date: new Date().toISOString().split('T')[0]
        };
        systemAnnouncements.unshift(finalizedBroadcast); // Track newest entries up top
        if (systemAnnouncements.length > 50) systemAnnouncements.pop(); // Cap length footprint
        io.emit('broadcast_update', systemAnnouncements);
    });

    socket.on('disconnect', () => {
        if (activeDosaSessions[socket.id]) {
            delete activeDosaSessions[socket.id];
            io.emit('dosa_tracker_sync', Object.values(activeDosaSessions));
        }
        console.log(`Node mapping dropped pipeline channels for trace link: ${socket.id}`);
    });
});

server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  DASAP CORE WEB ENGINE INITIALIZED ON PORT [${PORT}]`);
    console.log(`  Running Architecture Profile Mode 2026`);
    if (!SESSION_SECRET) console.warn('WARNING: SESSION_SECRET is unset. Configure a long random secret in the deployment environment.');
    console.log(`=======================================================`);
});