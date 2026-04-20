import tcolor from "@suseejs/color";

export function fail(message: string) {
  console.error(`${tcolor.magenta("FAIL")} : ${tcolor.gray(message)}`);
  process.exit(1);
}
