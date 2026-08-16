class UniqueName {
	private _storedPrefix: Map<string, [string, number]>;
	constructor() {
		this._storedPrefix = new Map();
	}
	setPrefix({ key, value }: { key: string; value: string }) {
		if (this._storedPrefix.has(key)) {
			const [_prefix, count] = this._storedPrefix.get(key) as [string, number];
			this._storedPrefix.set(key, [value, count + 1]);
		} else {
			this._storedPrefix.set(key, [value, 0]);
		}

		return this;
	}
	getName(key: string, input: string) {
		const [prefix, count] = this._storedPrefix.get(key) || [];

		const _name = prefix
			? `${prefix}${input}_${(count ?? 0) + 1}`
			: `__susee__${input}_${(count ?? 0) + 1}`;
		this._storedPrefix.set(key, [prefix ?? "__susee__", (count ?? 0) + 1]);
		return _name;
	}
	getPrefix(key: string) {
		const [prefix] = this._storedPrefix.get(key) || [];
		return prefix;
	}
}

export const uniqueName = new UniqueName();
