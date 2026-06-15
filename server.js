const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.json());

// Serve static assets out of the root or a public folder
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'students.json');
const STAFF_FILE = path.join(__dirname, 'staff.json');

// Memory storage blocks
const verificationCodes = {};
let systemSponsors = ["Daramombe Old Students Association (DOSA)"]; 
let systemAnnouncements = [
    { id: 1, sender: "Headmaster Office", text: "Welcome to the real-time DASAP Network Engine environment.", date: "2026-06-15" }
];

// LIVE TRACKER STORAGE: Maps socket IDs to active DOSA session nodes
let activeDosaSessions = {}; 

// System Constants & Hardcoded Access Frameworks
const DEVELOPER_EMAIL = "ceatynash@gmail.com"; 
const GMAIL_USER = 'ceatynash@gmail.com'; 
const GMAIL_PASS = 'saywifmdjnkmnnns'; 

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
});

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
app.get('/api/developer/tracked-dosa', (req, res) => {
    res.json(Object.values(activeDosaSessions));
});

// Authentication and Security Pipeline Engine
app.post('/api/auth/request-code', async (req, res) => {
    const { email, role, dosaName } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Missing email parameter identifier." });

    const cleanEmail = email.toLowerCase().trim();

    // Verification Logic Rules Matrix
    if (role === 'Developer') {
        if (cleanEmail !== DEVELOPER_EMAIL) {
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
        const verifiedParent = studentList.find(s => s.parentEmail.toLowerCase() === cleanEmail);
        if (!verifiedParent) {
            return res.status(401).json({ success: false, message: "Authentication Dropped: No child records associated with this parent channel link." });
        }
    }

    // Generate a 6-Digit Cryptographic OTP Key
    const secureToken = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes[cleanEmail] = { code: secureToken, role, dosaName: dosaName || 'Alumni Member Unit', expires: Date.now() + 600000 }; // 10 Min lifecycle

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
    const activeMapping = verificationCodes[cleanEmail];

    if (!activeMapping) return res.status(400).json({ success: false, message: "No operational handshake sequence found for this parameter address." });
    if (activeMapping.code !== code.trim()) return res.status(401).json({ success: false, message: "Security Integrity Failure: Invalid authorization code matching parameter keys." });
    if (Date.now() > activeMapping.expires) {
        delete verificationCodes[cleanEmail];
        return res.status(401).json({ success: false, message: "Time-window lifecycle verification expired. Please renew loop tracking requests." });
    }

    // Success handshake mapping
    delete verificationCodes[cleanEmail];
    res.json({ success: true, role: activeMapping.role, dosaName: activeMapping.dosaName });
});

// Developer Matrix Infrastructure Operations
app.post('/api/developer/add-student', (req, res) => {
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

app.post('/api/developer/add-staff', (req, res) => {
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
io.on('connection', (socket) => {
    console.log(`Active node connected down terminal thread reference code ID: ${socket.id}`);

    // Track when active DOSA users connect
    socket.on('register_dosa_session', (payload) => {
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
        if (io.sockets.sockets.get(targetSocketId)) {
            io.to(targetSocketId).emit('forced_dosa_kick');
            io.sockets.sockets.get(targetSocketId).disconnect();
        }
        delete activeDosaSessions[targetSocketId];
        io.emit('dosa_tracker_sync', Object.values(activeDosaSessions));
    });

    // Messaging Engine Cluster
    socket.on('submit_broadcast', (msgPayload) => {
        const finalizedBroadcast = {
            id: Date.now(),
            sender: msgPayload.sender,
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
    console.log(`=======================================================`);
});