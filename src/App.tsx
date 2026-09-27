import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  MaintenanceSession,
  isException,
  isRecovered,
  loadSessions,
  saveSessions,
  uid,
} from "./model";
import { SessionList } from "./components/SessionList";
import { SessionDetail } from "./components/SessionDetail";
import { ReportView } from "./components/ReportView";

const project = {
  id: "hxyfront-62005",
  sourceNo: 7,
  port: 62005,
  title: "管风琴音管调音记录",
  prompt:
    "做一个给管风琴维护人员使用的音管调音记录前端项目，可以记录教堂或音乐厅名称、音栓、音管编号、音高、音分偏差、温湿度、簧片状态和维修备注。页面需要有音栓列表、调音偏差表、温湿度记录、异常音管标记和单次维护报告页。",
};

type View = { name: "list" } | { name: "session"; id: string } | { name: "report"; id: string };

function App() {
  const [sessions, setSessions] = useState<MaintenanceSession[]>(loadSessions);
  const [view, setView] = useState<View>({ name: "list" });

  useEffect(() => {
    saveSessions(sessions);
  }, [sessions]);

  const currentId = view.name === "list" ? null : view.id;
  const current = sessions.find((s) => s.id === currentId) ?? null;

  /** 指标取当前打开的会话，否则取最近一次的维护 */
  const metricSession = useMemo(() => {
    if (current) return current;
    return [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  }, [current, sessions]);

  const metrics = useMemo(() => {
    if (!metricSession) return ["0", "0", "—", "—"];
    const stops = new Set(metricSession.entries.map((e) => e.stop.trim()).filter(Boolean));
    const outstanding = metricSession.entries.filter((e) => isException(e) && !isRecovered(e)).length;
    return [
      String(stops.size),
      String(outstanding),
      metricSession.temperature ? `${metricSession.temperature}℃` : "—",
      metricSession.humidity ? `${metricSession.humidity}%` : "—",
    ];
  }, [metricSession]);

  const updateSession = (next: MaintenanceSession) =>
    setSessions((prev) => prev.map((s) => (s.id === next.id ? next : s)));

  const createSession = () => {
    const session: MaintenanceSession = {
      id: uid(),
      venue: "",
      temperature: "",
      humidity: "",
      createdAt: new Date().toISOString(),
      finishedAt: null,
      status: "draft",
      entries: [],
    };
    setSessions((prev) => [...prev, session]);
    setView({ name: "session", id: session.id });
  };

  const deleteSession = (id: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setView({ name: "list" });
  };

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
        {["音栓数量", "偏差超限", "温度", "湿度"].map((label, index) => (
          <article key={label}>
            <small>{label}</small>
            <strong>{metrics[index]}</strong>
          </article>
        ))}
      </section>

      {view.name === "list" && (
        <SessionList
          sessions={sessions}
          onCreate={createSession}
          onOpen={(id) => setView({ name: "session", id })}
          onReport={(id) => setView({ name: "report", id })}
          onDelete={deleteSession}
        />
      )}

      {view.name === "session" && current && (
        <SessionDetail
          session={current}
          onChange={updateSession}
          onBack={() => setView({ name: "list" })}
          onOpenReport={() => setView({ name: "report", id: current.id })}
        />
      )}

      {view.name === "report" && current && (
        <ReportView
          session={current}
          onBack={() => setView({ name: "list" })}
          onEdit={() => setView({ name: "session", id: current.id })}
        />
      )}
    </main>
  );
}

export default App;
