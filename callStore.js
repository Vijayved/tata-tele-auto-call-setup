const { MongoClient } = require("mongodb");
const logger = require("./logger");

class CallStore {
  constructor() {
    this.logs = [];
    this.db = null;
    this.collection = null;
    this.connected = false;
    this.connectPromise = null;
    this.nextId = 1;

    const uri = process.env.MONGODB_URI;
    if (uri) {
      this.connectPromise = this.connectDB(uri);
    } else {
      logger.warn("MONGODB_URI not set — using in-memory only (data lost on restart)");
    }
  }

  async connectDB(uri) {
    try {
      const client = new MongoClient(uri, {
        connectTimeoutMS: 10000,
        serverSelectionTimeoutMS: 10000,
      });
      await client.connect();
      this.db = client.db("wati_tatatele");
      this.collection = this.db.collection("call_logs");
      this.connected = true;

      // Load existing data into memory cache
      const existing = await this.collection.find().sort({ id: 1 }).limit(2000).toArray();
      this.logs = existing;
      
      // Set next ID
      if (this.logs.length > 0) {
        const maxId = Math.max(...this.logs.map(l => l.id || 0));
        this.nextId = maxId + 1;
      }

      logger.info(`MongoDB connected! Loaded ${this.logs.length} existing records (nextId: ${this.nextId})`);
    } catch (err) {
      logger.error("MongoDB connection failed — using in-memory", { error: err.message });
      this.connected = false;
    }
  }

  async waitForConnection() {
    if (this.connectPromise) {
      await this.connectPromise;
      this.connectPromise = null;
    }
  }

  addLog(entry) {
    const record = {
      id: this.nextId++,
      ...entry,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.logs.push(record);

    // Trim memory cache
    if (this.logs.length > 2000) {
      this.logs = this.logs.slice(-2000);
    }

    // Save to MongoDB in background (don't block)
    if (this.connected && this.collection) {
      const doc = { ...record };
      delete doc._id; // Remove _id to let MongoDB auto-generate
      this.collection.insertOne(doc).catch(err => {
        logger.error("MongoDB insert failed", { error: err.message });
      });
    }

    logger.info("Call log added", { id: record.id, status: record.status });
    return record;
  }

  updateLog(id, updates) {
    const index = this.logs.findIndex((l) => l.id === id);
    if (index === -1) return null;

    this.logs[index] = {
      ...this.logs[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (this.connected && this.collection) {
      this.collection.updateOne({ id }, { $set: updates }).catch(err => {
        logger.error("MongoDB update failed", { error: err.message });
      });
    }

    return this.logs[index];
  }

  getRecentLogs(limit = 50) {
    return this.logs.slice(-limit).reverse();
  }

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
