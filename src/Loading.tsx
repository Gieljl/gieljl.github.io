import * as React from "react";
import Backdrop from "@mui/material/Backdrop";
import CircularProgress from "@mui/material/CircularProgress";
import logo from "./yasa7.png";
import { Stack } from "@mui/material";

export default function Loading() {
  const [open] = React.useState(true);


  return (
    <div>
      <Backdrop
        sx={{
          bgcolor: "#121212",
          color: "#7df3e1",
          zIndex: (theme) => theme.zIndex.drawer + 1,
        }}
        open={open}
      >
        <Stack direction={"column"} alignItems={"center"}>
          <img src={logo} className="App-logo" alt="logo" />
          <CircularProgress color="inherit" sx={{ mt: 3, mb:3 }} />
        </Stack>
      </Backdrop>
    </div>
  );
}
