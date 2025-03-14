import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./app/store";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import "./index.css";
import { PersistGate } from "redux-persist/integration/react";
import { persistStore } from "redux-persist";
import Loading from "./Loading";
import { PostHogProvider} from 'posthog-js/react'



const container = document.getElementById("root")!;
const root = createRoot(container);
let persistor = persistStore(store);



const options = {
  api_host: "https://us.i.posthog.com",
  key: "phc_yetKdaYEEkf8nAs1OW6RrCsDMIXIdUfEHVOLA18kzys",
}


root.render(
   <React.StrictMode>
    
     <Provider store={store}>
     <PostHogProvider 
      apiKey={options.key || ""}
      options={options}
    >
      <PersistGate loading={<Loading/>} persistor={persistor}>
        <App />
      </PersistGate>
    </PostHogProvider>
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
