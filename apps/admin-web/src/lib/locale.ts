import { getSavedLanguage } from "./languagePreference";

export function formatCurrencyINR(value: number): string {
  return new Intl.NumberFormat(getSavedLanguage(), { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);
}

export function formatDateTime(value: string | number | Date): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(getSavedLanguage(), { dateStyle: "medium", timeStyle: "short" }).format(date);
}
