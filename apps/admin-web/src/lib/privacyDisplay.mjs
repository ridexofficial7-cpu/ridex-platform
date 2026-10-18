export function maskPhone(value) {
  const text = String(value ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (!digits) return "[MASKED]";
  if (digits.length < 4) return "[MASKED]";
  return `${text.startsWith("+") ? "+" : ""}••••••${digits.slice(-2)}`;
}

export function maskEmail(value) {
  const text = String(value ?? "").trim();
  const at = text.lastIndexOf("@");
  if (at <= 0 || at === text.length - 1) return "[MASKED]";
  return `${text.slice(0, 1)}•••${text.slice(at)}`;
}

export function maskCustomerField(key, value) {
  const field = String(key ?? "").toLowerCase();
  if (/email/.test(field)) return maskEmail(value);
  if (/mobile|phone|contact/.test(field)) return maskPhone(value);
  if (/address|pickup|dropoff|destination|origin|latitude|longitude|coordinates|(^|_)(lat|lng|lon)($|_)/.test(field)) return "[MASKED]";
  return value;
}
