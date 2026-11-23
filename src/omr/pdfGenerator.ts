import { jsPDF } from 'jspdf';
import { CustomSheetConfig } from '../types';
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
