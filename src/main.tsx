import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

const rootElement = document.getElementById("root");

if (!rootElement) {
  // index.html always ships this node, so reaching here means the document was
  // replaced. Failing loudly beats rendering into nothing.
  throw new Error('Root element "#root" is missing from the document.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
