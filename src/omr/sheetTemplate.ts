import { CustomSheetConfig, DEFAULT_CUSTOM_SHEET, SheetTemplateType } from '../types';

/**
 * Hệ thống tọa độ phiếu chấm:
 * 1. BGD1239: Tọa độ chính xác 0.01 mm trích xuất trực tiếp từ file vector PhieuchamBGD1239.pdf
 *    (MediaBox 208 x 297 mm, 4 ô vuông đen góc 3.79 mm, SBD 8 số, Mã đề 4 số,
 *     Phần I 40 câu, Phần II 1 hàng 4 hộp x 2 câu = 8 câu, Phần III 6 câu).
 * 2. CUSTOM: Sinh tọa độ động theo số câu từng phần + tùy chọn khung Tự luận.
 */

export interface BubblePos {
  xMm: number;
  yMm: number;
  rMm: number;
  label: string;
}

export interface Part2QuestionBubbles {
  questionIndex: number;
  subItems: {
    key: 'a' | 'b' | 'c' | 'd';
    trueBubble: BubblePos;
    falseBubble: BubblePos;
  }[];
}

export interface Part3BubbleCell extends BubblePos {
  char: string;
}

export interface SheetLayout {
  templateType: SheetTemplateType;
  pageWidthMm: number;
  pageHeightMm: number;
  fiducialSizeMm: number;
  fiducials: {
    tl: { x: number; y: number };
    tr: { x: number; y: number };
    br: { x: number; y: number };
    bl: { x: number; y: number };
  };
  workX0Mm: number;
  workY0Mm: number;
  workWMm: number;
  workHMm: number;
  warpedWidth: number;
  warpedHeight: number;
  warpPxPerMm: number;

  sbdBubbles: BubblePos[][]; // [8][10]
  examCodeBubbles: BubblePos[][]; // [4][10]
  part1Bubbles: BubblePos[][]; // [count][4]
  part2Bubbles: Part2QuestionBubbles[]; // [count]
  part3Bubbles: Part3BubbleCell[][][]; // [count][4][cells]

  // Tọa độ khu vực dùng cho renderer của mẫu cá nhân
  customMeta?: {
    config: CustomSheetConfig;
    part1TopMm?: number;
    part1BottomMm?: number;
    part2TopMm?: number;
    part2BottomMm?: number;
    part3TopMm?: number;
    part3BottomMm?: number;
    essayTopMm?: number;
    essayBottomMm?: number;
  };
}

