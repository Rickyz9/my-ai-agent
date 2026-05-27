import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import WebSocket from "ws";

export type WorkflowJson = Record<string, unknown>;

export type WorkflowPlaceholders = Record<string, string | number | boolean | null | undefined>;
export type HumanPosePresetId =
  | "auto"
  | "standing-editorial"
  | "walking-fashion"
  | "running-action"
  | "seated-portrait"
  | "upper-body-portrait";
export type ResolvedHumanPosePresetId = Exclude<HumanPosePresetId, "auto">;
export type LocalizedRepairMaskArea = "face" | "hands" | "feet" | "text" | "garment";

export type ComfyClientOptions = {
  baseUrl: string;
  clientId?: string;
};

export type ComfyProgressEvent = {
  value: number;
  max: number;
  node?: string | undefined;
  percent: number;
  text: string;
};

export type ComfyOutputAsset = {
  filename: string;
  subfolder?: string | undefined;
  type?: string | undefined;
  nodeId: string;
  mimeType: string;
};

export type ComfyPromptHistory = {
  outputs?: Record<string, Record<string, unknown>>;
  status?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
};

type PosePoint = { x: number; y: number };
type PoseKey =
  | "nose"
  | "neck"
  | "midHip"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "leftWrist"
  | "rightWrist"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftAnkle"
  | "rightAnkle";

const poseBones: Array<[PoseKey, PoseKey, [number, number, number]]> = [
  ["nose", "neck", [255, 64, 64]],
  ["neck", "leftShoulder", [255, 128, 0]],
  ["leftShoulder", "leftElbow", [255, 200, 0]],
  ["leftElbow", "leftWrist", [200, 255, 0]],
  ["neck", "rightShoulder", [0, 220, 120]],
  ["rightShoulder", "rightElbow", [0, 220, 220]],
  ["rightElbow", "rightWrist", [0, 128, 255]],
  ["neck", "midHip", [90, 120, 255]],
  ["midHip", "leftHip", [160, 90, 255]],
  ["leftHip", "leftKnee", [220, 80, 255]],
  ["leftKnee", "leftAnkle", [255, 80, 180]],
  ["midHip", "rightHip", [255, 80, 120]],
  ["rightHip", "rightKnee", [255, 150, 80]],
  ["rightKnee", "rightAnkle", [255, 220, 80]]
];

