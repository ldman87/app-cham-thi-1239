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

/** Tải file Excel mẫu đáp án (hỗ trợ nhiều mã đề, đủ Phần I, II, III) */
export function downloadAnswerKeyTemplateExcel(exam: Exam): void {
  const rows: Record<string, string | number>[] = [];
  const sampleCode = Object.keys(exam.answerKeys)[0] || '0101';
  const existing = exam.answerKeys[sampleCode];

  for (let i = 0; i < exam.scoring.part1Count; i++) {
    rows.push({
      Phần: 'I',
      Câu: i + 1,
      [sampleCode]: existing?.part1[i] || 'A',
      '0102': 'B',
    });
  }
  for (let i = 0; i < exam.scoring.part2Count; i++) {
    const p2 = existing?.part2[i];
    const p2Str = p2
      ? `${p2.a || 'D'}${p2.b || 'S'}${p2.c || 'D'}${p2.d || 'S'}`
      : 'DSDS';
    rows.push({
      Phần: 'II',
      Câu: i + 1,
      [sampleCode]: p2Str,
      '0102': 'SDDS',
    });
  }
  for (let i = 0; i < exam.scoring.part3Count; i++) {
    rows.push({
      Phần: 'III',
      Câu: i + 1,
      [sampleCode]: existing?.part3[i] || '2025',
      '0102': '-1,5',
    });
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DapAn');
  XLSX.writeFile(wb, `Mau_Dap_An_${exam.subject.replace(/\s+/g, '_')}.xlsx`);
}

/** Nhập nhiều mã đề đáp án từ file Excel */
export async function importAnswerKeysFromExcel(file: File): Promise<Record<string, AnswerKey>> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

  if (rows.length === 0) return {};

  const firstKeys = Object.keys(rows[0]);
  const partCol = firstKeys.find((k) => k.toLowerCase().includes('phần') || k.toLowerCase() === 'phan') || firstKeys[0];
  const qCol = firstKeys.find((k) => k.toLowerCase().includes('câu') || k.toLowerCase() === 'cau') || firstKeys[1];
  const codeCols = firstKeys.filter((k) => k !== partCol && k !== qCol && k.trim() !== '');

  const result: Record<string, AnswerKey> = {};
  for (const rawCode of codeCols) {
    const code = rawCode.trim().padStart(4, '0').slice(-4);
    result[code] = createEmptyAnswerKey(code);
  }

  for (const row of rows) {
    const part = String(row[partCol] || '').trim().toUpperCase();
    const qNum = parseInt(String(row[qCol] || '0'), 10);
    if (!qNum || qNum < 1) continue;

    for (const rawCode of codeCols) {
      const code = rawCode.trim().padStart(4, '0').slice(-4);
      const val = String(row[rawCode] || '').trim();
      const keyObj = result[code];

      if (part === 'I' || part === '1') {
        if (qNum <= 40) {
          const ch = val.toUpperCase();
          keyObj.part1[qNum - 1] = (['A', 'B', 'C', 'D'].includes(ch) ? ch : '') as Part1Choice;
        }
      } else if (part === 'II' || part === '2') {
        if (qNum <= 8) {
          const norm = val
            .toUpperCase()
            .replace(/Đ/g, 'D')
            .replace(/[^DS]/g, '');
          keyObj.part2[qNum - 1] = {
            a: (norm[0] || '') as Part2Choice,
            b: (norm[1] || '') as Part2Choice,
            c: (norm[2] || '') as Part2Choice,
            d: (norm[3] || '') as Part2Choice,
          };
        }
      } else if (part === 'III' || part === '3') {
        if (qNum <= 6) {
          keyObj.part3[qNum - 1] = val.replace('.', ',').slice(0, 4);
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
