import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent, Dispatch, SetStateAction } from "react";
import { compressImageFile, deleteImageAsset, describeStorageError, getAllImageAssets, putImageAsset, toPngBlob } from "../imageAssets";
import type { ImageAsset } from "../imageAssets";
import { getLocalAssetReferences, getMissingLocalImages, replaceImageUrl } from "../markdown/assets";
import type { MissingLocalImage } from "../markdown/assets";

import type { Notify } from "./useToast";

export const draftAssetOwner = "draft";

type UseImageAssetsOptions = {
  markdown: string;
  setMarkdown: Dispatch<SetStateAction<string>>;
  insertBlock: (content: string) => void;
  notify: Notify;
};

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function readEntryFiles(entry: FileSystemEntry, depth = 0): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) =>
      (entry as FileSystemFileEntry).file(
        (file) => resolve([file]),
        () => resolve([]),
      ),
    );
  }
  if (!entry.isDirectory || depth > 3) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const entries: FileSystemEntry[] = [];
  // readEntries returns results in batches until it yields an empty array.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve) => reader.readEntries(resolve, () => resolve([])));
    if (!batch.length) break;
    entries.push(...batch);
  }
  const nested = await Promise.all(entries.map((child) => readEntryFiles(child, depth + 1)));
  return nested.flat();
}

