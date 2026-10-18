// Çoklu ekran düzenleri: ağaç olarak tanımlanır (satır = yan yana, sütun = alt alta) ve oranlarla yüzdeye çevrilir.
// Her bölünmüş düğümün oranları bağımsız ayarlanabilir (TradingView gibi). Saf fonksiyonlar; DOM'a bağlı değildir.

/** Düğüm: ekran numarası veya bölünmüş alan. row: çocuklar yan yana, col: alt alta. */
export type LNode = number | { dir: 'row' | 'col'; kids: LNode[] };

export interface LayoutDef {
  count: number;
  label: string;
  tree: LNode;
  /** Düğüm yoluna göre varsayılan oranlar (yoksa eşit) */
  ratios?: Record<string, number[]>;
}

const row = (...kids: LNode[]): LNode => ({ dir: 'row', kids });
const col = (...kids: LNode[]): LNode => ({ dir: 'col', kids });

/** rows x cols ızgara; ekranlar soldan sağa, yukarıdan aşağı numaralanır. */
function grid(rows: number, cols: number): LNode {
  let n = 0;
  return col(...Array.from({ length: rows }, () => row(...Array.from({ length: cols }, () => n++))));
}

const R = 'r';
const def = (count: number, label: string, tree: LNode, ratios?: Record<string, number[]>): LayoutDef => ({ count, label, tree, ratios });

export const LAYOUTS = {
  '1': def(1, 'Tek ekran', 0),
  '2v': def(2, '2 ekran (yan yana)', row(0, 1)),
  '2h': def(2, '2 ekran (alt alta)', col(0, 1)),
  '3': def(3, '3 ekran (solda büyük)', row(0, col(1, 2)), { [R]: [2 / 3, 1 / 3] }),
  '3r': def(3, '3 ekran (sağda büyük)', row(col(0, 1), 2), { [R]: [1 / 3, 2 / 3] }),
  '3t': def(3, '3 ekran (üstte büyük)', col(0, row(1, 2)), { [R]: [2 / 3, 1 / 3] }),
  '3b': def(3, '3 ekran (altta büyük)', col(row(0, 1), 2), { [R]: [1 / 3, 2 / 3] }),
  '3v': def(3, '3 ekran (yan yana)', row(0, 1, 2)),
  '3h': def(3, '3 ekran (alt alta)', col(0, 1, 2)),
  '4': def(4, '4 ekran (2x2)', grid(2, 2)),
  '4v': def(4, '4 ekran (yan yana)', row(0, 1, 2, 3)),
  '4h': def(4, '4 ekran (alt alta)', col(0, 1, 2, 3)),
  '4L': def(4, '4 ekran (solda büyük)', row(0, col(1, 2, 3)), { [R]: [0.6, 0.4] }),
  '4T': def(4, '4 ekran (üstte büyük)', col(0, row(1, 2, 3)), { [R]: [0.6, 0.4] }),
  '5': def(5, '5 ekran', col(row(0, 1), row(2, 3, 4))),
  '6': def(6, '6 ekran (2x3)', grid(2, 3)),
  '6c': def(6, '6 ekran (3x2)', grid(3, 2)),
  '8': def(8, '8 ekran (2x4)', grid(2, 4)),
  '8c': def(8, '8 ekran (4x2)', grid(4, 2)),
  '9': def(9, '9 ekran (3x3)', grid(3, 3)),
  '12': def(12, '12 ekran (3x4)', grid(3, 4)),
  '16': def(16, '16 ekran (4x4)', grid(4, 4)),
} satisfies Record<string, LayoutDef>;

export type LayoutId = keyof typeof LAYOUTS;
export const LAYOUT_IDS = Object.keys(LAYOUTS) as LayoutId[];
export const isLayoutId = (v: unknown): v is LayoutId => typeof v === 'string' && v in LAYOUTS;

/** Bir bölünmüş düğümün çocuk yolu: kök 'r', ilk çocuk 'r.0'. */
export const childPath = (path: string, i: number) => `${path}.${i}`;
export const ROOT_PATH = R;

