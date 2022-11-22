const admin = require("firebase-admin");
const {getFirestore} = require("firebase-admin/firestore");

const serviceAccount = require("../firestore-service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

module.exports = {
    db: getFirestore()
};
