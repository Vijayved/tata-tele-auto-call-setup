const axios = require("axios");
const logger = require("./logger");

class CallService {
  constructor() {
    this.apiUrl = process.env.TATA_API_URL;
    this.apiKey = process.env.TATA_API_KEY;
    this.callerId = process.env.CALLER_ID;
    this.maxRetries = parseInt(process.env.MAX_RETRIES || "2", 10);
    this.retryDelay = parseInt(process.env.RETRY_DELAY_MS || "5000", 10);

    if (!this.apiUrl || !this.apiKey || !this.callerId) {
      throw new Error(
        "Missing Tata Tele config: TATA_API_URL, TATA_API_KEY, CALLER_ID"
      );
    }

    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    logger.info("CallService initialized", {
      apiUrl: this.apiUrl,
      callerId: this.callerId,
    });
  }

  /**
   * Initiate a click-to-call
   * Flow: System calls agent first → agent picks up → system calls patient → bridge connected
   */
  async initiateCall(agentNumber, patientNumber) {
    const callData = {
      agent_number: agentNumber,
      destination_number: patientNumber,
      caller_id: this.callerId,
    };

    logger.info("Initiating click-to-call", callData);

    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        const response = await this.client.post("", callData);

        logger.info("Call initiated successfully", {
          attempt,
          agent: agentNumber,
          patient: patientNumber,
          response: response.data,
        });

        return {
          success: true,
          attempt,
          data: response.data,
        };
      } catch (error) {
        lastError = error;
        const status = error.response?.status;
        const errorData = error.response?.data;

        logger.error(`Call attempt ${attempt} failed`, {
          attempt,
          agent: agentNumber,
          patient: patientNumber,
          status,
          error: errorData || error.message,
        });

        // Don't retry on 4xx errors (client errors like invalid number)
        if (status && status >= 400 && status < 500) {
          break;
        }

        // Wait before retrying (only if not the last attempt)
        if (attempt <= this.maxRetries) {
          const delay = this.retryDelay * attempt; // exponential-ish backoff
          logger.info(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    return {
      success: false,
      error: lastError?.response?.data || lastError?.message || "Unknown error",
      status: lastError?.response?.status,
    };
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = CallService;
