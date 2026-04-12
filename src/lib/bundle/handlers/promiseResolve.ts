// biome-ignore-start lint/suspicious/noExplicitAny: unknown
type Fun<T> = (...arg: any) => T;
type Param<T> = [Fun<T>, ...any[]];

function isPromiseFun<T>(fun: Fun<T>): boolean {
	return (
		Object.prototype.toString.call(fun) === "[object AsyncFunction]" ||
		fun.constructor.name === "AsyncFunction"
	);
}

function walkPromise<T>(param: Param<T>) {
	const fn = param[0];
	const args = param.slice(1);
	if (isPromiseFun(fn)) {
		return async () => await fn(...args);
	} else {
		return async () => fn(...args);
	}
}

function promiseResolve<R extends any[]>(
	params: { [K in keyof R]: Param<R[K]> },
) {
	const funs = params.map((w) => walkPromise(w));

	const series = async () => {
		const results: any[] = [];
		for (const [index, task] of funs.entries()) {
			try {
				const result = await task();
				results.push(result);
			} catch (error) {
				console.error(`Error in task ${index + 1}`);
				throw error;
			}
		}
		return results;
	};

	const concurrent = async () => {
		try {
			return await Promise.all(funs.map((f) => f()));
		} catch (error) {
			console.error("One of the functions rejected:", error);
			throw error;
		}
	};

	const allSettled = async () => {
		try {
			const settled = await Promise.allSettled(funs.map((f) => f()));
			const fulfilled = settled.filter(
				(re): re is PromiseFulfilledResult<any> => re.status === "fulfilled",
			);
			const rejected = settled.filter(
				(re): re is PromiseRejectedResult => re.status === "rejected",
			);
			if (rejected.length > 0) {
				console.warn("One of the functions rejected:", rejected[0]?.reason);
				process.exit(1);
			}
			return fulfilled.map((re) => re.value);
		} catch (error) {
			console.error("One of the functions rejected:", error);
			throw error;
		}
	};
	return {
		series: series as () => Promise<R>,
		concurrent: concurrent as () => Promise<R>,
		allSettled: allSettled as () => Promise<R>,
	};
}

export { promiseResolve };
// biome-ignore-end lint/suspicious/noExplicitAny: unknown
