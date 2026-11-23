import { BubbleReading, CustomSheetConfig, SheetTemplateType } from '../types';
import {
  PART1_OPTIONS,
  PART3_ROWS,
  SheetLayout,
  getLayoutForExam,
} from './sheetTemplate';

export interface RenderSheetOptions {
  templateType?: SheetTemplateType;
  customSheet?: CustomSheetConfig;
  dpi?: number;
  filledData?: BubbleReading;
}

/**
 * Vẽ mẫu phiếu lên Canvas theo đúng SheetLayout:
 * - Nếu templateType === 'bgd1239': Vẽ chuẩn xác bố cục & tọa độ của PhieuchamBGD1239.pdf
 *   (dùng cho chế độ Test Demo OMR và xem trước).
 * - Nếu templateType === 'custom': Vẽ mẫu phiếu cá nhân (tùy chỉnh số câu + Phần Tự luận)
 *   để xuất PDF A4 250 DPI và chấm OMR đồng bộ 100%.
 */
export function renderSheetToCanvas(options: RenderSheetOptions = {}): HTMLCanvasElement {
  const layout = getLayoutForExam(options.templateType || 'bgd1239', options.customSheet);
  const dpi = options.dpi ?? 150;
  const pxPerMm = dpi / 25.4;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(layout.pageWidthMm * pxPerMm);
  canvas.height = Math.round(layout.pageHeightMm * pxPerMm);
  const ctx = canvas.getContext('2d')!;
  const mm = (v: number) => v * pxPerMm;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 1. Vẽ 4 ô vuông đen định vị ở 4 góc
  ctx.fillStyle = '#000000';
  Object.values(layout.fiducials).forEach((pt) => {
    const half = layout.fiducialSizeMm / 2;
    ctx.fillRect(mm(pt.x - half), mm(pt.y - half), mm(layout.fiducialSizeMm), mm(layout.fiducialSizeMm));
  });

  // Helper vẽ ô tròn
  const drawBubble = (xMm: number, yMm: number, rMm: number, label: string, filled = false, showLabel = true) => {
    ctx.beginPath();
    ctx.arc(mm(xMm), mm(yMm), mm(rMm), 0, Math.PI * 2);
    if (filled) {
      ctx.fillStyle = '#111827';
      ctx.fill();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = mm(0.28);
      ctx.stroke();
      if (showLabel && label) {
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `500 ${mm(rMm * 1.1)}px "Segoe UI", Arial, sans-serif`;
        ctx.fillText(label, mm(xMm), mm(yMm + 0.08));
      }
    }
  };

  if (layout.templateType === 'bgd1239') {
    renderBgd1239Body(ctx, layout, mm, drawBubble, options.filledData);
  } else {
    renderCustomBody(ctx, layout, mm, drawBubble, options.filledData);
  }

  return canvas;
}

