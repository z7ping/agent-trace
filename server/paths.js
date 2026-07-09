/**
 * paths.js - 跨平台路径解析
 * 各工具在不同 OS 下的数据目录不同，统一在此管理。
 * 支持环境变量覆盖。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');

const HOME = os.homedir();
const IS_WIN = process.platform === 'win32';

// 环境变量覆盖 > 平台默认值
function resolvePath(envKey, platformDefault) {
    const env = process.env[envKey];
    if (env && env.trim()) return env.trim();
    return platformDefault;
}

// ─── Hermes ──────────────────────────────────────────────
// Linux/macOS: ~/.hermes/state.db
// Windows:     %LOCALAPPDATA%\hermes\state.db
// Override:    HERMES_HOME
const hermesHome = IS_WIN
    ? resolvePath('HERMES_HOME', path.join(process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'), 'hermes'))
    : resolvePath('HERMES_HOME', path.join(HOME, '.hermes'));

// ─── OpenCode ────────────────────────────────────────────
// Linux/macOS: ~/.local/share/opencode/opencode.db  (XDG)
// Windows:     %APPDATA%\opencode\opencode.db
// Override:    OPENCODE_HOME
const opencodeHome = IS_WIN
    ? resolvePath('OPENCODE_HOME', path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'opencode'))
    : resolvePath('OPENCODE_HOME', path.join(HOME, '.local', 'share', 'opencode'));

// ─── Pi ──────────────────────────────────────────────────
// Linux/macOS: ~/.pi/agent/sessions
// Windows:     %APPDATA%\pi\agent\sessions
// Override:    PI_HOME
const piHome = IS_WIN
    ? resolvePath('PI_HOME', path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'pi'))
    : resolvePath('PI_HOME', path.join(HOME, '.pi'));

// ─── agent-trace (self) ─────────────────────────────────
// 所有平台: ~/.agent-trace
const agentTraceHome = path.join(HOME, '.agent-trace');

module.exports = {
    IS_WIN,
    HOME,
    hermes: {
        home: hermesHome,
        stateDb: path.join(hermesHome, 'state.db'),
    },
    opencode: {
        home: opencodeHome,
        db: path.join(opencodeHome, 'opencode.db'),
    },
    pi: {
        home: piHome,
        sessionsDir: path.join(piHome, 'agent', 'sessions'),
    },
    agentTrace: {
        home: agentTraceHome,
    },
};
