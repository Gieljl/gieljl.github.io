package cards

// Seat is a player position at the table, clockwise from 0: 0..3 with
// four players, 0..2 with three, and so on. NoSeat (-1) means "nobody".
// Next, Partner, Team and Valid assume a table of four (two teams, the
// partners opposite each other); a game at another table brings its own
// relations, and ValidFor holds at every table.
type Seat int

// NoSeat marks an unknown or absent seat (no winner yet, nobody's turn).
const NoSeat Seat = -1

// Next returns the seat to the left (clockwise), who plays after s, at a
// table of four.
func (s Seat) Next() Seat { return (s + 1) & 3 }

// Partner returns the seat opposite s at a table of four.
func (s Seat) Partner() Seat { return (s + 2) & 3 }

// Team returns 0 for seats 0 and 2, 1 for seats 1 and 3.
func (s Seat) Team() int { return int(s & 1) }

// Valid reports whether s is one of the four seats.
func (s Seat) Valid() bool { return s >= 0 && s < 4 }

// ValidFor reports whether s is a seat at a table of players.
func (s Seat) ValidFor(players int) bool { return s >= 0 && int(s) < players }
