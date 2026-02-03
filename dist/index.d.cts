import type SuSee from "@suseejs/types";
interface EntryPoint {
    entry: string;
    exportPath: "." | `./${string}`;
    moduleType?: "commonjs" | "esm" | "both";
    tsconfigFilePath?: string | undefined;
}
interface SuSeeConfig {
    entryPoints: EntryPoint[];
    postProcessHooks?: SuSee.PostProcessHook[];
    allowUpdatePackageJson?: boolean;
    nodeEnv?: boolean;
    renameDuplicates?: boolean;
}
declare function susee(): Promise<void>;
export type { SuSeeConfig };
export { susee };
//# sourceMappingURL=index.d.ts.map