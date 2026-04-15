<!-- markdownlint-disable MD033 -->
<!-- markdownlint-disable MD041 -->
<div align="center">
<img src="https://susee.phothin.dev/logo/susee.webp" width="160" height="160" alt="susee" />
  <h1>Susee Resolves</h1>
</div>

The package lets you run a list of functions in series, concurrently, or using an allSettled pattern, returning an array of Promise-resolved results. It is useful for managing multiple asynchronous or synchronous tasks with different strategies.

## Features

- **Run functions in series (one after another)**
- **Run functions concurrently (all at once)**
- **Run functions with allSettled (wait for all to finish, regardless of success/failure)**

## Installation

```bash
npm i @suseejs/resolves
```

## Usage

### commonjs

```js
const resolves = require("@suseejs/resolves");

const asyncFunction = async (str) => {
  return await new Promise((resolve) => resolve(str));
};
const syncFunction = (str) => str;
const syncFunctionNum = (num) => num;

const rit = resolves([
  [asyncFunction, "Result 1"],
  [syncFunction, "Result 2"],
  [syncFunctionNum, 3],
]);

rit.series().then((res) => {
  console.log(`result-1 : ${res[0]}`); // result-1 : Result 1
  console.log(`result-2 : ${res[1]}`); // result-2 : Result 2
  console.log(`result-3 : ${res[2]}`); // result-3 : 3
});
```

### typescript

```ts
import resolves from "@suseejs/resolves";

const asyncFunction = async (str: string): Promise<string> => {
  return await new Promise((resolve) => resolve(str));
};
const syncFunction = (str: string): string => str;
const syncFunctionNum = (num: number): number => num;

const rit = resolves<[Promise<string>, string, number]>([
  [asyncFunction, "Result 1"],
  [syncFunction, "Result 2"],
  [syncFunctionNum, 3],
]);

const [a1, b1, c1] = await rit.series();
const [a2, b2, c2] = await rit.concurrent();
const [a3, b3, c3] = await rit.allSettled();
// Result 1 - Result 2  - 3
console.log(`${a1} - ${b1}  - ${c1}`);
console.log(`${a2} - ${b2}  - ${c2}`);
console.log(`${a3} - ${b3}  - ${c3}`);
```

## API

`resolves<R extends any[]>(params: { [K in keyof R]: Param<R[K]> },time?: number)`

parameters :

- An array of tuples : `[[(...args:any[])=>any,...args:any[]]]`
  The first place of tuple is function and rest are parameters of that function.

- Number of milliseconds(optional) : `time?:number` The amount of time to wait before resolving the promise. Defaults to 500ms.

returns :

An object with `series`, `concurrent`, and `allSettled` properties. Each property is a function that takes no arguments and returns a promise. The promise resolves with the results of running the functions in the specified manner.

## License

[Apache-2.0][file-license] © [Pho Thin Mg][ptm]

<!-- markdownlint-disable MD053 -->

[file-license]: LICENSE
[ptm]: https://github.com/phothinmg
