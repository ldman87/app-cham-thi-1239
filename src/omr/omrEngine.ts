import {
  AnswerKey,
  BubbleReading,
  Exam,
  GradedPaper,
  Part1Choice,
  Part1Detail,
  Part2Answer,
  Part2Choice,
  Part2Detail,
  Part3Detail,
  Student,
  calcExamMaxScore,
  getPart1QuestionMaxPoint,
  getPart2QuestionScale,
  getPart3QuestionMaxPoint,
} from '../types';
import {
  BubblePos,
  PART1_OPTIONS,
  SheetLayout,
  getLayoutForExam,
  mmToWarpedPx,
} from './sheetTemplate';
import { generateId } from '../utils/id';

export interface Point2D {
  x: number;
  y: number;
}

export interface DetectedCorners {
  tl: Point2D;
  tr: Point2D;
  br: Point2D;
  bl: Point2D;
}

export interface OMRScanResult {
  corners: DetectedCorners;
  reading: BubbleReading;
  warpedCanvas: HTMLCanvasElement;
  layout: SheetLayout;
}

export interface LiveCornerStatus {
  tl: Point2D | null;
  tr: Point2D | null;
  br: Point2D | null;
  bl: Point2D | null;
  foundCount: number;
}

export interface GuideBoxNorm {
  x: number; // 0..1
  y: number; // 0..1
  w: number; // 0..1
  h: number; // 0..1
}

/**
 * Chuyển ImageData sang ảnh xám tối ưu cho nhận diện mực/bút chì (Ink-enhanced grayscale).
 * Kết hợp độ sáng chuẩn với kênh màu tối nhất min(R,G,B) giúp bắt cực rõ cả bút chì 2B,
 * bút bi đen lẫn bút bi xanh dương trong mọi điều kiện ánh sáng.
 */
function toGrayscale(imageData: ImageData): Uint8Array {
  const { data, width, height } = imageData;
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = (r * 77 + g * 150 + b * 29) >> 8;
    const minC = r < g ? (r < b ? r : b) : g < b ? g : b;
    gray[p] = (luma * 45 + minC * 55) / 100;
  }
  return gray;
}

/**
 * Cân bằng ánh sáng cục bộ (Illumination Normalization / Flat-Field Correction).
 * Triệt tiêu bóng tay, góc tối, ánh đèn chói không đều trên tờ phiếu bằng cách chia
 * từng pixel cho độ sáng nền giấy cục bộ ước lượng theo lưới ô.
 */
function normalizeIllumination(gray: Uint8Array, width: number, height: number): Uint8Array {
  const cols = 28;
  const rows = 40;
  const cellW = width / cols;
  const cellH = height / rows;
  const bgGrid = new Float32Array(cols * rows);

  // Ước lượng độ sáng nền giấy (phân vị 85%) ở từng ô lưới
  for (let gy = 0; gy < rows; gy++) {
    const y0 = Math.floor(gy * cellH);
    const y1 = Math.min(height, Math.floor((gy + 1) * cellH));
    for (let gx = 0; gx < cols; gx++) {
      const x0 = Math.floor(gx * cellW);
      const x1 = Math.min(width, Math.floor((gx + 1) * cellW));
      const samples: number[] = [];
      for (let y = y0; y < y1; y += 3) {
        const rowOff = y * width;
        for (let x = x0; x < x1; x += 3) {
          samples.push(gray[rowOff + x]);
        }
      }
      if (samples.length === 0) {
        bgGrid[gy * cols + gx] = 240;
      } else {
        samples.sort((a, b) => a - b);
        bgGrid[gy * cols + gx] = Math.max(65, samples[Math.floor(samples.length * 0.85)]);
      }
    }
  }

  // Chuẩn hóa từng pixel theo nền nội suy song tuyến tính
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = (y + 0.5) / cellH - 0.5;
    const gy0 = Math.max(0, Math.min(rows - 1, Math.floor(fy)));
    const gy1 = Math.min(rows - 1, gy0 + 1);
    const ty = Math.max(0, Math.min(1, fy - gy0));
    const rowOff = y * width;

    for (let x = 0; x < width; x++) {
      const fx = (x + 0.5) / cellW - 0.5;
      const gx0 = Math.max(0, Math.min(cols - 1, Math.floor(fx)));
      const gx1 = Math.min(cols - 1, gx0 + 1);
      const tx = Math.max(0, Math.min(1, fx - gx0));

      const b00 = bgGrid[gy0 * cols + gx0];
      const b10 = bgGrid[gy0 * cols + gx1];
      const b01 = bgGrid[gy1 * cols + gx0];
      const b11 = bgGrid[gy1 * cols + gx1];
      const localBg =
        b00 * (1 - tx) * (1 - ty) +
        b10 * tx * (1 - ty) +
        b01 * (1 - tx) * ty +
        b11 * tx * ty;

      const norm = (gray[rowOff + x] * 245) / localBg;
      out[rowOff + x] = norm >= 255 ? 255 : norm <= 0 ? 0 : norm | 0;
    }
  }
  // Làm tối nhẹ bằng đường cong Gamma vừa phải khi ánh sáng mạnh / lóa đèn:
  // Giữ ô trống sạch sẽ (không nhận nhầm ô chưa tô) nhưng vẫn kéo sẫm rõ nét bút chì 2B.
  let sumAll = 0;
  for (let i = 0; i < out.length; i += 4) sumAll += out[i];
  const avgBrightness = sumAll / (out.length / 4);

  const gamma = avgBrightness > 230 ? 1.65 : avgBrightness > 210 ? 1.48 : 1.3;
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) {
    lut[v] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(v / 255, gamma))));
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = lut[out[i]];
  }

  return out;
}

/**
 * Kiểm tra hình học 4 chấm đen đã bắt được có tạo thành hình chữ nhật/hình thang cân
 * đúng tỷ lệ tờ phiếu A4 hay không (loại bỏ hoàn toàn bắt nhầm hoa văn mặt bàn).
 */