const posePresets: Record<ResolvedHumanPosePresetId, Partial<Record<PoseKey, PosePoint>>> = {
  "standing-editorial": {
    nose: { x: 0.5, y: 0.17 },
    neck: { x: 0.5, y: 0.25 },
    midHip: { x: 0.5, y: 0.54 },
    leftShoulder: { x: 0.42, y: 0.27 },
    rightShoulder: { x: 0.58, y: 0.27 },
    leftElbow: { x: 0.38, y: 0.42 },
    rightElbow: { x: 0.62, y: 0.42 },
    leftWrist: { x: 0.39, y: 0.57 },
    rightWrist: { x: 0.61, y: 0.57 },
    leftHip: { x: 0.44, y: 0.55 },
    rightHip: { x: 0.56, y: 0.55 },
    leftKnee: { x: 0.43, y: 0.75 },
    rightKnee: { x: 0.57, y: 0.75 },
    leftAnkle: { x: 0.42, y: 0.94 },
    rightAnkle: { x: 0.58, y: 0.94 }
  },
  "walking-fashion": {
    nose: { x: 0.52, y: 0.16 },
    neck: { x: 0.51, y: 0.25 },
    midHip: { x: 0.5, y: 0.54 },
    leftShoulder: { x: 0.43, y: 0.27 },
    rightShoulder: { x: 0.59, y: 0.26 },
    leftElbow: { x: 0.39, y: 0.42 },
    rightElbow: { x: 0.64, y: 0.38 },
    leftWrist: { x: 0.45, y: 0.55 },
    rightWrist: { x: 0.6, y: 0.52 },
    leftHip: { x: 0.44, y: 0.55 },
    rightHip: { x: 0.56, y: 0.54 },
    leftKnee: { x: 0.48, y: 0.75 },
    rightKnee: { x: 0.61, y: 0.72 },
    leftAnkle: { x: 0.57, y: 0.94 },
    rightAnkle: { x: 0.5, y: 0.93 }
  },
  "running-action": {
    nose: { x: 0.52, y: 0.2 },
    neck: { x: 0.49, y: 0.29 },
    midHip: { x: 0.47, y: 0.53 },
    leftShoulder: { x: 0.42, y: 0.31 },
    rightShoulder: { x: 0.57, y: 0.27 },
    leftElbow: { x: 0.33, y: 0.39 },
    rightElbow: { x: 0.68, y: 0.34 },
    leftWrist: { x: 0.43, y: 0.48 },
    rightWrist: { x: 0.75, y: 0.25 },
    leftHip: { x: 0.42, y: 0.54 },
    rightHip: { x: 0.53, y: 0.52 },
    leftKnee: { x: 0.33, y: 0.68 },
    rightKnee: { x: 0.68, y: 0.67 },
    leftAnkle: { x: 0.2, y: 0.72 },
    rightAnkle: { x: 0.82, y: 0.82 }
  },
  "seated-portrait": {
    nose: { x: 0.5, y: 0.19 },
    neck: { x: 0.5, y: 0.28 },
    midHip: { x: 0.5, y: 0.6 },
    leftShoulder: { x: 0.41, y: 0.3 },
    rightShoulder: { x: 0.59, y: 0.3 },
    leftElbow: { x: 0.36, y: 0.45 },
    rightElbow: { x: 0.64, y: 0.45 },
    leftWrist: { x: 0.42, y: 0.61 },
    rightWrist: { x: 0.58, y: 0.61 },
    leftHip: { x: 0.42, y: 0.61 },
    rightHip: { x: 0.58, y: 0.61 },
    leftKnee: { x: 0.32, y: 0.73 },
    rightKnee: { x: 0.68, y: 0.73 },
    leftAnkle: { x: 0.37, y: 0.9 },
    rightAnkle: { x: 0.63, y: 0.9 }
  },
  "upper-body-portrait": {
    nose: { x: 0.5, y: 0.23 },
    neck: { x: 0.5, y: 0.35 },
    midHip: { x: 0.5, y: 0.8 },
    leftShoulder: { x: 0.35, y: 0.38 },
    rightShoulder: { x: 0.65, y: 0.38 },
    leftElbow: { x: 0.29, y: 0.62 },
    rightElbow: { x: 0.71, y: 0.62 },
    leftWrist: { x: 0.36, y: 0.78 },
    rightWrist: { x: 0.64, y: 0.78 },
    leftHip: { x: 0.42, y: 0.82 },
    rightHip: { x: 0.58, y: 0.82 }
  }
};

function inferMimeType(filename: string) {
  const normalized = filename.toLowerCase();
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "video/mp4";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".webm")) return "video/webm";
  if (normalized.endsWith(".glb")) return "model/gltf-binary";
  if (normalized.endsWith(".gltf")) return "model/gltf+json";
  return "application/octet-stream";
}

export function resolveHumanPosePresetId(input: {
  requestedPresetId?: HumanPosePresetId;
  renderCategoryId?: string | null;
  humanStructureMode?: string | null;
  prompt?: string;
}): ResolvedHumanPosePresetId {
  if (input.requestedPresetId && input.requestedPresetId !== "auto") {
    return input.requestedPresetId;
  }

  const prompt = input.prompt ?? "";
  if (
    input.humanStructureMode === "action" ||
    input.renderCategoryId === "cinematic-action" ||
    /\b(action|running|run|jumping|jump|fight|stunt|battle|combat|chase|azione|corre|salta|lotta|combattimento)\b/i.test(
      prompt
    )
  ) {
    return "running-action";
  }

  if (/\b(seated|sitting|chair|sofa|seduta|seduto|sedia|divano)\b/i.test(prompt)) {
    return "seated-portrait";
  }

  if (/\b(upper-body|upper body|half-body|half body|bust|medium close-up|mezzo busto)\b/i.test(prompt)) {
    return "upper-body-portrait";
  }

  if (
    input.renderCategoryId === "fashion-editorial" ||
    /\b(walking|walk|runway|catwalk|fashion|heels?|shoes?|cammina|passerella|moda|tacchi|scarpe)\b/i.test(prompt)
  ) {
    return "walking-fashion";
  }

  return "standing-editorial";
}

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePosePixel(buffer: Uint8Array, width: number, height: number, x: number, y: number, color: [number, number, number]) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }
  const offset = (y * width + x) * 4;
  buffer[offset] = color[0];
  buffer[offset + 1] = color[1];
  buffer[offset + 2] = color[2];
  buffer[offset + 3] = 255;
}

