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
import { PartyMembersPage } from "../pages/party/PartyMembersPage";
import { RateMicPage } from "../pages/party/RateMicPage";
import { AssignedPartiesPage } from "../pages/coordinator/AssignedPartiesPage";
import { AttendanceRatingPage } from "../pages/coordinator/AttendanceRatingPage";
import { ChangePasswordPage } from "../pages/ChangePasswordPage";
import { MemberChangePasswordPage } from "../pages/member/MemberChangePasswordPage";
import { MemberProfilePage } from "../pages/member/MemberProfilePage";
import { MembersPage } from "../pages/modules/MembersPage";
import { MemberPhotoApprovalPage } from "../pages/modules/MemberPhotoApprovalPage";
import { MemberProfileViewPage } from "../pages/modules/MemberProfileViewPage";
import { HelpChatsPage } from "../pages/modules/HelpChatsPage";
import { MemberLookupsPage } from "../pages/modules/MemberLookupsPage";
import { MemberLookupEditPage } from "../pages/modules/MemberLookupEditPage";

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
          {/* The dropdown options members choose from. Five of the ten lists ship empty, so
              this is how they get their authoritative values. */}
          {/* FR-110. Admin-only: the log is read to find out which questions keep coming
              up and which answers score badly, which is a question about the form. */}
          <Route path="/help-chats" element={<HelpChatsPage />} />
          <Route path="/member-lookups" element={<MemberLookupsPage />} />
          <Route path="/member-lookups/:entity" element={<MemberLookupEditPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["admin", "zonal_head"]} />}>
          <Route path="/member-photo-approvals" element={<MemberPhotoApprovalPage />} />
          {/* Both roles create accounts and set account status here. A Zonal Head sees only
              their own zone, which the server enforces — this guard just opens the door. */}
          <Route path="/members" element={<MembersPage />} />
          {/* FR-047a. Both roles read all twelve tabs; only an administrator may save, and
              the server decides that — this guard just opens the door. A Zonal Head reaching
              a member outside their zone gets a 403 the page explains. */}
          <Route path="/members/:id/profile" element={<MemberProfileViewPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["party"]} />}>
          <Route path="/my-schedule" element={<MySchedulePage />} />
          <Route path="/party-members" element={<PartyMembersPage />} />
          <Route path="/rate-mic" element={<RateMicPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["coordinator"]} />}>
          <Route path="/assigned-parties" element={<AssignedPartiesPage />} />
          <Route path="/attendance-rating" element={<AttendanceRatingPage />} />
        </Route>

        <Route element={<ProtectedRoute roles={["zonal_head", "party", "coordinator"]} />}>
          <Route path="/change-password" element={<ChangePasswordPage />} />
        </Route>

        {/*
          Member routes. ProtectedRoute diverts a member with an outstanding forced password
          change to /member-change-password, so that route is the only one reachable until it
          is done.

          /member-profile is the twelve-tab form. Tabs 2 and 4 to 12 are still being built;
          their tab buttons are shown disabled rather than hidden, so the member can see the
          shape of what they are completing.
        */}
        <Route element={<ProtectedRoute roles={["member"]} />}>
          <Route path="/member-change-password" element={<MemberChangePasswordPage />} />
          <Route path="/member-profile" element={<MemberProfilePage />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}






