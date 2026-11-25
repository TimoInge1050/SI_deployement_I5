// Fichier développé avec l’assistance d’une IA ; le code doit être relu et validé par l’équipe.
const express = require("express");
const pool = require("../db");

const router = express.Router();
const columns = {
  nom: "nom",
  adresse_variable: "adresse_variable",
  type_donnee: "type_donnee",
  unite: "unite",
  frequence_acquisition: "frequence_acquisition",
  actif: "actif",
};
const selectFields = `
  id_variable, id_automate, nom, adresse_variable, type_donnee,
  unite, frequence_acquisition, actif
`;
const dataTypes = new Set(["INT16", "UINT16"]);

// Convertit un identifiant d’URL en entier positif, sinon retourne null.
function parseId(value) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Valide un entier dans la plage demandée, y compris lorsqu’il vient d’un formulaire.
function parseInteger(value, minimum, maximum) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+$/.test(value)
      ? Number(value)
      : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

// Valide les champs d’une variable avant son insertion ou sa mise à jour partielle.
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

  if (!partial || has("adresse_variable")) {
    const address = parseInteger(body.adresse_variable, 0, 65535);
    if (address === null) {
      return { error: "adresse_variable doit être un offset entier entre 0 et 65535" };
    }
    values.adresse_variable = String(address);
  }

  if (!partial || has("type_donnee")) {
    const dataType = typeof body.type_donnee === "string"
      ? body.type_donnee.toUpperCase()
      : "";
    if (!dataTypes.has(dataType)) {
      return { error: "type_donnee doit être INT16 ou UINT16" };
    }
    values.type_donnee = dataType;
  }

  if (has("unite")) {
    if (body.unite === null) {
      values.unite = null;
    } else if (typeof body.unite === "string" && body.unite.trim().length <= 20) {
      values.unite = body.unite.trim() || null;
    } else {
      return { error: "unite doit être une chaîne de 20 caractères maximum ou null" };
    }
  }

  if (has("frequence_acquisition")) {
    const frequency = parseInteger(body.frequence_acquisition, 1, 2147483647);
    if (frequency === null) {
      return { error: "frequence_acquisition doit être un entier positif en secondes" };
    }
    values.frequence_acquisition = frequency;
  } else if (!partial) {
    values.frequence_acquisition = 1;
  }

  if (has("actif")) {
    if (typeof body.actif !== "boolean") {
      return { error: "actif doit être un booléen" };
    }
    values.actif = body.actif;
  } else if (!partial) {
    values.actif = true;
  }

  return { values };
}

// GET /api/automates/:automateId/variables : liste les variables d’un automate.
router.get("/automates/:automateId/variables", async (req, res) => {
  const automateId = parseId(req.params.automateId);
  if (!automateId) {
    return res.status(400).json({ error: "Identifiant d’automate invalide" });
  }

  try {
    const automates = await pool.query(
      "SELECT id_automate FROM automate WHERE id_automate = ?",
      [automateId],
    );
    if (automates.length === 0) {
      return res.status(404).json({ error: "Automate introuvable" });
    }

    const variables = await pool.query(
      `SELECT ${selectFields} FROM variable
       WHERE id_automate = ? ORDER BY id_variable`,
      [automateId],
    );
    res.json(variables);
  } catch (error) {
    console.error("Échec de la récupération des variables :", error);
    res.status(500).json({ error: "Impossible de récupérer les variables" });
  }
});

// POST /api/automates/:automateId/variables : ajoute une variable à un automate.
router.post("/automates/:automateId/variables", async (req, res) => {
  const automateId = parseId(req.params.automateId);
  if (!automateId) {
    return res.status(400).json({ error: "Identifiant d’automate invalide" });
  }

  const { values, error } = validateBody(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const automates = await pool.query(
      "SELECT id_automate FROM automate WHERE id_automate = ?",
      [automateId],
    );
    if (automates.length === 0) {
      return res.status(404).json({ error: "Automate introuvable" });
    }

    const result = await pool.query(
      `INSERT INTO variable
         (id_automate, nom, adresse_variable, type_donnee, unite, frequence_acquisition, actif)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        automateId,
        values.nom,
        values.adresse_variable,
        values.type_donnee,
        values.unite ?? null,
        values.frequence_acquisition,
        values.actif,
      ],
    );
    const variables = await pool.query(
      `SELECT ${selectFields} FROM variable WHERE id_variable = ?`,
      [result.insertId],
    );
    res.status(201).json(variables[0]);
  } catch (error) {
    console.error("Échec de la création de la variable :", error);
    res.status(500).json({ error: "Impossible de créer la variable" });
  }
});

// GET /api/variables/:id : renvoie la configuration d’une variable.
router.get("/variables/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Identifiant de variable invalide" });
  }

  try {
    const variables = await pool.query(
      `SELECT ${selectFields} FROM variable WHERE id_variable = ?`,
      [id],
    );
    if (variables.length === 0) {
      return res.status(404).json({ error: "Variable introuvable" });
    }
    res.json(variables[0]);
  } catch (error) {
    console.error("Échec de la récupération de la variable :", error);
    res.status(500).json({ error: "Impossible de récupérer la variable" });
  }
});

// PATCH /api/variables/:id : modifie la configuration ou désactive la variable.
router.patch("/variables/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Identifiant de variable invalide" });
  }

  const { values, error } = validateBody(req.body, true);
  if (error) {
    return res.status(400).json({ error });
  }

  try {
    const existing = await pool.query(
      "SELECT id_variable FROM variable WHERE id_variable = ?",
      [id],
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: "Variable introuvable" });
    }

    const fields = Object.keys(values);
    await pool.query(
      `UPDATE variable SET ${fields.map((field) => `${columns[field]} = ?`).join(", ")}
       WHERE id_variable = ?`,
      [...fields.map((field) => values[field]), id],
    );
    const variables = await pool.query(
      `SELECT ${selectFields} FROM variable WHERE id_variable = ?`,
      [id],
    );
    res.json(variables[0]);
  } catch (error) {
    console.error("Échec de la modification de la variable :", error);
    res.status(500).json({ error: "Impossible de modifier la variable" });
  }
});

// DELETE /api/variables/:id : supprime une variable et son historique associé.
router.delete("/variables/:id", async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Identifiant de variable invalide" });
  }

  try {
    const result = await pool.query(
      "DELETE FROM variable WHERE id_variable = ?",
      [id],
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Variable introuvable" });
    }
    res.status(204).end();
  } catch (error) {
    console.error("Échec de la suppression de la variable :", error);
    res.status(500).json({ error: "Impossible de supprimer la variable" });
  }
});

module.exports = router;