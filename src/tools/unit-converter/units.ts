/**
 * Comprehensive unit database. Every category converts through a base unit:
 * each unit has a `toBase` and `fromBase` that are either a numeric factor
 * or a function (for temperature which is non-linear).
 */

export interface UnitDef {
  id: string;
  label: string;
  symbol: string;
  toBase: number | ((v: number) => number);
  fromBase: number | ((v: number) => number);
}

export interface UnitCategory {
  id: string;
  label: string;
  baseUnit: string;
  units: UnitDef[];
}

// Helper: when toBase/fromBase are factors, toBase = multiply, fromBase = divide
const factor = (f: number): Pick<UnitDef, 'toBase' | 'fromBase'> => ({
  toBase: f,
  fromBase: 1 / f,
});

export const CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    label: 'Length',
    baseUnit: 'm',
    units: [
      { id: 'mm', label: 'Millimeter', symbol: 'mm', ...factor(0.001) },
      { id: 'cm', label: 'Centimeter', symbol: 'cm', ...factor(0.01) },
      { id: 'm', label: 'Meter', symbol: 'm', ...factor(1) },
      { id: 'km', label: 'Kilometer', symbol: 'km', ...factor(1000) },
      { id: 'in', label: 'Inch', symbol: 'in', ...factor(0.0254) },
      { id: 'ft', label: 'Foot', symbol: 'ft', ...factor(0.3048) },
      { id: 'yd', label: 'Yard', symbol: 'yd', ...factor(0.9144) },
      { id: 'mi', label: 'Mile', symbol: 'mi', ...factor(1609.344) },
      { id: 'nm', label: 'Nautical Mile', symbol: 'nmi', ...factor(1852) },
    ],
  },
  {
    id: 'weight',
    label: 'Weight / Mass',
    baseUnit: 'kg',
    units: [
      { id: 'mg', label: 'Milligram', symbol: 'mg', ...factor(0.000001) },
      { id: 'g', label: 'Gram', symbol: 'g', ...factor(0.001) },
      { id: 'kg', label: 'Kilogram', symbol: 'kg', ...factor(1) },
      { id: 'oz', label: 'Ounce', symbol: 'oz', ...factor(0.028349523125) },
      { id: 'lb', label: 'Pound', symbol: 'lb', ...factor(0.45359237) },
      { id: 'st', label: 'Stone', symbol: 'st', ...factor(6.35029318) },
      { id: 'ton-metric', label: 'Metric Ton', symbol: 't', ...factor(1000) },
      { id: 'ton-us', label: 'US Ton', symbol: 'ton', ...factor(907.18474) },
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    baseUnit: 'K',
    units: [
      {
        id: 'C',
        label: 'Celsius',
        symbol: '\u00B0C',
        toBase: (v: number) => v + 273.15,
        fromBase: (v: number) => v - 273.15,
      },
      {
        id: 'F',
        label: 'Fahrenheit',
        symbol: '\u00B0F',
        toBase: (v: number) => (v - 32) * (5 / 9) + 273.15,
        fromBase: (v: number) => (v - 273.15) * (9 / 5) + 32,
      },
      {
        id: 'K',
        label: 'Kelvin',
        symbol: 'K',
        toBase: (v: number) => v,
        fromBase: (v: number) => v,
      },
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    baseUnit: 'L',
    units: [
      { id: 'mL', label: 'Milliliter', symbol: 'mL', ...factor(0.001) },
      { id: 'L', label: 'Liter', symbol: 'L', ...factor(1) },
      { id: 'gal-us', label: 'Gallon (US)', symbol: 'gal', ...factor(3.785411784) },
      { id: 'gal-uk', label: 'Gallon (UK)', symbol: 'gal', ...factor(4.54609) },
      { id: 'fl-oz-us', label: 'Fluid Ounce (US)', symbol: 'fl oz', ...factor(0.0295735295625) },
      { id: 'cup', label: 'Cup', symbol: 'cup', ...factor(0.2365882365) },
      { id: 'tbsp', label: 'Tablespoon', symbol: 'tbsp', ...factor(0.01478676478125) },
      { id: 'tsp', label: 'Teaspoon', symbol: 'tsp', ...factor(0.00492892159375) },
      { id: 'm3', label: 'Cubic Meter', symbol: 'm\u00B3', ...factor(1000) },
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    baseUnit: 'm/s',
    units: [
      { id: 'm-s', label: 'Meters/second', symbol: 'm/s', ...factor(1) },
      { id: 'km-h', label: 'Kilometers/hour', symbol: 'km/h', ...factor(1 / 3.6) },
      { id: 'mph', label: 'Miles/hour', symbol: 'mph', ...factor(0.44704) },
      { id: 'knots', label: 'Knots', symbol: 'kn', ...factor(0.514444) },
      { id: 'ft-s', label: 'Feet/second', symbol: 'ft/s', ...factor(0.3048) },
    ],
  },
  {
    id: 'data',
    label: 'Data Size',
    baseUnit: 'B',
    units: [
      { id: 'B', label: 'Byte', symbol: 'B', ...factor(1) },
      { id: 'KB', label: 'Kilobyte', symbol: 'KB', ...factor(1000) },
      { id: 'MB', label: 'Megabyte', symbol: 'MB', ...factor(1e6) },
      { id: 'GB', label: 'Gigabyte', symbol: 'GB', ...factor(1e9) },
      { id: 'TB', label: 'Terabyte', symbol: 'TB', ...factor(1e12) },
      { id: 'PB', label: 'Petabyte', symbol: 'PB', ...factor(1e15) },
      { id: 'KiB', label: 'Kibibyte', symbol: 'KiB', ...factor(1024) },
      { id: 'MiB', label: 'Mebibyte', symbol: 'MiB', ...factor(1048576) },
      { id: 'GiB', label: 'Gibibyte', symbol: 'GiB', ...factor(1073741824) },
      { id: 'TiB', label: 'Tebibyte', symbol: 'TiB', ...factor(1099511627776) },
    ],
  },
  {
    id: 'area',
    label: 'Area',
    baseUnit: 'm\u00B2',
    units: [
      { id: 'mm2', label: 'Square Millimeter', symbol: 'mm\u00B2', ...factor(1e-6) },
      { id: 'cm2', label: 'Square Centimeter', symbol: 'cm\u00B2', ...factor(1e-4) },
      { id: 'm2', label: 'Square Meter', symbol: 'm\u00B2', ...factor(1) },
      { id: 'km2', label: 'Square Kilometer', symbol: 'km\u00B2', ...factor(1e6) },
      { id: 'in2', label: 'Square Inch', symbol: 'in\u00B2', ...factor(0.00064516) },
      { id: 'ft2', label: 'Square Foot', symbol: 'ft\u00B2', ...factor(0.09290304) },
      { id: 'yd2', label: 'Square Yard', symbol: 'yd\u00B2', ...factor(0.83612736) },
      { id: 'mi2', label: 'Square Mile', symbol: 'mi\u00B2', ...factor(2589988.110336) },
      { id: 'acre', label: 'Acre', symbol: 'ac', ...factor(4046.8564224) },
      { id: 'ha', label: 'Hectare', symbol: 'ha', ...factor(10000) },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    baseUnit: 's',
    units: [
      { id: 'ms', label: 'Millisecond', symbol: 'ms', ...factor(0.001) },
      { id: 's', label: 'Second', symbol: 's', ...factor(1) },
      { id: 'min', label: 'Minute', symbol: 'min', ...factor(60) },
      { id: 'hr', label: 'Hour', symbol: 'hr', ...factor(3600) },
      { id: 'day', label: 'Day', symbol: 'd', ...factor(86400) },
      { id: 'week', label: 'Week', symbol: 'wk', ...factor(604800) },
      { id: 'month', label: 'Month (30d)', symbol: 'mo', ...factor(2592000) },
      { id: 'year', label: 'Year (365d)', symbol: 'yr', ...factor(31536000) },
    ],
  },
  {
    id: 'pressure',
    label: 'Pressure',
    baseUnit: 'Pa',
    units: [
      { id: 'Pa', label: 'Pascal', symbol: 'Pa', ...factor(1) },
      { id: 'kPa', label: 'Kilopascal', symbol: 'kPa', ...factor(1000) },
      { id: 'bar', label: 'Bar', symbol: 'bar', ...factor(100000) },
      { id: 'atm', label: 'Atmosphere', symbol: 'atm', ...factor(101325) },
      { id: 'psi', label: 'PSI', symbol: 'psi', ...factor(6894.757293168) },
      { id: 'mmHg', label: 'mmHg', symbol: 'mmHg', ...factor(133.322387415) },
    ],
  },
  {
    id: 'energy',
    label: 'Energy',
    baseUnit: 'J',
    units: [
      { id: 'J', label: 'Joule', symbol: 'J', ...factor(1) },
      { id: 'kJ', label: 'Kilojoule', symbol: 'kJ', ...factor(1000) },
      { id: 'cal', label: 'Calorie', symbol: 'cal', ...factor(4.184) },
      { id: 'kcal', label: 'Kilocalorie', symbol: 'kcal', ...factor(4184) },
      { id: 'Wh', label: 'Watt-hour', symbol: 'Wh', ...factor(3600) },
      { id: 'kWh', label: 'Kilowatt-hour', symbol: 'kWh', ...factor(3600000) },
      { id: 'BTU', label: 'BTU', symbol: 'BTU', ...factor(1055.05585262) },
    ],
  },
];

/**
 * Convert a value from one unit to another within the same category.
 */
export const convert = (
  value: number,
  from: UnitDef,
  to: UnitDef,
): number => {
  const base =
    typeof from.toBase === 'function' ? from.toBase(value) : value * from.toBase;
  return typeof to.fromBase === 'function' ? to.fromBase(base) : base * to.fromBase;
};

/**
 * Format a conversion result with appropriate precision.
 */
export const formatResult = (value: number): string => {
  if (!Number.isFinite(value)) return 'Invalid';
  if (value === 0) return '0';

  const abs = Math.abs(value);
  // Very large or very small values get scientific notation
  if (abs >= 1e12 || (abs > 0 && abs < 1e-6)) {
    return value.toExponential(6);
  }
  // Otherwise use enough decimal places to be useful
  if (abs >= 100) return value.toFixed(4);
  if (abs >= 1) return value.toFixed(6);
  return value.toPrecision(8);
};

/**
 * Build the formula string like "1 mi = 1.60934 km"
 */
export const buildFormula = (from: UnitDef, to: UnitDef): string => {
  const result = convert(1, from, to);
  return `1 ${from.symbol} = ${formatResult(result)} ${to.symbol}`;
};
