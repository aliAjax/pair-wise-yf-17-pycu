import { Fragment, useState } from "react";
import {
  DEVIATION_LIMIT,
  MaintenanceSession,
  PipeEntry,
  REED_OPTIONS,
  STOP_GROUPS,
  allMissing,
  canFinish,
  categoryOfStop,
  entryMissing,
  fmtCents,
  fmtTime,
  isException,
  isRecovered,
  uid,
} from "../model";

interface Props {
  session: MaintenanceSession;
  onChange: (session: MaintenanceSession) => void;
  onBack: () => void;
  onOpenReport: () => void;
}

const EMPTY_ENTRY = { stop: "", pipeNo: "", pitch: "", deviation: "", reedStatus: "", note: "" };
const EMPTY_RETEST = { deviation: "", reedStatus: "", note: "" };

export function SessionDetail({ session, onChange, onBack, onOpenReport }: Props) {
  const [form, setForm] = useState(EMPTY_ENTRY);
  const [formError, setFormError] = useState("");
  const [stopFilter, setStopFilter] = useState("全部");
  const [retestFor, setRetestFor] = useState<string | null>(null);
  const [retestForm, setRetestForm] = useState(EMPTY_RETEST);
  const [retestError, setRetestError] = useState("");
  const [finishError, setFinishError] = useState("");

  const isDraft = session.status === "draft";
  const exceptions = session.entries.filter(isException);
  const missing = allMissing(session);
  const missingCount = missing.reduce((n, m) => n + m.fields.length, 0);

  const setMeta = (patch: Partial<MaintenanceSession>) => onChange({ ...session, ...patch });

  const setEntry = (id: string, patch: Partial<PipeEntry>) =>
    setMeta({ entries: session.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  const addEntry = () => {
    if (!form.stop.trim() || !form.pipeNo.trim()) {
      setFormError("音栓和音管编号必填，其余字段可稍后补录（计为缺项）。");
      return;
    }
    setFormError("");
    setMeta({
      entries: [
        ...session.entries,
        { id: uid(), ...form, stop: form.stop.trim(), pipeNo: form.pipeNo.trim(), retest: null },
      ],
    });
    setForm(EMPTY_ENTRY);
  };

  const removeEntry = (id: string) => setMeta({ entries: session.entries.filter((e) => e.id !== id) });

  const saveRetest = (entryId: string) => {
    if (!retestForm.deviation.trim() || !Number.isFinite(Number(retestForm.deviation)) || !retestForm.reedStatus) {
      setRetestError("请填写有效的复测偏差数值并选择簧片状态。");
      return;
    }
    setRetestError("");
    setEntry(entryId, {
      retest: { ...retestForm, deviation: retestForm.deviation.trim(), at: new Date().toISOString() },
    });
    setRetestFor(null);
    setRetestForm(EMPTY_RETEST);
  };

  const finish = () => {
    if (!canFinish(session)) {
      setFinishError(`还有 ${missingCount} 项缺项，补全后才能结束维护（详见维护报告「缺项清单」）。`);
      return;
    }
    setFinishError("");
    onChange({ ...session, status: "done", finishedAt: new Date().toISOString() });
    onOpenReport();
  };

  const reopen = () => setMeta({ status: "draft", finishedAt: null });

  const filteredEntries =
    stopFilter === "全部" ? session.entries : session.entries.filter((e) => categoryOfStop(e.stop) === stopFilter);

  return (
    <>
      <section className="panel">
        <div className="heading">
          <div>
            <p>单次维护</p>
            <h2>
              维护信息
              <span className={"badge " + (isDraft ? "badge-draft" : "badge-ok")}>
                {isDraft ? "草稿 · 未结束" : "已完成"}
              </span>
            </h2>
          </div>
          <div className="row-actions">
            <button onClick={onBack}>返回列表</button>
            <button onClick={onOpenReport}>维护报告</button>
            {isDraft ? (
              <>
                <button onClick={onBack}>保存草稿</button>
                <button className="primary" onClick={finish}>
                  结束维护
                </button>
              </>
            ) : (
              <button onClick={reopen}>重新开启</button>
            )}
          </div>
        </div>
        <div className="field-grid field-grid-4">
          <label>
            <span>场馆名称 *</span>
            <input
              value={session.venue}
              disabled={!isDraft}
              placeholder="教堂或音乐厅名称"
              onChange={(e) => setMeta({ venue: e.target.value })}
            />
          </label>
          <label>
            <span>温度（℃）*</span>
            <input
              type="number"
              value={session.temperature}
              disabled={!isDraft}
              placeholder="如 21.5"
              onChange={(e) => setMeta({ temperature: e.target.value })}
            />
          </label>
          <label>
            <span>湿度（%）*</span>
            <input
              type="number"
              value={session.humidity}
              disabled={!isDraft}
              placeholder="如 55"
              onChange={(e) => setMeta({ humidity: e.target.value })}
            />
          </label>
          <label>
            <span>创建时间</span>
            <input value={fmtTime(session.createdAt)} disabled />
          </label>
        </div>
        {isDraft && (
          <p className="hint">
            内容实时自动保存；记录不全可先存草稿，补全缺项后点「结束维护」才算完成。
            {missingCount > 0 && ` 当前缺项 ${missingCount} 项。`}
          </p>
        )}
        {finishError && <p className="error-banner">{finishError}</p>}
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>音栓筛选</h2>
          <div className="chips">
            {["全部", ...STOP_GROUPS.map((g) => g.category)].map((item) => (
              <button
                key={item}
                className={stopFilter === item ? "chip-active" : ""}
                onClick={() => setStopFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <h2 className="aside-subtitle">异常清单（自动）</h2>
          <p className="hint">偏差超过 ±{DEVIATION_LIMIT} 音分或簧片异常的音管自动进入清单。</p>
          <div className="exception-list">
            {exceptions.length === 0 && <p className="empty">暂无异常音管。</p>}
            {exceptions.map((entry) => (
              <div key={entry.id} className="exception-item">
                <strong>{entry.pipeNo}</strong>
                <span>
                  {entry.stop} · 初测 {fmtCents(entry.deviation)} 音分 · {entry.reedStatus || "簧片未填"}
                </span>
                <span className={"badge " + (isRecovered(entry) ? "badge-ok" : "badge-bad")}>
                  {isRecovered(entry) ? "已恢复" : entry.retest ? "复测仍异常" : "待复测"}
                </span>
              </div>
            ))}
          </div>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>逐根录入</p>
              <h2>新增音管</h2>
            </div>
          </div>
          {isDraft ? (
            <>
              <div className="field-grid">
                <label>
                  <span>音栓 *</span>
                  <input
                    list="stop-presets"
                    value={form.stop}
                    placeholder="如 Trumpet 8'"
                    onChange={(e) => setForm({ ...form, stop: e.target.value })}
                  />
                  <datalist id="stop-presets">
                    {STOP_GROUPS.flatMap((g) => g.stops).map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </label>
                <label>
                  <span>音管编号 *</span>
                  <input
                    value={form.pipeNo}
                    placeholder="如 T8-037"
                    onChange={(e) => setForm({ ...form, pipeNo: e.target.value })}
                  />
                </label>
                <label>
                  <span>音高</span>
                  <input
                    value={form.pitch}
                    placeholder="如 C#4"
                    onChange={(e) => setForm({ ...form, pitch: e.target.value })}
                  />
                </label>
                <label>
                  <span>音分偏差</span>
                  <input
                    type="number"
                    value={form.deviation}
                    placeholder="如 -12"
                    onChange={(e) => setForm({ ...form, deviation: e.target.value })}
                  />
                </label>
                <label>
                  <span>簧片状态</span>
                  <select value={form.reedStatus} onChange={(e) => setForm({ ...form, reedStatus: e.target.value })}>
                    <option value="">请选择</option>
                    {REED_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>维修备注</span>
                  <input
                    value={form.note}
                    placeholder="选填"
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </label>
              </div>
              {formError && <p className="error-banner">{formError}</p>}
              <div className="row-actions">
                <button className="primary" onClick={addEntry}>
                  添加音管
                </button>
              </div>
            </>
          ) : (
            <p className="hint">本次维护已结束，内容为只读。如需补录，请点击右上角「重新开启」。</p>
          )}
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>调音偏差表</p>
            <h2>音管记录（{filteredEntries.length}）</h2>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>音栓</th>
                <th>编号</th>
                <th>音高</th>
                <th>初测偏差</th>
                <th>簧片状态</th>
                <th>复测结果</th>
                <th>状态</th>
                <th>备注</th>
                {isDraft && <th>操作</th>}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={isDraft ? 9 : 8} className="empty">
                    暂无音管记录。
                  </td>
                </tr>
              )}
              {filteredEntries.map((entry) => {
                const miss = entryMissing(entry);
                const exception = isException(entry);
                const recovered = isRecovered(entry);
                return (
                  <Fragment key={entry.id}>
                    <tr className={exception && !recovered ? "row-bad" : ""}>
                      <td>
                        {entry.stop || "—"}
                        <small className="cell-sub">{categoryOfStop(entry.stop)}</small>
                      </td>
                      <td>{entry.pipeNo || "—"}</td>
                      <td>{entry.pitch || "—"}</td>
                      <td>{entry.deviation ? `${fmtCents(entry.deviation)} 音分` : "—"}</td>
                      <td>{entry.reedStatus || "—"}</td>
                      <td>
                        {entry.retest
                          ? `${fmtCents(entry.retest.deviation)} 音分 · ${entry.retest.reedStatus}`
                          : "—"}
                      </td>
                      <td>
                        {exception ? (
                          recovered ? (
                            <span className="badge badge-ok">已恢复</span>
                          ) : (
                            <span className="badge badge-bad">异常</span>
                          )
                        ) : (
                          <span className="badge badge-ok">正常</span>
                        )}
                        {miss.length > 0 && <span className="badge badge-warn">缺项 {miss.length}</span>}
                      </td>
                      <td>
                        {entry.note || "—"}
                        {entry.retest?.note && <small className="cell-sub">复测：{entry.retest.note}</small>}
                      </td>
                      {isDraft && (
                        <td className="cell-actions">
                          {exception && (
                            <button
                              onClick={() => {
                                setRetestFor(retestFor === entry.id ? null : entry.id);
                                setRetestForm(
                                  entry.retest
                                    ? {
                                        deviation: entry.retest.deviation,
                                        reedStatus: entry.retest.reedStatus,
                                        note: entry.retest.note,
                                      }
                                    : EMPTY_RETEST
                                );
                                setRetestError("");
                              }}
                            >
                              复测
                            </button>
                          )}
                          <button className="danger" onClick={() => removeEntry(entry.id)}>
                            删除
                          </button>
                        </td>
                      )}
                    </tr>
                    {retestFor === entry.id && isDraft && (
                      <tr className="retest-row">
                        <td colSpan={9}>
                          <div className="retest-form">
                            <strong>复测录入 · {entry.pipeNo}</strong>
                            <label>
                              <span>复测偏差（音分）*</span>
                              <input
                                type="number"
                                value={retestForm.deviation}
                                placeholder="如 2"
                                onChange={(e) => setRetestForm({ ...retestForm, deviation: e.target.value })}
                              />
                            </label>
                            <label>
                              <span>复测簧片状态 *</span>
                              <select
                                value={retestForm.reedStatus}
                                onChange={(e) => setRetestForm({ ...retestForm, reedStatus: e.target.value })}
                              >
                                <option value="">请选择</option>
                                {REED_OPTIONS.map((o) => (
                                  <option key={o} value={o}>
                                    {o}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>复测备注</span>
                              <input
                                value={retestForm.note}
                                placeholder="选填"
                                onChange={(e) => setRetestForm({ ...retestForm, note: e.target.value })}
                              />
                            </label>
                            <div className="row-actions">
                              <button className="primary" onClick={() => saveRetest(entry.id)}>
                                保存复测
                              </button>
                              <button onClick={() => setRetestFor(null)}>取消</button>
                            </div>
                          </div>
                          {retestError && <p className="error-banner">{retestError}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
