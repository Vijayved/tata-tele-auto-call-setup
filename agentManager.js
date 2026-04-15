const logger = require("./logger");

class AgentManager {
  constructor() {
    const raw = process.env.AGENT_NUMBERS || "";
    this.agents = raw
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);

    if (this.agents.length === 0) {
      throw new Error("AGENT_NUMBERS not configured in .env");
    }

    this.currentIndex = 0;
    logger.info(`AgentManager initialized with ${this.agents.length} agent(s)`, {
      agents: this.agents,
    });
  }

  /**
   * Get the next agent number using round-robin
   */
  getNextAgent() {
    const agent = this.agents[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.agents.length;
    logger.info(`Selected agent: ${agent} (index: ${this.currentIndex})`);
    return agent;
  }

  /**
   * Get a specific agent by index
   */
  getAgent(index) {
    if (index >= 0 && index < this.agents.length) {
      return this.agents[index];
    }
    return null;
  }

  /**
   * Get total number of agents
   */
  getAgentCount() {
    return this.agents.length;
  }
}

module.exports = AgentManager;
