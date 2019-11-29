/* 
               .__                                            .__ 
        ___  __|__| _____   ____   ___________    ____   ____ |  |
        \  \/  /  |/     \_/ __ \  \____ \__  \  /    \_/ __ \|  |  
         >    <|  |  Y Y  \  ___/  |  |_> > __ \|   |  \  ___/|  |__
        /__/\_ \__|__|_|  /\___  > |   __(____  /___|  /\___  >____/
              \/        \/     \/  |__|       \/     \/     \/
                     ᴄʀᴇᴀᴛᴇᴅ ʙʏ ɢᴇᴛʀɪᴅᴀʜɪᴍ, ꜰᴏʀ xɪᴍᴇ.
*/

const rp = require('request-promise-native').defaults({ jar: true }),
      { JSDOM } = (require('jsdom'));

const EventEmitter = require('events').EventEmitter,
      util = require('util');

const speakeasy = require('speakeasy');

const ranks = require('./resources/ranks.json'),
      punishments = require('./resources/punishments.json');

/**
 * Xime Panel constructor / client.
 * @param {boolean} bypass - Whether or not you would like to bypass the 2FA of the account, invalidating any current TOTP's & secrets
 */

function Panel(bypass) {
    this.secret;

    this.refreshes = 0;
    this.credentials = {};

    this.search = {

        /**
         * Searches for a user using their username, or Minecraft UUID.
         * @param {String} term - Either the UUID or Username of a Minecraft player.
         * @returns {Promise} - Resolves into a user object.
         */

        user: term => {
            return new Promise((resolve, reject) => {
                rp("https://manage.mcgamer.net/player/" + term).then(html => {
                    const { document } = (new JSDOM(html)).window;
                    if (document.querySelector('img.thumbnail')) reject("player not found");
                    resolve(parseUser(document));
                }).catch(console.error);
            })
        },

        /**
         * Searches for a wider variety of members, useful for tracking name variations.
         * @param {String} term - The username of the player to search.
         * @returns {Promise} - Resolves into an array of members & names.
         */

        users: term => {
            return new Promise((resolve, reject) => {
                rp({
                    method: "POST",
                    uri: "https://manage.mcgamer.net/sys/functions/users/search.php",
                    formData: { username: term, userid: constructor.id }
                }).then(data => {
                    data = JSON.parse(data);
                    if (data.status != "success") reject("none_found");
                    resolve(data);
                }).catch(console.error);
            });
        },

    };

    /**
     * Punishes a player for one of the suggested offences.
     * @param {String} - The username of the player to punish.
     * @param {(
        * 'ABUSE'|
        * 'ADMITTEDUSEOFHACKS'|
        * 'ADVERTISING'|
        * 'BLOCKGLITCHING'|
        * 'BYPASSINGFILTER'|
        * 'DDOSTHREATS'|
        * 'DISCRIMINATION'|
        * 'DISRESPECTINGSTAFF'|
        * 'HACKING'|
        * 'HARSHORHARASSINGMESSAGES'|
        * 'IMPERSONATION'|
        * 'INAPPROPRIATECHAT'|
        * 'INAPPROPRIATENAME'|
        * 'MALICIOUSLINKS'|
        * 'MALICIOUSTHREATS'|
        * 'MISLEADINGINFORMATION'|
        * 'MODDEDCLIENTS'|
        * 'OFFENSIVESKIN'|
        * 'PERSONALINFORMATION'|
        * 'REBELLIONS'|
        * 'REVEALINGDISGUISES'|
        * 'RUDENESS'|
        * 'SPAM'|
        * 'SPAMBOTS'|
        * 'TARGETING'|
        * 'TROLLINGNAME'|
        * 'UNAUTHORIZEDTRANSACTIONS'|
        * 'WINBOOSTING'
     * )} rule - The reason behind the player's punishment.
     * @param {String} - A URL linking to evidence to back the player's punishment.
     */

    this.punish = async (username, rule, evidence) => {
        return new Promise((resolve, reject) => {
            if (punishments.indexOf(rule) == -1) return reject("invalid_reason"); 
            const csrf = await extractToken(`/punishment/add/${username}`).then(x => x.token);
            rp({
                method: "POST",
                uri: "https://manage.mcgamer.net/sys/functions/punish/addPunishment.php",
                formData: { username, rule, evidence, csrf }
            }).then(resolve).catch(reject);
        });
    };

    /**
     * Send an authentication request to the Xime panel using a username, and password
     * and activate the request for the two factor authentication.
     * @param {String} username - The usernaame to use to login.
     * @param {String} password - The password of the corresponding username.
     * @returns {null}
     */

    this.login = (username, password) => {
        credentials = { username, password };
        rp({
            method: "POST",
            uri: "https://manage.mcgamer.net/login/process",
            formData: { username, password }
        }).then(() => this.emit("error", "invalid_login")).catch(async data => {
            if (data.statusCode != 302) this.emit("error", "invalid_login");
            this.credentials = await extractToken("/twofactortrap");
            if (!this.credentials.id || !this.credentials.token) return this.emit("error", "invalid_login");
            if (!bypass) return this.emit("twofactor");
            this.bypass();
        }).catch(console.error);
    };

    /**
     * Refresh the login session for the credentials saved to the constructor, will require
     * two factor authentication again unless the constructor is configured to bypass.
     * @returns {null}
     */

    this.refresh = () => {
        if (!credentials.username || !credentials.password) return this.emit("error", "no_initial_session");
        this.login(credentials.username, credentials.password);
    };

    /**
     * Sends the code for the two factor authentication of the account.
     * @param {String} - A valid two factor authentication code.
     * @returns {null}
     */

    this.authenticate = code => {
        rp({
            method: "POST",
            uri: "https://manage.mcgamer.net/sys/functions/twofactor/check.php",
            formData: { csrf: this.credentials.token, userid: this.credentials.id, otp: code.toString(), remember: "true" }
        }).then(() => {
            // rp("https://manage.mcgamer.net/").then(console.log); << later add check to ensure that they're logged in
            if (this.refreshes <= 0) this.emit("ready");
            this.refreshes++;
        }).catch(() => this.emit("error", "invalid2fa"));
    };

    /**
     * Bypasses the two factor authentication using a security exploit by requesting 
     * a new secret from the server and generating a valid TOTP using the secret provided.
     * This will invalidate any existing secrets, and require a new * token to be generated
     * for usage later.
     * @returns {null}
     */

    this.bypass = async () => {
        const credentials = await extractToken("/") || { userid: this.credentials.id, csrf: this.credentials.token };
        rp({ 
            method: "POST",
            uri: "https://manage.mcgamer.net/sys/functions/twofactor/enable.php",
            formData: { userid: credentials.id, csrf: credentials.token }
        }).then(data => {
            const secret = (JSON.parse(data)).message.key;
            this.secret = secret;

            const encoding = 'base32';
            this.authenticate(speakeasy.totp({ secret, encoding }));
        });
    };

    // MOJANG API SERVICES

    /**
     * Takes the UUID of a Minecraft user and translates it into their
     * name, allowing the player to be tracked despite name changes.
     * @param {string} uuid - The UUID of the player.
     * @returns {Promise<String>} - Returns the current name of the player.
     */

    this.uuidToName = uuid => rp(`https://api.mojang.com/user/profiles/${uuid}/names`).then(d => JSON.parse(d)[JSON.parse(d).length - 1].name).catch(() => "");

    /**
     * Takes the name of a Minecraft user and translates it into their
     * UUID, allowing the player to be tracked despite name changes.
     * @param {string} name - The username of the player.
     * @returns {Promise<String>} - Returns the UUID of the current name holder.
     */

    this.nameToUUID = name => rp(`https://api.mojang.com/users/profiles/minecraft/${name}`).then(d => JSON.parse(d).id).catch(() => "");

    /**
     * Get the current valid TOTP code for the user, so that they
     * can continue to log into the panel despite the secret being 
     * overwritten.
     * @returns {String} - Returns the time based 2FA code.
     */

     this.getCode = () => speakeasy.totp({ secret: this.secret, encoding: 'base32' });
};

