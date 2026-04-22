import React, { useEffect, useMemo, useState } from "react";
import moment from "moment/moment";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import Breadcrumbs from "/src/components/Common/Breadcrumb";
import { buildClaimUrl, getAppPublicBase } from "/src/helpers/claimUrl";
import {
  createSooryoAuthorizedClient,
  getAuthUserId,
  getSooryoApiBaseUrl,
} from "/src/helpers/sooryoApi";

import {
  Badge,
  Button,
  Card,
  CardBody,
  Col,
  Container,
  Form,
  FormFeedback,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalHeader,
  Row,
  Spinner,
} from "reactstrap";

const MAX_QR_BATCH = 500;

/** API may return a bare array or `{ data: [...] }`. */
function listFromApiPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

function normalizeQrRow(raw) {
  const claimed = raw.is_claimed === true || raw.is_claimed === 1;
  const claimedAt = raw.claimed_at;
  return {
    id: raw.id,
    serial_number: String(raw.serial_number ?? ""),
    wedding_id:
      raw.wedding_id !== undefined && raw.wedding_id !== null && raw.wedding_id !== ""
        ? Number(raw.wedding_id)
        : null,
    token: String(raw.token ?? ""),
    amount: raw.amount,
    active_from: raw.active_from || null,
    active_to: raw.active_to || null,
    activated_at: raw.activated_at || null,
    is_claimed: claimed ? 1 : 0,
    claimed_phone: raw.claimed_phone || null,
    claimed_at:
      claimedAt && String(claimedAt).trim() !== "" && !/^0000-00-00/.test(String(claimedAt))
        ? claimedAt
        : null,
    created_at: raw.created_at || "",
  };
}

function formatMoneyAmount(n) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  return x.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusForRow(qr) {
  if (qr?.is_claimed === 1 || qr?.is_claimed === true) return "claimed";
  const af = qr?.active_from ? new Date(qr.active_from) : null;
  const at = qr?.active_to ? new Date(qr.active_to) : null;
  const now = new Date();
  if (!af || Number.isNaN(af.getTime()) || !at || Number.isNaN(at.getTime())) return "inactive";
  if (now > at) return "expired";
  if (now >= af && now <= at) return "active";
  return "inactive";
}

function badgeForStatus(status) {
  switch (status) {
    case "active":
      return { color: "success", label: "Active" };
    case "expired":
      return { color: "danger", label: "Expired" };
    case "claimed":
      return { color: "primary", label: "Claimed" };
    default:
      return { color: "secondary", label: "Inactive" };
  }
}

function assignmentBadge(qr) {
  if (qr?.wedding_id != null && Number.isFinite(Number(qr.wedding_id))) {
    return { color: "info", label: "Assigned" };
  }
  return { color: "light", label: "Unassigned" };
}

function QrPreview({ token, scanUrl }) {
  if (!scanUrl) {
    return (
      <div className="small text-muted text-center py-4 px-2">
        Set <code>VITE_PUBLIC_APP_URL</code> so QR links use a reachable host from a phone.
      </div>
    );
  }

  const apiBase = (getSooryoApiBaseUrl() || "").replace(/\/$/, "");
  const src = `${apiBase}/v1/public/qr/${encodeURIComponent(token)}/image.png`;
  return (
    <img
      src={src}
      alt=""
      className="img-fluid mx-auto d-block rounded"
      style={{ maxWidth: 180, maxHeight: 180 }}
      loading="lazy"
    />
  );
}

