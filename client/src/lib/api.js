import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "/api";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response) {
      console.warn("API error", err.response.status, err.response.data);
    } else {
      console.warn("API network error", err.message);
    }
    return Promise.reject(err);
  },
);

export const endpoints = {
  health: () => api.get("/health").then((r) => r.data),

  // Donors
  listDonors: (params) => api.get("/donors", { params }).then((r) => r.data),
  getDonor: (id) => api.get(`/donors/${id}`).then((r) => r.data),
  createDonor: (payload) => api.post("/donors", payload).then((r) => r.data),
  atRiskDonors: (threshold = 3.0, limit = 50) =>
    api.get("/donors/at-risk", { params: { threshold, limit } }).then((r) => r.data),
  incompleteDonors: (limit = 100) =>
    api.get("/donors/incomplete", { params: { limit } }).then((r) => r.data),

  // Outreach
  outreachLogs: (request_id) =>
    api.get(`/outreach/logs/${request_id}`).then((r) => r.data),

  // Coordinator actions
  sendLocation: (request_id, when) =>
    api
      .post(`/coordinator/requests/${request_id}/send-location`, { when })
      .then((r) => r.data),
  sendPreConfirm: (request_id) =>
    api.post(`/coordinator/requests/${request_id}/send-pre-confirm`).then((r) => r.data),
  resendSms: (request_id, body = {}) =>
    api.post(`/coordinator/requests/${request_id}/resend-sms`, body).then((r) => r.data),
  markDonated: (request_id) =>
    api.post(`/coordinator/requests/${request_id}/mark-donated`).then((r) => r.data),
  markNoShow: (request_id) =>
    api.post(`/coordinator/requests/${request_id}/mark-no-show`).then((r) => r.data),
  promoteStandby: (request_id) =>
    api.post(`/coordinator/requests/${request_id}/promote-standby`).then((r) => r.data),
  sendProfileLink: (donor_id) =>
    api.post(`/coordinator/donors/${donor_id}/send-profile-link`).then((r) => r.data),
  selfRegisterInvite: (phone) =>
    api.post(`/coordinator/donors/self-register-invite`, { phone }).then((r) => r.data),

  // Patients
  listPatients: (params) => api.get("/patients", { params }).then((r) => r.data),
  upcomingTransfusions: (days = 7) =>
    api.get("/patients/upcoming", { params: { days_ahead: days } }).then((r) => r.data),
  getPatient: (id) => api.get(`/patients/${id}`).then((r) => r.data),

  // Requests
  listRequests: (params) => api.get("/requests", { params }).then((r) => r.data),
  getRequest: (id) => api.get(`/requests/${id}`).then((r) => r.data),
  createRequest: (payload) => api.post("/requests", payload).then((r) => r.data),
  previewMatches: (id, params) =>
    api.get(`/requests/${id}/matches`, { params }).then((r) => r.data),
  retryRequest: (id) => api.post(`/requests/${id}/retry`).then((r) => r.data),
  smsTestLinks: (id) => api.get(`/requests/${id}/sms-test-links`).then((r) => r.data),

  // Analytics
  dashboard: () => api.get("/analytics/dashboard").then((r) => r.data),
  heatmap: (blood_group) =>
    api.get("/analytics/heatmap", { params: blood_group ? { blood_group } : {} }).then((r) => r.data),
  reliability: () => api.get("/analytics/reliability").then((r) => r.data),
  failures: (days = 14) =>
    api.get("/analytics/failures", { params: { days } }).then((r) => r.data),
  responseTrend: (days = 7) =>
    api.get("/analytics/response-trend", { params: { days } }).then((r) => r.data),
  protocolUpdates: (limit = 20) =>
    api.get("/analytics/protocol-updates", { params: { limit } }).then((r) => r.data),

  // AI
  matchExplain: (request_id, top_n = 5) =>
    api.post("/ai/match-explain", { request_id, top_n }).then((r) => r.data),
  nlQuery: (query, session_id) =>
    api.post("/ai/query", { query, session_id }).then((r) => r.data),
  reactivateDraft: (donor_id) =>
    api.post("/ai/reactivate-draft", { donor_id }).then((r) => r.data),

  // Protocols
  listProtocols: () => api.get("/protocols").then((r) => r.data),
  updateProtocol: (id, payload) =>
    api.patch(`/protocols/${id}`, payload).then((r) => r.data),

  // Jobs (admin triggers)
  runProactiveScheduler: () => api.post("/jobs/proactive-scheduler/run").then((r) => r.data),
  runFailureAnalyzer: () => api.post("/jobs/failure-analyzer/run").then((r) => r.data),

  // Patient notifications (coordinator view)
  patientNotifications: (patient_id) =>
    api.get(`/patients/${patient_id}/notifications`).then((r) => r.data),
  requestPatientNotifications: (request_id) =>
    api.get(`/patients/by-request/${request_id}/notifications`).then((r) => r.data),

  // Public donor landing page
  openNeeds: (params = {}) =>
    api.get("/public/open-needs", { params }).then((r) => r.data),
  getOpenNeed: (request_id) =>
    api.get(`/public/open-needs/${request_id}`).then((r) => r.data),
  volunteer: (payload) =>
    api.post("/public/volunteer", payload).then((r) => r.data),

  // Patient self-service
  patientRegister: (payload) =>
    api.post("/public/patient-register", payload).then((r) => r.data),
  trackRequest: (request_id) =>
    api.get(`/public/track/${request_id}`).then((r) => r.data),
  trackByPhone: (phone) =>
    api.get(`/public/track-by-phone`, { params: { phone } }).then((r) => r.data),

  // Patient dashboard (cycle + history)
  patientDashboardByPhone: (phone) =>
    api.get(`/public/patient/by-phone`, { params: { phone } }).then((r) => r.data),
  patientDashboardById: (patient_id) =>
    api.get(`/public/patient/${patient_id}`).then((r) => r.data),

  // Donor self-service dashboard
  donorDashboardByPhone: (phone) =>
    api.get(`/public/donor/by-phone`, { params: { phone } }).then((r) => r.data),
  donorDashboardById: (donor_id) =>
    api.get(`/public/donor/${donor_id}`).then((r) => r.data),

  // Public AI assistant (patient or donor portal chat widget)
  publicAiAsk: (payload) =>
    api.post(`/public/ai/ask`, payload).then((r) => r.data),
};
