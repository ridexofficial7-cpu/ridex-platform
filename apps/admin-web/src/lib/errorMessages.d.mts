export type Translator = (key: string, fallback?: string) => string;
export function localizedErrorMessage(error: unknown, t: Translator): string;
