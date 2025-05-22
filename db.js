import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.db,
    ssl: { rejectUnauthorized: false }
});

export default pool;