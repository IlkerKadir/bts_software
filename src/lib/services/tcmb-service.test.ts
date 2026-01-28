import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchTcmbRates, parseTcmbXml, TcmbRate } from './tcmb-service';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('tcmb-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseTcmbXml', () => {
    it('parses EUR rate from TCMB XML', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <Tarih_Date Tarih="23.01.2026" Date="01/23/2026">
          <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
            <Unit>1</Unit>
            <Isim>ABD DOLARI</Isim>
            <CurrencyName>US DOLLAR</CurrencyName>
            <ForexBuying>35.4500</ForexBuying>
            <ForexSelling>35.5200</ForexSelling>
            <BanknoteBuying>35.3800</BanknoteBuying>
            <BanknoteSelling>35.6100</BanknoteSelling>
          </Currency>
          <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR">
            <Unit>1</Unit>
            <Isim>EURO</Isim>
            <CurrencyName>EURO</CurrencyName>
            <ForexBuying>36.8500</ForexBuying>
            <ForexSelling>36.9300</ForexSelling>
            <BanknoteBuying>36.7700</BanknoteBuying>
            <BanknoteSelling>37.0200</BanknoteSelling>
          </Currency>
          <Currency CrossOrder="10" Kod="GBP" CurrencyCode="GBP">
            <Unit>1</Unit>
            <Isim>INGILIZ STERLINI</Isim>
            <CurrencyName>POUND STERLING</CurrencyName>
            <ForexBuying>43.8500</ForexBuying>
            <ForexSelling>43.9600</ForexSelling>
            <BanknoteBuying>43.7500</BanknoteBuying>
            <BanknoteSelling>44.0700</BanknoteSelling>
          </Currency>
        </Tarih_Date>`;

      const rates = parseTcmbXml(xml);

      expect(rates).toHaveLength(3);

      const eurRate = rates.find(r => r.currencyCode === 'EUR');
      expect(eurRate).toBeDefined();
      expect(eurRate!.forexBuying).toBeCloseTo(36.85);
      expect(eurRate!.forexSelling).toBeCloseTo(36.93);
    });

    it('parses USD rate correctly', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <Tarih_Date Tarih="23.01.2026">
          <Currency Kod="USD" CurrencyCode="USD">
            <Unit>1</Unit>
            <ForexBuying>35.4500</ForexBuying>
            <ForexSelling>35.5200</ForexSelling>
          </Currency>
        </Tarih_Date>`;

      const rates = parseTcmbXml(xml);

      expect(rates).toHaveLength(1);
      expect(rates[0].currencyCode).toBe('USD');
      expect(rates[0].forexBuying).toBeCloseTo(35.45);
    });

    it('handles empty XML gracefully', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <Tarih_Date Tarih="23.01.2026">
        </Tarih_Date>`;

      const rates = parseTcmbXml(xml);

      expect(rates).toHaveLength(0);
    });

    it('extracts date from XML', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <Tarih_Date Tarih="23.01.2026" Date="01/23/2026">
          <Currency Kod="EUR" CurrencyCode="EUR">
            <Unit>1</Unit>
            <ForexBuying>36.8500</ForexBuying>
            <ForexSelling>36.9300</ForexSelling>
          </Currency>
        </Tarih_Date>`;

      const rates = parseTcmbXml(xml);

      expect(rates[0].date).toBe('23.01.2026');
    });

    it('filters to supported currencies (EUR, USD, GBP)', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <Tarih_Date Tarih="23.01.2026">
          <Currency Kod="USD" CurrencyCode="USD">
            <Unit>1</Unit>
            <ForexBuying>35.4500</ForexBuying>
            <ForexSelling>35.5200</ForexSelling>
          </Currency>
          <Currency Kod="EUR" CurrencyCode="EUR">
            <Unit>1</Unit>
            <ForexBuying>36.8500</ForexBuying>
            <ForexSelling>36.9300</ForexSelling>
          </Currency>
          <Currency Kod="CHF" CurrencyCode="CHF">
            <Unit>1</Unit>
            <ForexBuying>38.0000</ForexBuying>
            <ForexSelling>38.1000</ForexSelling>
          </Currency>
          <Currency Kod="GBP" CurrencyCode="GBP">
            <Unit>1</Unit>
            <ForexBuying>43.8500</ForexBuying>
            <ForexSelling>43.9600</ForexSelling>
          </Currency>
        </Tarih_Date>`;

      const rates = parseTcmbXml(xml);

      // Should only include EUR, USD, GBP
      expect(rates).toHaveLength(3);
      expect(rates.map(r => r.currencyCode)).toEqual(['USD', 'EUR', 'GBP']);
    });
  });

  describe('fetchTcmbRates', () => {
    it('fetches and parses rates from TCMB', async () => {
      const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
        <Tarih_Date Tarih="23.01.2026">
          <Currency Kod="EUR" CurrencyCode="EUR">
            <Unit>1</Unit>
            <ForexBuying>36.8500</ForexBuying>
            <ForexSelling>36.9300</ForexSelling>
          </Currency>
        </Tarih_Date>`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () => mockXml,
      });

      const rates = await fetchTcmbRates();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('tcmb.gov.tr'),
        expect.any(Object)
      );
      expect(rates).toHaveLength(1);
      expect(rates[0].currencyCode).toBe('EUR');
    });

    it('throws error when TCMB API fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(fetchTcmbRates()).rejects.toThrow('TCMB API hatası');
    });

    it('throws error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(fetchTcmbRates()).rejects.toThrow();
    });
  });
});
