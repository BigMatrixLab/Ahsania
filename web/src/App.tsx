import { Navigate, Route, Routes } from "react-router";
import { EmptyState } from "./ui/EmptyState";
import AccountsPage from "./admin/AccountsPage";
import LoginPage from "./auth/LoginPage";
import { RequireAuth } from "./auth/RequireAuth";
import CapturePage from "./capture/CapturePage";
import HomePage from "./home/HomePage";
import { Layout } from "./layout/Layout";
import ImportPatientPage from "./patients/ImportPatientPage";
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
      <Route path="import-patient" element={<ImportPatientPage />} />
      <Route path="new-patient" element={<Navigate to="/import-patient" replace />} />
      <Route path="patients" element={<PatientsPage />} />
      <Route path="patients/:regNo" element={<PatientPage />} />
      <Route path="records/:id" element={<RecordPage />} />
      <Route path="records" element={<AllRecordsPage />} />
      <Route path="accounts" element={<AccountsPage />} />
      <Route path="*" element={<EmptyState title="Page not found">This page does not exist. Use the menu to go back to your work.</EmptyState>} />
    </Routes>
  );
}
