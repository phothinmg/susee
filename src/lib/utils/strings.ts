/**
 * Merge an array of string arrays into a single string array.
 * @param {string[][]} input - An array of string arrays to merge.
 * @returns {string[]} A single string array containing all the elements from the input arrays.
 */
const mergeStringArr = (input: string[][]): string[] => {
	return input.reduce((prev, curr) => prev.concat(curr), []);
};

export { mergeStringArr };
