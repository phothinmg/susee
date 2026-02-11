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
