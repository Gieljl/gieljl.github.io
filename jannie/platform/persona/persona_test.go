package persona

import "testing"

func TestPersonas(t *testing.T) {
	ps := All()
	if len(ps) != 8 {
		t.Fatalf("%d personas", len(ps))
	}
	seen := map[string]bool{}
	for _, p := range ps {
		if p.ID == "" || p.Name == "" || p.Emoji == "" || len(p.Color) != 7 || seen[p.ID] ||
			p.Aggression < 0 || p.Aggression > 1 || p.Chattiness < 0 || p.Chattiness > 1 || p.Speed < 0.5 || p.Speed > 1.5 {
			t.Errorf("persona %+v", p)
		}
		seen[p.ID] = true
		if q, ok := ByID(p.ID); !ok || q != p {
			t.Errorf("ByID(%q) = %+v, %v", p.ID, q, ok)
		}
	}
	if _, ok := ByID("niemand"); ok {
		t.Error("ByID found nobody")
	}
	ps[0].Name = "x"
	if All()[0].Name == "x" {
		t.Error("All shares its slice")
	}
}
