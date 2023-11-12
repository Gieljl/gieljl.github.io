import React, {useContext, useState} from 'react';
import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import StepContent from '@mui/material/StepContent';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';

import Step1 from './step1';
import Step2 from './step2';
import Step3 from './step3';
import styles from './newgame.module.css';
import { useAppSelector } from '../../app/hooks';
import { selectPlayerCount } from './gameSlice';




const steps = [
  {
    label: 'Player count'
  },
  {
    label: 'Player names'
  },
  {
    label: 'Game settings'
  },
];


function getStepContent(step: number) {
  switch (step) {
      case 0:
          return (
            <Step1/>
          );
      case 1:
        return (
            <Step2/>      
          );
      case 2:
          return (
            <Step3/>      
          );
      default:
          return 'Unknown step';
  }
}



export function VerticalLinearStepper() {
  
  const [activeStep, setActiveStep] = useState(0);
  const handleNext = () => {
    setActiveStep((prevActiveStep) => prevActiveStep + 1);
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleReset = () => {
    setActiveStep(0);
  };
  
  const playerCount = useAppSelector(selectPlayerCount);

  return (


      <Box sx={{ maxWidth: 400 }}>
  
      <Stepper activeStep={activeStep} orientation="vertical" sx={{ml: 3}}>
        {steps.map((step, index) => (
          <Step key={step.label} sx={{
            '& .MuiStepLabel-root .Mui-completed': {
              color: '#53a397', // circle color (COMPLETED)
            },
            '& .MuiStepLabel-label.Mui-completed.MuiStepLabel-alternativeLabel':
              {
                color: 'grey.500', // Just text label (COMPLETED)
              },
            '& .MuiStepLabel-root .Mui-active': {
              color: '#7df3e1', // circle color (ACTIVE)
            },
            '& .MuiStepLabel-label.Mui-active.MuiStepLabel-alternativeLabel':
              {
                color: 'common.white', // Just text label (ACTIVE)
              },
            '& .MuiStepLabel-root .Mui-active .MuiStepIcon-text': {
              fill: 'black', // circle's number (ACTIVE)
            },
          }}>
            <StepLabel>
              {step.label}
            </StepLabel>
            <StepContent>
              
              <Typography>{getStepContent(index)}</Typography>
              <Box sx={{ mb: 2 }}>
                <div>
                  <Button
                    disabled={index === 0 }
                    onClick={handleBack}
                    sx={{ mt: 1, mr: 1, color:'#7df3e1' }}                  >
                    Back
                  </Button>
                  <Button
                    disabled={playerCount === 0}
                    variant="outlined"
                    onClick={handleNext}
                    sx={{ mt: 1, mr: 1, color:'#7df3e1', outlineColor:'#7df3e1' }}
                  >
                    {index === steps.length - 1 ? 'Finish' : 'Continue'}
                  </Button>
                </div>
              </Box>
            </StepContent>
          </Step>
        ))}
      </Stepper>
      {activeStep === steps.length && (
        <Paper square elevation={2} sx={{ p: 3, mt: 3 }}>
          <Button onClick={handleReset} color="warning" sx={{ mt: 1, mr: 1 }}>
            reset
          </Button>
          <Button variant="contained" color="success" sx={{ mt: 1 }}>
            Start Game
          </Button>
        </Paper>
      )}
    </Box>
    
  );
}