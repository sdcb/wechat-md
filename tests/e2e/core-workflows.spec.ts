import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.evaluate(async () => {
    localStorage.clear();
    indexedDB.deleteDatabase("wechat-publisher-assets");
  });
  await page.reload();
});

const editor = (page: Page) => page.locator("textarea.markdownInput");
const copyButton = (page: Page) => page.getByRole("button", { name: "复制到微信" });

async function readClipboardHtml(page: Page) {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const html = items.find((item) => item.types.includes("text/html"));
    return html ? await (await html.getType("text/html")).text() : "";
  });
}

async function writeClipboard(page: Page, text: string, html: string) {
  await page.evaluate(
    async ({ text: value, html: markup }) => {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([value], { type: "text/plain" }),
          "text/html": new Blob([markup], { type: "text/html" }),
        }),
      ]);
    },
    { text, html },
  );
}

async function pasteInto(page: Page) {
  await editor(page).fill("");
  await editor(page).click();
  await editor(page).press("Control+V");
}

test("shows a single copy action and no legacy toolbars", async ({ page }) => {
  await expect(copyButton(page)).toBeVisible();
  await expect(page.getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("link", { name: "GitHub 源代码" })).toHaveAttribute("href", "https://github.com/sdcb/wechat-md");
});

test("draft auto-saves and survives reload", async ({ page }) => {
  await editor(page).fill("# 自动保存测试\n\n这段内容应当在刷新后保留。");
  await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 5_000 });
  await page.waitForFunction(() => localStorage.getItem("wechat-md-draft")?.includes("刷新后保留"));
  await page.reload();
  await expect(editor(page)).toHaveValue("# 自动保存测试\n\n这段内容应当在刷新后保留。");
  await expect(page.locator(".articleBody h1")).toHaveText("自动保存测试");
});

test("legacy article library is migrated into the draft", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.clear();
    localStorage.setItem(
      "wechat-publisher-articles",
      JSON.stringify([{ id: "old", title: "旧文章", markdown: "# 旧文章内容", updatedAt: new Date().toISOString() }]),
    );
  });
  await page.reload();
  await expect(editor(page)).toHaveValue("# 旧文章内容");
});

test("copies inline-styled HTML without blank text nodes around images and tables", async ({ page }) => {
  await editor(page).fill("前文\n\n![说明](https://example.com/a.png)\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n后文");
  await copyButton(page).click();
  await expect(page.getByRole("button", { name: "已复制" })).toBeVisible();
  const html = await readClipboardHtml(page);
  expect(html).toContain("<table");
  expect(html).toContain("style=");
  expect(html).not.toContain("<figure");
  expect(html).not.toMatch(/<\/(p|table)>\s+</);
});

test("WeChat copy keeps external URLs and task state in plain text", async ({ page }) => {
  await editor(page).fill("[项目](https://github.com/demo)\n\n- [x] 已完成\n- [ ] 待办");
  await copyButton(page).click();
  const clipboard = await page.evaluate(async () => navigator.clipboard.readText());
  expect(clipboard).toContain("https://github.com/demo");
  expect(clipboard).toContain("☑");
  expect(clipboard).toContain("☐");
});

test("copy HTML uses an image ID placeholder instead of Base64", async ({ page }) => {
  await editor(page).fill("# 图片测试\n\n![说明](asset://IMG-E2E-001)");
  await copyButton(page).click();
  const html = await readClipboardHtml(page);
  expect(html).toContain("IMG-E2E-001");
  expect(html).not.toContain("data:image");
  await expect(page.getByRole("status").filter({ hasText: "本地图片以 ID 占位" })).toBeVisible();
});

test("Markdown clipboard content is pasted byte-for-byte", async ({ page }) => {
  const markdown = "## Markdown 粘贴测试\n\n这是 **粗体** 和 `code`。\n\n- [x] 完成\n- [ ] 待办";
  await writeClipboard(page, markdown, `<pre><span>${markdown}</span></pre>`);
  await pasteInto(page);
  await expect(editor(page)).toHaveValue(markdown);
});

test("rich HTML clipboard content is converted to Markdown", async ({ page }) => {
  await writeClipboard(
    page,
    "这是重要内容，点击项目地址",
    '<p>这是<strong>重要</strong>内容，<a href="https://github.com/demo">项目地址</a></p>',
  );
  await pasteInto(page);
  await expect(editor(page)).toHaveValue(/这是\*\*重要\*\*内容/);
  await expect(editor(page)).toHaveValue(/\[项目地址\]\(https:\/\/github\.com\/demo\)/);
  await expect(page.getByText("已将富文本转换为 Markdown")).toBeVisible();
});

test("Word clipboard content is converted with a Word-specific message", async ({ page }) => {
  await writeClipboard(page, "Word 正文", '<p class="MsoNormal">Word <b>正文</b></p>');
  await pasteInto(page);
  await expect(editor(page)).toHaveValue(/Word \*\*正文\*\*/);
  await expect(page.getByText("已将 Word 内容转换为 Markdown")).toBeVisible();
});

