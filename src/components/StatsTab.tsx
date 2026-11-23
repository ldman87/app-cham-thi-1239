import React, { useMemo, useState } from 'react';
import { BarChart3, Download, TrendingUp, Users } from 'lucide-react';
import { Exam, GradedPaper } from '../types';
import { TDict } from '../i18n/translations';
import { exportResultsToExcel } from '../utils/excelUtils';

interface StatsTabProps {
  t: TDict;
  exams: Exam[];
  exam: Exam | null;
  onSelectExam: (id: string) => void;
  papers: GradedPaper[];
}

export const StatsTab: React.FC<StatsTabProps> = ({
  t,
  exams,
  exam,
  onSelectExam,
  papers,
}) => {
  const [selectedClass, setSelectedClass] = useState<string>('ALL');

  // Danh sách các lớp có trong bài chấm của kỳ thi hiện tại
  const classSummary = useMemo(() => {
    const map = new Map<string, GradedPaper[]>();
    papers.forEach((p) => {
      const cls = p.className?.trim() || t.unassignedClass;
      const arr = map.get(cls) || [];
      arr.push(p);
      map.set(cls, arr);
    });
    return Array.from(map.entries())
      .map(([cls, list]) => {
        const scores = list.map((x) => x.totalScore);
        const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
        const max = Math.max(...scores);
        const min = Math.min(...scores);
        const passPct = Math.round((scores.filter((s) => s >= 5).length / scores.length) * 100);
        const goodPct = Math.round((scores.filter((s) => s >= 8).length / scores.length) * 100);
        return { cls, count: list.length, avg, max, min, passPct, goodPct };
      })
      .sort((a, b) => a.cls.localeCompare(b.cls));
  }, [papers, t.unassignedClass]);

  const filteredPapers = useMemo(() => {
    if (selectedClass === 'ALL') return papers;
    return papers.filter((p) => (p.className?.trim() || t.unassignedClass) === selectedClass);
  }, [papers, selectedClass, t.unassignedClass]);

  if (exams.length === 0 || !exam) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
        {t.noExamPrompt} <strong>{t.navExams}</strong>.
      </div>
    );
  }

  const scores = filteredPapers.map((p) => p.totalScore);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const max = scores.length ? Math.max(...scores) : 0;
  const min = scores.length ? Math.min(...scores) : 0;
  const passCount = scores.filter((s) => s >= 5).length;
  const goodCount = scores.filter((s) => s >= 8).length;

  const bins = Array(10).fill(0) as number[];
  scores.forEach((s) => {
    const idx = Math.min(9, Math.max(0, Math.floor(s)));
    bins[idx]++;
  });
  const maxBin = Math.max(...bins, 1);

  const part1Stats = Array.from({ length: exam.scoring.part1Count }, (_, i) => {
    const correct = filteredPapers.filter((p) => p.part1Details[i]?.isCorrect).length;
    return {
      label: `PI - C${i + 1}`,
      pct: filteredPapers.length ? Math.round((correct / filteredPapers.length) * 100) : 0,
    };
  });

  const part2Stats = Array.from({ length: exam.scoring.part2Count }, (_, i) => {
    const avgSub = filteredPapers.length
      ? filteredPapers.reduce((sum, p) => sum + (p.part2Details[i]?.correctSubCount || 0), 0) /
        filteredPapers.length
      : 0;
    return {
      label: `PII - C${i + 1}`,
      pct: Math.round((avgSub / 4) * 100),
      extra: `${t.avgShort} ${avgSub.toFixed(1)}/4`,
    };
  });

  const part3Stats = Array.from({ length: exam.scoring.part3Count }, (_, i) => {
    const correct = filteredPapers.filter((p) => p.part3Details[i]?.isCorrect).length;
    return {
      label: `PIII - C${i + 1}`,
      pct: filteredPapers.length ? Math.round((correct / filteredPapers.length) * 100) : 0,
    };
  });

  return (
    <div className="space-y-4">
      {/* Header + Xuất Excel */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t.statsTitle}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.statsSub}</p>
        </div>
        {filteredPapers.length > 0 && (
          <button
            onClick={() => exportResultsToExcel(exam, filteredPapers)}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-sm shrink-0"
          >
            <Download className="w-4 h-4" />
            {t.exportExcel}
          </button>
        )}
      </div>

      {/* Bộ chọn Kỳ thi & Bộ lọc theo Lớp */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
            {t.selectExamStats}
          </label>
          <select
            value={exam.id}
            onChange={(e) => {
              onSelectExam(e.target.value);
              setSelectedClass('ALL');
            }}
            className="w-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-3 py-2 text-xs font-bold outline-none"
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name} ({ex.date})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400 mb-1">
            {t.filterByClass}
          </label>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setSelectedClass('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
                selectedClass === 'ALL'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              {t.allClasses} ({papers.length})
            </button>
            {classSummary.map((c) => (
              <button
                key={c.cls}
                onClick={() => setSelectedClass(c.cls)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition ${
                  selectedClass === c.cls
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                {c.cls} ({c.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {filteredPapers.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-10 text-center text-slate-500 dark:text-slate-400 text-sm">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
          {t.noStatsPapers}
        </div>
      ) : (
        <>
          {/* Thẻ chỉ số */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{t.avgScore}</div>
              <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">
                {avg.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400">
                {filteredPapers.length} {t.papersUnit}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{t.maxMinScore}</div>
              <div className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                <span className="text-emerald-600 dark:text-emerald-400">{max}</span> /{' '}
                <span className="text-rose-600 dark:text-rose-400">{min}</span>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{t.passRate}</div>
              <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
                {Math.round((passCount / filteredPapers.length) * 100)}%
              </div>
              <div className="text-[11px] text-slate-400">
                {passCount}/{filteredPapers.length} {t.papersUnit}
              </div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-3.5">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">{t.goodRate}</div>
              <div className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mt-1">
                {Math.round((goodCount / filteredPapers.length) * 100)}%
              </div>
              <div className="text-[11px] text-slate-400">
                {goodCount}/{filteredPapers.length} {t.papersUnit}
              </div>
            </div>
          </div>

          {/* Bảng so sánh thống kê theo từng Lớp */}
          {selectedClass === 'ALL' && classSummary.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                {t.classComparison}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3">{t.colClass}</th>
                      <th className="py-2 px-2 text-center">{t.colCount}</th>
                      <th className="py-2 px-2 text-center">{t.colAvg}</th>
                      <th className="py-2 px-2 text-center">{t.colMax}</th>
                      <th className="py-2 px-2 text-center">{t.colMin}</th>
                      <th className="py-2 px-2 text-center">≥ 5.0</th>
                      <th className="py-2 pl-2 text-center">≥ 8.0</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {classSummary.map((c) => (
                      <tr
                        key={c.cls}
                        onClick={() => setSelectedClass(c.cls)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                      >
                        <td className="py-2.5 pr-3 font-bold text-blue-600 dark:text-blue-400">
                          {c.cls}
                        </td>
                        <td className="py-2.5 px-2 text-center font-semibold">{c.count}</td>
                        <td className="py-2.5 px-2 text-center font-extrabold">{c.avg.toFixed(2)}</td>
                        <td className="py-2.5 px-2 text-center text-emerald-600 font-bold">{c.max}</td>
                        <td className="py-2.5 px-2 text-center text-rose-600 font-bold">{c.min}</td>
                        <td className="py-2.5 px-2 text-center">{c.passPct}%</td>
                        <td className="py-2.5 pl-2 text-center">{c.goodPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            {/* Biểu đồ phổ điểm */}
            <div className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                {t.scoreDistribution}
              </h3>
              <div className="h-44 flex items-end justify-between gap-1.5 pt-4">
                {bins.map((count, idx) => {
                  const heightPct = Math.round((count / maxBin) * 100);
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end">
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                        {count > 0 ? count : ''}
                      </span>
                      <div
                        className={`w-full rounded-t-md transition-all ${
                          idx >= 8 ? 'bg-emerald-500' : idx >= 5 ? 'bg-blue-500' : 'bg-rose-400'
                        }`}
                        style={{ height: `${Math.max(count > 0 ? 8 : 2, heightPct)}%` }}
                      />
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 font-medium">
                        {idx === 9 ? '9-10' : `${idx}-${idx + 1}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tỷ lệ đúng từng câu */}
            <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {t.questionAccuracy}
              </h3>

              {part1Stats.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                    {t.part1Full}
                  </div>
                  <div className="space-y-1.5">
                    {part1Stats.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-xs">
                        <span className="w-16 font-semibold text-slate-700 dark:text-slate-300">
                          {item.label}
                        </span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.pct >= 70
                                ? 'bg-emerald-500'
                                : item.pct >= 40
                                  ? 'bg-amber-400'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${item.pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-bold text-slate-700 dark:text-slate-200">
                          {item.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {part2Stats.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                    {t.part2Full}
                  </div>
                  <div className="space-y-1.5">
                    {part2Stats.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-xs">
                        <span className="w-16 font-semibold text-slate-700 dark:text-slate-300">
                          {item.label}
                        </span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.pct >= 70
                                ? 'bg-emerald-500'
                                : item.pct >= 40
                                  ? 'bg-amber-400'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${item.pct}%` }}
                          />
                        </div>
                        <span className="w-24 text-right text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                          {item.pct}% ({item.extra})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {part3Stats.length > 0 && (
                <div>
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                    {t.part3Full}
                  </div>
                  <div className="space-y-1.5">
                    {part3Stats.map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-xs">
                        <span className="w-16 font-semibold text-slate-700 dark:text-slate-300">
                          {item.label}
                        </span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              item.pct >= 70
                                ? 'bg-emerald-500'
                                : item.pct >= 40
                                  ? 'bg-amber-400'
                                  : 'bg-rose-500'
                            }`}
                            style={{ width: `${item.pct}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-bold text-slate-700 dark:text-slate-200">
                          {item.pct}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
