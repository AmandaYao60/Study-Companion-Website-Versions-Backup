import ProductNavbar from "../../components/product/ProductNavbar";
import GlobalSessionBar from "../../components/product/GlobalSessionBar";

export default function ProductLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <ProductNavbar />
      <GlobalSessionBar />
      <main className="flex-1">{children}</main>
    </div>
  );
}
