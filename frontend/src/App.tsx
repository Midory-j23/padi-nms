import { lazy, Suspense, type ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { useAuth } from "./lib/auth";
import Login from "./pages/Login";
import Users from "./pages/Users";
import Account from "./pages/Account";
import Placeholder from "./components/Placeholder";
import Dashboard from "./pages/Dashboard";
import Devices from "./pages/Devices";
import DeviceDetail from "./pages/DeviceDetail";
import AddDevice from "./pages/AddDevice";
import ScanNetwork from "./pages/ScanNetwork";
import Ports from "./pages/Ports";
import Alerts from "./pages/Alerts";
import Availability from "./pages/Availability";
import Services from "./pages/Services";
import Logs from "./pages/Logs";
import NetworkMap from "./pages/NetworkMap";
import Settings from "./pages/Settings";

const later = (title: string) => (
  <Placeholder title={title} note="This page is built in a later step." />
);

// Charts pull in a large library, so load that page only when it is opened.
const Performance = lazy(() => import("./pages/Performance"));
const Rules = lazy(() => import("./pages/Rules"));
const Metrics = lazy(() => import("./pages/Metrics"));

/** Admin-only pages. The backend enforces this too; this just avoids showing a page that cannot work. */
function AdminOnly({ children }: { children: ReactElement }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  const { phase } = useAuth();
  if (phase !== "authed") return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="devices" element={<Devices />} />
        <Route path="devices/new" element={<AdminOnly><AddDevice /></AdminOnly>} />
        <Route path="devices/scan" element={<AdminOnly><ScanNetwork /></AdminOnly>} />
        <Route path="devices/:id" element={<DeviceDetail />} />
        <Route path="ports" element={<Ports />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="rules" element={<Rules />} />
        <Route path="availability" element={<Availability />} />
        <Route path="services" element={<Services />} />
        <Route path="logs" element={<Logs />} />
        <Route path="map" element={<NetworkMap />} />
        <Route path="performance" element={<Suspense fallback={<p className="text-dim">Loading charts</p>}><Performance /></Suspense>} />
        <Route path="settings" element={<AdminOnly><Settings /></AdminOnly>} />
        <Route path="users" element={<AdminOnly><Users /></AdminOnly>} />
        <Route path="account" element={<Account />} />
        <Route path="*" element={later("Page not found")} />
      </Route>
    </Routes>
  );
}
