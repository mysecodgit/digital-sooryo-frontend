import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import moment from "moment/moment";
import { useFormik } from "formik";
import * as Yup from "yup";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import Breadcrumbs from "/src/components/Common/Breadcrumb";
import { buildClaimUrl, getAppPublicBase } from "/src/helpers/claimUrl";
import {
  createSooryoAuthorizedClient,
  getAuthUserId,
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

function weddingsFromApiPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.weddings)) return payload.weddings;
  return [];
}

const MAX_QR_BATCH = 200;

/** API may return a bare array or `{ data: [...] }`. */
function qrCodesFromApiPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.qr_codes)) return payload.qr_codes;
  return [];
}

function normalizeQrRow(raw, fallbackWeddingId) {
  const wid = raw.wedding_id ?? raw.WeddingID ?? fallbackWeddingId;
  const claimed = raw.is_claimed === true || raw.is_claimed === 1;
  const claimedAt = raw.claimed_at;
  return {
    id: raw.id,
    wedding_id: Number(wid),
    token: String(raw.token ?? ""),
    is_claimed: claimed ? 1 : 0,
    claimed_at:
      claimedAt && String(claimedAt).trim() !== "" && !/^0000-00-00/.test(String(claimedAt))
        ? claimedAt
        : null,
    created_at: raw.created_at || "",
    amount: raw.amount,
  };
}

async function fetchQrCodesList(client, weddingId) {
  const { data } = await client.get(`/v1/wedding/${weddingId}/qr-codes`);
  const rawList = qrCodesFromApiPayload(data);
  return rawList.map((row) => normalizeQrRow(row, weddingId));
}

function formatMoneyAmount(n) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return "—";
  const x = Number(n);
  return x.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Encodes a full claim URL so scanning opens /claim with token, wedding & amount.
 * Set VITE_PUBLIC_APP_URL when testing scans from phones (avoid localhost).
 */
