#!/usr/bin/env node
/**
 * Claude Code Tooltrace - 零依赖 HTTP 服务器
 *
 * 用法: node server.js [port]
 * 默认端口: 8080
 *
 * 特点:
 * - 零依赖，只需 Node.js
 * - 自动打开浏览器
 * - 支持 CORS（跨域）
 * - 彩色终端输出
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// 配置
const PORT = process.argv[2] || 8080;
const DIR = __dirname;

// MIME 类型映射
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

// 彩色输出
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
    // 解析 URL
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/viewer.html';

    const filePath = path.join(DIR, urlPath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    // 安全检查：防止目录遍历
    if (!filePath.startsWith(DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    // 读取文件
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
                log(`  404 ${req.method} ${urlPath}`, 'red');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Internal Server Error');
                log(`  500 ${req.method} ${urlPath}`, 'red');
            }
        } else {
            // 设置响应头
            res.writeHead(200, {
                'Content-Type': `${contentType}; charset=utf-8`,
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
            });
            res.end(content);

            // 日志
            const statusColor = 'green';
            log(`  200 ${req.method} ${urlPath}`, statusColor);
        }
    });
});

// 启动服务器
server.listen(PORT, () => {
    console.log('');
    log('🧠 Claude Code Tooltrace - HTTP 服务器', 'bright');
    log('========================================', 'dim');
    console.log('');
    log(`✅ 服务器已启动`, 'green');
    log(`📂 服务目录: ${DIR}`, 'cyan');
    log(`🌐 访问地址: http://localhost:${PORT}/viewer.html`, 'cyan');
    console.log('');
    log('📋 可用功能:', 'yellow');
    log('   • 顶部下拉框切换项目', 'dim');
    log('   • 点击"自动"按钮实时监控', 'dim');
    log('   • 支持搜索、过滤、暗色主题', 'dim');
    console.log('');
    log('💡 按 Ctrl+C 停止服务器', 'dim');
    log('========================================', 'dim');
    console.log('');

    // 尝试自动打开浏览器
    const url = `http://localhost:${PORT}/viewer.html`;
    const platform = process.platform;

    if (platform === 'win32') {
        exec(`start ${url}`);
    } else if (platform === 'darwin') {
        exec(`open ${url}`);
    } else {
        exec(`xdg-open ${url}`);
    }
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('');
    log('👋 服务器已停止', 'yellow');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('');
    log('👋 服务器已停止', 'yellow');
    process.exit(0);
});