const QrCodes = () => {
  document.title = "QR codes";
  const api = useMemo(() => createSooryoAuthorizedClient(), []);

  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [masterPrintOpen, setMasterPrintOpen] = useState(false);

  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [activateModalOpen, setActivateModalOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activateTouched, setActivateTouched] = useState(false);
  const [activateForm, setActivateForm] = useState({ active_from: "", active_to: "" });

  const [genTouched, setGenTouched] = useState(false);
  const [genForm, setGenForm] = useState({ count: "1", amount: "0.00" });
  const [weddings, setWeddings] = useState([]);
  const [selectedWeddingId, setSelectedWeddingId] = useState("");
  const [rangeForm, setRangeForm] = useState({ from: "", to: "", unassignedOnly: true });
  const [rangeTouched, setRangeTouched] = useState(false);
  const [selectingRange, setSelectingRange] = useState(false);
  const [rangeFilter, setRangeFilter] = useState(null); // { from, to, unassignedOnly } | null
  const [assigning, setAssigning] = useState(false);
  const [unassigning, setUnassigning] = useState(false);

  const refresh = async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/v1/qr-codes`);
      const list = listFromApiPayload(data).map((x) => normalizeQrRow(x));
      setCodes(list);
      setRangeFilter(null);
    } catch {
      toast.error("Could not load QR codes");
      setCodes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const loadWeddings = async () => {
    const uid = getAuthUserId();
    if (uid == null || Number.isNaN(uid)) {
      toast.error("Please sign in again");
      setWeddings([]);
      return;
    }
    try {
      const { data } = await api.get(`/v1/user/${uid}/weddings`);
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setWeddings(list);
    } catch {
      setWeddings([]);
      toast.error("Could not load weddings");
    }
  };

  useEffect(() => {
    loadWeddings();
  }, []);

  const selectedCount = selectedIds.size;
  const codesById = useMemo(() => {
    const m = new Map();
    for (const c of codes) m.set(c.id, c);
    return m;
  }, [codes]);

  const selectedRowsForPrint = useMemo(() => {
    const rows = Array.from(selectedIds)
      .map((id) => codesById.get(id))
      .filter(Boolean)
      .sort((a, b) => String(a.serial_number || "").localeCompare(String(b.serial_number || "")));
    return rows;
  }, [selectedIds, codesById]);
  const anySelectedClaimed = useMemo(() => {
    for (const id of selectedIds) {
      const row = codesById.get(id);
      if (row?.is_claimed === 1) return true;
    }
    return false;
  }, [selectedIds, codesById]);

  const weddingNameById = useMemo(() => {
    const m = new Map();
    for (const w of weddings) m.set(Number(w.id), String(w.name || ""));
    return m;
  }, [weddings]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openGenerateModal = () => {
    setGenTouched(false);
    setGenForm({ count: "1", amount: "0.00" });
    setGenerateModalOpen(true);
  };

  const isValidSerial = (s) => {
    const x = String(s || "").trim();
    return /^\d{4,}$/.test(x);
  };

  const selectRange = async () => {
    setRangeTouched(true);
    const from = String(rangeForm.from || "").trim();
    const to = String(rangeForm.to || "").trim();
    if (!isValidSerial(from) || !isValidSerial(to)) return;
    if (from > to) return;

    try {
      setSelectingRange(true);
      const qs = new URLSearchParams({
        from,
        to,
        unassigned: rangeForm.unassignedOnly ? "1" : "0",
      });
      const { data } = await api.get(`/v1/qr-codes/range?${qs.toString()}`);
      const list = listFromApiPayload(data).map((x) => normalizeQrRow(x));
      if (list.length === 0) {
        toast.info("No QR codes found in that range");
        return;
      }
      const eligible = list.filter((r) => r.is_claimed !== 1);
      const skipped = list.length - eligible.length;

       // Filter the visible cards to only the fetched range.
       setCodes(list);
       setRangeFilter({ from, to, unassignedOnly: rangeForm.unassignedOnly });

      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const row of eligible) next.add(row.id);
        return next;
      });
      toast.success(`Selected ${eligible.length} QR codes from ${from} to ${to}`);
      if (skipped > 0) toast.info(`${skipped} claimed code(s) were skipped`);
    } catch {
      toast.error("Could not select range");
    } finally {
      setSelectingRange(false);
    }
  };

  const assignSelectedToWedding = async () => {
    const wid = Number(selectedWeddingId);
    const ids = Array.from(selectedIds);
    if (!Number.isFinite(wid) || wid < 1) {
      toast.info("Select a wedding first");
      return;
    }
    if (ids.length === 0) {
      toast.info("Select at least one QR code");
      return;
    }
    if (anySelectedClaimed) {
      toast.info("Claimed QR codes cannot be assigned/unassigned");
      return;
    }
    for (const id of ids) {
      const row = codesById.get(id);
      if (row?.wedding_id != null && Number(row.wedding_id) !== wid) {
        toast.info("Selection includes QR codes already assigned to another wedding");
        return;
      }
    }

    try {
      setAssigning(true);
      await api.post(`/v1/qr-codes/assign`, { ids, wedding_id: wid });
      toast.success(`Assigned ${ids.length} QR codes`);
      setSelectedIds(new Set());
      await refresh();
    } catch {
      toast.error("Could not assign QR codes");
    } finally {
      setAssigning(false);
    }
  };

  const unassignSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.info("Select at least one QR code");
      return;
    }
    if (anySelectedClaimed) {
      toast.info("Claimed QR codes cannot be assigned/unassigned");
      return;
    }
    try {
      setUnassigning(true);
      await api.post(`/v1/qr-codes/unassign`, { ids });
      toast.success(`Unassigned ${ids.length} QR codes`);
      setSelectedIds(new Set());
      await refresh();
    } catch {
      toast.error("Could not unassign QR codes");
    } finally {
      setUnassigning(false);
    }
  };

  const exportSelectedPDF = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.info("Select at least one QR code");
      return;
    }
    try {
      const res = await api.post(
        `/v1/qr-codes/export/pdf`,
        { ids },
        { responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `qr-cards-${ids.length}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      toast.error("Could not export PDF");
    }
  };

  const printSelectedMasterCards = async () => {
    if (selectedIds.size === 0) {
      toast.info("Select at least one QR code");
      return;
    }
    setMasterPrintOpen(true);
  };

  useEffect(() => {
    if (!masterPrintOpen) return;

    const onAfterPrint = () => setMasterPrintOpen(false);
    window.addEventListener("afterprint", onAfterPrint);

    const t = setTimeout(() => {
      window.print();
    }, 100);

    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [masterPrintOpen]);

  const generate = async () => {
    setGenTouched(true);
    const count = Number(genForm.count);
    const amount = Number(genForm.amount);
    if (!Number.isFinite(count) || count < 1 || count > MAX_QR_BATCH) return;
    if (!Number.isFinite(amount) || amount < 0) return;

    try {
      setGenerating(true);
      await api.post(`/v1/qr-codes/generate`, { count, amount });
      toast.success(`${count} QR code${count === 1 ? "" : "s"} generated`);
      setGenerateModalOpen(false);
      await refresh();
    } catch (err) {
      toast.error("Could not generate QR codes");
    } finally {
      setGenerating(false);
    }
  };

  const openActivateModal = () => {
    if (selectedCount === 0) {
      toast.info("Select at least one QR code");
      return;
    }
    setActivateTouched(false);
    setActivateForm({ active_from: "", active_to: "" });
    setActivateModalOpen(true);
  };

  const activate = async () => {
    setActivateTouched(true);
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!activateForm.active_from || !activateForm.active_to) return;

    const fromDate = new Date(activateForm.active_from);
    const toDate = new Date(activateForm.active_to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return;

    try {
      setActivating(true);
      await api.post(`/v1/qr-codes/activate`, {
        ids,
        active_from: fromDate.toISOString(),
        active_to: toDate.toISOString(),
      });
      toast.success(`Activated ${ids.length} QR code${ids.length === 1 ? "" : "s"}`);
      setActivateModalOpen(false);
      setSelectedIds(new Set());
      await refresh();
    } catch {
      toast.error("Could not activate QR codes");
    } finally {
      setActivating(false);
    }
  };

  return (
    <React.Fragment>
      <div className="page-content">
        <style>{`
          /* Print-only master cards */
          @page { size: A4; margin: 10mm; }
          #qr-master-print-root { display: none; }
          .ms-app { display: block; }
          .ms-grid {
            display: grid;
            grid-template-columns: repeat(2, 85.6mm);
            gap: 6mm;
            align-content: start;
            justify-content: start;
            padding: 0;
          }
          .ms-card {
            width: 85.6mm;
            height: 54mm;
            border-radius: 4mm;
            padding: 4.2mm 4.2mm 3.8mm;
            overflow: hidden;
            /* Mostly-white background to reduce ink usage */
            background:
              linear-gradient(110deg,
                #ffffff 0%,
                #ffffff 62%,
                #0b5b46 62%,
                #064436 100%);
            border: 0.25mm solid rgba(11, 91, 70, 0.85);
            color: #0f172a;
            font-family: "Segoe UI", Arial, sans-serif;
            position: relative;
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .ms-row { display: flex; gap: 4mm; height: 100%; }
          .ms-left { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
          .ms-row { gap: 3.2mm; }
          .ms-right { width: 27mm; flex: 0 0 27mm; display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start; gap: 2mm; padding-right: 2.4mm; padding-top: 0.2mm; }

          .ms-brand { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-weight: 600; letter-spacing: 0.2mm; font-size: 11pt; color: rgba(15, 23, 42, 0.9); }
          .ms-brand-line { margin-left: 2mm; display: inline-block; width: 12mm; height: 0.4mm; background: rgba(15, 23, 42, 0.2); vertical-align: middle; }

          .ms-balance-label { margin-top: 6mm; font-size: 6pt; letter-spacing: 0.55mm; text-transform: uppercase; color: rgba(15, 23, 42, 0.55); }
          .ms-amount { margin-top: 1.4mm; display: flex; align-items: flex-end; gap: 0.7mm; line-height: 1; }
          .ms-currency { font-size: 18pt; font-weight: 750; color: rgba(15, 23, 42, 0.92); }
          .ms-major { font-size: 28pt; font-weight: 850; letter-spacing: -0.35mm; color: rgba(15, 23, 42, 0.95); }
          .ms-minor { font-size: 12pt; font-weight: 750; padding-bottom: 1.1mm; color: rgba(15, 23, 42, 0.55); }

          .ms-divider { margin-top: 3.2mm; height: 0.35mm; background: rgba(15, 23, 42, 0.12); width: 100%; }

          .ms-bottom { margin-top: auto; display: flex; align-items: flex-end; justify-content: space-between; gap: 7mm; padding-top: 1.3mm; }
          .ms-bottom-block { min-width: 0; flex: 1 1 0; }
          .ms-bottom-block:last-child { text-align: left; }
          .ms-bottom-label { font-size: 5.8pt; letter-spacing: 0.55mm; text-transform: uppercase; color: rgba(15, 23, 42, 0.55); }
          .ms-bottom-value { margin-top: 0.9mm; font-size: 11pt; font-weight: 850; letter-spacing: 0.15mm; color: rgba(15, 23, 42, 0.92); }

          .ms-qr-wrap {
            width: 24.5mm;
            height: 24.5mm;
            border-radius: 3.2mm;
            background: rgba(255,255,255,0.92);
            padding: 1.8mm;
            border: 0.25mm solid rgba(15, 23, 42, 0.35);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: 30px;
          }
          .ms-qr { width: 100%; height: 100%; object-fit: contain; }
          .ms-chip {
            width: 9mm;
            height: 6.4mm;
            border-radius: 1.2mm;
            background: linear-gradient(145deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06));
            border: 0.2mm solid rgba(255,255,255,0.18);
          }
          /* circles removed */

          @media print {
            /* Only print the master cards layer (avoid blank pages). */
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .ms-app { display: none !important; }
            .Toastify { display: none !important; }
            #qr-master-print-root {
              display: block !important;
              position: static;
              width: auto;
            }
          }
        `}</style>

        {masterPrintOpen ? (
          <div id="qr-master-print-root">
            <div className="ms-grid">
              {selectedRowsForPrint.map((qr) => {
                const apiBase = (getSooryoApiBaseUrl() || "").replace(/\/$/, "");
                const qrSrc = `${apiBase}/v1/public/qr/${encodeURIComponent(qr.token)}/image.png`;
                const serial = String(qr.serial_number || "").trim();
                const amountText = formatMoneyAmount(qr.amount);
                const [majorRaw, minorRaw] = String(amountText).split(".");
                const major = majorRaw || amountText;
                const minor = minorRaw ? `.${minorRaw}` : "";
                return (
                  <div className="ms-card" key={`ms-${qr.id}`}>
                    <div className="ms-row">
                      <div className="ms-left">
                        <div className="ms-brand">
                          E-sooryo <span className="ms-brand-line" aria-hidden="true" />
                        </div>

                        <div className="ms-balance-label">AVAILABLE BALANCE</div>
                        <div className="ms-amount">
                          <span className="ms-currency">$</span>
                          <span className="ms-major">{major}</span>
                          {minor ? <span className="ms-minor">{minor}</span> : null}
                        </div>

                        <div className="ms-divider" />

                        <div className="ms-bottom">
                          <div className="ms-bottom-block">
                            <div className="ms-bottom-label">CONTACT US ON</div>
                            <div className="ms-bottom-value">5050</div>
                          </div>
                          <div className="ms-bottom-block">
                            <div className="ms-bottom-label">SERIAL NUMBER</div>
                            <div className="ms-bottom-value">{serial || "—"}</div>
                          </div>
                        </div>
                      </div>

                      <div className="ms-right">
                        {/* <div className="ms-chip" aria-hidden="true" /> */}
                        <div className="ms-qr-wrap">
                          <img className="ms-qr" src={qrSrc} alt="" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="ms-app">
          <Container fluid>
            <Breadcrumbs title="QR codes" breadcrumbItem="QR codes" />

          <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
            <div>
              <h5 className="mb-1">QR codes</h5>
              <p className="text-muted mb-0">
                Generate inactive codes (serial + amount), then select and activate them for a time
                window.
              </p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Button type="button" color="success" onClick={openGenerateModal}>
                <i className="bx bx-plus font-size-16 align-middle me-1" />
                Generate
              </Button>
              <Button
                type="button"
                color="primary"
                outline
                disabled={selectedCount === 0}
                onClick={openActivateModal}
              >
                Activate selected {selectedCount ? `(${selectedCount})` : ""}
              </Button>
              <Button type="button" color="light" onClick={refresh}>
                Refresh
              </Button>
            </div>
          </div>

          <Card className="border shadow-sm mb-4">
            <CardBody>
              <Row className="g-3 align-items-end">
                <Col md={4}>
                  <Label className="mb-1">Wedding</Label>
                  <Input
                    type="select"
                    value={selectedWeddingId}
                    onChange={(e) => setSelectedWeddingId(e.target.value)}
                  >
                    <option value="">Select wedding…</option>
                    {weddings.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Input>
                </Col>

                <Col md={2}>
                  <Label className="mb-1">Start serial</Label>
                  <Input
                    placeholder="0001"
                    value={rangeForm.from}
                    onChange={(e) => setRangeForm((p) => ({ ...p, from: e.target.value }))}
                    invalid={rangeTouched && !isValidSerial(rangeForm.from)}
                  />
                  <FormFeedback type="invalid">Use serial like 0001</FormFeedback>
                </Col>

                <Col md={2}>
                  <Label className="mb-1">End serial</Label>
                  <Input
                    placeholder="0100"
                    value={rangeForm.to}
                    onChange={(e) => setRangeForm((p) => ({ ...p, to: e.target.value }))}
                    invalid={
                      rangeTouched &&
                      (!isValidSerial(rangeForm.to) ||
                        String(rangeForm.from || "").trim() > String(rangeForm.to || "").trim())
                    }
                  />
                  <FormFeedback type="invalid">End must be ≥ start</FormFeedback>
                </Col>

                <Col md={2}>
                  <div className="form-check mt-4 pt-2">
                    <Input
                      className="form-check-input"
                      type="checkbox"
                      checked={rangeForm.unassignedOnly}
                      onChange={(e) =>
                        setRangeForm((p) => ({ ...p, unassignedOnly: e.target.checked }))
                      }
                    />
                    <Label className="form-check-label mb-0">Only unassigned</Label>
                  </div>
                </Col>

                <Col md={2} className="d-grid">
                  <Button
                    type="button"
                    color="primary"
                    outline
                    disabled={selectingRange}
                    onClick={selectRange}
                  >
                    {selectingRange ? "Selecting…" : "Select range"}
                  </Button>
                </Col>
              </Row>

              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
                <div className="text-muted small">
                  Selected: <strong>{selectedCount}</strong>. Uncheck any card to remove it.
                </div>
                <div className="d-flex gap-2">
                  <Button
                    type="button"
                    color="light"
                    disabled={selectedCount === 0}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Clear selection
                  </Button>
                  <Button
                    type="button"
                    color="primary"
                    outline
                    disabled={selectedCount === 0}
                    onClick={printSelectedMasterCards}
                  >
                    Print master cards
                  </Button>
                  <Button
                    type="button"
                    color="success"
                    outline
                    disabled={selectedCount === 0}
                    onClick={exportSelectedPDF}
                  >
                    Export PDF
                  </Button>
                  <Button
                    type="button"
                    color="light"
                    outline
                    disabled={!rangeFilter}
                    onClick={refresh}
                  >
                    Show all
                  </Button>
                  <Button
                    type="button"
                    color="secondary"
                    outline
                    disabled={unassigning || selectedCount === 0 || anySelectedClaimed}
                    onClick={unassignSelected}
                  >
                    {unassigning ? "Unassigning…" : "Unassign selected"}
                  </Button>
                  <Button
                    type="button"
                    color="warning"
                    disabled={assigning || selectedCount === 0 || !selectedWeddingId || anySelectedClaimed}
                    onClick={assignSelectedToWedding}
                  >
                    {assigning ? "Assigning…" : "Assign selected"}
                  </Button>
                </div>
              </div>

              {rangeFilter ? (
                <div className="small text-muted mt-2">
                  Showing serials <strong>{rangeFilter.from}</strong> to{" "}
                  <strong>{rangeFilter.to}</strong>
                  {rangeFilter.unassignedOnly ? " (unassigned only)" : ""}.
                </div>
              ) : null}
            </CardBody>
          </Card>

          {loading ? (
            <div className="position-relative py-5 text-center">
              <Spinner color="primary" />
            </div>
          ) : codes.length === 0 ? (
            <Card className="border shadow-none">
              <CardBody className="text-center py-5">
                <i className="bx bx-qr-scan display-4 text-muted d-block mb-3" />
                <p className="text-muted mb-3">No QR codes yet.</p>
                <Button color="primary" onClick={openGenerateModal}>
                  Generate QR codes
                </Button>
              </CardBody>
            </Card>
          ) : (
            <Row>
              {codes.map((qr, idx) => {
                const status = statusForRow(qr);
                const badge = badgeForStatus(status);
                const assignBadge = assignmentBadge(qr);
                const weddingName =
                  qr.wedding_id != null ? weddingNameById.get(Number(qr.wedding_id)) : null;
                const scanUrl = buildClaimUrl(getAppPublicBase(), { token: qr.token });
                const createdText =
                  moment(qr.created_at).isValid() ? moment(qr.created_at).format("D MMM YY h:mmA") : null;
                const fromText =
                  qr.active_from && moment(qr.active_from).isValid()
                    ? moment(qr.active_from).format("D MMM YY h:mmA")
                    : null;
                const toText =
                  qr.active_to && moment(qr.active_to).isValid() ? moment(qr.active_to).format("D MMM YY h:mmA") : null;
                const claimedAtText =
                  qr.claimed_at && moment(qr.claimed_at).isValid()
                    ? moment(qr.claimed_at).format("D MMM YY h:mmA")
                    : null;
                const rowKey =
                  qr.id != null && qr.id !== "" ? `id-${qr.id}` : `i-${idx}-${qr.token || "row"}`;
                const selected = selectedIds.has(qr.id);
                return (
                  <Col key={rowKey} xl={3} lg={4} md={6} className="mb-4">
                    <Card className="h-100 border shadow-sm">
                      <CardBody className="d-flex flex-column">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <div className="form-check">
                            <Input
                              className="form-check-input"
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleSelected(qr.id)}
                              disabled={qr.is_claimed === 1}
                            />
                            <Label className="form-check-label mb-0">Select</Label>
                          </div>
                          <div className="d-flex gap-2">
                            <Badge color={assignBadge.color} pill>
                              {assignBadge.label}
                            </Badge>
                            <Badge color={badge.color} pill>
                              {badge.label}
                            </Badge>
                          </div>
                        </div>

                        <div className="mb-3 p-3 bg-light rounded">
                          <QrPreview token={qr.token} scanUrl={scanUrl} />
                          {scanUrl ? (
                            <a
                              href={scanUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="small text-center d-block mt-2 text-primary"
                            >
                              Open claim page
                            </a>
                          ) : null}
                        </div>

                        <div className="d-flex justify-content-between align-items-center mb-2">
                          <span className="text-muted small">#{qr.id}</span>
                          <span className="text-muted small">{qr.serial_number || "—"}</span>
                        </div>

                        {qr.wedding_id != null ? (
                          <div className="small mb-2">
                            <span className="text-muted">Wedding:</span>{" "}
                            <span className="fw-semibold">{weddingName || `#${qr.wedding_id}`}</span>
                          </div>
                        ) : (
                          <div className="small mb-2 text-muted">Wedding: Unassigned</div>
                        )}

                        <div className="mb-3 pb-2 border-bottom">
                          <p className="small text-muted mb-0">Amount</p>
                          <p className="mb-0 fs-5 fw-semibold text-primary">
                            {formatMoneyAmount(qr.amount)}
                          </p>
                        </div>

                        <div className="small text-muted">
                          <div className="d-flex align-items-start gap-2">
                            <i className="bx bx-time-five font-size-16 mt-1" />
                            <div>
                              <div className="fw-semibold text-dark">Activation</div>
                              {fromText && toText ? (
                                <div>
                                  <span className="text-muted">From</span> {fromText}{" "}
                                  <span className="text-muted">to</span> {toText}
                                </div>
                              ) : (
                                <div className="text-muted">Not activated yet</div>
                              )}
                            </div>
                          </div>

                          <div className="d-flex align-items-start gap-2 mt-2">
                            <i className="bx bx-calendar font-size-16 mt-1" />
                            <div>
                              <div className="fw-semibold text-dark">Created</div>
                              <div>{createdText || "—"}</div>
                            </div>
                          </div>

                          <div className="d-flex align-items-start gap-2 mt-2">
                            <i className="bx bx-user font-size-16 mt-1" />
                            <div>
                              <div className="fw-semibold text-dark">Claim</div>
                              {qr.is_claimed === 1 ? (
                                <div>
                                  <div>
                                    <span className="text-muted">Phone:</span>{" "}
                                    {qr.claimed_phone && String(qr.claimed_phone).trim() !== ""
                                      ? String(qr.claimed_phone)
                                      : "—"}
                                  </div>
                                  <div>
                                    <span className="text-muted">At:</span> {claimedAtText || "—"}
                                  </div>
                                </div>
                              ) : (
                                <div className="text-muted">Not claimed</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}

          <Modal isOpen={generateModalOpen} toggle={() => !generating && setGenerateModalOpen(false)}>
            <ModalHeader toggle={() => !generating && setGenerateModalOpen(false)} tag="h4">
              Generate QR codes
            </ModalHeader>
            <ModalBody>
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  generate();
                  return false;
                }}
              >
                <Row>
                  <Col md={6}>
                    <div className="mb-3">
                      <Label>How many</Label>
                      <Input
                        name="count"
                        type="number"
                        min={1}
                        max={MAX_QR_BATCH}
                        step={1}
                        value={genForm.count}
                        onChange={(e) => setGenForm((p) => ({ ...p, count: e.target.value }))}
                        invalid={
                          genTouched &&
                          (!Number.isFinite(Number(genForm.count)) ||
                            Number(genForm.count) < 1 ||
                            Number(genForm.count) > MAX_QR_BATCH)
                        }
                      />
                      <FormFeedback type="invalid">
                        Enter a number between 1 and {MAX_QR_BATCH}
                      </FormFeedback>
                    </div>
                  </Col>
                  <Col md={6}>
                    <div className="mb-3">
                      <Label>Amount per QR</Label>
                      <Input
                        name="amount"
                        type="number"
                        step="0.01"
                        min={0}
                        value={genForm.amount}
                        onChange={(e) => setGenForm((p) => ({ ...p, amount: e.target.value }))}
                        invalid={genTouched && (!Number.isFinite(Number(genForm.amount)) || Number(genForm.amount) < 0)}
                      />
                      <FormFeedback type="invalid">Enter a valid amount</FormFeedback>
                    </div>
                  </Col>
                </Row>
                <div className="text-end">
                  <Button
                    type="button"
                    color="light"
                    className="me-2"
                    disabled={generating}
                    onClick={() => setGenerateModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" color="success" disabled={generating}>
                    {generating ? "Generating…" : "Generate"}
                  </Button>
                </div>
              </Form>
            </ModalBody>
          </Modal>

          <Modal isOpen={activateModalOpen} toggle={() => !activating && setActivateModalOpen(false)}>
            <ModalHeader toggle={() => !activating && setActivateModalOpen(false)} tag="h4">
              Activate QR codes
            </ModalHeader>
            <ModalBody>
              <p className="text-muted small mb-3">
                Selected: <strong>{selectedCount}</strong>. Set an activation window. After the{" "}
                <strong>Active to</strong> time, codes become expired automatically.
              </p>
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  activate();
                  return false;
                }}
              >
                <Row>
                  <Col md={6}>
                    <div className="mb-3">
                      <Label>Active from</Label>
                      <Input
                        type="datetime-local"
                        value={activateForm.active_from}
                        onChange={(e) => setActivateForm((p) => ({ ...p, active_from: e.target.value }))}
                        invalid={activateTouched && !activateForm.active_from}
                      />
                      <FormFeedback type="invalid">Required</FormFeedback>
                    </div>
                  </Col>
                  <Col md={6}>
                    <div className="mb-3">
                      <Label>Active to</Label>
                      <Input
                        type="datetime-local"
                        value={activateForm.active_to}
                        onChange={(e) => setActivateForm((p) => ({ ...p, active_to: e.target.value }))}
                        invalid={activateTouched && !activateForm.active_to}
                      />
                      <FormFeedback type="invalid">Required</FormFeedback>
                    </div>
                  </Col>
                </Row>
                <div className="text-end">
                  <Button
                    type="button"
                    color="light"
                    className="me-2"
                    disabled={activating}
                    onClick={() => setActivateModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" color="primary" disabled={activating}>
                    {activating ? "Activating…" : "Activate"}
                  </Button>
                </div>
              </Form>
            </ModalBody>
          </Modal>
          </Container>
        </div>
      </div>
      <ToastContainer />
    </React.Fragment>
  );
};

export default QrCodes;

