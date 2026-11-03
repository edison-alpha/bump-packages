export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Price rounding: cents for coins over $1, 5 decimals below that. */
export const roundPrice = (n: number) => (Math.abs(n) < 1 ? Math.round(n * 1e5) / 1e5 : round2(n));
