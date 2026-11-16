import { inlineImage, MAX_ASSET_BYTES, MAX_IMAGE_DATA_URL_LENGTH, uoocAssetUrl } from './rich-input.ts';

const IMAGE_TIMEOUT_MS = 10000;

/** 读取优课公开图片，返回可直接传给模型的栅格图像数据。 */
export async function loadExamAsset(url: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  if (uoocAssetUrl(url) !== url || typeof GM_xmlhttpRequest !== 'function') {
    throw new Error('无法读取优课图片');
  }

  const deadline = AbortSignal.timeout(IMAGE_TIMEOUT_MS);
  const active = signal === undefined ? deadline : AbortSignal.any([signal, deadline]);
  let handle: { abort(): void } | undefined;
  let cancel: (() => void) | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      cancel = () => {
        reject(active.reason);
        handle?.abort();
      };
      active.addEventListener('abort', cancel, { once: true });
      handle = GM_xmlhttpRequest({
        method: 'GET', url, anonymous: true, redirect: 'error', responseType: 'arraybuffer',
        onprogress: ({ loaded, total }) => {
          if (loaded > MAX_ASSET_BYTES || total > MAX_ASSET_BYTES) {
            reject(new Error('优课图片超过 512 KB'));
            handle?.abort();
          }
        },
        onload: (response) => {
          try {
            if (response.status !== 200 || response.finalUrl !== url) throw new Error('优课图片地址无法读取');
            const mime = /^content-type:[ \t]*(image\/(?:png|jpeg|gif|webp))\b/im.exec(response.responseHeaders)?.[1];
            const bytes = new Uint8Array(response.response as ArrayBuffer);
            if (bytes.length > MAX_ASSET_BYTES) throw new Error('优课图片超过 512 KB');
            if (mime === undefined || bytes.length === 0) throw new Error('优课图片格式不受支持');
            let binary = '';
            for (let i = 0; i < bytes.length; i += 8192) {
              binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            }
            const data = inlineImage(`data:${mime};base64,${btoa(binary)}`, MAX_IMAGE_DATA_URL_LENGTH);
            if (data === null) throw new Error('优课图片数据无效');
            resolve(data);
          } catch (error) {
            reject(error);
          }
        },
        onerror: () => reject(new Error('优课图片下载失败')),
        onabort: () => reject(active.reason ?? new Error('优课图片下载已停止')),
        ontimeout: () => reject(new Error('优课图片下载超时')),
      });
    });
  } finally {
    if (cancel !== undefined) active.removeEventListener('abort', cancel);
  }
}
