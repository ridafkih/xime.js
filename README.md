# xime.js

Xime API wrapper for interacting with the MCGamer's Moderator API Panel

#### Simple Example Usage
```js
const Xime = require('xime.js'),
      panel = new Xime.Client(true); // passing "true" as a parameter bypasses 2FA for the account.
      
panel.on('ready', () => {
      panel.search.user("ChadTheDJ").then(console.log);
});

panel.login("someUsername@email.com", "password123");
```

The wrapper has JSDoc's completely implemented, and will guide you through usage of the library.
A comprehensive guide will not be created, as the library is **not intended to be used** by the general public. 
