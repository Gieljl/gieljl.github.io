import { TextField } from '@mui/material';
import { useAppSelector } from '../../app/hooks';
import { selectPlayerCount } from './gameSlice';


export default function Step2() {
  const playerCount = useAppSelector(selectPlayerCount);
  function buildPlayerFields() {
    const arr = [];
    for (let i = 1; i <= playerCount; i++) {
      arr.push(
        <TextField
          required
          id={i.toString()}
          label='Name'
          type="text"
          variant="outlined"
          sx={{ mt: 1, mr: 5, mb: 1, width: '250px'}}
          inputProps={{ inputMode: 'text' }}
        />
      );
    }
    return arr;
  }
  
  return (
    <>
    {buildPlayerFields()}
    </>
  );
}
