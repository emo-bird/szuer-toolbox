/** 提取试卷中的可读内容。只处理字符串，不加载或执行页面资源。 */
export interface ExamImage {
  readonly dataUrl: string;
  readonly alt: string;
  readonly scope: string;
}

interface RichInput {
  readonly text: string;
  readonly images: readonly ExamImage[];
  readonly issue?: string;
}

const ENTITIES: Readonly<Record<string, string>> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  times: '×', divide: '÷', minus: '−', plusmn: '±', le: '≤', ge: '≥',
  ne: '≠', asymp: '≈', infin: '∞', sum: '∑', int: '∫', radic: '√',
  pi: 'π', alpha: 'α', beta: 'β', gamma: 'γ', Delta: 'Δ', theta: 'θ',
  middot: '·', deg: '°', micro: 'µ', bull: '•', hellip: '…',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return Object.hasOwn(ENTITIES, entity) ? ENTITIES[entity]! : match;
    const point = /^#x/i.test(entity) ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point)
      : match;
  });
}

function safeText(text: string): string {
  return decodeEntities(text)
    .replace(/(?:https?:\/\/|data:)[^\s<>"']+/gi, '[链接]')
    .replace(/\u00a0/g, ' ');
}

function attribute(tag: string, name: 'src' | 'alt'): string {
  const match = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
}

const IMAGE_DATA = /^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;
const IMAGE_PREFIX: Readonly<Record<string, string>> = {
  png: 'iVBORw0KGgo', jpeg: '/9j/', gif: 'R0lGOD', webp: 'UklGR',
};

function inlineImage(src: string): string | null {
  if (src.length > 262144) return null;
  const match = IMAGE_DATA.exec(src);
  const type = match?.[1]?.toLowerCase();
  const data = match?.[2];
  if (type === undefined || data === undefined || data.length % 4 !== 0) return null;
  if (!data.startsWith(IMAGE_PREFIX[type]!)) return null;
  if (type === 'webp' && atob(data.slice(0, 16)).slice(8) !== 'WEBP') return null;
  return 'data:image/' + type + ';base64,' + data;
}

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'base']);
const BLOCK_TAGS = new Set(['p', 'div', 'section', 'blockquote', 'pre', 'tr', 'table', 'ul', 'ol']);
const UNSUPPORTED_TAGS = new Set(['iframe', 'embed', 'object', 'canvas', 'svg', 'video', 'audio']);
const INLINE_TAGS = new Set([
  'a', 'b', 'i', 'u', 's', 'em', 'strong', 'font', 'small', 'span', 'code', 'kbd', 'samp', 'mark',
  'del', 'ins', 'sup', 'sub', 'li', 'td', 'th', 'tbody', 'thead', 'tfoot', 'caption', 'center',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'math', 'mi', 'mn', 'mo', 'mtext', 'mrow', 'mfrac',
  'msup', 'msub', 'msubsup', 'msqrt', 'mroot', 'mfenced', 'mtable', 'mtr', 'mtd', 'semantics',
  'mstyle', 'munder', 'mover', 'munderover', 'menclose', 'mspace',
]);

interface ElementText {
  readonly name: string;
  readonly children: string[];
}

function renderElement({ name, children }: ElementText): string {
  const text = children.join('');
  const [a = '', b = '', c = ''] = children.filter((part) => part.trim() !== '');
  switch (name) {
    case 'sup': return '^(' + text + ')';
    case 'sub': return '_(' + text + ')';
    case 'msup': return a + '^(' + b + ')';
    case 'msub': return a + '_(' + b + ')';
    case 'msubsup': return a + '_(' + b + ')^(' + c + ')';
    case 'mfrac': return '(' + a + ')/(' + b + ')';
    case 'msqrt': return '√(' + text + ')';
    case 'mroot': return 'root(' + a + ', ' + b + ')';
    case 'mfenced': return '(' + children.join(', ') + ')';
    case 'td': case 'th': case 'mtd': return text.trim() + ' | ';
    case 'li': return '\n• ' + text + '\n';
    case 'tr': case 'mtr': return '\n' + text.trim().replace(/\s*\|$/, '') + '\n';
    case 'math': return ' ' + text + ' ';
    default: return BLOCK_TAGS.has(name) ? '\n' + text + '\n' : text;
  }
}

/** 保留段落、表格列和常见公式；外链与不可读内容只留下占位及状态。 */
export function readRichInput(source: string, scope: string): RichInput {
  if (source.length > 600000) return { text: '', images: [], issue: '题目内容超出处理上限' };
  const images: ExamImage[] = [];
  let issue: string | undefined;
  const stack: ElementText[] = [{ name: '', children: [] }];
  const emit = (value: string): void => {
    if (value !== '') stack.at(-1)!.children.push(value);
  };
  const pop = (): void => emit(renderElement(stack.pop()!));

  // 先丢弃不可见代码和重复的 MathML 机器注解，公式仍从呈现节点读取。
  const html = source
    .replace(/<!--[\s\S]*?(?:-->|$)/g, '')
    .replace(/<script\b[^>]*\btype\s*=\s*["']math\/tex(?:[^"']*)["'][^>]*>([\s\S]*?)<\/script\s*>/gi,
      (_, formula: string) => ' ' + formula.replaceAll('<', '&lt;') + ' ')
    .replace(/<(script|style|annotation(?:-xml)?)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, '');
  const tokens = /<\/?([a-z][a-z0-9:-]*)(?=[\s/>])(?:"[^"]*"|'[^']*'|[^"'>])*>/gi;
  let cursor = 0;
  for (const match of html.matchAll(tokens)) {
    emit(safeText(html.slice(cursor, match.index)));
    cursor = match.index + match[0].length;
    const tag = match[0];
    const name = match[1]!.toLowerCase();
    if (!VOID_TAGS.has(name) && !BLOCK_TAGS.has(name) && !UNSUPPORTED_TAGS.has(name) && !INLINE_TAGS.has(name)) {
      // 诸如 x<y >z 的比较表达式看起来像标签，但不是已知 HTML 或 MathML。
      if (/^<\/?[a-z][a-z0-9:-]*\s*>$/i.test(tag)) emit(safeText(tag));
      continue;
    }
    if (tag.startsWith('</')) {
      const index = stack.findLastIndex((item) => item.name === name);
      if (index > 0) while (stack.length > index) pop();
      continue;
    }
    if (name === 'img') {
      const alt = safeText(attribute(tag, 'alt')).trim().slice(0, 300);
      const dataUrl = inlineImage(attribute(tag, 'src'));
      if (dataUrl === null || images.length >= 4) issue ??= '题目含有无法安全读取的图片';
      else images.push({ dataUrl, alt, scope });
      emit(alt === '' ? ' [图片] ' : ' [图片：' + alt + '] ');
      continue;
    }
    if (UNSUPPORTED_TAGS.has(name)) issue ??= '题目含有暂不支持的图形或媒体内容';
    if (name === 'br' || name === 'hr') emit('\n');
    if (!VOID_TAGS.has(name) && !tag.endsWith('/>')) {
      if (stack.length >= 100) return { text: '', images: [], issue: '题目结构超出处理上限' };
      stack.push({ name, children: [] });
    }
  }
  emit(safeText(html.slice(cursor)));
  while (stack.length > 1) pop();
  const text = stack[0]!.children.join('').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return issue === undefined ? { text, images } : { text, images, issue };
}
