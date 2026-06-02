import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { App } from "./App";
import { dAppKit } from "./dappKit";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <DAppKitProvider dAppKit={dAppKit}>
      <App />
    </DAppKitProvider>
  </StrictMode>,
);
