import * as React from "react";
import SwipeableViews from "react-swipeable-views";
import { useTheme } from "@mui/material/styles";
import AppBar from "@mui/material/AppBar";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import ScoresHistoryNew from "../rounds/ScoresHistoryNew";
import { StatsTable } from "../stats/Stats";
import QueryStatsIcon from "@mui/icons-material/QueryStats";
import SportsScoreIcon from '@mui/icons-material/SportsScore';


interface TabPanelProps {
  children?: React.ReactNode;
  dir?: string;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`full-width-tabpanel-${index}`}
      aria-labelledby={`full-width-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ mt: 1 }}>
          <Typography>{children}</Typography>
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `full-width-tab-${index}`,
    "aria-controls": `full-width-tabpanel-${index}`,
  };
}

export default function FullWidthTabs() {
  const theme = useTheme();
  const [value, setValue] = React.useState(0);

  const handleChange = (event: React.SyntheticEvent, newValue: number) => {
    setValue(newValue);
  };

  const handleChangeIndex = (index: number) => {
    setValue(index);
  };

  return (
    <Box sx={{ width: "100%", mt:7 }}>
        <Tabs
          value={value}
          onChange={handleChange}
          textColor="inherit"
          indicatorColor="secondary"
          variant="fullWidth"
          aria-label="full width tabs"
          sx={{ ml:10, mr: 10, mb:1 }}
        >
          <Tab icon={<SportsScoreIcon />}  {...a11yProps(0)} />
          <Tab icon={<QueryStatsIcon />}  {...a11yProps(1)} />
          {/* <Tab label="stats" {...a11yProps(2)} /> */}
        </Tabs>
      <SwipeableViews
        axis={theme.direction === "rtl" ? "x-reverse" : "x"}
        index={value}
        onChangeIndex={handleChangeIndex}
      >
        <TabPanel value={value} index={0} dir={theme.direction}>
          <ScoresHistoryNew />
        </TabPanel>
        <TabPanel value={value} index={1} dir={theme.direction}>
          <StatsTable />
        </TabPanel>
        {/* <TabPanel value={value} index={2} dir={theme.direction}>
        </TabPanel> */}
      </SwipeableViews>
    </Box>
  );
}
