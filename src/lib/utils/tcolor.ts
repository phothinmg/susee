function get_color(a: number, b: number): (arg0: string) => string {
	const startCode = `\x1b[${a}m`;
	const endCode = `\x1b[${b}m`;

	return (text) => {
		if (text === null || text === undefined) {
			return text;
		}

		const endIndex = text.indexOf(endCode);
		if (endIndex === -1) {
			return startCode + text + endCode;
		}

		const parts = [
			startCode,
			text.slice(0, endIndex),
			endCode,
			text.slice(endIndex + endCode.length),
		];
		return parts.join("");
	};
}
/**
 * Inspired by :  https://github.com/lukeed/kleur
 */
class Tcolor {
	// colors 10
	get red() {
		return get_color(31, 39);
	}
	get black() {
		return get_color(30, 39);
	}
	get green() {
		return get_color(32, 39);
	}
	get yellow() {
		return get_color(33, 39);
	}
	get blue() {
		return get_color(34, 39);
	}
	get magenta() {
		return get_color(35, 39);
	}
	get cyan() {
		return get_color(36, 39);
	}
	get white() {
		return get_color(37, 39);
	}
	get gray() {
		return get_color(90, 39);
	}
	get grey() {
		return get_color(90, 39);
	}
	get brightRed() {
		return get_color(91, 39);
	}
	get brightGreen() {
		return get_color(92, 39);
	}
	get brightYellow() {
		return get_color(93, 39);
	}
	get brightBlue() {
		return get_color(94, 39);
	}
	get brightMagenta() {
		return get_color(95, 39);
	}
	get brightCyan() {
		return get_color(96, 39);
	}
	get brightWhite() {
		return get_color(97, 39);
	}
	/* Background Colors */
	get bgBlack() {
		return get_color(40, 49);
	}
	get bgRed() {
		return get_color(41, 49);
	}
	get bgGreen() {
		return get_color(42, 49);
	}
	get bgYellow() {
		return get_color(43, 49);
	}
	get bgMagenta() {
		return get_color(45, 49);
	}
	get bgBlue() {
		return get_color(44, 49);
	}
	get bgCyan() {
		return get_color(46, 49);
	}
	get bgWhite() {
		return get_color(47, 49);
	}
	get bgBrightRed() {
		return get_color(101, 49);
	}
	get bgBrightGreen() {
		return get_color(102, 49);
	}
	get bgBrightYellow() {
		return get_color(103, 49);
	}
	get bgBrightBlue() {
		return get_color(104, 49);
	}
	get bgBrightMagenta() {
		return get_color(105, 49);
	}
	get bgBrightCyan() {
		return get_color(106, 49);
	}
	get bgBrightWhite() {
		return get_color(107, 49);
	}

	/* Text Styles */
	get reset() {
		return get_color(0, 0);
	}
	get bold() {
		return get_color(1, 22);
	}
	get dim() {
		return get_color(2, 22);
	}
	get italic() {
		return get_color(3, 23);
	}
	get underline() {
		return get_color(4, 24);
	}
	get inverse() {
		return get_color(7, 27);
	}
	get hidden() {
		return get_color(8, 28);
	}
	get strikethrough() {
		return get_color(9, 29);
	}
}

const tcolor = new Tcolor();

export default tcolor;
