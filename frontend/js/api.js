const API_URL = "/api";

async function request(path, options) {
  const response = await fetch(`${API_URL}${path}`, options);
  if (response.status === 204) {
    return null;
  }

  let result;
  try {
    result = await response.json();
  } catch {
    if (!response.ok) {
      throw new Error(`La requête a échoué (${response.status})`);
    }
    throw new Error("Le serveur a renvoyé une réponse JSON invalide");
  }
  if (!response.ok) {
    throw new Error(result.error || `La requête a échoué (${response.status})`);
  }
  return result;
}

export function getAutomates() {
  return request("/automates");
}

export function createAutomate(automate) {
  return request("/automates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(automate),
  });
}

export function getVariables(automateId) {
  return request(`/automates/${encodeURIComponent(automateId)}/variables`);
}

export function getReadings(variableId, from, to) {
  const parameters = new URLSearchParams({ limit: "1000" });
  if (from) {
    parameters.set("from", from);
  }
  if (to) {
    parameters.set("to", to);
  }
  return request(`/variables/${encodeURIComponent(variableId)}/releves?${parameters}`);
}

export function createVariable(automateId, variable) {
  return request(`/automates/${encodeURIComponent(automateId)}/variables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(variable),
  });
}

export function updateVariable(variableId, variable) {
  return request(`/variables/${encodeURIComponent(variableId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(variable),
  });
}

export function deleteVariable(variableId) {
  return request(`/variables/${encodeURIComponent(variableId)}`, {
    method: "DELETE",
  });
}
