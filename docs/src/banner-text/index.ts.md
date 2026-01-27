# 🎀 src/banner-text/index.ts

A **post-process hook** that injects a provided banner string into bundled JavaScript files. This hook conforms to the `OutPutHook` interface and is typically used in the Susee build pipeline to prepend license headers or other metadata comments.  

## Overview  
- **Purpose**: Prepend a banner (e.g., license text) to `.js` outputs only.  
- **Integration**: Passed as part of the `hooks` array in `susee.build` options.  
- **Execution**: Synchronous; runs immediately after code emission.  

## bannerText Function

```ts
const bannerText = (str: string): OutPutHook => {
  return {
    async: false,
    func: (code, file) => {
      if (path.extname(file as string) === ".js") {
        code = `${str}\n${code}`;
      }
      return code;
    },
  };
};
export default bannerText;
```

This snippet is from the source file.   

## API

| Function     | Signature                         | Description                                    |
|--------------|------------------------------------|------------------------------------------------|
| **bannerText** | `(str: string) => OutPutHook`    | Creates a hook that injects `str` before code. |

### Parameters

| Name | Type   | Description                         |
|------|--------|-------------------------------------|
| `str`   | `string` | The banner text to prepend to code. |

### Returns

| Type       | Description                                                                                 |
|------------|---------------------------------------------------------------------------------------------|
| `OutPutHook` | A hook object with: <br/>• `async: false` <br/>• `func(code, file) => string`              |

## Type Definitions  

```ts
type OutPutHook =
  | { async: true;  func: (code: string, file?: string) => Promise<string> }
  | { async: false; func: (code: string, file?: string) => string };
```

The `OutPutHook` union controls whether the hook’s `func` returns synchronously or asynchronously.   

## Implementation Details  
- Imports Node’s `path.extname` to detect file extensions.  
- Only targets files ending with `.js`.  
- Returns the original code unchanged for all other extensions.  
- Synchronous execution ensures ordering with other hooks.  

## Usage Example  

```ts
import susee from "susee";
import bannerText from "susee/banner-text";
import minify from "susee/minify";

const license = `/*!
 * My Library v1.0.0
 * (c) 2025 Jane Doe
 */`.trim();

await susee.build({
  entry: "src/index.ts",
  outDir: "dist",
  defaultExportName: "myLib",
  hooks: [
    bannerText(license),   // Prepend license banner
    minify(),              // Then minify code
  ],
});
```

The `bannerText(license)` hook will only affect the emitted `.js` files.  

```card
{
  "title": "Tip",
  "content": "Banner injection applies exclusively to JavaScript outputs."
}
```