test("VS Code preview images become relative paths and are matched by dropped files", async ({ page }) => {
  await writeClipboard(
    page,
    "正文 甲 乙",
    '<p>正文</p><p><img src="https://file+.vscode-resource.vscode-cdn.net/C%3A/blog/01-a.png" alt="甲图" data-src="./01-a.png"></p>' +
      '<p><img src="https://file+.vscode-resource.vscode-cdn.net/C%3A/blog/02-b.png" alt="乙图" data-src="./02-b.png"></p>',
  );
  await pasteInto(page);
  await expect(editor(page)).toHaveValue(/!\[甲图\]\(\.\/01-a\.png\)/);
  await expect(page.getByText("2 张本地图片待匹配")).toBeVisible();
  await expect(page.locator(".articleBody").getByText("缺少本地图片 01-a.png")).toBeVisible();
  await expect(page.getByRole("button", { name: /缺 2/ })).toBeVisible();

  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    const data = new DataTransfer();
    ["01-A.png", "02-b.png", "unrelated.png"].forEach((name) => data.items.add(new File([blob], name, { type: "image/png" })));
    document.querySelector("textarea")!.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(editor(page)).toHaveValue(/!\[甲图\]\(asset:\/\/IMG-[^)]+\)[\s\S]*!\[乙图\]\(asset:\/\/IMG-[^)]+\)/);
  await expect(editor(page)).not.toHaveValue(/unrelated/);
  await expect(page.locator(".articleBody img")).toHaveCount(2);
  await expect(page.getByText("已匹配 2 张本地图片")).toBeVisible();
});

test("dropping an article folder opens its Markdown and matches its images", async ({ page }) => {
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    const data = new DataTransfer();
    data.items.add(new File([blob], "unused.png", { type: "image/png" }));
    data.items.add(new File(["# 新文章\r\n\r\n![甲图](./images/01-a.png)\r\n\r\n![缺失](./99.png)\r\n"], "index.md", { type: "" }));
    data.items.add(new File([blob], "01-a.png", { type: "image/png" }));
    document.querySelector("textarea")!.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(editor(page)).toHaveValue(/^# 新文章\n\n!\[甲图\]\(asset:\/\/IMG-[^)]+\)\n\n!\[缺失\]\(\.\/99\.png\)\n$/);
  await expect(page.getByText("已打开 index.md，匹配 1 张本地图片")).toBeVisible();
  await expect(page.locator(".articleBody img")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /缺 1/ })).toBeVisible();
});

test("dropping a single Markdown file replaces the current draft", async ({ page }) => {
  await editor(page).fill("# 旧草稿\n\n旧内容");
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.items.add(new File(["# 拖入的文章\n\n![图](./a.png)\n"], "post.md", { type: "text/markdown" }));
    document.querySelector("textarea")!.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  });
  await expect(editor(page)).toHaveValue("# 拖入的文章\n\n![图](./a.png)\n");
  await expect(page.getByText("已打开 post.md，1 张本地图片未在文件夹中找到")).toBeVisible();
});

test("pasted images are stored locally and listed in the image menu", async ({ page }) => {
  await editor(page).fill("");
  await editor(page).click();
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    const data = new DataTransfer();
    data.items.add(new File([blob], "image.png", { type: "image/png" }));
    document.querySelector("textarea")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  });
  await expect(editor(page)).toHaveValue(/!\[\]\(asset:\/\/IMG-\d{8}-[A-Z0-9]{6}\)/);
  await expect(page.locator(".articleBody img")).toHaveCount(1);
  await page.getByRole("button", { name: /图片 · 1/ }).click();
  await expect(page.getByRole("dialog", { name: "本地图片" }).locator("li")).toHaveCount(1);
});

test("local images can be copied to the clipboard as PNG from the preview and the image menu", async ({ page }) => {
  await editor(page).fill("");
  await editor(page).click();
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    canvas.getContext("2d")!.fillRect(0, 0, 8, 8);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/jpeg"));
    const data = new DataTransfer();
    data.items.add(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    document.querySelector("textarea")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
  });
  await expect(page.locator(".articleBody img")).toHaveCount(1);
  const readClipboardImageType = () =>
    page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return items[0]?.types.find((type) => type.startsWith("image/")) ?? "";
    });

  await page.locator(".articleBody img").click();
  await expect(page.getByRole("status").filter({ hasText: "已复制图片" })).toBeVisible();
  expect(await readClipboardImageType()).toBe("image/png");

  await writeClipboard(page, "reset", "<p>reset</p>");
  await page.getByRole("button", { name: /图片 · 1/ }).click();
  await page.getByRole("dialog", { name: "本地图片" }).getByRole("button", { name: "复制" }).click();
  await expect.poll(readClipboardImageType).toBe("image/png");
});
