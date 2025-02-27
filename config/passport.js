const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const { getDB } = require("./db");
require("dotenv").config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
    const db = getDB();
    let user = await db.collection("users").findOne({ googleId: profile.id });

    if (!user) {
        user = await db.collection("users").insertOne({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails[0].value
        });
    }

    done(null, user);
}));

passport.serializeUser((user, done) => done(null, user._id));
passport.deserializeUser(async (id, done) => {
    const db = getDB();
    const user = await db.collection("users").findOne({ _id: id });
    done(null, user);
});
