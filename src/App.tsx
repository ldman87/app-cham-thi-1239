import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Camera,
  ClipboardList,
  FileText,
  Languages,
  Moon,
  Sun,
  Users,
  WifiOff,
} from 'lucide-react';
import { Exam, GradedPaper, ScanSettings, Student } from './types';
import { Language, TRANSLATIONS } from './i18n/translations';
import {
  clearAllStudents,
  deleteExam,
  deletePaper,
  deleteStudent,
  getAllExams,
  getAllStudents,
  getPapersByExam,
  regradeAllPapersForExam,
  saveExam,
  savePaper,
  saveStudent,
  saveStudentsBulk,
  seedInitialDataIfEmpty,
} from './db/database';
import { ExamsTab } from './components/ExamsTab';
import { ScannerTab } from './components/ScannerTab';
import { StudentsTab } from './components/StudentsTab';
import { StatsTab } from './components/StatsTab';
import { SheetTab } from './components/SheetTab';

type TabKey = 'exams' | 'scan' | 'students' | 'stats' | 'sheet';

const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  displayMode: 'detail_parts',
  displaySeconds: 2,
  scanSpeedSeconds: 1.5,
  showResultOnCamera: true,
  autoScanCamera: false,
};

export function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('scan');
  const [exams, setExams] = useState<Exam[]>([]);
  const [activeExamId, setActiveExamId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [papers, setPapers] = useState<GradedPaper[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [loading, setLoading] = useState(true);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('app-cham-thi-theme') === 'dark';
  });

  const [lang, setLang] = useState<Language>(() => {
    return localStorage.getItem('app-cham-thi-lang') === 'en' ? 'en' : 'vi';
  });

  const [scanSettings, setScanSettings] = useState<ScanSettings>(() => {
    try {
      const saved = localStorage.getItem('app-cham-thi-scan-settings');
      if (saved) {
        return { ...DEFAULT_SCAN_SETTINGS, ...(JSON.parse(saved) as Partial<ScanSettings>) };
      }
    } catch {
      // ignore
    }
    return DEFAULT_SCAN_SETTINGS;
  });

  const t = TRANSLATIONS[lang];

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('app-cham-thi-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('app-cham-thi-lang', lang);
  }, [lang]);

  const handleUpdateScanSettings = (next: ScanSettings) => {
    setScanSettings(next);
    localStorage.setItem('app-cham-thi-scan-settings', JSON.stringify(next));
  };

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const refreshBase = async () => {
    try {
      await seedInitialDataIfEmpty();
      const [examList, studentList] = await Promise.all([getAllExams(), getAllStudents()]);
      setExams(examList);
      setStudents(studentList);
      setActiveExamId((prev) => {
        if (prev && examList.some((e) => e.id === prev)) return prev;
        return examList[0]?.id ?? null;
      });
    } catch (err) {
      console.error('Lỗi khởi tạo dữ liệu:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshBase();
  }, []);

  useEffect(() => {
    if (!activeExamId) {
      setPapers([]);
      return;
    }
    getPapersByExam(activeExamId).then(setPapers);
  }, [activeExamId]);

  const activeExam = exams.find((e) => e.id === activeExamId) ?? null;

  const handleSaveExam = async (exam: Exam, regradePapers = false): Promise<number> => {
    await saveExam(exam);
    let updatedCount = 0;
    if (regradePapers) {
      updatedCount = await regradeAllPapersForExam(exam, students);
    }
    const list = await getAllExams();
    setExams(list);
    if (activeExamId === exam.id) {
      setPapers(await getPapersByExam(exam.id));
    }
    return updatedCount;
  };

  const handleQuickCreateCustomExam = async (exam: Exam) => {
    await saveExam(exam);
    const list = await getAllExams();
    setExams(list);
    setActiveExamId(exam.id);
    setActiveTab('exams');
  };

  const handleDeleteExam = async (id: string) => {
    await deleteExam(id);
    const list = await getAllExams();
    setExams(list);
    if (activeExamId === id) {
      setActiveExamId(list[0]?.id ?? null);
    }
  };

  const handleSaveStudent = async (s: Student) => {
    await saveStudent(s);
    setStudents(await getAllStudents());
  };

  const handleSaveStudentsBulk = async (list: Student[]) => {
    await saveStudentsBulk(list);
    setStudents(await getAllStudents());
  };

  const handleDeleteStudent = async (id: string) => {
    await deleteStudent(id);
    setStudents(await getAllStudents());
  };

  const handleClearStudents = async () => {
    await clearAllStudents();
    setStudents([]);
  };

  const handleSavePaper = async (paper: GradedPaper) => {
    await savePaper(paper);
    if (activeExamId) {
      setPapers(await getPapersByExam(activeExamId));
    }
  };

  const handleDeletePaper = async (id: string) => {
    await deletePaper(id);
    if (activeExamId) {
      setPapers(await getPapersByExam(activeExamId));
    }
  };

  const navItems: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'exams', label: t.navExams, icon: <ClipboardList className="w-5 h-5" /> },
    { key: 'scan', label: t.navScan, icon: <Camera className="w-5 h-5" /> },
    { key: 'students', label: t.navStudents, icon: <Users className="w-5 h-5" /> },
    { key: 'stats', label: t.navStats, icon: <BarChart3 className="w-5 h-5" /> },
    { key: 'sheet', label: t.navSheet, icon: <FileText className="w-5 h-5" /> },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors">
      {/* SIDEBAR TRÁI CHO MÁY TÍNH BẢNG & LAPTOP (>= md) */}
      <aside className="hidden md:flex md:flex-col md:w-60 lg:w-64 md:fixed md:inset-y-0 bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 z-30">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
          <img src="/icon.svg" alt="Logo" className="w-9 h-9 rounded-xl shadow-sm shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
              {t.appName}
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{t.authorSub}</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/70'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-700 space-y-2">
          {isOffline && (
            <div className="flex items-center justify-center gap-1.5 text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-3 py-1.5 rounded-xl">
              <WifiOff className="w-3.5 h-3.5" /> {t.runningOffline}
            </div>
          )}

          {/* Chuyển ngôn ngữ VI / EN */}
          <button
            onClick={() => setLang((l) => (l === 'vi' ? 'en' : 'vi'))}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-semibold py-2 rounded-xl transition"
          >
            <Languages className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            {lang === 'vi' ? 'Ngôn ngữ: Tiếng Việt' : 'Language: English'}
          </button>

          {/* Chuyển Sáng / Tối */}
          <button
            onClick={() => setDarkMode((v) => !v)}
            className="w-full flex items-center justify-center gap-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 text-xs font-semibold py-2 rounded-xl transition"
          >
            {darkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
            {darkMode ? t.lightMode : t.darkMode}
          </button>
        </div>
      </aside>

      {/* HEADER TRÊN CÙNG CHO ĐIỆN THOẠI (< md) */}
      <header className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-b border-slate-200 dark:border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/icon.svg" alt="Logo" className="w-8 h-8 rounded-lg shadow-sm shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                {t.appName}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{t.authorSub}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isOffline && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300 px-2 py-1 rounded-full">
                <WifiOff className="w-3 h-3" /> {t.offline}
              </span>
            )}
            <button
              onClick={() => setLang((l) => (l === 'vi' ? 'en' : 'vi'))}
              className="px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-[11px] font-extrabold"
              title="VI / EN"
            >
              {lang === 'vi' ? 'VI' : 'EN'}
            </button>
            <button
              onClick={() => setDarkMode((v) => !v)}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-amber-300"
              title={darkMode ? t.lightMode : t.darkMode}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* NỘI DUNG CHÍNH */}
      <main className="flex-1 md:pl-60 lg:pl-64 w-full">
        <div className="max-w-6xl mx-auto px-4 md:px-6 lg:px-8 pt-4 md:pt-6 pb-24 md:pb-10">
          {loading ? (
            <div className="text-center py-16 text-sm text-slate-500 dark:text-slate-400">
              {t.loading}
            </div>
          ) : (
            <>
              {activeTab === 'exams' && (
                <ExamsTab
                  t={t}
                  exams={exams}
                  activeExamId={activeExamId}
                  onSelectExam={(id) => setActiveExamId(id)}
                  onSaveExam={handleSaveExam}
                  onDeleteExam={handleDeleteExam}
                />
              )}
              {activeTab === 'scan' && (
                <ScannerTab
                  t={t}
                  exams={exams}
                  exam={activeExam}
                  onSelectExam={(id) => setActiveExamId(id)}
                  students={students}
                  papers={papers}
                  scanSettings={scanSettings}
                  onUpdateScanSettings={handleUpdateScanSettings}
                  onSavePaper={handleSavePaper}
                  onDeletePaper={handleDeletePaper}
                />
              )}
              {activeTab === 'students' && (
                <StudentsTab
                  t={t}
                  students={students}
                  onSaveStudent={handleSaveStudent}
                  onSaveStudentsBulk={handleSaveStudentsBulk}
                  onDeleteStudent={handleDeleteStudent}
                  onClearAll={handleClearStudents}
                />
              )}
              {activeTab === 'stats' && (
                <StatsTab
                  t={t}
                  exams={exams}
                  exam={activeExam}
                  onSelectExam={(id) => setActiveExamId(id)}
                  papers={papers}
                />
              )}
              {activeTab === 'sheet' && (
                <SheetTab t={t} onQuickCreateCustomExam={handleQuickCreateCustomExam} />
              )}
            </>
          )}
        </div>
      </main>

      {/* THANH ĐIỀU HƯỚNG DƯỚI CÙNG CHO ĐIỆN THOẠI (< md) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-t border-slate-200 dark:border-slate-700 safe-bottom">
        <div className="grid grid-cols-5">
          {navItems.map((item) => {
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`flex flex-col items-center justify-center py-2.5 gap-0.5 transition ${
                  active
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <div className={`p-1 rounded-xl transition ${active ? 'bg-blue-50 dark:bg-blue-900/40' : ''}`}>
                  {item.icon}
                </div>
                <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default App;
