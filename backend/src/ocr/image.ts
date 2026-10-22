import sharp from 'sharp';

export interface GreyImage {
  data: Buffer;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Ширина, к которой приводим скан: 210 мм при ~205 dpi. Клетка 8 мм → 65 px. */
export const WORK_WIDTH = 1700;

export async function loadGrey(file: string, rotateDeg = 0): Promise<GreyImage> {
  const pipeline = sharp(file, { failOn: 'none' })
    // rotate() без аргументов доворачивает снимок по EXIF: телефоны почти
    // всегда пишут ориентацию в метаданные, а не в сами пиксели.
    .rotate()
    .greyscale()
    .resize({ width: WORK_WIDTH, fit: 'inside', withoutEnlargement: false });

  const prepared = rotateDeg ? pipeline.rotate(rotateDeg, { background: '#ffffff' }) : pipeline;
  const { data, info } = await prepared.normalise().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Порог Оцу: бумага и карандаш дают два ярких пика, разделять их лучше по гистограмме. */
export function otsuThreshold(image: GreyImage): number {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < image.data.length; i += 1) {
    histogram[image.data[i]] += 1;
  }
  const total = image.data.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) {
    sum += i * histogram[i];
  }

  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let bestVariance = -1;
  for (let t = 0; t < 256; t += 1) {
    weightB += histogram[t];
    if (weightB === 0) {
      continue;
    }
    const weightF = total - weightB;
    if (weightF === 0) {
      break;
    }
    sumB += t * histogram[t];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const variance = weightB * weightF * (meanB - meanF) * (meanB - meanF);
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  // Немного смещаем порог к тёмному: бледный карандаш иначе теряется.
  return Math.min(200, Math.max(90, best + 10));
}

interface Component {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  area: number;
}

/**
 * Ищет реперный квадрат в углу листа. Обходим только четверть изображения,
 * поэтому заливка по связным тёмным пикселям остаётся дешёвой.
 */
function findMarkerIn(
  image: GreyImage,
  threshold: number,
  region: { x0: number; y0: number; x1: number; y1: number },
  corner: Point,
  expected: number,
): Point | null {
  const { data, width } = image;
  const w = region.x1 - region.x0;
  const h = region.y1 - region.y0;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  let best: { point: Point; distance: number } | null = null;

  const minArea = expected * expected * 0.3;
  const maxArea = expected * expected * 3.2;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const local = y * w + x;
      if (seen[local]) {
        continue;
      }
      if (data[(y + region.y0) * width + (x + region.x0)] > threshold) {
        seen[local] = 1;
        continue;
      }

      const box: Component = { minX: x, maxX: x, minY: y, maxY: y, area: 0 };
      stack.push(local);
      seen[local] = 1;
      while (stack.length) {
        const current = stack.pop() as number;
        const cx = current % w;
        const cy = (current - cx) / w;
        box.area += 1;
        if (cx < box.minX) box.minX = cx;
        if (cx > box.maxX) box.maxX = cx;
        if (cy < box.minY) box.minY = cy;
        if (cy > box.maxY) box.maxY = cy;

        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
            continue;
          }
          const next = ny * w + nx;
          if (seen[next]) {
            continue;
          }
          seen[next] = 1;
          if (data[(ny + region.y0) * width + (nx + region.x0)] <= threshold) {
            stack.push(next);
          }
        }
      }

      const boxW = box.maxX - box.minX + 1;
      const boxH = box.maxY - box.minY + 1;
      const ratio = boxW / boxH;
      const fill = box.area / (boxW * boxH);
      if (
        box.area < minArea ||
        box.area > maxArea ||
        ratio < 0.6 ||
        ratio > 1.7 ||
        fill < 0.55 ||
        boxW > expected * 2.2 ||
        boxH > expected * 2.2
      ) {
        continue;
      }

      const point: Point = {
        x: region.x0 + (box.minX + box.maxX) / 2,
        y: region.y0 + (box.minY + box.maxY) / 2,
      };
      const distance = Math.hypot(point.x - corner.x, point.y - corner.y);
      if (!best || distance < best.distance) {
        best = { point, distance };
      }
    }
  }

  return best?.point ?? null;
}

export interface Markers {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  /** Отклонение листа от горизонтали, градусы. */
  skewDeg: number;
}

/** Три угловых репера задают сетку листа: масштаб, сдвиг и поворот. */
export function findMarkers(image: GreyImage, threshold: number): Markers | null {
  // Ожидаемая сторона репера: 8 мм от ширины листа в пикселях.
  const expected = (image.width / 210) * 8;
  const zoneW = Math.round(image.width * 0.28);
  const zoneH = Math.round(image.height * 0.22);

  const topLeft = findMarkerIn(
    image,
    threshold,
    { x0: 0, y0: 0, x1: zoneW, y1: zoneH },
    { x: 0, y: 0 },
    expected,
  );
  const topRight = findMarkerIn(
    image,
    threshold,
    { x0: image.width - zoneW, y0: 0, x1: image.width, y1: zoneH },
    { x: image.width, y: 0 },
    expected,
  );
  const bottomLeft = findMarkerIn(
    image,
    threshold,
    { x0: 0, y0: image.height - zoneH, x1: zoneW, y1: image.height },
    { x: 0, y: image.height },
    expected,
  );

  if (!topLeft || !topRight || !bottomLeft) {
    return null;
  }

  const skewDeg = (Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x) * 180) / Math.PI;
  return { topLeft, topRight, bottomLeft, skewDeg };
}

/**
 * Перевод миллиметров бланка в пиксели скана по найденным реперам:
 * два базисных вектора берут на себя и масштаб, и наклон, и смещение.
 */
export function createMapper(markers: Markers, marker: { inset: number; size: number }, pageWidth: number, pageHeight: number) {
  const originMm = { x: marker.inset + marker.size / 2, y: marker.inset + marker.size / 2 };
  const spanX = pageWidth - 2 * originMm.x;
  const spanY = pageHeight - 2 * originMm.y;

  const ex = {
    x: (markers.topRight.x - markers.topLeft.x) / spanX,
    y: (markers.topRight.y - markers.topLeft.y) / spanX,
  };
  const ey = {
    x: (markers.bottomLeft.x - markers.topLeft.x) / spanY,
    y: (markers.bottomLeft.y - markers.topLeft.y) / spanY,
  };

  return (mmX: number, mmY: number): Point => ({
    x: markers.topLeft.x + ex.x * (mmX - originMm.x) + ey.x * (mmY - originMm.y),
    y: markers.topLeft.y + ex.y * (mmX - originMm.x) + ey.y * (mmY - originMm.y),
  });
}

/** Доля тёмных пикселей внутри клетки — по ней отличаем пустую клетку от заполненной. */
export function inkRatio(
  image: GreyImage,
  threshold: number,
  box: { x: number; y: number; width: number; height: number },
): number {
  const x0 = Math.max(0, Math.round(box.x));
  const y0 = Math.max(0, Math.round(box.y));
  const x1 = Math.min(image.width, Math.round(box.x + box.width));
  const y1 = Math.min(image.height, Math.round(box.y + box.height));
  if (x1 <= x0 || y1 <= y0) {
    return 0;
  }
  let dark = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      total += 1;
      if (image.data[y * image.width + x] <= threshold) {
        dark += 1;
      }
    }
  }
  return total ? dark / total : 0;
}
