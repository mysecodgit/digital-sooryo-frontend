import PropTypes from "prop-types";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import moment from "moment/moment";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Container, Row, Col, Card, CardBody, Button, Spinner, Badge } from "reactstrap";

import Breadcrumbs from "../../components/Common/Breadcrumb";
import { withTranslation } from "react-i18next";

import "./dashboard.scss";
import {
  createSooryoAuthorizedClient,
  getAuthUserId,
} from "../../helpers/sooryoApi";

function weddingsFromApiPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.weddings)) return payload.weddings;
  return [];
}

function formatMoney(n) {
  if (n === undefined || n === null || Number.isNaN(Number(n))) return "—";
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const Dashboard = (props) => {
  document.title = "Dashboard | Digital Sooryo";

  const api = useMemo(() => createSooryoAuthorizedClient(), []);

  const [loading, setLoading] = useState(true);
  const [weddings, setWeddings] = useState([]);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const uid = getAuthUserId();
    if (uid == null || Number.isNaN(uid)) {
      setError("Please sign in again.");
      setWeddings([]);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get(`/v1/user/${uid}/weddings`);
      setWeddings(weddingsFromApiPayload(data));
    } catch (e) {
      setError("Could not load your weddings. Check the API and try again.");
      setWeddings([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const count = weddings.length;
    let totalQrSlots = 0;
    let poolEstimate = 0;
    weddings.forEach((w) => {
      const q = Number(w.total_qr) || 0;
      const a = Number(w.amount_per_qr) || 0;
      totalQrSlots += q;
      poolEstimate += q * a;
    });
    const today = moment().format("YYYY-MM-DD");
    const upcoming = weddings.filter((w) => {
      const d = w?.event_date ? moment(w.event_date) : null;
      if (!d || !d.isValid()) return false;
      return d.format("YYYY-MM-DD") >= today;
    }).length;
    return { count, totalQrSlots, poolEstimate, upcoming };
  }, [weddings]);

  const chartData = useMemo(() => {
    const buckets = {};
    weddings.forEach((w) => {
      const d = w?.event_date ? moment(w.event_date) : null;
      if (!d || !d.isValid()) return;
      const key = d.format("YYYY-MM");
      buckets[key] = (buckets[key] || 0) + 1;
    });
    return Object.keys(buckets)
      .sort()
      .map((k) => ({
        month: moment(k, "YYYY-MM").format("MMM YYYY"),
        weddings: buckets[k],
      }));
  }, [weddings]);

  const recentWeddings = useMemo(() => {
    return [...weddings]
      .filter((w) => w?.event_date)
      .sort((a, b) => {
        const da = moment(a.event_date).valueOf();
        const db = moment(b.event_date).valueOf();
        return db - da;
      })
      .slice(0, 6);
  }, [weddings]);

  return (
    <React.Fragment>
      <div className="page-content ds-dashboard">
        <Container fluid>
          <Breadcrumbs
            title={props.t("Dashboards")}
            breadcrumbItem={props.t("Dashboard")}
          />

          <Row className="mb-4">
            <Col xs={12}>
              <Card className="ds-hero border-0 shadow mb-0">
                <CardBody className="p-4 position-relative" style={{ zIndex: 1 }}>
                  <Row className="align-items-center">
                    <Col md={8}>
                      <h3 className="text-white mb-2 fw-semibold">
                        Digital Sooryo
                      </h3>
                      <p className="text-white-50 mb-md-0 mb-3" style={{ opacity: 0.92 }}>
                        Track weddings, QR sooryo, and gifts in one place. Data below
                        refreshes from your live API.
                      </p>
                    </Col>
                    <Col md={4} className="text-md-end">
                      <Button
                        color="light"
                        className="me-2"
                        onClick={loadData}
                        disabled={loading}
                      >
                        {loading ? (
                          <>
                            <Spinner size="sm" className="me-1" /> Refreshing
                          </>
                        ) : (
                          <>
                            <i className="bx bx-refresh me-1" />
                            Refresh
                          </>
                        )}
                      </Button>
                      <Link to="/weddings" className="btn btn-success">
                        <i className="bx bx-heart me-1" />
                        Weddings
                      </Link>
                    </Col>
                  </Row>
                </CardBody>
              </Card>
            </Col>
          </Row>

          {error ? (
            <Row className="mb-4">
              <Col xs={12}>
                <Card className="border-warning">
                  <CardBody className="py-3 text-warning">{error}</CardBody>
                </Card>
              </Col>
            </Row>
          ) : null}

          <Row className="mb-4">
            <Col xl={3} md={6} className="mb-4 mb-xl-0">
              <Card className="ds-stat-card shadow-sm h-100">
                <CardBody>
                  <div className="d-flex align-items-start">
                    <div
                      className="ds-stat-icon flex-shrink-0 me-3"
                      style={{ background: "var(--ds-accent-soft)", color: "var(--ds-accent)" }}
                    >
                      <i className="bx bx-heart" />
                    </div>
                    <div>
                      <p className="text-muted mb-1 text-uppercase small fw-medium">
                        Weddings
                      </p>
                      <h3 className="mb-0 fw-semibold">
                        {loading ? <Spinner size="sm" /> : stats.count}
                      </h3>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Col>
            <Col xl={3} md={6} className="mb-4 mb-xl-0">
              <Card className="ds-stat-card shadow-sm h-100">
                <CardBody>
                  <div className="d-flex align-items-start">
                    <div
                      className="ds-stat-icon flex-shrink-0 me-3"
                      style={{ background: "var(--ds-teal-soft)", color: "var(--ds-teal)" }}
                    >
                      <i className="bx bx-qr-scan" />
                    </div>
                    <div>
                      <p className="text-muted mb-1 text-uppercase small fw-medium">
                        Total QR slots
                      </p>
                      <h3 className="mb-0 fw-semibold">
                        {loading ? <Spinner size="sm" /> : formatMoney(stats.totalQrSlots)}
                      </h3>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Col>
            <Col xl={3} md={6} className="mb-4 mb-xl-0">
              <Card className="ds-stat-card shadow-sm h-100">
                <CardBody>
                  <div className="d-flex align-items-start">
                    <div
                      className="ds-stat-icon flex-shrink-0 me-3"
                      style={{ background: "var(--ds-warm-soft)", color: "var(--ds-warm)" }}
                    >
                      <i className="bx bx-wallet" />
                    </div>
                    <div>
                      <p className="text-muted mb-1 text-uppercase small fw-medium">
                        Pool (est.)
                      </p>
                      <h3 className="mb-0 fw-semibold">
                        {loading ? (
                          <Spinner size="sm" />
                        ) : (
                          formatMoney(stats.poolEstimate)
                        )}
                      </h3>
                      <small className="text-muted">slots × amount / QR</small>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Col>
            <Col xl={3} md={6}>
              <Card className="ds-stat-card shadow-sm h-100">
                <CardBody>
                  <div className="d-flex align-items-start">
                    <div
                      className="ds-stat-icon flex-shrink-0 me-3"
                      style={{ background: "var(--ds-rose-soft)", color: "var(--ds-rose)" }}
                    >
                      <i className="bx bx-calendar-check" />
                    </div>
                    <div>
                      <p className="text-muted mb-1 text-uppercase small fw-medium">
                        Upcoming events
                      </p>
                      <h3 className="mb-0 fw-semibold">
                        {loading ? <Spinner size="sm" /> : stats.upcoming}
                      </h3>
                      <small className="text-muted">from today</small>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>

          <Row>
            <Col xl={8} className="mb-4">
              <Card className="shadow-sm border-0 h-100">
                <CardBody>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <div>
                      <h5 className="mb-0 fw-semibold">Weddings by month</h5>
                      <p className="text-muted small mb-0">
                        Hover bars for counts — based on event date
                      </p>
                    </div>
                    <Badge color="light" className="font-size-12 rounded-pill text-primary">
                      Interactive
                    </Badge>
                  </div>
                  <div className="ds-chart-wrap">
                    {loading ? (
                      <div className="d-flex align-items-center justify-content-center h-100 py-5">
                        <Spinner color="primary" />
                      </div>
                    ) : chartData.length === 0 ? (
                      <div className="text-muted text-center py-5">
                        Add weddings with event dates to see this chart.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f7" />
                          <XAxis
                            dataKey="month"
                            tick={{ fontSize: 12, fill: "#74788d" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 12, fill: "#74788d" }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(85, 110, 230, 0.08)" }}
                            contentStyle={{
                              borderRadius: "0.35rem",
                              border: "none",
                              boxShadow: "0 4px 20px rgba(18, 38, 63, 0.1)",
                            }}
                          />
                          <Bar
                            dataKey="weddings"
                            name="Weddings"
                            fill="#556ee6"
                            radius={[6, 6, 0, 0]}
                            maxBarSize={48}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </CardBody>
              </Card>
            </Col>

            <Col xl={4} className="mb-4">
              <Card className="shadow-sm border-0 h-100">
                <CardBody>
                  <h5 className="mb-1 fw-semibold">Recent weddings</h5>
                  <p className="text-muted small mb-3">By event date · quick links</p>
                  {loading ? (
                    <div className="text-center py-4">
                      <Spinner color="primary" size="sm" />
                    </div>
                  ) : recentWeddings.length === 0 ? (
                    <p className="text-muted small mb-0">No weddings yet.</p>
                  ) : (
                    <div className="list-group list-group-flush">
                      {recentWeddings.map((w) => {
                        const d = w.event_date ? moment(w.event_date) : null;
                        const label = d?.isValid() ? d.format("D MMM YYYY") : "—";
                        return (
                          <div
                            key={w.id}
                            className="list-group-item border-0 px-0 ds-recent-row rounded px-2 py-2"
                          >
                            <div className="d-flex justify-content-between align-items-start gap-2">
                              <div className="min-w-0">
                                <div className="fw-semibold text-truncate">{w.name}</div>
                                <small className="text-muted">{label}</small>
                              </div>
                              <Link
                                to={`/weddings/${w.id}/qr-codes`}
                                className="btn btn-sm btn-outline-primary flex-shrink-0"
                                title="QR codes"
                              >
                                <i className="bx bx-qr-scan" />
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3 pt-2 border-top">
                    <Link to="/weddings" className="btn btn-outline-primary btn-sm w-100">
                      View all weddings
                    </Link>
                  </div>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </Container>
      </div>
    </React.Fragment>
  );
};

Dashboard.propTypes = {
  t: PropTypes.any,
};

export default withTranslation()(Dashboard);
