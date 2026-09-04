import type { DesignEngineeringSettings } from '@/api/project';

/** Fallback values matching the spec exactly — used only until real settings load, so the live
 *  preview never shows zeros/blank while the settings request is in flight. */
export const DESIGN_ENGINEERING_DEFAULTS: DesignEngineeringSettings = {
  pole_span_m: 45,
  bracket_ratio: 0.4,
  tension_termination_allowance: 1,
  steel_banding_ratio: 1.5,
  buckle_ratio: 1,
  default_fat_allocation: 1,
  default_9m_replacement_poles: 8,
  default_11m_road_crossing_poles: 8,
  default_duc_segment_m: 300,
  rate_adss_cable: 1,
  rate_duc_ducting: 1,
  rate_drop_cable: 1.5,
  rate_bracket: 0,
  rate_clamp: 0,
  rate_banding: 0,
  rate_buckle: 0,
  rate_fat: 0,
  rate_pole: 0,
};

export type DesignBomItem = {
  key: string;
  label: string;
  unit: string;
  quantity: number;
  unit_price: number;
  line_cost: number;
};

export type DesignBom = {
  items: DesignBomItem[];
  total: number;
  adssPoles: number;
  dropPoles: number;
  totalUsablePoles: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const ZERO_ITEM_META: { key: string; label: string; unit: string }[] = [
  { key: 'adss_cable', label: 'ADSS Cable', unit: 'm' },
  { key: 'drop_cable', label: 'Drop Cable', unit: 'm' },
  { key: 'duc', label: 'DUC (Underground Ducting)', unit: 'm' },
  { key: 'usable_poles', label: 'Usable Poles (ADSS + Drop)', unit: 'pcs' },
  { key: 'deadend_poles', label: 'Deadend Poles', unit: 'pcs' },
  { key: 'new_9m_poles', label: 'New 9m Replacement Poles', unit: 'pcs' },
  { key: 'new_11m_poles', label: 'New 11m Road-Crossing Poles', unit: 'pcs' },
  { key: 'pole_brackets', label: 'Pole Brackets', unit: 'pcs' },
  { key: 'tension_clamps', label: 'Tension Clamps', unit: 'pcs' },
  { key: 'suspension_clamps', label: 'Suspension Clamps', unit: 'pcs' },
  { key: 'steel_banding', label: 'Steel Banding', unit: 'm' },
  { key: 'buckles', label: 'Buckles', unit: 'pcs' },
  { key: 'fat', label: 'FAT (Fiber Access Terminal)', unit: 'pcs' },
];

/** The fixed Engineering BOM formula set — computes hardware quantities and their cost purely
 *  from ADSS Distance and Drop Cable Distance plus the admin-configured ratios/rates. No manual
 *  quantity entry: everything here is derived.
 *
 *  Gated entirely on ADSS Distance: until it's a positive number, every quantity, rate and line
 *  cost reads zero (even the "default" items like DUC/FAT/9m poles) so nothing looks calculated
 *  before Design has actually entered a distance — real numbers appear the instant they type one. */
export function computeDesignBom(adssDistance: number, dropDistance: number, s: DesignEngineeringSettings): DesignBom {
  const adss = Number.isFinite(adssDistance) && adssDistance > 0 ? adssDistance : 0;
  const drop = Number.isFinite(dropDistance) && dropDistance > 0 ? dropDistance : 0;

  if (adss <= 0) {
    return {
      items: ZERO_ITEM_META.map((m) => ({ ...m, quantity: 0, unit_price: 0, line_cost: 0 })),
      total: 0,
      adssPoles: 0,
      dropPoles: 0,
      totalUsablePoles: 0,
    };
  }

  const poleSpan = s.pole_span_m > 0 ? s.pole_span_m : DESIGN_ENGINEERING_DEFAULTS.pole_span_m;

  const adssPoles = Math.ceil(adss / poleSpan);
  const dropPoles = drop > 0 ? Math.ceil(drop / poleSpan) : 0;
  const totalUsablePoles = adssPoles + dropPoles;

  const deadendPoles = 0;
  const poleBrackets = Math.ceil(totalUsablePoles * s.bracket_ratio);
  const tensionClamps = (2 * poleBrackets) + s.tension_termination_allowance;
  const suspensionClamps = Math.max(0, totalUsablePoles - poleBrackets);
  const steelBanding = Math.ceil(totalUsablePoles * s.steel_banding_ratio);
  const buckles = Math.ceil(steelBanding * s.buckle_ratio);

  const raw: Omit<DesignBomItem, 'line_cost'>[] = [
    { key: 'adss_cable', label: 'ADSS Cable', unit: 'm', quantity: adss, unit_price: s.rate_adss_cable },
    { key: 'drop_cable', label: 'Drop Cable', unit: 'm', quantity: drop, unit_price: s.rate_drop_cable },
    { key: 'duc', label: 'DUC (Underground Ducting)', unit: 'm', quantity: s.default_duc_segment_m, unit_price: s.rate_duc_ducting },
    { key: 'usable_poles', label: 'Usable Poles (ADSS + Drop)', unit: 'pcs', quantity: totalUsablePoles, unit_price: s.rate_pole },
    { key: 'deadend_poles', label: 'Deadend Poles', unit: 'pcs', quantity: deadendPoles, unit_price: s.rate_pole },
    { key: 'new_9m_poles', label: 'New 9m Replacement Poles', unit: 'pcs', quantity: s.default_9m_replacement_poles, unit_price: s.rate_pole },
    { key: 'new_11m_poles', label: 'New 11m Road-Crossing Poles', unit: 'pcs', quantity: s.default_11m_road_crossing_poles, unit_price: s.rate_pole },
    { key: 'pole_brackets', label: 'Pole Brackets', unit: 'pcs', quantity: poleBrackets, unit_price: s.rate_bracket },
    { key: 'tension_clamps', label: 'Tension Clamps', unit: 'pcs', quantity: tensionClamps, unit_price: s.rate_clamp },
    { key: 'suspension_clamps', label: 'Suspension Clamps', unit: 'pcs', quantity: suspensionClamps, unit_price: s.rate_clamp },
    { key: 'steel_banding', label: 'Steel Banding', unit: 'm', quantity: steelBanding, unit_price: s.rate_banding },
    { key: 'buckles', label: 'Buckles', unit: 'pcs', quantity: buckles, unit_price: s.rate_buckle },
    { key: 'fat', label: 'FAT (Fiber Access Terminal)', unit: 'pcs', quantity: s.default_fat_allocation, unit_price: s.rate_fat },
  ];

  const items = raw.map((i) => ({ ...i, line_cost: round2(i.quantity * i.unit_price) }));
  const total = round2(items.reduce((sum, i) => sum + i.line_cost, 0));

  return { items, total, adssPoles, dropPoles, totalUsablePoles };
}
