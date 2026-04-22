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
  return err?.message || "Something went wrong. Please try again.";
}

const Claim = () => {
  document.title = "Claim sooryo";

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
        .min(7, "Enter a valid phone number")
        .max(40, "Phone number is too long")
        .required("Phone number is required"),
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
        title: "Claim successful",
        message: `Your claim is recorded. Serial: ${result?.serial_number ?? qrInfo?.serial_number ?? "—"}. Amount: ${
          amt != null && !Number.isNaN(amt) ? amt : "—"
        }. We will use phone ${result?.phone ?? form.values.phone.trim()}.`,
      });
      form.resetForm();
    } catch (err) {
      setConfirmOpen(false);
      setOutcome({
        open: true,
        variant: "error",
        title: "Claim failed",
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
                  <h4 className="mb-3">Invalid or incomplete link</h4>
                  <p className="text-muted mb-0">
                    This QR code link is missing information. Please scan a
                    valid code from the event.
                  </p>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    );
  }

  return (
    <div className="account-pages my-5 pt-5">
      <Container>
        <Row className="justify-content-center">
          <Col md={8} lg={6} xl={5}>
            <Card>
              <CardBody className="p-4">
                <h4 className="text-center mb-2">Claim your sooryo</h4>
                <p className="text-muted text-center small mb-4">
                  Enter your phone number to claim this QR code.
                </p>

                <div className="border rounded p-3 mb-4 bg-light">
                  <Row className="g-2">
                    <Col xs={12}>
                      <span className="text-muted small">Serial</span>
                      <div className="fw-semibold">{loadingQr ? "…" : qrInfo?.serial_number || "—"}</div>
                    </Col>
                    <Col xs={12}>
                      <span className="text-muted small">Amount</span>
                      <div className="fw-semibold fs-5 text-primary">
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
                    <Col xs={12}>
                      <span className="text-muted small">Status</span>
                      <div className="fw-semibold">{loadingQr ? "…" : qrInfo?.status || "—"}</div>
                    </Col>
                  </Row>
                </div>

                <Form
                  onSubmit={(e) => {
                    e.preventDefault();
                    form.handleSubmit();
                  }}
                >
                  <div className="mb-3">
                    <Label>Phone number</Label>
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
                    />
                    {form.touched.phone && form.errors.phone ? (
                      <FormFeedback type="invalid">{form.errors.phone}</FormFeedback>
                    ) : null}
                  </div>

                  <Button color="primary" className="w-100" type="submit">
                    Claim
                  </Button>
                </Form>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </Container>

      <Modal isOpen={confirmOpen} toggle={() => !submitting && setConfirmOpen(false)}>
        <ModalHeader toggle={() => !submitting && setConfirmOpen(false)}>
          Confirm claim
        </ModalHeader>
        <ModalBody>
          <p className="mb-2">Are you sure you want to claim this sooryo?</p>
          <ul className="text-muted small mb-0">
            <li>
              <strong>Phone:</strong> {form.values.phone.trim() || "—"}
            </li>
            <li>
              <strong>Serial:</strong> {loadingQr ? "…" : qrInfo?.serial_number || "—"}
            </li>
            <li>
              <strong>Amount:</strong>{" "}
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
          >
            Cancel
          </Button>
          <Button color="primary" type="button" disabled={submitting} onClick={performClaim}>
            {submitting ? "Submitting…" : "Yes, claim now"}
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
            Close
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Claim;
