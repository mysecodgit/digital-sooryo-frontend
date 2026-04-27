import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { useFormik } from "formik";
import * as Yup from "yup";

import {
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
  ModalFooter,
  ModalHeader,
  Row,
} from "reactstrap";

import {
  isValidClaimQuery,
  parseClaimQuery,
} from "/src/helpers/claimUrl";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5075";

function apiErrorMessage(err) {
  const msg = err?.response?.data?.error;
  if (typeof msg === "string" && msg.trim() !== "") return msg;
  return err?.message || "Wax khalad ah ayaa dhacay. Fadlan mar kale isku day.";
}

const Claim = () => {
  document.title = "Dalbo Sooryo";

  const [searchParams] = useSearchParams();
  const parsed = useMemo(
    () => parseClaimQuery(searchParams),
    [searchParams]
  );
  const valid = isValidClaimQuery(parsed);

  const [qrInfo, setQrInfo] = useState(null);
  const [loadingQr, setLoadingQr] = useState(!!valid);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState({
    open: false,
    variant: "success",
    title: "",
    message: "",
  });

  useEffect(() => {
    if (!valid) {
      setQrInfo(null);
      setLoadingQr(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setLoadingQr(true);
        const { data } = await axios.get(`${API_BASE_URL}/v1/public/qr/${parsed.token}`);
        if (cancelled) return;
        setQrInfo(data?.data ?? data);
      } catch (err) {
        if (!cancelled) setQrInfo(null);
      } finally {
        if (!cancelled) setLoadingQr(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [valid, parsed.token]);

  const form = useFormik({
    enableReinitialize: true,
    initialValues: { phone: "" },
    validationSchema: Yup.object({
      phone: Yup.string()
        .trim()
        .min(7, "Geli lambar sax ah")
        .max(40, "Lambarku aad buu u dheer yahay")
        .required("Lambarka telefoonka waa waajib"),
    }),
    onSubmit: async (_values, { validateForm, setTouched }) => {
      const errors = await validateForm();
      if (Object.keys(errors).length > 0) {
        setTouched({ phone: true }, true);
        return;
      }
      setConfirmOpen(true);
    },
  });

  const closeOutcome = () => {
    setOutcome((o) => ({ ...o, open: false }));
  };

  const performClaim = async () => {
    setSubmitting(true);
    try {
      const { data } = await axios.post(`${API_BASE_URL}/v1/claim`, {
        token: parsed.token,
        phone: form.values.phone.trim(),
      });

      const result = data?.data ?? data;
      const amt =
        result?.amount !== undefined && result?.amount !== null ? Number(result.amount) : null;

      setConfirmOpen(false);
      setOutcome({
        open: true,
        variant: "success",
        title: "Dalabka waa guuleystay",
        message: `Dalabkaaga waa la diiwaangeliyey. Serial: ${
          result?.serial_number ?? qrInfo?.serial_number ?? "—"
        }. Lacagta: ${amt != null && !Number.isNaN(amt) ? amt : "—"}. Telefoon: ${
          result?.phone ?? form.values.phone.trim()
        }.`,
      });
      form.resetForm();
    } catch (err) {
      setConfirmOpen(false);
      setOutcome({
        open: true,
        variant: "error",
        title: "Dalabku wuu fashilmay",
        message: apiErrorMessage(err),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!valid) {
    return (
      <div className="account-pages my-5 pt-5">
        <Container>
          <Row className="justify-content-center">
            <Col md={8} lg={6} xl={5}>
              <Card>
                <CardBody className="p-4">
                  <h4 className="mb-3" style={{ fontSize: 26, lineHeight: 1.2 }}>
                    Link-ga ma saxna ama wuu dhiman yahay
                  </h4>
                  <p className="text-muted mb-0">
                    Link-ga QR-kan wuxuu ka maqan yahay xog. Fadlan mar kale iska
                    scan garee QR sax ah oo ka yimid xafladda.
                  </p>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  const status = String(qrInfo?.status || "").toLowerCase();
  const notActive = !loadingQr && qrInfo && status !== "" && status !== "active";

  return (
    <div className="account-pages my-5 pt-5">
      <Container>
        <Row className="justify-content-center">
          <Col md={8} lg={6} xl={5}>
            <Card>
              <CardBody className="p-4" style={{ fontSize: 18 }}>
                {notActive ? (
                  <div className="text-center">
                    <i
                      className="bx bx-x-circle text-danger"
                      style={{ fontSize: 74, lineHeight: 1 }}
                      aria-hidden="true"
                    />
                    <h5 className="mt-3 mb-2" style={{ fontSize: 22, lineHeight: 1.2 }}>
                      Waan ka xunnahay
                    </h5>
                    <p className="text-muted mb-0" style={{ fontSize: 18, lineHeight: 1.55 }}>
                      QR-kan hadda ma shaqeynayo. Fadlan mar kale isku day marka uu firfircoon noqdo.
                    </p>
                  </div>
                ) : (
                  <>
                    <h4 className="text-center mb-2" style={{ fontSize: 30, lineHeight: 1.15 }}>
                      Dalbo Sooryo-gaaga
                    </h4>
                    <p className="text-muted text-center mb-4" style={{ fontSize: 18 }}>
                      Geli lambarkaaga si aad u dalbato QR-kan.
                    </p>

                    <div className="border rounded p-3 mb-4 bg-light" style={{ fontSize: 18 }}>
                      <Row className="g-2">
                        <Col xs={12}>
                          <span className="text-muted" style={{ fontSize: 14 }}>
                            Serial
                          </span>
                          <div className="fw-semibold" style={{ fontSize: 22 }}>
                            {loadingQr ? "…" : qrInfo?.serial_number || "—"}
                          </div>
                        </Col>
                        <Col xs={12}>
                          <span className="text-muted" style={{ fontSize: 14 }}>
                            Lacagta
                          </span>
                          <div
                            className="fw-semibold text-primary"
                            style={{ fontSize: 28, lineHeight: 1.1 }}
                          >
                            {!loadingQr &&
                            qrInfo?.amount !== undefined &&
                            qrInfo?.amount !== null &&
                            !Number.isNaN(Number(qrInfo.amount))
                              ? `${Number(qrInfo.amount)}`
                              : loadingQr
                              ? "…"
                              : "—"}
                          </div>
                        </Col>
                      </Row>
                    </div>

                <Form
                  onSubmit={(e) => {
                    e.preventDefault();
                    form.handleSubmit();
                  }}
                >
                  <style>{`
                    .claim-green-btn {
                      background: #0b5b46 !important;
                      border-color: #0b5b46 !important;
                      color: #ffffff !important;
                    }
                    .claim-green-btn:hover,
                    .claim-green-btn:focus {
                      background: #064436 !important;
                      border-color: #064436 !important;
                      color: #ffffff !important;
                    }
                    .claim-green-btn:active {
                      background: #053a2f !important;
                      border-color: #053a2f !important;
                      color: #ffffff !important;
                    }
                  `}</style>

                  <div className="mb-3">
                    <Label style={{ fontSize: 18, fontWeight: 600 }}>Lambarka telefoonka</Label>
                    <Input
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+252 ..."
                      onChange={form.handleChange}
                      onBlur={form.handleBlur}
                      value={form.values.phone}
                      invalid={form.touched.phone && !!form.errors.phone}
                      style={{ fontSize: 20, padding: "14px 14px" }}
                    />
                    {form.touched.phone && form.errors.phone ? (
                      <FormFeedback type="invalid" style={{ fontSize: 16 }}>
                        {form.errors.phone}
                      </FormFeedback>
                    ) : null}
                  </div>

                  <Button
                    color="primary"
                    type="submit"
                    className="w-100 claim-green-btn"
                    style={{ fontSize: 22, padding: "12px 16px", fontWeight: 700 }}
                  >
                    Dalbo
                  </Button>
                </Form>
                  </>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>

      <Modal isOpen={confirmOpen} toggle={() => !submitting && setConfirmOpen(false)}>
        <ModalHeader toggle={() => !submitting && setConfirmOpen(false)}>
          Xaqiiji dalabka
        </ModalHeader>
        <ModalBody>
          <p className="mb-2" style={{ fontSize: 18 }}>
            Ma hubtaa inaad rabto inaad dalbato sooryadan?
          </p>
          <ul className="text-muted mb-0" style={{ fontSize: 18, lineHeight: 1.6 }}>
            <li>
              <strong>Telefoon:</strong>{" "}
              <span style={{ fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
                {form.values.phone.trim() || "—"}
              </span>
            </li>
            <li>
              <strong>Serial:</strong> {loadingQr ? "…" : qrInfo?.serial_number || "—"}
            </li>
            <li>
              <strong>Lacagta:</strong>{" "}
              {!loadingQr &&
              qrInfo?.amount !== undefined &&
              qrInfo?.amount !== null &&
              !Number.isNaN(Number(qrInfo.amount))
                ? `${Number(qrInfo.amount)}`
                : loadingQr
                ? "…"
                : "—"}
            </li>
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button
            color="light"
            type="button"
            disabled={submitting}
            onClick={() => setConfirmOpen(false)}
            style={{ fontSize: 18, padding: "10px 14px" }}
          >
            Ka-noqo
          </Button>
          <Button
            color="primary"
            type="button"
            disabled={submitting}
            onClick={performClaim}
            style={{ fontSize: 18, padding: "10px 14px", fontWeight: 700 }}
          >
            {submitting ? "Wuu socda..." : "Haa, dalbo hadda"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={outcome.open} toggle={closeOutcome}>
        <ModalHeader
          toggle={closeOutcome}
          className={
            outcome.variant === "success" ? "border-0 text-success" : "border-0 text-danger"
          }
        >
          {outcome.title}
        </ModalHeader>
        <ModalBody>
          <p className="mb-0">{outcome.message}</p>
        </ModalBody>
        <ModalFooter className="border-0">
          <Button color="primary" type="button" onClick={closeOutcome}>
            Xir
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Claim;
