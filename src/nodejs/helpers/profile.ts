import process from "node:process";

const profileEnvName = "SUSEE_PROFILE";

export const isProfileEnabled = () => {
	const value = process.env[profileEnvName];
	return value === "1" || value === "true";
};

export const setProfileEnabled = (enabled: boolean) => {
	if (enabled) {
		process.env[profileEnvName] = "1";
		return;
	}

	delete process.env[profileEnvName];
};

const formatProfileMs = (start: bigint) => {
	return `${(Number(process.hrtime.bigint() - start) / 1_000_000).toFixed(1)}ms`;
};

export const logProfilePhase = (
	scope: string,
	phase: string,
	start: bigint,
) => {
	if (!isProfileEnabled()) return;
	console.log(`[SUSEE_PROFILE][${scope}] ${phase}: ${formatProfileMs(start)}`);
};
