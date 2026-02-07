/**
 * TCMB (Turkish Central Bank) Exchange Rate Service
 * Fetches daily exchange rates from TCMB's XML feed
 * Uses official TCMB cross rates (CrossRateUSD, CrossRateOther)
 */

// Supported currencies for our application
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'];

export interface TcmbRate {
  currencyCode: string;
  currencyName: string;
  unit: number;
  forexBuying: number;
  forexSelling: number;
  crossRateUSD: number | null;   // How many of this currency = 1 USD
  crossRateOther: number | null; // For EUR/GBP: rate against EUR (1 XXX = Y USD)
  date: string;
}

export interface ExchangeRateData {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
}

/**
 * Parse TCMB XML response to extract exchange rates including cross rates
 */
export function parseTcmbXml(xml: string): TcmbRate[] {
  const rates: TcmbRate[] = [];

  // Extract date from root element
  const dateMatch = xml.match(/Tarih="([^"]+)"/);
  const date = dateMatch ? dateMatch[1] : new Date().toLocaleDateString('tr-TR');

  // Parse each Currency element
  const currencyRegex = /<Currency[^>]*Kod="([^"]+)"[^>]*CurrencyCode="([^"]+)"[^>]*>([\s\S]*?)<\/Currency>/g;
  let match;

  while ((match = currencyRegex.exec(xml)) !== null) {
    const currencyCode = match[2];

    // Only process supported currencies
    if (!SUPPORTED_CURRENCIES.includes(currencyCode)) {
      continue;
    }

    const content = match[3];

    // Extract values from XML content
    const unitMatch = content.match(/<Unit>(\d+)<\/Unit>/);
    const nameMatch = content.match(/<CurrencyName>([^<]+)<\/CurrencyName>/);
    const forexBuyingMatch = content.match(/<ForexBuying>([^<]+)<\/ForexBuying>/);
    const forexSellingMatch = content.match(/<ForexSelling>([^<]+)<\/ForexSelling>/);
    const crossRateUSDMatch = content.match(/<CrossRateUSD>([^<]+)<\/CrossRateUSD>/);
    const crossRateOtherMatch = content.match(/<CrossRateOther>([^<]+)<\/CrossRateOther>/);

    if (forexBuyingMatch && forexSellingMatch) {
      rates.push({
        currencyCode,
        currencyName: nameMatch ? nameMatch[1] : currencyCode,
        unit: unitMatch ? parseInt(unitMatch[1], 10) : 1,
        forexBuying: parseFloat(forexBuyingMatch[1]),
        forexSelling: parseFloat(forexSellingMatch[1]),
        crossRateUSD: crossRateUSDMatch ? parseFloat(crossRateUSDMatch[1]) : null,
        crossRateOther: crossRateOtherMatch ? parseFloat(crossRateOtherMatch[1]) : null,
        date,
      });
    }
  }

  return rates;
}

/**
 * Fetch exchange rates from TCMB API
 * Uses the daily XML feed: https://www.tcmb.gov.tr/kurlar/today.xml
 */
export async function fetchTcmbRates(): Promise<TcmbRate[]> {
  const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

  try {
    const response = await fetch(TCMB_URL, {
      headers: {
        'Accept': 'application/xml',
        'User-Agent': 'BTS-Teklif-Sistemi/1.0',
      },
      // Add timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`TCMB API hatası: ${response.status}`);
    }

    const xml = await response.text();
    return parseTcmbXml(xml);
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'TimeoutError') {
        throw new Error('TCMB API zaman aşımı');
      }
      throw error;
    }
    throw new Error('TCMB API hatası');
  }
}

/**
 * Convert TCMB rate to our exchange rate format
 * Uses the average of buying and selling rates
 */
export function tcmbRateToExchangeRate(tcmbRate: TcmbRate): ExchangeRateData {
  // Calculate average rate (midpoint between buying and selling)
  const averageRate = (tcmbRate.forexBuying + tcmbRate.forexSelling) / 2;

  return {
    fromCurrency: tcmbRate.currencyCode,
    toCurrency: 'TRY',
    rate: averageRate,
  };
}

