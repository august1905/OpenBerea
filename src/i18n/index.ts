import type { BookCode } from '@/lib/bible/books';

import { en, enBooks } from './en';

// Every interface string lives in a translation file. English is the only language today;
// another language adds a folder like ./en with the same keys and registers it here.

export type MessageKey = keyof typeof en;
type Messages = Record<MessageKey, string>;

const languages: Record<string, { messages: Messages; books: typeof enBooks }> = {
  en: { messages: en, books: enBooks },
};

let current = 'en';

export function setLanguage(code: string) {
  if (languages[code]) current = code;
}

export function language() {
  return current;
}

/** Looks up an interface string and fills `{name}` placeholders. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = languages[current].messages[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => (name in params ? String(params[name]) : `{${name}}`));
}

export function bookName(code: BookCode): string {
  return languages[current].books[code].name;
}

export function bookAbbr(code: BookCode): string {
  return languages[current].books[code].abbr;
}

export function bookShort(code: BookCode): string {
  return languages[current].books[code].short;
}