export function isValidCornerQuad(corners: DetectedCorners): boolean {
  const topW = Math.hypot(corners.tr.x - corners.tl.x, corners.tr.y - corners.tl.y);
  const botW = Math.hypot(corners.br.x - corners.bl.x, corners.br.y - corners.bl.y);
  const leftH = Math.hypot(corners.bl.x - corners.tl.x, corners.bl.y - corners.tl.y);
  const rightH = Math.hypot(corners.br.x - corners.tr.x, corners.br.y - corners.tr.y);

  if (topW < 40 || botW < 40 || leftH < 60 || rightH < 60) return false;

  // Hai cạnh đối không lệch nhau quá 20%
  const wDiff = Math.abs(topW - botW) / Math.max(topW, botW);
  const hDiff = Math.abs(leftH - rightH) / Math.max(leftH, rightH);
  if (wDiff > 0.2 || hDiff > 0.2) return false;

  // Tỷ lệ rộng / cao của phiếu A4 khoảng 0.69 (cho phép sai số phối cảnh 0.52 .. 0.88)
  const avgW = (topW + botW) / 2;
  const avgH = (leftH + rightH) / 2;
  const aspect = avgW / avgH;
  return aspect >= 0.52 && aspect <= 0.88;
}

function computeRegionOtsuThreshold(
  gray: Uint8Array,
  imgW: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): number {
  const hist = new Int32Array(256);
  let total = 0;
  for (let y = y0; y < y1; y++) {
    const row = y * imgW;
    for (let x = x0; x < x1; x++) {
      hist[gray[row + x]]++;
      total++;
    }
  }
  if (total === 0) return 128;

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0;
  let wB = 0;
  let maxVar = -1;
  let threshold = 120;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const diff = mB - mF;
    const betweenVar = wB * wF * diff * diff;
    if (betweenVar > maxVar) {
      maxVar = betweenVar;
      threshold = t;
    }
  }
  return Math.min(165, Math.max(55, threshold * 0.92));
}

function findFiducialInRegion(
  gray: Uint8Array,
  imgW: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cornerTarget: Point2D,
  expectedRatio: number
): Point2D | null {
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 8 || rh <= 8) return null;

  const threshold = computeRegionOtsuThreshold(gray, imgW, x0, y0, x1, y1);
  const visited = new Uint8Array(rw * rh);

  // Phủ cả ô vuông 3.79mm (~1.8% W) của BGD1239 lẫn ô vuông 6mm (~2.9% W) của mẫu cá nhân
  const minDim = Math.max(5, Math.floor(imgW * 0.009));
  const maxDim = Math.ceil(imgW * 0.085);

  let bestScore = -1;
  let bestCenter: Point2D | null = null;

  const queueX = new Int32Array(rw * rh);
  const queueY = new Int32Array(rw * rh);

  for (let ly = 0; ly < rh; ly++) {
    for (let lx = 0; lx < rw; lx++) {
      const idx = ly * rw + lx;
      if (visited[idx]) continue;
      if (gray[(y0 + ly) * imgW + (x0 + lx)] > threshold) continue;

      let head = 0;
      let tail = 0;
      queueX[tail] = lx;
      queueY[tail] = ly;
      tail++;
      visited[idx] = 1;

      let minX = lx, maxX = lx, minY = ly, maxY = ly;
      let sumX = 0, sumY = 0, count = 0;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;
        count++;
        sumX += cx;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (let n = 0; n < 4; n++) {
          const nx = neighbors[n][0];
          const ny = neighbors[n][1];
          if (nx < 0 || nx >= rw || ny < 0 || ny >= rh) continue;
          const nIdx = ny * rw + nx;
          if (visited[nIdx]) continue;
          if (gray[(y0 + ny) * imgW + (x0 + nx)] <= threshold) {
            visited[nIdx] = 1;
            queueX[tail] = nx;
            queueY[tail] = ny;
            tail++;
          }
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (bw < minDim || bh < minDim || bw > maxDim || bh > maxDim) continue;

      const aspect = bw / bh;
      if (aspect < 0.62 || aspect > 1.6) continue;

      const fillRatio = count / (bw * bh);
      if (fillRatio < 0.62) continue;

      const centerX = x0 + sumX / count;
      const centerY = y0 + sumY / count;

      const squareScore = 1 - Math.abs(1 - aspect) * 0.85;
      const idealSize = imgW * expectedRatio;
      const sizeScore = 1 / (1 + Math.abs((bw + bh) / 2 - idealSize) / idealSize);
      const dist = Math.hypot(centerX - cornerTarget.x, centerY - cornerTarget.y);
      const distScore = 1 / (1 + dist / (imgW * 0.22));

      const score = fillRatio * 2.3 + squareScore * 1.6 + sizeScore * 1.2 + distScore * 1.8;
      if (score > bestScore) {
        bestScore = score;
        bestCenter = { x: centerX, y: centerY };
      }
    }
  }

  return bestCenter;
}

interface SquareCandidate {
  x: number;
  y: number;
  size: number;
  score: number;
}

/**
 * Thu thập tất cả ứng viên chấm vuông đen trong một vùng ảnh (có kiểm tra độ đặc, độ vuông
 * và viền giấy trắng xung quanh để loại bỏ bóng bàn / chữ viết / ô tô nhạt).
 */
