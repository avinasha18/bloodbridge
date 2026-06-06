import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import PublicLayout from "./components/layout/PublicLayout";
import RequireCoordinator from "./components/RequireCoordinator";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Requests from "./pages/Requests";
import RequestDetail from "./pages/RequestDetail";
import NewRequest from "./pages/NewRequest";
import Donors from "./pages/Donors";
import DonorDetail from "./pages/DonorDetail";
import Patients from "./pages/Patients";
import Analytics from "./pages/Analytics";
import AI from "./pages/AI";
import Protocols from "./pages/Protocols";
import DonateLanding from "./pages/public/DonateLanding";
import PatientRegister from "./pages/public/PatientRegister";
import PatientPortal from "./pages/public/PatientPortal";
import DonorPortal from "./pages/public/DonorPortal";

export default function App() {
  return (
    <Routes>
      {/* Public-facing pages (donors, patients, tracking) */}
      <Route element={<PublicLayout />}>
        <Route path="/donate" element={<DonateLanding />} />
        <Route path="/patient-register" element={<PatientRegister />} />
        <Route path="/track/:id" element={<Navigate to="/me" replace />} />
        <Route path="/me" element={<PatientPortal />} />
        <Route path="/donor" element={<DonorPortal />} />
      </Route>

      <Route path="/login" element={<Login />} />

      {/* Coordinator portal (gated) */}
      <Route
        element={
          <RequireCoordinator>
            <AppLayout />
          </RequireCoordinator>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/requests" element={<Requests />} />
        <Route path="/requests/new" element={<NewRequest />} />
        <Route path="/requests/:id" element={<RequestDetail />} />
        <Route path="/donors" element={<Donors />} />
        <Route path="/donors/:id" element={<DonorDetail />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/ai" element={<AI />} />
        <Route path="/protocols" element={<Protocols />} />
      </Route>

      <Route index element={<Navigate to="/donate" replace />} />
      {/* legacy alias for SMS tracking links */}
      <Route path="/track" element={<Navigate to="/me" replace />} />
      <Route path="*" element={<Navigate to="/donate" replace />} />
    </Routes>
  );
}
