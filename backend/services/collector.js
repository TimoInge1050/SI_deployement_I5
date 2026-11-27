// Fichier développé avec l’assistance d’une IA ; le code doit être relu et validé par l’équipe.
const ModbusRTU = require("modbus-serial");
const pool = require("../db");
const decodeRegister = require("./register-value");
const { addLog, recordConnection } = require("./automate-monitor");

const TICK_MS = 1000;
const DATABASE_RETRY_MS = 5000;
const AUTOMATE_CHECK_MS = 5000;
const MODBUS_TIMEOUT_MS = 3000;

// Ferme la connexion Modbus ouverte et signale les erreurs de fermeture.
async function closeClient(client, target) {
  if (!client.isOpen) {
    return;
  }

  await new Promise((resolve) => {
    try {
      client.close((error) => {
        if (error) {
          console.error(`Échec de fermeture Modbus (${target}) :`, error);
        }
        resolve();
      });
    } catch (error) {
      console.error(`Échec de fermeture Modbus (${target}) :`, error);
      resolve();
    }
  });
}

// Lit un registre Modbus, convertit sa valeur et enregistre aussi les échecs de lecture.
async function pollVariable(variable) {
  const client = new ModbusRTU();
  let value = null;
  let quality = "GOOD"; // Par défaut:"GOOD" | "ERROR"

  try {
    client.setTimeout(MODBUS_TIMEOUT_MS);
    await client.connectTCP(variable.adresse_ip, { port: Number(variable.port) });
    client.setID(Number(variable.unit_id));

    const result = await client.readHoldingRegisters(
      Number(variable.adresse_variable),
      1,
    );
    value = decodeRegister(result.data[0], variable.type_donnee);
    addLog(
      variable.id_automate,
      "info",
      `${variable.nom} (registre ${variable.adresse_variable}) : ${value}`,
    );
  } catch (error) {
    quality = "ERROR";
    addLog(
      variable.id_automate,
      "error",
      `Lecture Modbus échouée pour ${variable.nom} (registre ${variable.adresse_variable}) : ${error.message}`,
    );
  } finally {
    await closeClient(client, `variable ${variable.id_variable}`);
  }

  try {
    await pool.query(
      `INSERT INTO releve (id_variable, valeur, qualite)
       VALUES (?, ?, ?)`,
      [variable.id_variable, value, quality],
    );
  } catch (error) {
    addLog(
      variable.id_automate,
      "error",
      `Échec de l’enregistrement du relevé pour ${variable.nom} : ${error.message}`,
    );
  }
}

async function checkAutomateConnection(automate) {
  const client = new ModbusRTU();
  addLog(
    automate.id_automate,
    "info",
    `Tentative de connexion TCP à ${automate.adresse_ip}:${automate.port}...`,
  );

  try {
    client.setTimeout(MODBUS_TIMEOUT_MS);
    await client.connectTCP(automate.adresse_ip, { port: Number(automate.port) });
    recordConnection(automate.id_automate, true);
    addLog(
      automate.id_automate,
      "info",
      `Connexion TCP établie avec ${automate.adresse_ip}:${automate.port}.`,
    );
  } catch (error) {
    recordConnection(automate.id_automate, false);
    addLog(
      automate.id_automate,
      "error",
      `Connexion TCP impossible à ${automate.adresse_ip}:${automate.port} : ${error.message}`,
    );
  } finally {
    await closeClient(client, `automate ${automate.id_automate}`);
  }
}

// Recharge la configuration active et déclenche les acquisitions arrivées à échéance.
async function runCycle(schedules, automateSchedules) {
  let automates;
  let variables;
  try {
    [automates, variables] = await Promise.all([
      pool.query(`
        SELECT id_automate, adresse_ip, port
        FROM automate
        WHERE actif = TRUE
          AND protocole = 'Modbus TCP'
        ORDER BY id_automate
      `),
      pool.query(`
      SELECT v.id_variable, v.adresse_variable, v.type_donnee,
            v.nom, v.frequence_acquisition, a.id_automate,
            a.adresse_ip, a.port, a.unit_id
      FROM variable AS v
      INNER JOIN automate AS a ON a.id_automate = v.id_automate
      WHERE v.actif = TRUE
        AND a.actif = TRUE
        AND a.protocole = 'Modbus TCP'
      ORDER BY v.id_variable
      `),
    ]);
  } catch (error) {
    console.error("Échec du chargement des automates ou variables à acquérir :", error);
    return false;
  }

  const now = Date.now();
  const activeAutomateIds = new Set(automates.map((automate) => Number(automate.id_automate)));
  for (const id of automateSchedules.keys()) {
    if (!activeAutomateIds.has(id)) {
      automateSchedules.delete(id);
    }
  }
  const connectionChecks = [];
  for (const automate of automates) {
    const id = Number(automate.id_automate);
    const nextAt = automateSchedules.get(id) ?? 0;
    if (now >= nextAt) {
      automateSchedules.set(id, now + AUTOMATE_CHECK_MS);
      connectionChecks.push(checkAutomateConnection(automate));
    }
  }
  await Promise.all(connectionChecks);

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

// Démarre la boucle d’acquisition indépendante des requêtes HTTP.
function startCollector() {
  const schedules = new Map();
  const automateSchedules = new Map();
  let stopped = false;
  let timer;
  let currentCycle = Promise.resolve();

  // Exécute un cycle puis programme le suivant, avec une temporisation si la BDD échoue.
  async function tick() {
    if (stopped) {
      return;
    }

    currentCycle = runCycle(schedules, automateSchedules);
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

  // Arrête le timer et attend la fin du cycle en cours.
  return async function stopCollector() {
    stopped = true;
    clearTimeout(timer);
    await currentCycle;
  };
}

module.exports = { startCollector };
