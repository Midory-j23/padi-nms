import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
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

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="devices" element={<Devices />} />
        <Route path="devices/new" element={<AddDevice />} />
        <Route path="devices/scan" element={<ScanNetwork />} />
        <Route path="devices/:id" element={<DeviceDetail />} />
        <Route path="ports" element={<Ports />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="availability" element={<Availability />} />
        <Route path="services" element={<Services />} />
        <Route path="logs" element={<Logs />} />
        <Route path="map" element={<NetworkMap />} />
        <Route path="performance" element={<Suspense fallback={<p className="text-dim">Loading charts</p>}><Performance /></Suspense>} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={later("Page not found")} />
      </Route>
    </Routes>
  );
}
