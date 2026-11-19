// Fichier modifié avec l’assistance d’une IA ; les changements doivent être relus et validés.
require("dotenv").config({ path: "../.env" });
const pool = require("./db");
const express = require("express");
const automatesRoutes = require("./routes/automates");
const variablesRoutes = require("./routes/variables");
const relevesRoutes = require("./routes/releves");
const { startCollector } = require("./services/collector");

const app = express();
app.use(express.json());
app.use("/api/automates", automatesRoutes);
app.use("/api", variablesRoutes);
app.use("/api", relevesRoutes);

// GET /health : vérifie que le serveur HTTP Express répond.
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// GET /health/db : vérifie que le backend peut interroger MariaDB.
app.get("/health/db", async (_req, res) => {
  try {
    const rows = await pool.query("SELECT 1 AS result");
    res.json({ database: "ok", result: rows[0].result });
  } catch (error) {
    console.error("Échec de la requête MariaDB :", error);
    res.status(500).json({ database: "error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT doit être un entier entre 1 et 65535");
}

const stopCollector = startCollector();
const server = app.listen(port, () => {
  console.log(`API disponible sur http://localhost:${port}`);
});

let shuttingDown = false;
// Ferme proprement HTTP, le collecteur et le pool MariaDB à l’arrêt du processus.
function shutdown(signal) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`Arrêt demandé (${signal})`);

  server.close((serverError) => {
    if (serverError) {
      console.error("Échec de fermeture du serveur HTTP :", serverError);
      process.exitCode = 1;
    }

    void (async () => {
      try {
        await stopCollector();
        await pool.end();
      } catch (error) {
        console.error("Échec de l’arrêt des services backend :", error);
        process.exitCode = 1;
      }
    })();
  });
}

// Permet au processus de s’arrêter proprement lors d’un arrêt manuel ou Docker.
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));