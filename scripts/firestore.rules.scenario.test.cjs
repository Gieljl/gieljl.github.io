const fs = require('fs');
const path = require('path');
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');

async function main() {
  const testEnv = await initializeTestEnvironment({
    projectId: 'firestore-rules-scenarios',
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(
        path.resolve(__dirname, '..', 'firestore.rules'),
        'utf8',
      ),
    },
  });

  try {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(setDoc(doc(db, 'sessions', 'ABC234'), { ok: true }));
    await assertSucceeds(getDoc(doc(db, 'sessions', 'ABC234')));
    await assertSucceeds(setDoc(doc(db, 'playSessions', 'ZZ2YY9'), { ok: true }));
    await assertSucceeds(getDoc(doc(db, 'playSessions', 'ZZ2YY9')));

    await assertFails(setDoc(doc(db, 'sessions', 'bad-1'), { ok: true }));
    await assertFails(getDoc(doc(db, 'playSessions', 'abc123')));

    const playerRef = doc(db, 'players', 'alice_1');
    await assertSucceeds(setDoc(playerRef, {
      displayName: 'Alice',
      securityQuestion: 'Your pet?',
      securityAnswerHash: 'hash',
      registered: true,
      stats: {},
    }));
    await assertSucceeds(getDoc(playerRef));

    await assertFails(setDoc(doc(db, 'players', 'Alice Upper'), {
      displayName: 'Alice',
    }));
    await assertFails(getDoc(doc(db, 'players', 'Alice Upper')));

    await assertFails(updateDoc(playerRef, { securityAnswerHash: 'new-hash' }));
    await assertFails(updateDoc(playerRef, { securityQuestion: 'Changed?' }));
    await assertSucceeds(updateDoc(playerRef, { color: 'blue' }));

    console.log('Firestore rules scenario checks passed.');
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((error) => {
  console.error('Firestore rules scenario checks failed.');
  console.error(error);
  process.exit(1);
});
