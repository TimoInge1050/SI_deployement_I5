const assert = require("node:assert/strict");
const test = require("node:test");
const { addLog, getAutomateStatus, recordConnection } = require("../services/automate-monitor");

test("tracks connection state independently from a bounded log", () => {
  const automateId = 987654;
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = () => {};
  console.error = () => {};

  try {
    assert.equal(getAutomateStatus(automateId).connection, "unknown");
    assert.equal(getAutomateStatus(automateId, false).connection, "inactive");

    recordConnection(automateId, true);
    for (let index = 0; index < 105; index += 1) {
      addLog(automateId, "info", `Acquisition ${index}`);
    }

    let status = getAutomateStatus(automateId);
    assert.equal(status.connection, "connected");
    assert.equal(status.logs.length, 100);
    assert.equal(status.logs[0].message, "Acquisition 5");
    assert.ok(status.lastConnectedAt);

    recordConnection(automateId, false);
    status = getAutomateStatus(automateId);
    assert.equal(status.connection, "disconnected");
    addLog(automateId, "error", "Connexion TCP impossible.");
    status = getAutomateStatus(automateId);
    assert.equal(status.logs.at(-1).message, "Connexion TCP impossible.");
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }
});
