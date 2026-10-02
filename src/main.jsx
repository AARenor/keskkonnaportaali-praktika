import React from "react";
import { createRoot } from "react-dom/client";
import { documentationRoute } from "./docs-route.js";
import "./styles.css";

const Page = documentationRoute(window.location.pathname)
  ? React.lazy(() => import("./Docs.jsx"))
  : React.lazy(() => import("./App.jsx").then((module) => ({ default: module.App })));

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <React.Suspense fallback={<p role="status" className="shell">Leht laadib…</p>}>
      <Page />
    </React.Suspense>
  </React.StrictMode>,
);
