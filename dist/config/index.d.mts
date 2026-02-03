import type SuSee from "@suseejs/types";
export interface EntryPoint {
    entry: string;
    exportPath: "." | `./${string}`;
    moduleType?: "commonjs" | "esm" | "both";
    tsconfigFilePath?: string | undefined;
}
export interface SuSeeConfig {
    entryPoints: EntryPoint[];
    postProcessHooks?: SuSee.PostProcessHook[];
    allowUpdatePackageJson?: boolean;
    nodeEnv?: boolean;
    renameDuplicates?: boolean;
}
export declare const suseeConfig: SuSeeConfig;
//# sourceMappingURL=index.d.ts.map