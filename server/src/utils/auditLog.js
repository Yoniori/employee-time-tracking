'use strict';

const { db } = require('../firebase');

/**
 * Write a lightweight audit log entry to the `auditLogs` Firestore collection.
 *
 * DESIGN PRINCIPLES:
 *   - Fire-and-forget: the Firestore write is NOT awaited by the caller.
 *   - Non-fatal: a write failure never throws or crashes the request handler.
 *   - No secrets: OTP codes, passwords, or private keys must never be passed here.
 *   - Additive: adding this call to a route cannot break the route.
 *
 * SCHEMA (auditLogs collection):
 *   {
 *     action:     string   — e.g. 'slot_request_approved', 'employee_deactivated'
 *     actorUid:   string?  — Firebase UID of the manager who performed the action
 *     actorEmail: string?  — email of the manager (if available in the JWT)
 *     targetType: string   — collection name or entity type: 'employee', 'shiftRequest', etc.
 *     targetId:   string   — Firestore document ID of the affected entity
 *     meta:       object   — small, non-secret context (names, dates, counts)
 *     timestamp:  Date     — server-side write time
 *   }
 *
 * @param {object} params
 * @param {string}  params.action
 * @param {string}  [params.actorUid]
 * @param {string}  [params.actorEmail]
 * @param {string}  params.targetType
 * @param {string}  params.targetId
 * @param {object}  [params.meta]
 */
function writeAuditLog({ action, actorUid, actorEmail, targetType, targetId, meta }) {
  const ref = db.collection('auditLogs').doc();
  ref.set({
    action,
    actorUid:   actorUid   || null,
    actorEmail: actorEmail || null,
    targetType,
    targetId,
    meta:       meta || {},
    timestamp:  new Date(),
  }).catch(err => {
    // Audit failure is always non-fatal — log to console but never surface to the user
    console.error('[auditLog] Failed to write entry for action:', action, '—', err.message);
  });
}

module.exports = { writeAuditLog };
