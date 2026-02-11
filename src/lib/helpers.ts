function splitCamelCase(str: string) {
  const splitString = str
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/(_|-|\/)([a-z] || [A-Z])/g, " ")
    .replace(/([A-Z])/g, (match) => match.toLowerCase())
    .replace(/^([a-z])/, (match) => match.toUpperCase());
  return splitString;
}

export { splitCamelCase };
