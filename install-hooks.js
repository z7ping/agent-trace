#!/usr/bin/env node
/**
 * install-hooks.js - Write/update hooks config in Claude settings.json
 * Called by install.bat / install.sh
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsFile = path.join(os.homedir(), '.claude', 'settings.json');
const toolTrackerDir = path.join(os.homedir(), '.claude', 'ai-tool-tracker');
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

settings.hooks = {
    PreToolUse: [{
        hooks: [{
            command: `node ${prelogPath}`,
            type: 'command',
            timeout: 5,
            statusMessage: '',
            async: false
        }]
    }],
    PostToolUse: [{
        hooks: [{
            command: `node ${logPath}`,
            type: 'command',
            timeout: 10,
            statusMessage: '',
            async: false
        }]
    }]
};

fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
console.log('   [OK] Settings updated');
