import {
  createVariable,
  deleteVariable,
  getAutomates,
  getReadings,
  getVariables,
  updateVariable,
} from "./api.js";

const automateId = new URLSearchParams(window.location.search).get("automate");
const pageTitle = document.querySelector("#page-title");
const description = document.querySelector("#automate-description");
const connectionStatus = document.querySelector("#connection-status");
const pageMessage = document.querySelector("#page-message");
const variablesBody = document.querySelector("#variables-body");
const variableCount = document.querySelector("#variable-count");
const variableForm = document.querySelector("#variable-form");
const variableSubmit = document.querySelector("#variable-submit");
const variableCancel = document.querySelector("#variable-cancel");
const readingsBody = document.querySelector("#readings-body");
const readingCount = document.querySelector("#reading-count");
const chartCanvas = document.querySelector("#readings-chart");
const chartEmpty = document.querySelector("#chart-empty");
const chartWrap = document.querySelector(".chart-wrap");
const variableSelection = document.querySelector("#variable-selection");
const historyDays = document.querySelector("#history-days");
const historyDaysLabel = document.querySelector("#history-days-label");
const readingsPaginationInfo = document.querySelector("#readings-pagination-info");
const readingsPageLabel = document.querySelector("#readings-page-label");
const readingsPrevious = document.querySelector("#readings-previous");
const readingsNext = document.querySelector("#readings-next");
const colors = ["#2457d6", "#18a887", "#f0a43c", "#8d62d9", "#e15c68", "#18a6c4", "#68758a"];
const READINGS_PER_PAGE = 20;

const state = {
  automate: null,
  variables: [],
  readings: [],
  chart: null,
  readingsPage: 1,
  selectedVariableIds: null,
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showMessage(text, kind = "error") {
  pageMessage.textContent = text;
  pageMessage.className = `alert ${kind === "success" ? "alert-success" : "alert-danger"}`;
  pageMessage.hidden = false;
}

function hideMessage() {
  pageMessage.hidden = true;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? "—") : date.toLocaleString("fr-FR");
}

function variableFor(reading) {
  return state.variables.find((variable) => String(variable.id_variable) === String(reading.id_variable));
}

function selectedVariables() {
  return state.variables.filter((variable) => state.selectedVariableIds?.has(String(variable.id_variable)));
}

function filteredReadings() {
  const selectedIds = new Set(selectedVariables().map((variable) => String(variable.id_variable)));
  const cutoff = Date.now() - Number(historyDays.value) * 24 * 60 * 60 * 1000;
  return state.readings.filter((reading) => (
    selectedIds.has(String(reading.id_variable))
    && new Date(reading.horodatage).getTime() >= cutoff
  ));
}

function updateVariableFilters() {
  const availableIds = new Set(state.variables.map((variable) => String(variable.id_variable)));
  if (state.selectedVariableIds === null) {
    state.selectedVariableIds = availableIds;
  } else {
    state.selectedVariableIds = new Set(
      [...state.selectedVariableIds].filter((id) => availableIds.has(id)),
    );
  }
  variableSelection.innerHTML = state.variables.length === 0
    ? '<span class="small text-secondary">Aucune variable disponible.</span>'
    : state.variables.map((variable) => {
      const id = String(variable.id_variable);
      const selected = state.selectedVariableIds.has(id);
      return `<button class="btn btn-sm ${selected ? "btn-primary" : "btn-outline-secondary"} variable-selection-button" type="button" data-variable-id="${escapeHtml(id)}" aria-pressed="${selected}">${escapeHtml(variable.nom)}</button>`;
    }).join("");
}

function qualityBadge(quality) {
  const normalized = quality === "GOOD" ? "good" : "error";
  return `<span class="badge rounded-pill quality-${normalized}">${escapeHtml(quality)}</span>`;
}

