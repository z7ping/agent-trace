#!/usr/bin/env node
/**
 * Agent Beat - 统一 CLI 入口
 *
 * 用法:
 *   agent-trace install              安装 hooks 到 Claude Code 配置
 *   agent-trace start [port]         前台启动服务器
 *   agent-trace start --daemon       后台守护进程模式
 *   agent-trace stop                 停止后台服务
 *   agent-trace status               查看服务状态
 *   agent-trace package              打包分发
 *   agent-trace uninstall            卸载并清理所有配置和数据
 *
 * 替代: install.sh, install.bat, start.sh, start.bat, package.sh
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');

// ─── 配置 ────────────────────────────────────────────────────────

const PROJECT_DIR = path.join(__dirname, '..');
const INSTALL_DIR = path.join(os.homedir(), '.claude', 'agent-trace');
const SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json');
const { DEFAULT_PORT } = require('./config');
const VERSION = require('../package.json').version;

// ─── 彩色输出 ────────────────────────────────────────────────────

const c = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(msg, color = 'reset') {
    console.log(`${c[color]}${msg}${c.reset}`);
}

// ─── 工具函数 ────────────────────────────────────────────────────

function isWin() {
    return process.platform === 'win32';
}

function checkNodeAvailable() {
    try {
        execSync('node --version', { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function mkdirp(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyFile(src, dest) {
    if (fs.existsSync(src)) {
        mkdirp(path.dirname(dest));
        fs.copyFileSync(src, dest);
    }
}

function rimraf(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

function copyDir(src, dest) {
    if (!fs.existsSync(src)) return;
    mkdirp(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// ─── PID 管理 ────────────────────────────────────────────────────

function getPidFile(baseDir) {
    return path.join(baseDir, '.server.pid');
}

function readPid(baseDir) {
    try {
        const pf = getPidFile(baseDir);
        if (fs.existsSync(pf)) {
            const pid = parseInt(fs.readFileSync(pf, 'utf-8').trim(), 10);
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

// ─── install 命令 ────────────────────────────────────────────────

async function cmdInstall() {
    log('🧠 Agent Beat - 安装', 'bright');
    log('═'.repeat(45), 'dim');
    console.log('');

    // 1. 检查 Node.js
    if (!checkNodeAvailable()) {
        log('[ERROR] 未找到 Node.js', 'red');
        log('请安装 Node.js: https://nodejs.org/', 'yellow');
        process.exit(1);
    }
    log('[OK] Node.js 可用', 'green');

    // 2. 创建目录
    console.log('');
    log(`创建目录: ${INSTALL_DIR}`, 'cyan');
    mkdirp(path.join(INSTALL_DIR, 'hooks'));
    mkdirp(path.join(INSTALL_DIR, 'logs'));
    mkdirp(path.join(INSTALL_DIR, 'states'));

    // 初始化 projects.json
    const projectsJson = path.join(INSTALL_DIR, 'projects.json');
    if (!fs.existsSync(projectsJson)) {
        fs.writeFileSync(projectsJson, '{}', 'utf-8');
    }

    // 3. 复制文件
    if (path.resolve(PROJECT_DIR) === path.resolve(INSTALL_DIR)) {
        log('源目录 = 目标目录，跳过复制', 'yellow');
    } else {
        log('复制文件...', 'cyan');

        // hooks/
        const hooks = ['prelog.js', 'log.js', 'server-guard.js'];
        hooks.forEach(f => {
            copyFile(path.join(PROJECT_DIR, 'server', 'hooks', f), path.join(INSTALL_DIR, 'hooks', f));
        });

        // server/ 根目录文件
        const rootFiles = [
            'server.js', 'cli.js', 'db.js', 'config.js', 'abeat-db.js',
            'install-hooks.js', 'schema.sql'
        ];
        rootFiles.forEach(f => {
            copyFile(path.join(PROJECT_DIR, 'server', f), path.join(INSTALL_DIR, f));
        });

        // adapters/
        const adapters = fs.readdirSync(path.join(PROJECT_DIR, 'server', 'adapters')) || [];
        adapters.forEach(f => {
            copyFile(path.join(PROJECT_DIR, 'server', 'adapters', f), path.join(INSTALL_DIR, 'adapters', f));
        });

        // dist/ (Vite 构建产物)
        if (fs.existsSync(path.join(PROJECT_DIR, 'dist'))) {
            copyDir(path.join(PROJECT_DIR, 'dist'), path.join(INSTALL_DIR, 'dist'));
            log(`  dist/ 已复制`, 'dim');
        }

        log(`[OK] 文件已复制`, 'green');
    }

    // 4. 安装依赖
    if (path.resolve(PROJECT_DIR) !== path.resolve(INSTALL_DIR)) {
        console.log('');
        log('安装依赖...', 'cyan');
        try {
            execSync('npm install --omit=dev', { cwd: INSTALL_DIR, stdio: 'ignore' });
            log('[OK] 依赖安装完成', 'green');
        } catch (e) {
            log('[WARN] 依赖安装失败，请手动运行: npm install', 'yellow');
        }
    }

    // 5. 更新 settings.json
    console.log('');
    log(`更新配置: ${SETTINGS_FILE}`, 'cyan');
    try {
        execSync(`node "${path.join(INSTALL_DIR, 'install-hooks.js')}"`, {
            stdio: 'inherit',
        });
    } catch (e) {
        log('[WARN] 更新 settings.json 失败', 'yellow');
    }

    // 6. 自动启动守护进程
    console.log('');
    log('启动后台服务...', 'cyan');
    try {
        cmdStart(['--daemon']);
        // 等待服务启动
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 检查状态
        const pid = readPid(INSTALL_DIR);
        if (pid && isProcessAlive(pid)) {
            log(`[OK] 服务已启动 → http://localhost:${DEFAULT_PORT}/`, 'green');
        } else {
            log('[WARN] 服务未启动，请手动运行:', 'yellow');
            log(`  agent-trace start`, 'dim');
        }
    } catch (_) {
        log('[WARN] 自动启动失败，请手动运行:', 'yellow');
        log(`  agent-trace start`, 'dim');
    }

    // 7. 完成提示
    console.log('');
    log('═'.repeat(45), 'dim');
    log('安装完成！', 'bright');
    console.log('');
    log('使用方式:', 'yellow');
    log('  服务会在首次使用 Claude Code 工具时自动拉起', 'dim');
    log(`  浏览器打开: http://localhost:${DEFAULT_PORT}/`, 'dim');
    log('  管理命令:', 'dim');
    log('    agent-trace start    启动服务', 'dim');
    log('    agent-trace stop     停止服务', 'dim');
    log('    agent-trace status   查看状态', 'dim');
    log('  向后兼容: node server.js 仍然可用', 'dim');
    console.log('');
    log(`文档: ${INSTALL_DIR}/README.md`, 'dim');
    log('═'.repeat(45), 'dim');
}

// ─── start 命令 ──────────────────────────────────────────────────

function cmdStart(argv) {
    const isDaemon = argv.includes('--daemon') || argv.includes('-d');
    const shouldOpen = argv.includes('--open');

    // 解析端口: 支持 --port 56789 或直接 56789
    let port = DEFAULT_PORT;
    const portFlagIdx = argv.indexOf('--port');
    if (portFlagIdx >= 0 && argv[portFlagIdx + 1]) {
        port = parseInt(argv[portFlagIdx + 1], 10) || DEFAULT_PORT;
    } else {
        const portIdx = argv.findIndex(a => !a.startsWith('-') && !isNaN(parseInt(a, 10)));
        if (portIdx >= 0) port = parseInt(argv[portIdx], 10) || DEFAULT_PORT;
    }

    const serverArgs = [String(port)];
    if (isDaemon) serverArgs.push('--daemon');
    if (shouldOpen) serverArgs.push('--open');

    if (isDaemon) {
        // 守护进程模式
        if (isWin()) {
            // Windows: 使用 VBScript 隐藏窗口
            const vbsContent = [
                'Set objShell = CreateObject("WScript.Shell")',
                `objShell.CurrentDirectory = "${PROJECT_DIR}"`,
                `objShell.Run "cmd.exe /c start /b node server/server.js ${port} --daemon", 0, False`,
            ].join('\r\n');
            const vbsPath = path.join(os.tmpdir(), 'agent-trace-daemon.vbs');
            fs.writeFileSync(vbsPath, vbsContent, 'utf-8');
            try {
                execSync(`wscript "${vbsPath}"`, { stdio: 'ignore' });
            } finally {
                try { fs.unlinkSync(vbsPath); } catch (_) {}
            }
        } else {
            // Unix: detached + unref
            const child = spawn('node', ['server/server.js', ...serverArgs], {
                cwd: PROJECT_DIR,
                detached: true,
                stdio: ['ignore', 'ignore', 'ignore'],
            });
            child.unref();
        }
        // 无输出，静默退出
    } else {
        // 前台模式
        console.log('');
        log('🧠 Agent Beat - HTTP 服务器', 'bright');
        log('═'.repeat(40), 'dim');
        console.log('');
        log(`✅ 端口: ${port}`, 'green');
        log(`📂 目录: ${PROJECT_DIR}`, 'cyan');
        log(`🌐 地址: http://localhost:${port}/`, 'cyan');
        console.log('');
        log('💡 按 Ctrl+C 停止', 'dim');
        log('══════════════════════════════════════════', 'dim');
        console.log('');

        const child = spawn('node', ['server.js', ...serverArgs], {
            cwd: PROJECT_DIR,
            stdio: 'inherit',
        });

        child.on('exit', (code) => {
            process.exit(code || 0);
        });

        process.on('SIGINT', () => {
            child.kill('SIGINT');
        });
        process.on('SIGTERM', () => {
            child.kill('SIGTERM');
        });
    }
}

// ─── stop 命令 ───────────────────────────────────────────────────

function cmdStop(baseDir) {
    baseDir = baseDir || INSTALL_DIR;
    const pid = readPid(baseDir);
    if (!pid) {
        log('未找到运行中的服务（无 PID 文件）');
        return;
    }
    if (!isProcessAlive(pid)) {
        log(`进程 ${pid} 已不存在，清理 PID 文件`);
        try { fs.unlinkSync(getPidFile(baseDir)); } catch (_) {}
        return;
    }
    try {
        process.kill(pid, 'SIGTERM');
        try { fs.unlinkSync(getPidFile(baseDir)); } catch (_) {}
        log(`✅ 已停止服务 (PID: ${pid})`, 'green');
    } catch (e) {
        log(`停止失败: ${e.message}`, 'red');
        process.exit(1);
    }
}

// ─── uninstall 命令 ──────────────────────────────────────────────

async function cmdUninstall() {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const answer = await new Promise(resolve => {
        rl.question(`${c.yellow}确定要卸载吗？这会删除所有配置和数据 (y/N): ${c.reset}`, resolve);
    });
    rl.close();

    if (answer.trim() !== 'y' && answer.trim() !== 'Y') {
        log('已取消卸载', 'yellow');
        return;
    }

    log('🧠 Agent Beat - 卸载', 'bright');
    log('═'.repeat(45), 'dim');
    console.log('');

    // 1. 停止运行中的服务
    log('停止运行中的服务...', 'cyan');
    try {
        cmdStop(INSTALL_DIR);
    } catch (_) {
        log('[SKIP] 无需停止（未运行）', 'dim');
    }

    // 2. 从 settings.json 移除 hooks 配置
    log(`清理配置: ${SETTINGS_FILE}`, 'cyan');
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
            if (settings.hooks) {
                const agentBeatMarker = 'agent-trace';
                function removeAgentBeatHooks(hookArray) {
                    if (!Array.isArray(hookArray)) return [];
                    return hookArray.filter(entry => {
                        if (!entry || !entry.hooks) return true;
                        return !entry.hooks.some(h => h.command && h.command.includes(agentBeatMarker));
                    });
                }
                settings.hooks.PreToolUse = removeAgentBeatHooks(settings.hooks.PreToolUse);
                settings.hooks.PostToolUse = removeAgentBeatHooks(settings.hooks.PostToolUse);
                // Clean up empty hook arrays
                if ((!settings.hooks.PreToolUse || settings.hooks.PreToolUse.length === 0) &&
                    (!settings.hooks.PostToolUse || settings.hooks.PostToolUse.length === 0)) {
                    delete settings.hooks;
                }
                fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
                log('[OK] agent-trace hooks 配置已移除', 'green');
            } else {
                log('[SKIP] 未找到 hooks 配置', 'dim');
            }
        } else {
            log('[SKIP] settings.json 不存在', 'dim');
        }
    } catch (e) {
        log(`[WARN] 清理配置失败: ${e.message}`, 'yellow');
    }

    // 3. 删除 ~/.claude/agent-trace/ 目录
    log(`删除目录: ${INSTALL_DIR}`, 'cyan');
    if (fs.existsSync(INSTALL_DIR)) {
        rimraf(INSTALL_DIR);
        log('[OK] 目录已删除', 'green');
    } else {
        log('[SKIP] 目录不存在', 'dim');
    }

    // 4. npm unlink -g
    log('执行 npm unlink -g agent-trace ...', 'cyan');
    try {
        execSync('npm unlink -g agent-trace', { stdio: 'ignore' });
        log('[OK] 全局链接已移除', 'green');
    } catch (_) {
        log('[SKIP] 未找到全局链接', 'dim');
    }

    console.log('');
    log('═'.repeat(45), 'dim');
    log('卸载完成！', 'bright');
    log('═'.repeat(45), 'dim');
}

// ─── status 命令 ─────────────────────────────────────────────────

function cmdStatus(baseDir) {
    baseDir = baseDir || INSTALL_DIR;
    const pid = readPid(baseDir);
    if (pid && isProcessAlive(pid)) {
        log(`✅ 运行中  PID: ${pid}  端口: ${DEFAULT_PORT}`, 'green');
    } else {
        if (pid) {
            try { fs.unlinkSync(getPidFile(baseDir)); } catch (_) {}
        }
        log('未运行', 'yellow');
    }
}

// ─── package 命令 ────────────────────────────────────────────────

function cmdPackage() {
    const pkgName = `agent-trace-v${VERSION}`;
    const distDir = path.join(PROJECT_DIR, 'dist');

    log(`📦 打包 Agent Beat v${VERSION}`, 'bright');
    log('═'.repeat(45), 'dim');
    console.log('');

    // 创建 dist 目录
    mkdirp(distDir);

    // 创建临时目录
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-trace-'));
    const pkgDir = path.join(tmpDir, pkgName);
    mkdirp(path.join(pkgDir, 'hooks'));

    // 复制文件
    log('复制文件...', 'cyan');

    const hookFiles = ['prelog.js', 'log.js', 'server-guard.js'];
    hookFiles.forEach(f => copyFile(path.join(PROJECT_DIR, 'server', 'hooks', f), path.join(pkgDir, 'hooks', f)));

    const rootFiles = [
        'index.html', 'README.md', '.gitignore',
        'server.js', 'cli.js', 'db.js', 'config.js', 'abeat-db.js',
        'install-hooks.js', 'schema.sql'
    ];
    rootFiles.forEach(f => copyFile(path.join(PROJECT_DIR, 'server', f), path.join(pkgDir, f)));

    log(`[OK] ${hookFiles.length + rootFiles.length} 个文件已复制`, 'green');

    // 创建归档
    console.log('');
    log('创建归档...', 'cyan');

    let archiveName;

    try {
        // 尝试 zip
        archiveName = `${pkgName}.zip`;
        execSync(`cd "${tmpDir}" && zip -r "${distDir}/${archiveName}" "${pkgName}"`, {
            stdio: 'ignore',
        });
        log(`[OK] 已创建: ${path.join(distDir, archiveName)}`, 'green');
    } catch {
        try {
            // 回退到 tar
            archiveName = `${pkgName}.tar.gz`;
            execSync(`cd "${tmpDir}" && tar -czf "${distDir}/${archiveName}" "${pkgName}"`, {
                stdio: 'ignore',
            });
            log(`[OK] 已创建: ${path.join(distDir, archiveName)}`, 'green');
        } catch {
            log('[WARN] zip/tar 不可用，文件保留在临时目录', 'yellow');
            log(`临时目录: ${pkgDir}`, 'dim');
            return;
        }
    }

    // 清理临时目录
    rimraf(tmpDir);

    console.log('');
    log('═'.repeat(45), 'dim');
    log('打包完成！', 'bright');
    console.log('');
    log(`输出: ${distDir}/`, 'cyan');
    console.log('');
    log('分发方式:', 'yellow');
    log('  1. 上传到 GitHub Releases', 'dim');
    log('  2. 直接分享归档文件', 'dim');
    log('  3. 用户运行: agent-trace install', 'dim');
    log('═'.repeat(45), 'dim');
}

// ─── help 命令 ───────────────────────────────────────────────────

function showHelp() {
    log('🧠 Agent Beat CLI', 'bright');
    console.log('');
    log('用法:', 'yellow');
    log('  agent-trace <command> [options]', 'cyan');
    console.log('');
    log('命令:', 'yellow');
    log('  install              安装 hooks 到 Claude Code 配置', 'dim');
    log('  start [--daemon]     启动服务器', 'dim');
    log('  stop                 停止后台服务', 'dim');
    log('  status               查看服务状态', 'dim');
    log('  package              打包分发', 'dim');
    log('  uninstall            卸载并清理所有配置和数据', 'dim');
    log('  help                 显示此帮助', 'dim');
    console.log('');
    log('选项:', 'yellow');
    log('  --daemon, -d         后台守护进程模式（仅 start）', 'dim');
    log('  --open               自动打开浏览器（仅 start）', 'dim');
    console.log('');
    log('示例:', 'yellow');
    log('  agent-trace install           # 首次安装', 'dim');
    log('  agent-trace start             # 前台启动', 'dim');
    log('  agent-trace start --daemon    # 后台启动', 'dim');
    log('  agent-trace stop              # 停止服务', 'dim');
    log('  agent-trace status            # 查看状态', 'dim');
    log('  agent-trace package           # 打包分发', 'dim');
    console.log('');
    log('向后兼容:', 'yellow');
    log('  node server.js [port]         # 仍然可用', 'dim');
    log('  node server.js --daemon       # 仍然可用', 'dim');
    log('  node server.js --stop         # 仍然可用', 'dim');
    log('  node server.js --status       # 仍然可用', 'dim');
}

// ─── 主入口 ──────────────────────────────────────────────────────

function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const cmdArgs = args.slice(1);

    switch (command) {
        case 'install':
            cmdInstall();
            break;
        case 'start':
            // start 命令使用项目目录（cli.js 所在目录）
            cmdStart(cmdArgs);
            break;
        case 'stop':
            cmdStop(PROJECT_DIR);
            break;
        case 'uninstall':
            cmdUninstall();
            break;
        case 'status':
            cmdStatus(PROJECT_DIR);
            break;
        case 'package':
            cmdPackage();
            break;
        case 'help':
        case '--help':
        case '-h':
            showHelp();
            break;
        default:
            if (command) {
                log(`未知命令: ${command}`, 'red');
                console.log('');
            }
            showHelp();
            break;
    }
}

main();
