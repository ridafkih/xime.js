# xime.js

Xime API wrapper for interacting with the MCGamer's Moderator API Panel

#### Simple Example Usage
```js
const Xime = require('xime.js'),
      client = new Xime.Client(true); // passing "true" as a parameter bypasses 2FA for the account.
      
client.search.user("ChadTheDJ").then(console.log);

client.login("someUsername@email.com", "password123");
```

The wrapper has JSDoc's completely implemented, and will guide you through usage of the library.
