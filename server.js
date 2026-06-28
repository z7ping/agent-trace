#!/usr/bin/env node
/**
 * Agent Beat - HTTP 服务器
 *
 * 用法:
 *   node server.js [port]              # 前台运行
 *   node server.js [port] --daemon     # 后台守护进程
 *   node server.js --open              # 前台运行 + 自动打开浏览器
 *   node server.js --stop              # 停止守护进程
 *   node server.js --status            # 查看运行状态
 *
 * 默认端口: 56789（定义在 config.js）
 *
 * 特点:
 * - 可选依赖 better-sqlite3（用于仪表盘 API）
 * - 守护进程模式：后台运行，PID 文件管理
 * - 自动打开浏览器
 * - 支持 CORS（跨域）
 * - 彩色终端输出
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const net = require('net');

// ─── 命令行参数解析 ──────────────────────────────────────────

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));

const isDaemon = flags.includes('--daemon');
const shouldOpen = flags.includes('--open');
const shouldStop = flags.includes('--stop');
const shouldStatus = flags.includes('--status');

// 端口：第一个非 flag 参数，或环境变量，或默认 56789
const PORT = parseInt(positional[0], 10) || parseInt(process.env.TRACKER_PORT, 10) || require('./config').DEFAULT_PORT;
const ROOT = __dirname;
const DIR = fs.existsSync(path.join(ROOT, 'dist'))
    ? path.join(ROOT, 'dist')
    : ROOT;
const PID_FILE = path.join(ROOT, '.server.pid');

// ─── 彩色输出 ────────────────────────────────────────────────

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
    // 守护进程模式不输出日志到 stdout
    if (isDaemon) return;
    console.log(`${colors[color]}${message}${colors.reset}`);
}

// ─── PID 管理 ────────────────────────────────────────────────

function writePid() {
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
}

function removePid() {
    try {
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    } catch (_) {}
}

function readPid() {
    try {
        if (fs.existsSync(PID_FILE)) {
            const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
            if (!isNaN(pid) && pid > 0) return pid;
        }
    } catch (_) {}
    return null;
}

function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

// ─── TCP 端口检测 ────────────────────────────────────────────

function checkPortInUse(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let responded = false;
        socket.setTimeout(500);
        socket.on('connect', () => { responded = true; socket.destroy(); resolve(true); });
        socket.on('timeout', () => { if (!responded) { responded = true; socket.destroy(); resolve(false); } });
        socket.on('error', () => { if (!responded) { responded = true; socket.destroy(); resolve(false); } });
        socket.connect(port, '127.0.0.1');
    });
}

// ─── --stop 命令 ─────────────────────────────────────────────

function handleStop() {
    const pid = readPid();
    if (!pid) {
        console.log('未找到运行中的服务（无 PID 文件）');
        process.exit(0);
    }
    if (!isProcessAlive(pid)) {
        console.log(`进程 ${pid} 已不存在，清理 PID 文件`);
        removePid();
        process.exit(0);
    }
    try {
        process.kill(pid, 'SIGTERM');
        removePid();
        console.log(`已停止服务 (PID: ${pid})`);
    } catch (e) {
        console.error(`停止失败: ${e.message}`);
        process.exit(1);
    }
}

// ─── --status 命令 ───────────────────────────────────────────

function handleStatus() {
    const pid = readPid();
    if (pid && isProcessAlive(pid)) {
        console.log(`运行中  PID: ${pid}  端口: ${PORT}`);
    } else {
        if (pid) removePid(); // 清理过期 PID
        console.log('未运行');
    }
}

// ─── 自动打开浏览器 ──────────────────────────────────────────

function openBrowser(url) {
    try {
        const platform = process.platform;
        if (platform === 'win32') {
            execSync(`start "" "${url}"`, { stdio: 'ignore' });
        } else if (platform === 'darwin') {
            execSync(`open "${url}"`, { stdio: 'ignore' });
        } else {
            execSync(`xdg-open "${url}" 2>/dev/null || true`, { stdio: 'ignore' });
        }
    } catch (_) {}
}

// ─── 处理 stop / status ─────────────────────────────────────

if (shouldStop) { handleStop(); process.exit(0); }
if (shouldStatus) { handleStatus(); process.exit(0); }

// ─── 端口冲突检测 ────────────────────────────────────────────

async function main() {
    // 检查 PID 文件中的进程是否存活
    const existingPid = readPid();
    if (existingPid && isProcessAlive(existingPid)) {
        if (isDaemon) {
            // 守护模式下已运行，静默退出
            process.exit(0);
        } else {
            log(`⚠️  服务已在运行 (PID: ${existingPid})`, 'yellow');
            log(`   访问 http://localhost:${PORT}/`, 'cyan');
            log(`   如需重启: node server.js --stop`, 'dim');
            process.exit(0);
        }
    }

    // 清理过期 PID 文件
    if (existingPid && !isProcessAlive(existingPid)) {
        removePid();
    }

    // 检查端口是否被其他进程占用
    const portInUse = await checkPortInUse(PORT);
    if (portInUse) {
        if (isDaemon) {
            process.exit(0);
        }
        log(`⚠️  端口 ${PORT} 已被占用`, 'yellow');
        log(`   尝试其他端口: node server.js 8081`, 'dim');
        process.exit(1);
    }

    // ─── MIME 类型映射 ──────────────────────────────────────────

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

    // ─── SQLite 数据库 ──────────────────────────────────────────

    const { openDb, getAvailableBackend } = require('./db');
    const DB_FILE = path.join(ROOT, 'a-beat.db');
    let db = null;

    // ─── a-beat.db 集成 ─────────────────────────────────────
    const trackerDb = require('./abeat-db');

    function getDb() {
        try {
            const d = trackerDb.getDb();
            return d;
        } catch (e) {
            console.error('[getDb] Error:', e.message);
            return null;
        }
    }

    // ─── API 处理函数 ──────────────────────────────────────────

    function sendJson(res, data, statusCode = 200) {
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
    }

    async function handleApiStats(req, res, params) {
        try {
            const { getAdapter } = require('./adapters');
            const source = params.get('source');
            const since = params.get('since');

            // Hermes 直接查 state.db
            if (source === 'hermes') {
                const hermesAdapter = getAdapter('hermes');
                if (hermesAdapter) {
                    const stats = await hermesAdapter.getStats({ since });
                    sendJson(res, stats);
                    return;
                }
            }

            // 其他来源或全部：查 a-beat.db
            const database = getDb();
            if (!database) {
                sendJson(res, { error: 'SQLite 数据库不可用' }, 503);
                return;
            }

            let whereClause = 'WHERE 1=1';
            const queryParams = [];
            if (source) { whereClause += ' AND source = ?'; queryParams.push(source); }
            if (since) { whereClause += ' AND date >= ?'; queryParams.push(since); }

            const byTool = database.prepare(`
                SELECT tool_name, SUM(call_count) as count, SUM(error_count) as errors, AVG(avg_duration_ms) as avg_duration_ms
                FROM daily_stats ${whereClause}
                GROUP BY tool_name ORDER BY count DESC
            `).all(...queryParams);

            const bySource = database.prepare(`
                SELECT source, SUM(call_count) as count, SUM(error_count) as errors
                FROM daily_stats ${whereClause}
                GROUP BY source ORDER BY count DESC
            `).all(...queryParams);

            const byDay = database.prepare(`
                SELECT date, SUM(call_count) as count, SUM(error_count) as errors
                FROM daily_stats ${whereClause}
                GROUP BY date ORDER BY date ASC
            `).all(...queryParams);

            const totals = database.prepare(`
                SELECT
                    SUM(call_count) as total_calls,
                    SUM(error_count) as total_errors,
                    (SELECT COUNT(*) FROM sessions) as session_count
                FROM daily_stats ${whereClause}
            `).get(...queryParams);

            sendJson(res, { totals, byTool, bySource, byDay });
        } catch (e) {
            sendJson(res, { error: e.message }, 500);
        }
    }

    async function handleApiTools(req, res, params) {
        try {
            const { getAdapter, getAllAdapters } = require('./adapters');

            // 查所有适配器的工具统计，合并结果
            const allAdapters = getAllAdapters();
            const toolMap = new Map();

            for (const [name, adapter] of allAdapters) {
                if (adapter.getTools) {
                    const tools = await adapter.getTools();
                    for (const t of tools) {
                        const key = t.tool_name;
                        if (toolMap.has(key)) {
                            const existing = toolMap.get(key);
                            existing.count += t.count || 0;
                            existing.errors += t.errors || 0;
                        } else {
                            toolMap.set(key, { tool_name: key, count: t.count || 0, errors: t.errors || 0 });
                        }
                    }
                }
            }

            // 同时查 a-beat.db（Claude Code 等已同步的数据）
            const database = getDb();
            if (database) {
                const dbTools = database.prepare(`
                    SELECT tool_name, SUM(call_count) as count, SUM(error_count) as errors
                    FROM daily_stats
                    GROUP BY tool_name
                `).all();
                for (const t of dbTools) {
                    const key = t.tool_name;
                    if (toolMap.has(key)) {
                        const existing = toolMap.get(key);
                        existing.count += t.count || 0;
                        existing.errors += t.errors || 0;
                    } else {
                        toolMap.set(key, { tool_name: key, count: t.count || 0, errors: t.errors || 0 });
                    }
                }
            }

            const items = Array.from(toolMap.values()).sort((a, b) => b.count - a.count);
            sendJson(res, { items });
        } catch (e) {
            sendJson(res, { error: e.message }, 500);
        }
    }

    async function handleApiSessions(req, res, params) {
        try {
            const { getAdapter, getAllAdapters } = require('./adapters');
            const source = params.get('source');
            const project = params.get('project');
            const limit = Math.min(parseInt(params.get('limit') || '50', 10), 200);

            let allSessions = [];

            // 从各适配器获取 sessions
            const adapters = source ? { [source]: getAdapter(source) } : Object.fromEntries(getAllAdapters());
            for (const [name, adapter] of Object.entries(adapters)) {
                if (!adapter || !adapter.getSessions) continue;
                const sessions = await adapter.getSessions({ project_key: project, limit });
                allSessions.push(...sessions);
            }

            // 同时查 a-beat.db
            const database = getDb();
            if (database) {
                let whereClause = 'WHERE 1=1';
                const queryParams = [];
                if (source) { whereClause += ' AND source = ?'; queryParams.push(source); }
                if (project) { whereClause += ' AND project_key = ?'; queryParams.push(project); }

                const dbSessions = database.prepare(`
                    SELECT * FROM sessions ${whereClause}
                    ORDER BY start_time DESC LIMIT ?
                `).all(...queryParams, limit * 2);
                allSessions.push(...dbSessions);
            }

            // 去重（按 session_id）+ 排序 + 截断
            const seen = new Set();
            const unique = allSessions.filter(s => {
                if (seen.has(s.session_id)) return false;
                seen.add(s.session_id);
                return true;
            });
            unique.sort((a, b) => (b.start_time || '').localeCompare(a.start_time || ''));

            // 添加 project_name（从 projects.json 查找）
            try {
                const projectsFile = path.join(ROOT, 'projects.json');
                const projects = fs.existsSync(projectsFile)
                    ? JSON.parse(fs.readFileSync(projectsFile, 'utf-8'))
                    : {};
                for (const s of unique) {
                    const proj = projects[s.project_key];
                    s.project_name = proj?.name || s.project_key;
                }
            } catch (_) {}

            sendJson(res, { items: unique.slice(0, limit) });
        } catch (e) {
            sendJson(res, { error: e.message }, 500);
        }
    }

    async function handleApiTimeline(req, res, params) {
        const project = params.get('project');
        const session = params.get('session');
        const source = params.get('source') || null;
        const limit = Math.min(parseInt(params.get('limit') || '1000', 10), 10000);

        try {
            const { getAdapter, getAllAdapters } = require('./adapters');
            const filter = { session_id: session, project_key: project, source, limit };

            // 如果指定了 source，只用该适配器；否则用所有适配器
            let items = [];
            if (source) {
                const adapter = getAdapter(source);
                if (adapter) items = await adapter.getRecords(filter);
            } else {
                const adapters = getAllAdapters();
                for (const adapter of adapters.values()) {
                    const records = await adapter.getRecords(filter);
                    items.push(...records);
                }
            }

            // 按 seq 升序排列（树结构需要父节点在子节点之前）
            // 如果有 seq 字段则按 seq 排序，否则按时间倒序
            const hasSeq = items.length > 0 && items.some(i => i.seq != null);
            if (hasSeq) {
                items.sort((a, b) => (a.seq || 0) - (b.seq || 0));
            } else {
                items.sort((a, b) => (b.ts || b.timestamp || '').localeCompare(a.ts || a.timestamp || ''));
            }
            sendJson(res, { items: items.slice(0, limit) });
        } catch (e) {
            sendJson(res, { error: e.message }, 500);
        }
    }

    // ─── Skills API ───────────────────────────────────────────
    // 扫描 ~/.claude/projects/ 下所有 JSONL 文件，提取 skill_listing 数据

    let skillsCache = null;
    let skillsCacheTime = 0;
    const SKILLS_CACHE_TTL = 30000; // 30 秒缓存

    function handleApiSkills(req, res, params) {
        // 命中缓存则直接返回
        if (skillsCache && (Date.now() - skillsCacheTime) < SKILLS_CACHE_TTL) {
            sendJson(res, skillsCache);
            return;
        }
        try {
            const claudeProjectsDir = path.join(require('os').homedir(), '.claude', 'projects');
            const sessions = [];
            const skillsSummary = {};

            // 检查目录是否存在
            if (!fs.existsSync(claudeProjectsDir)) {
                sendJson(res, { sessions: [], skillsSummary: {}, totalSessions: 0, totalUniqueSkills: 0 });
                return;
            }

            // 递归扫描所有 JSONL 文件
            const jsonlFiles = [];
            const scanDir = (dir) => {
                try {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        if (entry.isDirectory()) {
                            scanDir(fullPath);
                        } else if (entry.name.endsWith('.jsonl')) {
                            jsonlFiles.push(fullPath);
                        }
                    }
                } catch (e) {
                    // 跳过无法读取的目录
                }
            };
            scanDir(claudeProjectsDir);

            // 处理每个 JSONL 文件 - 统计实际 Skill 工具调用次数
            const processedSessions = new Set();
            for (const filePath of jsonlFiles) {
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const lines = content.split('\n').filter(line => line.trim());

                    for (const line of lines) {
                        try {
                            const entry = JSON.parse(line);
                            const sessionId = entry.sessionId;

                            // 统计 Skill 工具的实际调用
                            // JSONL 格式: type="assistant", message.content 中的 tool_use
                            if (entry.type === 'assistant' && entry.message?.content) {
                                const contentArr = Array.isArray(entry.message.content) ? entry.message.content : [];
                                for (const item of contentArr) {
                                    if (item.type === 'tool_use' && item.name === 'Skill' && item.input?.skill) {
                                        const skillName = item.input.skill;
                                        if (!skillsSummary[skillName]) {
                                            skillsSummary[skillName] = { count: 0, sessions: [] };
                                        }
                                        skillsSummary[skillName].count++;
                                        if (sessionId && !skillsSummary[skillName].sessions.includes(sessionId)) {
                                            skillsSummary[skillName].sessions.push(sessionId);
                                        }
                                    }
                                }
                            }

                            // 同时保留 session 信息（用于 totalSessions 统计）
                            if (entry.type === 'attachment' &&
                                entry.attachment &&
                                entry.attachment.type === 'skill_listing' &&
                                entry.sessionId) {
                                if (!processedSessions.has(entry.sessionId)) {
                                    processedSessions.add(entry.sessionId);
                                    sessions.push({
                                        sessionId: entry.sessionId,
                                        cwd: entry.cwd || '',
                                        timestamp: entry.timestamp || '',
                                        skillCount: entry.attachment.skillCount || entry.attachment.names?.length || 0,
                                        skills: entry.attachment.names || []
                                    });
                                }
                            }
                        } catch (parseErr) {
                            // 跳过无法解析的行
                        }
                    }
                } catch (readErr) {
                    // 跳过无法读取的文件
                }
            }

            // 按时间排序（最新的在前）
            sessions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            // 计算统计
            const totalSessions = sessions.length;
            const totalUniqueSkills = Object.keys(skillsSummary).length;

            const result = {
                sessions,
                skillsSummary,
                totalSessions,
                totalUniqueSkills
            };
            skillsCache = result;
            skillsCacheTime = Date.now();
            sendJson(res, result);
        } catch (e) {
            sendJson(res, { error: e.message }, 500);
        }
    }

    // ─── 创建 HTTP 服务器 ──────────────────────────────────────

    const server = http.createServer((req, res) => {
        let urlPath = req.url.split('?')[0];
        const urlParams = new URL(req.url, `http://localhost:${PORT}`).searchParams;
        
        // CORS 头
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        // ─── API 路由 ──────────────────────────────────────────
        
        if (urlPath === '/api/stats') {
            handleApiStats(req, res, urlParams);
            return;
        }
        
        if (urlPath === '/api/tools') {
            handleApiTools(req, res, urlParams);
            return;
        }
        
        if (urlPath === '/api/sessions') {
            handleApiSessions(req, res, urlParams);
            return;
        }
        
        if (urlPath === '/api/timeline') {
            handleApiTimeline(req, res, urlParams);
            return;
        }

        if (urlPath === '/api/skills') {
            handleApiSkills(req, res, urlParams);
            return;
        }

        // ─── 静态文件服务 ──────────────────────────────────────
        
        if (urlPath === '/') urlPath = '/index.html';

        const filePath = path.resolve(path.join(DIR, urlPath));
        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        // 安全检查：防止目录遍历（使用 path.resolve 解析后比对）
        if (!filePath.startsWith(path.resolve(DIR))) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // 回退到项目根目录（logs/、states/、projects.json 等数据文件）
                    const rootPath = path.resolve(path.join(ROOT, urlPath));
                    if (rootPath.startsWith(path.resolve(ROOT))) {
                        fs.readFile(rootPath, (err2, content2) => {
                            if (err2) {
                                res.writeHead(404, { 'Content-Type': 'text/plain' });
                                res.end('404 Not Found');
                                log(`  404 ${req.method} ${urlPath}`, 'red');
                            } else {
                                res.writeHead(200, { 'Content-Type': contentType });
                                res.end(content2);
                                log(`  200 ${req.method} ${urlPath}`, 'green');
                            }
                        });
                    } else {
                        res.writeHead(404, { 'Content-Type': 'text/plain' });
                        res.end('404 Not Found');
                    }
                } else {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('500 Internal Server Error');
                    log(`  500 ${req.method} ${urlPath}`, 'red');
                }
            } else {
                res.writeHead(200, {
                    'Content-Type': `${contentType}; charset=utf-8`,
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*',
                });
                res.end(content);
                log(`  200 ${req.method} ${urlPath}`, 'green');
            }
        });
    });

    // ─── 初始化数据库后端 ──────────────────────────────────────

    async function initDb() {
        // a-beat.db 已自动初始化，无需额外 ready()
        try {
            const d = getDb();
            if (d) log(`  ✅ 数据库就绪 (better-sqlite3)`, 'green');
        } catch (e) {
            log(`  ⚠️ 数据库初始化失败: ${e.message}`, 'yellow');
        }

        // 启动 Claude Code JSONL 轮询
        try {
            const { getAdapter } = require('./adapters');
            const ccAdapter = getAdapter('claude-code');
            if (ccAdapter && ccAdapter.startPolling) {
                ccAdapter.startPolling();
                log(`  ✅ Claude Code JSONL 轮询已启动`, 'green');
            }
        } catch (e) {
            log(`  ⚠️ Claude Code 轮询启动失败: ${e.message}`, 'yellow');
        }
    }

    // ─── 启动服务器 ────────────────────────────────────────────

    initDb().then(() => {
        server.listen(PORT, () => {
            // 写入 PID 文件
            writePid();

            if (!isDaemon) {
                console.log('');
                log('🧠 Agent Beat - HTTP 服务器', 'bright');
                log('========================================', 'dim');
                console.log('');
                log(`✅ 服务器已启动`, 'green');
                log(`📂 服务目录: ${DIR}`, 'cyan');
                log(`🌐 访问地址: http://localhost:${PORT}/`, 'cyan');
                log(`📋 PID: ${process.pid}`, 'dim');
                console.log('');
                log('📋 可用功能:', 'yellow');
                log('   • 顶部下拉框切换项目', 'dim');
                log('   • 点击"自动"按钮实时监控', 'dim');
                log('   • 支持搜索、过滤、暗色主题', 'dim');
                console.log('');
                log('💡 管理命令:', 'dim');
                log('   node server.js --stop    停止服务', 'dim');
                log('   node server.js --status  查看状态', 'dim');
                log('   按 Ctrl+C 停止服务器', 'dim');
                log('========================================', 'dim');
                console.log('');
            }

            // 自动打开浏览器（仅前台模式或显式 --open）
            if (shouldOpen || (!isDaemon && process.env.TRACKER_AUTO_OPEN !== '0')) {
                const url = `http://localhost:${PORT}/`;
                // 延迟 500ms 等服务器完全就绪
                setTimeout(() => openBrowser(url), 500);
            }
        });

        // ─── 优雅关闭 ──────────────────────────────────────────────

        function shutdown() {
            try {
                const { stopAll } = require('./adapters');
                stopAll();
            } catch (_) {}
            try {
                const abeatDb = require('./abeat-db');
                abeatDb.closeDb();
            } catch (_) {}
            removePid();
            if (!isDaemon) {
                console.log('');
                log('👋 服务器已停止', 'yellow');
            }
            process.exit(0);
        }

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

        // 守护进程：退出时清理
        process.on('exit', removePid);
    });
}

main();
