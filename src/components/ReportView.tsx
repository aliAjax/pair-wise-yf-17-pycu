import {
  DEVIATION_LIMIT,
  MaintenanceSession,
  allMissing,
  fmtCents,
  fmtTime,
  isException,
  isRecovered,
  summarizeByStop,
} from "../model";

interface Props {
  session: MaintenanceSession;
  onBack: () => void;
  onEdit: () => void;
}

export function ReportView({ session, onBack, onEdit }: Props) {
  const done = session.status === "done";
  const exceptions = session.entries.filter(isException);
  const recovered = exceptions.filter(isRecovered);
  const summaries = summarizeByStop(session);
  const missing = allMissing(session);
  const missingCount = missing.reduce((n, m) => n + m.fields.length, 0);

  const exportReport = () => {
    const lines: string[] = [
      `管风琴音管维护报告`,
      `场馆：${session.venue || "（未填）"}`,
      `温湿度：${session.temperature || "—"}℃ / ${session.humidity || "—"}%`,
      `创建：${fmtTime(session.createdAt)}　结束：${fmtTime(session.finishedAt)}`,
      `状态：${done ? "已完成" : "草稿（未结束，不计入完成）"}`,
      ``,
      `音管总数：${session.entries.length}　异常：${exceptions.length}　已恢复：${recovered.length}　未恢复：${exceptions.length - recovered.length}`,
      ``,
      `【按音栓汇总】`,
      ...summaries.map(
        (s) =>
          `${s.stop}（${s.category}）：音管 ${s.total}，异常 ${s.exceptions}，已恢复 ${s.recovered}，未恢复 ${s.outstanding}` +
          (s.maxDeviation !== null ? `，最大偏差 ${s.maxDeviation} 音分` : "")
      ),
      ``,
      `【异常与复测明细】`,
      ...(exceptions.length === 0
        ? ["无异常音管。"]
        : exceptions.map((e) => {
            const before = `初测 ${fmtCents(e.deviation)} 音分 / ${e.reedStatus || "簧片未填"}`;
            const after = e.retest
              ? `复测 ${fmtCents(e.retest.deviation)} 音分 / ${e.retest.reedStatus}`
              : "未复测";
            return `${e.pipeNo}（${e.stop} ${e.pitch}）：${before} → ${after}，${isRecovered(e) ? "已恢复" : "未恢复"}${e.note ? `，备注：${e.note}` : ""}`;
          })),
      ``,
      `【缺项清单】`,
      ...(missing.length === 0
        ? ["无缺项。"]
        : missing.map((m) => `${m.label}：缺 ${m.fields.join("、")}`)),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `维护报告-${session.venue || "未命名"}-${session.createdAt.slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>单次维护报告</p>
          <h2>
            {session.venue.trim() || "（未填场馆）"}
            <span className={"badge " + (done ? "badge-ok" : "badge-draft")}>
              {done ? "已完成" : "草稿 · 未结束不算完成"}
            </span>
          </h2>
        </div>
        <div className="row-actions">
          <button onClick={onEdit}>{done ? "查看记录" : "继续录入"}</button>
          <button className="primary" onClick={exportReport}>
            导出报告
          </button>
          <button onClick={onBack}>返回列表</button>
        </div>
      </div>

      <div className="report-meta">
        <span>温度：{session.temperature ? `${session.temperature}℃` : "—"}</span>
        <span>湿度：{session.humidity ? `${session.humidity}%` : "—"}</span>
        <span>创建：{fmtTime(session.createdAt)}</span>
        <span>结束：{fmtTime(session.finishedAt)}</span>
      </div>

      <div className="metrics metrics-report">
        <article>
          <small>音管总数</small>
          <strong>{session.entries.length}</strong>
        </article>
        <article>
          <small>异常音管</small>
          <strong>{exceptions.length}</strong>
        </article>
        <article>
          <small>复测已恢复</small>
          <strong>{recovered.length}</strong>
        </article>
        <article>
          <small>未恢复</small>
          <strong>{exceptions.length - recovered.length}</strong>
        </article>
      </div>

      <h3>按音栓汇总</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>音栓</th>
              <th>类别</th>
              <th>音管数</th>
              <th>异常数</th>
              <th>已恢复</th>
              <th>未恢复</th>
              <th>最大偏差</th>
            </tr>
          </thead>
          <tbody>
            {summaries.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  暂无音管记录。
                </td>
              </tr>
            )}
            {summaries.map((s) => (
              <tr key={s.stop}>
                <td>{s.stop}</td>
                <td>{s.category}</td>
                <td>{s.total}</td>
                <td>{s.exceptions}</td>
                <td>{s.recovered}</td>
                <td>{s.outstanding}</td>
                <td>{s.maxDeviation !== null ? `${s.maxDeviation} 音分` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>异常与复测明细（保留前后结果）</h3>
      {exceptions.length === 0 ? (
        <p className="empty">本次维护无异常音管（偏差限 ±{DEVIATION_LIMIT} 音分）。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>音管</th>
                <th>音栓 / 音高</th>
                <th>初测（前）</th>
                <th>复测（后）</th>
                <th>结果</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((e) => (
                <tr key={e.id}>
                  <td>{e.pipeNo}</td>
                  <td>
                    {e.stop} {e.pitch}
                  </td>
                  <td>
                    {fmtCents(e.deviation)} 音分 · {e.reedStatus || "簧片未填"}
                  </td>
                  <td>
                    {e.retest ? (
                      <>
                        {fmtCents(e.retest.deviation)} 音分 · {e.retest.reedStatus}
                        <small className="cell-sub">{fmtTime(e.retest.at)}</small>
                      </>
                    ) : (
                      "未复测"
                    )}
                  </td>
                  <td>
                    <span className={"badge " + (isRecovered(e) ? "badge-ok" : "badge-bad")}>
                      {isRecovered(e) ? "已恢复" : "未恢复"}
                    </span>
                  </td>
                  <td>
                    {e.note || "—"}
                    {e.retest?.note && <small className="cell-sub">复测：{e.retest.note}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>缺项清单</h3>
      {missing.length === 0 ? (
        <p className="empty">无缺项，记录完整。</p>
      ) : (
        <>
          <p className="error-banner">
            共 {missingCount} 项缺项。{done ? "" : "补全后才能结束维护。"}
          </p>
          <ul className="missing-list">
            {missing.map((m) => (
              <li key={m.label}>
                <strong>{m.label}</strong>：缺 {m.fields.join("、")}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
