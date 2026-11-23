import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  FileSpreadsheet,
  Plus,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  DEFAULT_CUSTOM_SHEET,
  DEFAULT_MATH_2025_SCORING,
  Exam,
  Part1Choice,
  Part2Choice,
  Part2ScoringMode,
  ScoringConfig,
  SheetTemplateType,
  calcExamMaxScore,
  createEmptyAnswerKey,
  getPart1QuestionMaxPoint,
  getPart3QuestionMaxPoint,
} from '../types';
import { TDict } from '../i18n/translations';
import {
  downloadAnswerKeyTemplateExcel,
  importAnswerKeysFromExcel,
} from '../utils/excelUtils';
import { generateId } from '../utils/id';

interface ExamsTabProps {
  t: TDict;
  exams: Exam[];
  activeExamId: string | null;
  onSelectExam: (id: string) => void;
  onSaveExam: (exam: Exam, regradePapers?: boolean) => Promise<number>;
  onDeleteExam: (id: string) => Promise<void>;
}

const PRESETS: { label: string; scoring: ScoringConfig }[] = [
  {
    label: 'Math 2025 (12 - 4 - 6)',
    scoring: { ...DEFAULT_MATH_2025_SCORING },
  },
  {
    label: 'Science 2025 (18 - 4 - 6)',
    scoring: {
      part1Count: 18,
      part1PointPerQuestion: 0.25,
      part2Count: 4,
      part2ScoringMode: 'bgd2025',
      part2Points: [0.1, 0.25, 0.5, 1.0],
      part3Count: 6,
      part3PointPerQuestion: 0.25,
      essayMaxScore: 0,
    },
  },
  {
    label: 'MCQ + Essay (12 - 2 - 4 + 3pt)',
    scoring: {
      part1Count: 12,
      part1PointPerQuestion: 0.25,
      part2Count: 2,
      part2ScoringMode: 'equal025',
      part2Points: [0.25, 0.5, 0.75, 1.0],
      part3Count: 4,
      part3PointPerQuestion: 0.5,
      essayMaxScore: 3,
    },
  },
];

