const { isIP } = require("node:net");
const express = require("express");
const pool = require("../db");

const router = express.Router();
const columns = {
  nom: "nom",
  adresse_ip: "adresse_ip",
  port: "port",
  protocole: "protocole",
  unit_id: "unit_id",
  actif: "actif",
};
const selectFields = `
  id_automate, nom, adresse_ip, port, protocole, unit_id, actif
`;

function parseId(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validateBody(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Le corps de la requête doit être un objet JSON" };
  }

  const unknownFields = Object.keys(body).filter((key) => !Object.hasOwn(columns, key));
  if (unknownFields.length > 0) {
    return { error: `Champ(s) inconnu(s) : ${unknownFields.join(", ")}` };
  }

  if (partial && Object.keys(body).length === 0) {
    return { error: "Au moins un champ doit être fourni" };
  }

  const values = {};
  const has = (field) => Object.hasOwn(body, field);

  if (!partial || has("nom")) {
    if (typeof body.nom !== "string" || body.nom.trim().length === 0 || body.nom.trim().length > 100) {
      return { error: "nom doit contenir entre 1 et 100 caractères" };
    }
    values.nom = body.nom.trim();
  }

  if (!partial || has("adresse_ip")) {
    if (typeof body.adresse_ip !== "string" || isIP(body.adresse_ip) === 0) {
      return { error: "adresse_ip doit être une adresse IPv4 ou IPv6 valide" };
    }
    values.adresse_ip = body.adresse_ip;
  }

  if (has("port")) {
    if (!Number.isInteger(body.port) || body.port < 1 || body.port > 65535) {
      return { error: "port doit être un entier entre 1 et 65535" };
    }
    values.port = body.port;
  }

  if (has("protocole")) {
    if (body.protocole !== "Modbus TCP") {
      return { error: "Seul le protocole Modbus TCP est pris en charge" };
    }
    values.protocole = body.protocole;
  }

  if (has("unit_id")) {
    if (!Number.isInteger(body.unit_id) || body.unit_id < 0 || body.unit_id > 255) {
      return { error: "unit_id doit être un entier entre 0 et 255" };
    }
    values.unit_id = body.unit_id;
  }

  if (has("actif")) {
    if (typeof body.actif !== "boolean") {
      return { error: "actif doit être un booléen" };
    }
    values.actif = body.actif;
  }

  return { values };
}

router.get("/", async (_req, res) => {
  try {
    const automates = await pool.query(`
      SELECT ${selectFields}
      FROM automate
      ORDER BY id_automate
    `);
    res.json(automates);
  } catch (error) {
    console.error("Échec de la récupération des automates :", error);
    res.status(500).json({ error: "Impossible de récupérer les automates" });
  }
});

router.get("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Identifiant d’automate invalide" });
  }

  try {
    const automates = await pool.query(
      `SELECT ${selectFields} FROM automate WHERE id_automate = ?`,
      [id],
    );
    if (automates.length === 0) {
      return res.status(404).json({ error: "Automate introuvable" });
    }
    res.json(automates[0]);
  } catch (error) {
    console.error("Échec de la récupération de l’automate :", error);
    res.status(500).json({ error: "Impossible de récupérer l’automate" });
  }
});

router.post("/", async (req, res) => {
  const { values, error } = validateBody(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const result = await pool.query(
      `INSERT INTO automate (nom, adresse_ip, port, protocole, unit_id, actif)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        values.nom,
        values.adresse_ip,
        values.port ?? 502,
        values.protocole ?? "Modbus TCP",
        values.unit_id ?? 1,
        values.actif ?? true,
      ],
    );
    const automates = await pool.query(
      `SELECT ${selectFields} FROM automate WHERE id_automate = ?`,
      [result.insertId],
    );
    res.status(201).json(automates[0]);
  } catch (error) {
    console.error("Échec de la création de l’automate :", error);
    res.status(500).json({ error: "Impossible de créer l’automate" });
  }
});

router.patch("/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Identifiant d’automate invalide" });
  }

  const { values, error } = validateBody(req.body, true);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const existing = await pool.query(
      "SELECT id_automate FROM automate WHERE id_automate = ?",
      [id],
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: "Automate introuvable" });
    }

    const fields = Object.keys(values);
    await pool.query(
      `UPDATE automate SET ${fields.map((field) => `${columns[field]} = ?`).join(", ")}
       WHERE id_automate = ?`,
      [...fields.map((field) => values[field]), id],
    );
    const automates = await pool.query(
      `SELECT ${selectFields} FROM automate WHERE id_automate = ?`,
      [id],
    );
    res.json(automates[0]);
  } catch (error) {
    console.error("Échec de la modification de l’automate :", error);
    res.status(500).json({ error: "Impossible de modifier l’automate" });
  }
});

module.exports = router;
