import pool from './db.js';

export async function insertDailyBattleJson(collected) {
    await pool.query('DELETE FROM dailybattlesreal');
    await pool.query('INSERT INTO dailybattlesreal (report) VALUES ($1)', [collected]);
}

export async function readDailyBattleJson() {
    const result = await pool.query('SELECT report FROM dailybattlesreal ORDER BY id DESC LIMIT 1;');
    return result.rows[0].report;
}

export async function readLast14DailyBattleJson() {
    const result = await pool.query('SELECT report FROM dailybattlesreal ORDER BY id DESC LIMIT 14;');
    return result.rows;
}

export async function insertComprehensiveReport(report) {
    await pool.query('DELETE FROM comprehensivereportreal');
    await pool.query('INSERT INTO comprehensivereportreal (creport) VALUES ($1)', [report]);
}

export async function readComprehensiveReport() {
    const result = await pool.query('SELECT creport FROM comprehensivereportreal ORDER BY id DESC LIMIT 1;');
    return result.rows[0].creport;
}