util.inherits(Panel, EventEmitter);

function parseUser(document) {
    const obj = {
        username: "",
        rank: {},
        punishments: [],
        seen: {}
    };

    const punishments = Array.from(document.querySelectorAll('tr')).filter(x => x.children.length == 6).slice(1);
    punishments.forEach(punishment => {
        const map = [ "reference", "action", "reason", "duration", "date" ];
        const cur = {};
        Array.from(punishment.children).forEach((element, i) => ((map[i]) ? cur[map[i]] = element.textContent : undefined));
        cur.dispute = {
            attempted: ((!punishment.getAttribute('class')) ? false : true),
            successful: ((punishment.getAttribute('class') == "success") ? true : false)
        }
        obj.punishments.push(cur);
    });

    const base = document.querySelector('td').textContent.split("\n"),
          server = base[2],
          date = new Date(base[3].replace("at", "").trim());
    
    obj.seen = { server, date };
    
    const rank_value = document.querySelector('.panel-title > span').getAttribute('class');
    obj.rank = ranks[ranks.findIndex(x => x.class == rank_value)];
    
    obj.username = document.querySelector('.panel-title > span').textContent;
    
    return obj;
};

function extractToken(endpoint) {
    return new Promise((resolve, reject) => {
        rp("https://manage.mcgamer.net" + endpoint).then(html => {
            const { document } = (new JSDOM(html)).window;

            let id, token;
            const elements = {
                id: document.querySelector('input.userid'),
                token: document.querySelector('input.csrf')
            };

            if (elements.id) id = elements.id.getAttribute('value');
            if (elements.token) token = elements.id.getAttribute('value');
            if (!id && !token) reject("generation_failure");
            resolve({ id, token });
        });
    });
};

module.exports = { Panel };