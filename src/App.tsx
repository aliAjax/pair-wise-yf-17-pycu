import { Fragment, useEffect, useMemo, useState } from "react";
import "./styles.css";

/* ------------------------------------------------------------------ */
/* 项目元信息（保留原样板） */
/* ------------------------------------------------------------------ */

const project = {
  sourceNo: 7,
  id: "hxyfront-62005",
  port: 62005,
  title: "管风琴音管调音记录",
  domain: "管风琴维护",
  prompt:
    "做一个给管风琴维护人员使用的音管调音记录前端项目，可以记录教堂或音乐厅名称、音栓、音管编号、音高、音分偏差、温湿度、簧片状态和维修备注。页面需要有音栓列表、调音偏差表、温湿度记录、异常音管标记和单次维护报告页。",
  palette: ["#854d0e", "#475569", "#0ea5e9"],
  metrics: ["音栓数量", "偏差超限", "温度", "湿度"],
  filters: ["主音栓", "簧片音栓", "混合音栓", "低音管"],
};

/* ------------------------------------------------------------------ */
/* 数据模型 */
/* ------------------------------------------------------------------ */

const DEVIATION_LIMIT = 10; // 音分偏差超限阈值：超过 ±10 自动进入异常清单
const STORAGE_KEY = "hxyfront-62005:sessions:v1";

const REED_OPTIONS = ["正常", "需微调", "异响", "卡涩", "失灵"] as const;
type ReedStatus = (typeof REED_OPTIONS)[number];

/** 一次测量结果：初测或复测，前后结果都保留 */
interface Measurement {
  deviation: number | null; // 音分偏差
  reed: ReedStatus | ""; // 簧片状态
  note: string; // 维修备注
  at: string; // 录入时间
}

interface PipeEntry {
  id: string;
  stop: string; // 音栓
  pipeNo: string; // 音管编号
  pitch: string; // 音高
  measurements: Measurement[]; // 第一条为初测，其余为复测
}

interface Session {
  id: string;
  sample?: boolean; // 样例场次
  venue: string; // 场馆名称
  temperature: string; // 温度 ℃
  humidity: string; // 湿度 %
  startedAt: string;
  endedAt: string | null;
  status: "draft" | "done"; // 未结束的维护一律是草稿，不算完成
  entries: PipeEntry[];
}

/** 常见音栓目录，用于筛选分类与录入联想 */
const STOP_CATALOG: { name: string; category: string }[] = [
  { name: "Principal 8'", category: "主音栓" },
  { name: "Principal 4'", category: "主音栓" },
  { name: "Octave 2'", category: "主音栓" },
  { name: "Trumpet 8'", category: "簧片音栓" },
  { name: "Trombone 16'", category: "簧片音栓" },
  { name: "Oboe 8'", category: "簧片音栓" },
  { name: "Mixture IV", category: "混合音栓" },
  { name: "Scharf III", category: "混合音栓" },
  { name: "Bourdon 16'", category: "低音管" },
  { name: "Subbass 16'", category: "低音管" },
];

