/**
 * TCMB (Turkish Central Bank) Exchange Rate Service
 * Fetches daily exchange rates from TCMB's XML feed
 */

// Supported currencies for our application
const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'];

export interface TcmbRate {
  currencyCode: string;
  currencyName: string;
  unit: number;
  forexBuying: number;
  forexSelling: number;
  date: string;
}

/**
 * Parse TCMB XML response to extract exchange rates
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

    if (forexBuyingMatch && forexSellingMatch) {
      rates.push({
        currencyCode,
        currencyName: nameMatch ? nameMatch[1] : currencyCode,
        unit: unitMatch ? parseInt(unitMatch[1], 10) : 1,
        forexBuying: parseFloat(forexBuyingMatch[1]),
        forexSelling: parseFloat(forexSellingMatch[1]),
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
export function tcmbRateToExchangeRate(tcmbRate: TcmbRate): {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
} {
  // Calculate average rate (midpoint between buying and selling)
  const averageRate = (tcmbRate.forexBuying + tcmbRate.forexSelling) / 2;

  return {
    fromCurrency: tcmbRate.currencyCode,
    toCurrency: 'TRY',
    rate: averageRate,
  };
}
