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

    // Parse AGENT_NAMES: "919274682553:Jay,917600082217:Ruchik"
    this.nameMap = {};
    const namesRaw = process.env.AGENT_NAMES || "";
    namesRaw.split(",").forEach((entry) => {
      const [num, name] = entry.split(":").map((s) => s.trim());
      if (num && name) this.nameMap[num] = name;
    });

    this.agentNames = this.agents.map((num) => this.nameMap[num] || num);

    this.currentIndex = 0;
    logger.info(`AgentManager initialized with ${this.agents.length} agent(s)`, {
      agents: this.agents,
      names: this.agentNames,
    });
  }

  getNextAgent() {
    const agent = this.agents[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.agents.length;
    logger.info(`Selected agent: ${agent} (${this.getAgentName(agent)})`);
    return agent;
  }

  getAgentName(number) {
    return this.nameMap[number] || "";
  }

  getAgentNamesList() {
    return [...new Set(this.agentNames)];
  }

  getAgentCount() {
    return this.agents.length;
  }
}

module.exports = AgentManager;
