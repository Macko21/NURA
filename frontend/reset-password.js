"use strict";

const resetButton = document.getElementById("btn-reset");
let resetToastTimer;

function showResetToast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.classList.remove("hidden");
  clearTimeout(resetToastTimer);
  resetToastTimer = setTimeout(() => element.classList.add("hidden"), 4000);
}

function showResetSuccess() {
  const panel = document.querySelector(".glass-panel");
  panel.replaceChildren();
  const content = document.createElement("div");
  content.className = "reset-success";
  const icon = document.createElement("div");
  icon.className = "reset-success-icon";
  icon.textContent = "✓";
  const title = document.createElement("h2");
  title.textContent = "ACCESO ACTUALIZADO";
  const copy = document.createElement("p");
  copy.textContent = "Tu contraseña fue cambiada. Volviendo al inicio…";
  content.append(icon, title, copy);
  panel.appendChild(content);
  setTimeout(() => { window.location.href = "/"; }, 2500);
}

async function submitPasswordReset() {
  const token = new URLSearchParams(window.location.search).get("token");
  const newPassword = document.getElementById("new-pass").value;
  if (!token) return showResetToast("El enlace de recuperación es inválido");
  if (!newPassword || newPassword.length < 10 || newPassword.length > 128) {
    return showResetToast("La contraseña debe tener entre 10 y 128 caracteres");
  }

  resetButton.textContent = "Actualizando…";
  resetButton.disabled = true;
  try {
    const response = await fetch("/api/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Token inválido o expirado");
    showResetSuccess();
  } catch (error) {
    showResetToast(error.message || "Error de conexión");
    resetButton.textContent = "Actualizar acceso";
    resetButton.disabled = false;
  }
}

resetButton.addEventListener("click", submitPasswordReset);
document.getElementById("new-pass").addEventListener("keydown", event => {
  if (event.key === "Enter") resetButton.click();
});
