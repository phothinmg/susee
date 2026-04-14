/**
 * Merge an array of string arrays into a single string array.
 * @param {string[][]} input - An array of string arrays to merge.
 * @returns {string[]} A single string array containing all the elements from the input arrays.
 */
const mergeStringArr = (input: string[][]): string[] => {
  return input.reduce((prev, curr) => prev.concat(curr), []);
};

/**
 * Splits a camelCase string into a space-separated string.
 * @param {string} str - The string to split.
 * @returns {string} The split string.
 */
function splitCamelCase(str: string): string {
  const splitString = str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(_|-|\/)([a-z] || [A-Z])/g, " ")
    .replace(/([A-Z])/g, (match) => match.toLowerCase())
    .replace(/^([a-z])/, (match) => match.toUpperCase());
  return splitString;
}

export { mergeStringArr, splitCamelCase };
