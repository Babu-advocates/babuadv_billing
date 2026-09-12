require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const migrateExistingBills = require('./utils/migrateBills');

// Warm up PostgreSQL connection pool
require('./db').pool.connect()
    .then(client => { console.log('PostgreSQL pool connected.'); client.release(); })
    .catch(err => console.error('PostgreSQL pool connection error:', err));

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Static folders for uploads and generated bills
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
const generatedDir = path.join(__dirname, 'generated_bills');
if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir);

// Run migration for existing flat files into Bank/Month folders
migrateExistingBills();

app.use('/uploads', express.static(uploadsDir));
app.use('/api/download', express.static(generatedDir));

// Routes
const { router: authRouter } = require('./routes/auth');
const banksRouter = require('./routes/banks');
const billingRouter = require('./routes/billing');
const libraryRouter = require('./routes/library');

app.use('/api/auth', authRouter);
app.use('/api/banks', banksRouter);
app.use('/api/billing', billingRouter);
app.use('/api/library', libraryRouter);

// Centralized error handler for Multer upload errors & API failures
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.name === 'MulterError') {
        console.error('Multer file upload error:', err);
        return res.status(400).json({ error: `File upload error: ${err.message}` });
    }
    if (err) {
        console.error('Unhandled server error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
    next();
});

// Health check endpoint for Docker / Coolify
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Serve frontend build if public directory exists (production mode)
const clientDist = path.join(__dirname, 'public');
if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
            return res.status(404).json({ error: 'Endpoint not found' });
        }
        res.sendFile(path.join(clientDist, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.send('Lawyer Billing System API is running');
    });
}


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
