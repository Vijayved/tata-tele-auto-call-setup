const { MongoClient } = require("mongodb");
const logger = require("./logger");

class CallStore {
  constructor() {
    this.logs = []; // In-memory cache
    this.db = null;
    this.collection = null;
    this.connected = false;

    const uri = process.env.MONGODB_URI;
    if (uri) {
      this.connectDB(uri);
    } else {
      logger.warn("MONGODB_URI not set — using in-memory only (data lost on restart)");
    }

    logger.info("CallStore initialized");
  }

  async connectDB(uri) {
    try {
      const client = new MongoClient(uri);
      await client.connect();
      this.db = client.db("wati_tatatele");
      this.collection = this.db.collection("call_logs");
      this.connected = true;

      // Load existing data into memory cache
      this.logs = await this.collection.find().sort({ id: -1 }).limit(1000).toArray();
      this.logs.reverse();

      logger.info(`MongoDB connected! Loaded ${this.logs.length} existing records`);
    } catch (err) {
      logger.error("MongoDB connection failed — using in-memory", { error: err.message });
      this.connected = false;
    }
  }

  /**
   * Add a new call log entry
   */
  async addLog(entry) {
    const lastId = this.logs.length > 0 ? this.logs[this.logs.length - 1].id || 0 : 0;
    const record = {
      id: lastId + 1,
      ...entry,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.logs.push(record);

    // Trim memory cache
    if (this.logs.length > 2000) {
      this.logs = this.logs.slice(-2000);
    }

    // Save to MongoDB
    if (this.connected && this.collection) {
      try {
        await this.collection.insertOne({ ...record, _id: undefined });
      } catch (err) {
        logger.error("MongoDB insert failed", { error: err.message });
      }
    }

    logger.info("Call log added", { id: record.id, status: record.status });
    return record;
  }

  /**
   * Update a call log by ID
   */
  async updateLog(id, updates) {
    const index = this.logs.findIndex((l) => l.id === id);
    if (index === -1) return null;

    this.logs[index] = {
      ...this.logs[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (this.connected && this.collection) {
      try {
        await this.collection.updateOne({ id }, { $set: updates });
      } catch (err) {
        logger.error("MongoDB update failed", { error: err.message });
      }
    }

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
    const missed = this.logs.filter((l) => l.status === "MISSED").length;
    const today = this.logs.filter((l) => {
      const d = new Date(l.created_at);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;

    return { total, success, failed, missed, today };
  }
}

module.exports = CallStore;
