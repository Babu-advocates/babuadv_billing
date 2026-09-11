const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const migrateExistingBills = require('./utils/migrateBills');

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
const banksRouter = require('./routes/banks');
const billingRouter = require('./routes/billing');
const libraryRouter = require('./routes/library');

app.use('/api/banks', banksRouter);
app.use('/api/billing', billingRouter);
app.use('/api/library', libraryRouter);

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
