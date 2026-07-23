import MonitoringRuntimeHost from "../../components/monitoring/MonitoringRuntimeHost";
import ProductNavbar from "../../components/product/ProductNavbar";
import SessionRecoveryDialog from "../../components/product/SessionRecoveryDialog";

export default function ProductLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <ProductNavbar />
      <MonitoringRuntimeHost />
      <main className="flex-1">{children}</main>
      <SessionRecoveryDialog />
    </div>
  );
}
