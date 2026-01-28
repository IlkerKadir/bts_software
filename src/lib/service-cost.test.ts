import { describe, it, expect } from 'vitest';
import {
  snapToNearestBracket,
  calculateServiceCost,
  ServiceCostConfig,
  ServiceCostInput,
} from './service-cost';

/**
 * July 2025 cost spreadsheet rates used across all tests.
 */
const config: ServiceCostConfig = {
  dailySalary: 3_575,
  dailyHotel: 2_000,
  dailyMealsOutCity: 475,
  dailyMealsOffice: 270,
  dailyVehicle: 1_800,
  perKmCost: 4,
  distanceBrackets: [75, 150, 200, 250, 500, 750, 1000, 1250],
};

describe('Service Cost Calculator', () => {
  describe('snapToNearestBracket', () => {
    const brackets = config.distanceBrackets;

    it('snaps 480 to 500', () => {
      expect(snapToNearestBracket(480, brackets)).toBe(500);
    });

    it('snaps 120 to 150', () => {
      expect(snapToNearestBracket(120, brackets)).toBe(150);
    });

    it('snaps 60 to 75', () => {
      expect(snapToNearestBracket(60, brackets)).toBe(75);
    });

    it('snaps 1300 to 1250', () => {
      expect(snapToNearestBracket(1300, brackets)).toBe(1250);
    });

    it('returns exact bracket if distance matches', () => {
      expect(snapToNearestBracket(500, brackets)).toBe(500);
      expect(snapToNearestBracket(75, brackets)).toBe(75);
      expect(snapToNearestBracket(1250, brackets)).toBe(1250);
    });

    it('snaps to lower bracket when equidistant', () => {
      // 112.5 is equidistant between 75 and 150 — should snap to 75
      expect(snapToNearestBracket(112.5, brackets)).toBe(75);
    });

    it('returns km unchanged if brackets array is empty', () => {
      expect(snapToNearestBracket(300, [])).toBe(300);
    });
  });

  describe('calculateServiceCost - sehir_disi (out of city)', () => {
    it('calculates 1 person, 1 day, 500km correctly', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 1,
        locationType: 'sehir_disi',
        distanceKm: 500,
      };
      const result = calculateServiceCost(input, config);

      // dailyRate = 3575 + 2000 + 475 + 1800 + (500 * 4) = 9850
      expect(result.dailySalary).toBe(3_575);
      expect(result.dailyHotel).toBe(2_000);
      expect(result.dailyMeals).toBe(475);
      expect(result.dailyVehicle).toBe(1_800);
      expect(result.kmCost).toBe(2_000);
      expect(result.dailyTotal).toBe(9_850);
      expect(result.subtotal).toBe(9_850);
      expect(result.liftingCost).toBe(0);
      expect(result.grandTotal).toBe(9_850);
    });

    it('calculates 2 people, 1 day, 500km correctly', () => {
      const input: ServiceCostInput = {
        teamSize: 2,
        days: 1,
        locationType: 'sehir_disi',
        distanceKm: 500,
      };
      const result = calculateServiceCost(input, config);

      // dailyRate = 9850, subtotal = 9850 * 1 * 2 = 19700
      expect(result.dailyTotal).toBe(9_850);
      expect(result.subtotal).toBe(19_700);
      expect(result.grandTotal).toBe(19_700);
    });

    it('calculates 1 person, 5 days, 750km correctly', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 5,
        locationType: 'sehir_disi',
        distanceKm: 750,
      };
      const result = calculateServiceCost(input, config);

      // kmCost = 750 * 4 = 3000
      // dailyRate = 3575 + 2000 + 475 + 1800 + 3000 = 10850
      // subtotal = 10850 * 5 * 1 = 54250
      expect(result.kmCost).toBe(3_000);
      expect(result.dailyTotal).toBe(10_850);
      expect(result.subtotal).toBe(54_250);
      expect(result.grandTotal).toBe(54_250);
    });

    it('calculates 2 people, 3 days, 250km correctly', () => {
      const input: ServiceCostInput = {
        teamSize: 2,
        days: 3,
        locationType: 'sehir_disi',
        distanceKm: 250,
      };
      const result = calculateServiceCost(input, config);

      // kmCost = 250 * 4 = 1000
      // dailyRate = 3575 + 2000 + 475 + 1800 + 1000 = 8850
      // subtotal = 8850 * 3 * 2 = 53100
      expect(result.dailySalary).toBe(3_575);
      expect(result.dailyHotel).toBe(2_000);
      expect(result.dailyMeals).toBe(475);
      expect(result.dailyVehicle).toBe(1_800);
      expect(result.kmCost).toBe(1_000);
      expect(result.dailyTotal).toBe(8_850);
      expect(result.subtotal).toBe(53_100);
      expect(result.liftingCost).toBe(0);
      expect(result.grandTotal).toBe(53_100);
    });

    it('snaps distance to nearest bracket before calculating', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 1,
        locationType: 'sehir_disi',
        distanceKm: 480, // should snap to 500
      };
      const result = calculateServiceCost(input, config);

      // kmCost = 500 * 4 = 2000
      expect(result.kmCost).toBe(2_000);
      expect(result.dailyTotal).toBe(9_850);
    });

    it('throws if distanceKm is not provided for sehir_disi', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 1,
        locationType: 'sehir_disi',
      };
      expect(() => calculateServiceCost(input, config)).toThrow(
        'Distance in km is required for out-of-city (sehir_disi) location'
      );
    });
  });

  describe('calculateServiceCost - sehir_ici (in city)', () => {
    it('calculates 1 person, 1 day correctly', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 1,
        locationType: 'sehir_ici',
      };
      const result = calculateServiceCost(input, config);

      // dailyRate = 3575 + 270 + 1800 = 5645
      expect(result.dailySalary).toBe(3_575);
      expect(result.dailyHotel).toBe(0);
      expect(result.dailyMeals).toBe(270);
      expect(result.dailyVehicle).toBe(1_800);
      expect(result.kmCost).toBe(0);
      expect(result.dailyTotal).toBe(5_645);
      expect(result.subtotal).toBe(5_645);
      expect(result.grandTotal).toBe(5_645);
    });

    it('calculates 2 people, 4 days correctly', () => {
      const input: ServiceCostInput = {
        teamSize: 2,
        days: 4,
        locationType: 'sehir_ici',
      };
      const result = calculateServiceCost(input, config);

      // dailyRate = 5645, subtotal = 5645 * 4 * 2 = 45160
      expect(result.dailyTotal).toBe(5_645);
      expect(result.subtotal).toBe(45_160);
      expect(result.grandTotal).toBe(45_160);
    });
  });

  describe('calculateServiceCost - ofis (office)', () => {
    it('calculates 1 person, 1 day correctly', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 1,
        locationType: 'ofis',
      };
      const result = calculateServiceCost(input, config);

      // dailyRate = 3575 + 270 = 3845
      expect(result.dailySalary).toBe(3_575);
      expect(result.dailyHotel).toBe(0);
      expect(result.dailyMeals).toBe(270);
      expect(result.dailyVehicle).toBe(0);
      expect(result.kmCost).toBe(0);
      expect(result.dailyTotal).toBe(3_845);
      expect(result.subtotal).toBe(3_845);
      expect(result.grandTotal).toBe(3_845);
    });

    it('calculates 2 people, 10 days correctly', () => {
      const input: ServiceCostInput = {
        teamSize: 2,
        days: 10,
        locationType: 'ofis',
      };
      const result = calculateServiceCost(input, config);

      // dailyRate = 3845, subtotal = 3845 * 10 * 2 = 76900
      expect(result.dailyTotal).toBe(3_845);
      expect(result.subtotal).toBe(76_900);
      expect(result.grandTotal).toBe(76_900);
    });
  });

  describe('calculateServiceCost - with lifting equipment', () => {
    it('adds lifting equipment cost to grand total', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 1,
        locationType: 'sehir_ici',
        liftingEquipment: {
          dailyRate: 500,
          transportCost: 1_000,
          rentalDays: 3,
        },
      };
      const result = calculateServiceCost(input, config);

      // liftingCost = (500 * 3) + 1000 = 2500
      // subtotal = 5645
      // grandTotal = 5645 + 2500 = 8145
      expect(result.liftingCost).toBe(2_500);
      expect(result.subtotal).toBe(5_645);
      expect(result.grandTotal).toBe(8_145);
    });

    it('adds lifting equipment to out-of-city calculation', () => {
      const input: ServiceCostInput = {
        teamSize: 2,
        days: 3,
        locationType: 'sehir_disi',
        distanceKm: 250,
        liftingEquipment: {
          dailyRate: 750,
          transportCost: 2_000,
          rentalDays: 3,
        },
      };
      const result = calculateServiceCost(input, config);

      // subtotal = 8850 * 3 * 2 = 53100
      // liftingCost = (750 * 3) + 2000 = 4250
      // grandTotal = 53100 + 4250 = 57350
      expect(result.subtotal).toBe(53_100);
      expect(result.liftingCost).toBe(4_250);
      expect(result.grandTotal).toBe(57_350);
    });

    it('handles zero transport cost for lifting equipment', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 1,
        locationType: 'ofis',
        liftingEquipment: {
          dailyRate: 400,
          transportCost: 0,
          rentalDays: 2,
        },
      };
      const result = calculateServiceCost(input, config);

      // liftingCost = (400 * 2) + 0 = 800
      expect(result.liftingCost).toBe(800);
      expect(result.grandTotal).toBe(3_845 + 800);
    });
  });

  describe('calculateServiceCost - validation', () => {
    it('throws if days is less than 1', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 0,
        locationType: 'ofis',
      };
      expect(() => calculateServiceCost(input, config)).toThrow(
        'Days must be between 1 and 15'
      );
    });

    it('throws if days exceeds 15', () => {
      const input: ServiceCostInput = {
        teamSize: 1,
        days: 16,
        locationType: 'ofis',
      };
      expect(() => calculateServiceCost(input, config)).toThrow(
        'Days must be between 1 and 15'
      );
    });
  });
});
