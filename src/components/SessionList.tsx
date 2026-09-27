import {
  MaintenanceSession,
  allMissing,
  fmtTime,
  isException,
  isRecovered,
} from "../model";

interface Props {
  sessions: MaintenanceSession[];
  onCreate: () => void;
  onOpen: (id: string) => void;
  onReport: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SessionList({ sessions, onCreate, onOpen, onReport, onDelete }: Props) {
  const sorted = [...sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>维护工作台</p>
          <h2>维护记录</h2>
        </div>
        <button className="primary" onClick={onCreate}>
          新建维护
        </button>
      </div>
      <div className="records">
        {sorted.map((session, index) => {
          const exceptions = session.entries.filter(isException);
          const outstanding = exceptions.filter((e) => !isRecovered(e)).length;
          const missingCount = allMissing(session).reduce((n, m) => n + m.fields.length, 0);
          const done = session.status === "done";
          return (
            <article key={session.id}>
              <b>{String(sorted.length - index).padStart(2, "0")}</b>
              <div>
                <h3>
                  {session.venue.trim() || "（未填场馆）"}
                  <span className={"badge " + (done ? "badge-ok" : "badge-draft")}>
                    {done ? "已完成" : "草稿 · 未结束"}
                  </span>
                </h3>
                <p>
                  创建 {fmtTime(session.createdAt)}
                  {done && ` · 结束 ${fmtTime(session.finishedAt)}`}
                  {` · 音管 ${session.entries.length} 根`}
                  {exceptions.length > 0 && ` · 异常 ${exceptions.length}（未恢复 ${outstanding}）`}
                  {!done && missingCount > 0 && ` · 缺项 ${missingCount}`}
                  {session.temperature && session.humidity && ` · ${session.temperature}℃ / ${session.humidity}%`}
                </p>
                <div className="row-actions">
                  <button onClick={() => onOpen(session.id)}>{done ? "查看" : "继续录入"}</button>
                  <button onClick={() => onReport(session.id)}>维护报告</button>
                  {!done && (
                    <button
                      className="danger"
                      onClick={() => {
                        if (window.confirm("确定删除这条草稿吗？删除后不可恢复。")) onDelete(session.id);
                      }}
                    >
                      删除
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {sorted.length === 0 && <p className="empty">暂无维护记录，点击「新建维护」开始。</p>}
      </div>
    </section>
  );
}
