import type { RefObject } from "react";

type PreviewPaneProps = {
  previewRef: RefObject<HTMLDivElement | null>;
  bodyHtml: string;
  onScroll: () => void;
  onImageClick: (assetId: string) => void;
};

export function PreviewPane({ previewRef, bodyHtml, onScroll, onImageClick }: PreviewPaneProps) {
  return (
    <section className="pane previewPane" aria-label="公众号预览">
      <div className="paneHeader">
        <span className="paneTitle">预览</span>
        <span className="paneHint">公众号手机端效果 · 点击本地图片可复制</span>
      </div>
      <div className="previewScroller" ref={previewRef} onScroll={onScroll}>
        <article className="articleCard">
          <div
            className="articleBody"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
            onClick={(event) => {
              const target = event.target;
              if (target instanceof HTMLImageElement && target.dataset.assetId) onImageClick(target.dataset.assetId);
            }}
          />
        </article>
      </div>
    </section>
  );
}
