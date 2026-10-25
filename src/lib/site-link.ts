// Демо живёт отдельно от сайта: ссылки на услуги, цены и контакты ведут на tabletools.ru.
export const SITE_URL = 'https://tabletools.ru';
export const CONTACT_URL = `${SITE_URL}/kontakty/`;

export function siteHref(path: string): string {
  return `${SITE_URL}${path}`;
}
