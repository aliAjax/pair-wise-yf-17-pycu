export interface RetestResult {
  deviation: string;
  reedStatus: string;
  note: string;
  at: string;
}

export interface PipeEntry {
  id: string;
  stop: string;
  pipeNo: string;
  pitch: string;
  deviation: string;
  reedStatus: string;
  note: string;
  retest: RetestResult | null;
}

export type SessionStatus = "draft" | "done";

export interface MaintenanceSession {
  id: string;
  venue: string;
  temperature: string;
  humidity: string;
  createdAt: string;
  finishedAt: string | null;
  status: SessionStatus;
  entries: PipeEntry[];
}

export const DEVIATION_LIMIT = 10;

export const REED_OPTIONS = ["正常", "需微调", "异常", "不适用"];

const REED_ABNORMAL = new Set(["需微调", "异常"]);

export const STOP_GROUPS: { category: string; stops: string[] }[] = [
  { category: "主音栓", stops: ["Principal 8'", "Principal 4'", "Octave 2'", "Gedackt 8'", "Salicional 8'"] },
  { category: "簧片音栓", stops: ["Trumpet 8'", "Trombone 16'", "Oboe 8'", "Clarinet 8'"] },
  { category: "混合音栓", stops: ["Mixture IV", "Cymbal III", "Sesquialtera II"] },
  { category: "低音管", stops: ["Bourdon 16'", "Subbass 16'", "Principal 16'"] },
];

export function categoryOfStop(stop: string): string {
  const name = stop.trim();
  for (const group of STOP_GROUPS) {
    if (group.stops.includes(name)) return group.category;
  }
  return "其他";
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function isNum(value: string): boolean {
  return value.trim() !== "" && Number.isFinite(Number(value));
}

export function fmtCents(value: string): string {
  if (!isNum(value)) return "—";
  const n = Number(value);
  return (n > 0 ? "+" : "") + n;
}

export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 初测是否异常：偏差超限或簧片异常 */
export function isException(entry: PipeEntry): boolean {
  const devOver = isNum(entry.deviation) && Math.abs(Number(entry.deviation)) > DEVIATION_LIMIT;
  return devOver || REED_ABNORMAL.has(entry.reedStatus);
}

/** 复测是否合格：偏差不超限且簧片状态正常/不适用 */
export function isRecovered(entry: PipeEntry): boolean {
  const rt = entry.retest;
  if (!rt) return false;
  if (!isNum(rt.deviation) || Math.abs(Number(rt.deviation)) > DEVIATION_LIMIT) return false;
  return rt.reedStatus !== "" && !REED_ABNORMAL.has(rt.reedStatus);
}

/** 音管记录缺项（备注为选填，不计入） */
export function entryMissing(entry: PipeEntry): string[] {
  const missing: string[] = [];
  if (!entry.stop.trim()) missing.push("音栓");
  if (!entry.pipeNo.trim()) missing.push("音管编号");
  if (!entry.pitch.trim()) missing.push("音高");
  if (!isNum(entry.deviation)) missing.push("音分偏差");
  if (!entry.reedStatus) missing.push("簧片状态");
  return missing;
}

/** 会话级缺项 */
export function sessionMissing(session: MaintenanceSession): string[] {
  const missing: string[] = [];
  if (!session.venue.trim()) missing.push("场馆名称");
  if (!isNum(session.temperature)) missing.push("温度");
  if (!isNum(session.humidity)) missing.push("湿度");
  if (session.entries.length === 0) missing.push("音管记录（至少一根）");
  return missing;
}

/** 全部缺项：会话级 + 逐根音管 */
export function allMissing(session: MaintenanceSession): { label: string; fields: string[] }[] {
  const result: { label: string; fields: string[] }[] = [];
  const sm = sessionMissing(session);
  if (sm.length > 0) result.push({ label: "维护信息", fields: sm });
  for (const entry of session.entries) {
    const em = entryMissing(entry);
    if (em.length > 0) {
      result.push({ label: entry.pipeNo.trim() || entry.stop.trim() || "未命名音管", fields: em });
    }
  }
  return result;
}

export function canFinish(session: MaintenanceSession): boolean {
  return allMissing(session).length === 0;
}

export interface StopSummary {
  stop: string;
  category: string;
  total: number;
  exceptions: number;
  recovered: number;
  outstanding: number;
  maxDeviation: number | null;
}

/** 报告：按音栓汇总异常与恢复数 */
export function summarizeByStop(session: MaintenanceSession): StopSummary[] {
  const map = new Map<string, StopSummary>();
  for (const entry of session.entries) {
    const key = entry.stop.trim() || "（未填音栓）";
    let row = map.get(key);
    if (!row) {
      row = { stop: key, category: categoryOfStop(key), total: 0, exceptions: 0, recovered: 0, outstanding: 0, maxDeviation: null };
      map.set(key, row);
    }
    row.total += 1;
    if (isNum(entry.deviation)) {
      const abs = Math.abs(Number(entry.deviation));
      row.maxDeviation = row.maxDeviation === null ? abs : Math.max(row.maxDeviation, abs);
    }
    if (isException(entry)) {
      row.exceptions += 1;
      if (isRecovered(entry)) row.recovered += 1;
      else row.outstanding += 1;
    }
  }
  return [...map.values()].sort((a, b) => b.exceptions - a.exceptions || a.stop.localeCompare(b.stop));
}

const STORAGE_KEY = "hxyfront-62005.sessions.v1";

const SAMPLE_SESSIONS: MaintenanceSession[] = [
  {
    id: "sample-st-mary",
    venue: "St.Mary",
    temperature: "21.5",
    humidity: "55",
    createdAt: "2026-09-11T09:30:00",
    finishedAt: "2026-09-11T11:10:00",
    status: "done",
    entries: [
      {
        id: "sample-st-mary-1",
        stop: "Trumpet 8'",
        pipeNo: "T8-037",
        pitch: "C#4",
        deviation: "9",
        reedStatus: "需微调",
        note: "簧片需微调",
        retest: { deviation: "2", reedStatus: "正常", note: "簧片轻调后复测合格", at: "2026-09-11T10:45:00" },
      },
    ],
  },
  {
    id: "sample-concert-hall-a",
    venue: "ConcertHall A",
    temperature: "22",
    humidity: "50",
    createdAt: "2026-09-18T14:00:00",
    finishedAt: "2026-09-18T15:20:00",
    status: "done",
    entries: [
      {
        id: "sample-concert-hall-a-1",
        stop: "Principal 4'",
        pipeNo: "P4-021",
        pitch: "G3",
        deviation: "-3",
        reedStatus: "正常",
        note: "正常",
        retest: null,
      },
    ],
  },
  {
    id: "sample-abbey-room",
    venue: "Abbey Room",
    temperature: "19.8",
    humidity: "62",
    createdAt: "2026-09-24T10:15:00",
    finishedAt: "2026-09-24T11:40:00",
    status: "done",
    entries: [
      {
        id: "sample-abbey-room-1",
        stop: "Bourdon 16'",
        pipeNo: "B16-014",
        pitch: "F2",
        deviation: "-12",
        reedStatus: "不适用",
        note: "标记复检",
        retest: null,
      },
    ],
  },
];

export function loadSessions(): MaintenanceSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as MaintenanceSession[];
    }
  } catch {
    // 存储不可用时退回样例
  }
  return SAMPLE_SESSIONS;
}

export function saveSessions(sessions: MaintenanceSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // 存储不可用时仅保留在内存
  }
}