function drawPoseCircle(
  buffer: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  color: [number, number, number]
) {
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      if (x * x + y * y <= radius * radius) {
        writePosePixel(buffer, width, height, cx + x, cy + y, color);
      }
    }
  }
}

function drawPoseLine(
  buffer: Uint8Array,
  width: number,
  height: number,
  from: PosePoint,
  to: PosePoint,
  thickness: number,
  color: [number, number, number]
) {
  const x1 = Math.round(from.x * width);
  const y1 = Math.round(from.y * height);
  const x2 = Math.round(to.x * width);
  const y2 = Math.round(to.y * height);
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);

  for (let step = 0; step <= steps; step += 1) {
    const x = Math.round(x1 + ((x2 - x1) * step) / steps);
    const y = Math.round(y1 + ((y2 - y1) * step) / steps);
    drawPoseCircle(buffer, width, height, x, y, thickness, color);
  }
}

export function buildHumanPoseControlImage(presetId: ResolvedHumanPosePresetId, width: number, height: number) {
  const safeWidth = Math.max(256, Math.min(2048, Math.round(width)));
  const safeHeight = Math.max(256, Math.min(2048, Math.round(height)));
  const pose = posePresets[presetId];
  const pixels = new Uint8Array(safeWidth * safeHeight * 4);
  const lineThickness = Math.max(3, Math.round(Math.min(safeWidth, safeHeight) / 170));
  const jointRadius = Math.max(5, Math.round(Math.min(safeWidth, safeHeight) / 85));

  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index + 3] = 255;
  }

  for (const [fromKey, toKey, color] of poseBones) {
    const from = pose[fromKey];
    const to = pose[toKey];
    if (from && to) {
      drawPoseLine(pixels, safeWidth, safeHeight, from, to, lineThickness, color);
    }
  }

  for (const point of Object.values(pose)) {
    if (point) {
      drawPoseCircle(
        pixels,
        safeWidth,
        safeHeight,
        Math.round(point.x * safeWidth),
        Math.round(point.y * safeHeight),
        jointRadius,
        [255, 255, 255]
      );
    }
  }

  const raw = Buffer.alloc((safeWidth * 4 + 1) * safeHeight);
  for (let y = 0; y < safeHeight; y += 1) {
    const rowOffset = y * (safeWidth * 4 + 1);
    raw[rowOffset] = 0;
    Buffer.from(pixels.buffer, y * safeWidth * 4, safeWidth * 4).copy(raw, rowOffset + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(safeWidth, 0);
  ihdr.writeUInt32BE(safeHeight, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function encodeRgbaPng(pixels: Uint8Array, width: number, height: number) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    raw[rowOffset] = 0;
    Buffer.from(pixels.buffer, y * width * 4, width * 4).copy(raw, rowOffset + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

export function getLocalizedRepairMaskArea(repairId: string): LocalizedRepairMaskArea | null {
  if (repairId === "face-detail" || repairId === "eye-mouth-detail") {
    return "face";
  }

  if (repairId === "hand-anatomy-fix") {
    return "hands";
  }

  if (repairId === "feet-anatomy-fix") {
    return "feet";
  }

  if (repairId === "label-text-safe") {
    return "text";
  }

  if (repairId === "garment-detail-fix") {
    return "garment";
  }

  return null;
}

function drawMaskEllipse(
  pixels: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number
) {
  const left = Math.max(0, Math.floor((centerX - radiusX) * width));
  const right = Math.min(width - 1, Math.ceil((centerX + radiusX) * width));
  const top = Math.max(0, Math.floor((centerY - radiusY) * height));
  const bottom = Math.min(height - 1, Math.ceil((centerY + radiusY) * height));

  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const normalizedX = (x / width - centerX) / Math.max(radiusX, 0.001);
      const normalizedY = (y / height - centerY) / Math.max(radiusY, 0.001);
      const distance = normalizedX * normalizedX + normalizedY * normalizedY;
      if (distance <= 1) {
        const value = distance > 0.78 ? 190 : 255;
        const offset = (y * width + x) * 4;
        pixels[offset] = Math.max(pixels[offset] ?? 0, value);
        pixels[offset + 1] = Math.max(pixels[offset + 1] ?? 0, value);
        pixels[offset + 2] = Math.max(pixels[offset + 2] ?? 0, value);
        pixels[offset + 3] = 255;
      }
    }
  }
}

function drawMaskRect(
  pixels: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  rectWidth: number,
  rectHeight: number
) {
  const startX = Math.max(0, Math.floor(left * width));
  const endX = Math.min(width - 1, Math.ceil((left + rectWidth) * width));
  const startY = Math.max(0, Math.floor(top * height));
  const endY = Math.min(height - 1, Math.ceil((top + rectHeight) * height));
  const featherX = Math.max(1, Math.round(width * 0.018));
  const featherY = Math.max(1, Math.round(height * 0.018));

  for (let y = startY; y <= endY; y += 1) {
    for (let x = startX; x <= endX; x += 1) {
      const edgeDistance = Math.min(x - startX, endX - x, y - startY, endY - y);
      const value = edgeDistance < Math.min(featherX, featherY) ? 190 : 255;
      const offset = (y * width + x) * 4;
      pixels[offset] = Math.max(pixels[offset] ?? 0, value);
      pixels[offset + 1] = Math.max(pixels[offset + 1] ?? 0, value);
      pixels[offset + 2] = Math.max(pixels[offset + 2] ?? 0, value);
      pixels[offset + 3] = 255;
    }
  }
}

function faceMaskShape(input: {
  repairId: string;
  renderCategoryId?: string | null;
  humanStructureMode?: string | null;
  prompt?: string;
}) {
  const prompt = input.prompt ?? "";
  const closeup =
    input.renderCategoryId === "beauty-closeup" ||
    input.renderCategoryId === "editorial-portrait" ||
    /\b(close-up|closeup|portrait|headshot|beauty|viso|ritratto|primo piano)\b/i.test(prompt);
  const fullBody =
    input.humanStructureMode === "full-body" ||
    input.humanStructureMode === "action" ||
    input.renderCategoryId === "fashion-editorial" ||
    input.renderCategoryId === "cinematic-action" ||
    /\b(full-body|full body|head to toe|runway|catwalk|standing|walking|figura intera)\b/i.test(prompt);
  const isEyeMouth = input.repairId === "eye-mouth-detail";

  if (fullBody && !closeup) {
    return isEyeMouth
      ? { centerX: 0.5, centerY: 0.17, radiusX: 0.075, radiusY: 0.07 }
      : { centerX: 0.5, centerY: 0.18, radiusX: 0.105, radiusY: 0.1 };
  }

  return isEyeMouth
    ? { centerX: 0.5, centerY: 0.34, radiusX: 0.2, radiusY: 0.16 }
    : { centerX: 0.5, centerY: 0.34, radiusX: 0.24, radiusY: 0.24 };
}

export function buildLocalizedInpaintMask(input: {
  repairId: string;
  width: number;
  height: number;
  renderCategoryId?: string | null;
  humanStructureMode?: string | null;
  humanPosePresetId?: HumanPosePresetId;
  prompt?: string;
}) {
  const area = getLocalizedRepairMaskArea(input.repairId);
  if (!area) {
    return null;
  }

  const safeWidth = Math.max(256, Math.min(2048, Math.round(input.width)));
  const safeHeight = Math.max(256, Math.min(2048, Math.round(input.height)));
  const pixels = new Uint8Array(safeWidth * safeHeight * 4);
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index + 3] = 255;
  }

  if (area === "face") {
    const shape = faceMaskShape(input);
    drawMaskEllipse(pixels, safeWidth, safeHeight, shape.centerX, shape.centerY, shape.radiusX, shape.radiusY);
  }

  if (area === "hands" || area === "feet") {
    const presetId = resolveHumanPosePresetId({
      renderCategoryId: input.renderCategoryId ?? null,
      humanStructureMode: input.humanStructureMode ?? null,
      ...(input.humanPosePresetId ? { requestedPresetId: input.humanPosePresetId } : {}),
      ...(input.prompt ? { prompt: input.prompt } : {})
    });
    const pose = posePresets[presetId];
    const keys: PoseKey[] = area === "hands" ? ["leftWrist", "rightWrist"] : ["leftAnkle", "rightAnkle"];
    for (const key of keys) {
      const point = pose[key];
      if (point) {
        drawMaskEllipse(
          pixels,
          safeWidth,
          safeHeight,
          point.x,
          point.y,
          area === "hands" ? 0.08 : 0.085,
          area === "hands" ? 0.075 : 0.065
        );
      }
    }
  }

  if (area === "text") {
    drawMaskRect(pixels, safeWidth, safeHeight, 0.28, 0.38, 0.44, 0.24);
  }

  if (area === "garment") {
    const presetId = resolveHumanPosePresetId({
      renderCategoryId: input.renderCategoryId ?? null,
      humanStructureMode: input.humanStructureMode ?? null,
      ...(input.humanPosePresetId ? { requestedPresetId: input.humanPosePresetId } : {}),
      ...(input.prompt ? { prompt: input.prompt } : {})
    });
    const pose = posePresets[presetId];
    const leftShoulder = pose.leftShoulder ?? { x: 0.42, y: 0.27 };
    const rightShoulder = pose.rightShoulder ?? { x: 0.58, y: 0.27 };
    const leftHip = pose.leftHip ?? { x: 0.44, y: 0.55 };
    const rightHip = pose.rightHip ?? { x: 0.56, y: 0.55 };
    const midHip = pose.midHip ?? { x: 0.5, y: 0.54 };
    const shoulderLeft = Math.min(leftShoulder.x, rightShoulder.x) - 0.06;
    const shoulderRight = Math.max(leftShoulder.x, rightShoulder.x) + 0.06;
    const torsoTop = Math.min(leftShoulder.y, rightShoulder.y) - 0.02;
    const torsoBottom = midHip.y + 0.08;
    const hipLeft = Math.min(leftHip.x, rightHip.x) - 0.08;
    const hipRight = Math.max(leftHip.x, rightHip.x) + 0.08;

    drawMaskRect(
      pixels,
      safeWidth,
      safeHeight,
      shoulderLeft,
      torsoTop,
      shoulderRight - shoulderLeft,
      torsoBottom - torsoTop
    );
    drawMaskRect(
      pixels,
      safeWidth,
      safeHeight,
      hipLeft,
      midHip.y - 0.02,
      hipRight - hipLeft,
      0.34
    );
  }

  return {
    area,
    buffer: encodeRgbaPng(pixels, safeWidth, safeHeight)
  };
}

