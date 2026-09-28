/**
 * rotateDemoPasswords.js — rotate passwords of EXISTING demo accounts only.
 *
 * Non-destructive by design:
 *   - Firebase Auth: only auth.updateUser(uid, { password }) on accounts that
 *     already exist. Never creates, deletes or re-creates users, and leaves
 *     uid, email, custom claims and disabled state untouched.
 *   - Firestore: never read or written.
 *   - Revokes refresh tokens of rotated accounts so sessions opened with the
 *     old (published) passwords are signed out.
 *
 * Dry run is the default. Nothing changes unless --apply is passed.
 *
 * Run (with credentials for the target project, e.g. `gcloud auth application-default login`):
 *   FIREBASE_PROJECT_ID=shiftsure-a34e9 \
 *   SEED_ADMIN_PASSWORD=... SEED_DEMO_PASSWORD=... SEED_RIDER_PASSWORD=... \
 *     node scripts/rotateDemoPasswords.js            # dry run: lists what would change
 *     node scripts/rotateDemoPasswords.js --apply    # performs the rotation
 *
 * Passwords are never printed.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const admin = require('firebase-admin');

const AUTH_DOMAIN = 'shiftsure.in';
const APPLY = process.argv.includes('--apply');

// Same accounts the seed script manages (scripts/seed.js)
const ACCOUNTS = [
  { email: `admin@${AUTH_DOMAIN}`, passwordEnv: 'SEED_ADMIN_PASSWORD' },
  { email: `9000000001@${AUTH_DOMAIN}`, passwordEnv: 'SEED_DEMO_PASSWORD' },
  ...['9876543210', '9876543211', '9876543212', '9876543213', '9876543214', '9876543215', '9876543216']
    .map((phone) => ({ email: `${phone}@${AUTH_DOMAIN}`, passwordEnv: 'SEED_RIDER_PASSWORD' })),
];

function requirePassword(name) {
  const value = process.env[name] || '';
  if (value.length < 12) {
    console.error(`❌ ${name} must be set to a password of at least 12 characters.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error('❌ FIREBASE_PROJECT_ID must be set explicitly.');
    process.exit(1);
  }

  const passwords = {};
  for (const env of new Set(ACCOUNTS.map((a) => a.passwordEnv))) passwords[env] = requirePassword(env);

  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  const auth = admin.auth();

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — project ${projectId}\n`);

  let rotated = 0;
  let missing = 0;
  for (const account of ACCOUNTS) {
    let user;
    try {
      user = await auth.getUserByEmail(account.email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.log(`  skip   ${account.email} (no such user — not created)`);
        missing++;
        continue;
      }
      throw err;
    }

    if (!APPLY) {
      console.log(`  would  ${account.email} (uid ${user.uid}) ← ${account.passwordEnv}`);
      continue;
    }

    await auth.updateUser(user.uid, { password: passwords[account.passwordEnv] });
    await auth.revokeRefreshTokens(user.uid);
    console.log(`  done   ${account.email} (uid ${user.uid}) ← ${account.passwordEnv}`);
    rotated++;
  }

  console.log(`\n${APPLY ? `Rotated ${rotated}` : 'No changes made'}; ${missing} account(s) not found.`);
  if (!APPLY) console.log('Re-run with --apply to rotate.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('❌ Rotation failed:', err.message);
  process.exit(1);
});