function collectSquareCandidatesInRegion(
  gray: Uint8Array,
  imgW: number,
  imgH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cornerTarget: Point2D,
  expectedRatio: number,
  maxCandidates = 8
): SquareCandidate[] {
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 8 || rh <= 8) return [];

  const threshold = computeRegionOtsuThreshold(gray, imgW, x0, y0, x1, y1);
  const visited = new Uint8Array(rw * rh);

  // Kích thước chấm đen góc (từ 0.9% đến 6.2% chiều rộng ảnh)
  const minDim = Math.max(5, Math.floor(imgW * 0.009));
  const maxDim = Math.ceil(imgW * 0.062);

  const candidates: SquareCandidate[] = [];
  const queueX = new Int32Array(rw * rh);
  const queueY = new Int32Array(rw * rh);

  for (let ly = 0; ly < rh; ly++) {
    for (let lx = 0; lx < rw; lx++) {
      const idx = ly * rw + lx;
      if (visited[idx]) continue;
      if (gray[(y0 + ly) * imgW + (x0 + lx)] > threshold) continue;

      let head = 0;
      let tail = 0;
      queueX[tail] = lx;
      queueY[tail] = ly;
      tail++;
      visited[idx] = 1;

      let minX = lx, maxX = lx, minY = ly, maxY = ly;
      let sumX = 0, sumY = 0, count = 0;
      let innerGraySum = 0;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head++;
        count++;
        sumX += cx;
        sumY += cy;
        innerGraySum += gray[(y0 + cy) * imgW + (x0 + cx)];
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (let n = 0; n < 4; n++) {
          const nx = neighbors[n][0];
          const ny = neighbors[n][1];
          if (nx < 0 || nx >= rw || ny < 0 || ny >= rh) continue;
          const nIdx = ny * rw + nx;
          if (visited[nIdx]) continue;
          if (gray[(y0 + ny) * imgW + (x0 + nx)] <= threshold) {
            visited[nIdx] = 1;
            queueX[tail] = nx;
            queueY[tail] = ny;
            tail++;
          }
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (bw < minDim || bh < minDim || bw > maxDim || bh > maxDim) continue;

      const aspect = bw / bh;
      if (aspect < 0.65 || aspect > 1.55) continue;

      const fillRatio = count / (bw * bh);
      if (fillRatio < 0.65) continue;

      const centerX = x0 + sumX / count;
      const centerY = y0 + sumY / count;
      const size = (bw + bh) / 2;

      // Kiểm tra tương phản với viền trắng xung quanh chấm đen (loại bỏ vùng tối/bóng bàn)
      const pad = Math.max(3, Math.round(size * 0.75));
      const bx0 = Math.max(0, Math.floor(centerX - bw / 2 - pad));
      const bx1 = Math.min(imgW - 1, Math.ceil(centerX + bw / 2 + pad));
      const by0 = Math.max(0, Math.floor(centerY - bh / 2 - pad));
      const by1 = Math.min(imgH - 1, Math.ceil(centerY + bh / 2 + pad));

      let borderSum = 0;
      let borderCnt = 0;
      for (let x = bx0; x <= bx1; x += 2) {
        borderSum += gray[by0 * imgW + x] + gray[by1 * imgW + x];
        borderCnt += 2;
      }
      for (let y = by0; y <= by1; y += 2) {
        borderSum += gray[y * imgW + bx0] + gray[y * imgW + bx1];
        borderCnt += 2;
      }
      const centerMean = innerGraySum / count;
      const borderMean = borderCnt > 0 ? borderSum / borderCnt : 200;
      if (borderMean - centerMean < 38) continue;

      const squareScore = 1 - Math.abs(1 - aspect) * 0.85;
      const idealSize = imgW * expectedRatio;
      const sizeScore = 1 / (1 + Math.abs(size - idealSize) / Math.max(4, idealSize));
      const dist = Math.hypot(centerX - cornerTarget.x, centerY - cornerTarget.y);
      const distScore = 1 / (1 + dist / (imgW * 0.28));
      const contrastScore = Math.min(1.5, (borderMean - centerMean) / 110);

      const score = fillRatio * 2.2 + squareScore * 1.5 + sizeScore * 1.1 + distScore * 1.8 + contrastScore;
      candidates.push({ x: centerX, y: centerY, size, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxCandidates);
}

/**
 * Tìm bộ 4 chấm đen NGOÀI CÙNG TẠO THÀNH HÌNH CHỮ NHẬT chuẩn phiếu A4
 * (cho phép cong vênh / lệch nhẹ nhưng loại bỏ hoàn toàn chấm biên giữa tờ hay ô tròn tô).
 */
function findBestOuterRectangle(
  tlList: SquareCandidate[],
  trList: SquareCandidate[],
  brList: SquareCandidate[],
  blList: SquareCandidate[],
  imgW: number,
  imgH: number,
  idealAspect: number
): DetectedCorners | null {
  if (!tlList.length || !trList.length || !brList.length || !blList.length) return null;

  let bestComboScore = -1;
  let bestQuad: DetectedCorners | null = null;
  const imgArea = imgW * imgH;

  for (const tl of tlList) {
    for (const tr of trList) {
      if (tr.x <= tl.x + imgW * 0.32) continue;
      for (const bl of blList) {
        if (bl.y <= tl.y + imgH * 0.42) continue;
        for (const br of brList) {
          if (br.x <= bl.x + imgW * 0.32 || br.y <= tr.y + imgH * 0.42) continue;

          // 1. Kích thước 4 chấm đen phải tương đồng nhau
          const minSz = Math.min(tl.size, tr.size, br.size, bl.size);
          const maxSz = Math.max(tl.size, tr.size, br.size, bl.size);
          if (maxSz / Math.max(1, minSz) > 1.65) continue;

          // 2. Kiểm tra hình chữ nhật (cho phép giấy cong vênh / chụp nghiêng nhẹ)
          const topW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
          const botW = Math.hypot(br.x - bl.x, br.y - bl.y);
          const leftH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
          const rightH = Math.hypot(br.x - tr.x, br.y - tr.y);

          const wDiff = Math.abs(topW - botW) / Math.max(topW, botW);
          const hDiff = Math.abs(leftH - rightH) / Math.max(leftH, rightH);
          if (wDiff > 0.16 || hDiff > 0.16) continue;

          // 3. Hai đường chéo hình chữ nhật phải gần bằng nhau (loại bỏ hình bình hành/lệch)
          const diag1 = Math.hypot(br.x - tl.x, br.y - tl.y);
          const diag2 = Math.hypot(bl.x - tr.x, bl.y - tr.y);
          const diagDiff = Math.abs(diag1 - diag2) / Math.max(diag1, diag2);
          if (diagDiff > 0.14) continue;

          // 4. Tỷ lệ rộng / cao khớp tờ phiếu A4 (~0.693 cho BGD 1239, cho phép cong vênh 0.56 .. 0.84)
          const avgW = (topW + botW) / 2;
          const avgH = (leftH + rightH) / 2;
          const aspect = avgW / avgH;
          if (aspect < 0.56 || aspect > 0.84) continue;

          // 5. Góc nghiêng cạnh trên và cạnh dưới phải gần song song (< 12 độ)
          const angleTop = Math.atan2(tr.y - tl.y, tr.x - tl.x);
          const angleBot = Math.atan2(br.y - bl.y, br.x - bl.x);
          if (Math.abs(angleTop - angleBot) > (12 * Math.PI) / 180) continue;

          // 6. Xếp hạng: ưu tiên TỐI ĐA bộ 4 chấm NGOÀI CÙNG (diện tích lớn nhất) + độ vuông vức cao nhất
          const areaRatio = (avgW * avgH) / imgArea;
          const rectQuality = 1 - (wDiff + hDiff + diagDiff) / 3;
          const aspectQuality = 1 - Math.min(1, Math.abs(aspect - idealAspect) / 0.25);
          const sizeConsistency = minSz / maxSz;
          const avgCandScore = (tl.score + tr.score + br.score + bl.score) / 4;

          const comboScore =
            areaRatio * 5.0 +
            rectQuality * 3.0 +
            aspectQuality * 2.2 +
            sizeConsistency * 1.4 +
            avgCandScore * 0.35;

          if (comboScore > bestComboScore) {
            bestComboScore = comboScore;
            bestQuad = {
              tl: { x: tl.x, y: tl.y },
              tr: { x: tr.x, y: tr.y },
              br: { x: br.x, y: br.y },
              bl: { x: bl.x, y: bl.y },
            };
          }
        }
      }
    }
  }

  return bestQuad;
}

/**
 * Tìm 4 ô vuông đen ngoài cùng ở 4 góc phiếu (dùng cho cả ảnh chụp/thư viện).
 * Ghép tổ hợp chọn đúng bộ 4 chấm ngoài cùng tạo thành hình chữ nhật chuẩn A4.
 */
export function detectFiducials(imageData: ImageData, layout: SheetLayout): DetectedCorners | null {
  const { width: w, height: h } = imageData;
  const gray = toGrayscale(imageData);

  const rx = Math.floor(w * 0.36);
  const ry = Math.floor(h * 0.26);
  const expectedRatio = layout.fiducialSizeMm / layout.pageWidthMm;
  const idealAspect = layout.workWMm / layout.workHMm;

  const tlList = collectSquareCandidatesInRegion(gray, w, h, 0, 0, rx, ry, { x: w * 0.04, y: h * 0.03 }, expectedRatio);
  const trList = collectSquareCandidatesInRegion(gray, w, h, w - rx, 0, w, ry, { x: w * 0.96, y: h * 0.03 }, expectedRatio);
  const blList = collectSquareCandidatesInRegion(gray, w, h, 0, h - ry, rx, h, { x: w * 0.04, y: h * 0.97 }, expectedRatio);
  const brList = collectSquareCandidatesInRegion(gray, w, h, w - rx, h - ry, w, h, { x: w * 0.96, y: h * 0.97 }, expectedRatio);

  return findBestOuterRectangle(tlList, trList, brList, blList, w, h, idealAspect);
}

/**
 * Tự động dò 4 chấm đen NGOÀI CÙNG tạo thành hình chữ nhật trên toàn khung hình Camera (Full-Frame Auto Tracking).
 * Chỉ trả về 4/4 góc khi 4 chấm đen ngoài cùng tạo thành hình chữ nhật chuẩn phiếu A4 (cho phép cong vênh nhẹ).
 */
export function detectFullFrameCornersLive(
  imageData: ImageData,
  layout: SheetLayout
): LiveCornerStatus {
  const { width: w, height: h } = imageData;
  const gray = toGrayscale(imageData);

  // Vùng tìm kiếm rộng 4 góc khung hình
  const rx = Math.floor(w * 0.45);
  const ry = Math.floor(h * 0.35);
  const expectedRatio = (layout.fiducialSizeMm / layout.pageWidthMm) * 0.85;
  const idealAspect = layout.workWMm / layout.workHMm;

  const tlList = collectSquareCandidatesInRegion(gray, w, h, 0, 0, rx, ry, { x: w * 0.08, y: h * 0.06 }, expectedRatio, 7);
  const trList = collectSquareCandidatesInRegion(gray, w, h, w - rx, 0, w, ry, { x: w * 0.92, y: h * 0.06 }, expectedRatio, 7);
  const blList = collectSquareCandidatesInRegion(gray, w, h, 0, h - ry, rx, h, { x: w * 0.08, y: h * 0.94 }, expectedRatio, 7);
  const brList = collectSquareCandidatesInRegion(gray, w, h, w - rx, h - ry, w, h, { x: w * 0.92, y: h * 0.94 }, expectedRatio, 7);

  // Ưu tiên tuyệt đối bộ 4 chấm NGOÀI CÙNG tạo thành hình chữ nhật chuẩn A4
  const rect = findBestOuterRectangle(tlList, trList, brList, blList, w, h, idealAspect);
  if (rect) {
    return { tl: rect.tl, tr: rect.tr, br: rect.br, bl: rect.bl, foundCount: 4 };
  }

  // Nếu chưa đủ hình chữ nhật 4 góc: chỉ hiển thị các chấm ứng viên tốt nhất để người dùng thấy phản hồi trực quan
  const tl = tlList[0] ? { x: tlList[0].x, y: tlList[0].y } : null;
  const tr = trList[0] ? { x: trList[0].x, y: trList[0].y } : null;
  const bl = blList[0] ? { x: blList[0].x, y: blList[0].y } : null;
  const br = brList[0] ? { x: brList[0].x, y: brList[0].y } : null;
  const rawCount = (tl ? 1 : 0) + (tr ? 1 : 0) + (br ? 1 : 0) + (bl ? 1 : 0);
  // Không bao giờ báo 4/4 nếu không vượt qua kiểm tra hình chữ nhật ngoài cùng
  return { tl, tr, br, bl, foundCount: Math.min(3, rawCount) };
}

/**
 * Kiểm tra thời gian thực 4 chấm đen có nằm lọt trong 4 ô vuông định vị trên màn hình Camera không.
 */
export function detectLiveCornersInGuide(
  imageData: ImageData,
  guideBox: GuideBoxNorm,
  layout: SheetLayout
): LiveCornerStatus {
  const { width: w, height: h } = imageData;
  const gray = toGrayscale(imageData);

  const gx0 = guideBox.x * w;
  const gy0 = guideBox.y * h;
  const gw = guideBox.w * w;
  const gh = guideBox.h * h;

  // Vùng tìm kiếm khớp chính xác với 4 ô vuông tĩnh to ở 4 góc màn hình (~11% mỗi bên tâm ô)
  const boxHalf = Math.max(22, Math.round(gw * 0.125));
  const expectedRatio = (layout.fiducialSizeMm / layout.pageWidthMm) * (gw / w);

  const clampRegion = (cx: number, cy: number) => ({
    x0: Math.max(0, Math.floor(cx - boxHalf)),
    y0: Math.max(0, Math.floor(cy - boxHalf)),
    x1: Math.min(w, Math.ceil(cx + boxHalf)),
    y1: Math.min(h, Math.ceil(cy + boxHalf)),
    target: { x: cx, y: cy },
  });

  const rTL = clampRegion(gx0, gy0);
  const rTR = clampRegion(gx0 + gw, gy0);
  const rBL = clampRegion(gx0, gy0 + gh);
  const rBR = clampRegion(gx0 + gw, gy0 + gh);

  const tl = collectSquareCandidatesInRegion(gray, w, h, rTL.x0, rTL.y0, rTL.x1, rTL.y1, rTL.target, expectedRatio, 1)[0];
  const tr = collectSquareCandidatesInRegion(gray, w, h, rTR.x0, rTR.y0, rTR.x1, rTR.y1, rTR.target, expectedRatio, 1)[0];
  const bl = collectSquareCandidatesInRegion(gray, w, h, rBL.x0, rBL.y0, rBL.x1, rBL.y1, rBL.target, expectedRatio, 1)[0];
  const br = collectSquareCandidatesInRegion(gray, w, h, rBR.x0, rBR.y0, rBR.x1, rBR.y1, rBR.target, expectedRatio, 1)[0];

  const tlPt = tl ? { x: tl.x, y: tl.y } : null;
  const trPt = tr ? { x: tr.x, y: tr.y } : null;
  const blPt = bl ? { x: bl.x, y: bl.y } : null;
  const brPt = br ? { x: br.x, y: br.y } : null;
  const foundCount = (tlPt ? 1 : 0) + (trPt ? 1 : 0) + (brPt ? 1 : 0) + (blPt ? 1 : 0);
  return { tl: tlPt, tr: trPt, br: brPt, bl: blPt, foundCount };
}

/**
 * Tinh chỉnh lại tọa độ tâm 4 chấm đen trực tiếp trên ảnh độ phân giải cao (Full-Res)
 * trong cửa sổ nhỏ xung quanh 4 vị trí đã bắt từ ảnh probe -> sai số < 0.3 pixel!
 */
function refineCornersOnFullRes(
  imageData: ImageData,
  approx: DetectedCorners,
  layout: SheetLayout
): DetectedCorners {
  const { width: w, height: h } = imageData;
  const gray = toGrayscale(imageData);
  const rad = Math.max(24, Math.round(w * 0.045));
  const expectedRatio = layout.fiducialSizeMm / layout.pageWidthMm;

  const refineOne = (pt: Point2D): Point2D => {
    const x0 = Math.max(0, Math.floor(pt.x - rad));
    const y0 = Math.max(0, Math.floor(pt.y - rad));
    const x1 = Math.min(w, Math.ceil(pt.x + rad));
    const y1 = Math.min(h, Math.ceil(pt.y + rad));
    const best = collectSquareCandidatesInRegion(gray, w, h, x0, y0, x1, y1, pt, expectedRatio, 1)[0];
    return best ? { x: best.x, y: best.y } : pt;
  };

  return {
    tl: refineOne(approx.tl),
    tr: refineOne(approx.tr),
    br: refineOne(approx.br),
    bl: refineOne(approx.bl),
  };
}

function solveLinearSystem8(A: number[][], b: number[]): number[] {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col]);
      if (v > maxVal) {
        maxVal = v;
        maxRow = r;
      }
    }
    if (maxRow !== col) {
      const tmp = M[col];
      M[col] = M[maxRow];
      M[maxRow] = tmp;
    }

    const pivot = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= pivot;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let j = col; j <= n; j++) {
        M[r][j] -= factor * M[col][j];
      }
    }
  }

  return M.map((row) => row[n]);
}

