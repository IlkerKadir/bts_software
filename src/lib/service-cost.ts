/**
 * Service Cost Calculator for BTS Yangin engineering services.
 *
 * Calculates commissioning, testing, and training service costs
 * based on team size, duration, location type, distance, and
 * optional lifting equipment rental.
 */

export interface ServiceCostConfig {
  dailySalary: number;
  dailyHotel: number;
  dailyMealsOutCity: number;
  dailyMealsOffice: number;
  dailyVehicle: number;
  perKmCost: number;
  distanceBrackets: number[];
}

export interface ServiceCostInput {
  teamSize: 1 | 2;
  days: number;
  locationType: 'sehir_ici' | 'ofis' | 'sehir_disi';
  distanceKm?: number;
  liftingEquipment?: {
    dailyRate: number;
    transportCost: number;
    rentalDays: number;
  };
}

export interface ServiceCostBreakdown {
  dailySalary: number;
  dailyHotel: number;
  dailyMeals: number;
  dailyVehicle: number;
  kmCost: number;
  dailyTotal: number;
  subtotal: number;
  liftingCost: number;
  grandTotal: number;
}

/**
 * Default configuration based on July 2025 cost spreadsheet.
 */
export const DEFAULT_SERVICE_COST_CONFIG: ServiceCostConfig = {
  dailySalary: 3_575,
  dailyHotel: 2_000,
  dailyMealsOutCity: 475,
  dailyMealsOffice: 270,
  dailyVehicle: 1_800,
  perKmCost: 4,
  distanceBrackets: [75, 150, 200, 250, 500, 750, 1000, 1250],
};

/**
 * Snap a given km value to the nearest distance bracket.
 *
 * When the distance is equidistant between two brackets, the lower
 * bracket is chosen because the loop only replaces on a strictly
 * smaller diff.
 */
export function snapToNearestBracket(km: number, brackets: number[]): number {
  if (brackets.length === 0) {
    return km;
  }

  const sorted = [...brackets].sort((a, b) => a - b);
  let closest = sorted[0];
  let minDiff = Math.abs(km - closest);

  for (const bracket of sorted) {
    const diff = Math.abs(km - bracket);
    if (diff < minDiff) {
      minDiff = diff;
      closest = bracket;
    }
  }

  return closest;
}

/**
 * Calculate engineering service cost breakdown.
 *
 * @param input  - Service parameters (team size, days, location, distance, equipment)
 * @param config - Cost rates configuration
 * @returns Full cost breakdown including daily rates, subtotal, and grand total
 *
 * @throws {Error} If days is not between 1 and 15
 * @throws {Error} If locationType is sehir_disi and distanceKm is not provided
 */
export function calculateServiceCost(
  input: ServiceCostInput,
  config: ServiceCostConfig = DEFAULT_SERVICE_COST_CONFIG
): ServiceCostBreakdown {
  const { teamSize, days, locationType, distanceKm, liftingEquipment } = input;

  if (days < 1 || days > 15) {
    throw new Error('Days must be between 1 and 15');
  }

  if (locationType === 'sehir_disi' && (distanceKm === undefined || distanceKm === null)) {
    throw new Error('Distance in km is required for out-of-city (sehir_disi) location');
  }

  let dailySalary = config.dailySalary;
  let dailyHotel = 0;
  let dailyMeals = 0;
  let dailyVehicle = 0;
  let kmCost = 0;

  switch (locationType) {
    case 'sehir_disi': {
      const bracketKm = snapToNearestBracket(distanceKm!, config.distanceBrackets);
      dailyHotel = config.dailyHotel;
      dailyMeals = config.dailyMealsOutCity;
      dailyVehicle = config.dailyVehicle;
      kmCost = bracketKm * config.perKmCost;
      break;
    }
    case 'sehir_ici': {
      dailyMeals = config.dailyMealsOffice;
      dailyVehicle = config.dailyVehicle;
      break;
    }
    case 'ofis': {
      dailyMeals = config.dailyMealsOffice;
      break;
    }
    default: {
      const _exhaustive: never = locationType;
      throw new Error(`Unknown location type: ${_exhaustive}`);
    }
  }

  const dailyTotal = dailySalary + dailyHotel + dailyMeals + dailyVehicle + kmCost;
  const subtotal = dailyTotal * days * teamSize;

  let liftingCost = 0;
  if (liftingEquipment) {
    liftingCost =
      liftingEquipment.dailyRate * liftingEquipment.rentalDays +
      liftingEquipment.transportCost;
  }

  const grandTotal = subtotal + liftingCost;

  return {
    dailySalary,
    dailyHotel,
    dailyMeals,
    dailyVehicle,
    kmCost,
    dailyTotal,
    subtotal,
    liftingCost,
    grandTotal,
  };
}
