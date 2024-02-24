import { createSlice, PayloadAction } from '@reduxjs/toolkit';


export interface GameState {
  status: 'new' | 'started' ;
  type: 'classic' | 'ranked'
}

const initialState: GameState = {
  status: 'new',
  type: 'ranked'
};


export const gameSlice = createSlice({
  name: 'game',
  initialState,
  // The `reducers` field lets us define reducers and generate associated actions
  reducers: {
    startGame: (state) => {
      state.status = 'started';
    },
    startNewGame: (state) => {
      state.status = 'new';
    },
    setGameType: (state, action: PayloadAction<'classic' | 'ranked'>) => {
      state.type = action.payload;
    }


  },
  // The `extraReducers` field lets the slice handle actions defined elsewhere,
  // including actions generated by createAsyncThunk or in other slices.
  // extraReducers: (builder) => {
  //   builder
  //     .addCase(incrementAsync.pending, (state) => {
  //       state.status = 'loading';
  //     })
  //     .addCase(incrementAsync.fulfilled, (state, action) => {
  //       state.status = 'idle';
  //       state.value += action.payload;
  //     })
  //     .addCase(incrementAsync.rejected, (state) => {
  //       state.status = 'failed';
  //     });
  // },
});

export const { startGame, startNewGame, setGameType } = gameSlice.actions;

// The function below is called a selector and allows us to select a value from
// the state. Selectors can also be defined inline where they're used instead of
// in the slice file. For example: `useSelector((state: RootState) => state.counter.value)`


// We can also write thunks by hand, which may contain both sync and async logic.
// Here's an example of conditionally dispatching actions based on current state.
// export const incrementIfOdd =
//   (amount: number): AppThunk =>
//   (dispatch, getState) => {
//     const currentValue = selectPlayerCount(getState());
//     if (currentValue % 2 === 1) {
//       dispatch(incrementByAmount(amount));
//     }
//   };

export default gameSlice.reducer;