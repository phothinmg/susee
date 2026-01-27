type OutPutHook =
	| {
			async: true;
			func: (code: string, file?: string) => Promise<string>;
	  }
	| {
			async: false;
			func: (code: string, file?: string) => string;
	  };
// biome-ignore lint/suspicious/noExplicitAny: call hooks
type OutPutHookFunc = (...args: any[]) => OutPutHook;

type OutFiles = {
	commonjs: string | undefined;
	commonjsTypes: string | undefined;
	esm: string | undefined;
	esmTypes: string | undefined;
	main: string | undefined;
	module: string | undefined;
	types: string | undefined;
};
type Target = "commonjs" | "esm" | "both";

type Exports = Record<
	string,
	{
		import?: { default: string; types: string };
		require?: { default: string; types: string };
	}
>;

export type { OutPutHook, OutPutHookFunc, OutFiles, Target, Exports };
