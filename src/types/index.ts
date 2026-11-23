export type Part1Choice = 'A' | 'B' | 'C' | 'D' | '';
export type Part2Choice = 'D' | 'S' | '';

export interface Part2Answer {
  a: Part2Choice;
  b: Part2Choice;
  c: Part2Choice;
  d: Part2Choice;
}

export interface AnswerKey {
  examCode: string; // 4 chữ số, vd: "0101"
  part1: Part1Choice[]; // Tối đa 40 phần tử
  part2: Part2Answer[]; // Tối đa 8 phần tử
  part3: string[]; // Tối đa 6 phần tử, vd: "-1,5" hoặc "2025"
}

export type Part2ScoringMode = 'bgd2025' | 'equal025';
export type SheetTemplateType = 'bgd1239' | 'custom';

export interface CustomSheetConfig {
  title: string;
  subtitle: string;
  part1Count: number; // 0..40
  part2Count: number; // 0..8
  part3Count: number; // 0..6
  includeEssay: boolean; // Có khung Tự luận trên phiếu hay không
  essayLines: number; // Số dòng kẻ tự luận (mặc định 8-12)
}

export interface ScoringConfig {
  part1Count: number; // Số câu Phần I (0..40)
  part1PointPerQuestion: number; // Điểm mặc định mỗi câu Phần I (vd 0.25)
  part1CustomPoints?: number[]; // Điểm riêng cho từng câu Phần I (nếu giáo viên tùy chỉnh)

  part2Count: number; // Số câu Phần II (0..8)
  part2ScoringMode: Part2ScoringMode; // 'bgd2025' (0.1/0.25/0.5/1.0) | 'equal025' (0.25 mỗi ý)
  part2Points: [number, number, number, number]; // Điểm khi đúng [1, 2, 3, 4] ý
  part2CustomMaxPoints?: number[]; // Hệ số / điểm tối đa riêng cho từng câu Phần II (mặc định 1.0)

  part3Count: number; // Số câu Phần III (0..6)
  part3PointPerQuestion: number; // Điểm mặc định mỗi câu Phần III (vd 0.5)
  part3CustomPoints?: number[]; // Điểm riêng cho từng câu Phần III

  essayMaxScore?: number; // Điểm tối đa Phần Tự luận (0 nếu không có)
}

export interface Exam {
  id: string;
  name: string;
  subject: string;
  date: string;
  templateType: SheetTemplateType;
  customSheet?: CustomSheetConfig;
  scoring: ScoringConfig;
  answerKeys: Record<string, AnswerKey>; // key là examCode (4 chữ số)
  createdAt: number;
}

export interface Student {
  id: string;
  sbd: string; // Số báo danh (tối đa 8 chữ số)
  fullName: string;
  className: string;
}

export interface BubbleReading {
  part1: Part1Choice[];
  part2: Part2Answer[];
  part3: string[];
  sbd: string;
  examCode: string;
}

export interface Part1Detail {
  question: number;
  selected: Part1Choice;
  correct: Part1Choice;
  isCorrect: boolean;
  point: number;
  maxPoint: number;
}

export interface Part2Detail {
  question: number;
  selected: Part2Answer;
  correct: Part2Answer;
  correctSubCount: number;
  point: number;
  maxPoint: number;
}

export interface Part3Detail {
  question: number;
  selected: string;
  correct: string;
  isCorrect: boolean;
  point: number;
  maxPoint: number;
}

export interface GradedPaper {
  id: string;
  examId: string;
  sbd: string;
  examCode: string;
  studentName?: string;
  className?: string;
  totalScore: number;
  maxScore: number;
  part1Score: number;
  part2Score: number;
  part3Score: number;
  essayScore?: number; // Điểm phần Tự luận do giáo viên nhập thêm
  reading: BubbleReading;
  part1Details: Part1Detail[];
  part2Details: Part2Detail[];
  part3Details: Part3Detail[];
  overlayImageDataUrl?: string; // Ảnh bài làm đã vẽ xanh/đỏ
  gradedAt: number;
  warning?: string;
}

export type ScanDisplayMode = 'continuous_total' | 'detail_parts';

export interface ScanSettings {
  displayMode: ScanDisplayMode;
  displaySeconds: number; // 1..5 giây
  scanSpeedSeconds: number; // Tốc độ chấm tự động: 0.5..3.0 giây/lượt
  showResultOnCamera: boolean; // Có hiển thị kết quả trên màn hình khi Quét Camera không
  autoScanCamera: boolean; // Tự động chụp & chấm liên tục khi mở camera
}

export const DEFAULT_MATH_2025_SCORING: ScoringConfig = {
  part1Count: 12,
  part1PointPerQuestion: 0.25,
  part2Count: 4,
  part2ScoringMode: 'bgd2025',
  part2Points: [0.1, 0.25, 0.5, 1.0],
  part3Count: 6,
  part3PointPerQuestion: 0.5,
  essayMaxScore: 0,
};

export const DEFAULT_CUSTOM_SHEET: CustomSheetConfig = {
  title: 'PHIẾU TRẢ LỜI TRẮC NGHIỆM & TỰ LUẬN',
  subtitle: 'Mẫu phiếu cá nhân — Tương thích chấm OMR Offline',
  part1Count: 12,
  part2Count: 4,
  part3Count: 6,
  includeEssay: true,
  essayLines: 8,
};

export function createEmptyAnswerKey(examCode: string): AnswerKey {
  return {
    examCode,
    part1: Array(40).fill('') as Part1Choice[],
    part2: Array.from({ length: 8 }, () => ({ a: '', b: '', c: '', d: '' })),
    part3: Array(6).fill(''),
  };
}

export function getPart1QuestionMaxPoint(scoring: ScoringConfig, qIdx: number): number {
  const custom = scoring.part1CustomPoints?.[qIdx];
  return typeof custom === 'number' && !Number.isNaN(custom) ? custom : scoring.part1PointPerQuestion;
}

export function getPart2QuestionScale(scoring: ScoringConfig, qIdx: number): number {
  const customMax = scoring.part2CustomMaxPoints?.[qIdx];
  const baseMax = scoring.part2ScoringMode === 'equal025' ? 1.0 : scoring.part2Points[3] || 1.0;
  if (typeof customMax === 'number' && !Number.isNaN(customMax) && baseMax > 0) {
    return customMax / baseMax;
  }
  return 1;
}

export function getPart3QuestionMaxPoint(scoring: ScoringConfig, qIdx: number): number {
  const custom = scoring.part3CustomPoints?.[qIdx];
  return typeof custom === 'number' && !Number.isNaN(custom) ? custom : scoring.part3PointPerQuestion;
}

export function calcExamMaxScore(scoring: ScoringConfig): number {
  let total = 0;
  for (let i = 0; i < scoring.part1Count; i++) {
    total += getPart1QuestionMaxPoint(scoring, i);
  }
  const p2BaseMax = scoring.part2ScoringMode === 'equal025' ? 1.0 : scoring.part2Points[3];
  for (let i = 0; i < scoring.part2Count; i++) {
    const customMax = scoring.part2CustomMaxPoints?.[i];
    total += typeof customMax === 'number' && !Number.isNaN(customMax) ? customMax : p2BaseMax;
  }
  for (let i = 0; i < scoring.part3Count; i++) {
    total += getPart3QuestionMaxPoint(scoring, i);
  }
  total += scoring.essayMaxScore || 0;
  return Number(total.toFixed(2));
}
