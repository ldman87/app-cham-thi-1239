import { jsPDF } from 'jspdf';
import { CustomSheetConfig, Exam, GradedPaper } from '../types';
import { renderSheetToCanvas } from './sheetRenderer';

/**
 * Tải trực tiếp file PDF chuẩn gốc của Bộ GD&ĐT (PhieuchamBGD1239.pdf - đầy đủ 2 mặt).
 */
export function downloadOfficialBgd1239Pdf(): void {
  const link = document.createElement('a');
  link.href = '/PhieuchamBGD1239.pdf';
  link.download = 'PhieuchamBGD1239.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Tạo và tải xuống file PDF mẫu phiếu cá nhân tự tạo khổ A4 sắc nét (250 DPI).
 */
export function downloadCustomSheetPdf(config: CustomSheetConfig, fileName?: string): void {
  const canvas = renderSheetToCanvas({
    templateType: 'custom',
    customSheet: config,
    dpi: 250,
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.96);
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
  pdf.save(fileName || 'Phieu_Trac_Nghiem_Ca_Nhan_A4.pdf');
}

/**
 * Xuất 1 file PDF khổ A4 gộp nối tất cả ảnh bài làm đã chấm (toàn kỳ thi hoặc theo từng lớp)
 * để giáo viên gửi cho cả lớp xem bài làm của mình.
 */
export async function exportGradedPapersPdf(
  exam: Exam,
  papers: GradedPaper[],
  classLabel?: string
): Promise<number> {
  const papersWithImage = [...papers]
    .filter((p) => Boolean(p.overlayImageDataUrl))
    .sort((a, b) => {
      const clsCmp = (a.className || '').localeCompare(b.className || '');
      if (clsCmp !== 0) return clsCmp;
      return (a.sbd || '').localeCompare(b.sbd || '');
    });

  if (papersWithImage.length === 0) return 0;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageW = 210;
  const pageH = 297;
  const margin = 8;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2 - 8;

  for (let i = 0; i < papersWithImage.length; i++) {
    const p = papersWithImage[i];
    if (i > 0) pdf.addPage();

    // Đọc tỷ lệ gốc của ảnh để giữ đúng khung hình không bị méo
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 900, h: img.naturalHeight || 1350 });
      img.onerror = () => resolve({ w: 900, h: 1350 });
      img.src = p.overlayImageDataUrl!;
    });

    const imgRatio = dims.w / dims.h;
    let drawW = maxW;
    let drawH = drawW / imgRatio;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * imgRatio;
    }
    const x = (pageW - drawW) / 2;
    const y = margin + 6;

    // Dòng thông tin gọn không dấu ở mép trên trang (tránh lỗi font jsPDF mặc định)
    const cleanText = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');

    pdf.setFontSize(10);
    pdf.setTextColor(60, 60, 60);
    const headerLine = cleanText(
      `STT ${i + 1} | SBD: ${p.sbd} | ${p.studentName || 'Thi sinh'} | Lop: ${p.className || '-'} | Ma de: ${p.examCode} | Diem: ${p.totalScore}/${p.maxScore}`
    );
    pdf.text(headerLine, margin, margin + 2);

    pdf.addImage(p.overlayImageDataUrl!, 'JPEG', x, y, drawW, drawH);
  }

  const safeExam = exam.name.replace(/[\\/:*?"<>|\s]+/g, '_');
  const safeClass = classLabel && classLabel !== 'ALL' ? `_Lop_${classLabel.replace(/[\\/:*?"<>|\s]+/g, '_')}` : '_TatCa';
  pdf.save(`BaiCham_${safeExam}${safeClass}.pdf`);
  return papersWithImage.length;
}
