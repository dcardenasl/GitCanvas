import React from "react";
import ReactDOM from "react-dom/client";

// Registers the language before anything renders, so the first frame is in it.
import "./i18n";
import "./App.css";
import "./styles/primitives.css";

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";

const rootElement = document.getElementById("root");

if (!rootElement) {
  // index.html always ships this node, so reaching here means the document was
  // replaced. Failing loudly beats rendering into nothing.
  throw new Error('Root element "#root" is missing from the document.');
}

ReactDOM.createRoot(rootElement).render(
  <ErrorBoundary>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </ErrorBoundary>,
);
