import { Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import PublicLayout from "./components/layout/PublicLayout";
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
import TrackRequest from "./pages/public/TrackRequest";
import PatientPortal from "./pages/public/PatientPortal";
import DonorPortal from "./pages/public/DonorPortal";

export default function App() {
  return (
    <Routes>
      {/* Public-facing pages (donors, patients, tracking) */}
      <Route element={<PublicLayout />}>
        <Route path="/donate" element={<DonateLanding />} />
        <Route path="/patient-register" element={<PatientRegister />} />
        <Route path="/track" element={<TrackRequest />} />
        <Route path="/track/:id" element={<TrackRequest />} />
        <Route path="/me" element={<PatientPortal />} />
        <Route path="/donor" element={<DonorPortal />} />
      </Route>

      {/* Coordinator portal */}
      <Route element={<AppLayout />}>
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
      <Route path="*" element={<Navigate to="/donate" replace />} />
    </Routes>
  );
}
