import express from 'express'

import {getGmailClient} from "./gmail-client.js";
import {db} from "./firestore-client.js";

const app = express()
const port = 8080

app.get('/ping', (req, res) => {
    console.log('A request came!');
    res.send('Pong!')
})

const getNewGmailThreads = async ({pageToken} = {}) => {
    const gmail = await getGmailClient();

    const params = {userId: 'me'};

    if (pageToken) {
        params.pageToken = pageToken;
    }

    const response = await gmail.users.threads.list(params);

    const {data: {threads, nextPageToken}} = response;

    let nextPageThreads = [];

    if (nextPageToken) {
        nextPageThreads = await getNewGmailThreads({pageToken: nextPageToken, lastSavedThreadID});
    }

    return threads.concat(nextPageThreads);
};

const getGmailFullThreads = async () => {
    const gmail = await getGmailClient();
    const getDataFromHeader = ({key, sourceHeader}) => sourceHeader.find(p => p.name === key).value;
    const newThreads = await getNewGmailThreads();
    const promises = newThreads.map(({id}) => gmail.users.threads.get({id, userId: 'me'}));
    const newFullThreads = await Promise.all(promises);
    return newFullThreads.map(t => t.data)
        .map(t => {
            const message = t.messages[0];
            const body = Buffer.from(message.payload.parts.find(p => p.mimeType === 'text/plain').body.data, 'base64').toString();
            let [name, email] = getDataFromHeader({key: 'From', sourceHeader: message.payload.headers}).split('" <')
            name = name.slice(1);
            email = email.slice(0, -1);

            return {
                threadId: message.threadId,
                historyId: message.historyId,
                snippet: message.snippet,
                labelIds: message.labelIds,
                deliveredTo: getDataFromHeader({key: 'Delivered-To', sourceHeader: message.payload.headers}),
                fromName: name,
                fromEmail: email,
                subject: getDataFromHeader({key: 'Subject', sourceHeader: message.payload.headers}),
                date: getDataFromHeader({key: 'Date', sourceHeader: message.payload.headers}),
                body
            };
        })
};

const createUserByThread = async ({threads}) => {
    const usersMapByIdAndEmail = {};
    const users = []
    threads.forEach(t => {
        if (!users.find(u => u.email === t.fromEmail)) {
            users.push({
                read: false,
                write: false,
                delete: false,
                isActive: true,
                isAdmin: false,
                userType: 'customer',
                email: t.fromEmail,
                full_name: t.fromName
            });
        }
    });

    const existUserSnapshot = await db.collection('users').where('email', 'in', users.map(u => u.email)).get();
    existUserSnapshot.forEach(u => {
        usersMapByIdAndEmail[u.data().email] = u.id;
    });

    // Save new users
    const newUsers = users.filter(u => !Object.keys(usersMapByIdAndEmail).includes(u.email))
    const responses = await Promise.all(
        newUsers.map(u => db.collection('users').add(u))
    )
    newUsers.forEach((u, i) => {
        usersMapByIdAndEmail[u.email] = responses[i].id;
    })

    return usersMapByIdAndEmail;
};

const updateTickets = async () => {
    const batch = db.batch();
    const newThreads = await getGmailFullThreads();
    const users = await createUserByThread({threads: newThreads});

    newThreads.forEach(t => {
        batch.set(
            db.collection('tickets').doc(t.threadId),
            {
                ...t,
                description: t.snippet,
                ticket_date: new Date(t.date),
                title: t.subject,
                user_id: users[t.fromEmail],
                source: 'gmail'
            })
    });
    await batch.commit();
};

app.get('/update-gmail-tickets', async (req, res) => {
    await updateTickets();
    res.status(200).end();
})

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log('Local url:', `http://localhost:${port}`);
})