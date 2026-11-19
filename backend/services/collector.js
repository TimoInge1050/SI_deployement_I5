const ModbusRTU = require("modbus-serial");
const pool = require("../db");
const decodeRegister = require("./register-value");

const TICK_MS = 1000;
const DATABASE_RETRY_MS = 5000;
const MODBUS_TIMEOUT_MS = 3000;

async function closeClient(client, variableId) {
  if (!client.isOpen) {
    return;
  }

  await new Promise((resolve) => {
    try {
      client.close((error) => {
        if (error) {
          console.error(`Échec de fermeture Modbus pour la variable ${variableId} :`, error);
        }
        resolve();
      });
    } catch (error) {
      console.error(`Échec de fermeture Modbus pour la variable ${variableId} :`, error);
      resolve();
    }
  });
}

async function pollVariable(variable) {
  const client = new ModbusRTU();
  let value = null;
  let quality = "GOOD";

  try {
    client.setTimeout(MODBUS_TIMEOUT_MS);
    await client.connectTCP(variable.adresse_ip, { port: Number(variable.port) });
    client.setID(Number(variable.unit_id));

    const result = await client.readHoldingRegisters(
      Number(variable.adresse_variable),
      1,
    );
    value = decodeRegister(result.data[0], variable.type_donnee);
  } catch (error) {
    quality = "ERROR";
    console.error(`Lecture Modbus échouée pour la variable ${variable.id_variable} :`, error);
  } finally {
    await closeClient(client, variable.id_variable);
  }

  try {
    await pool.query(
      `INSERT INTO releve (id_variable, valeur, qualite)
       VALUES (?, ?, ?)`,
      [variable.id_variable, value, quality],
    );
  } catch (error) {
    console.error(`Échec de l’enregistrement du relevé ${variable.id_variable} :`, error);
  }
}

async function runCycle(schedules) {
  let variables;
  try {
    variables = await pool.query(`
      SELECT v.id_variable, v.adresse_variable, v.type_donnee,
             v.frequence_acquisition, a.adresse_ip, a.port, a.unit_id
      FROM variable AS v
      INNER JOIN automate AS a ON a.id_automate = v.id_automate
      WHERE v.actif = TRUE
        AND a.actif = TRUE
        AND a.protocole = 'Modbus TCP'
      ORDER BY v.id_variable
    `);
  } catch (error) {
    console.error("Échec du chargement des variables à acquérir :", error);
    return false;
  }

  const now = Date.now();
  const activeIds = new Set(variables.map((variable) => Number(variable.id_variable)));
  for (const id of schedules.keys()) {
    if (!activeIds.has(id)) {
      schedules.delete(id);
    }
  }

  for (const variable of variables) {
    const id = Number(variable.id_variable);
    const periodMs = Number(variable.frequence_acquisition) * 1000;
    let schedule = schedules.get(id);
    if (!schedule || schedule.periodMs !== periodMs) {
      schedule = { periodMs, nextAt: now };
      schedules.set(id, schedule);
    }

    if (now >= schedule.nextAt) {
      schedule.nextAt = now + periodMs;
      await pollVariable(variable);
    }
  }
  return true;
}

function startCollector() {
  const schedules = new Map();
  let stopped = false;
  let timer;
  let currentCycle = Promise.resolve();

  async function tick() {
    if (stopped) {
      return;
    }

    currentCycle = runCycle(schedules);
    let databaseReady = false;
    try {
      databaseReady = await currentCycle;
    } catch (error) {
      console.error("Erreur interne du collecteur :", error);
    }
    if (!stopped) {
      timer = setTimeout(tick, databaseReady ? TICK_MS : DATABASE_RETRY_MS);
    }
  }

  void tick();

  return async function stopCollector() {
    stopped = true;
    clearTimeout(timer);
    await currentCycle;
  };
}

module.exports = { startCollector };
