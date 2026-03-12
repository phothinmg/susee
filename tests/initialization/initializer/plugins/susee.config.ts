export default {
	entryPoints: [{ entry: "src/index.ts", exportPath: "." }],
	allowUpdatePackageJson: false,
	plugins: [
		{
			type: "dependency",
			async: false,
			func(dep: { content: string; length: number } & Record<string, unknown>) {
				const content = `/* sync */\n${dep.content}`;
				return { ...dep, content, length: content.length };
			},
		},
		{
			type: "dependency",
			async: true,
			async func(
				dep: { content: string; length: number } & Record<string, unknown>,
			) {
				const content = `${dep.content}\n/* async */`;
				return { ...dep, content, length: content.length };
			},
		},
	],
};
