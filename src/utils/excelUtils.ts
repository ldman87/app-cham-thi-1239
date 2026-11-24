import * as XLSX from 'xlsx';
import { generateId } from './id';
import {
  AnswerKey,
  Exam,
  GradedPaper,
  Part1Choice,
  Part2Choice,
  Student,
  createEmptyAnswerKey,
} from '../types';

/** Tải file Excel mẫu danh sách học sinh */
export function downloadStudentTemplateExcel(): void {
  const rows = [
    { SBD: '01234567', 'Họ và tên': 'Nguyễn Minh Anh', Lớp: '12A1' },
    { SBD: '01234568', 'Họ và tên': 'Trần Quốc Bảo', Lớp: '12A1' },
    { SBD: '01234569', 'Họ và tên': 'Lê Hoàng Gia Hân', Lớp: '12A2' },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'HocSinh');
  XLSX.writeFile(wb, 'Mau_Danh_Sach_Hoc_Sinh.xlsx');
}

/** Đọc danh sách học sinh từ file Excel */
export async function importStudentsFromExcel(file: File): Promise<Student[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  const students: Student[] = [];
  for (const row of rawRows) {
    const keys = Object.keys(row);
    const findVal = (patterns: string[]) => {
      const k = keys.find((key) =>
        patterns.some((p) => key.toLowerCase().normalize('NFC').includes(p))
      );
      return k ? String(row[k]).trim() : '';
    };

    const sbd = findVal(['sbd', 'số báo danh', 'so bao danh', 'mã']);
    const fullName = findVal(['họ và tên', 'ho va ten', 'họ tên', 'tên', 'name']);
    const className = findVal(['lớp', 'lop', 'class']);

    if (sbd || fullName) {
      students.push({
        id: generateId(),
        sbd: sbd.replace(/\s+/g, ''),
        fullName: fullName || '(Chưa có tên)',
        className: className || '',
      });
    }
  }
  return students;
}

