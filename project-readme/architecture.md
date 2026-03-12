# Architecture

The architecture follows a three-phase pipeline: **initialization**, **bundling**, and **compilation**. Each phase has clear boundaries and responsibilities.

## Initialization Phase

The initialization phase collects and validates all inputs required for next steps.

### Get Susee configuration

#### Info

- File : `src/lib/suseeConfig.ts`
- Function : `finalSuseeConfig`,`getConfigPath`,`checkEntries`
- Type : `FinalSuseeConfig`

#### Error handling

Checks for the following , if not one of these process will exit with code 1 :

1. **Config file exists**: Searches for `susee.config.{ts,js,mjs}` in project root -> Function : `getConfigPath`
2. **Non-empty entry points**: `config.entryPoints` array must contain at least one entry -> Function : `checkEntries`
3. **No duplicate exports**: Each exportPath must be unique across all entry points -> Function : `checkEntries`
4. **Entry files exist**: All entry file paths must resolve to actual files -> Function : `checkEntries`

#### Merge Susee config

Its will done by function `finalSuseeConfig` and return merged susee config object.
