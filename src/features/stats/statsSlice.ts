import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { RootState } from '../../app/store';

export type statsState = {
  gameType: string,
  weightedStats: statWeight[]
}

export type statWeight = {
  statName: string,
  weight: number
}

const initialState: statsState = {
  gameType: 'default',
  weightedStats: [
      {statName: 'Yasat', weight: 1},
      {statName: 'Longest Streak', weight: 3},
      {statName: 'Death', weight: -5},
      {statName: 'Kill', weight: 2},
      {statName: 'Own', weight: 3},
      {statName: 'Owned', weight: -2},
      {statName: 'Multi-owned', weight: -1},
      {statName: 'Lullify', weight: 2},
      {statName: 'Enable 69', weight: 0},
      {statName: 'Contra-own 50', weight: 2},
      {statName: 'Contra-own 100', weight: 2},
      {statName: 'Nullify 50', weight: 1},
      {statName: 'Nullify 100', weight: 2},
      {statName: 'Enable 50', weight: -1},
      {statName: 'Enable 100', weight: -1},
      {statName: 'Double kill', weight: 1},
      {statName: 'Multi Kill', weight: 2},
      {statName: 'Mega Kill', weight: 3},
      {statName: 'Monster Kill', weight: 4}
    ]
};

// The function below is called a thunk and allows us to perform async logic. It
// can be dispatched like a regular action: `dispatch(incrementAsync(10))`. This
// will call the thunk with the `dispatch` function as the first argument. Async
// code can then be executed and other actions can be dispatched. Thunks are
// typically used to make async requests.
// export const incrementAsync = createAsyncThunk(
//   'counter/fetchCount',
//   async (amount: number) => {
//     const response = await fetchCount(amount);
//     // The value we return becomes the `fulfilled` action payload
//     return response.data;
//   }
// );

export const statsSlice = createSlice({
  name: 'stats',
  initialState,
  // The `reducers` field lets us define reducers and generate associated actions
  reducers: {
    
    // Use the PayloadAction type to declare the contents of `action.payload`
    updateStatWeight: (state, action: PayloadAction<statWeight>) => {
      const { statName, weight } = action.payload;
      const existingStat = state.weightedStats.find((stat) => stat.statName === statName);

      if (existingStat) {
        existingStat.weight = weight;
      }
    },

    updateGameType: (state, action: PayloadAction<string>) => {
      state.gameType = action.payload;
    }, 
    
    resetStats() {
      return initialState;
    },
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
  });

export const { updateStatWeight, updateGameType, resetStats } = statsSlice.actions;

// The function below is called a selector and allows us to select a value from
// the state. Selectors can also be defined inline where they're used instead of
// in the slice file. For example: `useSelector((state: RootState) => state.counter.value)`
export const selectStatsWeight = (state: RootState) => state.stats.weightedStats;
export const selectStatsGameType = (state: RootState) => state.stats.gameType;


// We can also write thunks by hand, which may contain both sync and async logic.
// Here's an example of conditionally dispatching actions based on current state.
// export const incrementIfOdd =
//   (amount: number): AppThunk =>
//   (dispatch, getState) => {
//     const currentValue = selectCount(getState());
//     if (currentValue % 2 === 1) {
//       dispatch(incrementByAmount(amount));
//     }
//   };

export default statsSlice.reducer;
