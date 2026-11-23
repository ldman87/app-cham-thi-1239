import React, { useEffect, useState } from 'react';
import { Download, FileCheck2, Info, PlusCircle, Sliders } from 'lucide-react';
import { CustomSheetConfig, DEFAULT_CUSTOM_SHEET, Exam, SheetTemplateType, createEmptyAnswerKey } from '../types';
import { TDict } from '../i18n/translations';
import { renderSheetToCanvas } from '../omr/sheetRenderer';
import { downloadCustomSheetPdf, downloadOfficialBgd1239Pdf } from '../omr/pdfGenerator';
import { generateId } from '../utils/id';

interface SheetTabProps {
  t: TDict;
  onQuickCreateCustomExam: (exam: Exam) => Promise<void>;
}

export const SheetTab: React.FC<SheetTabProps> = ({ t, onQuickCreateCustomExam }) => {
  const [mode, setMode] = useState<SheetTemplateType>('bgd1239');
  const [customConfig, setCustomConfig] = useState<CustomSheetConfig>({ ...DEFAULT_CUSTOM_SHEET });
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const canvas = renderSheetToCanvas({
      templateType: mode,
      customSheet: customConfig,
      dpi: 115,
    });
    setPreviewUrl(canvas.toDataURL('image/png'));
  }, [mode, customConfig]);

  const handleDownloadPdf = () => {
    setDownloading(true);
    setTimeout(() => {
      try {
        if (mode === 'bgd1239') {
          downloadOfficialBgd1239Pdf();
        } else {
          downloadCustomSheetPdf(customConfig, 'Phieu_Trac_Nghiem_Ca_Nhan_A4.pdf');
        }
      } finally {
        setDownloading(false);
      }
    }, 50);
  };

  const handleCreateExamFromCustom = async () => {
    const exam: Exam = {
      id: generateId(),
      name: customConfig.title || t.customTemplate,
      subject: 'Toán học',
      date: new Date().toISOString().slice(0, 10),
      templateType: 'custom',
      customSheet: { ...customConfig },
      scoring: {
        part1Count: customConfig.part1Count,
        part1PointPerQuestion: 0.25,
        part2Count: customConfig.part2Count,
        part2ScoringMode: 'bgd2025',
        part2Points: [0.1, 0.25, 0.5, 1.0],
        part3Count: customConfig.part3Count,
        part3PointPerQuestion: 0.5,
        essayMaxScore: customConfig.includeEssay ? 2 : 0,
      },
      answerKeys: {
        '0101': createEmptyAnswerKey('0101'),
      },
      createdAt: Date.now(),
    };
    await onQuickCreateCustomExam(exam);
    setToast(t.createCustomExamBtn);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-blue-600 text-white text-sm px-4 py-2.5 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t.sheetTitle}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.sheetSub}</p>
        </div>
        <button
          onClick={handleDownloadPdf}
          disabled={downloading}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm shrink-0"
        >
          <Download className="w-4 h-4" />
          {downloading
            ? t.generatingPdf
            : mode === 'bgd1239'
              ? t.downloadBgdPdf
              : t.downloadCustomPdf}
        </button>
      </div>

      {/* Bộ chuyển 2 loại phiếu */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => setMode('bgd1239')}
          className={`flex items-center gap-2.5 p-3.5 rounded-2xl border-2 text-left transition ${
            mode === 'bgd1239'
              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <FileCheck2 className="w-5 h-5 text-blue-600 shrink-0" />
          <div>
            <div className="text-xs font-bold">{t.officialTemplate}</div>
            <div className="text-[11px] opacity-75">{t.officialTemplateSub}</div>
          </div>
        </button>

        <button
          onClick={() => setMode('custom')}
          className={`flex items-center gap-2.5 p-3.5 rounded-2xl border-2 text-left transition ${
            mode === 'custom'
              ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <Sliders className="w-5 h-5 text-indigo-600 shrink-0" />
          <div>
            <div className="text-xs font-bold">{t.customTemplate}</div>
            <div className="text-[11px] opacity-75">{t.customTemplateSub}</div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-5 space-y-4">
          {mode === 'bgd1239' ? (
            <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-2xl p-4 text-xs text-blue-950 dark:text-blue-100 flex gap-2.5">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <div className="font-bold text-sm">{t.bgdInfoTitle}</div>
                <p>{t.bgdInfoP1}</p>
                <ul className="list-disc pl-4 space-y-1 text-[11px]">
                  <li>{t.bgdInfoLi1}</li>
                  <li>{t.bgdInfoLi2}</li>
                  <li>{t.bgdInfoLi3}</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                {t.customDesignTitle}
              </div>

              <div className="space-y-2 text-xs">
                <label className="block">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {t.sheetHeadingLabel}
                  </span>
                  <input
                    value={customConfig.title}
                    onChange={(e) => setCustomConfig({ ...customConfig, title: e.target.value })}
                    className="mt-1 w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2"
                  />
                </label>

                <label className="block">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {t.sheetSubHeadingLabel}
                  </span>
                  <input
                    value={customConfig.subtitle}
                    onChange={(e) => setCustomConfig({ ...customConfig, subtitle: e.target.value })}
                    className="mt-1 w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2"
                  />
                </label>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <label>
                    <span className="text-slate-600 dark:text-slate-400">{t.part1Short} (0-40)</span>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={customConfig.part1Count}
                      onChange={(e) =>
                        setCustomConfig({
                          ...customConfig,
                          part1Count: Math.min(40, Math.max(0, Number(e.target.value))),
                        })
                      }
                      className="mt-1 w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl px-2.5 py-1.5"
                    />
                  </label>
                  <label>
                    <span className="text-slate-600 dark:text-slate-400">{t.part2Short} (0-8)</span>
                    <input
                      type="number"
                      min={0}
                      max={8}
                      value={customConfig.part2Count}
                      onChange={(e) =>
                        setCustomConfig({
                          ...customConfig,
                          part2Count: Math.min(8, Math.max(0, Number(e.target.value))),
                        })
                      }
                      className="mt-1 w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl px-2.5 py-1.5"
                    />
                  </label>
                  <label>
                    <span className="text-slate-600 dark:text-slate-400">{t.part3Short} (0-6)</span>
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={customConfig.part3Count}
                      onChange={(e) =>
                        setCustomConfig({
                          ...customConfig,
                          part3Count: Math.min(6, Math.max(0, Number(e.target.value))),
                        })
                      }
                      className="mt-1 w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-xl px-2.5 py-1.5"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 pt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={customConfig.includeEssay}
                    onChange={(e) =>
                      setCustomConfig({ ...customConfig, includeEssay: e.target.checked })
                    }
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {t.includeEssayLabel}
                  </span>
                </label>

                {customConfig.includeEssay && (
                  <label className="flex items-center justify-between gap-2 pl-6">
                    <span className="text-slate-600 dark:text-slate-400">{t.essayLinesLabel}</span>
                    <input
                      type="number"
                      min={4}
                      max={20}
                      value={customConfig.essayLines}
                      onChange={(e) =>
                        setCustomConfig({
                          ...customConfig,
                          essayLines: Math.min(20, Math.max(4, Number(e.target.value))),
                        })
                      }
                      className="w-20 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 rounded-lg px-2 py-1 text-center"
                    />
                  </label>
                )}
              </div>

              <button
                onClick={handleCreateExamFromCustom}
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5 rounded-xl transition"
              >
                <PlusCircle className="w-4 h-4" />
                {t.createCustomExamBtn}
              </button>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 shadow-sm">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
            {t.previewA4Title}
          </div>
          {previewUrl && (
            <img
              src={previewUrl}
              alt={t.previewA4Title}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 shadow-inner bg-white"
            />
          )}
        </div>
      </div>
    </div>
  );
};
