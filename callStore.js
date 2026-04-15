const fs = require("fs");
const path = require("path");
const logger = require("./logger");

class CallStore {
  constructor() {
    // In-memory storage (primary - works on Render free tier)
    this.logs = [];
    this.maxLogs = 1000; // Keep last 1000 records in memory

    // Optional file backup (may not persist on Render free tier restarts)
    this.filePath = path.join(__dirname, "data", "call-logs.json");
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.logs = this.loadLogs();
    } catch {}

    logger.info(`CallStore initialized with ${this.logs.length} existing records`);
  }

  loadLogs() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, "utf-8");
        return JSON.parse(data);
      }
    } catch (err) {
      logger.error("Failed to load call logs", { error: err.message });
    }
    return [];
  }

  saveLogs() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.logs, null, 2));
    } catch {
      // File write may fail on Render - that's OK, in-memory is primary
    }
  }

  /**
   * Add a new call log entry
   */
  addLog(entry) {
    const record = {
      id: this.logs.length + 1,
      ...entry,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.logs.push(record);

    // Trim old logs to prevent memory bloat
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.saveLogs();
    logger.info("Call log added", { id: record.id, status: record.status });
    return record;
  }

  /**
   * Update a call log by ID
   */
  updateLog(id, updates) {
    const index = this.logs.findIndex((l) => l.id === id);
    if (index === -1) return null;

    this.logs[index] = {
      ...this.logs[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    this.saveLogs();
    return this.logs[index];
  }

  /**
   * Get recent logs
   */
  getRecentLogs(limit = 50) {
    return this.logs.slice(-limit).reverse();
  }

  /**
   * Get stats
   */
  getStats() {
    const total = this.logs.length;
    const success = this.logs.filter((l) => l.status === "SUCCESS").length;
    const failed = this.logs.filter((l) => l.status === "FAILED").length;
    const today = this.logs.filter((l) => {
      const d = new Date(l.created_at);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;

    return { total, success, failed, today };
  }
}

module.exports = CallStore;