/** Tải file Excel mẫu đáp án hỗ trợ nhập NHIỀU mã đề cùng lúc (4 cột mã đề mẫu + hướng dẫn) */
export function downloadAnswerKeyTemplateExcel(exam: Exam): void {
  const existingCodes = Object.keys(exam.answerKeys);
  const sampleCodes = Array.from(
    new Set([...existingCodes, '0101', '0102', '0103', '0104'])
  ).slice(0, Math.max(4, existingCodes.length));

  const rows: Record<string, string | number>[] = [];

  for (let i = 0; i < exam.scoring.part1Count; i++) {
    const row: Record<string, string | number> = { Phần: 'I', Câu: i + 1 };
    sampleCodes.forEach((code, cIdx) => {
      const defaults = ['A', 'B', 'C', 'D'];
      row[code] = exam.answerKeys[code]?.part1[i] || defaults[(i + cIdx) % 4];
    });
    rows.push(row);
  }
  for (let i = 0; i < exam.scoring.part2Count; i++) {
    const row: Record<string, string | number> = { Phần: 'II', Câu: i + 1 };
    sampleCodes.forEach((code, cIdx) => {
      const p2 = exam.answerKeys[code]?.part2[i];
      const p2Str = p2 && (p2.a || p2.b || p2.c || p2.d)
        ? `${p2.a || 'D'}${p2.b || 'S'}${p2.c || 'D'}${p2.d || 'S'}`
        : cIdx % 2 === 0
          ? 'DSDS'
          : 'SDDS';
      row[code] = p2Str;
    });
    rows.push(row);
  }
  for (let i = 0; i < exam.scoring.part3Count; i++) {
    const row: Record<string, string | number> = { Phần: 'III', Câu: i + 1 };
    sampleCodes.forEach((code, cIdx) => {
      row[code] = exam.answerKeys[code]?.part3[i] || (cIdx % 2 === 0 ? '2025' : '-1,5');
    });
    rows.push(row);
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 8 }, ...sampleCodes.map(() => ({ wch: 11 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DapAn');

  // Sheet hướng dẫn nhập nhiều mã đề
  const guideRows = [
    { 'HƯỚNG DẪN NHẬP ĐÁP ÁN NHIỀU MÃ ĐỀ CÙNG LÚC': '1. Mỗi cột từ cột C trở đi là 1 Mã đề thi (VD: 0101, 0102, 0103, 0104, ...). Thầy có thể thêm bao nhiêu cột mã đề tùy thích.' },
    { 'HƯỚNG DẪN NHẬP ĐÁP ÁN NHIỀU MÃ ĐỀ CÙNG LÚC': '2. Phần I: Nhập A, B, C hoặc D.' },
    { 'HƯỚNG DẪN NHẬP ĐÁP ÁN NHIỀU MÃ ĐỀ CÙNG LÚC': '3. Phần II (Đúng/Sai): Nhập 4 chữ cái liên tiếp cho 4 ý a, b, c, d. VD: ĐSĐS hoặc DSDS (Đ = Đúng, S = Sai).' },
    { 'HƯỚNG DẪN NHẬP ĐÁP ÁN NHIỀU MÃ ĐỀ CÙNG LÚC': '4. Phần III (Trả lời ngắn): Nhập số tối đa 4 ký tự (dùng dấu phẩy cho số thập phân, VD: -1,5 hoặc 2025).' },
  ];
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 100 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'HuongDan');

  XLSX.writeFile(wb, `Mau_Dap_An_Nhieu_Ma_De_${exam.subject.replace(/\s+/g, '_')}.xlsx`);
}

/** Chuẩn hóa tên cột thành mã đề 4 chữ số (vd: "Mã đề 101" -> "0101", "0102" -> "0102") */
function parseExamCodeHeader(rawHeader: string): string | null {
  const digits = rawHeader.replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(4, '0').slice(-4);
}

/** Nhập nhiều mã đề đáp án cùng lúc từ file Excel (hỗ trợ nhiều cột mã đề trong 1 sheet hoặc nhiều sheet) */
export async function importAnswerKeysFromExcel(file: File): Promise<Record<string, AnswerKey>> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const result: Record<string, AnswerKey> = {};

  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase().includes('huongdan') || sheetName.toLowerCase().includes('guide')) {
      continue;
    }
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (rows.length === 0) continue;

    const firstKeys = Object.keys(rows[0]);
    const partCol =
      firstKeys.find((k) => {
        const lk = k.toLowerCase().normalize('NFC');
        return lk.includes('phần') || lk === 'phan' || lk === 'part';
      }) || firstKeys[0];
    const qCol =
      firstKeys.find((k) => {
        const lk = k.toLowerCase().normalize('NFC');
        return lk.includes('câu') || lk === 'cau' || lk === 'q' || lk.includes('question');
      }) || firstKeys[1];

    const codeCols = firstKeys
      .filter((k) => k !== partCol && k !== qCol && k.trim() !== '' && !k.startsWith('__EMPTY'))
      .map((rawKey) => ({ rawKey, code: parseExamCodeHeader(rawKey) }))
      .filter((x): x is { rawKey: string; code: string } => Boolean(x.code));

    if (codeCols.length === 0) continue;

    for (const { code } of codeCols) {
      if (!result[code]) result[code] = createEmptyAnswerKey(code);
    }

    for (const row of rows) {
      const part = String(row[partCol] || '').trim().toUpperCase();
      const qNum = parseInt(String(row[qCol] || '0').replace(/\D/g, ''), 10);
      if (!qNum || qNum < 1) continue;

      for (const { rawKey, code } of codeCols) {
        const val = String(row[rawKey] || '').trim();
        const keyObj = result[code];

        if (part === 'I' || part === '1' || part === 'P1' || part === 'PHẦN I') {
          if (qNum <= 40) {
            const ch = val.toUpperCase();
            keyObj.part1[qNum - 1] = (['A', 'B', 'C', 'D'].includes(ch) ? ch : '') as Part1Choice;
          }
        } else if (part === 'II' || part === '2' || part === 'P2' || part === 'PHẦN II') {
          if (qNum <= 8) {
            const norm = val
              .toUpperCase()
              .replace(/Đ/g, 'D')
              .replace(/T/g, 'D')
              .replace(/F/g, 'S')
              .replace(/[^DS]/g, '');
            keyObj.part2[qNum - 1] = {
              a: (norm[0] || '') as Part2Choice,
              b: (norm[1] || '') as Part2Choice,
              c: (norm[2] || '') as Part2Choice,
              d: (norm[3] || '') as Part2Choice,
            };
          }
        } else if (part === 'III' || part === '3' || part === 'P3' || part === 'PHẦN III') {
          if (qNum <= 6) {
            keyObj.part3[qNum - 1] = val.replace('.', ',').slice(0, 4);
          }
        }
      }
    }
  }

  return result;
}

