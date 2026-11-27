import { createAutomate, createVariable, deleteAutomate, getAutomates, getVariables, getBackendStatus } from "./api.js";

const automatesList = document.querySelector("#automates-list");
const message = document.querySelector("#page-message");
const count = document.querySelector("#automate-count");
const automateDialog = document.querySelector("#automate-dialog");
const automateForm = document.querySelector("#automate-form");
const automateFormMessage = document.querySelector("#automate-form-message");
const variableRows = document.querySelector("#new-variable-rows");
const saveAutomateButton = document.querySelector("#save-automate");
let variableRowId = 0;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showError(error) {
  message.textContent = error.message;
  message.className = "alert alert-danger";
  message.hidden = false;
  automatesList.innerHTML = "";
}

function showPageMessage(text, kind = "success") {
  message.textContent = text;
  message.className = `alert alert-${kind}`;
  message.hidden = false;
}

function connectionBadge(connection) {
  const states = {
    connected: ["text-bg-success", "Connecté"],
    disconnected: ["text-bg-danger", "Déconnecté"],
    inactive: ["text-bg-secondary", "Automate inactif"],
    unknown: ["text-bg-warning", "Connexion inconnue"],
  };
  return states[connection] ?? states.unknown;
}

async function refreshAutomateStatuses() {
  try {
    const automates = await getAutomates();
    for (const automate of automates) {
      const badge = automatesList.querySelector(
        `[data-connection-status="${automate.id_automate}"]`,
      );
      if (!badge) {
        continue;
      }
      const [style, label] = connectionBadge(automate.connection);
      badge.className = `badge rounded-pill ${style}`;
      badge.textContent = label;
    }
  } catch (error) {
    console.error("Erreur lors de la récupération des connexions des automates :", error);
  }
}

function refreshbackendStatus() {
  const statusElement = document.querySelector("#backend-status");
  const dotElement = document.querySelector(".status-dot");
  getBackendStatus()
    .then((status) => {
      statusElement.textContent = status.status;
      dotElement.className = `status-dot ${status.status === "OK" ? "bg-success" : "bg-danger"}`;
    })
    .catch((error) => {
      statusElement.textContent = "Erreur";
      dotElement.className = "status-dot bg-danger";
      console.error("Erreur lors de la récupération du statut du backend :", error);
    });
}

function resetAutomateForm() {
  automateForm.reset();
  variableRows.replaceChildren();
  automateFormMessage.textContent = "";
  automateFormMessage.hidden = true;
  saveAutomateButton.disabled = false;
  saveAutomateButton.textContent = "Enregistrer l’API";
}

