const API_URL = "/api";

export async function getVariables() {
  const response = await fetch(`${API_URL}/variables`);

  if (!response.ok) {
    throw new Error("Impossible de récupérer les variables");
  }

  return response.json();
}

export async function createVariable(variable) {
  const response = await fetch(`${API_URL}/variables`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(variable)
  });

  if (!response.ok) {
    throw new Error("Impossible d'ajouter la variable");
  }

  return response.json();
}