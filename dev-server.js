const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
require('dotenv').config();

const rootDir = __dirname;
const port = Number(process.env.PORT || 3000);

const apiRoutes = {
    '/api/admin/login': require('./api/admin/login'),
    '/api/results/get': require('./api/results/get'),
    '/api/results/upsert': require('./api/results/upsert')
};

const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
    const data = JSON.stringify(payload);
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(data);
}

function createApiResponse(res) {
    return {
        status(code) {
            res.statusCode = code;
            return this;
        },
        setHeader(name, value) {
            res.setHeader(name, value);
            return this;
        },
        json(payload) {
            if (!res.getHeader('Content-Type')) {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
            }
            res.end(JSON.stringify(payload));
        },
        send(payload) {
            res.end(payload);
        }
    };
}

function resolveStaticPath(urlPathname) {
    const safePath = path.normalize(urlPathname).replace(/^(\.\.(\/|\\|$))+/, '');
    let filePath = path.join(rootDir, safePath);
    if (urlPathname === '/' || urlPathname === '') {
        filePath = path.join(rootDir, 'index.html');
        return filePath;
    }
    if (!path.extname(filePath)) {
        filePath = path.join(filePath, 'index.html');
    }
    return filePath;
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}

async function handleApi(req, res, parsedUrl) {
    const handler = apiRoutes[parsedUrl.pathname];
    if (!handler) {
        sendJson(res, 404, { ok: false, message: 'API route not found' });
        return;
    }

    try {
        const reqLike = {
            method: req.method,
            headers: req.headers,
            query: Object.fromEntries(parsedUrl.searchParams.entries()),
            body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {}
        };
        const resLike = createApiResponse(res);
        await handler(reqLike, resLike);
    } catch (error) {
        sendJson(res, 400, { ok: false, message: error.message || 'Request failed' });
    }
}

function handleStatic(res, filePath) {
    if (!filePath.startsWith(rootDir)) {
        res.statusCode = 403;
        res.end('Forbidden');
        return;
    }
    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.statusCode = 404;
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
        res.end(content);
    });
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (parsedUrl.pathname.startsWith('/api/')) {
        await handleApi(req, res, parsedUrl);
        return;
    }

    if (!['GET', 'HEAD'].includes(req.method)) {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
    }

    const filePath = resolveStaticPath(parsedUrl.pathname);
    handleStatic(res, filePath);
});

server.listen(port, () => {
    console.log(`Local dev server running on http://localhost:${port}`);
});
