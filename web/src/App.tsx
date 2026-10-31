import { Route, Routes } from "react-router";
import AccountsPage from "./admin/AccountsPage";
import LoginPage from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import CapturePage from "./capture/CapturePage";
import HomePage from "./home/HomePage";
import { Layout } from "./layout/Layout";
import NewPatientPage from "./patients/NewPatientPage";
import PatientPage from "./patients/PatientPage";
import PatientsPage from "./patients/PatientsPage";
import AllRecordsPage from "./records/AllRecordsPage";
import RecordPage from "./records/RecordPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <Layout>
              <AuthedRoutes />
            </Layout>
          </RequireAuth>
        }
      />
    </Routes>
  );
}

function AuthedRoutes() {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="capture" element={<CapturePage />} />
      <Route path="new-patient" element={<NewPatientPage />} />
      <Route path="patients" element={<PatientsPage />} />
      <Route path="patients/:regNo" element={<PatientPage />} />
      <Route path="records/:id" element={<RecordPage />} />
      <Route path="records" element={<AllRecordsPage />} />
      <Route path="accounts" element={<AccountsPage />} />
      <Route path="*" element={<p>Page not found.</p>} />
    </Routes>
  );
}
