// Monedas conocidas para "Moneda de visualización" (Configuración). Es una lista curada, no la ISO 4217
// completa: cubre las monedas más usadas del mundo y toda Latinoamérica, que es lo que de verdad va a
// buscar alguien que usa Moni. ARS es la moneda en la que se guardan los montos y siempre está disponible.

export interface Currency {
  code: string
  name: string
  symbol: string
}

export const CURRENCIES: Currency[] = [
  { code: 'ARS', name: 'Peso argentino', symbol: '$' },
  { code: 'USD', name: 'Dólar estadounidense', symbol: 'US$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'BRL', name: 'Real brasileño', symbol: 'R$' },
  { code: 'UYU', name: 'Peso uruguayo', symbol: '$U' },
  { code: 'CLP', name: 'Peso chileno', symbol: 'CLP$' },
  { code: 'PYG', name: 'Guaraní paraguayo', symbol: '₲' },
  { code: 'BOB', name: 'Boliviano', symbol: 'Bs' },
  { code: 'PEN', name: 'Sol peruano', symbol: 'S/' },
  { code: 'COP', name: 'Peso colombiano', symbol: 'COP$' },
  { code: 'VES', name: 'Bolívar venezolano', symbol: 'Bs.' },
  { code: 'MXN', name: 'Peso mexicano', symbol: 'MX$' },
  { code: 'GTQ', name: 'Quetzal guatemalteco', symbol: 'Q' },
  { code: 'HNL', name: 'Lempira hondureño', symbol: 'L' },
  { code: 'NIO', name: 'Córdoba nicaragüense', symbol: 'C$' },
  { code: 'CRC', name: 'Colón costarricense', symbol: '₡' },
  { code: 'PAB', name: 'Balboa panameño', symbol: 'B/.' },
  { code: 'DOP', name: 'Peso dominicano', symbol: 'RD$' },
  { code: 'CUP', name: 'Peso cubano', symbol: '$' },
  { code: 'GBP', name: 'Libra esterlina', symbol: '£' },
  { code: 'CHF', name: 'Franco suizo', symbol: 'CHF' },
  { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
  { code: 'CNY', name: 'Yuan chino', symbol: '¥' },
  { code: 'CAD', name: 'Dólar canadiense', symbol: 'CA$' },
  { code: 'AUD', name: 'Dólar australiano', symbol: 'AU$' },
  { code: 'NZD', name: 'Dólar neozelandés', symbol: 'NZ$' },
  { code: 'SEK', name: 'Corona sueca', symbol: 'kr' },
  { code: 'NOK', name: 'Corona noruega', symbol: 'kr' },
  { code: 'DKK', name: 'Corona danesa', symbol: 'kr' },
  { code: 'PLN', name: 'Esloti polaco', symbol: 'zł' },
  { code: 'CZK', name: 'Corona checa', symbol: 'Kč' },
  { code: 'HUF', name: 'Florín húngaro', symbol: 'Ft' },
  { code: 'RON', name: 'Leu rumano', symbol: 'lei' },
  { code: 'TRY', name: 'Lira turca', symbol: '₺' },
  { code: 'RUB', name: 'Rublo ruso', symbol: '₽' },
  { code: 'UAH', name: 'Grivna ucraniana', symbol: '₴' },
  { code: 'ILS', name: 'Nuevo séquel israelí', symbol: '₪' },
  { code: 'AED', name: 'Dirham de los Emiratos Árabes Unidos', symbol: 'د.إ' },
  { code: 'SAR', name: 'Rial saudí', symbol: '﷼' },
  { code: 'QAR', name: 'Rial catarí', symbol: 'ر.ق' },
  { code: 'EGP', name: 'Libra egipcia', symbol: 'E£' },
  { code: 'ZAR', name: 'Rand sudafricano', symbol: 'R' },
  { code: 'NGN', name: 'Naira nigeriana', symbol: '₦' },
  { code: 'KES', name: 'Chelín keniano', symbol: 'KSh' },
  { code: 'INR', name: 'Rupia india', symbol: '₹' },
  { code: 'PKR', name: 'Rupia pakistaní', symbol: '₨' },
  { code: 'BDT', name: 'Taka bangladesí', symbol: '৳' },
  { code: 'IDR', name: 'Rupia indonesia', symbol: 'Rp' },
  { code: 'MYR', name: 'Ringgit malayo', symbol: 'RM' },
  { code: 'SGD', name: 'Dólar de Singapur', symbol: 'S$' },
  { code: 'THB', name: 'Baht tailandés', symbol: '฿' },
  { code: 'VND', name: 'Dong vietnamita', symbol: '₫' },
  { code: 'PHP', name: 'Peso filipino', symbol: '₱' },
  { code: 'KRW', name: 'Won surcoreano', symbol: '₩' },
  { code: 'HKD', name: 'Dólar de Hong Kong', symbol: 'HK$' },
  { code: 'TWD', name: 'Nuevo dólar taiwanés', symbol: 'NT$' },
  { code: 'ISK', name: 'Corona islandesa', symbol: 'kr' },
  { code: 'BGN', name: 'Lev búlgaro', symbol: 'лв' },
  { code: 'HRK', name: 'Kuna croata', symbol: 'kn' },
  { code: 'RSD', name: 'Dinar serbio', symbol: 'дин.' },
  { code: 'MAD', name: 'Dirham marroquí', symbol: 'د.م.' },
  { code: 'TND', name: 'Dinar tunecino', symbol: 'د.ت' },
  { code: 'JOD', name: 'Dinar jordano', symbol: 'د.ا' },
  { code: 'KWD', name: 'Dinar kuwaití', symbol: 'د.ك' },
  { code: 'BHD', name: 'Dinar bahreiní', symbol: '.د.ب' },
  { code: 'OMR', name: 'Rial omaní', symbol: 'ر.ع.' },
  { code: 'LKR', name: 'Rupia de Sri Lanka', symbol: 'Rs' },
  { code: 'NPR', name: 'Rupia nepalí', symbol: 'Rs' },
  { code: 'GHS', name: 'Cedi ghanés', symbol: 'GH₵' },
  { code: 'ETB', name: 'Birr etíope', symbol: 'Br' },
  { code: 'TZS', name: 'Chelín tanzano', symbol: 'TSh' },
  { code: 'UGX', name: 'Chelín ugandés', symbol: 'USh' },
  { code: 'XOF', name: 'Franco CFA de África Occidental', symbol: 'CFA' },
  { code: 'XAF', name: 'Franco CFA de África Central', symbol: 'FCFA' },
]

export const DEFAULT_CURRENCY_CODE = 'ARS'

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]))

export function getCurrency(code: string): Currency | undefined {
  return BY_CODE.get(code)
}

/** Símbolo de la moneda, o el propio código si no está en la lista curada. */
export function currencySymbol(code: string): string {
  return BY_CODE.get(code)?.symbol ?? code
}
