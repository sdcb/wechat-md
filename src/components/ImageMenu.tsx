import { useEffect, useRef, useState } from "react";
import type { ImageAsset } from "../imageAssets";
import { formatBytes } from "../hooks/useImageAssets";
import type { MissingLocalImage } from "../markdown/assets";
import { ImageIcon } from "./icons";

type ImageMenuProps = {
  assets: ImageAsset[];
  missing: MissingLocalImage[];
  urls: Record<string, string>;
  processing: boolean;
  onAdd: (files: File[]) => void;
  onDownload: (asset: ImageAsset) => void;
  onRemove: (asset: ImageAsset) => void;
};

export function ImageMenu({ assets, missing, urls, processing, onAdd, onDownload, onRemove }: ImageMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="imageMenu" ref={rootRef}>
      <button className="subtleButton" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <ImageIcon />
        {processing ? "处理中…" : `图片${assets.length ? ` · ${assets.length}` : ""}`}
        {!processing && missing.length > 0 && <span className="missingBadge">缺 {missing.length}</span>}
      </button>
      {open && (
        <div className="imagePopover" role="dialog" aria-label="本地图片">
          <p className="imagePopoverHint">本地图片保存在浏览器中，复制后以 ID 占位。请下载后在公众号编辑器中上传替换。</p>
          {assets.length > 0 && (
            <ul className="imageList">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <img src={urls[asset.id]} alt={asset.alt} />
                  <div className="imageInfo">
                    <strong>{asset.id}</strong>
                    <span>
                      {asset.width}×{asset.height} · {formatBytes(asset.compressedSize)}
                    </span>
                  </div>
                  <button className="linkButton" type="button" onClick={() => onDownload(asset)}>
                    下载
                  </button>
                  <button className="linkButton danger" type="button" onClick={() => onRemove(asset)}>
                    删除
                  </button>
                </li>
              ))}
            </ul>
          )}
          {missing.length > 0 && (
            <div className="missingImages">
              <p className="imagePopoverHint">
                缺少 {missing.length} 张本地图片。把图片或所在文件夹拖进编辑区，或在下方选择，会按文件名自动匹配。
              </p>
              <ul>
                {missing.map((image) => (
                  <li key={image.url} title={image.url}>
                    {image.fileName}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="imagePopoverActions">
            <button className="secondaryButton" type="button" disabled={processing} onClick={() => inputRef.current?.click()}>
              添加图片…
            </button>
            {missing.length > 0 && (
              <button className="secondaryButton" type="button" disabled={processing} onClick={() => folderRef.current?.click()}>
                选择文件夹…
              </button>
            )}
          </div>
          <input
            ref={folderRef}
            className="visuallyHidden"
            type="file"
            {...{ webkitdirectory: "" }}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              onAdd(files);
            }}
          />
          <input
            ref={inputRef}
            className="visuallyHidden"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              onAdd(files);
            }}
          />
        </div>
      )}
    </div>
  );
}
