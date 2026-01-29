import ts from "typescript";

function normalizeStringPosix(path: string, allowAboveRoot: boolean) {
	let res = "";
	let lastSegmentLength = 0;
	let lastSlash = -1;
	let dots = 0;
	let code: number = 0;
	for (let i = 0; i <= path.length; ++i) {
		if (i < path.length) code = path.charCodeAt(i);
		else if (code === 47 /*/*/) break;
		else code = 47 /*/*/;
		if (code === 47 /*/*/) {
			if (lastSlash === i - 1 || dots === 1) {
				// no-op
			} else if (lastSlash !== i - 1 && dots === 2) {
				if (
					res.length < 2 ||
					lastSegmentLength !== 2 ||
					res.charCodeAt(res.length - 1) !== 46 /*.*/ ||
					res.charCodeAt(res.length - 2) !== 46 /*.*/
				) {
					if (res.length > 2) {
						const lastSlashIndex = res.lastIndexOf("/");
						if (lastSlashIndex !== res.length - 1) {
							if (lastSlashIndex === -1) {
								res = "";
								lastSegmentLength = 0;
							} else {
								res = res.slice(0, lastSlashIndex);
								lastSegmentLength = res.length - 1 - res.lastIndexOf("/");
							}
							lastSlash = i;
							dots = 0;
							continue;
						}
					} else if (res.length === 2 || res.length === 1) {
						res = "";
						lastSegmentLength = 0;
						lastSlash = i;
						dots = 0;
						continue;
					}
				}
				if (allowAboveRoot) {
					if (res.length > 0) res += "/..";
					else res = "..";
					lastSegmentLength = 2;
				}
			} else {
				if (res.length > 0) res += `/${path.slice(lastSlash + 1, i)}`;
				else res = path.slice(lastSlash + 1, i);
				lastSegmentLength = i - lastSlash - 1;
			}
			lastSlash = i;
			dots = 0;
		} else if (code === 46 /*.*/ && dots !== -1) {
			++dots;
		} else {
			dots = -1;
		}
	}
	return res;
}

function _extname(path: string) {
	let startDot = -1;
	let startPart = 0;
	let end = -1;
	let matchedSlash = true;
	// Track the state of characters (if any) we see before our first dot and
	// after any path separator we find
	let preDotState = 0;
	for (let i = path.length - 1; i >= 0; --i) {
		const code = path.charCodeAt(i);
		if (code === 47 /*/*/) {
			// If we reached a path separator that was not part of a set of path
			// separators at the end of the string, stop now
			if (!matchedSlash) {
				startPart = i + 1;
				break;
			}
			continue;
		}
		if (end === -1) {
			// We saw the first non-path separator, mark this as the end of our
			// extension
			matchedSlash = false;
			end = i + 1;
		}
		if (code === 46 /*.*/) {
			// If this is our first dot, mark it as the start of our extension
			if (startDot === -1) startDot = i;
			else if (preDotState !== 1) preDotState = 1;
		} else if (startDot !== -1) {
			// We saw a non-dot and non-path separator before our dot, so we should
			// have a good chance at having a non-empty extension
			preDotState = -1;
		}
	}
	if (
		startDot === -1 ||
		end === -1 ||
		// We saw a non-dot character immediately before the dot
		preDotState === 0 ||
		// The (right-most) trimmed path component is exactly '..'
		(preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
	) {
		return "";
	}
	return path.slice(startDot, end);
}

function _basename(path: string, ext?: string) {
	let start = 0;
	let end = -1;
	let matchedSlash = true;
	let i = 0;
	if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
		if (ext.length === path.length && ext === path) return "";
		let extIdx = ext.length - 1;
		let firstNonSlashEnd = -1;
		for (i = path.length - 1; i >= 0; --i) {
			const code = path.charCodeAt(i);
			if (code === 47 /*/*/) {
				// If we reached a path separator that was not part of a set of path
				// separators at the end of the string, stop now
				if (!matchedSlash) {
					start = i + 1;
					break;
				}
			} else {
				if (firstNonSlashEnd === -1) {
					// We saw the first non-path separator, remember this index in case
					// we need it if the extension ends up not matching
					matchedSlash = false;
					firstNonSlashEnd = i + 1;
				}
				if (extIdx >= 0) {
					// Try to match the explicit extension
					if (code === ext.charCodeAt(extIdx)) {
						if (--extIdx === -1) {
							// We matched the extension, so mark this as the end of our path
							// component
							end = i;
						}
					} else {
						// Extension does not match, so our result is the entire path
						// component
						extIdx = -1;
						end = firstNonSlashEnd;
					}
				}
			}
		}
		if (start === end) end = firstNonSlashEnd;
		else if (end === -1) end = path.length;
		return path.slice(start, end);
	} else {
		for (i = path.length - 1; i >= 0; --i) {
			if (path.charCodeAt(i) === 47 /*/*/) {
				// If we reached a path separator that was not part of a set of path
				// separators at the end of the string, stop now
				if (!matchedSlash) {
					start = i + 1;
					break;
				}
			} else if (end === -1) {
				// We saw the first non-path separator, mark this as the end of our
				// path component
				matchedSlash = false;
				end = i + 1;
			}
		}
		if (end === -1) return "";
		return path.slice(start, end);
	}
}