function renderBgd1239Body(
  ctx: CanvasRenderingContext2D,
  layout: SheetLayout,
  mm: (v: number) => number,
  drawBubble: (x: number, y: number, r: number, label: string, filled?: boolean, showLabel?: boolean) => void,
  filledData?: BubbleReading
) {
  // 6 ô vuông biên chuẩn BGD 1239
  ctx.fillStyle = '#000000';
  const sideSquares = [
    [6.99, 96.42], [202.45, 96.42],
    [6.99, 161.26], [202.51, 161.26],
    [6.65, 202.76], [202.51, 202.76],
  ];
  sideSquares.forEach(([x, y]) => {
    const h = 3.79 / 2;
    ctx.fillRect(mm(x - h), mm(y - h), mm(3.79), mm(3.79));
  });

  // Tiêu đề
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${mm(4.5)}px "Times New Roman", Georgia, serif`;
  ctx.fillText('PHIẾU TRẢ LỜI TRẮC NGHIỆM', mm(96), mm(9.5));

  ctx.font = `${mm(3.0)}px "Times New Roman", Georgia, serif`;
  ctx.fillText('Kỳ thi: ..........................................................', mm(96), mm(16));
  ctx.textAlign = 'left';
  ctx.fillText('Môn thi: ................................................  Ngày thi: ....../....../ 20......', mm(8.5), mm(22.5));

  // Khung Giám thị 1 & 2 + Mục 1..6
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = mm(0.3);
  ctx.strokeRect(mm(8.5), mm(27), mm(45.5), mm(57));
  ctx.beginPath();
  ctx.moveTo(mm(8.5), mm(55.5));
  ctx.lineTo(mm(54), mm(55.5));
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `${mm(2.8)}px "Times New Roman", serif`;
  ctx.fillText('Họ tên, chữ ký', mm(31.2), mm(31));
  ctx.fillText('của Giám thị 1', mm(31.2), mm(34.5));
  ctx.fillText('Họ tên, chữ ký', mm(31.2), mm(59.5));
  ctx.fillText('của Giám thị 2', mm(31.2), mm(63));

  ctx.strokeRect(mm(56), mm(27), mm(82), mm(57));
  ctx.textAlign = 'left';
  const infoItems = [
    '1. Hội đồng thi: ................................................',
    '2. Điểm thi: ......................................................',
    '3. Phòng thi số: ...............................................',
    '4. Họ và tên thí sinh: ......................................',
    '5. Ngày sinh: ....../....../........ (Nam/ Nữ).',
    '6. Chữ ký của thí sinh: ..................................',
  ];
  infoItems.forEach((line, i) => {
    ctx.fillText(line, mm(58), mm(33 + i * 9.2));
  });

  // 7. Số báo danh & 8. Mã đề thi
  ctx.textAlign = 'center';
  ctx.font = `${mm(2.7)}px "Times New Roman", serif`;
  ctx.fillText('7. Số báo danh', mm(159.8), mm(17.5));
  ctx.fillText('8. Mã đề thi', mm(188.0), mm(17.5));

  const sbdStr = (filledData?.sbd || '').padStart(8, ' ');
  layout.sbdBubbles.forEach((col, cIdx) => {
    const cx = col[0].xMm;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = mm(0.28);
    ctx.strokeRect(mm(cx - 2.0), mm(21.5), mm(4.0), mm(6.0));
    if (filledData?.sbd && sbdStr[cIdx]?.trim()) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${mm(3.0)}px Arial, sans-serif`;
      ctx.fillText(sbdStr[cIdx], mm(cx), mm(24.5));
    }
    col.forEach((b) => drawBubble(b.xMm, b.yMm, b.rMm, b.label, sbdStr[cIdx] === b.label, true));
  });

  const codeStr = (filledData?.examCode || '').padStart(4, ' ');
  layout.examCodeBubbles.forEach((col, cIdx) => {
    const cx = col[0].xMm;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = mm(0.28);
    ctx.strokeRect(mm(cx - 2.0), mm(21.5), mm(4.0), mm(6.0));
    if (filledData?.examCode && codeStr[cIdx]?.trim()) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${mm(3.0)}px Arial, sans-serif`;
      ctx.fillText(codeStr[cIdx], mm(cx), mm(24.5));
    }
    col.forEach((b) => drawBubble(b.xMm, b.yMm, b.rMm, b.label, codeStr[cIdx] === b.label, true));
  });

  // PHẦN I
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.font = `bold ${mm(3.2)}px "Times New Roman", serif`;
  ctx.fillText('PHẦN I', mm(11.5), mm(97.5));

  [12, 59, 106, 153].forEach((bx, gIdx) => {
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = mm(0.28);
    ctx.strokeRect(mm(bx), mm(101), mm(40.5), mm(56.5));
    const sampleRow = layout.part1Bubbles[gIdx * 10];
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.font = `${mm(2.2)}px Arial, sans-serif`;
    sampleRow.forEach((b, oIdx) => {
      ctx.fillText(PART1_OPTIONS[oIdx], mm(b.xMm), mm(104.2));
    });
  });

  layout.part1Bubbles.forEach((row, qIdx) => {
    const colGroup = Math.floor(qIdx / 10);
    const numX = [17.5, 64.5, 111.5, 158.5][colGroup];
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'right';
    ctx.font = `bold ${mm(2.5)}px "Times New Roman", serif`;
    ctx.fillText(String(qIdx + 1), mm(numX), mm(row[0].yMm + 0.1));

    const chosen = filledData?.part1[qIdx] || '';
    row.forEach((b) => drawBubble(b.xMm, b.yMm, b.rMm, '', chosen === b.label, false));
  });

  // PHẦN II (4 hộp x 2 câu)
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.font = `bold ${mm(3.2)}px "Times New Roman", serif`;
  ctx.fillText('PHẦN II', mm(11.5), mm(162));

  [12, 59, 106, 153].forEach((bx) => {
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = mm(0.28);
    ctx.strokeRect(mm(bx), mm(165), mm(40.5), mm(33));
  });

  layout.part2Bubbles.forEach((q) => {
    const midX = (q.subItems[0].trueBubble.xMm + q.subItems[0].falseBubble.xMm) / 2;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.font = `bold ${mm(2.6)}px "Times New Roman", serif`;
    ctx.fillText(`Câu ${q.questionIndex + 1}`, mm(midX), mm(169));
    ctx.font = `${mm(2.3)}px "Times New Roman", serif`;
    ctx.fillText('Đúng', mm(q.subItems[0].trueBubble.xMm), mm(173.8));
    ctx.fillText('Sai', mm(q.subItems[0].falseBubble.xMm), mm(173.8));

    const filledQ = filledData?.part2[q.questionIndex];
    q.subItems.forEach((sub) => {
      if (q.questionIndex % 2 === 0) {
        ctx.fillStyle = '#0f172a';
        ctx.textAlign = 'right';
        ctx.font = `${mm(2.5)}px "Times New Roman", serif`;
        ctx.fillText(`${sub.key})`, mm(sub.trueBubble.xMm - 4.2), mm(sub.trueBubble.yMm + 0.1));
      }
      const ch = filledQ ? filledQ[sub.key] : '';
      drawBubble(sub.trueBubble.xMm, sub.trueBubble.yMm, sub.trueBubble.rMm, '', ch === 'D', false);
      drawBubble(sub.falseBubble.xMm, sub.falseBubble.yMm, sub.falseBubble.rMm, '', ch === 'S', false);
    });
  });

  // PHẦN III (6 câu)
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.font = `bold ${mm(3.2)}px "Times New Roman", serif`;
  ctx.fillText('PHẦN III', mm(11.5), mm(203.5));

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = mm(0.28);
  ctx.strokeRect(mm(12), mm(206.5), mm(180.5), mm(75.5));

  layout.part3Bubbles.forEach((qCols, qIdx) => {
    const boxX = 12 + qIdx * 30;
    if (qIdx > 0) {
      ctx.beginPath();
      ctx.moveTo(mm(boxX), mm(206.5));
      ctx.lineTo(mm(boxX), mm(282));
      ctx.stroke();
    }
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.font = `bold ${mm(2.6)}px "Times New Roman", serif`;
    ctx.fillText(`Câu ${qIdx + 1}`, mm(boxX + 4), mm(211.5));

    // Nhãn hàng - , 0..9
    const ansStr = (filledData?.part3[qIdx] || '').trim().replace('.', ',');
    PART3_ROWS.forEach((ch, rIdx) => {
      const yRow = qCols[0][0].yMm + rIdx * 5.573;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'right';
      ctx.font = `bold ${mm(2.6)}px "Times New Roman", serif`;
      ctx.fillText(ch, mm(boxX + 6.5), mm(yRow + 0.1));
    });

    qCols.forEach((cells, cIdx) => {
      const target = ansStr[cIdx] || '';
      cells.forEach((cell) => drawBubble(cell.xMm, cell.yMm, cell.rMm, '', target === cell.char, false));
    });
  });
}

function renderCustomBody(
  ctx: CanvasRenderingContext2D,
  layout: SheetLayout,
  mm: (v: number) => number,
  drawBubble: (x: number, y: number, r: number, label: string, filled?: boolean, showLabel?: boolean) => void,
  filledData?: BubbleReading
) {
  const meta = layout.customMeta!;
  const cfg = meta.config;

  // Tiêu đề
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${mm(4.3)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(cfg.title || 'PHIẾU TRẢ LỜI TRẮC NGHIỆM', mm(105), mm(11));

  ctx.fillStyle = '#334155';
  ctx.font = `600 ${mm(2.5)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText(cfg.subtitle || 'Mẫu phiếu cá nhân tự tạo', mm(105), mm(16));

  // Thông tin thí sinh (trái)
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = mm(0.3);
  ctx.strokeRect(mm(16), mm(21), mm(98), mm(54));
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'left';
  ctx.font = `${mm(2.7)}px "Segoe UI", Arial, sans-serif`;
  [
    'Kỳ thi: .....................................................................',
    'Môn thi: .............................. Ngày: ...../...../20....',
    'Họ và tên: ...............................................................',
    'Lớp: ........................ Phòng thi: .............................',
    'Điểm TN: .............  Điểm TL: .............  Tổng: .........',
  ].forEach((line, i) => ctx.fillText(line, mm(18.5), mm(27.5 + i * 9.6)));

  // SBD (8 số) & Mã đề (4 số)
  ctx.strokeRect(mm(117), mm(21), mm(44), mm(54));
  ctx.strokeRect(mm(164), mm(21), mm(28), mm(54));
  ctx.textAlign = 'center';
  ctx.font = `bold ${mm(2.5)}px "Segoe UI", Arial, sans-serif`;
  ctx.fillText('SỐ BÁO DANH', mm(139), mm(24));
  ctx.fillText('MÃ ĐỀ', mm(178), mm(24));

  const sbdStr = (filledData?.sbd || '').padStart(8, ' ');
  layout.sbdBubbles.forEach((col, cIdx) => {
    const cx = col[0].xMm;
    ctx.strokeRect(mm(cx - 1.9), mm(26.5), mm(3.8), mm(4.8));
    if (filledData?.sbd && sbdStr[cIdx]?.trim()) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${mm(2.8)}px Arial, sans-serif`;
      ctx.fillText(sbdStr[cIdx], mm(cx), mm(29));
    }
    col.forEach((b) => drawBubble(b.xMm, b.yMm, b.rMm, b.label, sbdStr[cIdx] === b.label, true));
  });

  const codeStr = (filledData?.examCode || '').padStart(4, ' ');
  layout.examCodeBubbles.forEach((col, cIdx) => {
    const cx = col[0].xMm;
    ctx.strokeRect(mm(cx - 1.9), mm(26.5), mm(3.8), mm(4.8));
    if (filledData?.examCode && codeStr[cIdx]?.trim()) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold ${mm(2.8)}px Arial, sans-serif`;
      ctx.fillText(codeStr[cIdx], mm(cx), mm(29));
    }
    col.forEach((b) => drawBubble(b.xMm, b.yMm, b.rMm, b.label, codeStr[cIdx] === b.label, true));
  });

  // PHẦN I
  if (layout.part1Bubbles.length > 0 && meta.part1TopMm !== undefined && meta.part1BottomMm !== undefined) {
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.font = `bold ${mm(2.8)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(`PHẦN I. Trắc nghiệm nhiều lựa chọn (${layout.part1Bubbles.length} câu)`, mm(16), mm(meta.part1TopMm + 1.5));
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(mm(16), mm(meta.part1TopMm + 4), mm(176), mm(meta.part1BottomMm - meta.part1TopMm - 4));

    layout.part1Bubbles.forEach((row, qIdx) => {
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'right';
      ctx.font = `bold ${mm(2.4)}px "Segoe UI", Arial, sans-serif`;
      ctx.fillText(String(qIdx + 1), mm(row[0].xMm - 4.5), mm(row[0].yMm + 0.1));
      const chosen = filledData?.part1[qIdx] || '';
      row.forEach((b) => drawBubble(b.xMm, b.yMm, b.rMm, b.label, chosen === b.label, true));
    });
  }

  // PHẦN II
  if (layout.part2Bubbles.length > 0 && meta.part2TopMm !== undefined && meta.part2BottomMm !== undefined) {
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.font = `bold ${mm(2.8)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(`PHẦN II. Trắc nghiệm Đúng / Sai (${layout.part2Bubbles.length} câu)`, mm(16), mm(meta.part2TopMm + 1.5));
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(mm(16), mm(meta.part2TopMm + 4), mm(176), mm(meta.part2BottomMm - meta.part2TopMm - 4));

    layout.part2Bubbles.forEach((q) => {
      const midX = (q.subItems[0].trueBubble.xMm + q.subItems[0].falseBubble.xMm) / 2;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.font = `bold ${mm(2.4)}px "Segoe UI", Arial, sans-serif`;
      ctx.fillText(`Câu ${q.questionIndex + 1}`, mm(midX), mm(meta.part2TopMm! + 6.5));
      ctx.font = `${mm(2.1)}px "Segoe UI", Arial, sans-serif`;
      ctx.fillText('Đ', mm(q.subItems[0].trueBubble.xMm), mm(meta.part2TopMm! + 9.0));
      ctx.fillText('S', mm(q.subItems[0].falseBubble.xMm), mm(meta.part2TopMm! + 9.0));

      const filledQ = filledData?.part2[q.questionIndex];
      q.subItems.forEach((sub) => {
        if (q.questionIndex % 2 === 0) {
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'right';
          ctx.font = `600 ${mm(2.3)}px "Segoe UI", Arial, sans-serif`;
          ctx.fillText(`${sub.key})`, mm(sub.trueBubble.xMm - 4.0), mm(sub.trueBubble.yMm + 0.1));
        }
        const ch = filledQ ? filledQ[sub.key] : '';
        drawBubble(sub.trueBubble.xMm, sub.trueBubble.yMm, sub.trueBubble.rMm, 'Đ', ch === 'D', true);
        drawBubble(sub.falseBubble.xMm, sub.falseBubble.yMm, sub.falseBubble.rMm, 'S', ch === 'S', true);
      });
    });
  }

  // PHẦN III
  if (layout.part3Bubbles.length > 0 && meta.part3TopMm !== undefined && meta.part3BottomMm !== undefined) {
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.font = `bold ${mm(2.8)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText(`PHẦN III. Trả lời ngắn (${layout.part3Bubbles.length} câu — tô từ trái sang phải)`, mm(16), mm(meta.part3TopMm + 1.5));
    ctx.strokeStyle = '#334155';
    ctx.strokeRect(mm(16), mm(meta.part3TopMm + 4), mm(176), mm(meta.part3BottomMm - meta.part3TopMm - 4));

    layout.part3Bubbles.forEach((qCols, qIdx) => {
      const firstX = qCols[0][0].xMm;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.font = `bold ${mm(2.4)}px "Segoe UI", Arial, sans-serif`;
      ctx.fillText(`Câu ${qIdx + 1}`, mm(firstX - 3), mm(meta.part3TopMm! + 6.5));

      const ansStr = (filledData?.part3[qIdx] || '').trim().replace('.', ',');
      qCols.forEach((cells, cIdx) => {
        const target = ansStr[cIdx] || '';
        cells.forEach((cell) => drawBubble(cell.xMm, cell.yMm, cell.rMm, cell.label, target === cell.char, true));
      });
    });
  }

  // PHẦN IV: TỰ LUẬN
  if (cfg.includeEssay && meta.essayTopMm !== undefined && meta.essayBottomMm !== undefined) {
    const top = meta.essayTopMm;
    const bottom = meta.essayBottomMm;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.font = `bold ${mm(2.8)}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText('PHẦN IV. TỰ LUẬN (Học sinh làm bài vào khung dưới đây)', mm(16), mm(top + 1.5));

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = mm(0.3);
    ctx.strokeRect(mm(16), mm(top + 4), mm(176), mm(bottom - top - 4));

    const availH = bottom - top - 8;
    const lines = Math.max(3, Math.min(cfg.essayLines || 8, Math.floor(availH / 6.2)));
    const step = availH / lines;
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = mm(0.22);
    for (let i = 1; i <= lines; i++) {
      const ly = top + 4 + i * step;
      ctx.beginPath();
      ctx.moveTo(mm(18), mm(ly));
      ctx.lineTo(mm(190), mm(ly));
      ctx.stroke();
    }
  }
}