/* ------------------------------------------------------------------ */
/* 判定与工具 */
/* ------------------------------------------------------------------ */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function now() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function parseDeviation(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function fmtDev(d: number | null) {
  if (d === null) return "—";
  return d > 0 ? `+${d}` : `${d}`;
}

function reedAbnormal(reed: string) {
  return reed !== "" && reed !== "正常";
}

function measurementAbnormal(m: Measurement) {
  return (
    (m.deviation !== null && Math.abs(m.deviation) > DEVIATION_LIMIT) ||
    reedAbnormal(m.reed)
  );
}

function measurementComplete(m: Measurement) {
  return m.deviation !== null && m.reed !== "";
}

function currentOf(e: PipeEntry) {
  return e.measurements[e.measurements.length - 1];
}

/** 曾出现过异常（初测或任意一次复测） */
function everAbnormal(e: PipeEntry) {
  return e.measurements.some(measurementAbnormal);
}

/** 复测合格：曾异常，且最新一次测量完整且不超限 */
function entryRecovered(e: PipeEntry) {
  const cur = currentOf(e);
  return everAbnormal(e) && measurementComplete(cur) && !measurementAbnormal(cur);
}

/** 待处理异常：曾异常且尚未复测合格 */
function entryPending(e: PipeEntry) {
  return everAbnormal(e) && !entryRecovered(e);
}

function lastAbnormal(e: PipeEntry) {
  return [...e.measurements].reverse().find(measurementAbnormal);
}

/** 记录缺项：用于草稿提示与报告缺项清单 */
function missingFields(e: PipeEntry): string[] {
  const m = currentOf(e);
  const miss: string[] = [];
  if (!e.stop.trim()) miss.push("音栓");
  if (!e.pipeNo.trim()) miss.push("音管编号");
  if (!e.pitch.trim()) miss.push("音高");
  if (m.deviation === null) miss.push("音分偏差");
  if (!m.reed) miss.push("簧片状态");
  return miss;
}

function stopCategory(stop: string) {
  return STOP_CATALOG.find((s) => s.name === stop)?.category ?? "其他";
}

/* ------------------------------------------------------------------ */
/* 样例数据（保留原样板记录，作为一场已完成的维护） */
/* ------------------------------------------------------------------ */

function seedSessions(): Session[] {
  return [
    {
      id: "sample-20260920",
      sample: true,
      venue: "St.Mary 大教堂",
      temperature: "18",
      humidity: "55",
      startedAt: "2026/9/20 09:30:00",
      endedAt: "2026/9/20 12:10:00",
      status: "done",
      entries: [
        {
          id: "sample-p1",
          stop: "Trumpet 8'",
          pipeNo: "T-12",
          pitch: "C#4",
          measurements: [
            { deviation: 9, reed: "需微调", note: "簧片需微调", at: "2026/9/20 09:41:00" },
            { deviation: 2, reed: "正常", note: "复测合格", at: "2026/9/20 10:05:00" },
          ],
        },
        {
          id: "sample-p2",
          stop: "Principal 4'",
          pipeNo: "P-08",
          pitch: "G3",
          measurements: [
            { deviation: -3, reed: "正常", note: "正常", at: "2026/9/20 10:20:00" },
          ],
        },
        {
          id: "sample-p3",
          stop: "Bourdon 16'",
          pipeNo: "B-21",
          pitch: "F2",
          measurements: [
            { deviation: -12, reed: "正常", note: "标记复检", at: "2026/9/20 11:02:00" },
          ],
        },
      ],
    },
  ];
}

function loadSessions(): Session[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Session[];
    }
  } catch {
    /* 数据损坏时重新播种样例 */
  }
  return seedSessions();
}

/* ------------------------------------------------------------------ */
/* 表单初始值 */
/* ------------------------------------------------------------------ */

const emptyEntryForm = { stop: "", pipeNo: "", pitch: "", deviation: "", reed: "", note: "" };
const emptyRetestForm = { deviation: "", reed: "", note: "" };

/* ------------------------------------------------------------------ */
/* 工作台 */
/* ------------------------------------------------------------------ */

