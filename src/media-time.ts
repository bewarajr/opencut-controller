const TICKS_PER_SECOND = 120_000;

export function secondsToMediaTime(seconds: number): number {
	return Math.round(seconds * TICKS_PER_SECOND);
}

export type FrameRate = { numerator: number; denominator: number };

const STANDARD_FRAME_RATES: Array<{ value: number; rate: FrameRate }> = [
	{ value: 24_000 / 1_001, rate: { numerator: 24_000, denominator: 1_001 } },
	{ value: 24, rate: { numerator: 24, denominator: 1 } },
	{ value: 25, rate: { numerator: 25, denominator: 1 } },
	{ value: 30_000 / 1_001, rate: { numerator: 30_000, denominator: 1_001 } },
	{ value: 30, rate: { numerator: 30, denominator: 1 } },
	{ value: 48, rate: { numerator: 48, denominator: 1 } },
	{ value: 50, rate: { numerator: 50, denominator: 1 } },
	{ value: 60_000 / 1_001, rate: { numerator: 60_000, denominator: 1_001 } },
	{ value: 60, rate: { numerator: 60, denominator: 1 } },
	{ value: 120, rate: { numerator: 120, denominator: 1 } },
];

function gcd(left: number, right: number): number {
	let a = Math.abs(left);
	let b = Math.abs(right);
	while (b !== 0) {
		const remainder = a % b;
		a = b;
		b = remainder;
	}
	return a || 1;
}

export function numberToFrameRate(fps: number): FrameRate {
	if (!Number.isFinite(fps) || fps <= 0) {
		throw new Error("FPS must be a positive finite number");
	}

	const standard = STANDARD_FRAME_RATES.find(
		(candidate) => Math.abs(fps - candidate.value) <= 0.01,
	);
	if (standard) return standard.rate;
	if (Number.isInteger(fps)) return { numerator: fps, denominator: 1 };

	const denominator = 1_000_000;
	const numerator = Math.round(fps * denominator);
	const divisor = gcd(numerator, denominator);
	return { numerator: numerator / divisor, denominator: denominator / divisor };
}
