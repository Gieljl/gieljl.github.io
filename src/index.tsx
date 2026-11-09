import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { persistor, store } from "./app/store";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import "./index.css";
import { PersistGate } from "redux-persist/integration/react";
import Loading from "./Loading";
import { PostHogProvider} from 'posthog-js/react'



const container = document.getElementById("root")!;
const root = createRoot(container);

// The PostHog project key is injected at build time (REACT_APP_POSTHOG_KEY,
// a GitHub Actions secret) instead of being committed to the repository.
// Without it, analytics are simply disabled.
const posthogKey = process.env.REACT_APP_POSTHOG_KEY;
const options = {
  api_host: process.env.REACT_APP_POSTHOG_HOST || "https://us.i.posthog.com",
};

const app = (
  <PersistGate loading={<Loading />} persistor={persistor}>
    <App />
  </PersistGate>
);

root.render(
   <React.StrictMode>
    
     <Provider store={store}>
      {posthogKey ? (
        <PostHogProvider apiKey={posthogKey} options={options}>
          {app}
        </PostHogProvider>
      ) : (
        app
      )}
    </Provider>
  </React.StrictMode>
);



// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
// serviceWorkerRegistration.register();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
