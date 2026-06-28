/**
 * db.js - SQLite 数据库抽象层
 * 
 * 优先使用 better-sqlite3（原生，同步），
 * 安装失败则回退到 sql.js（WASM，零原生依赖）。
 * 
 * 对调用方透明：提供与 better-sqlite3 相同的同步 API。
 * sql.js 后端在首次查询时异步初始化，之后同步使用。
 * 
 * 用法：
 *   const { openDb, getAvailableBackend } = require('./db');
 *   const db = openDb(filePath, { readonly: true });
 *   db.prepare(sql).all(...params);
 *   db.close();
 */

const fs = require('fs');

// ─── 后端检测 ───────────────────────────────────────────────────

let _BetterSqlite3 = null;
let _sqlJsFactory = null;

try {
    _BetterSqlite3 = require('better-sqlite3');
} catch (_) {}

try {
    _sqlJsFactory = require('sql.js');
} catch (_) {}

/**
 * 获取当前可用后端名称（不打开数据库）
 * @returns {'better-sqlite3' | 'sql.js' | null}
 */
function getAvailableBackend() {
    if (_BetterSqlite3) return 'better-sqlite3';
    if (_sqlJsFactory) return 'sql.js';
    return null;
}

// ─── sql.js 包装器 ──────────────────────────────────────────────

class SqlJsStatement {
    constructor(sqlJsDb, sql) {
        this._db = sqlJsDb;
        this._sql = sql;
    }

    all(...params) {
        const stmt = this._db.prepare(this._sql);
        if (params.length > 0) stmt.bind(params);
        const rows = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        stmt.free();
        return rows;
    }

    get(...params) {
        const stmt = this._db.prepare(this._sql);
        if (params.length > 0) stmt.bind(params);
        const row = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return row;
    }

    run(...params) {
        this._db.run(this._sql, params);
    }
}

class SqlJsWrapper {
    constructor(sqlJsDb) {
        this._db = sqlJsDb;
    }

    prepare(sql) {
        return new SqlJsStatement(this._db, sql);
    }

    close() {
        this._db.close();
    }
}

// ─── 延迟初始化 Wrapper ─────────────────────────────────────────

class LazyDb {
    /**
     * @param {string} dbPath
     * @param {object} options - { readonly: boolean }
     */
    constructor(dbPath, options = {}) {
        this._dbPath = dbPath;
        this._readonly = options.readonly || false;
        this._db = null;
        this._backend = null;
        this._initPromise = null;
        this._closed = false;
    }

    _ensureSync() {
        if (this._closed) throw new Error('Database is closed');
        if (this._db) return; // 已初始化
        if (this._initPromise) {
            throw new Error('sql.js 数据库正在异步初始化中，请稍后重试');
        }
        throw new Error('Database not initialized. Use await db.ready() first.');
    }

    /**
     * 异步初始化（sql.js 需要，better-sqlite3 立即完成）
     */
    ready() {
        if (this._db) return Promise.resolve();
        if (this._initPromise) return this._initPromise;

        this._initPromise = this._doInit();
        return this._initPromise;
    }

    async _doInit() {
        // 优先 better-sqlite3
        if (_BetterSqlite3) {
            try {
                this._db = new _BetterSqlite3(this._dbPath, { readonly: this._readonly });
                this._backend = 'better-sqlite3';
                return;
            } catch (_) {}
        }

        // 回退 sql.js
        if (_sqlJsFactory) {
            const SQL = await _sqlJsFactory();
            let data = null;
            if (fs.existsSync(this._dbPath)) {
                data = fs.readFileSync(this._dbPath);
            }
            const sqlJsDb = data ? new SQL.Database(Buffer.from(data)) : new SQL.Database();
            this._db = new SqlJsWrapper(sqlJsDb);
            this._backend = 'sql.js';
            return;
        }

        throw new Error('没有可用的 SQLite 后端。请安装：npm install better-sqlite3 或 npm install sql.js');
    }

    prepare(sql) {
        this._ensureSync();
        return this._db.prepare(sql);
    }

    close() {
        if (this._db) {
            this._db.close();
            this._db = null;
            this._closed = true;
        }
    }

    get backend() {
        return this._backend;
    }
}

// ─── 公开 API ───────────────────────────────────────────────────

/**
 * 打开数据库（返回 LazyDb，需调用 .ready() 完成初始化）
 * 
 * @param {string} dbPath - 数据库文件路径
 * @param {object} [options] - { readonly: boolean }
 * @returns {LazyDb}
 */
function openDb(dbPath, options = {}) {
    return new LazyDb(dbPath, options);
}

module.exports = { openDb, getAvailableBackend };
