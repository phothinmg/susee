const isPromiseFun = (fun) =>
  Object.prototype.toString.call(fun) === "[object AsyncFunction]" ||
  fun.constructor.name === "AsyncFunction";

function walkPromise(param, time = 500) {
  const fn = param[0];
  const args = param.slice(1);
  if (isPromiseFun(fn)) {
    return () => fn(...args);
  } else {
    return () =>
      new Promise((res, rej) => {
        try {
          const r = fn(...args);
          setTimeout(() => res(r), time);
        } catch (error) {
          rej(error);
        }
      });
  }
}

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
function resolves(params, time = 500) {
  const funs = params.map((w) => walkPromise(w, time));
  const _funs = funs.map((f) => f());
  const results = [];
  const series = async () => {
    for (const fn of _funs) {
      const idx = _funs.indexOf(fn);
      try {
        const result = await new Promise((resolve) =>
          setTimeout(resolve(fn), time),
        );
        results.push(result);
      } catch (error) {
        console.error(`Error in ${funs[idx].name}`);
        throw error;
      }
    }
    return results;
  };

  /**
   * Run the functions concurrently, meaning that all of the functions will be
   * run simultaneously. If any of the functions reject, the promise returned
   * by this function will reject with the same error.
   *
   * @return {Promise} A promise that resolves with an array of results from
   *   each of the functions, in the same order as the input `params`.
   */
  const concurrent = async () => {
    try {
      const res = await Promise.all(_funs);
      results.push(...res);
      return results;
    } catch (error) {
      console.error("One of the functions rejected:", error);
      throw error;
    }
  };

  /**
   * Run the functions concurrently and return a promise that resolves when all
   * of the functions have either resolved or rejected. If any of the functions
   * reject, the promise returned by this function will not reject; instead, the
   * error will be logged to the console and the process will exit with status 1.
   *
   * @return {Promise} A promise that resolves with an array of results from
   *   each of the functions, in the same order as the input `params`.
   */
  const allSettled = async () => {
    try {
      const res = await Promise.allSettled(_funs);
      results.push(
        ...res.filter((re) => re.status === "fulfilled").map((re) => re.value),
      );
      const errors = res
        .filter((re) => re.status === "rejected")
        .map((re) => re.reason);
      if (errors.length) {
        console.warn("One of the functions rejected:", errors[0]);
        process.exit(1);
      }
      return results;
    } catch (error) {
      console.error("One of the functions rejected:", error);
      throw error;
    }
  };

  return { series, concurrent, allSettled };
}

export default resolves;
