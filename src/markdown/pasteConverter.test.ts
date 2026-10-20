// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { convertPastedHtml } from "./pasteConverter";

describe("convertPastedHtml", () => {
  it("converts Word list paragraphs and removes hidden content", () => {
    const result = convertPastedHtml(
      '<p class="MsoListParagraph" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1. </span>第一项</p><p style="display:none">隐藏</p>',
    );
    expect(result.markdown).toContain("1. 第一项");
    expect(result.markdown).not.toContain("隐藏");
  });

  it("turns embedded images into upload reminders", () => {
    const result = convertPastedHtml('<p>正文</p><img src="data:image/png;base64,AAAA" alt="截图">');
    expect(result.skippedImages).toBe(1);
    expect(result.markdown).toContain("图片需重新上传");
  });

  it("restores the original Markdown path of images copied from the VS Code preview", () => {
    const result = convertPastedHtml(
      '<p data-line="1" class="code-line"><img src="https://file+.vscode-resource.vscode-cdn.net/C%3A/blog/post/01-anders.png" alt="Anders 的回复" data-src="./01-anders.png" id="image-0"></p>' +
        '<p><img src="https://file+.vscode-resource.vscode-cdn.net/C%3A/blog/post/my%20shot.png" alt=""></p>' +
        '<p><img src="https://example.com/a.png" alt="远程"></p>',
    );
    expect(result.localImages).toBe(2);
    expect(result.skippedImages).toBe(0);
    expect(result.markdown).toContain("![Anders 的回复](./01-anders.png)");
    expect(result.markdown).toContain("](./my%20shot.png)");
    expect(result.markdown).toContain("![远程](https://example.com/a.png)");
    expect(result.markdown).not.toContain("vscode-resource");
  });
});
