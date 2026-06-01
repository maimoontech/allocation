import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { ProtectedRoute } from "./ProtectedRoute";
import { LoginPage } from "../pages/LoginPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ZonesPage } from "../pages/modules/ZonesPage";
import { MohallahsPage } from "../pages/modules/MohallahsPage";
import { PartiesPage } from "../pages/modules/PartiesPage";
import { VenuesPage } from "../pages/modules/VenuesPage";
import { MiqaatsPage } from "../pages/modules/MiqaatsPage";
import { SchedulesPage } from "../pages/modules/SchedulesPage";
import { ReportsPage } from "../pages/modules/ReportsPage";
import { ImportExportPage } from "../pages/modules/ImportExportPage";
import { MySchedulePage } from "../pages/party/MySchedulePage";
import { RateMicPage } from "../pages/party/RateMicPage";
import { AssignedPartiesPage } from "../pages/coordinator/AssignedPartiesPage";
import { AttendanceRatingPage } from "../pages/coordinator/AttendanceRatingPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<AppShell />}>
        <Route element={<ProtectedRoute roles={["admin", "zonal_head"]} />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/zones" element={<ZonesPage />} />
          <Route path="/mohallahs" element={<MohallahsPage />} />
          <Route path="/parties" element={<PartiesPage />} />
          <Route path="/venues" element={<VenuesPage />} />
          <Route path="/miqaats" element={<MiqaatsPage />} />
          <Route path="/schedules" element={<SchedulesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["admin"]} />}>
          <Route path="/import-export" element={<ImportExportPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["party"]} />}>
          <Route path="/my-schedule" element={<MySchedulePage />} />
          <Route path="/rate-mic" element={<RateMicPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["coordinator"]} />}>
          <Route path="/assigned-parties" element={<AssignedPartiesPage />} />
          <Route path="/attendance-rating" element={<AttendanceRatingPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
