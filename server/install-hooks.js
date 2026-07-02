#!/usr/bin/env node
/**
 * install-hooks.js - Write/update hooks config in Claude settings.json
 * Called by install.bat / install.sh
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsFile = path.join(os.homedir(), '.claude', 'settings.json');
const toolTrackerDir = path.join(os.homedir(), '.claude', 'agent-trace');
const prelogPath = path.join(toolTrackerDir, 'hooks', 'prelog.js').replace(/\\/g, '/');
const logPath = path.join(toolTrackerDir, 'hooks', 'log.js').replace(/\\/g, '/');

let settings = {};
try {
    if (fs.existsSync(settingsFile)) {
        settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
    }
} catch (e) {
    settings = {};
}

// 合并 hooks：移除旧的 agent-trace hooks，再添加新的
if (!settings.hooks) settings.hooks = {};

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

settings.hooks.PreToolUse.push({
    hooks: [{
        command: `node ${prelogPath}`,
        type: 'command',
        timeout: 5,
        statusMessage: '',
        async: false
    }]
});

settings.hooks.PostToolUse.push({
    hooks: [{
        command: `node ${logPath}`,
        type: 'command',
        timeout: 10,
        statusMessage: '',
        async: false
    }]
});

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
console.log('   [OK] Settings updated');