/** Xuất bảng điểm + thống kê từng câu hỏi ra file Excel */
export function exportResultsToExcel(exam: Exam, papers: GradedPaper[]): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Bảng điểm tổng hợp
  const scoreRows = papers.map((p, idx) => {
    const base: Record<string, string | number> = {
      STT: idx + 1,
      SBD: p.sbd,
      'Họ và tên': p.studentName || '',
      Lớp: p.className || '',
      'Mã đề': p.examCode,
      'Điểm Phần I': p.part1Score,
      'Điểm Phần II': p.part2Score,
      'Điểm Phần III': p.part3Score,
    };
    if (exam.scoring.essayMaxScore && exam.scoring.essayMaxScore > 0) {
      base['Điểm Tự luận'] = p.essayScore ?? 0;
    }
    base['Tổng điểm'] = p.totalScore;
    base['Thang điểm'] = p.maxScore;
    base['Thời gian chấm'] = new Date(p.gradedAt).toLocaleString('vi-VN');
    return base;
  });
  const wsScores = XLSX.utils.json_to_sheet(scoreRows);
  wsScores['!cols'] = [
    { wch: 6 },
    { wch: 12 },
    { wch: 25 },
    { wch: 10 },
    { wch: 10 },
    { wch: 13 },
    { wch: 13 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsScores, 'BangDiem');

  // Sheet 2: Thống kê tỷ lệ đúng theo câu
  const statRows: Record<string, string | number>[] = [];
  const totalPapers = papers.length || 1;

  for (let i = 0; i < exam.scoring.part1Count; i++) {
    const correctCount = papers.filter((p) => p.part1Details[i]?.isCorrect).length;
    statRows.push({
      Phần: 'Phần I',
      Câu: `Câu ${i + 1}`,
      'Số bài đúng': correctCount,
      'Tổng bài': papers.length,
      'Tỷ lệ đúng (%)': Number(((correctCount / totalPapers) * 100).toFixed(1)),
    });
  }
  for (let i = 0; i < exam.scoring.part2Count; i++) {
    const fullCorrect = papers.filter((p) => p.part2Details[i]?.correctSubCount === 4).length;
    const avgSub =
      papers.reduce((sum, p) => sum + (p.part2Details[i]?.correctSubCount || 0), 0) / totalPapers;
    statRows.push({
      Phần: 'Phần II',
      Câu: `Câu ${i + 1}`,
      'Số bài đúng': `${fullCorrect} (đúng cả 4 ý; TB ${avgSub.toFixed(2)}/4 ý)`,
      'Tổng bài': papers.length,
      'Tỷ lệ đúng (%)': Number(((avgSub / 4) * 100).toFixed(1)),
    });
  }
  for (let i = 0; i < exam.scoring.part3Count; i++) {
    const correctCount = papers.filter((p) => p.part3Details[i]?.isCorrect).length;
    statRows.push({
      Phần: 'Phần III',
      Câu: `Câu ${i + 1}`,
      'Số bài đúng': correctCount,
      'Tổng bài': papers.length,
      'Tỷ lệ đúng (%)': Number(((correctCount / totalPapers) * 100).toFixed(1)),
    });
  }

  const wsStats = XLSX.utils.json_to_sheet(statRows);
  wsStats['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 34 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsStats, 'ThongKeCauHoi');

  const safeName = exam.name.replace(/[\\/:*?"<>|]/g, '_');
  XLSX.writeFile(wb, `BangDiem_${safeName}.xlsx`);
}
