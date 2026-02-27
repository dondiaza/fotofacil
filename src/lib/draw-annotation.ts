export type DrawPoint = {
  x: number;
  y: number;
};

const DRAW_PREFIX = "[[DRAW_V1:";
const DRAW_SUFFIX = "]]";
const MIN_POINTS = 2;
const MAX_POINTS = 180;

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

function compactPoints(points: DrawPoint[]) {
  const normalized = points
    .map((point) => ({
      x: round4(clamp01(point.x)),
      y: round4(clamp01(point.y))
    }))
    .filter((point, index, array) => {
      if (index === 0) return true;
      const prev = array[index - 1];
      const dx = point.x - prev.x;
      const dy = point.y - prev.y;
      return dx * dx + dy * dy > 0.00001;
    });

  if (normalized.length <= MAX_POINTS) {
    return normalized;
  }

  const result: DrawPoint[] = [];
  const step = normalized.length / MAX_POINTS;
  for (let i = 0; i < MAX_POINTS; i++) {
    const index = Math.min(normalized.length - 1, Math.floor(i * step));
    result.push(normalized[index]);
  }
  return result;
}

function encodePayload(points: DrawPoint[]) {
  const tuples = points.map((point) => [point.x, point.y]);
  return encodeURIComponent(JSON.stringify(tuples));
}

function decodePayload(value: string) {
  try {
    const raw = decodeURIComponent(value);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const points = parsed
      .map((entry) => {
        if (!Array.isArray(entry) || entry.length < 2) return null;
        return {
          x: clamp01(Number(entry[0])),
          y: clamp01(Number(entry[1]))
        };
      })
      .filter((entry): entry is DrawPoint => Boolean(entry));
    return compactPoints(points);
  } catch {
    return [];
  }
}

export function splitDrawAnnotation(text: string) {
  const raw = String(text || "");
  if (!raw.startsWith(DRAW_PREFIX)) {
    return {
      cleanText: raw,
      points: [] as DrawPoint[]
    };
  }

  const end = raw.indexOf(DRAW_SUFFIX);
  if (end === -1) {
    return {
      cleanText: raw,
      points: [] as DrawPoint[]
    };
  }

  const payload = raw.slice(DRAW_PREFIX.length, end);
  const points = decodePayload(payload);
  const cleanText = raw.slice(end + DRAW_SUFFIX.length).replace(/^\s+/, "");

  return {
    cleanText,
    points
  };
}

export function injectDrawAnnotation(text: string, points: DrawPoint[]) {
  const cleanText = String(text || "").trim();
  const compacted = compactPoints(points);
  if (compacted.length < MIN_POINTS) {
    return cleanText;
  }

  const payload = encodePayload(compacted);
  return `${DRAW_PREFIX}${payload}${DRAW_SUFFIX}\n${cleanText}`;
}

export function drawBoundsFromPoints(points: DrawPoint[]) {
  const compacted = compactPoints(points);
  if (compacted.length < MIN_POINTS) {
    return null;
  }

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const point of compacted) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  return {
    zoneX: round4(minX),
    zoneY: round4(minY),
    zoneW: round4(Math.max(0.005, maxX - minX)),
    zoneH: round4(Math.max(0.005, maxY - minY))
  };
}

export function pointsToSvgPath(points: DrawPoint[]) {
  if (!points.length) {
    return "";
  }
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x * 100} ${point.y * 100}`)
    .join(" ");
}
