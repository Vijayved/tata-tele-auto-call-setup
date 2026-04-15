require("dotenv").config();

const express = require("express");
const logger = require("./logger");
const WebhookHandler = require("./webhookHandler");
const AgentManager = require("./agentManager");
const CallService = require("./callService");
const CallStore = require("./callStore");

// ── Initialize services ──
const app = express();
const webhookHandler = new WebhookHandler();
const agentManager = new AgentManager();
const callService = new CallService();
const callStore = new CallStore();

// ── Middleware ──
// Capture raw body for signature verification
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

// ═══════════════════════════════════════════
// ROUTE 1: Health Check
// ═══════════════════════════════════════════
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "wati-tatatele-bridge",
    timestamp: new Date().toISOString(),
    agents: agentManager.getAgentCount(),
    uptime: Math.floor(process.uptime()) + "s",
  });
});

// ═══════════════════════════════════════════
// ROUTE 2: WATI Webhook Receiver
// This is the main endpoint where WATI sends
// data when patient clicks "Book Test" button
// ═══════════════════════════════════════════
app.post("/wati-webhook", async (req, res) => {
  const startTime = Date.now();

  try {
    const payload = req.body;
    logger.info("Webhook received from WATI", {
      payload: JSON.stringify(payload).substring(0, 500),
    });

    // ── Step 1: Verify webhook signature (if configured) ──
    const signature = req.headers["x-wati-signature"] || req.headers["x-hub-signature-256"];
    if (!webhookHandler.verifySignature(req.rawBody, signature)) {
      logger.warn("Invalid webhook signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    // ── Step 2: Check if this is a "Book Test" button click ──
    if (!webhookHandler.isBookTestClick(payload)) {
      logger.info("Not a Book Test click, ignoring");
      return res.sendStatus(200);
    }

    // ── Step 3: Extract patient phone number ──
    const patientNumber = webhookHandler.extractPatientNumber(payload);
    if (!patientNumber) {
      logger.error("Could not extract patient number from webhook payload");
      return res.status(200).json({ error: "No phone number found" });
    }

    logger.info(`Book Test clicked by: ${patientNumber}`);

    // ── Step 4: Validate phone number ──
    if (!webhookHandler.isValidPhoneNumber(patientNumber)) {
      logger.warn(`Invalid phone number format: ${patientNumber}`);
      callStore.addLog({
        patient_number: patientNumber,
        agent_number: null,
        status: "FAILED",
        reason: "Invalid phone number format",
      });
      return res.status(200).json({ error: "Invalid phone number" });
    }

    // ── Step 5: Check duplicate clicks (debounce) ──
    if (webhookHandler.isDuplicate(patientNumber)) {
      return res.status(200).json({ status: "duplicate_ignored" });
    }

    // ── Step 6: Check business hours ──
    if (!webhookHandler.isBusinessHours()) {
      logger.info(`Call request outside business hours for ${patientNumber}`);
      callStore.addLog({
        patient_number: patientNumber,
        agent_number: null,
        status: "SKIPPED",
        reason: "Outside business hours",
      });
      // You could trigger a WATI auto-reply here saying
      // "We'll call you during business hours"
      return res.status(200).json({ status: "outside_business_hours" });
    }

    // ── Step 7: Get next available agent (round-robin) ──
    const agentNumber = agentManager.getNextAgent();

    // ── Step 8: Initiate Click-to-Call via Tata Tele ──
    logger.info("Triggering Tata Tele Click-to-Call", {
      agent: agentNumber,
      patient: patientNumber,
    });

    const result = await callService.initiateCall(agentNumber, patientNumber);

    // ── Step 9: Log the result ──
    const logEntry = callStore.addLog({
      patient_number: patientNumber,
      agent_number: agentNumber,
      status: result.success ? "SUCCESS" : "FAILED",
      attempts: result.attempt || 0,
      tata_response: result.data || result.error,
      processing_time_ms: Date.now() - startTime,
    });

    if (result.success) {
      logger.info("Call successfully initiated!", {
        logId: logEntry.id,
        agent: agentNumber,
        patient: patientNumber,
        processingTime: `${Date.now() - startTime}ms`,
      });

      return res.json({
        status: "call_initiated",
        call_id: logEntry.id,
        agent: agentNumber,
      });
    } else {
      logger.error("Call initiation failed", {
        logId: logEntry.id,
        error: result.error,
      });

      return res.status(200).json({
        status: "call_failed",
        error: result.error,
      });
    }
  } catch (error) {
    logger.error("Unexpected error in webhook handler", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({ error: "Internal server error" });
  }
});

// ═══════════════════════════════════════════
// ROUTE 3: Tata Tele Call Status Callback
// Configure this URL in Smartflo portal under
// API Connect → Webhook
// ═══════════════════════════════════════════
app.post("/call-status", (req, res) => {
  try {
    const statusData = req.body;
    logger.info("Call status update received", { data: statusData });

    // Log the status update
    // You can match this with your call logs using the phone numbers
    // or call ID from Tata Tele's response

    res.sendStatus(200);
  } catch (error) {
    logger.error("Error processing call status", { error: error.message });
    res.sendStatus(500);
  }
});

// ═══════════════════════════════════════════
// ROUTE 4: Dashboard / Stats (Simple API)
// ═══════════════════════════════════════════
app.get("/stats", (_req, res) => {
  const stats = callStore.getStats();
  res.json(stats);
});

app.get("/logs", (req, res) => {
  const limit = parseInt(req.query.limit || "50", 10);
  const logs = callStore.getRecentLogs(limit);
  res.json(logs);
});

// ═══════════════════════════════════════════
// ROUTE 5: Manual Call Trigger (for testing)
// ═══════════════════════════════════════════
app.post("/test-call", async (req, res) => {
  const { patient_number } = req.body;

  if (!patient_number) {
    return res.status(400).json({ error: "patient_number required" });
  }

  const agentNumber = agentManager.getNextAgent();
  const result = await callService.initiateCall(agentNumber, patient_number);

  callStore.addLog({
    patient_number,
    agent_number: agentNumber,
    status: result.success ? "SUCCESS" : "FAILED",
    source: "manual_test",
    tata_response: result.data || result.error,
  });

  res.json(result);
});

// ── 404 handler ──
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ── Error handler ──
app.use((err, _req, res, _next) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

// ── Start server ──
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`
  ╔══════════════════════════════════════════╗
  ║   WATI + Tata Tele Bridge Server         ║
  ║   Running on port ${PORT}                    ║
  ║                                          ║
  ║   Webhook URL:                           ║
  ║   POST /wati-webhook                     ║
  ║                                          ║
  ║   Health:  GET  /health                  ║
  ║   Stats:   GET  /stats                   ║
  ║   Logs:    GET  /logs                    ║
  ║   Test:    POST /test-call               ║
  ║   Status:  POST /call-status             ║
  ╚══════════════════════════════════════════╝
  `);
});

module.exports = app;
