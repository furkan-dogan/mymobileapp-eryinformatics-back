# Gmail Client

## How to run?

- Ensure node v16 is available
- run `npm i`
- copy `firestore-service-account.json` to root directory (same level with src folder)
- run `node src/server.mjs`
- You should see the message below if it works as expected:
````
Server listening on port 8080
Local url: http://localhost:8080
  ````

## How to use?

- Just request to the `GET http://localhost:8080/update-gmail-tickets` endpoint.
