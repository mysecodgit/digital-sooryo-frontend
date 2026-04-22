import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import moment from "moment/moment";
import { useFormik } from "formik";
import * as Yup from "yup";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import TableContainer from "../../components/Common/TableContainer";
import Spinners from "../../components/Common/Spinner";
import Breadcrumbs from "/src/components/Common/Breadcrumb";

import {
  createSooryoAuthorizedClient,
  getAuthUserId,
} from "../../helpers/sooryoApi";
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
  ModalHeader,
  Row,
} from "reactstrap";

/** Backend may return { data: [...] }, a bare array, or { weddings: [...] }. */
function weddingsFromApiPayload(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.weddings)) return payload.weddings;
  return [];
}

/** `type="date"` expects YYYY-MM-DD; API often returns RFC3339. */
function dateInputValueFromApi(raw) {
  if (!raw) return "";
  const s = String(raw);
  if (s.includes("T")) return s.slice(0, 10);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

const Weddings = () => {
  document.title = "Weddings";

  const api = useMemo(() => createSooryoAuthorizedClient(), []);

  const [isLoading, setLoading] = useState(true);
  const [weddings, setWeddings] = useState([]);
  const [selectedWedding, setSelectedWedding] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);

  const fetchWeddings = async () => {
    const uid = getAuthUserId();
    if (uid == null || Number.isNaN(uid)) {
      toast.error("Please sign in again");
      setWeddings([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data } = await api.get(`/v1/user/${uid}/weddings`);
      setWeddings(weddingsFromApiPayload(data));
    } catch (err) {
      toast.error("Failed to load weddings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWeddings();
  }, []);

  const validation = useFormik({
    enableReinitialize: true,
    initialValues: {
      id: selectedWedding?.id ?? "",
      name: selectedWedding?.name ?? "",
      host_name: selectedWedding?.host_name ?? "",
      event_date: dateInputValueFromApi(selectedWedding?.event_date),
      location: selectedWedding?.location ?? "",
      amount_per_qr:
        selectedWedding?.amount_per_qr !== undefined &&
        selectedWedding?.amount_per_qr !== null
          ? String(selectedWedding.amount_per_qr)
          : "5.00",
      total_qr:
        selectedWedding?.total_qr !== undefined && selectedWedding?.total_qr !== null
          ? String(selectedWedding.total_qr)
          : "0",
    },
    validationSchema: Yup.object({
      name: Yup.string().max(160).required("Please enter wedding name"),
      host_name: Yup.string().max(160).required("Please enter host name"),
      event_date: Yup.string().required("Please select event date"),
      location: Yup.string().max(200).required("Please enter location"),
      amount_per_qr: Yup.number()
        .typeError("Amount per QR must be a number")
        .min(0, "Amount per QR must be >= 0")
        .required("Please enter amount per QR"),
      total_qr: Yup.number()
        .typeError("Total QR must be a number")
        .integer("Total QR must be an integer")
        .min(0, "Total QR must be >= 0")
        .required("Please enter total QR"),
    }),
    onSubmit: async (values) => {
      const base = {
        name: values.name,
        host_name: values.host_name,
        event_date: values.event_date,
        location: values.location,
        amount_per_qr: Number(values.amount_per_qr),
        total_qr: Number(values.total_qr),
      };

      try {
        if (isEdit) {
          await api.put(`/v1/wedding`, {
            id: Number(values.id),
            ...base,
          });
          toast.success("Wedding updated");
        } else {
          await api.post(`/v1/wedding`, {
            ...base,
          });
          toast.success("Wedding created");
        }

        validation.resetForm();
        setIsModalOpen(false);
        setSelectedWedding(null);
        setIsEdit(false);
        fetchWeddings();
      } catch (err) {
        toast.error("Sorry, something went wrong");
      }
    },
  });

  const columns = useMemo(
    () => [
      {
        header: "Name",
        accessorKey: "name",
        enableColumnFilter: false,
        enableSorting: true,
      },
      {
        header: "Host",
        accessorKey: "host_name",
        enableColumnFilter: false,
        enableSorting: true,
      },
      {
        header: "Event Date",
        accessorKey: "event_date",
        enableColumnFilter: false,
        enableSorting: true,
        cell: (cell) => {
          const raw = cell.row.original?.event_date;
          if (!raw) return <>-</>;
          const formatted = moment(raw).isValid()
            ? moment(raw).format("D MMM YYYY")
            : String(raw);
          return <>{formatted}</>;
        },
      },
      {
        header: "Location",
        accessorKey: "location",
        enableColumnFilter: false,
        enableSorting: true,
      },
      {
        header: "Amount / QR",
        accessorKey: "amount_per_qr",
        enableColumnFilter: false,
        enableSorting: true,
        cell: (cell) => {
          const raw = cell.row.original?.amount_per_qr;
          if (raw === undefined || raw === null) return <>-</>;
          const n = Number(raw);
          return <>{Number.isFinite(n) ? n.toFixed(2) : String(raw)}</>;
        },
      },
      {
        header: "Total QR",
        accessorKey: "total_qr",
        enableColumnFilter: false,
        enableSorting: true,
        cell: (cell) => {
          const raw = cell.row.original?.total_qr;
          if (raw === undefined || raw === null) return <>-</>;
          return <>{raw}</>;
        },
      },
      {
        header: "Created",
        accessorKey: "created_at",
        enableColumnFilter: false,
        enableSorting: true,
        cell: (cell) => {
          const raw = cell.row.original?.created_at;
          if (!raw) return <>-</>;
          const formatted = moment(raw).isValid()
            ? moment(raw).format("D MMM YY h:mmA")
            : String(raw);
          return <>{formatted}</>;
        },
      },
      {
        header: "Action",
        cell: (cellProps) => {
          const row = cellProps.row.original;
          return (
            <div className="d-flex align-items-center gap-3">
              <Link
                to="#"
                className="text-success"
                onClick={() => {
                  setIsEdit(true);
                  setSelectedWedding(row);
                  setIsModalOpen(true);
                }}
              >
                <i className="mdi mdi-pencil font-size-18" id="edittooltip" />
              </Link>
            </div>
          );
        },
      },
    ],
    []
  );

  return (
    <React.Fragment>
      <div className="page-content">
        <Container fluid>
          <Breadcrumbs title="Weddings" breadcrumbItem="Weddings" />
          {isLoading ? (
            <Spinners setLoading={setLoading} />
          ) : (
            <Row>
              <Col lg="12">
                <Card>
                  <CardBody>
                    <TableContainer
                      columns={columns}
                      data={weddings || []}
                      isGlobalFilter={true}
                      isPagination={false}
                      SearchPlaceholder="Search weddings..."
                      isCustomPageSize={true}
                      isAddButton={true}
                      handleUserClick={() => {
                        setIsEdit(false);
                        setSelectedWedding(null);
                        setIsModalOpen(true);
                      }}
                      buttonClass="btn btn-success btn-rounded waves-effect waves-light addContact-modal mb-2"
                      buttonName="New Wedding"
                      tableClass="align-middle table-nowrap table-hover dt-responsive nowrap w-100 dataTable no-footer dtr-inline"
                      theadClass="table-light"
                      paginationWrapper="dataTables_paginate paging_simple_numbers pagination-rounded"
                      pagination="pagination"
                    />
                  </CardBody>
                </Card>
              </Col>
            </Row>
          )}

          <Modal isOpen={isModalOpen} toggle={() => setIsModalOpen(!isModalOpen)}>
            <ModalHeader toggle={() => setIsModalOpen(!isModalOpen)} tag="h4">
              {isEdit ? "Edit Wedding" : "Create Wedding"}
            </ModalHeader>
            <ModalBody>
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  validation.handleSubmit();
                  return false;
                }}
              >
                <Row>
                  <Col xs={12}>
                    <div className="mb-3">
                      <Label>Wedding Name</Label>
                      <Input
                        name="name"
                        type="text"
                        onChange={validation.handleChange}
                        onBlur={validation.handleBlur}
                        value={validation.values.name || ""}
                        invalid={
                          validation.touched.name && validation.errors.name ? true : false
                        }
                      />
                      {validation.touched.name && validation.errors.name ? (
                        <FormFeedback type="invalid">
                          {validation.errors.name}
                        </FormFeedback>
                      ) : null}
                    </div>

                    <div className="mb-3">
                      <Label>Host Name</Label>
                      <Input
                        name="host_name"
                        type="text"
                        onChange={validation.handleChange}
                        onBlur={validation.handleBlur}
                        value={validation.values.host_name || ""}
                        invalid={
                          validation.touched.host_name && validation.errors.host_name
                            ? true
                            : false
                        }
                      />
                      {validation.touched.host_name && validation.errors.host_name ? (
                        <FormFeedback type="invalid">
                          {validation.errors.host_name}
                        </FormFeedback>
                      ) : null}
                    </div>

                    <div className="mb-3">
                      <Label>Event Date</Label>
                      <Input
                        name="event_date"
                        type="date"
                        onChange={validation.handleChange}
                        onBlur={validation.handleBlur}
                        value={validation.values.event_date || ""}
                        invalid={
                          validation.touched.event_date && validation.errors.event_date
                            ? true
                            : false
                        }
                      />
                      {validation.touched.event_date && validation.errors.event_date ? (
                        <FormFeedback type="invalid">
                          {validation.errors.event_date}
                        </FormFeedback>
                      ) : null}
                    </div>

                    <div className="mb-3">
                      <Label>Location</Label>
                      <Input
                        name="location"
                        type="text"
                        onChange={validation.handleChange}
                        onBlur={validation.handleBlur}
                        value={validation.values.location || ""}
                        invalid={
                          validation.touched.location && validation.errors.location
                            ? true
                            : false
                        }
                      />
                      {validation.touched.location && validation.errors.location ? (
                        <FormFeedback type="invalid">
                          {validation.errors.location}
                        </FormFeedback>
                      ) : null}
                    </div>

                    <Row>
                      <Col md={6}>
                        <div className="mb-3">
                          <Label>Amount per QR</Label>
                          <Input
                            name="amount_per_qr"
                            type="number"
                            step="0.01"
                            onChange={validation.handleChange}
                            onBlur={validation.handleBlur}
                            value={validation.values.amount_per_qr || ""}
                            invalid={
                              validation.touched.amount_per_qr &&
                              validation.errors.amount_per_qr
                                ? true
                                : false
                            }
                          />
                          {validation.touched.amount_per_qr &&
                          validation.errors.amount_per_qr ? (
                            <FormFeedback type="invalid">
                              {validation.errors.amount_per_qr}
                            </FormFeedback>
                          ) : null}
                        </div>
                      </Col>
                      <Col md={6}>
                        <div className="mb-3">
                          <Label>Total QR</Label>
                          <Input
                            name="total_qr"
                            type="number"
                            step="1"
                            onChange={validation.handleChange}
                            onBlur={validation.handleBlur}
                            value={validation.values.total_qr || ""}
                            invalid={
                              validation.touched.total_qr && validation.errors.total_qr
                                ? true
                                : false
                            }
                          />
                          {validation.touched.total_qr && validation.errors.total_qr ? (
                            <FormFeedback type="invalid">
                              {validation.errors.total_qr}
                            </FormFeedback>
                          ) : null}
                        </div>
                      </Col>
                    </Row>
                  </Col>
                </Row>

                <Row>
                  <Col>
                    <div className="text-end">
                      <Button type="submit" color="success" className="save-user">
                        {isEdit ? "Update Wedding" : "Create Wedding"}
                      </Button>
                    </div>
                  </Col>
                </Row>
              </Form>
            </ModalBody>
          </Modal>
        </Container>
      </div>
      <ToastContainer />
    </React.Fragment>
  );
};

export default Weddings;

