import { describe, expect, it } from "vitest";
import { classifyLink, formatLinkAsPlainText, formatLinkUrlForDisplay, isWechatArticleUrl, summarizeMarkdownLinks } from "./links";

describe("Markdown link compatibility", () => {
  it("recognizes WeChat article links without private attributes", () => {
    expect(isWechatArticleUrl("https://mp.weixin.qq.com/s/ABC")).toBe(true);
    expect(classifyLink("https://mp.weixin.qq.com/s?__biz=demo")).toBe("wechat-article");
    expect(isWechatArticleUrl("https://github.com/demo")).toBe(false);
  });

  it("keeps external link URLs when converting to plain text", () => {
    expect(formatLinkAsPlainText("GitHub", "https://github.com/demo")).toBe("GitHub（https://github.com/demo）");
    expect(formatLinkAsPlainText("https://github.com/demo", "https://github.com/demo")).toBe("https://github.com/demo");
    expect(formatLinkAsPlainText("联系我们", "mailto:test@example.com")).toBe("联系我们（test@example.com）");
  });

  it("does not repeat a URL that only differs from the text by scheme, www or trailing slash", () => {
    expect(formatLinkAsPlainText("sdcb.ai/arithmetic", "https://sdcb.ai/arithmetic")).toBe("sdcb.ai/arithmetic");
    expect(formatLinkAsPlainText("GitHub.com/sdcb", "https://www.github.com/sdcb/")).toBe("GitHub.com/sdcb");
    expect(formatLinkAsPlainText("test@example.com", "mailto:test@example.com")).toBe("test@example.com");
  });

  it("shortens URLs for display but keeps the insecure http scheme", () => {
    expect(formatLinkUrlForDisplay("https://github.com/sdcb/Arithmetic/")).toBe("github.com/sdcb/Arithmetic");
    expect(formatLinkUrlForDisplay("http://example.com")).toBe("http://example.com");
    expect(formatLinkUrlForDisplay("mailto:test@example.com")).toBe("test@example.com");
  });

  it("summarizes explicit, autolink and bare URL forms", () => {
    expect(
      summarizeMarkdownLinks(
        "[文章](https://mp.weixin.qq.com/s/ABC) [项目](https://github.com/demo)\n<mailto:test@example.com>\nhttp://example.com",
      ),
    ).toEqual({ wechatArticleCount: 1, externalHttpsCount: 1, insecureHttpCount: 1, mailtoCount: 1, emptyCount: 0 });
  });
});
