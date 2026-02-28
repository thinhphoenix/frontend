import React from "react";
import ReactDOM from "react-dom/client";
import { Router } from "fs-router/runtime";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
);
