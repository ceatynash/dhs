const express = require('express');
const { Server } = require('socket.io');
const crypto = require('crypto');
const http = require('http');
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
// Serve only the explicit routes below; never expose JSON ledgers or server source as static files.

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
let systemSponsors = ["Daramombe Old Students Association (DOSA)"]; 
let systemAnnouncements = [
    { id: 1, sender: "Headmaster Office", text: "Welcome to the Daramombe High School Portal.", date: "2026-06-15" }
];

// LIVE TRACKER STORAGE: Maps socket IDs to active DOSA session nodes
let activeDosaSessions = {}; 

// System Constants & Hardcoded Access Frameworks
const DEVELOPER_EMAIL = (process.env.DEVELOPER_EMAIL || '').toLowerCase().trim();
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();

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

function emitStudentLedger(records) {
    for (const client of io.sockets.sockets.values()) {
        const user = client.sessionUser;
        if (!user) continue;
        if (user.role === 'Parent') {
            client.emit('ledger_sync_update', records.filter(s => (s.parentEmail || '').toLowerCase() === user.email));
        } else if (user.role !== 'DOSA') {
            client.emit('ledger_sync_update', records);
        }
    }
}

// HTTP Core REST API Routers
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/students', requireAuth, (req, res) => {
    const records = readDatabase();
    if (req.sessionUser.role === 'Parent') {
        return res.json(records.filter(student =>
            (student.parentEmail || '').toLowerCase().trim() === req.sessionUser.email
        ));
    }
    if (req.sessionUser.role === 'DOSA' || ['Teacher', 'Head/Deputy', 'Developer'].includes(req.sessionUser.role)) return res.json(records);
    return res.status(403).json({ success: false, message: 'Student records access denied.' });
});
app.get('/api/staff', requireAuth, requireDeveloper, (req, res) => res.json(readStaffDatabase()));

// Build a small dependency-free PDF invoice. Fee amounts are only shown when entered
// in the student's invoice.items or fees records; the server never invents charges.
function pdfSafeText(value) {
    return String(value == null ? '' : value)
        .normalize('NFKD')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/[()\\\\]/g, '\\\\app.get('/api/staff', requireAuth, requireDeveloper, (req, res) => res.json(readStaffDatabase()));')
        .slice(0, 150);
}

function createInvoicePdf(lines) {
    const commands = [
        'BT',
        '/F1 18 Tf',
        '50 790 Td',
        '(' + pdfSafeText(lines[0] || 'Daramombe High School Invoice') + ') Tj',
        '/F1 10 Tf',
        ...lines.slice(1).flatMap(line => ['0 -22 Td', '(' + pdfSafeText(line) + ') Tj']),
        'ET'
    ].join('\n');
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        '<< /Length ' + Buffer.byteLength(commands, 'binary') + ' >>\nstream\n' + commands + '\nendstream'
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let i = 0; i < objects.length; i++) {
        offsets.push(Buffer.byteLength(pdf, 'binary'));
        pdf += (i + 1) + ' 0 obj\n' + objects[i] + '\nendobj\n';
    }
    const xrefOffset = Buffer.byteLength(pdf, 'binary');
    pdf += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    pdf += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
    return Buffer.from(pdf, 'binary');
}

app.get('/api/parent/students/:studentId/invoice.pdf', requireAuth, (req, res) => {
    // Invoices are strictly parent-only and scoped to a child linked to the signed-in email.
    if (req.sessionUser.role !== 'Parent') {
        return res.status(403).json({ success: false, message: 'Parent access is required to download a child invoice.' });
    }
    const student = readDatabase().find(item =>
        String(item.id) === String(req.params.studentId) &&
        (item.parentEmail || '').toLowerCase().trim() === req.sessionUser.email
    );
    if (!student) return res.status(404).json({ success: false, message: 'The linked student record was not found.' });

    const invoice = student.invoice && typeof student.invoice === 'object' ? student.invoice : {};
    const rawItems = Array.isArray(invoice.items) ? invoice.items : (Array.isArray(student.fees) ? student.fees : []);
    const items = rawItems.map(item => ({
        description: String(item && (item.description || item.name) || 'School fee').slice(0, 120),
        amount: Number(item && item.amount)
    })).filter(item => Number.isFinite(item.amount) && item.amount >= 0);
    const currency = String(invoice.currency || student.feeCurrency || 'USD').slice(0, 8);
    const amountPaidValue = Number(invoice.amountPaid ?? student.amountPaid ?? 0);
    const amountPaid = Number.isFinite(amountPaidValue) && amountPaidValue >= 0 ? amountPaidValue : 0;
    const explicitTotal = Number(invoice.totalAmount);
    const total = Number.isFinite(explicitTotal) && explicitTotal >= 0
        ? explicitTotal
        : items.reduce((sum, item) => sum + item.amount, 0);
    const hasFinancialData = items.length > 0 || (Number.isFinite(explicitTotal) && explicitTotal >= 0);
    const balanceValue = Number(invoice.balanceDue);
    const balance = Number.isFinite(balanceValue) && balanceValue >= 0
        ? balanceValue
        : Math.max(0, total - amountPaid);
    const issued = new Date().toISOString().slice(0, 10);
    const reference = invoice.invoiceNumber || ('DHS-' + String(student.schoolId || student.id) + '-' + issued.replace(/-/g, ''));
    const lines = [
        'DARAMOMBE HIGH SCHOOL',
        'PARENT FEE INVOICE',
        'Invoice reference: ' + reference,
        'Issue date: ' + issued,
        'Student: ' + (student.name || 'Not recorded'),
        'School ID: ' + (student.schoolId || 'Not recorded'),
        'Class: ' + (student.class || 'Not recorded'),
        'Parent account: ' + req.sessionUser.email,
        '-----------------------------------------------'
    ];
    if (items.length) {
        items.slice(0, 18).forEach(item => lines.push(item.description + ' - ' + currency + ' ' + item.amount.toFixed(2)));
    } else {
        lines.push('No itemised fee schedule has been entered for this student.');
    }
    lines.push('-----------------------------------------------');
    if (hasFinancialData) {
        lines.push('Total fees: ' + currency + ' ' + total.toFixed(2));
        lines.push('Amount paid: ' + currency + ' ' + amountPaid.toFixed(2));
        lines.push('Balance due: ' + currency + ' ' + balance.toFixed(2));
    } else {
        lines.push('Total fees: Not configured');
        lines.push('Balance due: Not available - confirm with the school finance office.');
    }
    lines.push('This document reflects the fee data currently recorded by the school.');
    if (!hasFinancialData) lines.push('It is not a statement of an assessed amount payable.');
    const pdf = createInvoicePdf(lines);
    const safeName = String(student.schoolId || student.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="DHS-Invoice-' + safeName + '.pdf"',
        'Cache-Control': 'no-store'
    });
    return res.send(pdf);
});

