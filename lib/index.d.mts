// biome-ignore lint/suspicious/noExplicitAny: unknown
type Fun<T> = (...arg: any) => T;
// biome-ignore lint/suspicious/noExplicitAny: unknown
type Param<T> = [Fun<T>, ...any[]];
/**
 * Run a list of functions in series, concurrently, or allSettled.
 *
 * @param {Array} params - A list of functions to run. Each function should be
 *   the first element of an array, and the remainder of the array should be
 *   the arguments to pass to the function.
 * @param {Number} time - The amount of time to wait before resolving the
 *   promise. Defaults to 500ms.
 * @return {Object} An object with `series`, `concurrent`, and `allSettled`
 *   properties. Each property is a function that takes no arguments and
 *   returns a promise. The promise resolves with the results of running the
 *   functions in the specified manner.
 */
// biome-ignore lint/suspicious/noExplicitAny: unknown
declare function resolves<R extends any[]>(
  params: { [K in keyof R]: Param<R[K]> },
  time?: number,
): {
  series: () => Promise<R>;
  concurrent: () => Promise<R>;
  allSettled: () => Promise<R>;
};

export default resolves;
