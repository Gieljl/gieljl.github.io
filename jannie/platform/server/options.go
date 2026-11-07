package server

import (
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// pacing holds the unscaled delays of one tempo (docs/server.md#pacing).
type pacing struct {
	think, deal, announce, trick, summary time.Duration
}

var pacings = map[string]pacing{
	"rustig":  {1500 * time.Millisecond, 2000 * time.Millisecond, 1200 * time.Millisecond, 2200 * time.Millisecond, 15 * time.Second},
	"normaal": {900 * time.Millisecond, 1500 * time.Millisecond, 900 * time.Millisecond, 1500 * time.Millisecond, 12 * time.Second},
	"snel":    {450 * time.Millisecond, 900 * time.Millisecond, 500 * time.Millisecond, 800 * time.Millisecond, 8 * time.Second},
}

const (
	maxNameRunes = 20
	maxChatRunes = 200
	maxMarks     = 3 // combining marks kept on one base character
)

// cleanName makes a display name: cleaned as cleanText, at most 20
// characters, and no fake "(AI)" anywhere (only bots carry it; look-alike
// letters, brackets, widths and invisible characters in between do not get
// past it). Nothing visible left becomes "Speler".
func cleanName(s string) string {
	rs := []rune(cleanText(s, 4*maxNameRunes))
	for {
		from, to := findAI(rs)
		if from < 0 {
			break
		}
		rs = append(rs[:from], rs[to:]...)
	}
	// Cleaning again closes the gaps and cuts to length; a cut never
	// brings "(AI)" back.
	if s = cleanText(string(rs), maxNameRunes); s == "" {
		return "Speler"
	}
	return s
}

// cleanChat makes a chat line: as cleanText, at most 200 characters; ""
// when nothing visible is left (the line is dropped).
func cleanChat(s string) string { return cleanText(s, maxChatRunes) }

const (
	zwnj = '\u200C' // zero-width non-joiner
	zwj  = '\u200D' // zero-width joiner
)

// cleanText makes user text safe to show, at most limit characters:
//   - control and format characters (bidi overrides, zero-width spaces,
//     soft hyphens, the tag block, …) and other invisible code points go; a
//     zero-width (non-)joiner stays only between two visible characters, as
//     in the emoji 👩‍🏫 or in scripts that need it;
//   - blank fillers (Hangul fillers, the empty Braille pattern) count as
//     whitespace, and every run of whitespace becomes one space, trimmed;
//   - a base character keeps at most 3 combining marks, so a line cannot
//     stack marks out of its speech bubble.
//
// It returns "" when no visible character (letter, digit, punctuation or
// symbol) is left.
func cleanText(s string, limit int) string {
	var b strings.Builder
	n := 0         // characters written
	marks := 0     // marks written on the last base character
	space := false // whitespace since the last character written
	var join rune  // a joiner waiting for the next visible character
	var last rune  // the last character written; 0 at the start
	visible := false
	for _, r := range s { // invalid UTF-8 comes as utf8.RuneError: dropped
		switch {
		case unicode.IsSpace(r) || isFiller(r):
			space, join = true, 0
			continue
		case r == zwj || r == zwnj:
			if last != 0 && !space && join == 0 {
				join = r // written with the next visible character, if one follows
			}
			continue
		case isInvisible(r):
			continue
		case unicode.In(r, unicode.Mn, unicode.Me):
			join = 0
			if marks >= maxMarks {
				continue
			}
			if n+1 > limit {
				return shown(&b, visible)
			}
			b.WriteRune(r)
			n++
			marks++
			last = r
			continue
		}
		// A visible character, after a pending space or joiner.
		need := 1
		if space && last != 0 {
			need++
		}
		if join != 0 {
			need++
		}
		if n+need > limit {
			break
		}
		if space && last != 0 {
			b.WriteByte(' ')
		}
		if join != 0 {
			b.WriteRune(join)
		}
		b.WriteRune(r)
		n += need
		marks, space, join, last = 0, false, 0, r
		visible = true
	}
	return shown(&b, visible)
}

// shown is the text written to b, or "" when none of it is visible.
func shown(b *strings.Builder, visible bool) string {
	if !visible {
		return ""
	}
	return b.String()
}

// isFiller reports characters that look like nothing but are not spaces.
func isFiller(r rune) bool {
	switch r {
	case 0x115F, 0x1160, 0x3164, 0xFFA0, // Hangul fillers
		0x2800: // Braille pattern blank
		return true
	}
	return false
}

// isInvisible reports code points that never show: controls, format
// characters (Cf, the joiners are handled apart), noncharacters and the
// reserved default-ignorable ranges.
func isInvisible(r rune) bool {
	switch {
	case unicode.IsControl(r), unicode.Is(unicode.Cf, r), r == utf8.RuneError:
		return true
	case r >= 0xFDD0 && r <= 0xFDEF, r&0xFFFE == 0xFFFE: // noncharacters
		return true
	case r == 0x2065, r >= 0xFFF0 && r <= 0xFFF8:
		return true
	case r >= 0xE0000 && r <= 0xE0FFF: // tags and reserved; E0100–E01EF are marks
		return r < 0xE0100 || r > 0xE01EF
	}
	return false
}

// findAI finds "(AI)" in a name the way a reader sees it: case, full width,
// look-alike letters and brackets, and spaces, dots, joiners or marks in
// between make no difference. It returns the rune range [from, to) of the
// first match, marks after it included, or -1, -1.
func findAI(rs []rune) (from, to int) {
	want := [4]rune{'(', 'A', 'I', ')'}
	var at [4]int // rune index of each matched part
	k := 0
	for i, r := range rs {
		f := foldAI(r)
		switch {
		case f == 0: // does not count
			continue
		case f == want[k]:
			at[k] = i
			k++
		case f == '(':
			at[0], k = i, 1
			continue
		default:
			k = 0
			continue
		}
		if k == 4 {
			end := i + 1
			for end < len(rs) && unicode.In(rs[end], unicode.Mn, unicode.Me) {
				end++
			}
			return at[0], end
		}
	}
	return -1, -1
}

// foldAI maps a character to '(', 'A', 'I' or ')' when it reads as one,
// to 0 when it is skipped (spaces, dots, joiners, marks) and else to 'x'.
func foldAI(r rune) rune {
	switch r {
	case '(', '\uFF08', '\u207D', '\u208D', '\u2768', '\u276A', '\uFE59', '\u2E28', '\u27EE':
		return '('
	case ')', '\uFF09', '\u207E', '\u208E', '\u2769', '\u276B', '\uFE5A', '\u2E29', '\u27EF':
		return ')'
	case 'A', 'a', '\uFF21', '\uFF41', '\u0391', '\u0410', '\u0430', '\u1D00', '\u1D2C', '\u2090':
		return 'A'
	case 'I', 'i', 'l', '|', '\uFF29', '\uFF49', '\uFF4C', '\uFF5C', '\u0399', '\u03B9', '\u0406',
		'\u0456', '\u04C0', '\u04CF', '\u01C0', '\u0131', '\u026A', '\u2160', '\u2170', '\u1D35',
		'\u2071', '\u2223':
		return 'I'
	case '.', '\u00B7', zwj, zwnj:
		return 0
	}
	if unicode.IsSpace(r) || unicode.In(r, unicode.Mn, unicode.Me) {
		return 0
	}
	return 'x'
}

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ"

// normCode upper-cases and validates a room code; "" if it cannot be one.
func normCode(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	if len(s) != 4 {
		return ""
	}
	for i := 0; i < 4; i++ {
		if strings.IndexByte(codeAlphabet, s[i]) < 0 {
			return ""
		}
	}
	return s
}
