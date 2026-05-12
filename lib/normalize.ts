/** Match filename / metadata comparison rules used across checkers. */
export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-]+/g, " ");
}
