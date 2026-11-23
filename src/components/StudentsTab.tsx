import React, { useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Plus, Search, Trash2, Upload, Users } from 'lucide-react';
import { Student } from '../types';
import { TDict } from '../i18n/translations';
import { downloadStudentTemplateExcel, importStudentsFromExcel } from '../utils/excelUtils';
import { generateId } from '../utils/id';

interface StudentsTabProps {
  t: TDict;
  students: Student[];
  onSaveStudent: (s: Student) => Promise<void>;
  onSaveStudentsBulk: (list: Student[]) => Promise<void>;
  onDeleteStudent: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}

const PAGE_SIZE = 30;

export const StudentsTab: React.FC<StudentsTabProps> = ({
  t,
  students,
  onSaveStudent,
  onSaveStudentsBulk,
  onDeleteStudent,
  onClearAll,
}) => {
  const [query, setQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('ALL');
  const [collapsedClasses, setCollapsedClasses] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);

  const [sbd, setSbd] = useState('');
  const [fullName, setFullName] = useState('');
  const [className, setClassName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const notify = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  // Thống kê danh sách lớp
  const classCounts = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((s) => {
      const cls = s.className.trim() || t.unassignedClass;
      map.set(cls, (map.get(cls) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [students, t.unassignedClass]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      const cls = s.className.trim() || t.unassignedClass;
      if (selectedClass !== 'ALL' && cls !== selectedClass) return false;
      if (!q) return true;
      return (
        s.sbd.toLowerCase().includes(q) ||
        s.fullName.toLowerCase().includes(q) ||
        cls.toLowerCase().includes(q)
      );
    });
  }, [students, query, selectedClass, t.unassignedClass]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedStudents = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Nhóm các học sinh trên trang hiện tại theo Lớp
  const groupedByClass = useMemo(() => {
    const groups = new Map<string, Student[]>();
    pagedStudents.forEach((s) => {
      const cls = s.className.trim() || t.unassignedClass;
      const arr = groups.get(cls) || [];
      arr.push(s);
      groups.set(cls, arr);
    });
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pagedStudents, t.unassignedClass]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sbd.trim() || !fullName.trim()) return;
    await onSaveStudent({
      id: generateId(),
      sbd: sbd.trim(),
      fullName: fullName.trim(),
      className: className.trim(),
    });
    setSbd('');
    setFullName('');
    notify('Đã thêm học sinh!');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const list = await importStudentsFromExcel(file);
      if (list.length === 0) {
        notify('Không tìm thấy dữ liệu học sinh trong file Excel.');
        return;
      }
      await onSaveStudentsBulk(list);
      notify(`Đã nhập thành công ${list.length} học sinh từ Excel!`);
    } catch {
      notify('Lỗi đọc file Excel. Vui lòng dùng đúng file mẫu.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {message && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 dark:bg-blue-600 text-white text-sm px-4 py-2.5 rounded-full shadow-lg">
          {message}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t.studentsTitle}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t.studentsSub}</p>
        </div>
        <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold px-3 py-1 rounded-full shrink-0">
          {students.length} {t.studentShort} • {classCounts.length} {t.classesUnit}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Cột trái: Excel & Thêm nhanh */}
        <div className="lg:col-span-4 space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={downloadStudentTemplateExcel}
              className="flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold py-2.5 rounded-xl"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              {t.downloadSampleExcel}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2.5 rounded-xl"
            >
              <Upload className="w-4 h-4" />
              {t.importExcel}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImport}
            />
          </div>

          <form
            onSubmit={handleAdd}
            className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-2.5"
          >
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {t.quickAddStudent}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                value={sbd}
                onChange={(e) => setSbd(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder={t.sbdPlaceholder}
                className="border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-2.5 py-2 text-xs font-mono"
                required
              />
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t.fullNamePlaceholder}
                className="col-span-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-2.5 py-2 text-xs"
                required
              />
            </div>
            <div className="flex gap-2">
              <input
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder={t.classPlaceholder}
                className="flex-1 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl px-2.5 py-2 text-xs"
              />
              <button
                type="submit"
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2 rounded-xl"
              >
                <Plus className="w-4 h-4" /> {t.addBtn}
              </button>
            </div>
          </form>
        </div>

        {/* Cột phải: Bộ lọc theo Lớp + Tìm kiếm + Nhóm lớp khoa học + Phân trang */}
        <div className="lg:col-span-8 space-y-3">
          {/* Thanh lọc nhanh theo Lớp */}
          {classCounts.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => {
                  setSelectedClass('ALL');
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
                  selectedClass === 'ALL'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                {t.allClasses} ({students.length})
              </button>
              {classCounts.map(([cls, count]) => (
                <button
                  key={cls}
                  onClick={() => {
                    setSelectedClass(cls);
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition ${
                    selectedClass === cls
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {cls} ({count})
                </button>
              ))}
            </div>
          )}

          {/* Thanh tìm kiếm */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={t.searchStudentPlaceholder}
                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {students.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Xóa toàn bộ danh sách học sinh?')) onClearAll();
                }}
                className="text-xs text-red-600 dark:text-red-400 font-semibold px-2.5 py-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
              >
                {t.clearAll}
              </button>
            )}
          </div>

          {/* Danh sách phân nhóm theo lớp */}
          {groupedByClass.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center text-slate-500 dark:text-slate-400 text-xs">
              <Users className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
              {t.noMatchingStudents}
            </div>
          ) : (
            <div className="space-y-3">
              {groupedByClass.map(([cls, list]) => {
                const isCollapsed = Boolean(collapsedClasses[cls]);
                return (
                  <div
                    key={cls}
                    className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setCollapsedClasses((prev) => ({ ...prev, [cls]: !prev[cls] }))
                      }
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50 text-xs font-bold text-slate-800 dark:text-slate-100"
                    >
                      <span className="flex items-center gap-1.5">
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                        {t.classLabel} {cls}
                      </span>
                      <span className="bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full text-[11px]">
                        {list.length} {t.studentShort}
                      </span>
                    </button>

                    {!isCollapsed && (
                      <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {list.map((s, idx) => (
                          <div
                            key={s.id}
                            className="flex items-center justify-between px-4 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700/30"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-6 text-slate-400 font-mono text-[11px]">
                                {(safePage - 1) * PAGE_SIZE + idx + 1}.
                              </span>
                              <span className="font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-700 dark:text-slate-200 shrink-0">
                                {s.sbd}
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white truncate text-sm">
                                {s.fullName}
                              </span>
                            </div>
                            <button
                              onClick={() => onDeleteStudent(s.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Phân trang khi danh sách lớn */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs">
                  <span className="text-slate-500 dark:text-slate-400">
                    {t.page} {safePage} / {totalPages} ({filtered.length} {t.studentShort})
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 disabled:opacity-40 font-semibold"
                    >
                      {t.prev}
                    </button>
                    <button
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 disabled:opacity-40 font-semibold"
                    >
                      {t.next}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
