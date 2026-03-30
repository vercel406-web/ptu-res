module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Method not allowed' });
        return;
    }

    const { username, password } = req.body || {};
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (username === adminUsername && password === adminPassword) {
        res.status(200).json({ ok: true });
        return;
    }

    res.status(401).json({ ok: false, message: 'Invalid credentials' });
};
