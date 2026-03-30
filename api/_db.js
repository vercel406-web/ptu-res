const provider = (process.env.DB_PROVIDER || process.env.DATABASE_PROVIDER || 'postgres').toLowerCase();

let pgPool;
let mysqlPool;
let schemaReady = false;

function getPgPool() {
    if (!pgPool) {
        const { Pool } = require('pg');
        const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
        if (!connectionString) {
            throw new Error('POSTGRES_URL or DATABASE_URL is required for postgres provider');
        }
        pgPool = new Pool({
            connectionString,
            ssl: process.env.POSTGRES_SSL === 'false' ? false : { rejectUnauthorized: false }
        });
    }
    return pgPool;
}

function getMysqlPool() {
    if (!mysqlPool) {
        const mysql = require('mysql2/promise');
        const connectionUri = process.env.MYSQL_URL;
        if (!connectionUri) {
            throw new Error('MYSQL_URL is required for mysql provider');
        }
        mysqlPool = mysql.createPool(connectionUri);
    }
    return mysqlPool;
}

function normalizeRow(row) {
    if (!row) return null;
    return {
        rollNumber: row.roll_number,
        studentName: row.student_name,
        course: row.course_name,
        semester: row.semester,
        session: row.exam_session,
        resultStatus: row.result_status,
        marks: row.marks_json,
        pdfUrl: row.pdf_url,
        updatedAt: row.updated_at
    };
}

async function ensureSchema() {
    if (schemaReady) return;
    if (provider === 'mysql') {
        const pool = getMysqlPool();
        await pool.query(`
            CREATE TABLE IF NOT EXISTS student_results (
                roll_number VARCHAR(100) PRIMARY KEY,
                student_name VARCHAR(255) NOT NULL,
                course_name VARCHAR(255),
                semester VARCHAR(100),
                exam_session VARCHAR(100) NOT NULL,
                result_status VARCHAR(100),
                marks_json TEXT,
                pdf_url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
    } else {
        const pool = getPgPool();
        await pool.query(`
            CREATE TABLE IF NOT EXISTS student_results (
                roll_number VARCHAR(100) PRIMARY KEY,
                student_name VARCHAR(255) NOT NULL,
                course_name VARCHAR(255),
                semester VARCHAR(100),
                exam_session VARCHAR(100) NOT NULL,
                result_status VARCHAR(100),
                marks_json TEXT,
                pdf_url TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);
    }
    schemaReady = true;
}

async function upsertResult(data) {
    const rollNumber = String(data.rollNumber || '').trim();
    const studentName = String(data.studentName || '').trim();
    const examSession = String(data.session || '').trim();
    const pdfUrl = String(data.pdfUrl || '').trim();
    const courseName = String(data.course || '').trim();
    const semester = String(data.semester || '').trim();
    const resultStatus = String(data.resultStatus || '').trim();
    const marksJson = String(data.marks || '').trim();

    if (!rollNumber || !studentName || !examSession || !pdfUrl) {
        throw new Error('rollNumber, studentName, session and pdfUrl are required');
    }

    await ensureSchema();

    if (provider === 'mysql') {
        const pool = getMysqlPool();
        await pool.query(
            `INSERT INTO student_results
            (roll_number, student_name, course_name, semester, exam_session, result_status, marks_json, pdf_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                student_name = VALUES(student_name),
                course_name = VALUES(course_name),
                semester = VALUES(semester),
                exam_session = VALUES(exam_session),
                result_status = VALUES(result_status),
                marks_json = VALUES(marks_json),
                pdf_url = VALUES(pdf_url)`,
            [rollNumber, studentName, courseName, semester, examSession, resultStatus, marksJson, pdfUrl]
        );
    } else {
        const pool = getPgPool();
        await pool.query(
            `INSERT INTO student_results
            (roll_number, student_name, course_name, semester, exam_session, result_status, marks_json, pdf_url, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (roll_number) DO UPDATE SET
                student_name = EXCLUDED.student_name,
                course_name = EXCLUDED.course_name,
                semester = EXCLUDED.semester,
                exam_session = EXCLUDED.exam_session,
                result_status = EXCLUDED.result_status,
                marks_json = EXCLUDED.marks_json,
                pdf_url = EXCLUDED.pdf_url,
                updated_at = NOW()`,
            [rollNumber, studentName, courseName, semester, examSession, resultStatus, marksJson, pdfUrl]
        );
    }
}

async function getResultByRollNumber(rollNumber, year) {
    const key = String(rollNumber || '').trim();
    const yearValue = String(year || '').trim();
    if (!key) {
        throw new Error('rollNumber is required');
    }

    await ensureSchema();

    if (provider === 'mysql') {
        const pool = getMysqlPool();
        let rows;
        if (yearValue) {
            [rows] = await pool.query(
                `SELECT roll_number, student_name, course_name, semester, exam_session, result_status, marks_json, pdf_url, updated_at
                 FROM student_results
                 WHERE roll_number = ? AND exam_session = ?
                 LIMIT 1`,
                [key, yearValue]
            );
        } else {
            [rows] = await pool.query(
                `SELECT roll_number, student_name, course_name, semester, exam_session, result_status, marks_json, pdf_url, updated_at
                 FROM student_results
                 WHERE roll_number = ?
                 LIMIT 1`,
                [key]
            );
        }
        return normalizeRow(rows[0]);
    }

    const pool = getPgPool();
    let result;
    if (yearValue) {
        result = await pool.query(
            `SELECT roll_number, student_name, course_name, semester, exam_session, result_status, marks_json, pdf_url, updated_at
             FROM student_results
             WHERE roll_number = $1 AND exam_session = $2
             LIMIT 1`,
            [key, yearValue]
        );
    } else {
        result = await pool.query(
            `SELECT roll_number, student_name, course_name, semester, exam_session, result_status, marks_json, pdf_url, updated_at
             FROM student_results
             WHERE roll_number = $1
             LIMIT 1`,
            [key]
        );
    }
    return normalizeRow(result.rows[0]);
}

module.exports = {
    provider,
    ensureSchema,
    upsertResult,
    getResultByRollNumber
};