function renderVariables() {
  variableCount.textContent = `${state.variables.length} variable${state.variables.length > 1 ? "s" : ""}`;
  if (state.variables.length === 0) {
    variablesBody.innerHTML = '<tr><td class="text-center text-secondary py-4" colspan="7">Aucune variable configurée. Ajoutez une adresse de registre ci-dessus.</td></tr>';
    return;
  }

  variablesBody.innerHTML = state.variables.map((variable) => `
    <tr data-id="${escapeHtml(variable.id_variable)}">
      <td class="fw-semibold text-dark">${escapeHtml(variable.nom)}</td>
      <td class="font-monospace">${escapeHtml(variable.adresse_variable)}</td>
      <td>${escapeHtml(variable.type_donnee)}</td>
      <td>${variable.unite ? escapeHtml(variable.unite) : "—"}</td>
      <td>${escapeHtml(variable.frequence_acquisition)} s</td>
      <td>
        <span class="badge rounded-pill ${variable.actif ? "text-bg-success" : "text-bg-secondary"}">${variable.actif ? "Active" : "En pause"}</span>
      </td>
      <td class="text-end">
        <div class="d-inline-flex flex-wrap justify-content-end gap-1">
          <button class="btn btn-sm btn-outline-primary" type="button" data-action="edit">Modifier</button>
          <button class="btn btn-sm btn-outline-secondary" type="button" data-action="toggle">${variable.actif ? "Désactiver" : "Activer"}</button>
          <button class="btn btn-sm btn-outline-danger" type="button" data-action="delete" aria-label="Supprimer ${escapeHtml(variable.nom)}">Supprimer</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderReadings() {
  const readings = filteredReadings();
  const pageCount = Math.max(1, Math.ceil(readings.length / READINGS_PER_PAGE));
  state.readingsPage = Math.min(state.readingsPage, pageCount);
  const pageStart = (state.readingsPage - 1) * READINGS_PER_PAGE;
  const pageReadings = readings.slice(pageStart, pageStart + READINGS_PER_PAGE);
  readingCount.textContent = `${readings.length} relevé${readings.length > 1 ? "s" : ""}`;
  readingsPaginationInfo.textContent = readings.length === 0
    ? "Aucun relevé pour ces filtres."
    : `Affichage de ${pageStart + 1} à ${Math.min(pageStart + READINGS_PER_PAGE, readings.length)} sur ${readings.length} relevés.`;
  readingsPageLabel.textContent = `${state.readingsPage} / ${pageCount}`;
  readingsPrevious.disabled = state.readingsPage <= 1;
  readingsPrevious.closest(".page-item").classList.toggle("disabled", readingsPrevious.disabled);
  readingsNext.disabled = state.readingsPage >= pageCount;
  readingsNext.closest(".page-item").classList.toggle("disabled", readingsNext.disabled);
  if (readings.length === 0) {
    readingsBody.innerHTML = '<tr><td class="text-center text-secondary py-4" colspan="5">Aucun relevé pour les variables et la période sélectionnées.</td></tr>';
    return;
  }

  readingsBody.innerHTML = pageReadings.map((reading) => {
    const variable = variableFor(reading);
    const variableName = variable?.nom ?? `Variable ${reading.id_variable}`;
    return `
      <tr>
        <td class="font-monospace text-secondary">#${escapeHtml(reading.id_releve)}</td>
        <td>${escapeHtml(formatDate(reading.horodatage))}</td>
        <td class="fw-semibold text-dark">${escapeHtml(variableName)}${variable?.unite ? ` <span class="text-secondary fw-normal">${escapeHtml(variable.unite)}</span>` : ""}</td>
        <td class="reading-value">${reading.valeur === null ? "—" : escapeHtml(reading.valeur)}</td>
        <td>${qualityBadge(reading.qualite)}</td>
      </tr>`;
  }).join("");
}

function renderChart() {
  const readings = filteredReadings();
  const variables = selectedVariables();
  const timestamps = [...new Set(readings.map((reading) => new Date(reading.horodatage).getTime()).filter(Number.isFinite))]
    .sort((left, right) => left - right);
  if (!window.Chart || timestamps.length === 0 || variables.length === 0) {
    chartEmpty.textContent = variables.length === 0
      ? "Cochez au moins une variable pour afficher les données."
      : "Aucune donnée disponible pour les variables et la période sélectionnées.";
    chartWrap.hidden = true;
    chartEmpty.hidden = false;
    if (state.chart) {
      state.chart.destroy();
      state.chart = null;
    }
    return;
  }

  chartEmpty.hidden = true;
  chartWrap.hidden = false;
  if (state.chart) {
    state.chart.destroy();
  }
  const labels = timestamps.map((timestamp) => new Date(timestamp).toISOString());
  const datasets = variables.map((variable, index) => {
    const readingsByTime = new Map(
      readings
        .filter((reading) => String(reading.id_variable) === String(variable.id_variable))
        .map((reading) => [new Date(reading.horodatage).getTime(), reading.valeur]),
    );
    return {
      label: `${variable.nom}${variable.unite ? ` (${variable.unite})` : ""}`,
      data: timestamps.map((timestamp) => readingsByTime.get(timestamp) ?? null),
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length],
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      spanGaps: false,
      tension: 0.28,
    };
  });

  state.chart = new window.Chart(chartCanvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8, padding: 18 } },
        tooltip: {
          callbacks: {
            title(items) {
              return items[0] ? formatDate(items[0].label) : "";
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            maxTicksLimit: 8,
            callback(index) {
              const date = new Date(labels[index]);
              return date.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
            },
          },
        },
        y: { grid: { color: "#edf0f5" } },
      },
    },
  });
}

async function refreshData() {
  state.variables = await getVariables(automateId);
  updateVariableFilters();
  renderVariables();

  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = start.toISOString();
  const to = end.toISOString();
  const readingsByVariable = await Promise.all(state.variables.map(async (variable) => ({
    readings: await getReadings(variable.id_variable, from, to),
  })));
  state.readings = readingsByVariable.flatMap(({ readings }) => readings)
    .sort((left, right) => new Date(right.horodatage) - new Date(left.horodatage));
  state.readingsPage = 1;
  renderReadings();
  renderChart();

  description.textContent = `${state.automate.adresse_ip}:${state.automate.port} · ${state.automate.protocole} · ${state.variables.length} variable${state.variables.length > 1 ? "s" : ""}`;
}

function updateHistoryDaysLabel() {
  const days = Number(historyDays.value);
  historyDaysLabel.value = `${days} dernier${days > 1 ? "s" : ""} jour${days > 1 ? "s" : ""}`;
}

function resetVariableForm() {
  variableForm.reset();
  variableForm.elements.id_variable.value = "";
  variableForm.elements.frequence_acquisition.value = "1";
  variableForm.elements.actif.checked = true;
  variableSubmit.textContent = "＋ Ajouter la variable";
  variableCancel.hidden = true;
}

function editVariable(variable) {
  variableForm.elements.id_variable.value = variable.id_variable;
  variableForm.elements.nom.value = variable.nom;
  variableForm.elements.adresse_variable.value = variable.adresse_variable;
  variableForm.elements.type_donnee.value = variable.type_donnee;
  variableForm.elements.unite.value = variable.unite ?? "";
  variableForm.elements.frequence_acquisition.value = variable.frequence_acquisition;
  variableForm.elements.actif.checked = Boolean(variable.actif);
  variableSubmit.textContent = "Enregistrer les modifications";
  variableCancel.hidden = false;
  variableForm.scrollIntoView({ behavior: "smooth", block: "center" });
  variableForm.elements.nom.focus();
}

async function loadPage() {
  if (!automateId || !/^\d+$/.test(automateId)) {
    description.textContent = "Aucun automate valide n’a été sélectionné.";
    connectionStatus.className = "badge rounded-pill px-3 py-2 text-bg-secondary";
    connectionStatus.textContent = "Non disponible";
    variablesBody.innerHTML = '<tr><td class="text-center text-secondary py-4" colspan="7">Sélectionnez une API depuis la page d’accueil.</td></tr>';
    readingsBody.innerHTML = '<tr><td class="text-center text-secondary py-4" colspan="5">Aucun automate sélectionné.</td></tr>';
    showMessage("Identifiant d’API manquant ou invalide.");
    return;
  }

  try {
    const automates = await getAutomates();
    state.automate = automates.find((item) => String(item.id_automate) === automateId);
    if (!state.automate) {
      throw new Error("Cette API est introuvable.");
    }
    pageTitle.textContent = `Suivi Process ${state.automate.nom}`;
    document.title = `Suivi Process ${state.automate.nom}`;
    connectionStatus.className = `badge rounded-pill px-3 py-2 ${state.automate.actif ? "text-bg-success" : "text-bg-secondary"}`;
    connectionStatus.textContent = state.automate.actif ? "Automate actif" : "Automate inactif";
    await refreshData();
  } catch (error) {
    connectionStatus.className = "badge rounded-pill px-3 py-2 text-bg-danger";
    connectionStatus.textContent = "Erreur";
    variablesBody.innerHTML = '<tr><td class="text-center text-secondary py-4" colspan="7">Impossible de charger les variables.</td></tr>';
    readingsBody.innerHTML = '<tr><td class="text-center text-secondary py-4" colspan="5">Impossible de charger les relevés.</td></tr>';
    showMessage(error.message);
  }
}

variableForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideMessage();
  const form = variableForm.elements;
  const variable = {
    nom: form.nom.value.trim(),
    adresse_variable: Number(form.adresse_variable.value),
    type_donnee: form.type_donnee.value,
    unite: form.unite.value.trim() || null,
    frequence_acquisition: Number(form.frequence_acquisition.value),
    actif: form.actif.checked,
  };
  const variableId = form.id_variable.value;

  try {
    if (variableId) {
      await updateVariable(variableId, variable);
      showMessage("La configuration de la variable a été mise à jour.", "success");
    } else {
      await createVariable(automateId, variable);
      showMessage("La variable a été ajoutée à l’automate.", "success");
    }
    resetVariableForm();
    await refreshData();
  } catch (error) {
    showMessage(error.message);
  }
});

variableCancel.addEventListener("click", resetVariableForm);

variableSelection.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-variable-id]");
  if (!button) {
    return;
  }
  const id = button.dataset.variableId;
  if (state.selectedVariableIds.has(id)) {
    state.selectedVariableIds.delete(id);
  } else {
    state.selectedVariableIds.add(id);
  }
  updateVariableFilters();
  state.readingsPage = 1;
  renderReadings();
  renderChart();
});
historyDays.addEventListener("input", () => {
  updateHistoryDaysLabel();
  state.readingsPage = 1;
  renderReadings();
  renderChart();
});
readingsPrevious.addEventListener("click", () => {
  state.readingsPage -= 1;
  renderReadings();
});
readingsNext.addEventListener("click", () => {
  state.readingsPage += 1;
  renderReadings();
});

variablesBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const variable = state.variables.find((item) => String(item.id_variable) === button.closest("tr")?.dataset.id);
  if (!variable) {
    return;
  }

  if (button.dataset.action === "edit") {
    editVariable(variable);
    return;
  }

  hideMessage();
  try {
    if (button.dataset.action === "toggle") {
      await updateVariable(variable.id_variable, { actif: !variable.actif });
      await refreshData();
      showMessage(variable.actif ? "Les acquisitions de cette variable sont en pause." : "Les acquisitions de cette variable ont repris.", "success");
    } else if (button.dataset.action === "delete") {
      const confirmed = window.confirm(`Supprimer la variable « ${variable.nom} » et tous ses relevés associés ? Préférez « Désactiver » pour conserver l’historique.`);
      if (!confirmed) {
        return;
      }
      await deleteVariable(variable.id_variable);
      if (String(variableForm.elements.id_variable.value) === String(variable.id_variable)) {
        resetVariableForm();
      }
      await refreshData();
      showMessage("La variable et son historique associé ont été supprimés.", "success");
    }
  } catch (error) {
    showMessage(error.message);
  }
});

updateHistoryDaysLabel();
loadPage();
