import { describe, expect, it } from "vitest";
import {
  getImageFileName,
  getLocalAssetReferences,
  getMissingLocalImages,
  getReferencedAssetIds,
  isLocalImagePath,
  prepareAssetMarkdown,
  replaceImageUrl,
} from "./assets";

describe("local image references", () => {
  it("replaces local image syntax with safe asset elements", () => {
    expect(prepareAssetMarkdown("![封面<script>](asset://IMG-ABC123)")).toBe('<img data-asset-id="IMG-ABC123" alt="封面&lt;script&gt;">');
  });

  it("deduplicates references while preserving order", () => {
    const markdown = "![甲](asset://IMG-A)\n![重复](asset://IMG-A)\n![乙](asset://IMG-B)";
    expect(getLocalAssetReferences(markdown)).toEqual([
      { id: "IMG-A", alt: "甲" },
      { id: "IMG-B", alt: "乙" },
    ]);
  });

  it("collects references across articles", () => {
    expect([...getReferencedAssetIds(["![](asset://IMG-A)", "![](asset://IMG-B)\n![](asset://IMG-A)"])]).toEqual(["IMG-A", "IMG-B"]);
  });
});

describe("missing local images", () => {
  it("detects relative, file and VS Code webview paths but not reachable URLs", () => {
    const markdown = [
      "![甲](./01-a.png)",
      '![乙](images/02%20b.jpg "标题")',
      "![](<./03 c.png>)",
      "![](file:///C:/blog/04-d.png)",
      "![](https://file+.vscode-resource.vscode-cdn.net/C%3A/blog/05-e.png)",
      "![](https://example.com/remote.png)",
      "![](asset://IMG-A)",
      "![重复](./01-a.png)",
    ].join("\n\n");
    expect(getMissingLocalImages(markdown).map((image) => image.fileName)).toEqual([
      "01-a.png",
      "02 b.jpg",
      "03 c.png",
      "04-d.png",
      "05-e.png",
    ]);
  });

  it("replaces every reference to a path while keeping alt text", () => {
    const markdown = "![甲](./01-a.png)\n\n![甲再次](./01-a.png)\n\n![乙](./02.png)";
    expect(replaceImageUrl(markdown, "./01-a.png", "asset://IMG-A")).toBe(
      "![甲](asset://IMG-A)\n\n![甲再次](asset://IMG-A)\n\n![乙](./02.png)",
    );
  });

  it("decodes file names", () => {
    expect(getImageFileName("./a%20b.png?raw=1")).toBe("a b.png");
    expect(isLocalImagePath("data:image/png;base64,AA")).toBe(false);
  });
});
