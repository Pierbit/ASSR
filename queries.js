import pool from './db.js';

async function insertDailyBattleJson(collected) {
    await pool.query('INSERT INTO dailybattlesreal (report) VALUES ($1)', [collected]);
}

async function readDailyBattleJson() {
    const result = await pool.query('SELECT report FROM dailybattlesreal ORDER BY id DESC LIMIT 1;');
    return result.rows[0].report;
}

async function readLast14DailyBattleJson() {
    const result = await pool.query('SELECT report FROM dailybattlesreal ORDER BY id DESC LIMIT 14;');
    return result.rows;
}

async function insertComprehensiveReport(report) {
    await pool.query('DELETE FROM comprehensivereportreal');
    await pool.query('INSERT INTO comprehensivereportreal (creport) VALUES ($1)', [report]);
}

async function readComprehensiveReport() {
    const result = await pool.query('SELECT creport FROM comprehensivereportreal ORDER BY id DESC LIMIT 1;');
    return result.rows[0].creport;
}

module.exports = {
    insertDailyBattleJson,
    readDailyBattleJson,
    readLast14DailyBattleJson,
    insertComprehensiveReport,
    readComprehensiveReport
};