/**
 * Calculate all exchange rate pairs from TCMB rates
 * Uses official TCMB cross rates where available
 *
 * TCMB provides:
 * - ForexBuying/ForexSelling: Rate against TRY
 * - CrossRateOther for EUR: 1 EUR = X USD (e.g., 1.1878)
 * - CrossRateOther for GBP: 1 GBP = X USD (e.g., 1.3691)
 */
export function calculateAllExchangeRates(tcmbRates: TcmbRate[]): ExchangeRateData[] {
  const allRates: ExchangeRateData[] = [];

  // Find specific rates
  const usdRate = tcmbRates.find(r => r.currencyCode === 'USD');
  const eurRate = tcmbRates.find(r => r.currencyCode === 'EUR');
  const gbpRate = tcmbRates.find(r => r.currencyCode === 'GBP');

  if (!usdRate || !eurRate || !gbpRate) {
    throw new Error('TCMB verilerinde USD, EUR veya GBP bulunamadı');
  }

  // Calculate average TRY rates
  const usdTry = (usdRate.forexBuying + usdRate.forexSelling) / 2;
  const eurTry = (eurRate.forexBuying + eurRate.forexSelling) / 2;
  const gbpTry = (gbpRate.forexBuying + gbpRate.forexSelling) / 2;

  // Get official TCMB cross rates
  // CrossRateOther for EUR = EUR/USD (1 EUR = X USD)
  // CrossRateOther for GBP = GBP/USD (1 GBP = X USD)
  const eurUsd = eurRate.crossRateOther ?? (eurTry / usdTry);
  const gbpUsd = gbpRate.crossRateOther ?? (gbpTry / usdTry);

  // Calculate GBP/EUR from official rates
  const gbpEur = gbpUsd / eurUsd;

  // Helper to round to 6 decimal places
  const round = (n: number) => Math.round(n * 1000000) / 1000000;

  // === TRY rates ===
  allRates.push({ fromCurrency: 'USD', toCurrency: 'TRY', rate: round(usdTry) });
  allRates.push({ fromCurrency: 'EUR', toCurrency: 'TRY', rate: round(eurTry) });
  allRates.push({ fromCurrency: 'GBP', toCurrency: 'TRY', rate: round(gbpTry) });

  // === Inverse TRY rates ===
  allRates.push({ fromCurrency: 'TRY', toCurrency: 'USD', rate: round(1 / usdTry) });
  allRates.push({ fromCurrency: 'TRY', toCurrency: 'EUR', rate: round(1 / eurTry) });
  allRates.push({ fromCurrency: 'TRY', toCurrency: 'GBP', rate: round(1 / gbpTry) });

  // === USD cross rates (from TCMB CrossRateOther) ===
  allRates.push({ fromCurrency: 'EUR', toCurrency: 'USD', rate: round(eurUsd) });
  allRates.push({ fromCurrency: 'GBP', toCurrency: 'USD', rate: round(gbpUsd) });
  allRates.push({ fromCurrency: 'USD', toCurrency: 'EUR', rate: round(1 / eurUsd) });
  allRates.push({ fromCurrency: 'USD', toCurrency: 'GBP', rate: round(1 / gbpUsd) });

  // === EUR/GBP cross rates (derived from USD rates) ===
  allRates.push({ fromCurrency: 'GBP', toCurrency: 'EUR', rate: round(gbpEur) });
  allRates.push({ fromCurrency: 'EUR', toCurrency: 'GBP', rate: round(1 / gbpEur) });

  return allRates;
}

/**
 * Get exchange rate between two currencies
 * Returns the rate to convert FROM -> TO
 */
export function getExchangeRate(
  rates: ExchangeRateData[],
  from: string,
  to: string
): number | null {
  if (from === to) return 1;

  const rate = rates.find(r => r.fromCurrency === from && r.toCurrency === to);
  return rate?.rate ?? null;
}

/**
 * Convert amount from one currency to another
 */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: ExchangeRateData[]
): number | null {
  const rate = getExchangeRate(rates, from, to);
  if (rate === null) return null;
  return amount * rate;
}