function QrPreview({ scanUrl }) {
  if (!scanUrl) {
    return (
      <div className="small text-muted text-center py-4 px-2">
        Set <code>VITE_PUBLIC_APP_URL</code> so QR links use a reachable host from a phone.
      </div>
    );
  }

  const src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(
    scanUrl
  )}`;
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

const WeddingQrCodes = () => {
  const { weddingId } = useParams();
  const idNum = Number(weddingId);

  const api = useMemo(() => createSooryoAuthorizedClient(), []);

  const [pageLoading, setPageLoading] = useState(true);
  const [weddingTitle, setWeddingTitle] = useState("");
  const [weddingAmountPerQr, setWeddingAmountPerQr] = useState(null);
  const [codes, setCodes] = useState([]);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  document.title = weddingTitle ? `${weddingTitle} · QR codes` : "QR codes";

  useEffect(() => {
    if (!Number.isFinite(idNum) || idNum < 1) {
      setPageLoading(false);
      setWeddingTitle("");
      setWeddingAmountPerQr(null);
      setCodes([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setPageLoading(true);
      setCodes([]);

      const uid = getAuthUserId();
      if (uid == null || Number.isNaN(uid)) {
        if (!cancelled) {
          setWeddingTitle(`Wedding #${idNum}`);
          setWeddingAmountPerQr(null);
          setCodes([]);
          setPageLoading(false);
          toast.error("Please sign in again");
        }
        return;
      }

      const settled = await Promise.allSettled([
        api.get(`/v1/user/${uid}/weddings`),
        fetchQrCodesList(api, idNum),
      ]);

      if (cancelled) return;

      if (settled[0].status === "fulfilled") {
        const list = weddingsFromApiPayload(settled[0].value.data);
        const w = list.find((x) => Number(x.id) === idNum);
        setWeddingTitle(w?.name ? String(w.name) : `Wedding #${idNum}`);
        const apq = w?.amount_per_qr;
        setWeddingAmountPerQr(
          apq !== undefined && apq !== null && !Number.isNaN(Number(apq))
            ? Number(apq)
            : null
        );
      } else {
        setWeddingTitle(`Wedding #${idNum}`);
        setWeddingAmountPerQr(null);
        toast.error("Could not load wedding details");
      }

      if (settled[1].status === "fulfilled") {
        setCodes(settled[1].value);
      } else {
        setCodes([]);
        toast.error("Could not load QR codes");
      }

      if (!cancelled) setPageLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [idNum, api]);

  const heading = useMemo(() => {
    if (!Number.isFinite(idNum) || idNum < 1) return "Invalid wedding";
    return weddingTitle || `Wedding #${idNum}`;
  }, [idNum, weddingTitle]);

  const generateForm = useFormik({
    enableReinitialize: true,
    initialValues: {
      count: "1",
    },
    validationSchema: Yup.object({
      count: Yup.number()
        .typeError("Enter a whole number")
        .integer()
        .min(1, "At least 1")
        .max(MAX_QR_BATCH, `At most ${MAX_QR_BATCH} at a time`)
        .required("Required"),
    }),
    onSubmit: async (values) => {
      if (!Number.isFinite(idNum) || idNum < 1) {
        toast.error("Invalid wedding");
        return;
      }

      const count = Number(values.count);
      try {
        setGenerating(true);
        await api.post(`/v1/wedding/${idNum}/qr-codes`, {
          count,
        });

        try {
          const list = await fetchQrCodesList(api, idNum);
          setCodes(list);
        } catch {
          toast.warning(
            "QR codes were created, but the list could not be refreshed."
          );
        }

        toast.success(
          `${count} QR code${count === 1 ? "" : "s"} requested — list updated`
        );
        generateForm.resetForm();
        setGenerateModalOpen(false);
      } catch (err) {
        toast.error("Could not generate QR codes");
      } finally {
        setGenerating(false);
      }
    },
  });

  const openGenerateModal = () => {
    generateForm.resetForm({
      values: { count: "1" },
    });
    setGenerateModalOpen(true);
  };

  const claimAmountForQr = (qr) => {
    const fromRow = qr?.amount;
    if (fromRow !== undefined && fromRow !== null && !Number.isNaN(Number(fromRow))) {
      return Number(fromRow);
    }
    if (
      weddingAmountPerQr !== null &&
      weddingAmountPerQr !== undefined &&
      !Number.isNaN(Number(weddingAmountPerQr))
    ) {
      return Number(weddingAmountPerQr);
    }
    return 0;
  };

  const copyToken = async (token) => {
    try {
      await navigator.clipboard.writeText(token);
      toast.info("Token copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  if (!Number.isFinite(idNum) || idNum < 1) {
    return (
      <div className="page-content">
        <Container fluid>
          <Breadcrumbs title="Weddings" breadcrumbItem="QR codes" />
          <p className="text-danger mb-0">Invalid wedding ID.</p>
          <Link to="/weddings" className="btn btn-link ps-0">
            Back to weddings
          </Link>
        </Container>
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="page-content">
        <Container fluid>
          <Breadcrumbs title="Weddings" breadcrumbItem="QR codes" />

          <div className="d-flex flex-wrap align-items-start justify-content-between gap-3 mb-4">
            <div>
              <h5 className="mb-1">{heading}</h5>
              <p className="text-muted mb-0">
                Generate batch codes via the API. Claim links use this wedding&apos;s
                amount per QR
                {weddingAmountPerQr != null
                  ? ` (${formatMoneyAmount(weddingAmountPerQr)}).`
                  : "."}{" "}
                <span className="d-none d-md-inline">
                  Codes load from the server; generate to add more.
                </span>
              </p>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <Button type="button" color="success" onClick={openGenerateModal}>
                <i className="bx bx-plus font-size-16 align-middle me-1" />
                Generate QR codes
              </Button>
              <Link to="/weddings" className="btn btn-outline-secondary">
                Back to weddings
              </Link>
            </div>
          </div>

          {pageLoading ? (
            <div className="position-relative py-5 text-center">
              <Spinner color="primary" />
            </div>
          ) : codes.length === 0 ? (
            <Card className="border shadow-none">
              <CardBody className="text-center py-5">
                <i className="bx bx-qr-scan display-4 text-muted d-block mb-3" />
                <p className="text-muted mb-3">No QR codes yet for this wedding.</p>
                <Button color="primary" onClick={openGenerateModal}>
                  Generate QR codes
                </Button>
              </CardBody>
            </Card>
          ) : (
            <Row>
              {codes.map((qr, idx) => {
                const claimed = qr.is_claimed === 1 || qr.is_claimed === true;
                const scanUrl = buildClaimUrl(getAppPublicBase(), {
                  token: qr.token,
                  weddingId: Number(qr.wedding_id ?? idNum),
                  amount: claimAmountForQr(qr),
                });
                const rowKey =
                  qr.id != null && qr.id !== ""
                    ? `id-${qr.id}`
                    : `i-${idx}-${qr.token || "row"}`;
                return (
                  <Col key={rowKey} xl={3} lg={4} md={6} className="mb-4">
                    <Card className="h-100 border shadow-sm">
                      <CardBody className="d-flex flex-column">
                        <div className="mb-3 p-3 bg-light rounded">
                          <QrPreview scanUrl={scanUrl} />
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
                          <Badge color={claimed ? "success" : "secondary"} pill>
                            {claimed ? "Claimed" : "Unclaimed"}
                          </Badge>
                        </div>
                        <div className="mb-3 pb-2 border-bottom">
                          <p className="small text-muted mb-0">Amount</p>
                          <p className="mb-0 fs-5 fw-semibold text-primary">
                            {formatMoneyAmount(claimAmountForQr(qr))}
                          </p>
                        </div>
                        <p className="small text-muted mb-1">Token</p>
                        <code className="small text-break d-block mb-3 user-select-all">
                          {qr.token}
                        </code>
                        <div className="mt-auto small text-muted">
                          <div>
                            Created:{" "}
                            {moment(qr.created_at).isValid()
                              ? moment(qr.created_at).format("D MMM YY h:mmA")
                              : "—"}
                          </div>
                          <div>
                            Claimed at:{" "}
                            {qr.claimed_at && moment(qr.claimed_at).isValid()
                              ? moment(qr.claimed_at).format("D MMM YY h:mmA")
                              : "—"}
                          </div>
                        </div>
                        <Button
                          color="light"
                          size="sm"
                          className="mt-3"
                          type="button"
                          onClick={() => copyToken(qr.token)}
                        >
                          Copy token
                        </Button>
                      </CardBody>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}

          <Modal
            isOpen={generateModalOpen}
            toggle={() => setGenerateModalOpen(!generateModalOpen)}
          >
            <ModalHeader
              toggle={() => setGenerateModalOpen(!generateModalOpen)}
              tag="h4"
            >
              Generate QR codes
            </ModalHeader>
            <ModalBody>
              <p className="text-muted small mb-3">
                Enter how many codes to create. Claim links use this wedding&apos;s{" "}
                <strong>amount per QR</strong> from the wedding (unless a code row
                includes its own amount later).
              </p>
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  generateForm.handleSubmit();
                  return false;
                }}
              >
                <div className="mb-3">
                  <Label>How many QR codes</Label>
                  <Input
                    name="count"
                    type="number"
                    min={1}
                    max={MAX_QR_BATCH}
                    step={1}
                    placeholder="e.g. 10"
                    onChange={generateForm.handleChange}
                    onBlur={generateForm.handleBlur}
                    value={generateForm.values.count}
                    invalid={generateForm.touched.count && !!generateForm.errors.count}
                  />
                  {generateForm.touched.count && generateForm.errors.count ? (
                    <FormFeedback type="invalid">
                      {generateForm.errors.count}
                    </FormFeedback>
                  ) : null}
                </div>
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
        </Container>
      </div>
      <ToastContainer />
    </React.Fragment>
  );
};

export default WeddingQrCodes;