function computeInverseHomography(dstPts: Point2D[], srcPts: Point2D[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const x = dstPts[i].x;
    const y = dstPts[i].y;
    const u = srcPts[i].x;
    const v = srcPts[i].y;

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem8(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function warpPerspective(
  srcImageData: ImageData,
  corners: DetectedCorners,
  layout: SheetLayout
): HTMLCanvasElement {
  const dstW = layout.warpedWidth;
  const dstH = layout.warpedHeight;

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = dstW;
  dstCanvas.height = dstH;
  const dstCtx = dstCanvas.getContext('2d')!;
  const dstImageData = dstCtx.createImageData(dstW, dstH);

  const dstPts: Point2D[] = [
    { x: 0, y: 0 },
    { x: dstW - 1, y: 0 },
    { x: dstW - 1, y: dstH - 1 },
    { x: 0, y: dstH - 1 },
  ];
  const srcPts: Point2D[] = [corners.tl, corners.tr, corners.br, corners.bl];
  const H = computeInverseHomography(dstPts, srcPts);

  const srcData = srcImageData.data;
  const srcW = srcImageData.width;
  const srcH = srcImageData.height;
  const dstData = dstImageData.data;

  for (let y = 0; y < dstH; y++) {
    const rowOffset = y * dstW;
    for (let x = 0; x < dstW; x++) {
      const denom = H[6] * x + H[7] * y + H[8];
      const sx = (H[0] * x + H[1] * y + H[2]) / denom;
      const sy = (H[3] * x + H[4] * y + H[5]) / denom;

      const dIdx = (rowOffset + x) * 4;
      if (sx < 0 || sx >= srcW - 1 || sy < 0 || sy >= srcH - 1) {
        dstData[dIdx] = 255;
        dstData[dIdx + 1] = 255;
        dstData[dIdx + 2] = 255;
        dstData[dIdx + 3] = 255;
        continue;
      }

      const x0 = sx | 0;
      const y0 = sy | 0;
      const dx = sx - x0;
      const dy = sy - y0;
      const w00 = (1 - dx) * (1 - dy);
      const w10 = dx * (1 - dy);
      const w01 = (1 - dx) * dy;
      const w11 = dx * dy;

      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = i00 + srcW * 4;
      const i11 = i01 + 4;

      dstData[dIdx] = srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11;
      dstData[dIdx + 1] =
        srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11;
      dstData[dIdx + 2] =
        srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11;
      dstData[dIdx + 3] = 255;
    }
  }

  dstCtx.putImageData(dstImageData, 0, 0);
  return dstCanvas;
}

function measureBubbleFillScore(gray: Uint8Array, layout: SheetLayout, bubble: BubblePos): number {
  const { x: cx, y: cy } = mmToWarpedPx(layout, bubble.xMm, bubble.yMm);
  const r = bubble.rMm * layout.warpPxPerMm;
  const W = layout.warpedWidth;
  const H = layout.warpedHeight;

  const innerR2 = (r * 0.72) ** 2;
  const bgMinR2 = (r * 1.25) ** 2;
  const bgMaxR2 = (r * 1.62) ** 2;

  const minX = Math.max(0, Math.floor(cx - r * 1.7));
  const maxX = Math.min(W - 1, Math.ceil(cx + r * 1.7));
  const minY = Math.max(0, Math.floor(cy - r * 1.7));
  const maxY = Math.min(H - 1, Math.ceil(cy + r * 1.7));

  const innerSamples: number[] = [];
  const bgSamples: number[] = [];

  for (let y = minY; y <= maxY; y++) {
    const dy = y - cy;
    const dy2 = dy * dy;
    const rowOffset = y * W;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dist2 = dx * dx + dy2;
      if (dist2 <= innerR2) {
        innerSamples.push(gray[rowOffset + x]);
      } else if (dist2 >= bgMinR2 && dist2 <= bgMaxR2) {
        bgSamples.push(gray[rowOffset + x]);
      }
    }
  }

  if (innerSamples.length === 0) return 0;

  // Lấy trung bình 65% pixel tối nhất trong lõi ô tròn -> loại bỏ đốm phản quang/lóa sáng của bút chì 2B dưới đèn mạnh
  innerSamples.sort((a, b) => a - b);
  const takeCount = Math.max(1, Math.floor(innerSamples.length * 0.65));
  let innerSum = 0;
  for (let i = 0; i < takeCount; i++) innerSum += innerSamples[i];
  const innerMean = innerSum / takeCount;

  let localBg = 240;
  if (bgSamples.length > 0) {
    bgSamples.sort((a, b) => a - b);
    localBg = bgSamples[Math.floor(bgSamples.length * 0.78)];
  }
  localBg = Math.max(80, localBg);

  return Math.max(0, (localBg - innerMean) / localBg);
}

/**
 * Nhận diện ô được tô trong 1 nhóm ô tròn.
 * - Với cột nhiều số (SBD, Mã đề, Phần III): dùng trung vị (median) của cả cột làm nền chuẩn,
 *   giúp nhận diện rất nhạy các nét bút chì nhạt mà không bắt nhầm cột trống.
 */
function pickSingleFilledIndex(
  gray: Uint8Array,
  layout: SheetLayout,
  bubbles: BubblePos[],
  allowMultipleReject = true,
  isDigitColumn = false
): number {
  const scores = bubbles.map((b) => measureBubbleFillScore(gray, layout, b));
  if (scores.length === 0) return -1;

  let bestIdx = -1;
  let bestScore = -1;
  let secondScore = -1;

  for (let i = 0; i < scores.length; i++) {
    if (scores[i] > bestScore) {
      secondScore = bestScore;
      bestScore = scores[i];
      bestIdx = i;
    } else if (scores[i] > secondScore) {
      secondScore = scores[i];
    }
  }

  if (isDigitColumn && scores.length >= 6) {
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const deltaFromMedian = bestScore - median;
    const gap = bestScore - secondScore;

    const isFilled =
      bestScore >= 0.24 ||
      (bestScore >= 0.15 && deltaFromMedian >= 0.08 && gap >= 0.045);
    if (!isFilled) return -1;

    if (allowMultipleReject && secondScore >= 0.27 && gap < 0.06) {
      return -1;
    }
    return bestIdx;
  }

  // Phần I (4 ô A-D) và Phần II (2 ô Đ/S): ngưỡng chặt hơn chống nhận nhầm ô chưa tô là tô sai
  const isFilled = bestScore >= 0.255 || (bestScore >= 0.205 && bestScore - secondScore >= 0.115);
  if (!isFilled) return -1;

  if (allowMultipleReject && secondScore >= 0.28 && bestScore - secondScore < 0.08) {
    return -1;
  }

  return bestIdx;
}

export function scanOMRSheet(
  source: HTMLImageElement | HTMLCanvasElement,
  exam: Exam,
  preDetectedCorners?: DetectedCorners
): OMRScanResult {
  const layout = getLayoutForExam(exam.templateType || 'bgd1239', exam.customSheet);

  const srcW = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const srcH = source instanceof HTMLImageElement ? source.naturalHeight : source.height;

  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const workCanvas = document.createElement('canvas');
  workCanvas.width = Math.round(srcW * scale);
  workCanvas.height = Math.round(srcH * scale);
  const workCtx = workCanvas.getContext('2d')!;
  workCtx.drawImage(source, 0, 0, workCanvas.width, workCanvas.height);

  const srcImageData = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
  const corners = preDetectedCorners
    ? refineCornersOnFullRes(
        srcImageData,
        {
          tl: { x: preDetectedCorners.tl.x * scale, y: preDetectedCorners.tl.y * scale },
          tr: { x: preDetectedCorners.tr.x * scale, y: preDetectedCorners.tr.y * scale },
          br: { x: preDetectedCorners.br.x * scale, y: preDetectedCorners.br.y * scale },
          bl: { x: preDetectedCorners.bl.x * scale, y: preDetectedCorners.bl.y * scale },
        },
        layout
      )
    : detectFiducials(srcImageData, layout);

  if (!corners) {
    throw new Error(
      'Không tìm thấy đủ 4 ô vuông đen định vị ở 4 góc phiếu. Hãy chụp rõ toàn bộ tờ phiếu trên nền tương phản và đủ ánh sáng.'
    );
  }

  const warpedCanvas = warpPerspective(srcImageData, corners, layout);
  const warpedCtx = warpedCanvas.getContext('2d')!;
  const warpedData = warpedCtx.getImageData(0, 0, layout.warpedWidth, layout.warpedHeight);
  // Cân bằng ánh sáng cục bộ triệt tiêu bóng đổ trước khi đọc ô tô
  const rawGray = toGrayscale(warpedData);
  const gray = normalizeIllumination(rawGray, layout.warpedWidth, layout.warpedHeight);

  const sbd = layout.sbdBubbles
    .map((col) => {
      const idx = pickSingleFilledIndex(gray, layout, col, false, true);
      return idx >= 0 ? col[idx].label : '?';
    })
    .join('')
    .replace(/\?+$/, '')
    .replace(/^\?+/, '');

  const examCode = layout.examCodeBubbles
    .map((col) => {
      const idx = pickSingleFilledIndex(gray, layout, col, false, true);
      return idx >= 0 ? col[idx].label : '';
    })
    .join('');

  const part1: Part1Choice[] = Array(40).fill('') as Part1Choice[];
  layout.part1Bubbles.forEach((row, qIdx) => {
    const idx = pickSingleFilledIndex(gray, layout, row, true, false);
    part1[qIdx] = idx >= 0 ? PART1_OPTIONS[idx] : '';
  });

  const part2: Part2Answer[] = Array.from({ length: 8 }, () => ({ a: '', b: '', c: '', d: '' }));
  layout.part2Bubbles.forEach((q, qIdx) => {
    const ans: Part2Answer = { a: '', b: '', c: '', d: '' };
    q.subItems.forEach((sub) => {
      const idx = pickSingleFilledIndex(gray, layout, [sub.trueBubble, sub.falseBubble], true, false);
      ans[sub.key] = idx === 0 ? 'D' : idx === 1 ? 'S' : '';
    });
    part2[qIdx] = ans;
  });

  const part3: string[] = Array(6).fill('');
  layout.part3Bubbles.forEach((qCols, qIdx) => {
    part3[qIdx] = qCols
      .map((cells) => {
        const idx = pickSingleFilledIndex(gray, layout, cells, true, true);
        return idx >= 0 ? cells[idx].char : '';
      })
      .join('');
  });

  return {
    corners,
    reading: { sbd, examCode, part1, part2, part3 },
    warpedCanvas,
    layout,
  };
}

export function normalizeShortAnswer(val: string): string {
  const cleaned = val.trim().replace(/\s+/g, '').replace(/\./g, ',');
  if (!cleaned) return '';
  const numericCandidate = cleaned.replace(',', '.');
  const num = Number(numericCandidate);
  if (!Number.isNaN(num) && /^-?\d+(,\d+)?$/.test(cleaned)) {
    return String(num);
  }
  return cleaned;
}

export function gradeBubbleReading(
  reading: BubbleReading,
  exam: Exam,
  students: Student[],
  warpedCanvas?: HTMLCanvasElement,
  existingEssayScore?: number
): GradedPaper {
  const { scoring } = exam;
  const answerKey: AnswerKey | undefined = exam.answerKeys[reading.examCode];

  const matchedStudent = students.find(
    (s) =>
      s.sbd.trim() !== '' &&
      s.sbd.trim().replace(/^0+/, '') === reading.sbd.trim().replace(/^0+/, '')
  );

  const maxScore = calcExamMaxScore(scoring);
  const part1Details: Part1Detail[] = [];
  const part2Details: Part2Detail[] = [];
  const part3Details: Part3Detail[] = [];

  let part1Score = 0;
  let part2Score = 0;
  let part3Score = 0;

  // Phần I
  for (let i = 0; i < scoring.part1Count; i++) {
    const selected = reading.part1[i] || '';
    const correct = answerKey?.part1[i] || '';
    const maxPoint = getPart1QuestionMaxPoint(scoring, i);
    const isCorrect = Boolean(correct && selected === correct);
    const point = isCorrect ? maxPoint : 0;
    part1Score += point;
    part1Details.push({ question: i + 1, selected, correct, isCorrect, point, maxPoint });
  }

  // Phần II (hỗ trợ cả chế độ Bậc thang BGD 0.1/0.25/0.5/1.0 và Chia đều 0.25 mỗi ý)
  const p2Mode = scoring.part2ScoringMode || 'bgd2025';
  const p2BaseTable: [number, number, number, number] =
    p2Mode === 'equal025' ? [0.25, 0.5, 0.75, 1.0] : scoring.part2Points;

  for (let i = 0; i < scoring.part2Count; i++) {
    const selected = reading.part2[i] || { a: '', b: '', c: '', d: '' };
    const correct = answerKey?.part2[i] || { a: '', b: '', c: '', d: '' };
    let correctSubCount = 0;
    (['a', 'b', 'c', 'd'] as const).forEach((k) => {
      if (correct[k] && selected[k] === correct[k]) correctSubCount++;
    });
    const scale = getPart2QuestionScale(scoring, i);
    const maxPoint = Number((p2BaseTable[3] * scale).toFixed(2));
    const point =
      correctSubCount > 0 ? Number((p2BaseTable[correctSubCount - 1] * scale).toFixed(3)) : 0;
    part2Score += point;
    part2Details.push({ question: i + 1, selected, correct, correctSubCount, point, maxPoint });
  }

  // Phần III
  for (let i = 0; i < scoring.part3Count; i++) {
    const selected = reading.part3[i] || '';
    const correct = answerKey?.part3[i] || '';
    const maxPoint = getPart3QuestionMaxPoint(scoring, i);
    const isCorrect = Boolean(
      correct.trim() && normalizeShortAnswer(selected) === normalizeShortAnswer(correct)
    );
    const point = isCorrect ? maxPoint : 0;
    part3Score += point;
    part3Details.push({ question: i + 1, selected, correct, isCorrect, point, maxPoint });
  }

  const essayScore = typeof existingEssayScore === 'number' ? existingEssayScore : 0;
  const totalScore = Number((part1Score + part2Score + part3Score + essayScore).toFixed(2));
  const warning = !answerKey
    ? `Không tìm thấy đáp án cho mã đề "${reading.examCode || '(trống)'}" trong kỳ thi này.`
    : undefined;

  let overlayImageDataUrl: string | undefined;
  if (warpedCanvas) {
    const layout = getLayoutForExam(exam.templateType || 'bgd1239', exam.customSheet);
    overlayImageDataUrl = renderGradingOverlay(
      warpedCanvas,
      layout,
      reading,
      part1Details,
      part2Details,
      part3Details,
      totalScore,
      part1Score,
      part2Score,
      part3Score,
      essayScore,
      Boolean(scoring.essayMaxScore && scoring.essayMaxScore > 0)
    );
  }

  return {
    id: generateId(),
    examId: exam.id,
    sbd: reading.sbd || 'Chưa rõ',
    examCode: reading.examCode || '----',
    studentName: matchedStudent?.fullName,
    className: matchedStudent?.className,
    totalScore,
    maxScore,
    part1Score: Number(part1Score.toFixed(2)),
    part2Score: Number(part2Score.toFixed(2)),
    part3Score: Number(part3Score.toFixed(2)),
    essayScore: scoring.essayMaxScore ? essayScore : undefined,
    reading,
    part1Details,
    part2Details,
    part3Details,
    overlayImageDataUrl,
    gradedAt: Date.now(),
    warning,
  };
}

/**
 * Vẽ kết quả chấm lên ảnh bài làm theo phong cách trực quan, màu tươi rõ nét:
 * - Xanh lá tươi (#00e038): tô đúng (và các ô SBD, Mã đề đã nhận diện).
 * - Đỏ tươi (#ff1a1a): tô sai.
 * - Vàng tươi (#ffd000): đáp án đúng (khi học sinh tô sai hoặc bỏ trống).
 * - Phần III tô màu từng ô tròn theo từng cột ký tự giống Phần I, II.
 * - Dải điểm số đặt gọn phía trên ảnh (nền trong suốt/trắng sạch, không đè lên tờ phiếu).
 */
function renderGradingOverlay(
  warpedCanvas: HTMLCanvasElement,
  layout: SheetLayout,
  reading: BubbleReading,
  part1Details: Part1Detail[],
  part2Details: Part2Detail[],
  part3Details: Part3Detail[],
  totalScore: number,
  part1Score: number,
  part2Score: number,
  part3Score: number,
  essayScore: number,
  hasEssay: boolean
): string {
  const COLOR_CORRECT = '#00e038'; // Xanh lá tươi
  const COLOR_WRONG = '#ff1a1a'; // Đỏ tươi
  const COLOR_ANSWER = '#ffd000'; // Vàng tươi

  const scale = 0.65;
  const imgW = Math.round(layout.warpedWidth * scale);
  const imgH = Math.round(layout.warpedHeight * scale);
  const headerH = 92; // Dải trống phía trên cho dòng điểm — tuyệt đối không đè lên phiếu

  const out = document.createElement('canvas');
  out.width = imgW;
  out.height = imgH + headerH;
  const ctx = out.getContext('2d')!;

  // Nền trắng sạch cho dải điểm phía trên
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);

  // Vẽ ảnh bài làm ngay dưới dải điểm
  ctx.drawImage(warpedCanvas, 0, headerH, imgW, imgH);

  // Dòng điểm số đỏ đậm sắc nét phía trên (không đóng khung đè lên phiếu)
  const p1CorrectCount = part1Details.filter((d) => d.isCorrect).length;
  const p3CorrectCount = part3Details.filter((d) => d.isCorrect).length;
  const line1Parts = [
    `Tong: ${totalScore.toFixed(2)}`,
    part1Details.length > 0 ? `P1: ${p1CorrectCount}/${part1Details.length}= ${part1Score.toFixed(2)}` : '',
    part3Details.length > 0 ? `P3: ${p3CorrectCount}/${part3Details.length}= ${part3Score.toFixed(2)}` : '',
    hasEssay ? `TL: ${essayScore.toFixed(2)}` : '',
  ].filter(Boolean);

  ctx.fillStyle = '#dc2626';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
  ctx.fillText(line1Parts.join('  |  '), 18, 28);

  if (part2Details.length > 0) {
    const p2Breakdown = part2Details.map((d) => `${d.correctSubCount}/4`).join('; ');
    ctx.fillText(`P2: ${p2Breakdown}= ${part2Score.toFixed(2)}`, 18, 66);
  } else {
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.fillText(`SBD: ${reading.sbd || '?'}  |  Ma de: ${reading.examCode || '?'}`, 18, 66);
  }

  const drawMark = (b: BubblePos, color: string, lineWidth = 4.2) => {
    const pt = mmToWarpedPx(layout, b.xMm, b.yMm);
    const radius = (b.rMm + 0.45) * layout.warpPxPerMm * scale;
    ctx.beginPath();
    ctx.arc(pt.x * scale, headerH + pt.y * scale, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  // Vẽ vòng xanh lá tươi quanh SBD & Mã đề đã nhận diện
  const sbdStr = reading.sbd || '';
  const sbdOffset = Math.max(0, layout.sbdBubbles.length - sbdStr.length);
  layout.sbdBubbles.forEach((col, cIdx) => {
    const digit = sbdStr[cIdx] || (cIdx >= sbdOffset ? '' : '');
    const target = col.find((b) => b.label === digit);
    if (target) drawMark(target, COLOR_CORRECT, 3.6);
  });

  const codeStr = reading.examCode || '';
  layout.examCodeBubbles.forEach((col, cIdx) => {
    const digit = codeStr[cIdx] || '';
    const target = col.find((b) => b.label === digit);
    if (target) drawMark(target, COLOR_CORRECT, 3.6);
  });

  // Phần I: Xanh lá = đúng, Đỏ = sai, Vàng = đáp án đúng
  part1Details.forEach((d, idx) => {
    const row = layout.part1Bubbles[idx];
    if (!row) return;
    if (d.selected) {
      const selIdx = PART1_OPTIONS.indexOf(d.selected);
      if (selIdx >= 0) drawMark(row[selIdx], d.isCorrect ? COLOR_CORRECT : COLOR_WRONG);
    }
    if (!d.isCorrect && d.correct) {
      const corIdx = PART1_OPTIONS.indexOf(d.correct);
      if (corIdx >= 0) drawMark(row[corIdx], COLOR_ANSWER);
    }
  });

  // Phần II: Xanh lá = đúng, Đỏ = sai, Vàng = đáp án đúng
  part2Details.forEach((d, idx) => {
    const q = layout.part2Bubbles[idx];
    if (!q) return;
    q.subItems.forEach((sub) => {
      const sel: Part2Choice = d.selected[sub.key];
      const cor: Part2Choice = d.correct[sub.key];
      const isOk = Boolean(cor && sel === cor);
      if (sel === 'D') drawMark(sub.trueBubble, isOk ? COLOR_CORRECT : COLOR_WRONG);
      if (sel === 'S') drawMark(sub.falseBubble, isOk ? COLOR_CORRECT : COLOR_WRONG);
      if (!isOk && cor) {
        drawMark(cor === 'D' ? sub.trueBubble : sub.falseBubble, COLOR_ANSWER);
      }
    });
  });

  // Phần III: Khoanh màu TỪNG Ô TRÒN theo từng cột ký tự giống Phần I, II
  part3Details.forEach((d, idx) => {
    const qCols = layout.part3Bubbles[idx];
    if (!qCols) return;
    const selStr = (d.selected || '').trim().replace(/\./g, ',');
    const corStr = (d.correct || '').trim().replace(/\./g, ',');

    qCols.forEach((cells, cIdx) => {
      const selChar = selStr[cIdx] || '';
      const corChar = corStr[cIdx] || '';
      const selCell = selChar ? cells.find((c) => c.char === selChar) : undefined;
      const corCell = corChar ? cells.find((c) => c.char === corChar) : undefined;

      if (selCell && corCell && selChar === corChar) {
        drawMark(selCell, COLOR_CORRECT);
      } else {
        if (selCell) drawMark(selCell, d.isCorrect ? COLOR_CORRECT : COLOR_WRONG);
        if (corCell && !d.isCorrect) drawMark(corCell, COLOR_ANSWER);
      }
    });
  });

  return out.toDataURL('image/jpeg', 0.88);
}
