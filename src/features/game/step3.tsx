import { FormControlLabel, Switch } from '@mui/material';
import * as React from 'react';



export default function Step3() {
  
  return (
    <FormControlLabel sx={{ mt: 1, mr: 1, mb: 1}} control={<Switch disabled defaultChecked />} label="Classic Rules" />
  );
}
