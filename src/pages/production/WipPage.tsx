import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Check,
  Clock3,
  Download,
  Expand,
  History,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  addWipRemark,
  createWipEntry,
  getWipHistory,
  getWipOptions,
  getWipRemarks,
  listWipEntries,
  updateWipEntry,
  type WipEntry,
} from "@/api/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShareButton } from "@/components/ShareButton";
import { useSharedView } from "@/context/SharedViewContext";
const cols = [
  ["customer_name", "Customer Name"],
  ["site_name", "Site Name"],
  ["location", "Location"],
  ["region", "Region"],
  ["capacity", "Capacity"],
  ["bandwidth", "Bandwidth"],
  ["planned_adss_distance", "Planned ADSS Distance"],
  ["planned_drop_cable_distance", "Planned Drop Cable Distance"],
  ["service_type", "Service Type"],
  ["cpe", "CPE"],
  ["start_date", "Start Date"],
  ["completion_date", "Completion Date"],
  ["confirmation_date", "Confirmation Date"],
  ["status", "Status"],
  ["mrc", "MRC"],
  ["sale_price", "Sale Price"],
  ["through_value", "Through"],
  ["existing_poles", "Existing Poles"],
  ["remarks", "Remarks"],
] as const;
const dates = new Set(["start_date", "completion_date", "confirmation_date"]),
  long = new Set(["remarks", "location", "cpe"]);
const lab = (f: string) =>
  cols.find(([k]) => k === f)?.[1] || f.replace(/_/g, " ");
