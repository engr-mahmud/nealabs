/** Only allow returning to pages inside the app (prevents open redirects). */
export function safeReturnPath(value: FormDataEntryValue | null, fallback: string): string {
  const v = typeof value === "string" ? value : "";
  return /^\/app(\/[\w\-/]*)?(\?[\w=&%-]*)?$/.test(v) ? v : fallback;
}

export function formId(formData: FormData, name = "id"): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.slice(0, 40) : "";
}
