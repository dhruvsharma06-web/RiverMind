export type ReadingParameter = "turbidity_ntu" | "ph" | "tds_ppm" | "temp_c";
export const parameters: Record<
  ReadingParameter,
  { label: string; unit: string }
> = {
  turbidity_ntu: { label: "Turbidity", unit: "NTU" },
  ph: { label: "pH", unit: "pH" },
  tds_ppm: { label: "Total dissolved solids", unit: "ppm" },
  temp_c: { label: "Temperature", unit: "°C" },
};