function App() {
  const [sessions, setSessions] = useState<Session[]>(loadSessions);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [category, setCategory] = useState("全部");
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [retestId, setRetestId] = useState<string | null>(null);
  const [retestForm, setRetestForm] = useState(emptyRetestForm);
  const [savedTip, setSavedTip] = useState(false);

  // 任何变动都自动落盘，重开页面仍看得到
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions]);

  const session =
    sessions.find((s) => s.id === activeId) ??
    sessions.find((s) => s.status === "draft") ??
    sessions[0] ??
    null;
  const editable = session?.status === "draft";

  /* ---------- 汇总数据 ---------- */

  const metricValues = useMemo(() => {
    if (!session) return ["0", "0", "—", "—"];
    const stops = new Set(session.entries.map((e) => e.stop.trim()).filter(Boolean));
    const over = session.entries.filter((e) => {
      const d = currentOf(e).deviation;
      return d !== null && Math.abs(d) > DEVIATION_LIMIT;
    }).length;
    return [
      String(stops.size),
      String(over),
      session.temperature ? `${session.temperature}℃` : "—",
      session.humidity ? `${session.humidity}%` : "—",
    ];
  }, [session]);

  const visibleEntries = useMemo(() => {
    if (!session) return [] as PipeEntry[];
    if (category === "全部") return session.entries;
    return session.entries.filter((e) => stopCategory(e.stop) === category);
  }, [session, category]);

  const exceptions = useMemo(
    () => (session ? session.entries.filter(entryPending) : []),
    [session]
  );

  const sessionMissing = useMemo(() => {
    if (!session) return [] as string[];
    const miss: string[] = [];
    if (!session.venue.trim()) miss.push("场馆名称");
    if (!session.temperature.trim()) miss.push("温度");
    if (!session.humidity.trim()) miss.push("湿度");
    return miss;
  }, [session]);

  const entryMissing = useMemo(
    () =>
      session
        ? session.entries
            .map((e, i) => ({ e, i, miss: missingFields(e) }))
            .filter((x) => x.miss.length > 0)
        : [],
    [session]
  );

  const report = useMemo(() => {
    if (!session) return [];
    const map = new Map<
      string,
      { stop: string; total: number; abnormal: number; recovered: number; pending: number }
    >();
    for (const e of session.entries) {
      const key = e.stop.trim() || "（未填音栓）";
      const row = map.get(key) ?? { stop: key, total: 0, abnormal: 0, recovered: 0, pending: 0 };
      row.total += 1;
      if (everAbnormal(e)) {
        row.abnormal += 1;
        if (entryRecovered(e)) row.recovered += 1;
        else row.pending += 1;
      }
      map.set(key, row);
    }
    return [...map.values()];
  }, [session]);

  const recoveredCount = session ? session.entries.filter(entryRecovered).length : 0;
  const abnormalTotal = session ? session.entries.filter(everAbnormal).length : 0;

  /* ---------- 操作 ---------- */

  function patchSession(id: string, patch: Partial<Session>) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function updateEntries(fn: (entries: PipeEntry[]) => PipeEntry[]) {
    if (!session) return;
    patchSession(session.id, { entries: fn(session.entries) });
  }

  function startSession() {
    const s: Session = {
      id: uid(),
      venue: "",
      temperature: "",
      humidity: "",
      startedAt: now(),
      endedAt: null,
      status: "draft",
      entries: [],
    };
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setCategory("全部");
    setRetestId(null);
  }

  function endSession() {
    if (!session || !editable) return;
    const hints: string[] = [];
    if (session.entries.length === 0) hints.push("尚未录入任何音管");
    const missCount = sessionMissing.length + entryMissing.length;
    if (missCount > 0) hints.push(`仍有 ${missCount} 处缺项`);
    if (exceptions.length > 0) hints.push(`${exceptions.length} 根音管异常待复测`);
    if (
      hints.length > 0 &&
      !window.confirm(`${hints.join("；")}。结束后报告会如实列出，确定结束本次维护吗？`)
    ) {
      return;
    }
    patchSession(session.id, { status: "done", endedAt: now() });
    setRetestId(null);
  }

  function saveDraft() {
    if (!session) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    setSavedTip(true);
    window.setTimeout(() => setSavedTip(false), 1600);
  }

  function addEntry() {
    if (!session || !editable) return;
    const { stop, pipeNo, pitch, deviation, reed, note } = entryForm;
    const allEmpty =
      !stop.trim() && !pipeNo.trim() && !pitch.trim() && !deviation.trim() && !reed && !note.trim();
    if (allEmpty) {
      window.alert("请至少填写一项音管信息；记录不全可以先存草稿，报告会列出缺项。");
      return;
    }
    const entry: PipeEntry = {
      id: uid(),
      stop: stop.trim(),
      pipeNo: pipeNo.trim(),
      pitch: pitch.trim(),
      measurements: [
        { deviation: parseDeviation(deviation), reed: reed as ReedStatus | "", note: note.trim(), at: now() },
      ],
    };
    updateEntries((es) => [...es, entry]);
    setEntryForm(emptyEntryForm);
  }

  function removeEntry(id: string) {
    updateEntries((es) => es.filter((x) => x.id !== id));
    if (retestId === id) setRetestId(null);
  }

  function openRetest(e: PipeEntry) {
    setRetestId(e.id);
    setRetestForm(emptyRetestForm);
  }

  function submitRetest(entryId: string) {
    const { deviation, reed, note } = retestForm;
    if (!deviation.trim() && !reed && !note.trim()) {
      window.alert("复测至少填写一项结果（音分偏差 / 簧片状态 / 备注）。");
      return;
    }
    const m: Measurement = {
      deviation: parseDeviation(deviation),
      reed: reed as ReedStatus | "",
      note: note.trim(),
      at: now(),
    };
    updateEntries((es) =>
      es.map((x) => (x.id === entryId ? { ...x, measurements: [...x.measurements, m] } : x))
    );
    setRetestId(null);
    setRetestForm(emptyRetestForm);
  }

  /* ---------- 渲染辅助 ---------- */

  function statusBadge(e: PipeEntry) {
    if (entryPending(e)) {
      const label = measurementAbnormal(currentOf(e))
        ? e.measurements.length > 1
          ? "复测仍异常"
          : "异常"
        : "待复测";
      return <span className="badge badge-danger">{label}</span>;
    }
    if (entryRecovered(e)) return <span className="badge badge-ok">已恢复</span>;
    if (missingFields(e).length > 0) return <span className="badge badge-warn">缺项</span>;
    return <span className="badge badge-muted">正常</span>;
  }

  /* ---------- 页面 ---------- */

  return (
    <main className="app">
      <section className="hero">
        <p>
          {project.id} · 源提示词{project.sourceNo} · Port {project.port}
        </p>
        <h1>{project.title}</h1>
        <span>{project.prompt}</span>
      </section>

      <section className="metrics">
        {project.metrics.map((metric: string, index: number) => (
          <article key={metric}>
            <small>{metric}</small>
            <strong>{metricValues[index] ?? "—"}</strong>
          </article>
        ))}
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>{project.domain}筛选</h2>
          <div className="chips">
            {["全部", ...project.filters].map((c) => (
              <button
                key={c}
                className={category === c ? "chip-active" : ""}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <h3 className="aside-sub">音栓列表</h3>
          <div className="stop-list">
            {STOP_CATALOG.map((s) => {
              const count = session
                ? session.entries.filter((e) => e.stop === s.name).length
                : 0;
              return (
                <div className="stop-row" key={s.name}>
                  <span>
                    {s.name}
                    <small>{s.category}</small>
                  </span>
                  <b>{count}</b>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>现场录入工作台</p>
              <h2>
                本次维护{" "}
                {session && (
                  <span className={`badge ${session.status === "done" ? "badge-ok" : "badge-warn"}`}>
                    {session.status === "done" ? "已完成" : "草稿 · 未结束"}
                  </span>
                )}
              </h2>
            </div>
            <div className="heading-actions">
              {editable && <button onClick={saveDraft}>保存草稿</button>}
              {editable && (
                <button className="primary" onClick={endSession}>
                  结束维护
                </button>
              )}
              <button onClick={startSession}>开始新维护</button>
            </div>
          </div>

          {!session && <p className="muted">点击「开始新维护」建立一次维护记录。</p>}

          {session && (
            <>
              <div className="field-grid three">
                <label>
                  <span>场馆名称</span>
                  <input
                    value={session.venue}
                    disabled={!editable}
                    placeholder="教堂 / 音乐厅名称"
                    onChange={(e) => patchSession(session.id, { venue: e.target.value })}
                  />
                </label>
                <label>
                  <span>温度（℃）</span>
                  <input
                    type="number"
                    value={session.temperature}
                    disabled={!editable}
                    placeholder="如 18"
                    onChange={(e) => patchSession(session.id, { temperature: e.target.value })}
                  />
                </label>
                <label>
                  <span>湿度（%）</span>
                  <input
                    type="number"
                    value={session.humidity}
                    disabled={!editable}
                    placeholder="如 55"
                    onChange={(e) => patchSession(session.id, { humidity: e.target.value })}
                  />
                </label>
              </div>
              <p className="muted">
                开始时间：{session.startedAt}
                {session.endedAt ? ` · 结束时间：${session.endedAt}` : " · 未结束，本次维护不计完成"}
              </p>

              {editable ? (
                <>
                  <h3 className="aside-sub">逐根录入音管</h3>
                  <div className="field-grid three">
                    <label>
                      <span>音栓</span>
                      <input
                        list="stop-options"
                        value={entryForm.stop}
                        placeholder="如 Trumpet 8'"
                        onChange={(e) => setEntryForm({ ...entryForm, stop: e.target.value })}
                      />
                      <datalist id="stop-options">
                        {STOP_CATALOG.map((s) => (
                          <option key={s.name} value={s.name} />
                        ))}
                      </datalist>
                    </label>
                    <label>
                      <span>音管编号</span>
                      <input
                        value={entryForm.pipeNo}
                        placeholder="如 T-12"
                        onChange={(e) => setEntryForm({ ...entryForm, pipeNo: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>音高</span>
                      <input
                        value={entryForm.pitch}
                        placeholder="如 C#4"
                        onChange={(e) => setEntryForm({ ...entryForm, pitch: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>音分偏差</span>
                      <input
                        type="number"
                        value={entryForm.deviation}
                        placeholder={`如 -12，超过 ±${DEVIATION_LIMIT} 自动进异常清单`}
                        onChange={(e) => setEntryForm({ ...entryForm, deviation: e.target.value })}
                      />
                    </label>
                    <label>
                      <span>簧片状态</span>
                      <select
                        value={entryForm.reed}
                        onChange={(e) => setEntryForm({ ...entryForm, reed: e.target.value })}
                      >
                        <option value="">请选择</option>
                        {REED_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>维修备注</span>
                      <input
                        value={entryForm.note}
                        placeholder="现场情况、处理措施"
                        onChange={(e) => setEntryForm({ ...entryForm, note: e.target.value })}
                      />
                    </label>
                  </div>
                  <div className="form-actions">
                    <button className="primary" onClick={addEntry}>
                      录入音管
                    </button>
                    {savedTip && <span className="saved-tip">草稿已保存</span>}
                  </div>
                </>
              ) : (
                <p className="readonly-note">
                  本次维护已结束，内容仅可查看；录入新数据请点「开始新维护」。
                </p>
              )}
            </>
          )}
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>调音偏差表</p>
            <h2>音管记录（{session?.entries.length ?? 0}）</h2>
          </div>
        </div>
        {session && session.entries.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>音栓</th>
                  <th>音管编号</th>
                  <th>音高</th>
                  <th>音分偏差</th>
                  <th>簧片状态</th>
                  <th>状态</th>
                  <th>维修备注</th>
                  {editable && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((e, i) => {
                  const first = e.measurements[0];
                  const cur = currentOf(e);
                  const over = cur.deviation !== null && Math.abs(cur.deviation) > DEVIATION_LIMIT;
                  return (
                    <Fragment key={e.id}>
                      <tr className={entryPending(e) ? "row-danger" : ""}>
                        <td>{i + 1}</td>
                        <td>{e.stop || "—"}</td>
                        <td>{e.pipeNo || "—"}</td>
                        <td>{e.pitch || "—"}</td>
                        <td>
                          <span className={over ? "dev-over" : ""}>{fmtDev(cur.deviation)}</span>
                          {e.measurements.length > 1 && (
                            <small className="muted">
                              {" "}
                              （初测 {fmtDev(first.deviation)} · 复测 {e.measurements.length - 1} 次）
                            </small>
                          )}
                        </td>
                        <td>
                          {cur.reed || "—"}
                          {e.measurements.length > 1 && first.reed !== cur.reed && (
                            <small className="muted">（初测 {first.reed || "—"}）</small>
                          )}
                        </td>
                        <td>{statusBadge(e)}</td>
                        <td>{cur.note || "—"}</td>
                        {editable && (
                          <td>
                            <div className="ops">
                              <button className="mini" onClick={() => openRetest(e)}>
                                复测
                              </button>
                              <button className="mini danger" onClick={() => removeEntry(e.id)}>
                                删除
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {retestId === e.id && (
                        <tr className="retest-row">
                          <td colSpan={editable ? 9 : 8}>
                            <div className="retest-box">
                              <b>
                                复测录入 · {e.stop || "未填音栓"} {e.pipeNo || ""}
                              </b>
                              <span className="muted">
                                初测：偏差 {fmtDev(first.deviation)} / 簧片 {first.reed || "—"}
                                ，复测结果会与初测一起保留
                              </span>
                              <div className="field-grid three">
                                <label>
                                  <span>复测音分偏差</span>
                                  <input
                                    type="number"
                                    value={retestForm.deviation}
                                    placeholder="如 2"
                                    onChange={(ev) =>
                                      setRetestForm({ ...retestForm, deviation: ev.target.value })
                                    }
                                  />
                                </label>
                                <label>
                                  <span>复测簧片状态</span>
                                  <select
                                    value={retestForm.reed}
                                    onChange={(ev) =>
                                      setRetestForm({ ...retestForm, reed: ev.target.value })
                                    }
                                  >
                                    <option value="">请选择</option>
                                    {REED_OPTIONS.map((r) => (
                                      <option key={r} value={r}>
                                        {r}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  <span>复测备注</span>
                                  <input
                                    value={retestForm.note}
                                    placeholder="处理措施、复测结论"
                                    onChange={(ev) =>
                                      setRetestForm({ ...retestForm, note: ev.target.value })
                                    }
                                  />
                                </label>
                              </div>
                              <div className="form-actions">
                                <button className="primary" onClick={() => submitRetest(e.id)}>
                                  保存复测
                                </button>
                                <button onClick={() => setRetestId(null)}>取消</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">还没有音管记录，先在上方逐根录入。</p>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>自动标记 · 偏差超过 ±{DEVIATION_LIMIT} 音分或簧片异常</p>
            <h2>异常清单（{exceptions.length}）</h2>
          </div>
        </div>
        {exceptions.length === 0 ? (
          <p className="muted">当前没有待处理的异常音管。</p>
        ) : (
          <div className="records">
            {exceptions.map((e, i) => {
              const m = lastAbnormal(e) ?? currentOf(e);
              const reasons: string[] = [];
              if (m.deviation !== null && Math.abs(m.deviation) > DEVIATION_LIMIT) {
                reasons.push(`偏差 ${fmtDev(m.deviation)} 音分`);
              }
              if (reedAbnormal(m.reed)) reasons.push(`簧片${m.reed}`);
              return (
                <article key={e.id}>
                  <b>{String(i + 1).padStart(2, "0")}</b>
                  <div>
                    <h3>
                      {e.stop || "未填音栓"} · {e.pipeNo || "未编号"} · {e.pitch || "—"}
                    </h3>
                    <p>
                      {reasons.join("；")}
                      {e.measurements.length > 1
                        ? ` · 已复测 ${e.measurements.length - 1} 次仍未合格`
                        : " · 待复测"}
                      {m.note ? ` · 备注：${m.note}` : ""}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>单次维护报告</p>
            <h2>{session?.venue.trim() || "未填写场馆"}</h2>
          </div>
          {session && (
            <span className={`badge ${session.status === "done" ? "badge-ok" : "badge-warn"}`}>
              {session.status === "done" ? `已完成 · ${session.endedAt}` : "草稿 · 未结束不计完成"}
            </span>
          )}
        </div>
        {session && (
          <>
            <div className="report-meta">
              <span>温度：{session.temperature ? `${session.temperature}℃` : "缺"}</span>
              <span>湿度：{session.humidity ? `${session.humidity}%` : "缺"}</span>
              <span>录入音管：{session.entries.length} 根</span>
              <span>异常：{abnormalTotal} 根</span>
              <span>已恢复：{recoveredCount} 根</span>
            </div>
            {report.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>音栓</th>
                      <th>录入数</th>
                      <th>异常数</th>
                      <th>已恢复</th>
                      <th>待复测</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.map((r) => (
                      <tr key={r.stop}>
                        <td>{r.stop}</td>
                        <td>{r.total}</td>
                        <td>{r.abnormal}</td>
                        <td>{r.recovered}</td>
                        <td>{r.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">暂无数据。</p>
            )}
            <h3 className="aside-sub">缺项（{sessionMissing.length + entryMissing.length}）</h3>
            {sessionMissing.length + entryMissing.length === 0 ? (
              <p className="muted">记录完整，无缺项。</p>
            ) : (
              <ul className="missing-list">
                {sessionMissing.map((m) => (
                  <li key={m}>维护信息缺：{m}</li>
                ))}
                {entryMissing.map(({ e, i, miss }) => (
                  <li key={e.id}>
                    第 {i + 1} 根（{e.stop || "未填音栓"} {e.pipeNo || "未编号"}）缺：
                    {miss.join("、")}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>历史记录</p>
            <h2>维护场次（{sessions.length}）</h2>
          </div>
        </div>
        <div className="records">
          {sessions.map((s, i) => (
            <article
              key={s.id}
              className={`session-item ${session?.id === s.id ? "active" : ""}`}
              onClick={() => {
                setActiveId(s.id);
                setRetestId(null);
              }}
            >
              <b>{String(i + 1).padStart(2, "0")}</b>
              <div>
                <h3>
                  {s.venue.trim() || "未填写场馆"}{" "}
                  {s.sample && <span className="badge badge-muted">样例</span>}{" "}
                  <span className={`badge ${s.status === "done" ? "badge-ok" : "badge-warn"}`}>
                    {s.status === "done" ? "已完成" : "草稿"}
                  </span>
                </h3>
                <p>
                  {s.startedAt} · 音管 {s.entries.length} 根 · 异常{" "}
                  {s.entries.filter(entryPending).length} 根
                  {s.endedAt ? ` · 结束于 ${s.endedAt}` : " · 未结束"}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