function addVariableRow() {
  const rowId = ++variableRowId;
  const row = document.createElement("div");
  row.className = "new-variable-row rounded-3 border p-3 mb-3";
  row.innerHTML = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h3 class="h6 fw-bold mb-0">Variable</h3>
      <button class="btn btn-sm btn-outline-danger" type="button" data-remove-variable>Supprimer</button>
    </div>
    <div class="row g-3 align-items-end">
      <div class="col-12 col-md-6">
        <label class="form-label" for="new-variable-name-${rowId}">Nom de la donnée</label>
        <input id="new-variable-name-${rowId}" class="form-control" data-field="nom" type="text" maxlength="100" required placeholder="Ex. Température">
      </div>
      <div class="col-6 col-md-3">
        <label class="form-label" for="new-variable-address-${rowId}">Adresse registre</label>
        <input id="new-variable-address-${rowId}" class="form-control" data-field="adresse_variable" type="number" min="0" max="65535" step="1" required placeholder="Ex. 10">
      </div>
      <div class="col-6 col-md-3">
        <label class="form-label" for="new-variable-type-${rowId}">Type</label>
        <select id="new-variable-type-${rowId}" class="form-select" data-field="type_donnee" required>
          <option value="INT16">INT16 (signé)</option>
          <option value="UINT16">UINT16 (non signé)</option>
        </select>
      </div>
      <div class="col-6 col-md-4">
        <label class="form-label" for="new-variable-unit-${rowId}">Unité <span class="text-secondary fw-normal">(facultative)</span></label>
        <input id="new-variable-unit-${rowId}" class="form-control" data-field="unite" type="text" maxlength="20" placeholder="Ex. °C">
      </div>
      <div class="col-6 col-md-4">
        <label class="form-label" for="new-variable-frequency-${rowId}">Fréquence (secondes)</label>
        <input id="new-variable-frequency-${rowId}" class="form-control" data-field="frequence_acquisition" type="number" min="1" max="2147483647" step="1" value="1" required>
      </div>
      <div class="col-12 col-md-4">
        <div class="form-check">
          <input id="new-variable-active-${rowId}" class="form-check-input" data-field="actif" type="checkbox" checked>
          <label class="form-check-label" for="new-variable-active-${rowId}">Acquisition active</label>
        </div>
      </div>
    </div>
  `;
  row.querySelector("[data-remove-variable]").addEventListener("click", () => row.remove());
  variableRows.append(row);
}

function readNewVariables() {
  return [...variableRows.querySelectorAll(".new-variable-row")].map((row) => {
    const value = (name) => row.querySelector(`[data-field="${name}"]`).value;
    return {
      nom: value("nom").trim(),
      adresse_variable: Number(value("adresse_variable")),
      type_donnee: value("type_donnee"),
      unite: value("unite").trim(),
      frequence_acquisition: Number(value("frequence_acquisition")),
      actif: row.querySelector('[data-field="actif"]').checked,
    };
  });
}

function showAutomateFormError(text) {
  automateFormMessage.textContent = text;
  automateFormMessage.hidden = false;
}

async function submitAutomateForm(event) {
  event.preventDefault();
  if (!automateForm.reportValidity()) {
    return;
  }

  saveAutomateButton.disabled = true;
  saveAutomateButton.textContent = "Enregistrement…";
  automateFormMessage.hidden = true;

  let automate;
  try {
    automate = await createAutomate({
      nom: automateForm.elements.nom.value.trim(),
      adresse_ip: automateForm.elements.adresse_ip.value.trim(),
      port: Number(automateForm.elements.port.value),
      protocole: "Modbus TCP",
      unit_id: Number(automateForm.elements.unit_id.value),
      actif: true,
    });
  } catch (error) {
    showAutomateFormError(error.message);
    saveAutomateButton.disabled = false;
    saveAutomateButton.textContent = "Enregistrer l’API";
    return;
  }

  const variables = readNewVariables();
  const failures = [];
  let createdVariables = 0;
  for (const variable of variables) {
    try {
      await createVariable(automate.id_automate, variable);
      createdVariables += 1;
    } catch (error) {
      failures.push(error.message);
    }
  }

  automateDialog.close();
  const listLoaded = await loadAutomates();
  if (!listLoaded) {
    return;
  }
  if (failures.length > 0) {
    showPageMessage(
      `L’API « ${automate.nom} » a été créée, mais seules ${createdVariables} variable(s) sur ${variables.length} ont été enregistrées. Ouvrez sa fiche pour corriger les variables restantes. Détail : ${failures.join(" ; ")}`,
      "warning",
    );
    return;
  }

  showPageMessage(
    `L’API « ${automate.nom} » et ses ${createdVariables} variable(s) ont été enregistrées.`,
  );
}

async function loadAutomates() {
  try {
    const automates = await getAutomates();
    const items = await Promise.all(automates.map(async (automate) => ({
      automate,
      variables: await getVariables(automate.id_automate),
    })));

    count.textContent = `${automates.length} API${automates.length > 1 ? " disponibles" : " disponible"}`;
    if (items.length === 0) {
      automatesList.innerHTML = '<div class="col-12"><div class="card border-0 shadow-sm"><div class="card-body text-center py-5"><div class="display-6 text-primary mb-2">⌁</div><h3 class="h5 fw-bold">Aucune API configurée</h3><p class="text-secondary mb-0">Ajoutez un automate dans votre configuration pour commencer le suivi.</p></div></div></div>';
      return true;
    }

    automatesList.innerHTML = items.map(({ automate, variables }) => `
      <div class="col-12 col-md-6 col-lg-4">
        <div class="card automate-card h-100 border-0 shadow-sm">
        <a class="text-decoration-none text-reset" href="./suivi.html?automate=${encodeURIComponent(automate.id_automate)}">
          <div class="card-body p-4">
            <div class="d-flex align-items-center justify-content-between mb-4">
              <span class="brand-mark fs-4" aria-hidden="true">⌁</span>
              <span class="badge rounded-pill ${automate.actif ? "text-bg-success" : "text-bg-secondary"}">${automate.actif ? "Actif" : "Inactif"}</span>
            </div>
            <h3 class="h5 fw-bold mb-1">${escapeHtml(automate.nom)}</h3>
            <p class="text-secondary small mb-4">${escapeHtml(automate.adresse_ip)}:${escapeHtml(automate.port)}</p>
            <span class="badge rounded-pill d-inline-block mb-3 ${connectionBadge(automate.connection)[0]}" data-connection-status="${escapeHtml(automate.id_automate)}">${connectionBadge(automate.connection)[1]}</span>
            <div class="d-flex justify-content-between align-items-center border-top pt-3 small text-secondary">
              <span>${variables.length} variable${variables.length > 1 ? "s" : ""} configurée${variables.length > 1 ? "s" : ""}</span>
              <span class="text-primary fs-5" aria-hidden="true">→</span>
            </div>
          </div>
        </a>
        <div class="card-footer bg-white border-0 px-4 pb-4 pt-0">
          <button class="btn btn-outline-danger btn-sm w-100" type="button" data-delete-automate="${escapeHtml(automate.id_automate)}" data-automate-name="${escapeHtml(automate.nom)}">Supprimer l’API</button>
        </div>
        </div>
      </div>
    `).join("");
    return true;
  } catch (error) {
    showError(error);
    return false;
  }
}

automatesList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-delete-automate]");
  if (!button) {
    return;
  }

  const automateId = button.dataset.deleteAutomate;
  const automateName = button.dataset.automateName;
  const confirmed = window.confirm(
    `Supprimer l’API « ${automateName} » ? Ses variables et tous les relevés associés seront également supprimés. Cette action est irréversible.`,
  );
  if (!confirmed) {
    return;
  }

  button.disabled = true;
  button.textContent = "Suppression…";
  try {
    await deleteAutomate(automateId);
    if (await loadAutomates()) {
      showPageMessage(`L’API « ${automateName} » et ses données associées ont été supprimées.`);
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = "Supprimer l’API";
    showPageMessage(error.message, "danger");
  }
});

document.querySelector("#open-automate-form").addEventListener("click", () => {
  automateDialog.showModal();
});
document.querySelector("#close-automate-form").addEventListener("click", () => automateDialog.close());
document.querySelector("#cancel-automate-form").addEventListener("click", () => automateDialog.close());
document.querySelector("#add-variable-row").addEventListener("click", addVariableRow);
automateForm.addEventListener("submit", submitAutomateForm);
automateDialog.addEventListener("close", resetAutomateForm);

loadAutomates();

// Actualisation du statut backend toutes les 5 secondes
setInterval(refreshbackendStatus, 5000);
setInterval(refreshAutomateStatuses, 5000);