// Entries must be captured synchronously during the drop event; reading them can happen afterwards.
function collectDroppedFiles(dataTransfer: DataTransfer) {
  const entries = Array.from(dataTransfer.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (!entries.length) return Promise.resolve(Array.from(dataTransfer.files));
  return Promise.all(entries.map((entry) => readEntryFiles(entry))).then((files) => files.flat());
}

const maxInsertedImages = 20;

// A dropped article folder usually contains one Markdown file next to its images; prefer index.md / README.md.
function pickMarkdownFile(files: File[]) {
  const candidates = files.filter((file) => /\.(?:md|markdown)$/i.test(file.name));
  return (
    candidates.find((file) => /^index\.md$/i.test(file.name)) ??
    candidates.find((file) => /^readme\.md$/i.test(file.name)) ??
    candidates.sort((a, b) => a.name.localeCompare(b.name))[0]
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function useImageAssets({ markdown, setMarkdown, insertBlock, notify }: UseImageAssetsOptions) {
  const assetUrlsRef = useRef<Record<string, string>>({});
  const [assets, setAssets] = useState<ImageAsset[]>([]);
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAllImageAssets()
      .then((items) => {
        if (cancelled) return;
        const urls = Object.fromEntries(items.map((asset) => [asset.id, URL.createObjectURL(asset.blob)]));
        assetUrlsRef.current = urls;
        setAssets(items);
        setAssetUrls(urls);
      })
      .catch((error) => {
        if (!cancelled) notify(describeStorageError(error, "读取本地图片"), "error");
      });
    return () => {
      cancelled = true;
      Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
      assetUrlsRef.current = {};
    };
  }, [notify]);

  const referencedAssets = useMemo(() => {
    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return getLocalAssetReferences(markdown)
      .map((reference) => byId.get(reference.id))
      .filter((asset): asset is ImageAsset => Boolean(asset));
  }, [assets, markdown]);
  const missingImages = useMemo(() => getMissingLocalImages(markdown), [markdown]);

  async function importFiles(files: File[]) {
    const markdownFile = pickMarkdownFile(files);
    if (!markdownFile) {
      await addImageFiles(files);
      return;
    }
    const text = (await markdownFile.text()).replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    setMarkdown(text);
    await addImageFiles(files, { markdown: text, openedName: markdownFile.name });
  }

  async function addImageFiles(files: File[], opened?: { markdown: string; openedName: string }) {
    const images = files.filter((file) => file.type.startsWith("image/")).sort((a, b) => a.name.localeCompare(b.name));
    const missingByName = new Map<string, MissingLocalImage[]>();
    getMissingLocalImages(opened?.markdown ?? markdown).forEach((image) => {
      const key = image.fileName.toLowerCase();
      missingByName.set(key, [...(missingByName.get(key) ?? []), image]);
    });
    const matched = images.filter((file) => missingByName.has(file.name.toLowerCase()));
    // When the draft references local files, treat dropped files as candidates for those references only.
    const matching = Boolean(opened) || (missingByName.size > 0 && matched.length > 0);
    const selected = matching ? matched : images.slice(0, maxInsertedImages);
    if (!selected.length) {
      if (opened)
        notify(
          `已打开 ${opened.openedName}${missingByName.size ? `，${missingByName.size} 张本地图片未在文件夹中找到` : ""}`,
          missingByName.size ? "warning" : "success",
        );
      return;
    }
    setProcessing(true);
    try {
      const added: Array<{ asset: ImageAsset; targets: MissingLocalImage[] }> = [];
      for (const file of selected) {
        const targets = matching ? (missingByName.get(file.name.toLowerCase()) ?? []) : [];
        const fileAlt = file.name.replace(/\.[^.]+$/, "").trim();
        const alt = targets.find((target) => target.alt)?.alt ?? (fileAlt === "image" ? "" : fileAlt);
        const asset = await compressImageFile(file, draftAssetOwner, file.name || "粘贴图片", {}, undefined, alt);
        await putImageAsset(asset);
        added.push({ asset, targets });
      }
      const urls = { ...assetUrlsRef.current };
      added.forEach(({ asset }) => (urls[asset.id] = URL.createObjectURL(asset.blob)));
      assetUrlsRef.current = urls;
      setAssetUrls(urls);
      setAssets((items) => [...items, ...added.map(({ asset }) => asset)]);
      if (matching)
        setMarkdown((content) =>
          added.reduce(
            (result, { asset, targets }) =>
              targets.reduce((current, target) => replaceImageUrl(current, target.url, `asset://${asset.id}`), result),
            content,
          ),
        );
      else insertBlock(added.map(({ asset }) => `![${asset.alt}](asset://${asset.id})`).join("\n\n"));
      const before = added.reduce((total, { asset }) => total + asset.originalSize, 0);
      const after = added.reduce((total, { asset }) => total + asset.compressedSize, 0);
      const size = `${formatBytes(before)} → ${formatBytes(after)}`;
      if (matching) {
        const remaining = missingByName.size - added.length;
        notify(
          `${opened ? `已打开 ${opened.openedName}，` : "已"}匹配 ${added.length} 张本地图片（${size}）${remaining > 0 ? `，还缺 ${remaining} 张` : ""}`,
          remaining > 0 ? "warning" : "success",
        );
      } else
        notify(
          `已添加 ${added.length} 张图片（${size}）${images.length > added.length ? `，单次最多添加 ${maxInsertedImages} 张` : ""}`,
          images.length > added.length ? "warning" : "success",
        );
    } catch (error) {
      notify(describeStorageError(error, "添加图片"), "error");
    } finally {
      setProcessing(false);
    }
  }

  function handleDrop(event: ReactDragEvent<HTMLTextAreaElement>) {
    setDragActive(false);
    if (!Array.from(event.dataTransfer.items).some((item) => item.kind === "file")) return;
    event.preventDefault();
    void collectDroppedFiles(event.dataTransfer).then((files) => importFiles(files));
  }

  async function removeImage(asset: ImageAsset) {
    if (!window.confirm(`删除图片 ${asset.id}？正文中的引用也会一并移除。`)) return;
    try {
      await deleteImageAsset(asset.id);
      const url = assetUrlsRef.current[asset.id];
      if (url) URL.revokeObjectURL(url);
      const urls = { ...assetUrlsRef.current };
      delete urls[asset.id];
      assetUrlsRef.current = urls;
      setAssetUrls(urls);
      setAssets((items) => items.filter((item) => item.id !== asset.id));
      const pattern = new RegExp(`\\n{0,2}!\\[[^\\]]*\\]\\(asset:\\/\\/${escapeRegExp(asset.id)}\\)\\n{0,2}`, "g");
      setMarkdown((content) => content.replace(pattern, "\n\n").replace(/\n{3,}/g, "\n\n"));
    } catch (error) {
      notify(describeStorageError(error, "删除图片"), "error");
    }
  }

  function downloadImage(asset: ImageAsset) {
    const url = assetUrlsRef.current[asset.id] ?? URL.createObjectURL(asset.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = asset.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    if (!assetUrlsRef.current[asset.id]) URL.revokeObjectURL(url);
  }

  async function copyImage(asset: ImageAsset) {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      notify("当前浏览器不支持复制图片，请使用「下载」后手动上传", "error");
      return;
    }
    try {
      // Passing a promise keeps the user gesture alive in Safari while the PNG is being encoded.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": toPngBlob(asset.blob) })]);
      notify(
        `已复制图片 ${asset.id}，在公众号中选中对应占位块后 Ctrl+V 粘贴${asset.type === "image/gif" ? "（GIF 会变成静态图，动图请下载后上传）" : ""}`,
        asset.type === "image/gif" ? "warning" : "success",
        6000,
      );
    } catch {
      notify("复制图片失败：浏览器拒绝写入剪贴板，请使用「下载」后手动上传", "error");
    }
  }

  function copyImageById(id: string) {
    const asset = assets.find((item) => item.id === id);
    if (asset) void copyImage(asset);
  }

  return {
    assetUrls,
    referencedAssets,
    missingImages,
    processing,
    dragActive,
    setDragActive,
    addImageFiles,
    importFiles,
    handleDrop,
    removeImage,
    downloadImage,
    copyImage,
    copyImageById,
  };
}