export default function WipPage() {
  const { isSharedView, recordId: sharedRecordId } = useSharedView();
  const [rows, setRows] = useState<WipEntry[]>([]),
    [search, setSearch] = useState(""),
    [options, setOptions] = useState({
      regions: [] as string[],
      serviceTypes: [] as string[],
    }),
    [sel, setSel] = useState<WipEntry | null>(null),
    [hist, setHist] = useState<any[]>([]),
    [notes, setNotes] = useState<any[]>([]),
    [note, setNote] = useState(""),
    [edit, setEdit] = useState<any>(null),
    [pop, setPop] = useState<any>(null),
    [state, setState] = useState<Record<number, string>>({});
  const timers = useRef<Record<string, number>>({});
  const load = useCallback(async () => {
    if (isSharedView) {
      setRows(await listWipEntries());
      return;
    }
    const [a, b] = await Promise.all([listWipEntries(), getWipOptions()]);
    setRows(a);
    setOptions(b);
  }, [isSharedView]);
  useEffect(() => {
    void load();
    return () => Object.values(timers.current).forEach(clearTimeout);
  }, [load]);
  useEffect(() => {
    if (isSharedView && sharedRecordId != null && rows.length > 0 && !sel) {
      const match = rows.find((r) => r.id === sharedRecordId) || rows[0];
      if (match) setSel(match);
    }
  }, [isSharedView, sharedRecordId, rows, sel]);
  const detail = async (id: number) => {
    if (isSharedView) return;
    const [a, b] = await Promise.all([getWipHistory(id), getWipRemarks(id)]);
    setHist(a);
    setNotes(b);
  };
  const open = (r: WipEntry) => {
    setSel(r);
    void detail(r.id);
  };
  const save = (id: number, f: string, v: any) => {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, [f]: v } : r)));
    setSel((p) => (p?.id === id ? { ...p, [f]: v } : p));
    clearTimeout(timers.current[`${id}-${f}`]);
    setState((p) => ({ ...p, [id]: "saving" }));
    timers.current[`${id}-${f}`] = window.setTimeout(async () => {
      try {
        const x = await updateWipEntry(id, { [f]: v });
        setRows((p) => p.map((r) => (r.id === id ? { ...r, ...x } : r)));
        setSel((p) => (p?.id === id ? { ...p, ...x } : p));
        setState((p) => ({ ...p, [id]: "saved" }));
        void detail(id);
        setTimeout(
          () =>
            setState((p) => {
              const q = { ...p };
              delete q[id];
              return q;
            }),
          1600,
        );
      } catch {
        setState((p) => ({ ...p, [id]: "failed" }));
        setTimeout(() => save(id, f, v), 2500);
      }
    }, 2000);
  };
  const shown = useMemo(
    () =>
      rows.filter((r) =>
        JSON.stringify(r).toLowerCase().includes(search.toLowerCase()),
      ),
    [rows, search],
  );
  const add = async () => {
    const r = await createWipEntry({ status: "In Progress" });
    setRows((p) => [...p, r]);
    open(r);
  };
  const addNote = async () => {
    if (sel && note.trim()) {
      const x = await addWipRemark(sel.id, note);
      setNotes((p) => [x, ...p]);
      setNote("");
    }
  };
  const exportX = async () => {
    const X = await import("xlsx"),
      d = shown.map((r, i) =>
        Object.fromEntries([
          ["SN", i + 1],
          ...cols.map(([k, l]) => [l, r[k] || ""]),
        ]),
      );
    const w = X.utils.book_new();
    X.utils.book_append_sheet(w, X.utils.json_to_sheet(d), "WIP");
    X.writeFile(w, "work-in-progress.xlsx");
  };
  const filtered = pop
    ? hist.filter((h) => !pop.f || h.field_name === pop.f)
    : [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap justify-between gap-4 rounded-2xl border bg-[var(--surface)] p-6">
        <div>
          <h1 className="text-2xl font-bold">Work In Progress</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Live project tracking — every change is retained.
          </p>
        </div>
        {!isSharedView && (
        <div className="flex gap-2">
          <ShareButton
            recordType="wip_register"
            recordId={0}
            pagePath={window.location.pathname}
            pageTitle="Work In Progress"
            recordPreview={{ title: "Work In Progress", type: "WIP Register", records: rows.length.toLocaleString() }}
          />
          <Button onClick={() => void add()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Row
          </Button>
          <Button variant="outline" onClick={() => void exportX()}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
        )}
      </div>
      {!isSharedView && (
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4" />
        <Input
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all WIP columns..."
        />
      </div>
      )}
      <div className="overflow-auto rounded-xl border bg-[var(--surface)]">
        <table className="min-w-[2700px] text-sm">
          <thead>
            <tr className="bg-[var(--surface-secondary)]">
              <th className="p-3">SN</th>
              {cols.map(([, l]) => (
                <th className="p-3 text-left" key={l}>
                  {l}
                </th>
              ))}
              <th>History</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr
                onClick={() => open(r)}
                className={`cursor-pointer border-t hover:bg-sky-50 ${sel?.id === r.id ? "border-l-4 border-sky-500 bg-sky-50" : ""}`}
                key={r.id}
              >
                <td className="p-2">
                  {i + 1}
                  <Small state={state[r.id]} />
                </td>
                {cols.map(([f]) => (
                  <td
                    className="group relative p-1"
                    onClick={(e) => e.stopPropagation()}
                    key={f}
                  >
                    {edit?.id === r.id && edit.f === f ? (
                      <div className="absolute z-30 w-72 rounded border bg-white p-2 shadow-xl">
                        <textarea
                          autoFocus
                          className="min-h-24 w-full resize"
                          value={r[f] || ""}
                          onChange={(e) => save(r.id, f, e.target.value)}
                          onBlur={() => setEdit(null)}
                          onKeyDown={(e) => e.key === "Escape" && setEdit(null)}
                        />
                      </div>
                    ) : (
                      <button
                        title={r[f] || ""}
                        className="block min-h-9 max-w-44 min-w-32 truncate rounded px-2 text-left hover:bg-sky-100"
                        onClick={() => setEdit({ id: r.id, f })}
                      >
                        {r[f] || "—"}
                        {String(r[f] || "").length > 22 && (
                          <Expand className="ml-1 inline h-3 w-3" />
                        )}
                      </button>
                    )}
                    <button
                      className="absolute right-0 top-0 hidden group-hover:block"
                      onClick={() => {
                        setPop({ id: r.id, f });
                        void detail(r.id);
                      }}
                    >
                      <Clock3 className="h-3 w-3" />
                    </button>
                  </td>
                ))}
                <td>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPop({ id: r.id });
                      void detail(r.id);
                    }}
                  >
                    <History className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="region-options">
          {options.regions.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </div>
      {sel && (
        <Panel
          r={sel}
          close={() => setSel(null)}
          save={save}
          state={state[sel.id]}
          hist={hist}
          notes={notes}
          note={note}
          setNote={setNote}
          addNote={addNote}
        />
      )}{" "}
      {pop && (
        <Popup
          title={
            pop.f ? `Change history — ${lab(pop.f)}` : "Row change history"
          }
          rows={filtered}
          close={() => setPop(null)}
        />
      )}
    </div>
  );
}
function Small({ state }: any) {
  return state === "saving" ? (
    <i className="ml-1 text-[10px] text-slate-400">Saving…</i>
  ) : state === "saved" ? (
    <i className="ml-1 text-[10px] text-emerald-600">● Saved</i>
  ) : state === "failed" ? (
    <i className="ml-1 text-[10px] text-rose-600">Save failed — retrying</i>
  ) : null;
}
function Panel({
  r,
  close,
  save,
  state,
  hist,
  notes,
  note,
  setNote,
  addNote,
}: any) {
  const { isSharedView } = useSharedView();
  const day =
    r.start_date && r.completion_date
      ? Math.round(
          (+new Date(r.completion_date) - +new Date(r.start_date)) / 86400000,
        )
      : null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30">
      <aside className="ml-auto h-full max-w-5xl overflow-auto bg-slate-50 p-5 shadow-2xl">
        <div className="sticky top-0 flex justify-between bg-slate-50 pb-4">
          <div>
            <b className="text-emerald-700">
              WIP-{String(r.id).padStart(3, "0")}
            </b>
            <h2 className="text-2xl font-bold">
              {r.customer_name || "Unnamed Customer"}
            </h2>
            <p>{r.site_name}</p>
          </div>
          <div className="flex items-center gap-2">
            <Small state={state} />
            {!isSharedView && (
            <ShareButton
              recordType="wip_entry"
              recordId={r.id}
              pagePath={window.location.pathname}
              pageTitle={`WIP-${String(r.id).padStart(3, "0")} — ${r.customer_name || "Unnamed Customer"}`}
              recordPreview={{
                title: r.customer_name || "Unnamed Customer",
                reference: `WIP-${String(r.id).padStart(3, "0")}`,
                status: r.status,
                site: r.site_name,
                region: r.region,
              }}
            />
            )}
            <Button size="icon" variant="ghost" onClick={close}>
              <X />
            </Button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card
            t="Identity"
            fs={["customer_name", "site_name", "location", "region"]}
            r={r}
            save={save}
            readOnly={isSharedView}
          />
          <Card
            t="Technical Details"
            fs={[
              "capacity",
              "bandwidth",
              "planned_adss_distance",
              "planned_drop_cable_distance",
              "service_type",
              "cpe",
            ]}
            r={r}
            save={save}
            readOnly={isSharedView}
          />
          <Card
            t="Timeline"
            fs={["start_date", "completion_date", "confirmation_date"]}
            r={r}
            save={save}
            extra={`Total Days: ${day ?? "—"}`}
            readOnly={isSharedView}
          />
          <Card
            t="Commercial"
            fs={["mrc", "sale_price", "through_value", "existing_poles"]}
            r={r}
            save={save}
            readOnly={isSharedView}
          />
          <Card
            t="Status & Remarks"
            fs={["status", "remarks"]}
            r={r}
            save={save}
            readOnly={isSharedView}
          />
          {!isSharedView && (
          <section className="rounded-xl border bg-white p-4">
            <h3 className="font-bold">Remarks History</h3>
            {notes.map((n: any) => (
              <div
                className="mt-2 border-l-2 border-emerald-400 pl-2 text-sm"
                key={n.id}
              >
                <b>{n.author_name}</b>
                <p>{n.note_text}</p>
                <small>{new Date(n.created_at).toLocaleString()}</small>
              </div>
            ))}
            <textarea
              className="mt-3 min-h-20 w-full resize rounded border p-2"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a remark…"
            />
            <Button size="sm" className="mt-2" onClick={() => void addNote()}>
              Add remark
            </Button>
          </section>
          )}
          {!isSharedView && (
          <section className="rounded-xl border bg-white p-4 md:col-span-2">
            <h3 className="font-bold">Change History</h3>
            <HistoryRows rows={hist} />
          </section>
          )}
        </div>
      </aside>
    </div>
  );
}
function Card({ t, fs, r, save, extra, readOnly }: any) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <h3 className="mb-3 font-bold">{t}</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {fs.map((f: string) => (
          <label className="text-xs font-semibold text-slate-500" key={f}>
            {lab(f)}
            {f === "status" ? (
              <select
                disabled={readOnly}
                className="mt-1 w-full rounded border p-2 text-slate-900"
                value={r[f] || "In Progress"}
                onChange={(e) => save(r.id, f, e.target.value)}
              >
                <option>In Progress</option>
                <option>Completed</option>
                <option>On Hold</option>
                <option>Cancelled</option>
              </select>
            ) : long.has(f) ? (
              <textarea
                disabled={readOnly}
                className="mt-1 min-h-20 w-full resize rounded border p-2 text-slate-900"
                value={r[f] || ""}
                onChange={(e) => save(r.id, f, e.target.value)}
              />
            ) : (
              <Input
                disabled={readOnly}
                className="mt-1 text-slate-900"
                type={dates.has(f) ? "date" : "text"}
                value={r[f] || ""}
                onChange={(e) => save(r.id, f, e.target.value)}
              />
            )}
          </label>
        ))}
      </div>
      {extra && (
        <p className="mt-3 rounded bg-slate-100 p-2 text-sm">{extra}</p>
      )}
    </section>
  );
}
function HistoryRows({ rows }: any) {
  return (
    <div className="max-h-72 overflow-auto">
      {rows.length ? (
        rows.map((h: any) => (
          <div className="grid border-b py-2 text-sm md:grid-cols-5" key={h.id}>
            <b>{lab(h.field_name)}</b>
            <span>{h.old_value || "—"}</span>
            <span>{h.new_value || "—"}</span>
            <span>{h.changed_by_name}</span>
            <small>{new Date(h.created_at).toLocaleString()}</small>
          </div>
        ))
      ) : (
        <p className="text-sm text-slate-400">No changes recorded yet.</p>
      )}
    </div>
  );
}
function Popup({ title, rows, close }: any) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/20 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-4 shadow-2xl">
        <div className="flex justify-between">
          <h3 className="font-bold">{title}</h3>
          <Button size="icon" variant="ghost" onClick={close}>
            <X />
          </Button>
        </div>
        <HistoryRows rows={rows} />
      </div>
    </div>
  );
}
