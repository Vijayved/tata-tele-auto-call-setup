const winston = require("winston");
const path = require("path");
const fs = require("fs");

// Ensure logs directory exists (may not persist on Render free tier)
const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  try { fs.mkdirSync(logsDir, { recursive: true }); } catch {}
}

const transports = [
  // Console output - PRIMARY on Render (Render captures stdout)
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 1
          ? ` ${JSON.stringify(meta)}`
          : "";
        return `[${timestamp}] ${level}: ${message}${metaStr}`;
      })
    ),
  }),
];

// Add file transports only if writable (not critical on Render)
try {
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    })
  );
} catch {}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: "wati-tatatele-bridge" },
  transports,
});

module.exports = logger;