export const ExamsTab: React.FC<ExamsTabProps> = ({
  t,
  exams,
  activeExamId,
  onSelectExam,
  onSaveExam,
  onDeleteExam,
}) => {
  const [showExamModal, setShowExamModal] = useState(false);
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [editingKeyExam, setEditingKeyExam] = useState<Exam | null>(null);
  const [activeCode, setActiveCode] = useState<string>('');
  const [newCodeInput, setNewCodeInput] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [showPerQuestionPoints, setShowPerQuestionPoints] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);

  const [examName, setExamName] = useState('');
  const [subject, setSubject] = useState('Toán học');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [templateType, setTemplateType] = useState<SheetTemplateType>('bgd1239');
  const [scoring, setScoring] = useState<ScoringConfig>({ ...DEFAULT_MATH_2025_SCORING });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3800);
  };

  const openCreateModal = () => {
    setEditingExamId(null);
    setExamName('');
    setSubject('Toán học');
    setDate(new Date().toISOString().slice(0, 10));
    setTemplateType('bgd1239');
    setScoring({ ...DEFAULT_MATH_2025_SCORING });
    setShowPerQuestionPoints(false);
    setShowExamModal(true);
  };

  const openEditConfigModal = (exam: Exam) => {
    setEditingExamId(exam.id);
    setExamName(exam.name);
    setSubject(exam.subject);
    setDate(exam.date);
    setTemplateType(exam.templateType || 'bgd1239');
    setScoring(structuredClone(exam.scoring));
    setShowPerQuestionPoints(false);
    setShowExamModal(true);
  };

  const handleSetPart2Mode = (mode: Part2ScoringMode) => {
    setScoring((prev) => ({
      ...prev,
      part2ScoringMode: mode,
      part2Points: mode === 'equal025' ? [0.25, 0.5, 0.75, 1.0] : [0.1, 0.25, 0.5, 1.0],
    }));
  };

  const handleSaveExamForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!examName.trim()) return;

    const existing = editingExamId ? exams.find((x) => x.id === editingExamId) : undefined;
    const examObj: Exam = {
      id: existing ? existing.id : generateId(),
      name: examName.trim(),
      subject: subject.trim() || 'Math',
      date,
      templateType,
      customSheet:
        templateType === 'custom'
          ? {
              ...(existing?.customSheet || DEFAULT_CUSTOM_SHEET),
              part1Count: scoring.part1Count,
              part2Count: scoring.part2Count,
              part3Count: scoring.part3Count,
              includeEssay: (scoring.essayMaxScore || 0) > 0,
            }
          : undefined,
      scoring: { ...scoring },
      answerKeys: existing ? existing.answerKeys : { '0101': createEmptyAnswerKey('0101') },
      createdAt: existing ? existing.createdAt : Date.now(),
    };

    const regradedCount = await onSaveExam(examObj, Boolean(existing));
    onSelectExam(examObj.id);
    setShowExamModal(false);
    showToast(
      existing && regradedCount > 0
        ? `${t.saveConfigBtn} (${regradedCount} ${t.papersUnit})`
        : t.save
    );
  };

  const openAnswerKeyEditor = (exam: Exam) => {
    const codes = Object.keys(exam.answerKeys);
    setEditingKeyExam(structuredClone(exam));
    setActiveCode(codes[0] || '0101');
  };

  const handleAddCode = () => {
    if (!editingKeyExam || !newCodeInput.trim()) return;
    const cleaned = newCodeInput.replace(/\D/g, '').padStart(4, '0').slice(-4);
    if (!editingKeyExam.answerKeys[cleaned]) {
      const updated = structuredClone(editingKeyExam);
      updated.answerKeys[cleaned] = createEmptyAnswerKey(cleaned);
      setEditingKeyExam(updated);
    }
    setActiveCode(cleaned);
    setNewCodeInput('');
  };

  const handleDeleteCode = (code: string) => {
    if (!editingKeyExam) return;
    const updated = structuredClone(editingKeyExam);
    delete updated.answerKeys[code];
    const remaining = Object.keys(updated.answerKeys);
    setEditingKeyExam(updated);
    setActiveCode(remaining[0] || '');
  };

  const updatePart1 = (qIdx: number, val: Part1Choice) => {
    if (!editingKeyExam || !activeCode) return;
    const updated = structuredClone(editingKeyExam);
    const key = updated.answerKeys[activeCode];
    key.part1[qIdx] = key.part1[qIdx] === val ? '' : val;
    setEditingKeyExam(updated);
  };

  const updatePart2 = (qIdx: number, subKey: 'a' | 'b' | 'c' | 'd', val: Part2Choice) => {
    if (!editingKeyExam || !activeCode) return;
    const updated = structuredClone(editingKeyExam);
    const key = updated.answerKeys[activeCode];
    key.part2[qIdx][subKey] = key.part2[qIdx][subKey] === val ? '' : val;
    setEditingKeyExam(updated);
  };

  const updatePart3 = (qIdx: number, val: string) => {
    if (!editingKeyExam || !activeCode) return;
    const updated = structuredClone(editingKeyExam);
    updated.answerKeys[activeCode].part3[qIdx] = val.replace('.', ',').slice(0, 4);
    setEditingKeyExam(updated);
  };

  const handleSaveKeys = async () => {
    if (!editingKeyExam) return;
    const regradedCount = await onSaveExam(editingKeyExam, true);
    setEditingKeyExam(null);
    showToast(
      regradedCount > 0
        ? `${t.saveAndRegradeBtn} (${regradedCount} ${t.papersUnit})`
        : t.save
    );
  };

  const handleImportKeysExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingKeyExam) return;
    try {
      const imported = await importAnswerKeysFromExcel(file);
      const count = Object.keys(imported).length;
      if (count === 0) return;
      const updated = structuredClone(editingKeyExam);
      updated.answerKeys = { ...updated.answerKeys, ...imported };
      setEditingKeyExam(updated);
      setActiveCode(Object.keys(imported)[0]);
      showToast(`${t.importExcel}: ${count} ${t.examCodes}`);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-blue-600 text-white text-sm px-4 py-2.5 rounded-full shadow-lg text-center max-w-[90vw]">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t.examsTitle}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.examsSub}</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm font-semibold px-3.5 py-2 rounded-xl shadow-sm transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t.createExam}
        </button>
      </div>

      {exams.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400">
          {t.noExamsYet}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {exams.map((exam) => {
            const isActive = exam.id === activeExamId;
            const codes = Object.keys(exam.answerKeys);
            return (
              <div
                key={exam.id}
                onClick={() => onSelectExam(exam.id)}
                className={`bg-white dark:bg-slate-800 rounded-2xl border-2 p-4 transition cursor-pointer flex flex-col justify-between ${
                  isActive
                    ? 'border-blue-600 shadow-md shadow-blue-100 dark:shadow-none'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> {t.activeBadge}
                          </span>
                        )}
                        <span className="text-[11px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">
                          {exam.templateType === 'custom' ? t.customTemplate : t.officialTemplate}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{exam.date}</span>
                      </div>
                      <h3 className="font-bold text-slate-900 dark:text-white mt-1.5 truncate">
                        {exam.name}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        {t.subjectLabel}: <strong>{exam.subject}</strong> • {t.maxScoreLabel}:{' '}
                        <strong className="text-blue-600 dark:text-blue-400">
                          {calcExamMaxScore(exam.scoring)}
                        </strong>
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`${t.delete} "${exam.name}"?`)) {
                          onDeleteExam(exam.id);
                        }
                      }}
                      className="p-2 text-slate-400 hover:text-red-600 rounded-lg"
                      title={t.delete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-1 rounded-lg">
                      PI: {exam.scoring.part1Count}
                    </span>
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-1 rounded-lg">
                      PII: {exam.scoring.part2Count} (
                      {exam.scoring.part2ScoringMode === 'equal025' ? t.p2ModeEqual : t.p2ModeBgd})
                    </span>
                    <span className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-1 rounded-lg">
                      PIII: {exam.scoring.part3Count}
                    </span>
                    {(exam.scoring.essayMaxScore || 0) > 0 && (
                      <span className="bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-1 rounded-lg font-medium">
                        {t.essayShort}: {exam.scoring.essayMaxScore}
                      </span>
                    )}
                    <span className="bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded-lg font-medium">
                      {codes.length} {t.examCodes} ({codes.slice(0, 3).join(', ')}
                      {codes.length > 3 ? '...' : ''})
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openAnswerKeyEditor(exam);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-xl transition"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {t.editAnswers}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditConfigModal(exam);
                    }}
                    className="flex items-center justify-center gap-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl transition"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                    {t.configScore}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL TẠO / SỬA CẤU HÌNH KỲ THI */}
      {showExamModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveExamForm}
            className="bg-white dark:bg-slate-800 w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto space-y-4 text-slate-900 dark:text-slate-100"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">
                {editingExamId ? t.editExamModalTitle : t.createExamModalTitle}
              </h3>
              <button
                type="button"
                onClick={() => setShowExamModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold mb-1">{t.examNameLabel}</label>
                <input
                  required
                  value={examName}
                  onChange={(e) => setExamName(e.target.value)}
                  placeholder={t.examNamePlaceholder}
                  className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">{t.subjectInputLabel}</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">{t.dateInputLabel}</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">{t.sheetTypeLabel}</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTemplateType('bgd1239')}
                    className={`p-2.5 rounded-xl border-2 text-left text-xs transition ${
                      templateType === 'bgd1239'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="font-bold">{t.officialTemplate}</div>
                    <div className="text-[11px] opacity-75">{t.bgdSheetSub}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTemplateType('custom')}
                    className={`p-2.5 rounded-xl border-2 text-left text-xs transition ${
                      templateType === 'custom'
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="font-bold">{t.customTemplate}</div>
                    <div className="text-[11px] opacity-75">{t.customSheetSub}</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">{t.quickPresetLabel}</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setScoring({ ...p.scoring })}
                      className="text-xs bg-blue-50 dark:bg-blue-900/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-medium px-2.5 py-1.5 rounded-lg"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/70 rounded-xl p-3.5 space-y-3 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span>{t.sectionConfigHeader}</span>
                  <span className="text-blue-600 dark:text-blue-400 text-sm">
                    {t.totalLabel}: {calcExamMaxScore(scoring)} {t.pointsUnit}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="space-y-1">
                    <span className="text-slate-600 dark:text-slate-400">{t.p1CountLabel}</span>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={scoring.part1Count}
                      onChange={(e) =>
                        setScoring({ ...scoring, part1Count: Math.min(40, Math.max(0, Number(e.target.value))) })
                      }
                      className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-600 dark:text-slate-400">{t.p1PointLabel}</span>
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={scoring.part1PointPerQuestion}
                      onChange={(e) =>
                        setScoring({ ...scoring, part1PointPerQuestion: Number(e.target.value) })
                      }
                      className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5"
                    />
                  </label>
                </div>

                <div className="space-y-2 pt-1 border-t border-slate-200 dark:border-slate-700">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="space-y-1">
                      <span className="text-slate-600 dark:text-slate-400">{t.p2CountLabel}</span>
                      <input
                        type="number"
                        min={0}
                        max={8}
                        value={scoring.part2Count}
                        onChange={(e) =>
                          setScoring({ ...scoring, part2Count: Math.min(8, Math.max(0, Number(e.target.value))) })
                        }
                        className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5"
                      />
                    </label>
                    <div className="space-y-1">
                      <span className="text-slate-600 dark:text-slate-400">{t.p2ModeLabel}</span>
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetPart2Mode('bgd2025')}
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold border transition ${
                            scoring.part2ScoringMode !== 'equal025'
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {t.p2ModeBgd}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetPart2Mode('equal025')}
                          className={`py-1.5 px-1.5 rounded-lg text-[11px] font-bold border transition ${
                            scoring.part2ScoringMode === 'equal025'
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {t.p2ModeEqual}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
                    {scoring.part2ScoringMode === 'equal025' ? t.p2ModeEqualDesc : t.p2ModeBgdDesc}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-200 dark:border-slate-700">
                  <label className="space-y-1">
                    <span className="text-slate-600 dark:text-slate-400">{t.p3CountLabel}</span>
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={scoring.part3Count}
                      onChange={(e) =>
                        setScoring({ ...scoring, part3Count: Math.min(6, Math.max(0, Number(e.target.value))) })
                      }
                      className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-600 dark:text-slate-400">{t.p3PointLabel}</span>
                    <input
                      type="number"
                      step="0.05"
                      min={0}
                      value={scoring.part3PointPerQuestion}
                      onChange={(e) =>
                        setScoring({ ...scoring, part3PointPerQuestion: Number(e.target.value) })
                      }
                      className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5"
                    />
                  </label>
                </div>

                <div className="pt-1 border-t border-slate-200 dark:border-slate-700 text-xs">
                  <label className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-400">{t.essayMaxLabel}</span>
                    <input
                      type="number"
                      step="0.25"
                      min={0}
                      max={10}
                      value={scoring.essayMaxScore || 0}
                      onChange={(e) =>
                        setScoring({ ...scoring, essayMaxScore: Math.max(0, Number(e.target.value)) })
                      }
                      className="w-24 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded-lg px-2.5 py-1.5 text-right font-semibold"
                    />
                  </label>
                </div>

                <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setShowPerQuestionPoints((v) => !v)}
                    className="w-full flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 py-1"
                  >
                    <span>{t.perQuestionToggle}</span>
                    {showPerQuestionPoints ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showPerQuestionPoints && (
                    <div className="mt-2 space-y-3 text-xs">
                      {scoring.part1Count > 0 && (
                        <div>
                          <div className="font-semibold mb-1.5 text-slate-600 dark:text-slate-300">
                            {t.p1PerQTitle}
                          </div>
                          <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                            {Array.from({ length: scoring.part1Count }, (_, idx) => (
                              <label key={idx} className="flex flex-col text-[11px]">
                                <span className="text-slate-500">
                                  {t.questionShort}
                                  {idx + 1}
                                </span>
                                <input
                                  type="number"
                                  step="0.05"
                                  min={0}
                                  value={getPart1QuestionMaxPoint(scoring, idx)}
                                  onChange={(e) => {
                                    const arr = [...(scoring.part1CustomPoints || [])];
                                    arr[idx] = Number(e.target.value);
                                    setScoring({ ...scoring, part1CustomPoints: arr });
                                  }}
                                  className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded px-1.5 py-1 text-center"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {scoring.part3Count > 0 && (
                        <div>
                          <div className="font-semibold mb-1.5 text-slate-600 dark:text-slate-300">
                            {t.p3PerQTitle}
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                            {Array.from({ length: scoring.part3Count }, (_, idx) => (
                              <label key={idx} className="flex flex-col text-[11px]">
                                <span className="text-slate-500">
                                  {t.questionShort}
                                  {idx + 1}
                                </span>
                                <input
                                  type="number"
                                  step="0.05"
                                  min={0}
                                  value={getPart3QuestionMaxPoint(scoring, idx)}
                                  onChange={(e) => {
                                    const arr = [...(scoring.part3CustomPoints || [])];
                                    arr[idx] = Number(e.target.value);
                                    setScoring({ ...scoring, part3CustomPoints: arr });
                                  }}
                                  className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 rounded px-1.5 py-1 text-center"
                                />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl"
            >
              {editingExamId ? t.saveConfigBtn : t.saveNewExamBtn}
            </button>
          </form>
        </div>
      )}

      {/* MODAL NHẬP / SỬA ĐÁP ÁN */}
      {editingKeyExam && (
        <div className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900 flex flex-col">
          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                {t.answerEditorTitle}: {editingKeyExam.name}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.answerEditorSub}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSaveKeys}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl"
              >
                {t.saveAndRegradeBtn}
              </button>
              <button
                onClick={() => setEditingKeyExam(null)}
                className="p-2 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2.5 space-y-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {Object.keys(editingKeyExam.answerKeys).map((code) => (
                <div
                  key={code}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                    activeCode === code
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                  }`}
                  onClick={() => setActiveCode(code)}
                >
                  <span>
                    {t.codeLabel} {code}
                  </span>
                  {Object.keys(editingKeyExam.answerKeys).length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCode(code);
                      }}
                      className="ml-1 opacity-75 hover:opacity-100"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-1 shrink-0">
                <input
                  value={newCodeInput}
                  onChange={(e) => setNewCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder={t.codeInputPlaceholder}
                  className="w-24 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-lg px-2 py-1 text-xs"
                />
                <button
                  onClick={handleAddCode}
                  className="bg-slate-900 dark:bg-slate-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-semibold"
                >
                  {t.addCodeBtn}
                </button>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => downloadAnswerKeyTemplateExcel(editingKeyExam)}
                className="flex items-center gap-1 text-xs bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium px-2.5 py-1.5 rounded-lg"
              >
                <Download className="w-3.5 h-3.5" />
                {t.downloadSampleExcel}
              </button>
              <button
                onClick={() => excelInputRef.current?.click()}
                className="flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium px-2.5 py-1.5 rounded-lg"
              >
                <Upload className="w-3.5 h-3.5" />
                {t.importExcel}
              </button>
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportKeysExcel}
              />
            </div>
          </div>

          {activeCode && editingKeyExam.answerKeys[activeCode] && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5 max-w-4xl w-full mx-auto">
              {editingKeyExam.scoring.part1Count > 0 && (
                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                    {t.part1Full} ({editingKeyExam.scoring.part1Count})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {Array.from({ length: editingKeyExam.scoring.part1Count }, (_, idx) => {
                      const current = editingKeyExam.answerKeys[activeCode].part1[idx];
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/60 rounded-xl px-3 py-1.5"
                        >
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-12">
                            {t.questionShort} {idx + 1}
                          </span>
                          <div className="flex gap-1.5">
                            {(['A', 'B', 'C', 'D'] as const).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => updatePart1(idx, opt)}
                                className={`w-8 h-8 rounded-full text-xs font-bold transition ${
                                  current === opt
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {editingKeyExam.scoring.part2Count > 0 && (
                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
                    {t.part2Full} ({editingKeyExam.scoring.part2Count})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {Array.from({ length: editingKeyExam.scoring.part2Count }, (_, idx) => {
                      const qAns = editingKeyExam.answerKeys[activeCode].part2[idx];
                      return (
                        <div key={idx} className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3 space-y-1.5">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {t.questionShort} {idx + 1}
                          </div>
                          {(['a', 'b', 'c', 'd'] as const).map((sub) => (
                            <div key={sub} className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                {t.subItemPrefix} {sub})
                              </span>
                              <div className="flex gap-1.5">
                                {(['D', 'S'] as const).map((choice) => (
                                  <button
                                    key={choice}
                                    type="button"
                                    onClick={() => updatePart2(idx, sub, choice)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                                      qAns[sub] === choice
                                        ? choice === 'D'
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-rose-600 text-white'
                                        : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    {choice === 'D' ? 'T/Đ' : 'F/S'}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {editingKeyExam.scoring.part3Count > 0 && (
                <section className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
                    {t.part3Full} ({editingKeyExam.scoring.part3Count})
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">{t.p3Hint}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {Array.from({ length: editingKeyExam.scoring.part3Count }, (_, idx) => (
                      <div key={idx} className="bg-slate-50 dark:bg-slate-900/60 rounded-xl p-2.5">
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                          {t.questionShort} {idx + 1}
                        </label>
                        <input
                          value={editingKeyExam.answerKeys[activeCode].part3[idx] || ''}
                          onChange={(e) => updatePart3(idx, e.target.value)}
                          placeholder="-1,5"
                          maxLength={4}
                          className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg px-2 py-1.5 text-sm font-mono font-bold text-center"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
