/**
 * Returns an object with three functions: setPrefix, getName, getPrefix.
 * setPrefix sets a prefix for a given key.
 * getName returns a unique name based on the given prefix and input.
 * getPrefix returns the prefix for a given key.
 *
 */
function uniqueName() {
	const storedPrefix: Map<string, [string, number]> = new Map();

	const obj = {
		setPrefix({ key, value }: { key: string; value: string }) {
			if (storedPrefix.has(key)) {
				console.warn(`${key} already exist`);
				throw new Error();
			}
			storedPrefix.set(key, [value, 0]);
			return obj;
		},
		getName(key: string, input: string) {
			const [prefix, count] = storedPrefix.get(key) || [];

			const _name = prefix
				? `${prefix}${input}_${(count ?? 0) + 1}`
				: `$nyein${input}_${(count ?? 0) + 1}`;
			storedPrefix.set(key, [prefix ?? "$nyein", (count ?? 0) + 1]);
			return _name;
		},
		getPrefix(key: string) {
			const [prefix] = storedPrefix.get(key) || [];
			return prefix;
		},
	};
	return obj;
}

export default uniqueName;
