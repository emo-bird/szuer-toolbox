import { isEnabled } from '../../../common/core/settings.ts';
import { noticePost } from '../notice.ts';
import { SITE_ID, TOGGLE } from '../settings.ts';

const PROMPT_SELECTOR = [
  '#aliyunCaptcha-window-popup',
  '#aliyunCaptcha-window-embed',
  'iframe[src*="captcha-open.aliyuncs.com"]',
  'iframe[src*="captcha.alicdn.com"]',
].join(',');

function isVisible(node: Element): boolean {
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0 || node.closest('[hidden], [aria-hidden="true"]')) return false;
  if (typeof node.checkVisibility === 'function') {
    return node.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  }
  const style = node.ownerDocument.defaultView?.getComputedStyle(node);
  return style !== undefined && style.visibility === 'visible' && style.opacity !== '0';
}

let audio: AudioContext | null = null;

export function prepareQuizAlertSound(): void {
  if (!isEnabled(SITE_ID, TOGGLE.CAPTCHA_SOUND)) return;
  if (audio?.state === 'running' || navigator.userActivation?.isActive === false) return;
  try {
    if (audio === null || audio.state === 'closed') audio = new AudioContext();
    void audio.resume().catch(() => undefined);
  } catch {
    // 浏览器禁用音频时仍显示文字提醒。
  }
}

export function playQuizAlertSound(kind: 'confirm' | 'verification'): void {
  if (audio?.state !== 'running' || !isEnabled(SITE_ID, TOGGLE.CAPTCHA_SOUND)) return;
  const start = audio.currentTime;
  const frequencies = kind === 'confirm' ? [1047, 1319] : [1319, 1760];
  for (const [index, frequency] of frequencies.entries()) {
    const offset = index * 0.29;
    const at = start + offset;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(0.5, at + 0.025);
    volume.gain.setValueAtTime(0.5, at + 0.15);
    volume.gain.exponentialRampToValueAtTime(0.001, at + 0.24);
    tone.connect(volume).connect(audio.destination);
    tone.start(at);
    tone.stop(at + 0.25);
  }
}

/** 在等待交卷结果期间，只观察站点验证弹窗的可见性。 */
export function watchVerificationPrompt(exam: Document, frame: HTMLIFrameElement | null): () => void {
  prepareQuizAlertSound();
  const docs = exam === document ? [exam] : [exam, document];
  const promptVisible = (): boolean => docs.some((doc) =>
    (doc !== exam || frame === null || isVisible(frame)) &&
    Array.from(doc.querySelectorAll(PROMPT_SELECTOR)).some(isVisible),
  );
  let wasVisible = promptVisible();
  let dismiss: void | (() => void);
  const scan = (): void => {
    const visible = promptVisible();
    if (visible === wasVisible) return;
    wasVisible = visible;
    if (visible) {
      dismiss = noticePost('测验验证码已弹出，请在试卷页面手动完成验证', 'warn', { dedupe: false });
      playQuizAlertSound('verification');
    } else {
      dismiss?.();
      dismiss = undefined;
    }
  };
  const observer = new MutationObserver(scan);
  for (const doc of docs) {
    observer.observe(doc.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'aria-hidden', 'class', 'style', 'id', 'src'],
    });
  }
  // CSS 动画可能延迟弹窗真正可见的时间。
  const timer = window.setInterval(scan, 400);
  return () => {
    observer.disconnect();
    window.clearInterval(timer);
    dismiss?.();
  };
}