/** Bir çocuğun en az payı (düğümün yüzdesi): çok küçük ekran açılmasın. */
export const MIN_SHARE = 0.08;

const equal = (n: number) => Array.from({ length: n }, () => 1 / n);

/** Düğümün oranları: kayıtlı (geçerliyse) > düzenin varsayılanı > eşit. Toplam 1'e normalize edilir. */
export function ratiosOf(layout: LayoutId, path: string, kids: number, splits?: Record<string, number[]>): number[] {
  const ok = (r?: number[]) => !!r && r.length === kids && r.every((v) => Number.isFinite(v) && v > 0);
  const r = ok(splits?.[path]) ? splits![path] : ok(LAYOUTS[layout].ratios?.[path]) ? LAYOUTS[layout].ratios![path] : equal(kids);
  const sum = r.reduce((a, b) => a + b, 0);
  return r.map((v) => v / sum);
}

export interface PaneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SplitterGeom {
  /** Bölünen düğümün yolu ve çocuk indeksi (bu çocuk ile bir sonraki arasındaki sınır) */
  path: string;
  index: number;
  dir: 'row' | 'col';
  /** Sınırın tüm alandaki konumu (ana eksende, 0-1) */
  at: number;
  /** Sınırın çapraz eksendeki uzanımı (0-1) */
  from: number;
  to: number;
  /** Düğümün ana eksendeki başlangıcı ve uzunluğu (tüm alana göre) */
  nodeStart: number;
  nodeLen: number;
  ratios: number[];
}

/** Düzenin ekran dikdörtgenlerini (0-1) ve sürüklenebilir bölücülerini hesaplar. */
export function layoutGeometry(layout: LayoutId, splits?: Record<string, number[]>): { panes: PaneRect[]; splitters: SplitterGeom[] } {
  const d = LAYOUTS[layout];
  const panes: PaneRect[] = Array.from({ length: d.count }, () => ({ x: 0, y: 0, w: 1, h: 1 }));
  const splitters: SplitterGeom[] = [];
  const walk = (node: LNode, rect: PaneRect, path: string) => {
    if (typeof node === 'number') {
      panes[node] = rect;
      return;
    }
    const ratios = ratiosOf(layout, path, node.kids.length, splits);
    const isRow = node.dir === 'row';
    let acc = isRow ? rect.x : rect.y;
    node.kids.forEach((kid, i) => {
      const len = ratios[i] * (isRow ? rect.w : rect.h);
      walk(kid, isRow ? { x: acc, y: rect.y, w: len, h: rect.h } : { x: rect.x, y: acc, w: rect.w, h: len }, childPath(path, i));
      acc += len;
      if (i < node.kids.length - 1) {
        splitters.push({
          path,
          index: i,
          dir: node.dir,
          at: acc,
          from: isRow ? rect.y : rect.x,
          to: isRow ? rect.y + rect.h : rect.x + rect.w,
          nodeStart: isRow ? rect.x : rect.y,
          nodeLen: isRow ? rect.w : rect.h,
          ratios,
        });
      }
    });
  };
  walk(d.tree, { x: 0, y: 0, w: 1, h: 1 }, ROOT_PATH);
  return { panes, splitters };
}

/**
 * Bölücüyü sürükler: index ve index+1 numaralı çocukların toplam payı sabit kalır, aralarındaki sınır
 * `local` (düğümün 0-1 aralığındaki konum) olur; iki çocuk da en az MIN_SHARE kadar kalır.
 */
export function dragSplit(ratios: number[], index: number, local: number): number[] {
  const before = ratios.slice(0, index).reduce((a, b) => a + b, 0);
  const pair = ratios[index] + ratios[index + 1];
  const min = Math.min(MIN_SHARE, pair / 2);
  const first = Math.min(pair - min, Math.max(min, local - before));
  const out = ratios.slice();
  out[index] = first;
  out[index + 1] = pair - first;
  return out;
}
