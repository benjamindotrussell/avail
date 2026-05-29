"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onStatusWrite = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const app_1 = require("firebase-admin/app");
const firestore_2 = require("firebase-admin/firestore");
(0, app_1.initializeApp)();
const db = (0, firestore_2.getFirestore)();
const LOCATION_LABELS = {
    my_place: 'at their place',
    pub: 'at the pub',
    out: 'out and about',
    someones_place: "at someone's place",
};
function buildNotificationText(setterName, groupName, status) {
    const loc = status.location
        ? (status.location === 'other' ? status.locationNote : LOCATION_LABELS[status.location])
        : null;
    if (status.availability === 'free') {
        const title = `${setterName} is free`;
        const body = loc
            ? `${loc} — join them in ${groupName}`
            : `Up for it in ${groupName}`;
        return { title, body };
    }
    return {
        title: `${setterName} might be free`,
        body: `Could be persuaded in ${groupName}`,
    };
}
async function sendExpoPushNotifications(messages) {
    if (messages.length === 0)
        return;
    // Expo push API accepts up to 100 messages per request
    const chunks = [];
    for (let i = 0; i < messages.length; i += 100) {
        chunks.push(messages.slice(i, i + 100));
    }
    await Promise.all(chunks.map((chunk) => fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(chunk),
    })));
}
exports.onStatusWrite = (0, firestore_1.onDocumentWritten)('groups/{groupId}/statuses/{uid}', async (event) => {
    const { groupId, uid } = event.params;
    const after = event.data?.after.data();
    // Only notify for free / maybe; ignore deletes and busy updates
    if (!after || (after.availability !== 'free' && after.availability !== 'maybe')) {
        return;
    }
    // Skip if the status is already expired (shouldn't happen, but be safe)
    if (after.expiresAt.toDate() <= new Date())
        return;
    // Load group name and all members in parallel
    const [groupSnap, membersSnap] = await Promise.all([
        db.doc(`groups/${groupId}`).get(),
        db.collection(`groups/${groupId}/members`).get(),
    ]);
    if (!groupSnap.exists)
        return;
    const groupName = groupSnap.data()?.name ?? 'your group';
    const setterMemberDoc = membersSnap.docs.find((d) => d.id === uid);
    const setterName = setterMemberDoc?.data().displayName ?? 'Someone';
    const recipientIds = membersSnap.docs
        .filter((d) => d.id !== uid)
        .map((d) => d.id);
    if (recipientIds.length === 0)
        return;
    const { title, body } = buildNotificationText(setterName, groupName, after);
    // For each recipient: apply available mode filter, collect Expo push tokens
    const tokenPromises = recipientIds.map(async (recipientId) => {
        const [userSnap, tokensSnap] = await Promise.all([
            db.doc(`users/${recipientId}`).get(),
            db.collection(`users/${recipientId}/deviceTokens`).get(),
        ]);
        const userData = userSnap.data();
        // Available mode: skip this recipient if they have no active status
        if (userData?.notifyOnlyWhenActive) {
            const statusSnap = await db
                .doc(`groups/${groupId}/statuses/${recipientId}`)
                .get();
            const recipientStatus = statusSnap.data();
            const isActive = recipientStatus &&
                recipientStatus.expiresAt.toDate() > new Date() &&
                (recipientStatus.availability === 'free' ||
                    recipientStatus.availability === 'maybe');
            if (!isActive)
                return [];
        }
        return tokensSnap.docs.map((d) => d.data().token);
    });
    const tokenArrays = await Promise.all(tokenPromises);
    const tokens = tokenArrays.flat().filter(Boolean);
    if (tokens.length === 0)
        return;
    const messages = tokens.map((token) => ({
        to: token,
        title,
        body,
        data: { type: 'status_update', userId: uid, groupId },
        sound: 'default',
        channelId: 'avail-status',
        priority: 'high',
    }));
    await sendExpoPushNotifications(messages);
});
//# sourceMappingURL=index.js.map