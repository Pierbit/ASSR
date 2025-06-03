import pool from './db.js';

export async function deleteBattle(){
    //await pool.query('DELETE FROM dailybattles WHERE id=(SELECT id FROM dailybattles ORDER BY id DESC LIMIT 1)');
    await pool.query('DELETE FROM dailybattles WHERE id=73');
}
export async function insertDailyBattleJson(collected) {
    await pool.query('INSERT INTO dailybattles (report) VALUES ($1)', [collected]);
}

export async function readDailyBattleJson() {
    const result = await pool.query('SELECT report FROM dailybattles ORDER BY id DESC LIMIT 1;');
    if (result.rows.length === 0) {
        return null;
    } else {
        return JSON.parse(result.rows[0].report);
    }
}

export async function readDailyBattleJsonApi(offset) {
    const result = await pool.query(`SELECT report FROM dailybattles ORDER BY id DESC OFFSET ${offset} LIMIT 1`);
    if (result.rows.length === 0) {
        return null;
    } else {
        return JSON.parse(result.rows[0].report);
    }
}

export async function readLast14DailyBattleJson() {
    const result = await pool.query('SELECT report FROM dailybattles ORDER BY id DESC LIMIT 14');
    return result.rows.map(row => JSON.parse(row.report));
}

export async function insertComprehensiveReport(report) {
    await pool.query('DELETE FROM comprehensivereport');
    await pool.query('INSERT INTO comprehensivereport (creport) VALUES ($1)', [report]);
}

export async function readComprehensiveReport() {
    const result = await pool.query('SELECT creport FROM comprehensivereport ORDER BY id DESC LIMIT 1;');
    return JSON.parse(result.rows[0].creport);
}
