// Fichier développé avec l’assistance d’une IA ; le code doit être relu et validé par l’équipe.
const express = require("express");
const pool = require("../db");

const router = express.Router();
const MAX_HISTORY_ROWS = 1000;
const MAX_EXPORT_ROWS = 10000;
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

// Convertit un identifiant d’URL en entier positif, sinon retourne null.
function parseId(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Valide une date ISO 8601 avec fuseau et la convertit au format SQL UTC.
function parseTimestamp(value, field) {
  if (value === undefined) {
    return { value: null };
  }
  if (typeof value !== "string" || !timestampPattern.test(value)) {
    return { error: `${field} doit être une date ISO 8601 avec fuseau horaire` };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { error: `${field} n’est pas une date valide` };
  }

  return {
    value: date.toISOString().slice(0, 23).replace("T", " "),
    milliseconds: date.getTime(),
  };
}

// Valide les bornes temporelles et vérifie que la date de début précède la fin.
function parsePeriod(query) {
  const from = parseTimestamp(query.from, "from");
  if (from.error) {
    return { error: from.error };
  }
  const to = parseTimestamp(query.to, "to");
  if (to.error) {
    return { error: to.error };
  }
  if (from.value && to.value && from.milliseconds > to.milliseconds) {
    return { error: "from doit être antérieur ou égal à to" };
  }
  return { from: from.value, to: to.value };
}

// Valide le nombre de relevés à retourner en appliquant une limite maximale.
function parseLimit(value, defaultValue, maximum) {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit >= 1 && limit <= maximum
    ? limit
    : null;
}

// Vérifie que la variable existe avant de consulter ses relevés.
async function variableExists(id) {
  const rows = await pool.query(
    "SELECT id_variable FROM variable WHERE id_variable = ?",
    [id],
  );
  return rows.length > 0;
}

// Récupère les relevés d’une variable pour une période et une limite données.
async function getReadings(id, period, limit, direction = "ASC") {
  const conditions = ["id_variable = ?"];
  const parameters = [id];
  if (period.from) {
    conditions.push("horodatage >= ?");
    parameters.push(period.from);
  }
  if (period.to) {
    conditions.push("horodatage <= ?");
    parameters.push(period.to);
  }
  parameters.push(limit);

  return pool.query(
    `SELECT id_releve, id_variable, horodatage, valeur, qualite
     FROM releve
     WHERE ${conditions.join(" AND ")}
     ORDER BY horodatage ${direction}, id_releve ${direction}
     LIMIT ?`,
    parameters,
  );
}

// Échappe une valeur pour qu’elle reste dans une seule cellule CSV.
function escapeCsv(value) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

// Convertit l’identifiant BIGINT en chaîne pour permettre la sérialisation JSON.
function serializeReading(reading) {
  return { ...reading, id_releve: String(reading.id_releve) };
}

// Valide l’identifiant de variable et envoie directement la réponse d’erreur si nécessaire.
async function validateVariableRequest(req, res) {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Identifiant de variable invalide" });
    return null;
  }
  if (!(await variableExists(id))) {
    res.status(404).json({ error: "Variable introuvable" });
    return null;
  }
  return id;
}

// GET /api/variables/:id/releves/latest : renvoie le relevé le plus récent.
router.get("/variables/:id/releves/latest", async (req, res) => {
  try {
    const id = await validateVariableRequest(req, res);
    if (!id) {
      return;
    }

    const readings = await pool.query(
      `SELECT id_releve, id_variable, horodatage, valeur, qualite
       FROM releve
       WHERE id_variable = ?
       ORDER BY horodatage DESC, id_releve DESC
       LIMIT 1`,
      [id],
    );
    res.json(readings[0] ? serializeReading(readings[0]) : null);
  } catch (error) {
    console.error("Échec de la récupération du dernier relevé :", error);
    res.status(500).json({ error: "Impossible de récupérer le dernier relevé" });
  }
});

// GET /api/variables/:id/releves.csv : exporte une période limitée au format CSV.
router.get("/variables/:id/releves.csv", async (req, res) => {
  try {
    const id = await validateVariableRequest(req, res);
    if (!id) {
      return;
    }

    const period = parsePeriod(req.query);
    if (period.error) {
      return res.status(400).json({ error: period.error });
    }
    if (!period.from || !period.to) {
      return res.status(400).json({
        error: "Les paramètres from et to sont obligatoires pour l’export CSV",
      });
    }

    const readings = await getReadings(id, period, MAX_EXPORT_ROWS + 1);
    if (readings.length > MAX_EXPORT_ROWS) {
      return res.status(413).json({
        error: `La période dépasse la limite de ${MAX_EXPORT_ROWS} relevés`,
      });
    }

    const lines = [
      "id_releve,id_variable,horodatage,valeur,qualite",
      ...readings.map((reading) => [
        reading.id_releve,
        reading.id_variable,
        reading.horodatage,
        reading.valeur,
        reading.qualite,
      ].map(escapeCsv).join(",")),
    ];

    res
      .status(200)
      .set("Content-Type", "text/csv; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="variable-${id}-releves.csv"`)
      .send(lines.join("\r\n"));
  } catch (error) {
    console.error("Échec de l’export des relevés :", error);
    res.status(500).json({ error: "Impossible d’exporter les relevés" });
  }
});

// GET /api/variables/:id/releves : renvoie l’historique filtré et limité.
router.get("/variables/:id/releves", async (req, res) => {
  try {
    const id = await validateVariableRequest(req, res);
    if (!id) {
      return;
    }

    const period = parsePeriod(req.query);
    if (period.error) {
      return res.status(400).json({ error: period.error });
    }
    const limit = parseLimit(req.query.limit, MAX_HISTORY_ROWS, MAX_HISTORY_ROWS);
    if (limit === null) {
      return res.status(400).json({
        error: `limit doit être un entier entre 1 et ${MAX_HISTORY_ROWS}`,
      });
    }

    const readings = await getReadings(id, period, limit, "DESC");
    res.json(readings.reverse().map(serializeReading));
  } catch (error) {
    console.error("Échec de la récupération des relevés :", error);
    res.status(500).json({ error: "Impossible de récupérer les relevés" });
  }
});

module.exports = router;