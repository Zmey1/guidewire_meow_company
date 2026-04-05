const admin = require('firebase-admin');

async function calculateZoneMetrics(db, zoneId) {
  const poolsSnap = await db.collection('pools').where('zone_id', '==', zoneId).get();
  let total_collected = 0;
  let total_claimed = 0;
  poolsSnap.forEach((p) => {
    const data = p.data() || {};
    total_collected += data.total_collected || 0;
    total_claimed += data.total_claimed || 0;
  });

  const loss_ratio = total_collected > 0 ? (total_claimed / total_collected) : 0;
  const bcr = total_claimed > 0 ? (total_collected / total_claimed) : 0;
  return { total_collected, total_claimed, loss_ratio, bcr };
}

async function checkAndSuspendZoneIfNeeded(db, zoneId) {
  if (!zoneId) return { suspended: false };

  const metrics = await calculateZoneMetrics(db, zoneId);
  if (metrics.loss_ratio <= 0.85) {
    return { suspended: false, ...metrics };
  }

  const zoneRef = db.collection('zones').doc(zoneId);
  const zoneDoc = await zoneRef.get();
  if (zoneDoc.exists && zoneDoc.data() && zoneDoc.data().enrollment_suspended === true) {
    return { suspended: true, already_suspended: true, ...metrics };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const reason = `Auto-suspended: Loss ratio ${(metrics.loss_ratio * 100).toFixed(1)}% exceeded 85% threshold`;

  const batch = db.batch();
  batch.set(zoneRef, {
    enrollment_suspended: true,
    updated_at: now,
  }, { merge: true });

  batch.set(db.collection('zone_config').doc(zoneId), {
    zone_id: zoneId,
    enrollment_suspended: true,
    suspension_reason: reason,
    suspended_at: now,
    updated_at: now,
  }, { merge: true });

  await batch.commit();
  return { suspended: true, ...metrics };
}

async function setZoneEnrollmentSuspension(db, zoneId, suspended, reason, actorUid) {
  const now = admin.firestore.FieldValue.serverTimestamp();
  const zoneRef = db.collection('zones').doc(zoneId);
  const configRef = db.collection('zone_config').doc(zoneId);

  const batch = db.batch();
  batch.set(zoneRef, {
    enrollment_suspended: !!suspended,
    updated_at: now,
  }, { merge: true });

  const configData = {
    zone_id: zoneId,
    enrollment_suspended: !!suspended,
    updated_at: now,
  };

  if (suspended) {
    configData.suspension_reason = reason || 'Manually suspended by admin';
    configData.suspended_at = now;
    configData.reinstated_at = null;
    configData.reinstated_by = null;
  } else {
    configData.reinstated_at = now;
    configData.reinstated_by = actorUid || null;
  }

  batch.set(configRef, configData, { merge: true });
  await batch.commit();
}

module.exports = {
  calculateZoneMetrics,
  checkAndSuspendZoneIfNeeded,
  setZoneEnrollmentSuspension,
};
