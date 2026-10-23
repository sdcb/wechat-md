// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { defaultTheme } from "../themes/themes";
import { buildCopyHtml, buildCopyPlainText, renderMarkdown } from "./renderMarkdown";

describe("WeChat copy compatibility", () => {
  it("preserves WeChat article links and downgrades external links", () => {
    const html = renderMarkdown("[文章](https://mp.weixin.qq.com/s/ABC) [项目](https://github.com/demo)", defaultTheme);
    const copied = buildCopyHtml(html, defaultTheme);
    expect(copied).toContain('href="https://mp.weixin.qq.com/s/ABC"');
    expect(copied).not.toContain('href="https://github.com/demo"');
    expect(copied).toContain("项目（https://github.com/demo）");
  });

  it("replaces task checkboxes and keeps nested list order", () => {
    const html = renderMarkdown("- [x] A\n  - B\n    - C\n- [ ] D", defaultTheme);
    const copied = buildCopyHtml(html, defaultTheme);
    expect(copied).not.toContain("checkbox");
    expect(copied).toContain("☑");
    expect(copied).toContain("☐");
    const text = Array.from(document.createRange().createContextualFragment(copied).querySelectorAll("p"))
      .map((paragraph) => paragraph.textContent?.trim())
      .filter(Boolean)
      .join("|");
    expect(text.indexOf("A")).toBeLessThan(text.indexOf("B"));
    expect(text.indexOf("B")).toBeLessThan(text.indexOf("C"));
  });

  it("does not leave whitespace text nodes between blocks around images and tables", () => {
    const markdown = "前文\n\n![说明](https://example.com/a.png)\n\n中间\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n后文\n\n- 一\n- 二";
    const copied = buildCopyHtml(renderMarkdown(markdown, defaultTheme), defaultTheme);
    const root = document.createRange().createContextualFragment(copied).firstElementChild!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const blank: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode())
      if (!/\S/.test(node.textContent ?? "")) blank.push(node.parentElement?.tagName ?? "?");
    expect(blank).toEqual([]);
    expect(copied).not.toMatch(/>\s+</);
  });

  it("copies images as WeChat-native paragraphs and tables inside a horizontal scroller", () => {
    const markdown = "![说明](https://example.com/a.png)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    const copied = buildCopyHtml(renderMarkdown(markdown, defaultTheme), defaultTheme);
    const root = document.createRange().createContextualFragment(copied).firstElementChild!;
    expect(root.querySelector("figure")).toBeNull();
    expect(root.querySelector("img")?.parentElement?.tagName).toBe("P");
    expect(root.querySelector("img")?.getAttribute("referrerpolicy")).toBe("no-referrer");
    const scroller = root.querySelector("table")?.parentElement;
    expect(scroller?.tagName).toBe("SECTION");
    expect(scroller?.parentElement).toBe(root);
    expect(scroller?.style.overflowX).toBe("auto");
    expect(scroller?.childNodes).toHaveLength(1);
    expect(copied).not.toContain("data-");
    expect([...root.children].map((child) => child.tagName)).toEqual(["P", "P", "SECTION"]);
  });

  it("keeps short table cells on one line and lets long cells wrap", () => {
    const markdown = "| 项目 | 说明 |\n| --- | --- |\n| ts-rust | 64 个文件，每个 24 个接口 + 常量，编译并输出 JS 和声明文件 |";
    const root = document.createRange().createContextualFragment(renderMarkdown(markdown, defaultTheme));
    const cells = [...root.querySelectorAll<HTMLTableCellElement>("th,td")];
    expect(cells.map((cell) => cell.style.whiteSpace)).toEqual(["nowrap", "nowrap", "nowrap", "normal"]);
    expect(cells[3].style.minWidth).toBe("8em");
    expect(cells.every((cell) => cell.style.wordBreak === "normal")).toBe(true);
  });

  it("keeps whitespace inside code blocks and between inline elements", () => {
    const copied = buildCopyHtml(renderMarkdown("**甲** *乙*\n\n```text\n  a\n\n  b\n```", defaultTheme), defaultTheme);
    const root = document.createRange().createContextualFragment(copied).firstElementChild!;
    expect(root.querySelector("p")?.textContent).toBe("甲 乙");
    expect(root.querySelector("pre > code")?.innerHTML).toBe("&nbsp;&nbsp;a<br><br>&nbsp;&nbsp;b");
  });

  it("keeps highlighted code spacing and indentation without relying on white-space:pre", () => {
    const markdown = "```csharp\nclass Program\n{\n    static void Main()\n\t{\n    }\n}\n```";
    const copied = buildCopyHtml(renderMarkdown(markdown, defaultTheme), defaultTheme);
    const pre = document.createRange().createContextualFragment(copied).querySelector("pre")!;
    expect(pre.querySelector("span")).not.toBeNull();
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
    const texts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node.textContent ?? "");
    expect(texts.some((text) => /[ \t\n\r]/.test(text))).toBe(false);
    expect(texts.some((text) => /^\u00a0+$/.test(text))).toBe(false);
    pre.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    expect(pre.textContent?.replace(/\u00a0/g, " ")).toBe("class Program\n{\n    static void Main()\n    {\n    }\n}");
  });

  it("keeps link URLs in plain-text clipboard fallback", () => {
    const plain = buildCopyPlainText("[项目](https://github.com/demo)\n\n- [x] 完成\n- [ ] 待办");
    expect(plain).toContain("项目（https://github.com/demo）");
    expect(plain).toContain("☑ 完成");
    expect(plain).toContain("☐ 待办");
  });
});
