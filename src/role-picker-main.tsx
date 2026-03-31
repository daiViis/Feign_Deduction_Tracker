import React from "react";
import ReactDOM from "react-dom/client";
import { RolePickerWindowApp } from "./windowApps";
import "./overlay-windows.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RolePickerWindowApp />
  </React.StrictMode>
);
