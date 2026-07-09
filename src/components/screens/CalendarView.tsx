import { CalendarIcon, CalendarRange, Info, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { LearningPath, PathStep } from "../../domain/types";
import { schedulePath, scheduleStep } from "../../services/calendar";

interface Props {
  paths: LearningPath[];
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

/** Month grid plus a scheduler sidebar to assign or auto-schedule study steps. */
export function CalendarView({ paths }: Props) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  function changeMonth(direction: number) {
    setCurrentDate((prev) => {
      const copy = new Date(prev);
      copy.setMonth(prev.getMonth() + direction);
      return copy;
    });
  }

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const scheduleMap: Record<string, Array<{ step: PathStep; path: LearningPath }>> = {};
  paths.forEach((path) => {
    path.steps.forEach((step) => {
      if (step.scheduledDate) {
        (scheduleMap[step.scheduledDate] ??= []).push({ step, path });
      }
    });
  });

  async function handleAssign(stepId: string, pathId: string) {
    if (!selectedDay) return;
    await scheduleStep(pathId, stepId, selectedDay);
    setSelectedDay(null);
  }

  async function handleAutoSchedule(path: LearningPath) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await schedulePath(path, {
      startDate: tomorrow.toISOString().slice(0, 10),
      daysBetween: 1,
      skipWeekends: false,
      milestoneEvery: 0,
    });
    alert(`Successfully auto-scheduled steps for "${path.title}" sequentially starting tomorrow!`);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-5xl mx-auto space-y-8"
      id="view_calendar"
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-blue-400" />
            <span>In-App Study Calendar</span>
          </h2>
          <p className="text-xs text-slate-400">
            Schedule your course milestones, view study targets, and stay on track offline.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3.5 text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
            <span>Completed Target</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></div>
            <span>Pending Target</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <h3 className="font-bold text-sm text-slate-200">
              {MONTHS[month]} {year}
            </h3>
            <div className="flex gap-1.5">
              <button
                id="cal_prev_month_btn"
                onClick={() => changeMonth(-1)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Prev
              </button>
              <button
                id="cal_next_month_btn"
                onClick={() => changeMonth(1)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                Next
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center py-2 text-[10px] uppercase font-mono font-bold text-slate-500">
            {DAYS_OF_WEEK.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="h-24 bg-slate-950/30 rounded-xl border border-transparent"
              ></div>
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNumber = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
              const isToday =
                new Date().toDateString() === new Date(year, month, dayNumber).toDateString();
              const scheduledItems = scheduleMap[dateStr] || [];

              const hasItems = scheduledItems.length > 0;

              return (
                <div
                  key={dayNumber}
                  onClick={() => setSelectedDay(dateStr)}
                  className={`h-24 p-1.5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                    hasItems
                      ? "bg-blue-600/90 border-blue-500 hover:bg-blue-600"
                      : "bg-slate-950 border-slate-800 hover:border-slate-700"
                  } ${isToday ? "ring-2 ring-blue-300" : ""}`}
                >
                  <div className="flex justify-between items-center">
                    <span
                      className={`text-[10px] font-mono font-semibold ${hasItems ? "text-white" : "text-slate-400"}`}
                    >
                      {dayNumber}
                    </span>
                    {hasItems && (
                      <span className="text-[8px] bg-black/20 px-1 py-0.2 rounded font-mono text-white">
                        {scheduledItems.length}
                      </span>
                    )}
                  </div>

                  {hasItems && (
                    <div className="flex-1 mt-1 overflow-hidden">
                      <p
                        className={`text-[9px] font-mono leading-tight truncate ${
                          scheduledItems[0].step.status === "done"
                            ? "text-white/70 line-through"
                            : "text-white"
                        }`}
                        title={`${scheduledItems[0].path.title} - ${scheduledItems[0].step.title}`}
                      >
                        {scheduledItems[0].step.title}
                      </p>
                      {scheduledItems.length > 1 && (
                        <div className="text-[7px] text-white/70 font-mono mt-0.5">
                          + {scheduledItems.length - 1} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800">
              <CalendarRange className="h-4.5 w-4.5 text-blue-400" />
              <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider font-mono">
                Study Scheduler
              </h3>
            </div>

            {selectedDay ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400">Selected target day</span>
                  <p className="text-xs font-bold text-blue-400 font-mono">{selectedDay}</p>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-300">
                    Assign a study step to this day:
                  </p>

                  {paths.length === 0 ? (
                    <p className="text-[10px] text-slate-500">
                      No active courses loaded to assign milestones.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {paths.map((path) => (
                        <div key={path.id} className="space-y-1">
                          <span className="text-[9px] text-slate-500 font-bold uppercase">
                            {path.title}
                          </span>
                          {path.steps.map((step) => (
                            <button
                              key={step.id}
                              onClick={() => handleAssign(step.id, path.id)}
                              className="w-full text-left p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-300 truncate transition-colors flex items-center justify-between"
                            >
                              <span className="truncate">{step.title}</span>
                              <Plus className="h-3 w-3 shrink-0 text-blue-400 ml-1" />
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  id="scheduler_cancel_btn"
                  onClick={() => setSelectedDay(null)}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 py-1.5 rounded-lg text-xs"
                >
                  Close Scheduler
                </button>
              </div>
            ) : (
              <div className="text-center py-6">
                <Info className="h-6 w-6 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-300 font-medium">Auto-Schedule Course</p>
                <p className="text-[10px] text-slate-500 max-w-xs mx-auto mt-1 leading-relaxed">
                  Want to auto-schedule study dates sequentially starting from tomorrow?
                </p>

                {paths.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <label className="block text-[10px] text-slate-400 text-left font-mono">
                      Select Course to Auto-Schedule:
                    </label>
                    {paths.map((path) => (
                      <button
                        key={path.id}
                        onClick={() => handleAutoSchedule(path)}
                        className="w-full p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-[10px] font-mono text-slate-300 text-left truncate flex justify-between items-center"
                      >
                        <span className="truncate">{path.title}</span>
                        <span className="text-[8px] bg-blue-500/10 text-blue-400 px-1 py-0.2 rounded shrink-0">
                          Schedule
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500 mt-2">No active courses yet.</p>
                )}

                <div className="mt-6 pt-4 border-t border-slate-800 text-left">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">
                    💡 Pro Tip
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Click on any calendar day block to open the assignment editor and plan custom
                    milestones manually.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