app.get('/api/messages', requireAuth, (req, res) => res.json(systemAnnouncements));
app.get('/api/sponsors', requireAuth, (req, res) => res.json(systemSponsors));

// Endpoint for Developer dashboard initialization panel to populate active DOSA metrics on page mount
app.get('/api/developer/tracked-dosa', requireAuth, requireDeveloper, (req, res) => {
    res.json(Object.values(activeDosaSessions));
});

// Google Sign-In authentication. The server verifies the Google ID token and derives role only from server-side allowlists.
app.get('/api/auth/config', (_req, res) => {
    if (!GOOGLE_CLIENT_ID) return res.status(503).json({ success: false, message: 'Google Sign-In is not configured on this server.' });
    res.set('Cache-Control', 'no-store');
    res.json({ clientId: GOOGLE_CLIENT_ID });
});

async function verifyGoogleIdToken(idToken) {
    if (!GOOGLE_CLIENT_ID) throw new Error('Google Sign-In is not configured.');
    if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 10000) throw new Error('Missing or invalid Google credential.');
    const response = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), {
        headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Google rejected this sign-in token.');
    const claims = await response.json();
    const issuerOk = claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com';
    if (!issuerOk || claims.aud !== GOOGLE_CLIENT_ID || Number(claims.exp) * 1000 <= Date.now() ||
        !(claims.email_verified === true || claims.email_verified === 'true') || !claims.email) {
        throw new Error('Google account verification failed. Please sign in again.');
    }
    return { email: claims.email.toLowerCase().trim() };
}

app.post('/api/auth/google', async (req, res) => {
    try {
        const { credential, role } = req.body || {};
        if (!['Developer', 'Teacher', 'Head/Deputy', 'Parent', 'DOSA'].includes(role)) {
            return res.status(400).json({ success: false, message: 'Choose a valid portal role.' });
        }
        const identity = await verifyGoogleIdToken(credential);
        const cleanEmail = identity.email;
        let dosaName = '';

        if (role === 'Developer') {
            if (!DEVELOPER_EMAIL || cleanEmail !== DEVELOPER_EMAIL) {
                return res.status(403).json({ success: false, message: 'This Google account is not the configured portal developer.' });
            }
        } else if (role === 'Teacher' || role === 'Head/Deputy') {
            const staff = readStaffDatabase().find(item =>
                (item.email || '').toLowerCase().trim() === cleanEmail && item.role === role
            );
            if (!staff) return res.status(403).json({ success: false, message: 'This Google account is not registered for the selected staff role.' });
        } else if (role === 'Parent') {
            const linked = readDatabase().some(student =>
                (student.parentEmail || '').toLowerCase().trim() === cleanEmail
            );
            if (!linked) return res.status(403).json({ success: false, message: 'No student record is linked to this Google account.' });
        } else if (role === 'DOSA') {
            let members = [];
            try { members = JSON.parse(fs.readFileSync(DOSA_FILE, 'utf8')); } catch (_) {}
            const member = members.find(item => (item.email || '').toLowerCase().trim() === cleanEmail);
            if (!member) return res.status(403).json({ success: false, message: 'This Google account is not registered for DOSA access.' });
            dosaName = member.name || member.dosaName || 'Daramombe Old Students Association (DOSA)';
        }

        const sessionToken = createSession(cleanEmail, role, dosaName);
        res.set('Cache-Control', 'no-store');
        return res.json({ success: true, email: cleanEmail, role, dosaName, token: sessionToken });
    } catch (err) {
        console.error('Google Sign-In verification failed:', err.message);
        return res.status(401).json({ success: false, message: err.message || 'Google Sign-In failed. Please try again.' });
    }
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
    emitStudentLedger(records); // Send only records this authenticated role is allowed to see
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
            emitStudentLedger(ledger); // Push role-filtered updates to connected clients
        }
    });

    // Developer Purge Handlers
    socket.on('developer_remove_student', (id) => {
        if (socket.sessionUser.role !== 'Developer') return;
        let ledger = readDatabase();
        let targetStudent = ledger.find(s => s.id === id);
        ledger = ledger.filter(s => s.id !== id);
        writeDatabase(ledger);
        
        emitStudentLedger(ledger);
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
    console.log(`  DARAMOMBE HIGH SCHOOL PORTAL INITIALIZED ON PORT [${PORT}]`);
    console.log(`  Running Architecture Profile Mode 2026`);
    if (!SESSION_SECRET) console.warn('WARNING: SESSION_SECRET is unset. Configure a long random secret in the deployment environment.');
    console.log(`=======================================================`);
});