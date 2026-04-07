const { getResultByRollNumber } = require('../_db');

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }

    try {
        const rollNumber = req.query?.rollNumber || req.query?.rollNo || '';
        const year = req.query?.year || req.query?.resultYear || '';
        const semester = req.query?.semester || '';
        const result = await getResultByRollNumber(rollNumber, year, semester);
        if (!result) {
            res.status(404).json({ ok: false, message: 'Result not found' });
            return;
        }
        res.status(200).json({ ok: true, result });
    } catch (error) {
        res.status(400).json({ ok: false, message: error.message || 'Unable to fetch result' });
    }
};
