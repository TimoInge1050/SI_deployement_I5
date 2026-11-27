const MAX_LOG_ENTRIES = 100;
const states = new Map();

function getState(automateId) {
  const id = Number(automateId);
  if (!states.has(id)) {
    states.set(id, {
      connection: "unknown",
      lastCheckedAt: null,
      lastConnectedAt: null,
      logs: [],
    });
  }
  return states.get(id);
}

function addLog(automateId, level, message) {
  const state = getState(automateId);
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  state.logs.push(entry);
  if (state.logs.length > MAX_LOG_ENTRIES) {
    state.logs.splice(0, state.logs.length - MAX_LOG_ENTRIES);
  }

  const log = level === "error" ? console.error : level === "warning" ? console.warn : console.info;
  log(`[Automate ${Number(automateId)}] ${message}`);
}

function recordConnection(automateId, connected) {
  const state = getState(automateId);
  const connection = connected ? "connected" : "disconnected";
  state.connection = connection;
  state.lastCheckedAt = new Date().toISOString();
  if (connected) {
    state.lastConnectedAt = state.lastCheckedAt;
  }
}

function getAutomateConnectionStatus(automateId, active = true) {
  const state = states.get(Number(automateId));
  return {
    connection: active ? state?.connection ?? "unknown" : "inactive",
    lastCheckedAt: state?.lastCheckedAt ?? null,
    lastConnectedAt: state?.lastConnectedAt ?? null,
  };
}

function getAutomateStatus(automateId, active = true) {
  const state = states.get(Number(automateId));
  return {
    ...getAutomateConnectionStatus(automateId, active),
    logs: state?.logs.map((entry) => ({ ...entry })) ?? [],
  };
}

module.exports = {
  addLog,
  getAutomateConnectionStatus,
  getAutomateStatus,
  recordConnection,
};
