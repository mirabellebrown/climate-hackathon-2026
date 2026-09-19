/** Store grams / Wh / mL; convert only at display and export. */

export function gToTco2e(grams: number): number {
  return grams / 1_000_000;
}

export function whToMwh(wh: number): number {
  return wh / 1_000_000;
}

/** Primary energy MJ → MWh (1 kWh = 3.6 MJ). */
export function mjToMwh(mj: number): number {
  return mj / 3_600;
}

export function mlToM3(ml: number): number {
  return ml / 1_000_000;
}

export function litersToMl(liters: number): number {
  return liters * 1_000;
}

export function kgToG(kg: number): number {
  return kg * 1_000;
}

export function kwhToWh(kwh: number): number {
  return kwh * 1_000;
}

/** Wh → MJ (electricity as delivered energy). */
export function whToMj(wh: number): number {
  return wh * 0.0036;
}
