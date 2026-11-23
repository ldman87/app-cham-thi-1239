import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  DEFAULT_MATH_2025_SCORING,
  Exam,
  GradedPaper,
  Student,
  createEmptyAnswerKey,
} from '../types';
import { gradeBubbleReading } from '../omr/omrEngine';
import { generateId } from '../utils/id';

interface AppChamThiDB extends DBSchema {
  exams: {
    key: string;
    value: Exam;
  };
  students: {
    key: string;
    value: Student;
    indexes: { 'by-sbd': string };
  };
  papers: {
    key: string;
    value: GradedPaper;
    indexes: { 'by-exam': string };
  };
}

let dbPromise: Promise<IDBPDatabase<AppChamThiDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<AppChamThiDB>('app-cham-thi-1239-db', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('exams')) {
          db.createObjectStore('exams', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('students')) {
          const store = db.createObjectStore('students', { keyPath: 'id' });
          store.createIndex('by-sbd', 'sbd');
        }
        if (!db.objectStoreNames.contains('papers')) {
          const store = db.createObjectStore('papers', { keyPath: 'id' });
          store.createIndex('by-exam', 'examId');
        }
      },
    });
  }
  return dbPromise;
}

/** Bổ sung các trường mới cho dữ liệu kỳ thi cũ (nếu có) */
function normalizeExam(exam: Exam): Exam {
  return {
    ...exam,
    templateType: exam.templateType || 'bgd1239',
    scoring: {
      ...DEFAULT_MATH_2025_SCORING,
      ...exam.scoring,
      part2ScoringMode: exam.scoring?.part2ScoringMode || 'bgd2025',
    },
  };
}

export async function getAllExams(): Promise<Exam[]> {
  const db = await getDb();
  const list = await db.getAll('exams');
  return list.map(normalizeExam).sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveExam(exam: Exam): Promise<void> {
  const db = await getDb();
  await db.put('exams', normalizeExam(exam));
}

export async function deleteExam(examId: string): Promise<void> {
  const db = await getDb();
  await db.delete('exams', examId);
  const papers = await db.getAllFromIndex('papers', 'by-exam', examId);
  const tx = db.transaction('papers', 'readwrite');
  for (const p of papers) {
    await tx.store.delete(p.id);
  }
  await tx.done;
}

/**
 * Tự động tính lại điểm cho TẤT CẢ các bài đã chấm thuộc kỳ thi khi giáo viên sửa đáp án hoặc thang điểm.
 * Giữ nguyên ảnh bài làm đã chấm (overlayImageDataUrl) và điểm tự luận (essayScore).
 */
export async function regradeAllPapersForExam(
  exam: Exam,
  students: Student[]
): Promise<number> {
  const db = await getDb();
  const papers = await db.getAllFromIndex('papers', 'by-exam', exam.id);
  if (papers.length === 0) return 0;

  const tx = db.transaction('papers', 'readwrite');
  for (const oldPaper of papers) {
    const updated = gradeBubbleReading(
      oldPaper.reading,
      exam,
      students,
      undefined,
      oldPaper.essayScore
    );
    updated.id = oldPaper.id;
    updated.gradedAt = oldPaper.gradedAt;
    updated.overlayImageDataUrl = oldPaper.overlayImageDataUrl;
    await tx.store.put(updated);
  }
  await tx.done;
  return papers.length;
}

export async function getAllStudents(): Promise<Student[]> {
  const db = await getDb();
  const list = await db.getAll('students');
  return list.sort((a, b) => a.className.localeCompare(b.className) || a.sbd.localeCompare(b.sbd));
}

export async function saveStudent(student: Student): Promise<void> {
  const db = await getDb();
  await db.put('students', student);
}

export async function saveStudentsBulk(students: Student[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('students', 'readwrite');
  for (const s of students) {
    await tx.store.put(s);
  }
  await tx.done;
}

export async function deleteStudent(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('students', id);
}

export async function clearAllStudents(): Promise<void> {
  const db = await getDb();
  await db.clear('students');
}

export async function getPapersByExam(examId: string): Promise<GradedPaper[]> {
  const db = await getDb();
  const list = await db.getAllFromIndex('papers', 'by-exam', examId);
  return list.sort((a, b) => b.gradedAt - a.gradedAt);
}

export async function savePaper(paper: GradedPaper): Promise<void> {
  const db = await getDb();
  await db.put('papers', paper);
}

export async function deletePaper(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('papers', id);
}

export async function seedInitialDataIfEmpty(): Promise<void> {
  const exams = await getAllExams();
  if (exams.length > 0) return;

  const sampleKey = createEmptyAnswerKey('0101');
  const p1Sample = ['A', 'C', 'B', 'D', 'A', 'B', 'C', 'D', 'B', 'A', 'D', 'C'] as const;
  p1Sample.forEach((ans, i) => {
    sampleKey.part1[i] = ans;
  });
  sampleKey.part2[0] = { a: 'D', b: 'S', c: 'D', d: 'D' };
  sampleKey.part2[1] = { a: 'S', b: 'D', c: 'D', d: 'S' };
  sampleKey.part2[2] = { a: 'D', b: 'D', c: 'S', d: 'D' };
  sampleKey.part2[3] = { a: 'S', b: 'S', c: 'D', d: 'D' };
  sampleKey.part3 = ['2025', '-1,5', '3,25', '12', '-4', '0,75'];

  const sampleExam: Exam = {
    id: 'exam-sample-toan-2025',
    name: 'Kiểm tra Toán THPT 2025 (Mẫu BGD 1239)',
    subject: 'Toán học',
    date: new Date().toISOString().slice(0, 10),
    templateType: 'bgd1239',
    scoring: { ...DEFAULT_MATH_2025_SCORING },
    answerKeys: {
      '0101': sampleKey,
    },
    createdAt: Date.now(),
  };

  await saveExam(sampleExam);

  const existingStudents = await getAllStudents();
  if (existingStudents.length === 0) {
    await saveStudentsBulk([
      { id: generateId(), sbd: '01234567', fullName: 'Nguyễn Minh Anh', className: '12A1' },
      { id: generateId(), sbd: '01234568', fullName: 'Trần Quốc Bảo', className: '12A1' },
      { id: generateId(), sbd: '01234569', fullName: 'Lê Hoàng Gia Hân', className: '12A2' },
    ]);
  }
}