function replaceString(template: string, values: WorkflowPlaceholders): string | number | boolean {
  const exactMatch = template.match(/^\{\{(.*?)\}\}$/);
  if (exactMatch) {
    const value = values[exactMatch[1]!.trim()];
    return (value ?? "") as string | number | boolean;
  }

  return template.replace(/\{\{(.*?)\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const value = values[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

export function replacePlaceholders<T>(input: T, values: WorkflowPlaceholders): T {
  if (typeof input === "string") {
    return replaceString(input, values) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => replacePlaceholders(item, values)) as T;
  }

  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [
        key,
        replacePlaceholders(value, values)
      ])
    ) as T;
  }

  return input;
}

function wsUrl(baseUrl: string, clientId: string) {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.searchParams.set("clientId", clientId);
  return url.toString();
}

export async function submitWorkflow(
  options: ComfyClientOptions,
  workflowJson: WorkflowJson
): Promise<{ promptId: string; clientId: string }> {
  const clientId = options.clientId ?? randomUUID();
  const response = await fetch(`${options.baseUrl}/prompt`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      prompt: workflowJson,
      client_id: clientId
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ComfyUI submit failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as { prompt_id?: string };
  if (!payload.prompt_id) {
    throw new Error("ComfyUI did not return prompt_id");
  }

  return {
    promptId: payload.prompt_id,
    clientId
  };
}

export async function waitForCompletion(
  options: ComfyClientOptions,
  promptId: string,
  onProgress?: (event: ComfyProgressEvent) => void,
  timeoutMs = 15 * 60 * 1000
): Promise<void> {
  const clientId = options.clientId ?? randomUUID();
  const websocket = new WebSocket(wsUrl(options.baseUrl, clientId));

  const completed = await new Promise<boolean>((resolve, reject) => {
    const timeout = setTimeout(() => {
      websocket.close();
      reject(new Error(`ComfyUI wait timeout for prompt ${promptId}`));
    }, timeoutMs);

    websocket.on("message", (raw) => {
      try {
        const message = JSON.parse(String(raw)) as {
          type?: string;
          data?: Record<string, unknown>;
        };
        const data = message.data ?? {};

        if (message.type === "progress") {
          const value = Number(data.value ?? 0);
          const max = Number(data.max ?? 1);
          onProgress?.({
            value,
            max,
            node: typeof data.node === "string" ? data.node : undefined,
            percent: Math.max(0, Math.min(100, Math.round((value / Math.max(max, 1)) * 100))),
            text: `Node ${data.node ?? "unknown"}`
          });
        }

        if (message.type === "executing" && data.prompt_id === promptId && data.node === null) {
          clearTimeout(timeout);
          websocket.close();
          resolve(true);
        }
      } catch (error) {
        clearTimeout(timeout);
        websocket.close();
        reject(error);
      }
    });

    websocket.on("error", async () => {
      clearTimeout(timeout);
      websocket.close();
      resolve(false);
    });
  });

  if (completed) {
    return;
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const history = await fetch(`${options.baseUrl}/history/${promptId}`);
    if (!history.ok) {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      continue;
    }

    const payload = (await history.json()) as Record<string, unknown>;
    if (payload[promptId]) {
      onProgress?.({
        value: 1,
        max: 1,
        percent: 100,
        text: "Completed"
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  throw new Error(`ComfyUI polling timeout for prompt ${promptId}`);
}

export async function fetchOutputs(
  options: ComfyClientOptions,
  promptId: string
): Promise<ComfyOutputAsset[]> {
  const history = await fetchPromptHistory(options, promptId);
  if (!history?.outputs) {
    return [];
  }

  const assets: ComfyOutputAsset[] = [];
  for (const [nodeId, output] of Object.entries(history.outputs)) {
    for (const value of Object.values(output)) {
      if (!Array.isArray(value)) {
        continue;
      }

      for (const item of value) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const filename = typeof (item as Record<string, unknown>).filename === "string" ? String((item as Record<string, unknown>).filename) : "";
        if (!filename) {
          continue;
        }

        assets.push({
          filename,
          subfolder:
            typeof (item as Record<string, unknown>).subfolder === "string"
              ? String((item as Record<string, unknown>).subfolder)
              : undefined,
          type:
            typeof (item as Record<string, unknown>).type === "string"
              ? String((item as Record<string, unknown>).type)
              : undefined,
          nodeId,
          mimeType: inferMimeType(filename)
        });
      }
    }
  }

  return assets;
}

export async function fetchPromptHistory(
  options: ComfyClientOptions,
  promptId: string
): Promise<ComfyPromptHistory | null> {
  const response = await fetch(`${options.baseUrl}/history/${promptId}`);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ComfyUI history failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as Record<string, ComfyPromptHistory | undefined>;
  return payload[promptId] ?? null;
}

export async function downloadOutputToFile(
  options: ComfyClientOptions,
  asset: ComfyOutputAsset,
  targetPath: string
) {
  const url = new URL(`${options.baseUrl}/view`);
  url.searchParams.set("filename", asset.filename);
  if (asset.subfolder) {
    url.searchParams.set("subfolder", asset.subfolder);
  }
  if (asset.type) {
    url.searchParams.set("type", asset.type);
  }

  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ComfyUI download failed: ${response.status} ${detail}`);
  }

  await mkdir(dirname(targetPath), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, buffer);
}

export async function uploadInputImage(
  options: ComfyClientOptions,
  sourcePath: string,
  targetName?: string
) {
  const filename = targetName ?? basename(sourcePath);
  const buffer = await readFile(sourcePath);
  return uploadInputBuffer(options, buffer, filename);
}

export async function uploadInputBuffer(
  options: ComfyClientOptions,
  buffer: Uint8Array | Buffer | ArrayBuffer,
  targetName: string
) {
  const formData = new FormData();
  const filename = targetName;
  const normalizedBuffer = Uint8Array.from(
    buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer
  );
  const blob = new Blob([normalizedBuffer]);
  formData.set("image", blob, filename);
  formData.set("overwrite", "true");
  formData.set("type", "input");

  const response = await fetch(`${options.baseUrl}/upload/image`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ComfyUI upload failed: ${response.status} ${detail}`);
  }

  const payload = (await response.json()) as { name?: string };
  return payload.name ?? filename;
}

export function outputPath(baseDir: string, jobId: string, filename: string) {
  return join(baseDir, "outputs", jobId, filename);
}
