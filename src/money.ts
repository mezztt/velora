// Formato de importes en pesos argentinos: "$133.200,00" · negativos "-$1.500" (nunca "$-1.500").
export function fmtMoney(
  value: number | string | null | undefined,
  decimals: "auto" | "fixed" | number = "auto",
): string {
  const n = Number(value ?? 0);
  const v = Number.isFinite(n) ? n : 0;
  const min = decimals === "fixed" ? 2 : typeof decimals === "number" ? decimals : 0;
  const max = decimals === "fixed" ? 2 : typeof decimals === "number" ? decimals : 2;
  const body = Math.abs(v).toLocaleString("es-AR", { minimumFractionDigits: min, maximumFractionDigits: max });
  const isZero = Number(Math.abs(v).toFixed(max)) === 0;
  return (v < 0 && !isZero ? "-$" : "$") + body;
}
