const crypto = require("crypto");
const logger = require("./logger");

class WebhookHandler {
  constructor() {
    // Support multiple trigger buttons (comma-separated in env)
    this.triggerTexts = (process.env.TRIGGER_BUTTON_TEXT || "Book Test")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    this.webhookSecret = process.env.WATI_WEBHOOK_SECRET || "";
    this.debounceSeconds = parseInt(process.env.DEBOUNCE_SECONDS || "60", 10);

    // Business hours config (IST)
    this.businessHoursStart = parseInt(process.env.BUSINESS_HOURS_START || "9", 10);
    this.businessHoursEnd = parseInt(process.env.BUSINESS_HOURS_END || "19", 10);
    this.businessDays = (process.env.BUSINESS_DAYS || "1,2,3,4,5,6")
      .split(",")
      .map((d) => parseInt(d.trim(), 10));

    // In-memory debounce map: phoneNumber -> timestamp
    this.recentClicks = new Map();

    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanupDebounce(), 5 * 60 * 1000);

    logger.info("WebhookHandler initialized", {
      triggerTexts: this.triggerTexts,
      debounceSeconds: this.debounceSeconds,
      businessHours: `${this.businessHoursStart}:00 - ${this.businessHoursEnd}:00 IST`,
    });
  }

  /**
   * Verify WATI webhook signature (if secret is configured)
   */
  verifySignature(rawBody, signature) {
    if (!this.webhookSecret) return true; // Skip if no secret configured

    try {
      const expected = crypto
        .createHmac("sha256", this.webhookSecret)
        .update(rawBody)
        .digest("hex");
      return crypto.timingSafeEqual(
        Buffer.from(signature || ""),
        Buffer.from(expected)
      );
    } catch {
      return false;
    }
  }

  /**
   * Extract patient phone number from various WATI webhook formats
   */
  extractPatientNumber(payload) {
    // WATI sends data in different formats depending on webhook type
    const number =
      payload?.waId ||
      payload?.from ||
      payload?.senderNumber ||
      payload?.contact?.wa_id ||
      payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.wa_id ||
      payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from ||
      null;

    if (!number) return null;

    // Clean the number: remove +, spaces, ensure it starts with country code
    let cleaned = String(number).replace(/[\s+\-()]/g, "");

    // If 10 digits, prepend India code
    if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
      cleaned = "91" + cleaned;
    }

    return cleaned;
  }

  /**
   * Check if the webhook payload contains any trigger button click
   * Supports: "BOOK THIS PACKAGE", "CALL ME FOR ASSISTANCE", "DETAILS OF PACKAGE"
   */
  isBookTestClick(payload) {
    // Check multiple possible fields where button text might appear
    const possibleTexts = [
      payload?.text,
      payload?.listReply?.title,
      payload?.buttonReply?.text,
      payload?.button?.text,
      payload?.interactive?.button_reply?.title,
      payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.button?.text,
      payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.interactive?.button_reply?.title,
      payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body,
    ].filter(Boolean);

    for (const text of possibleTexts) {
      const lowerText = String(text).toLowerCase();
      for (const trigger of this.triggerTexts) {
        if (lowerText.includes(trigger)) {
          logger.info(`Button text matched: "${text}" (trigger: "${trigger}")`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if we're within business hours (IST)
   */
  isBusinessHours() {
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
    );
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

    const withinHours =
      hour >= this.businessHoursStart && hour < this.businessHoursEnd;
    const withinDays = this.businessDays.includes(day);

    if (!withinHours || !withinDays) {
      logger.info(`Outside business hours: day=${day}, hour=${hour}`);
    }

    return withinHours && withinDays;
  }

  /**
   * Check if this is a duplicate click (debounce)
   */
  isDuplicate(phoneNumber) {
    const lastClick = this.recentClicks.get(phoneNumber);
    const now = Date.now();

    if (lastClick && now - lastClick < this.debounceSeconds * 1000) {
      logger.warn(`Duplicate click detected for ${phoneNumber}, ignoring`, {
        lastClick: new Date(lastClick).toISOString(),
        debounceWindow: `${this.debounceSeconds}s`,
      });
      return true;
    }

    this.recentClicks.set(phoneNumber, now);
    return false;
  }

  /**
   * Clean up old debounce entries
   */
  cleanupDebounce() {
    const now = Date.now();
    const expiry = this.debounceSeconds * 1000 * 2; // 2x debounce window
    let cleaned = 0;

    for (const [key, timestamp] of this.recentClicks.entries()) {
      if (now - timestamp > expiry) {
        this.recentClicks.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Debounce cleanup: removed ${cleaned} entries`);
    }
  }

  /**
   * Validate phone number format
   */
  isValidPhoneNumber(number) {
    // Indian mobile: 91 + 10 digits starting with 6-9
    const pattern = /^91[6-9]\d{9}$/;
    return pattern.test(number);
  }
}

module.exports = WebhookHandler;
