import React, { useEffect, useMemo, useState } from "react";
import moment from "moment/moment";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import Breadcrumbs from "/src/components/Common/Breadcrumb";
import { createSooryoAuthorizedClient } from "/src/helpers/sooryoApi";

import { Card, CardBody, Col, Container, Input, Label, Row, Spinner, Table } from "reactstrap";

const Claims = () => {
  document.title = "Claims";
  const api = useMemo(() => createSooryoAuthorizedClient(), []);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, page_size: 25, total: 0, total_pages: 1 });
  const [phoneQuery, setPhoneQuery] = useState(""); // input value
  const [serialQuery, setSerialQuery] = useState(""); // input value
  const [appliedPhone, setAppliedPhone] = useState(""); // last searched value
  const [appliedSerial, setAppliedSerial] = useState(""); // last searched value
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const refresh = async (opts) => {
    const phone = String(opts?.phone ?? appliedPhone ?? "").trim();
    const serial = String(opts?.serial ?? appliedSerial ?? "").trim();
    const nextPage = Number(opts?.page ?? page ?? 1);

    try {
      setLoading(true);
      const qs = new URLSearchParams({
        phone,
        serial,
        page: String(nextPage),
        page_size: String(pageSize),
      });
      const { data } = await api.get(`/v1/claims?${qs.toString()}`);
      // API response shape is typically: { data: { data: [...], meta: {...} } }
      // but we also accept { data: [...], meta: {...} } or a bare array.
      const payload =
        data && typeof data === "object" && data.data && typeof data.data === "object" && !Array.isArray(data.data)
          ? data.data
          : data;
      const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setRows(list);
      setMeta(
        payload?.meta && typeof payload.meta === "object"
          ? payload.meta
          : { page: nextPage, page_size: pageSize, total: list.length, total_pages: 1 }
      );
    } catch {
      toast.error("Could not load claims");
      setRows([]);
      setMeta({ page: 1, page_size: pageSize, total: 0, total_pages: 1 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial load: first 25 records (page 1) with no filters.
    refresh({ phone: "", serial: "", page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPages = Math.max(1, Number(meta?.total_pages) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);

  return (
    <React.Fragment>
      <div className="page-content">
        <Container fluid>
          <Breadcrumbs title="Claims" breadcrumbItem="Claims" />

          <Card className="border shadow-sm">
            <CardBody>
              <Row className="g-3 align-items-end mb-3">
                <Col md={4}>
                  <Label className="mb-1">Search by phone</Label>
                  <Input
                    placeholder="e.g. 09xxxxxxx"
                    value={phoneQuery}
                    onChange={(e) => setPhoneQuery(e.target.value)}
                  />
                </Col>
                <Col md={4}>
                  <Label className="mb-1">Search by serial</Label>
                  <Input
                    placeholder="e.g. 0016"
                    value={serialQuery}
                    onChange={(e) => setSerialQuery(e.target.value)}
                  />
                </Col>
                <Col md={4} className="d-flex flex-wrap justify-content-md-end gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={loading}
                    onClick={() => {
                      const p = String(phoneQuery || "").trim();
                      const s = String(serialQuery || "").trim();
                      setAppliedPhone(p);
                      setAppliedSerial(s);
                      setPage(1);
                      refresh({ phone: p, serial: s, page: 1 });
                    }}
                  >
                    Search
                  </button>
                  <button
                    type="button"
                    className="btn btn-light"
                    disabled={loading && rows.length === 0}
                    onClick={() => {
                      setPhoneQuery("");
                      setSerialQuery("");
                      setAppliedPhone("");
                      setAppliedSerial("");
                      setPage(1);
                      refresh({ phone: "", serial: "", page: 1 });
                    }}
                  >
                    Clear
                  </button>
                  <div className="text-muted small align-self-center">
                    Results: <strong>{meta?.total ?? 0}</strong>
                  </div>
                </Col>
              </Row>

              {loading ? (
                <div className="position-relative py-5 text-center">
                  <Spinner color="primary" />
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-5 text-muted">No claims yet.</div>
              ) : (
                <div className="table-responsive">
                  <Table className="align-middle mb-0 table-hover">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: 80 }}>#</th>
                        <th>Phone</th>
                        <th>QR serial</th>
                        <th>Claimed at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => {
                        const claimedAtText =
                          r.claimed_at && moment(r.claimed_at).isValid()
                            ? moment(r.claimed_at).format("D MMM YY h:mmA")
                            : "—";
                        const num = (safePage - 1) * pageSize + idx + 1;
                        return (
                          <tr key={`claim-${r.claim_id ?? r.id ?? idx}`}>
                            <td className="text-muted">{num}</td>
                            <td className="fw-semibold">{r.phone ? String(r.phone) : "—"}</td>
                            <td>{r.serial_number || "—"}</td>
                            <td className="text-muted">{claimedAtText}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>

                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-3">
                    <div className="text-muted small">
                      Page <strong>{safePage}</strong> of <strong>{totalPages}</strong> (25 per page)
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-light btn-sm"
                        disabled={safePage <= 1}
                        onClick={() => {
                          const next = Math.max(1, safePage - 1);
                          setPage(next);
                          refresh({ page: next });
                        }}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        className="btn btn-light btn-sm"
                        disabled={safePage >= totalPages}
                        onClick={() => {
                          const next = Math.min(totalPages, safePage + 1);
                          setPage(next);
                          refresh({ page: next });
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </Container>
      </div>
      <ToastContainer />
    </React.Fragment>
  );
};

export default Claims;

