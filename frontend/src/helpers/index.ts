// vamos a construir el objecto de la fecha para evitar problemas con el servidor
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // empiza en 0 enero +1, padStart completa la longitud
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// const dateNow = new Date().toISOString().split("T")[0];
