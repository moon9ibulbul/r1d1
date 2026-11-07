/**
 * Adapted injection logic for Ridibooks Android Viewer (LSPatch / Xposed module).
 * Based on https://github.com/qpsg4ojf8tnuf3td9tp97prb/r1d18ook5
 */

(() => {
    if (window.__ridi_hook_injected__) {
        console.log("[RidiHook] Script already injected.");
        return;
    }
    window.__ridi_hook_injected__ = true;

    const downloadIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
      </svg>
    `;

    function logMsg(msg) {
        console.log("[RidiHook] " + msg);
        if (window.RidiNativeBridge && typeof window.RidiNativeBridge.log === "function") {
            window.RidiNativeBridge.log(msg);
        }
    }

    function logErr(msg) {
        console.error("[RidiHook] " + msg);
        if (window.RidiNativeBridge && typeof window.RidiNativeBridge.logError === "function") {
            window.RidiNativeBridge.logError(msg);
        }
    }

    function showPopup(message, type = "info", duration = 3000) {
        if (type === "error") {
            logErr(message);
        } else {
            logMsg(message);
        }

        if (window.RidiNativeBridge && typeof window.RidiNativeBridge.showToast === "function") {
            window.RidiNativeBridge.showToast(message);
        }

        const popup = document.createElement("div");
        popup.textContent = message;
        popup.style.cssText = `
          position: fixed;
          top: 20px;
          right: 15px;
          padding: 10px 14px;
          background: rgba(0, 0, 0, 0.85);
          color: white;
          border-left: 4px solid ${type === "error" ? "#ff4d4f" : "#1890ff"};
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          z-index: 999999;
          font-size: 13px;
          max-width: 80vw;
          word-break: break-word;
        `;

        document.body.appendChild(popup);

        if (duration > 0) {
            setTimeout(() => {
                if (popup.parentNode) {
                    document.body.removeChild(popup);
                }
            }, duration);
        }

        return popup;
    }

    // Helper to convert Blob to Base64 data string
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    // Save/download file via Native Bridge or fallback browser download
    async function saveFile(blob, filename, mimeType = "") {
        if (window.RidiNativeBridge && typeof window.RidiNativeBridge.saveBase64File === "function") {
            try {
                showPopup(`Saving ${filename}...`);
                const base64 = await blobToBase64(blob);
                const success = window.RidiNativeBridge.saveBase64File(base64, filename, mimeType);
                if (success) {
                    return;
                }
            } catch (e) {
                logErr("Native bridge save failed: " + e.message);
            }
        }

        // Fallback: standard web download
        try {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            showPopup(`Downloaded ${filename}!`);
        } catch (e) {
            showPopup(`Download failed: ${e.message}`, "error");
        }
    }

    // resolve epub path
    function resolvePath(baseDir, path) {
        if (path.startsWith("/")) return path.substring(1);
        if (!path.includes("../") && !path.includes("./")) return baseDir + path;

        const base = baseDir.split("/").filter(Boolean);
        const segments = path.split("/");
        const result = [...base];

        segments.forEach((segment) => {
            if (segment === "..") result.length && result.pop();
            else if (segment !== ".") result.push(segment);
        });

        return result.join("/");
    }

    // fetch & download comic archive
    async function getArchive(progress, baseUrl, pages, filename) {
        try {
            const files = new Map();

            // Common image file signatures (magic numbers)
            const imageSignatures = {
                ffd8ff: ".jpg",
                "7b226a": ".jp2",
                "0000000c6a5020": ".jp2",
                "89504e47": ".png",
                "47494638": ".gif",
                "52494646": ".webp",
                "3026b275": ".webp",
                "424d": ".bmp",
                "49492a00": ".tif",
                "4d4d002a": ".tif",
            };

            if (progress) {
                progress.style.visibility = "visible";
                progress.max = pages;
                progress.value = 0;
            }

            for (let i = 0; i <= pages; i++) {
                if (progress) progress.value = i;
                const pageUrl = `${baseUrl}${i}`;
                const response = await fetch(pageUrl);
                const blob = await response.blob();

                // Read first 12 bytes
                const buffer = await blob.slice(0, 12).arrayBuffer();
                const bytes = new Uint8Array(buffer);

                let hex = "";
                for (let j = 0; j < bytes.length; j++) {
                    hex += bytes[j].toString(16).padStart(2, "0");
                }

                let isImage = false;
                let extension = ".bin";

                for (const signature in imageSignatures) {
                    if (hex.startsWith(signature.toLowerCase())) {
                        extension = imageSignatures[signature];
                        isImage = true;
                        break;
                    }
                }

                if (!isImage) {
                    showPopup(`Unknown format on page ${i}`, "error");
                }

                files.set(`${i}${extension}`, blob);
            }

            if (progress) progress.style.visibility = "hidden";

            if (typeof JSZip === "undefined") {
                showPopup("JSZip is not loaded!", "error");
                return;
            }

            const zip = new JSZip();
            files.forEach((blob, path) => {
                zip.file(path, blob, {
                    compression: "DEFLATE",
                    compressionOptions: { level: 9 },
                });
            });

            showPopup("Start archiving comic...");
            const zipBlob = await zip.generateAsync({ type: "blob" });
            await saveFile(zipBlob, `${filename}.zip`, "application/zip");
            showPopup("Archived successfully!");
        } catch (error) {
            showPopup(`Error creating archive: ${error.message}`, "error");
        }
    }

    // fetch & download epub
    async function getEpub(progress, baseUrl, filename) {
        try {
            const files = new Map();
            files.set(
                "mimetype",
                new Blob(["application/epub+zip"], { type: "text/plain" })
            );

            if (progress) {
                progress.max = 3;
                progress.value = 0;
                progress.style.visibility = "visible";
            }

            // fetch container.xml
            const containerRes = await fetch(`${baseUrl}META-INF/container.xml`);
            files.set("META-INF/container.xml", await containerRes.clone().blob());
            const containerXml = new DOMParser().parseFromString(
                await containerRes.text(),
                "application/xml"
            );
            const opfPath = containerXml
                .querySelector("rootfile")
                .getAttribute("full-path");

            if (progress) progress.value = 1;

            // fetch opf
            const opfUrl = new URL(opfPath, baseUrl).href;
            const opfRes = await fetch(opfUrl);
            files.set(opfPath, await opfRes.clone().blob());
            const opfXml = new DOMParser().parseFromString(
                await opfRes.text(),
                "application/xml"
            );
            const opfDir = opfPath.includes("/")
                ? opfPath.substring(0, opfPath.lastIndexOf("/") + 1)
                : "";
            const items = [...opfXml.querySelectorAll("manifest > item")];

            if (progress) {
                progress.max = 2 + items.length;
                progress.value = 2;
            }

            let currentFile = 0;
            await Promise.all(
                items.map(async (item) => {
                    const href = item.getAttribute("href");
                    const url = new URL(href, opfUrl).href;
                    const path = resolvePath(opfDir, decodeURIComponent(href));

                    const res = await fetch(url);
                    files.set(path, await res.blob());

                    currentFile++;
                    if (progress) progress.value = 2 + currentFile;
                })
            );

            if (progress) progress.style.visibility = "hidden";

            if (typeof JSZip === "undefined") {
                showPopup("JSZip is not loaded!", "error");
                return;
            }

            const zip = new JSZip();
            files.forEach((blob, path) => {
                zip.file(
                    path,
                    blob,
                    path === "mimetype"
                        ? { compression: "STORE" }
                        : {
                              compression: "DEFLATE",
                              compressionOptions: { level: 9 },
                          }
                );
            });

            showPopup("Start packing EPUB...");
            const epubBlob = await zip.generateAsync({ type: "blob" });
            await saveFile(epubBlob, `${filename}.epub`, "application/epub+zip");
            showPopup("EPUB packed successfully!");
        } catch (error) {
            showPopup(`Error creating EPUB: ${error.message}`, "error");
        }
    }

    // Helper function to wait for selector
    function waitFor(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) return resolve(element);

            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for "${selector}"`));
            }, timeout);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    clearTimeout(timer);
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    async function isNovelPage() {
        try {
            await waitFor("ridi-page-view", 2000);
            return true;
        } catch {
            return !!document.querySelector("ridi-page-view") || location.href.includes("-file");
        }
    }

    async function isComicPage() {
        try {
            await waitFor("input[type='range']", 2000);
            return (
                !!document.querySelector("img.page-right") ||
                !!document.querySelector("img.page-left")
            );
        } catch {
            return (
                !!document.querySelector("img.page-right") ||
                !!document.querySelector("img.page-left") ||
                location.href.includes("-page")
            );
        }
    }

    function createFloatingDownloadButton(onClick) {
        if (document.getElementById("ridi-floating-dl-btn")) return;
        const floatBtn = document.createElement("button");
        floatBtn.id = "ridi-floating-dl-btn";
        floatBtn.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;">
            ${downloadIcon}
            <span style="font-weight:bold;font-size:14px;">DL</span>
          </div>
          <progress id="ridi-dl-progress" style="display:none;width:100%;margin-top:4px;height:4px;"></progress>
        `;
        floatBtn.style.cssText = `
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 999999;
          background: #1f8ceb;
          color: white;
          border: none;
          border-radius: 28px;
          padding: 10px 18px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          cursor: pointer;
        `;
        floatBtn.addEventListener("click", () => {
            const progress = floatBtn.querySelector("#ridi-dl-progress");
            if (progress) progress.style.display = "block";
            onClick(progress);
        });
        document.body.appendChild(floatBtn);
    }

    async function init() {
        try {
            if (document.readyState === "loading") {
                await new Promise((resolve) =>
                    document.addEventListener("DOMContentLoaded", resolve)
                );
            }

            const isNovel = await isNovelPage().catch(() => false);
            const isComic = !isNovel && (await isComicPage().catch(() => false));

            if (!isNovel && !isComic) {
                logMsg("Neither novel nor comic viewer detected on this frame/page.");
                return;
            }

            logMsg(`Detected viewer type: ${isNovel ? "Novel" : "Comic"}`);

            const pages = isComic
                ? (+document.querySelector("input[type='range']")?.max || 0) + 1
                : 0;

            const titleEl = document.querySelector("div[title]") || document.title;
            const bookTitle = (typeof titleEl === "string" ? titleEl : titleEl?.getAttribute("title")) || "ridibooks_download";

            const downloadAction = (progress) => {
                if (isNovel) {
                    const rawUrl = ((u) =>
                        u.origin + "/" + u.pathname.split("/")[1])(
                        new URL(location.href)
                    );
                    if (!rawUrl || !rawUrl.endsWith("-file")) {
                        showPopup(`Error: Cannot resolve base URL from ${location.href}`, "error");
                        return;
                    }
                    const baseUrl = rawUrl.slice(0, -5) + "-entry/";
                    getEpub(progress, baseUrl, bookTitle);
                } else {
                    const imgEl =
                        document.querySelector("img.page-right") ||
                        document.querySelector("img.page-left");
                    if (imgEl) {
                        const baseUrl = `${imgEl.src.split("-page")[0]}-page/`;
                        getArchive(progress, baseUrl, pages, bookTitle);
                    } else {
                        showPopup("Could not locate comic page images", "error");
                    }
                }
            };

            // In mobile WebView, the toolbar UI might differ from Electron desktop.
            // Check for standard desktop toolbar first:
            const title = document.querySelector("div[title]");
            const btnArea = title?.parentElement?.parentElement?.parentElement?.querySelectorAll(
                ":scope > div"
            )?.[1];

            if (btnArea && btnArea.querySelector(":scope > button")) {
                const btn = btnArea.querySelector(":scope > button").cloneNode(true);
                btn.childNodes[btn.childNodes.length - 1].nodeValue = "Download";

                const progress = document.createElement("progress");
                progress.style.visibility = "hidden";
                btn.appendChild(progress);

                const icon = btn.querySelector(":scope > div");
                if (icon) {
                    icon.removeAttribute("style");
                    icon.style.background = "transparent";
                    icon.innerHTML = downloadIcon;
                }

                btn.addEventListener("click", () => downloadAction(progress));
                btnArea.appendChild(btn);
            }

            // Always also attach floating download button for reliable mobile access
            createFloatingDownloadButton(downloadAction);

            showPopup("RidiHook loaded! Ready to download.");
        } catch (error) {
            logErr("Initialization error: " + error.message);
        }
    }

    init();
})();
