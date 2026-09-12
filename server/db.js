require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { Pool } = require('pg');

let dbUrl = process.env.DATABASE_URL;
if (dbUrl && dbUrl.includes('sslmode=require') && !dbUrl.includes('uselibpqcompat=')) {
    dbUrl = dbUrl.includes('?')
        ? dbUrl.replace('sslmode=require', 'uselibpqcompat=true&sslmode=require')
        : dbUrl + '?uselibpqcompat=true&sslmode=require';
}

const pool = new Pool({
    connectionString: dbUrl,
    ssl: {
        rejectUnauthorized: false,
        checkServerIdentity: () => undefined
    },
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    min: 0,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
    // When an idle pooled client is closed by a remote host or firewall NAT,
    // pg-pool discards it and reconnects on next query. Log as warning.
    if (err.message && err.message.includes('Connection terminated unexpectedly')) {
        console.warn('PostgreSQL idle connection closed by remote host; discarded from pool.');
    } else {
        console.error('Unexpected PostgreSQL pool error:', err);
    }
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