namespace utils {
	export const wait = (time: number) =>
		new Promise((resolve) => setTimeout(resolve, time));
	export const resolvePath = ts.sys.resolvePath;
	export const fileExists = ts.sys.fileExists;
	export const directoryExists = ts.sys.directoryExists;
	export const createDirectory = ts.sys.createDirectory;
	export const readDirectory = ts.sys.readDirectory;
	export const extname = _extname;
	export const basename = _basename;

	export function deleteFile(filePath: string) {
		filePath = resolvePath(filePath);
		if (fileExists(filePath) && typeof ts.sys.deleteFile === "function") {
			ts.sys.deleteFile(filePath);
		}
	}
	export function emitError(message?: string, options?: ErrorOptions) {
		return new Error(message, options);
	}
	export function dirname(path?: string) {
		if (!path) return ".";
		let code = path.charCodeAt(0);
		const hasRoot = code === 47; /*/*/
		let end = -1;
		let matchedSlash = true;
		for (let i = path.length - 1; i >= 1; --i) {
			code = path.charCodeAt(i);
			if (code === 47 /*/*/) {
				if (!matchedSlash) {
					end = i;
					break;
				}
			} else {
				// We saw the first non-path separator
				matchedSlash = false;
			}
		}
		if (end === -1) return hasRoot ? "/" : ".";
		if (hasRoot && end === 1) return "//";
		return path.slice(0, end);
	}

	export function modifyPath(path: string) {
		const match = path.match(/^\.+/);
		if (match) {
			const length = match[0].length + 1;
			return path.slice(length).trim();
		} else {
			return path;
		}
	}
	export function normalizePath(path: string) {
		if (path.length === 0) return ".";
		const isAbsolute = path.charCodeAt(0) === 47; /*/*/
		const trailingSeparator = path.charCodeAt(path.length - 1) === 47; /*/*/

		// Normalize the path
		path = normalizeStringPosix(path, !isAbsolute);
		if (path.length === 0 && !isAbsolute) path = ".";
		if (path.length > 0 && trailingSeparator) path += "/";
		if (isAbsolute) return `/${path}`;
		return path;
	}

	export function pathJoin(...args: string[]) {
		if (args.length === 0) return ".";
		let joinedPath: string | undefined;
		for (let i = 0; i < args.length; i++) {
			const arg = args[i];
			if (arg && arg.length > 0) {
				if (joinedPath === undefined) {
					joinedPath = arg;
				} else {
					joinedPath += `/${arg}`;
				}
			}
		}
		if (joinedPath === undefined) return ".";
		return modifyPath(joinedPath);
	}

	export function readFile(filePath: string) {
		const resolvedFilePath = resolvePath(filePath);
		if (!fileExists(resolvedFilePath))
			throw emitError(`${filePath} does not exist.`);
		const content = ts.sys.readFile(resolvedFilePath);
		if (content) {
			return content;
		} else {
			console.warn(`When reading ${filePath} received content is blank.`);
			return "";
		}
	}

	export function writeFile(filePath: string, data: string) {
		const resolvedFilePath = resolvePath(filePath);
		const dir = dirname(resolvedFilePath);
		if (fileExists(resolvedFilePath)) deleteFile(resolvedFilePath);
		if (!directoryExists(dir)) createDirectory(dir);
		ts.sys.writeFile(resolvedFilePath, data);
	}
	export function cleanDirectory(dirPath: string) {
		const resolvedDirPath = resolvePath(dirPath);
		if (directoryExists(resolvedDirPath)) {
			const files = readDirectory(resolvedDirPath);
			if (files.length > 0) {
				for (const file of files) {
					deleteFile(file);
				}
			}
		}
	}
}

export default utils;
