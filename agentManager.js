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

    // Parse AGENT_NAMES: "917600082217:Ruchit,919558591212:Mital"
    this.nameMap = {};
    const namesRaw = process.env.AGENT_NAMES || "";
    namesRaw.split(",").forEach((entry) => {
      const [num, name] = entry.split(":").map((s) => s.trim());
      if (num && name) this.nameMap[num] = name;
    });

    // All agents active by default
    this.activeStatus = {};
    this.agents.forEach((num) => {
      this.activeStatus[num] = true;
    });

    this.currentIndex = 0;
    logger.info(`AgentManager initialized with ${this.agents.length} agent(s)`, {
      agents: this.agents,
      names: this.agents.map((n) => this.nameMap[n] || n),
    });
  }

  // Get next ACTIVE agent using round-robin (skip leave agents)
  getNextAgent() {
    const totalAgents = this.agents.length;
    for (let i = 0; i < totalAgents; i++) {
      const agent = this.agents[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % totalAgents;
      if (this.activeStatus[agent]) {
        logger.info(`Selected agent: ${agent} (${this.getAgentName(agent)})`);
        return agent;
      }
      logger.info(`Skipping agent on leave: ${agent} (${this.getAgentName(agent)})`);
    }
    // If ALL agents on leave, use first agent anyway
    logger.warn("All agents on leave! Using first agent as fallback");
    return this.agents[0];
  }

  getAgentName(number) {
    return this.nameMap[number] || "";
  }

  getAgentNamesList() {
    return this.agents.map((n) => this.nameMap[n] || n);
  }

  // Get full agent info with status for dashboard
  getAgentsInfo() {
    return this.agents.map((num) => ({
      number: num,
      name: this.nameMap[num] || num,
      active: this.activeStatus[num] !== false,
    }));
  }

  // Set agent active/leave status
  setAgentStatus(number, active) {
    if (this.activeStatus.hasOwnProperty(number)) {
      this.activeStatus[number] = active;
      const name = this.getAgentName(number);
      logger.info(`Agent ${name} (${number}) set to ${active ? "ACTIVE" : "LEAVE"}`);
      return true;
    }
    // Try matching by name
    const entry = this.agents.find((n) => this.nameMap[n] === number);
    if (entry) {
      this.activeStatus[entry] = active;
      logger.info(`Agent ${number} set to ${active ? "ACTIVE" : "LEAVE"}`);
      return true;
    }
    return false;
  }

  getAgentCount() {
    return this.agents.filter((n) => this.activeStatus[n]).length;
  }
}

module.exports = AgentManager;
