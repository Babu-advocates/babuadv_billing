require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { Pool } = require('pg');

// Required: pg v9+ treats sslmode=require as verify-full, ignoring rejectUnauthorized in pool config.
// For a known self-hosted PostgreSQL server, bypass cert verification at the process level.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
        // Needed for pg v9+ which treats sslmode=require as verify-full
        checkServerIdentity: () => undefined
    },
    min: 2,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err);
});

/**
 * Execute a single query.
 * @param {string} text - SQL query string with $1, $2 placeholders
 * @param {Array} params - Parameterized values
 */
async function query(text, params) {
    const start = Date.now();
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
        console.log('SQL:', { text: text.slice(0, 80), duration, rows: res.rowCount });
    }
    return res;
}

/**
 * Get a raw client for transaction control (BEGIN / COMMIT / ROLLBACK).
 */
async function getClient() {
    const client = await pool.connect();
    const release = client.release.bind(client);
    // Ensure the client is always released back to the pool
    const timeout = setTimeout(() => {
        console.error('Potential client pool leak: client held > 10 seconds');
        client.release();
    }, 10000);
    client.release = () => {
        clearTimeout(timeout);
        release();
    };
    return client;
}

module.exports = { query, getClient, pool };