export const PART1_OPTIONS = ['A', 'B', 'C', 'D'] as const;
export const PART2_SUB_KEYS = ['a', 'b', 'c', 'd'] as const;
export const PART3_ROWS = ['-', ',', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function isPart3CellEnabled(colIdx: number, rowChar: string): boolean {
  if (rowChar === '-') return colIdx === 0;
  if (rowChar === ',') return colIdx === 1 || colIdx === 2;
  return true;
}

export function mmToWarpedPx(layout: SheetLayout, xMm: number, yMm: number): { x: number; y: number } {
  return {
    x: (xMm - layout.workX0Mm) * layout.warpPxPerMm,
    y: (yMm - layout.workY0Mm) * layout.warpPxPerMm,
  };
}

// =========================================================================
// 1. MẪU CHUẨN BỘ GD&ĐT (PhieuchamBGD1239.pdf — Chính xác từng 0.01 mm)
// =========================================================================
const BGD_SBD_X = [145.74, 149.74, 153.78, 157.82, 161.86, 165.9, 169.94, 173.94];
const BGD_CODE_X = [182.01, 186.01, 190.03, 194.12];
const BGD_SBD_Y = [33.97, 39.81, 45.65, 51.49, 57.33, 63.17, 69.01, 74.85, 80.69, 86.53];

const BGD_P1_GROUPS_X = [
  [22.57, 30.92, 39.26, 47.51],
  [69.57, 77.92, 86.26, 94.51],
  [116.57, 124.92, 133.26, 141.51],
  [163.57, 171.92, 180.26, 188.51],
];
const BGD_P1_Y = [109.05, 114.05, 119.05, 124.05, 129.05, 134.05, 139.05, 144.05, 149.05, 154.05];

// Phần II: 1 hàng ngang 4 hộp x 2 câu = 8 câu
const BGD_P2_PAIRS_X: [number, number][] = [
  [22.64, 30.85], // Câu 1 (Đ, S)
  [39.24, 47.6], // Câu 2
  [69.42, 77.88], // Câu 3
  [86.17, 94.53], // Câu 4
  [116.52, 124.83], // Câu 5
  [133.27, 141.53], // Câu 6
  [163.42, 171.78], // Câu 7
  [180.07, 188.51], // Câu 8
];
const BGD_P2_Y = [179.38, 184.38, 189.38, 194.38];

// Phần III: 6 câu, mỗi câu 4 cột x 12 hàng
const BGD_P3_GROUPS_X = [
  [21.49, 26.49, 31.49, 36.49],
  [51.49, 56.49, 61.49, 66.49],
  [81.49, 86.49, 91.49, 96.49],
  [111.49, 116.49, 121.49, 126.49],
  [141.49, 146.49, 151.49, 156.49],
  [171.49, 176.49, 181.49, 186.49],
];
const BGD_P3_Y = [
  217.17, 222.74, 228.31, 233.84, 239.46, 245.03,
  250.6, 256.18, 261.75, 267.32, 272.9, 278.47,
];

export function getBgd1239Layout(): SheetLayout {
  const fiducials = {
    tl: { x: 6.69, y: 5.49 },
    tr: { x: 202.45, y: 5.37 },
    br: { x: 202.51, y: 288.05 },
    bl: { x: 6.65, y: 288.06 },
  };
  const workX0Mm = 6.67;
  const workY0Mm = 5.43;
  const workWMm = 202.48 - 6.67; // 195.81 mm
  const workHMm = 288.055 - 5.43; // 282.625 mm
  const warpPxPerMm = 8;

  const sbdBubbles: BubblePos[][] = BGD_SBD_X.map((xMm) =>
    BGD_SBD_Y.map((yMm, d) => ({ xMm, yMm, rMm: 1.39, label: String(d) }))
  );

  const examCodeBubbles: BubblePos[][] = BGD_CODE_X.map((xMm) =>
    BGD_SBD_Y.map((yMm, d) => ({ xMm, yMm, rMm: 1.39, label: String(d) }))
  );

  const part1Bubbles: BubblePos[][] = [];
  for (let q = 0; q < 40; q++) {
    const colGroup = Math.floor(q / 10);
    const rowIdx = q % 10;
    const xs = BGD_P1_GROUPS_X[colGroup];
    const yMm = BGD_P1_Y[rowIdx];
    part1Bubbles.push(
      PART1_OPTIONS.map((opt, oIdx) => ({ xMm: xs[oIdx], yMm, rMm: 1.48, label: opt }))
    );
  }

  const part2Bubbles: Part2QuestionBubbles[] = BGD_P2_PAIRS_X.map(([tx, fx], qIdx) => ({
    questionIndex: qIdx,
    subItems: PART2_SUB_KEYS.map((key, sIdx) => ({
      key,
      trueBubble: { xMm: tx, yMm: BGD_P2_Y[sIdx], rMm: 1.48, label: 'Đ' },
      falseBubble: { xMm: fx, yMm: BGD_P2_Y[sIdx], rMm: 1.48, label: 'S' },
    })),
  }));

  const part3Bubbles: Part3BubbleCell[][][] = BGD_P3_GROUPS_X.map((colXs) =>
    colXs.map((xMm, cIdx) => {
      const cells: Part3BubbleCell[] = [];
      PART3_ROWS.forEach((ch, rIdx) => {
        if (!isPart3CellEnabled(cIdx, ch)) return;
        cells.push({ xMm, yMm: BGD_P3_Y[rIdx], rMm: 1.48, label: ch, char: ch });
      });
      return cells;
    })
  );

  return {
    templateType: 'bgd1239',
    pageWidthMm: 208.0,
    pageHeightMm: 297.0,
    fiducialSizeMm: 3.79,
    fiducials,
    workX0Mm,
    workY0Mm,
    workWMm,
    workHMm,
    warpedWidth: Math.round(workWMm * warpPxPerMm),
    warpedHeight: Math.round(workHMm * warpPxPerMm),
    warpPxPerMm,
    sbdBubbles,
    examCodeBubbles,
    part1Bubbles,
    part2Bubbles,
    part3Bubbles,
  };
}

// =========================================================================
// 2. MẪU PHIẾU CÁ NHÂN TỰ TẠO (Tùy chỉnh số câu + Phần Tự luận)
// =========================================================================
export function buildCustomSheetLayout(config: CustomSheetConfig = DEFAULT_CUSTOM_SHEET): SheetLayout {
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const fiducialSizeMm = 6.0;
  const fiducials = {
    tl: { x: 10, y: 10 },
    tr: { x: 200, y: 10 },
    br: { x: 200, y: 287 },
    bl: { x: 10, y: 287 },
  };
  const workX0Mm = 10;
  const workY0Mm = 10;
  const workWMm = 190;
  const workHMm = 277;
  const warpPxPerMm = 8;

  // SBD (8 cột) & Mã đề (4 cột) gọn gàng ở góc trên phải (y = 33 .. 74 mm)
  const sbdBubbles: BubblePos[][] = Array.from({ length: 8 }, (_, c) =>
    Array.from({ length: 10 }, (_, d) => ({
      xMm: 121 + c * 4.7,
      yMm: 34.5 + d * 4.1,
      rMm: 1.45,
      label: String(d),
    }))
  );
  const examCodeBubbles: BubblePos[][] = Array.from({ length: 4 }, (_, c) =>
    Array.from({ length: 10 }, (_, d) => ({
      xMm: 168 + c * 4.7,
      yMm: 34.5 + d * 4.1,
      rMm: 1.45,
      label: String(d),
    }))
  );

  let cursorY = 78.5;
  const customMeta: NonNullable<SheetLayout['customMeta']> = { config };

  // PHẦN I
  const p1Count = Math.min(40, Math.max(0, config.part1Count));
  const part1Bubbles: BubblePos[][] = [];
  if (p1Count > 0) {
    customMeta.part1TopMm = cursorY;
    const rowsPerCol = p1Count <= 20 ? Math.max(5, Math.ceil(p1Count / 4)) : 10;
    const colStartsX = [17, 62, 107, 152];
    const startY = cursorY + 8.5;
    const stepY = 4.65;
    for (let q = 0; q < p1Count; q++) {
      const colGroup = Math.floor(q / rowsPerCol);
      const rowInCol = q % rowsPerCol;
      const baseX = colStartsX[Math.min(3, colGroup)] + 11.5;
      const yMm = startY + rowInCol * stepY;
      part1Bubbles.push(
        PART1_OPTIONS.map((opt, oIdx) => ({
          xMm: baseX + oIdx * 7.6,
          yMm,
          rMm: 1.55,
          label: opt,
        }))
      );
    }
    cursorY = startY + rowsPerCol * stepY + 2.5;
    customMeta.part1BottomMm = cursorY;
    cursorY += 3.5;
  }

  // PHẦN II (1 hàng ngang tối đa 4 hộp x 2 câu = 8 câu, gọn giống mẫu BGD 1239)
  const p2Count = Math.min(8, Math.max(0, config.part2Count));
  const part2Bubbles: Part2QuestionBubbles[] = [];
  if (p2Count > 0) {
    customMeta.part2TopMm = cursorY;
    const startY = cursorY + 11.5;
    const stepY = 4.65;
    for (let q = 0; q < p2Count; q++) {
      const boxIdx = Math.floor(q / 2);
      const inBox = q % 2;
      const boxX = 16 + boxIdx * 45.5;
      const tx = boxX + (inBox === 0 ? 11.5 : 29.5);
      const fx = boxX + (inBox === 0 ? 19.5 : 37.5);
      part2Bubbles.push({
        questionIndex: q,
        subItems: PART2_SUB_KEYS.map((key, sIdx) => ({
          key,
          trueBubble: { xMm: tx, yMm: startY + sIdx * stepY, rMm: 1.5, label: 'Đ' },
          falseBubble: { xMm: fx, yMm: startY + sIdx * stepY, rMm: 1.5, label: 'S' },
        })),
      });
    }
    cursorY = startY + 4 * stepY + 2.0;
    customMeta.part2BottomMm = cursorY;
    cursorY += 3.5;
  }

  // PHẦN III (tối đa 6 câu)
  const p3Count = Math.min(6, Math.max(0, config.part3Count));
  const part3Bubbles: Part3BubbleCell[][][] = [];
  if (p3Count > 0) {
    customMeta.part3TopMm = cursorY;
    const startY = cursorY + 9.0;
    const stepY = config.includeEssay ? 4.2 : 4.8;
    for (let q = 0; q < p3Count; q++) {
      const baseX = 21 + q * 30;
      const cols: Part3BubbleCell[][] = [];
      for (let c = 0; c < 4; c++) {
        const cells: Part3BubbleCell[] = [];
        PART3_ROWS.forEach((ch, rIdx) => {
          if (!isPart3CellEnabled(c, ch)) return;
          cells.push({
            xMm: baseX + c * 4.9,
            yMm: startY + rIdx * stepY,
            rMm: 1.4,
            label: ch,
            char: ch,
          });
        });
        cols.push(cells);
      }
      part3Bubbles.push(cols);
    }
    cursorY = startY + 12 * stepY + 1.5;
    customMeta.part3BottomMm = cursorY;
    cursorY += 3.5;
  }

  // PHẦN IV: TỰ LUẬN (nếu bật và còn khoảng trống trên trang A4)
  if (config.includeEssay && cursorY < 274) {
    customMeta.essayTopMm = cursorY;
    customMeta.essayBottomMm = 280;
  }

  return {
    templateType: 'custom',
    pageWidthMm,
    pageHeightMm,
    fiducialSizeMm,
    fiducials,
    workX0Mm,
    workY0Mm,
    workWMm,
    workHMm,
    warpedWidth: Math.round(workWMm * warpPxPerMm),
    warpedHeight: Math.round(workHMm * warpPxPerMm),
    warpPxPerMm,
    sbdBubbles,
    examCodeBubbles,
    part1Bubbles,
    part2Bubbles,
    part3Bubbles,
    customMeta,
  };
}

export function getLayoutForExam(
  templateType: SheetTemplateType = 'bgd1239',
  customSheet?: CustomSheetConfig
): SheetLayout {
  if (templateType === 'custom') {
    return buildCustomSheetLayout(customSheet || DEFAULT_CUSTOM_SHEET);
  }
  return getBgd1239Layout();
}
